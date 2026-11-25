/**
 * audio/useAudioCapture.ts — 마이크 캡처 · 레벨 미터
 *
 * SPIKE_PLAN ① 완료 기준
 *   - 마이크 레벨 미터가 실시간으로 움직인다
 *   - DSP 3종 off 상태로 녹음되고, on/off 비교 녹음이 가능하다
 *
 * ⚠️ CLAUDE.md 금지사항 5 — noiseSuppression / echoCancellation / autoGainControl.
 *    본 플로우(P-05)에서는 항상 전부 false. D-01에서만 비교를 위해 켤 수 있다.
 *
 * 렌더러가 하는 일은 "마이크에서 raw Float32 PCM을 받아 모으는 것"까지다.
 * 리샘플링·WAV 작성은 메인(window.api.recording.saveWav).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { DspFlags } from '@shared/types'

/**
 * AudioWorklet 모듈 경로.
 *
 * ⚠️ `import ... from './x.js?url'` 로 하면 dev에서는 동작하지만 프로덕션 번들에
 *    파일이 포함되지 않는다(빌드에서 조용히 누락됨). public/ 에 두고 그대로 복사시킨다.
 *    상대경로여야 file:// 로딩(프로덕션)에서도 해석된다.
 */
const WORKLET_URL = './worklets/pcm-capture.js'

export const DSP_OFF: DspFlags = {
  noiseSuppression: false,
  echoCancellation: false,
  autoGainControl: false,
}

export interface CaptureResult {
  pcm: Float32Array
  /** AudioContext의 실제 샘플레이트 (보통 48000) — 메인이 16k로 줄인다 */
  sampleRate: number
  durationSec: number
  /** 트랙이 실제로 보고한 설정 — 요청한 DSP가 정말 꺼졌는지 확인용 */
  settings: MediaTrackSettings
}

interface CaptureApi {
  recording: boolean
  /** 0~1 RMS */
  level: number
  elapsedSec: number
  /** 실제 적용된 트랙 설정 (녹음 중/직후) */
  settings: MediaTrackSettings | null
  error: string | null
  start: (deviceId: string | undefined, dsp: DspFlags) => Promise<void>
  stop: () => Promise<CaptureResult | null>
}

export function useAudioCapture(): CaptureApi {
  const [recording, setRecording] = useState(false)
  const [level, setLevel] = useState(0)
  const [elapsedSec, setElapsedSec] = useState(0)
  const [settings, setSettings] = useState<MediaTrackSettings | null>(null)
  const [error, setError] = useState<string | null>(null)

  const streamRef = useRef<MediaStream | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const nodeRef = useRef<AudioWorkletNode | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const chunksRef = useRef<Float32Array[]>([])
  const rafRef = useRef<number | null>(null)
  const startedAtRef = useRef(0)

  const teardown = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    nodeRef.current?.disconnect()
    nodeRef.current = null
    analyserRef.current?.disconnect()
    analyserRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    void ctxRef.current?.close()
    ctxRef.current = null
  }, [])

  useEffect(() => teardown, [teardown])

  const start = useCallback(
    async (deviceId: string | undefined, dsp: DspFlags) => {
      setError(null)
      chunksRef.current = []

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
            channelCount: 1,
            // ⚠️ 여기가 금지사항 5의 지점 — 본 플로우는 전부 false
            noiseSuppression: dsp.noiseSuppression,
            echoCancellation: dsp.echoCancellation,
            autoGainControl: dsp.autoGainControl,
          },
        })
        streamRef.current = stream

        const track = stream.getAudioTracks()[0]!
        setSettings(track.getSettings())

        const ctx = new AudioContext()
        ctxRef.current = ctx
        await ctx.audioWorklet.addModule(WORKLET_URL)

        const source = ctx.createMediaStreamSource(stream)

        // 레벨 미터
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 1024
        source.connect(analyser)
        analyserRef.current = analyser

        // PCM 수집
        const node = new AudioWorkletNode(ctx, 'pcm-capture')
        node.port.onmessage = (e) => chunksRef.current.push(e.data as Float32Array)
        source.connect(node)
        // 노드가 pull되려면 목적지까지 연결돼야 한다.
        // ⚠️ 게인 0 — 마이크가 스피커로 새어 나가면 하울링이 난다 (금지사항 6과도 맞물림)
        const mute = ctx.createGain()
        mute.gain.value = 0
        node.connect(mute).connect(ctx.destination)
        nodeRef.current = node

        startedAtRef.current = performance.now()
        setRecording(true)

        const buf = new Float32Array(analyser.fftSize)
        let lastPaint = 0
        const tick = (now: number): void => {
          // 매 프레임 setState하면 화면 전체가 60fps로 리렌더된다.
          // 미터는 20fps면 충분히 부드럽다.
          if (now - lastPaint >= 50) {
            lastPaint = now
            analyser.getFloatTimeDomainData(buf)
            let sum = 0
            for (let i = 0; i < buf.length; i++) sum += buf[i]! * buf[i]!
            setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4))
            setElapsedSec((performance.now() - startedAtRef.current) / 1000)
          }
          rafRef.current = requestAnimationFrame(tick)
        }
        rafRef.current = requestAnimationFrame(tick)
      } catch (e) {
        setError((e as Error).message)
        teardown()
        setRecording(false)
      }
    },
    [teardown],
  )

  const stop = useCallback(async (): Promise<CaptureResult | null> => {
    if (!recording) return null

    const sampleRate = ctxRef.current?.sampleRate ?? 48_000
    const trackSettings = settings ?? {}

    // 마지막 청크까지 도착하도록 한 틱 양보
    await new Promise((r) => setTimeout(r, 60))

    const chunks = chunksRef.current
    const total = chunks.reduce((n, c) => n + c.length, 0)
    const pcm = new Float32Array(total)
    let offset = 0
    for (const c of chunks) {
      pcm.set(c, offset)
      offset += c.length
    }

    teardown()
    setRecording(false)
    setLevel(0)

    return { pcm, sampleRate, durationSec: total / sampleRate, settings: trackSettings }
  }, [recording, settings, teardown])

  return { recording, level, elapsedSec, settings, error, start, stop }
}
