/**
 * p05/voiceRecorder.ts — P-05 저절로 녹음 (버튼 없음 · 띵 신호 뒤 바로 녹음 · 조용해지면 저절로 끝)
 *
 * 근거: docs/P05_SCENARIO.md §0 「말하는 신호」 · 「녹음 끝」 · 「연습 반응」
 *
 * 마이크는 P-05에 처음 아이 차례가 올 때 한 번 열고, 화면을 떠날 때 닫는다.
 *   매번 새로 열면 여는 동안(0.2 ~ 0.5초) 아이의 첫소리가 빠진다 (V2_BUILD_CHECKLIST 결정 ④와 같은 문제).
 *   열어 둔 동안에도 **소리를 모으는 것은 record() 동안뿐**이다 — 그 밖의 소리는 어디에도 남지 않는다.
 *
 * 녹음하는 동안 짧은 구간(약 40ms)마다 소리 크기(dBFS)를 잰다:
 *   - 말소리(VOICE_START_DB보다 큼)가 VOICE_MIN_MS 넘게 이어지면 "말을 시작했다"
 *   - 말을 시작한 뒤 SILENCE_END_MS 조용하면 끝 · 말이 없으면 maxMs에 끝
 *   - 가장 큰 소리(peakDb)는 연습의 "크게 / 작게" 반응에 쓴다 (받아쓰기 안 씀)
 *
 * ⚠️ CLAUDE.md 금지사항
 *   2 — 렌더러는 PCM을 모으기만 한다. 리샘플 · WAV 저장 · 받아쓰기는 메인(window.api)
 *   5 — DSP 3종 전부 false
 *   6 — 녹음 중 소리 금지는 부르는 쪽(P05Speak)이 muteClips로 지킨다
 */

import { DSP_OFF } from '../audio/useAudioCapture'
import { SILENCE_END_MS, VOICE_MIN_MS, VOICE_START_DB } from '@shared/constants'

const WORKLET_URL = './worklets/pcm-capture.js'

/** 소리 크기를 재는 간격 */
const TICK_MS = 20

/** 이보다 작은 소리는 이 값으로 친다 (log 0 방지) */
export const FLOOR_DB = -100

export interface RecordResult {
  pcm: Float32Array
  sampleRate: number
  durationSec: number
  /** 말소리가 있었나 — 없으면 무음 */
  voiced: boolean
  /** 녹음 동안 가장 큰 소리 (dBFS) */
  peakDb: number
  /** 어떻게 끝났나 */
  end: 'silence' | 'max' | 'cancel'
}

export interface RecordOptions {
  /** 말이 없을 때 끝나는 시간 */
  maxMs: number
  /** 소리 크기 (dBFS) — 마이크 반짝이를 소리에 맞춰 움직일 때 */
  onLevel?: (db: number) => void
}

/** 0 ~ 1 진폭 → dBFS */
export function toDb(rms: number): number {
  return rms > 0 ? Math.max(FLOOR_DB, 20 * Math.log10(rms)) : FLOOR_DB
}

export class VoiceRecorder {
  private stream: MediaStream | null = null
  private ctx: AudioContext | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private analyser: AnalyserNode | null = null
  private cancelCurrent: (() => void) | null = null

  get isOpen(): boolean {
    return this.ctx !== null
  }

