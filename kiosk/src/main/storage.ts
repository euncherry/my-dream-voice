/**
 * src/main/storage.ts — 세션 폴더 · 파일 저장 규칙
 *
 * 저장 규칙
 *   <dataRoot>/<sessionId>/
 *     audio/   01_police.wav · 02_police.wav    ← 16kHz 모노 16bit (타깃 문장 순번)
 *              01-2_police.wav                  ← 만 4세는 어절 순번을 붙인다
 *              01_police_retry.wav              ← 다시 말한 녹음 (판단 직후 안 쓰는 쪽을 지운다)
 *     photo/   cut_01.jpg ... cut_04.jpg        ← 카메라 원본
 *     video/   capture.webm                     ← 촬영 장면 영상 (P-07 재생용 · 서버로 보내지 않는다)
 *     output/  fourcut.png · photo_4x6.pdf
 *
 *   sessionId = YYYYMMDD-HHmmss-xxxx
 *
 * ⚠️ 체험이 끝나면(M-03) 폴더 전체를 삭제한다 — PAGE_SPEC M-03 "세션 데이터 폐기"
 *    D-01에서 만든 dev- 세션은 WAV 샘플 채집용이라 지우지 않는다.
 */

import { app } from 'electron'
import { randomBytes } from 'node:crypto'
import { mkdir, readFile, readdir, rm, stat, unlink, writeFile } from 'node:fs/promises'
import { extname, join, resolve, sep } from 'node:path'
import { measurePcm } from './acoustic'
import type {
  DspFlags,
  SavePhotoRequest,
  SaveVideoRequest,
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
  // D-01은 'dev' — 채집한 WAV 샘플은 M-03 폐기 대상이 아니다
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
    videoDir: join(root, 'video'),
    outputDir: join(root, 'output'),
  }
}

export async function beginSession(prefix?: string): Promise<SessionPaths> {
  // 손님 세션은 한 번에 하나뿐이다 — 새로 시작하기 전에 남은 것을 치운다 (D-01의 dev- 세션은 건드리지 않는다)
  if (!prefix) await purgeLeftoverSessions()

  const paths = pathsFor(makeSessionId(prefix))
  await mkdir(paths.audioDir, { recursive: true })
  await mkdir(paths.photoDir, { recursive: true })
  await mkdir(paths.videoDir, { recursive: true })
  await mkdir(paths.outputDir, { recursive: true })
  return paths
}

/** 렌더러가 넘긴 sessionId 가 폴더 이름 하나인지 확인한다 ('.' · '..' · 경로 구분자 · 빈 값 거부) */
export function assertSessionId(sessionId: string, what: string): void {
  if (typeof sessionId !== 'string' || !/^[\w-]+$/.test(sessionId)) {
    throw new Error(`${what}: 잘못된 sessionId (${String(sessionId)})`)
  }
}

/** 렌더러가 넘긴 경로가 세션 폴더(dataRoot) 안인지 확인하고 정규화한다 */
export function insideDataRoot(path: string, what: string): string {
  const full = resolve(String(path))
  if (!full.startsWith(resolve(dataRoot) + sep)) {
    throw new Error(`${what}: 세션 폴더 밖의 파일입니다 (${path})`)
  }
  return full
}

/** Windows는 백신 · 색인이 파일을 잠깐 잡고 있으면 삭제가 실패한다 — 몇 번 다시 해 본다 */
const RM_OPTIONS = { recursive: true, force: true, maxRetries: 5, retryDelay: 200 } as const

/** M-03 — 로컬 WAV · 사진 · 영상 · PDF 삭제 */
export async function purgeSession(sessionId: string): Promise<void> {
  assertSessionId(sessionId, 'purgeSession')
  await rm(join(dataRoot, sessionId), RM_OPTIONS)
}

/** 손님 세션 폴더 이름 (접두어 없는 것). dev- 로 시작하는 D-01 세션은 맞지 않는다 */
const GUEST_SESSION_DIR = /^\d{8}-\d{6}-[0-9a-f]{4}$/

/**
 * 끝까지 못 간 세션의 폴더(녹음 · 사진 · 영상)를 치운다.
 *
 * 세션 폴더는 M-03에서 지우지만, 체험 도중 앱이 꺼지거나(정전 · 종료 · 오류) 삭제가 실패하면
 * 그 폴더를 기억하는 곳이 없어 아이 데이터가 기기에 계속 남는다 (SPEC §6-1 · §10-2).
 * 그래서 앱을 시작할 때와 새 세션을 시작할 때(P-00) 남은 손님 세션 폴더를 지운다.
 *
 * **설치판에서만 지운다.** 개발 실행(kiosk/sessions)은 뽑아 본 네컷 · 점검용 파일을 남겨 두려고 건드리지 않는다.
 * 실패해도 앱 시작 · 다음 손님을 막지 않는다.
 */
