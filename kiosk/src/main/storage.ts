/**
 * src/main/storage.ts — 세션 폴더 · 파일 저장 규칙
 *
 * SPIKE_PLAN ③ 완료 기준: "저장 위치·파일명 규칙이 정해져 있다 (세션 폴더 단위)"
 *
 * 저장 규칙
 *   <dataRoot>/<sessionId>/
 *     audio/   01_police.wav  02_chef.wav  ...      ← 16kHz 모노 16bit
 *     photo/   cut_01.jpg ... cut_04.jpg            ← 카메라 원본
 *     output/  fourcut.png · photo_4x6.pdf · report.pdf
 *
 *   sessionId = YYYYMMDD-HHmmss-xxxx
 *
 * ⚠️ 세션 종료(P-11) 시 폴더 전체를 삭제한다 — PAGE_SPEC P-11 "세션 데이터 폐기"
 *    단, 스파이크 기간에는 분석용 WAV 샘플 채집이 목적이므로 D-01 녹음은 별도 세션에 남긴다.
 */

import { app } from 'electron'
import { randomBytes } from 'node:crypto'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { extname, join, resolve, sep } from 'node:path'
import { measurePcm } from './acoustic'
import type {
  DspFlags,
  JobId,
  SavePhotoRequest,
  SaveWavRequest,
  SavedFile,
  SessionPaths,
} from '../shared/types'

/** 분석 입력 규격 — SPEC §3-3 (16kHz 모노 WAV) */
export const TARGET_SAMPLE_RATE = 16_000

let dataRoot = ''

export function getDataRoot(): string {
  return dataRoot
}

export async function ensureDataRoot(): Promise<string> {
  // 스파이크 동안에는 프로젝트 옆에 두어 WAV 샘플을 꺼내기 쉽게 한다.
  // 운영 빌드에서는 userData 아래로 간다.
  dataRoot =
    process.env['MDV_DATA_DIR'] ??
    (app.isPackaged
      ? join(app.getPath('userData'), 'sessions')
      : join(app.getAppPath(), 'sessions'))

  await mkdir(dataRoot, { recursive: true })
  return dataRoot
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0')
}

function makeSessionId(prefix?: string, now = new Date()): string {
  const d = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
  const t = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  const id = `${d}-${t}-${randomBytes(2).toString('hex')}`
  // D-01은 'dev' — 채집한 WAV 샘플은 P-11 폐기 대상이 아니다 (SPIKE_PLAN 산출물 3)
  const safe = prefix?.replace(/[^a-z0-9]/gi, '').slice(0, 8)
  return safe ? `${safe}-${id}` : id
}

export function pathsFor(sessionId: string): SessionPaths {
  const root = join(dataRoot, sessionId)
  return {
    sessionId,
    root,
    audioDir: join(root, 'audio'),
    photoDir: join(root, 'photo'),
    outputDir: join(root, 'output'),
  }
}

export async function beginSession(prefix?: string): Promise<SessionPaths> {
  const paths = pathsFor(makeSessionId(prefix))
  await mkdir(paths.audioDir, { recursive: true })
  await mkdir(paths.photoDir, { recursive: true })
  await mkdir(paths.outputDir, { recursive: true })
  return paths
}

/** P-11 — 로컬 WAV·사진·PDF 삭제 */
export async function purgeSession(sessionId: string): Promise<void> {
  if (!sessionId || sessionId.includes('..') || sessionId.includes('/') || sessionId.includes('\\')) {
    throw new Error(`purgeSession: 잘못된 sessionId (${sessionId})`)
  }
  await rm(join(dataRoot, sessionId), { recursive: true, force: true })
}

// ────────────────────────────────────────────────────────────
// 리샘플링 → 16kHz (렌더러가 아니라 여기서 — CLAUDE.md 금지사항 2)
// ────────────────────────────────────────────────────────────

/**
 * windowed-sinc 보간 리샘플러.
 * 단순 선형 보간은 다운샘플 시 에일리어싱이 생겨 발음 분석 입력으로 부적절하다.
 */
function resample(input: Float32Array, srcRate: number, dstRate: number): Float32Array {
  if (srcRate === dstRate) return input

  const ratio = srcRate / dstRate
  const outLength = Math.floor(input.length / ratio)
  const out = new Float32Array(outLength)

  // 다운샘플 시에는 컷오프를 낮춰(=커널을 늘려) 저역통과 역할을 겸하게 한다
  const cutoff = ratio > 1 ? 1 / ratio : 1
  const zeroCrossings = 8
  const halfWidth = Math.ceil(zeroCrossings / cutoff)

  const sinc = (x: number): number => (x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x))
  // Blackman window
  const window = (x: number): number => {
    const t = (x + zeroCrossings) / (2 * zeroCrossings)
    return 0.42 - 0.5 * Math.cos(2 * Math.PI * t) + 0.08 * Math.cos(4 * Math.PI * t)
  }

  for (let i = 0; i < outLength; i++) {
    const center = i * ratio
    const start = Math.floor(center) - halfWidth
    const end = Math.floor(center) + halfWidth

    let sum = 0
    let norm = 0
    for (let j = start; j <= end; j++) {
      if (j < 0 || j >= input.length) continue
      const dist = (j - center) * cutoff
      if (Math.abs(dist) > zeroCrossings) continue
      const w = sinc(dist) * window(dist)
      sum += input[j]! * w
      norm += w
    }
    out[i] = norm !== 0 ? sum / norm : 0
  }

  return out
}