  /** 마이크를 연다 (소리는 아직 모으지 않는다). 실패하면 예외 */
  async open(deviceId?: string): Promise<void> {
    if (this.ctx) return
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        channelCount: 1,
        // ⚠️ 금지사항 5 — 전부 false
        noiseSuppression: DSP_OFF.noiseSuppression,
        echoCancellation: DSP_OFF.echoCancellation,
        autoGainControl: DSP_OFF.autoGainControl,
      },
    })
    try {
      const ctx = new AudioContext()
      await ctx.audioWorklet.addModule(WORKLET_URL)
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 2048 // 48kHz에서 약 43ms
      source.connect(analyser)
      this.stream = stream
      this.ctx = ctx
      this.source = source
      this.analyser = analyser
    } catch (e) {
      stream.getTracks().forEach((t) => t.stop())
      throw e
    }
  }

  /** 지금 소리 크기 (dBFS) — 녹음하지 않을 때도 잴 수 있다 (D-01 목소리 크기 재기) */
  levelDb(): number {
    const analyser = this.analyser
    if (!analyser) return FLOOR_DB
    const buf = new Float32Array(analyser.fftSize)
    analyser.getFloatTimeDomainData(buf)
    let sum = 0
    for (let i = 0; i < buf.length; i++) sum += buf[i]! * buf[i]!
    return toDb(Math.sqrt(sum / buf.length))
  }

  /**
   * 녹음 한 번 — 조용해지거나 maxMs가 되면 저절로 끝난다.
   * 마이크가 열려 있어야 한다 (open).
   */
  record({ maxMs, onLevel }: RecordOptions): Promise<RecordResult> {
    const ctx = this.ctx
    const source = this.source
    if (!ctx || !source) return Promise.reject(new Error('마이크가 열려 있지 않습니다'))

    return new Promise<RecordResult>((resolve) => {
      // 녹음마다 새 수집 노드 — 지난 녹음의 남은 조각이 섞이지 않게
      const node = new AudioWorkletNode(ctx, 'pcm-capture')
      const chunks: Float32Array[] = []
      node.port.onmessage = (e) => chunks.push(e.data as Float32Array)
      source.connect(node)
      // 노드가 돌려면 목적지까지 이어져야 한다 — ⚠️ 게인 0 (마이크 소리가 스피커로 새지 않게)
      const mute = ctx.createGain()
      mute.gain.value = 0
      node.connect(mute).connect(ctx.destination)

      const startedAt = performance.now()
      let lastTick = startedAt
      let run = 0 // 말소리가 이어진 시간
      let voiced = false
      let lastVoiceAt = startedAt
      let peakDb = FLOOR_DB
      let done = false

      const finish = (end: RecordResult['end']): void => {
        if (done) return
        done = true
        window.clearInterval(timer)
        this.cancelCurrent = null
        // 마지막 조각이 도착하도록 한 틱 양보한 뒤 끊는다
        window.setTimeout(() => {
          try {
            source.disconnect(node)
          } catch {
            /* 이미 끊김 */
          }
          node.port.onmessage = null
          node.disconnect()
          mute.disconnect()
          const total = chunks.reduce((n, c) => n + c.length, 0)
          const pcm = new Float32Array(total)
          let offset = 0
          for (const c of chunks) {
            pcm.set(c, offset)
            offset += c.length
          }
          resolve({
            pcm,
            sampleRate: ctx.sampleRate,
            durationSec: total / ctx.sampleRate,
            voiced,
            peakDb,
            end,
          })
        }, 60)
      }

      const timer = window.setInterval(() => {
        const now = performance.now()
        const dt = now - lastTick
        lastTick = now
        const db = this.levelDb()
        onLevel?.(db)
        if (db > peakDb) peakDb = db

        if (db >= VOICE_START_DB) {
          run += dt
          if (run >= VOICE_MIN_MS) voiced = true
          lastVoiceAt = now
        } else {
          run = 0
        }

        if (voiced && now - lastVoiceAt >= SILENCE_END_MS) finish('silence')
        else if (now - startedAt >= maxMs) finish('max')
      }, TICK_MS)

      this.cancelCurrent = () => finish('cancel')
    })
  }

  /** 녹음 중이면 멈추고(결과는 'cancel'), 마이크를 닫는다 */
  close(): void {
    this.cancelCurrent?.()
    this.cancelCurrent = null
    this.analyser?.disconnect()
    this.source?.disconnect()
    this.stream?.getTracks().forEach((t) => t.stop())
    void this.ctx?.close().catch(() => undefined)
    this.stream = null
    this.ctx = null
    this.source = null
    this.analyser = null
  }
}