export async function purgeLeftoverSessions(): Promise<void> {
  if (!app.isPackaged) return
  try {
    const entries = await readdir(dataRoot, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory() || !GUEST_SESSION_DIR.test(entry.name)) continue
      try {
        await rm(join(dataRoot, entry.name), RM_OPTIONS)
        console.log(`[storage] 남은 세션 폴더 삭제: ${entry.name}`)
      } catch (e) {
        console.warn(`[storage] 남은 세션 폴더 삭제 실패: ${entry.name} — ${(e as Error).message}`)
      }
    }
  } catch (e) {
    console.warn(`[storage] 남은 세션 폴더 확인 실패 — ${(e as Error).message}`)
  }
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

function wavFileName(req: SaveWavRequest): string {
  if (!Number.isInteger(req.lineIndex) || req.lineIndex < 0) {
    throw new Error(`saveWav: 잘못된 문장 순번 (${req.lineIndex})`)
  }
  // 만 4세는 어절 순번을 붙인다 — 01-2_police.wav
  const part = Number.isInteger(req.partIndex) ? `-${req.partIndex! + 1}` : ''
  const job = String(req.jobId).replace(/[^a-z]/gi, '')
  const retry = req.retry ? '_retry' : ''
  return `${pad(req.lineIndex + 1)}${part}_${job}${retry}${dspSuffix(req.dsp)}.wav`
}

export async function saveWav(req: SaveWavRequest): Promise<SavedFile> {
  assertSessionId(req.sessionId, 'saveWav')
  const paths = pathsFor(req.sessionId)
  await mkdir(paths.audioDir, { recursive: true })

  const source = new Float32Array(req.pcm)
  const resampled = resample(source, req.sampleRate, TARGET_SAMPLE_RATE)
  const wav = wavContainer(floatToPcm16(resampled), TARGET_SAMPLE_RATE)

  const filePath = join(paths.audioDir, wavFileName(req))
  await writeFile(filePath, wav)

  // 디스크에 쓴 것과 같은 16kHz PCM으로 음향 특성을 잰다 (D-01 표 · 무음 확인)
  const quality = measurePcm(resampled, TARGET_SAMPLE_RATE, req.lineIndex)

  return { path: filePath, bytes: wav.length, quality }
}

/** D-01 청음 확인 — 저장된 WAV를 그대로 되읽는다 */
export async function readWav(path: string): Promise<ArrayBuffer> {
  const full = insideDataRoot(path, 'readWav')
  if (extname(full).toLowerCase() !== '.wav') {
    throw new Error(`readWav: 세션 폴더 안의 .wav만 읽을 수 있습니다 (${path})`)
  }
  const buf = await readFile(full)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

/**
 * P-05 다시 말하기 — 두 녹음 중 안 쓰게 된 쪽을 판단 직후 지운다 (SPEC §2).
 * 이미 없으면 조용히 넘어간다.
 */
export async function deleteWav(path: string): Promise<void> {
  const full = insideDataRoot(path, 'deleteWav')
  if (extname(full).toLowerCase() !== '.wav') {
    throw new Error(`deleteWav: .wav만 지울 수 있습니다 (${path})`)
  }
  await unlink(full).catch((e: NodeJS.ErrnoException) => {
    if (e.code !== 'ENOENT') throw e
  })
}

// ────────────────────────────────────────────────────────────
// 촬영 장면 영상 (P-06 → P-07) — 기기 안에만 둔다
// ────────────────────────────────────────────────────────────

const VIDEO_FILE = 'capture.webm'

export async function saveVideo(req: SaveVideoRequest): Promise<SavedFile> {
  assertSessionId(req.sessionId, 'saveVideo')
  const { videoDir } = pathsFor(req.sessionId)
  await mkdir(videoDir, { recursive: true })
  const filePath = join(videoDir, VIDEO_FILE)
  const bytes = Buffer.from(req.data)
  await writeFile(filePath, bytes)
  return { path: filePath, bytes: bytes.length }
}

/** P-07 재생용 — 세션 폴더 안의 촬영 영상만 되읽는다 */
export async function readVideo(path: string): Promise<ArrayBuffer> {
  const full = insideDataRoot(path, 'readVideo')
  if (extname(full).toLowerCase() !== '.webm') {
    throw new Error(`readVideo: 촬영 영상(.webm)만 읽을 수 있습니다 (${path})`)
  }
  const buf = await readFile(full)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

/** 네컷 합성본의 고정 경로 — 서버 전송은 이 파일만 읽는다 (main/server.ts) */
export function composedPhotoPath(sessionId: string): string {
  assertSessionId(sessionId, 'composedPhotoPath')
  return join(pathsFor(sessionId).outputDir, 'fourcut.png')
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
  assertSessionId(req.sessionId, 'savePhoto')
  if (!req.composed && (!Number.isInteger(req.index) || req.index < 0 || req.index > 3)) {
    throw new Error(`savePhoto: 컷 번호는 0~3입니다 (${req.index})`)
  }
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