function floatToPcm16(samples: Float32Array): Buffer {
  const buf = Buffer.allocUnsafe(samples.length * 2)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!))
    buf.writeInt16LE(Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), i * 2)
  }
  return buf
}

/** 16bit 모노 PCM WAV (RIFF) */
function wavContainer(pcm: Buffer, sampleRate: number): Buffer {
  const header = Buffer.alloc(44)
  const channels = 1
  const bitsPerSample = 16
  const byteRate = (sampleRate * channels * bitsPerSample) / 8
  const blockAlign = (channels * bitsPerSample) / 8

  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16) // fmt chunk size
  header.writeUInt16LE(1, 20) // PCM
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(bitsPerSample, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)

  return Buffer.concat([header, pcm])
}

function dspSuffix(dsp: DspFlags): string {
  // D-01의 on/off 비교 녹음을 파일명으로 구분한다.
  // 본 플로우(P-05)는 항상 전부 false이므로 접미사가 붙지 않는다.
  const on = [
    dsp.noiseSuppression && 'ns',
    dsp.echoCancellation && 'ec',
    dsp.autoGainControl && 'agc',
  ].filter(Boolean)
  return on.length ? `_dsp-${on.join('-')}` : ''
}

function wavFileName(index: number, jobId: JobId | string, dsp: DspFlags): string {
  return `${pad(index + 1)}_${jobId}${dspSuffix(dsp)}.wav`
}

export async function saveWav(req: SaveWavRequest): Promise<SavedFile> {
  const paths = pathsFor(req.sessionId)
  await mkdir(paths.audioDir, { recursive: true })

  const source = new Float32Array(req.pcm)
  const resampled = resample(source, req.sampleRate, TARGET_SAMPLE_RATE)
  const wav = wavContainer(floatToPcm16(resampled), TARGET_SAMPLE_RATE)

  const filePath = join(paths.audioDir, wavFileName(req.index, req.jobId, req.dsp))
  await writeFile(filePath, wav)

  // 디스크에 쓴 것과 같은 16kHz PCM으로 음향 특성을 잰다 (D-01 표 · 재시도 판정)
  const quality = measurePcm(resampled, TARGET_SAMPLE_RATE, req.index)

  return { path: filePath, bytes: wav.length, quality }
}

/** D-01 청음 확인 — 저장된 WAV를 그대로 되읽는다 */
export async function readWav(path: string): Promise<ArrayBuffer> {
  if (!path.startsWith(dataRoot) || !path.toLowerCase().endsWith('.wav')) {
    throw new Error(`readWav: 세션 폴더 안의 .wav만 읽을 수 있습니다 (${path})`)
  }
  const buf = await readFile(path)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

// ────────────────────────────────────────────────────────────
// 사진
// ────────────────────────────────────────────────────────────

function decodeDataUrl(dataUrl: string): Buffer {
  const comma = dataUrl.indexOf(',')
  if (comma < 0 || !dataUrl.startsWith('data:image/')) {
    throw new Error('savePhoto: data:image/... URL이 아닙니다')
  }
  return Buffer.from(dataUrl.slice(comma + 1), 'base64')
}

export async function savePhoto(req: SavePhotoRequest): Promise<SavedFile> {
  const paths = pathsFor(req.sessionId)
  const dir = req.composed ? paths.outputDir : paths.photoDir
  await mkdir(dir, { recursive: true })

  const name = req.composed ? 'fourcut.png' : `cut_${pad(req.index + 1)}.png`
  const filePath = join(dir, name)
  const bytes = decodeDataUrl(req.dataUrl)
  await writeFile(filePath, bytes)

  return { path: filePath, bytes: bytes.length }
}

/**
 * 카메라 사이드카가 쓸 컷 파일 경로. 렌더러 입력으로 경로가 만들어지므로 여기서 검사한다.
 * 폴더까지 만들어 돌려준다.
 */
export async function preparePhotoPath(sessionId: string, index: number): Promise<string> {
  if (!/^[\w-]+$/.test(sessionId)) {
    throw new Error(`preparePhotoPath: 잘못된 sessionId (${sessionId})`)
  }
  if (!Number.isInteger(index) || index < 0 || index > 3) {
    throw new Error(`preparePhotoPath: 컷 번호는 0~3입니다 (${index})`)
  }
  const { photoDir } = pathsFor(sessionId)
  await mkdir(photoDir, { recursive: true })
  return join(photoDir, `cut_${pad(index + 1)}.jpg`)
}

const READABLE_PHOTO = new Set(['.jpg', '.jpeg', '.png'])

/** 네컷 합성·미리보기 — 세션 폴더 안의 사진만 되읽는다 */
export async function readPhoto(path: string): Promise<ArrayBuffer> {
  const full = resolve(path)
  if (!full.startsWith(resolve(dataRoot) + sep) || !READABLE_PHOTO.has(extname(full).toLowerCase())) {
    throw new Error(`readPhoto: 세션 폴더 안의 사진만 읽을 수 있습니다 (${path})`)
  }
  const buf = await readFile(full)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

export async function fileSize(path: string): Promise<number> {
  return (await stat(path)).size
}
