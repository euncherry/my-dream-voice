/**
 * src/main/acoustic.ts — 발화 음향 특성 (진폭 · 무음 비율 · 음도 변동)
 *
 * SPEC §7 T-1 후보 B: "음향 특성(목소리 크기/속도/높낮이 변화) 기반 중립 매칭 → 평가가 아님"
 *
 * ⚠️ 여기서 내는 값은 **녹음 품질·기술 지표**다. 아동을 평가하는 점수가 아니다.
 *    - 보호자 리포트에 넣지 않는다 (CLAUDE.md 금지사항 9)
 *    - 음도는 수치가 아니라 범주형 요약(stable / varied / unknown)으로만 낸다
 *    - 용도: 무음·클리핑 판정(재시도), 향후 T-1 중립 매칭 입력
 *
 * 무거운 계산이라 메인 프로세스에 둔다 (CLAUDE.md 금지사항 2).
 */

import { readFile } from 'node:fs/promises'
import type { PitchSummary, SpeechFeature } from '../shared/types'

/** 프레임 RMS가 이보다 작으면 무음으로 본다 (Float32 -1..1 기준) — 임시 임계값 */
const SILENCE_RMS = 0.01
/** 전체 RMS가 이보다 작으면 분석에 쓰기 어렵다 — 임시 임계값 */
const USABLE_MIN_RMS = 0.02
/** 무음 비율이 이 이상이면 재시도 대상 */
const USABLE_MAX_SILENCE = 0.6
/** 피크가 이 이상이면 클리핑 */
const CLIP_PEAK = 0.99

/** 음도 추정 범위 — 아동 음성 80~400Hz */
const F0_MIN_HZ = 80
const F0_MAX_HZ = 400
/** 자기상관 정규화 피크가 이보다 커야 유성음으로 본다 */
const VOICED_MIN_CORR = 0.5
/** 유성음 프레임이 비무음 프레임의 이 비율보다 적으면 unknown */
const VOICED_MIN_RATIO = 0.3
/** 변동계수(std/mean) 경계 — 이하면 stable */
const STABLE_MAX_CV = 0.15

const FRAME_MS = 40
const HOP_MS = 20

function rms(x: Float32Array, start = 0, end = x.length): number {
  let sum = 0
  for (let i = start; i < end; i++) sum += x[i]! * x[i]!
  const n = end - start
  return n > 0 ? Math.sqrt(sum / n) : 0
}

/**
 * 프레임 단위 자기상관으로 F0를 추정하고, 변동을 범주로 요약한다.
 * 정밀 피치 트래커가 아니다 — "안정적인가 / 변화가 큰가"만 본다.
 */
function pitchSummary(pcm: Float32Array, sampleRate: number): PitchSummary {
  const frame = Math.round((sampleRate * FRAME_MS) / 1000)
  const hop = Math.round((sampleRate * HOP_MS) / 1000)
  const minLag = Math.floor(sampleRate / F0_MAX_HZ)
  const maxLag = Math.ceil(sampleRate / F0_MIN_HZ)

  const f0s: number[] = []
  let nonSilent = 0

  for (let start = 0; start + frame <= pcm.length; start += hop) {
    if (rms(pcm, start, start + frame) < SILENCE_RMS) continue
    nonSilent++

    // 정규화 자기상관 r(lag) / r(0)
    let r0 = 0
    for (let i = 0; i < frame; i++) r0 += pcm[start + i]! * pcm[start + i]!
    if (r0 === 0) continue

    let bestLag = 0
    let bestCorr = 0
    for (let lag = minLag; lag <= maxLag && lag < frame; lag++) {
      let r = 0
      for (let i = 0; i + lag < frame; i++) r += pcm[start + i]! * pcm[start + i + lag]!
      const corr = r / r0
      if (corr > bestCorr) {
        bestCorr = corr
        bestLag = lag
      }
    }

    if (bestCorr >= VOICED_MIN_CORR && bestLag > 0) f0s.push(sampleRate / bestLag)
  }

  if (nonSilent === 0 || f0s.length < nonSilent * VOICED_MIN_RATIO) return 'unknown'

  const mean = f0s.reduce((a, b) => a + b, 0) / f0s.length
  const variance = f0s.reduce((a, b) => a + (b - mean) ** 2, 0) / f0s.length
  const cv = Math.sqrt(variance) / mean

  return cv <= STABLE_MAX_CV ? 'stable' : 'varied'
}

/** Float32 PCM 한 클립의 음향 특성 */
export function measurePcm(pcm: Float32Array, sampleRate: number, index: number): SpeechFeature {
  const amplitudeRms = rms(pcm)

  let peak = 0
  for (let i = 0; i < pcm.length; i++) {
    const a = Math.abs(pcm[i]!)
    if (a > peak) peak = a
  }

  // 무음 비율 — 20ms 프레임 중 RMS가 임계값 미만인 비율
  const hop = Math.round((sampleRate * HOP_MS) / 1000)
  let frames = 0
  let silent = 0
  for (let start = 0; start + hop <= pcm.length; start += hop) {
    frames++
    if (rms(pcm, start, start + hop) < SILENCE_RMS) silent++
  }
  const silenceRatio = frames > 0 ? silent / frames : 1

  const usable =
    amplitudeRms >= USABLE_MIN_RMS && silenceRatio <= USABLE_MAX_SILENCE && peak < CLIP_PEAK

  return {
    index,
    amplitudeRms: round(amplitudeRms),
    peak: round(peak),
    silenceRatio: round(silenceRatio),
    pitchSummary: pitchSummary(pcm, sampleRate),
    usable,
  }
}

/** 저장된 16bit 모노 WAV를 읽어 측정한다 (storage.ts가 쓰는 RIFF 규격 그대로) */
export async function measureWavFile(path: string, index: number): Promise<SpeechFeature> {
  const buf = await readFile(path)
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error(`WAV 아님: ${path}`)
  }
  const sampleRate = buf.readUInt32LE(24)
  const bitsPerSample = buf.readUInt16LE(34)
  if (bitsPerSample !== 16) throw new Error(`16bit WAV만 지원: ${path}`)

  // data 청크 탐색
  let offset = 12
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4)
    const size = buf.readUInt32LE(offset + 4)
    if (id === 'data') {
      const samples = size / 2
      const pcm = new Float32Array(samples)
      for (let i = 0; i < samples; i++) pcm[i] = buf.readInt16LE(offset + 8 + i * 2) / 0x8000
      return measurePcm(pcm, sampleRate, index)
    }
    offset += 8 + size + (size % 2)
  }
  throw new Error(`data 청크 없음: ${path}`)
}

function round(v: number): number {
  return Math.round(v * 100) / 100
}
