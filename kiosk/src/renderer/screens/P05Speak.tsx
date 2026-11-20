/**
 * P-05 [발화] — B모드 전용
 *
 * 근거: PAGE_SPEC "P-05 [발화]" · SPEC §2 「아이 차례 진행」 · 「만 4세는 어절마다」 · 「다시 말하기」 · V2_PLAN §3 P-05
 * 구성 스케치: docs/user-flow/wf/p05-speak · p05-record · p05-think · p05-retry
 *
 * 흐름 — 아이 차례 1 → 아이 차례 2 → P-06
 *   scene(장면 내레이션) → 구간마다
 *     ① listen(문장 음성 + 자막) → ② cue("이제 말해 보자!") → ③ ready([말하기 시작]) → recording([다 말했어요])
 *     → ④ thinking("잘 듣고 있어요…" — 뒤에서 받아쓰기) → ⑤ 다음 구간 / retry(구간마다 1번만)
 *   구간 = 만 4세는 어절, 그 외는 문장 전체 (shared/jobs.ts의 line.parts)
 *
 * ⚠️ CLAUDE.md 금지사항
 *   2 — WAV 저장 · 받아쓰기는 메인(window.api)에 맡긴다
 *   5 — 마이크 DSP는 전부 false (DSP_OFF)
 *   6 — 녹음 중에는 어떤 소리도 내지 않는다: 녹음 직전에 모든 재생을 멈추고 잠근다(muteClips).
 *       반대로 재생 중에는 녹음을 시작하는 버튼이 꺼져 있다
 *   7 · 8 — 인식률 · 받아쓴 글자 · 다시 말하기 판단은 화면 어디에도 내보내지 않는다 (개발용 띠 포함).
 *           아이에게는 "한 번 더 말해 볼까요?"만 보인다
 *
 * ⚠️ MOCK — 받아쓰기는 아직 src/main/mock/stt.ts 다. 스토어의 mockStt(DevBar)로 결과를 고른다.
 * ⚠️ 색 · 글꼴 · 배치는 임시다 — 피그마 디자인이 오면 입힌다. 지금은 구조와 동작만.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { DevStrip, Placeholder, PlaceholderTag, Screen } from '../components/Screen'
import { useSession } from '../store/session'
import { DSP_OFF, useAudioCapture, type CaptureResult } from '../audio/useAudioCapture'
import { stopAll } from '../audio/playback'
import { muteClips, playClip, stopClips } from '../audio/clips'
import {
  RECORD_LIMIT_SEC,
  RECORD_MIN_MS,
  RETRY_MIN_RECOGNITION,
  STT_MAX_WAIT_MS,
  STT_MIN_SHOW_MS,
  SUBTITLE_FALLBACK_MS,
} from '@shared/constants'
import { CUES, ageGroupLabel, jobLabel, scenarioFor } from '@shared/jobs'
import type {
  AgeGroup,
  JobId,
  LinePart,
  MockSttOutcome,
  Scenario,
  ScenarioTurn,
  SpeechLine,
  SpeechPart,
  SttRequest,
} from '@shared/types'
import '../styles/p05.css'

type Phase =
  | 'scene' // 장면 내레이션
  | 'listen' // ① 문장 음성 + 자막
  | 'cue' // ② 녹음 멘트 "이제 말해 보자!"
  | 'ready' // ③ [말하기 시작]을 기다린다
  | 'recording' // ③ 녹음 중 ([다 말했어요] 또는 제한 시간)
  | 'thinking' // ④ "잘 듣고 있어요…" — 저장 + 받아쓰기
  | 'retry' // 다시 말하기 — [다시 듣기] / [바로 말하기]
  | 'micError' // 마이크를 못 켰다
  | 'leaving' // 끝 — P-06으로

interface Step {
  /** 아이 차례 순번 (0 · 1) */
  turn: number
  /** 그 문장 안의 구간 순번 — 만 4세만 여러 개 */
  part: number
  phase: Phase
}

const FIRST_STEP: Step = { turn: 0, part: 0, phase: 'scene' }

/**
 * 녹음 한 번의 결과.
 * ⚠️ 화면에 내보내지 않는다 — state가 아니라 ref에만 둔다 (CLAUDE.md 금지사항 7 · 8).
 */
interface Attempt {
  /** 저장한 WAV. 마이크에서 아무것도 못 받았으면 없다 */
  wav?: string
  silent: boolean
  transcript?: string
  cer?: number
}

/** M-02에 띄우는 문구 — 아이가 읽어도 무섭지 않게 */
const MIC_MESSAGE = '마이크를 준비하고 있어요. 옆의 직원에게 알려주세요!'

/** 위쪽 개발용 띠(Screen note)에 붙이는 단계 표기 */
const PHASE_NOTE: Record<Phase, string> = {
  scene: '장면 내레이션',
  listen: '① 문장 음성 + 자막',
  cue: '② 녹음 멘트',
  ready: '③ [말하기 시작] 기다림',
  recording: '③ 녹음',
  thinking: '④ 받아쓰기 확인',
  retry: '다시 말하기 선택',
  micError: '마이크를 못 켬',
  leaving: 'P-06으로',
}

function turnAt(scenario: Scenario, at: Pick<Step, 'turn'>): ScenarioTurn {
  return scenario.turns[at.turn] ?? scenario.turns[0]
}

function partAt(scenario: Scenario, at: Pick<Step, 'turn' | 'part'>): LinePart {
  const line = turnAt(scenario, at).line
  return line.parts[at.part] ?? line.parts[0] ?? { text: line.text }
}

/** 인식률 = 1 − 글자 CER. 무음은 가장 낮고, 받아쓰기가 시간 초과 · 실패(cer 없음)면 통과로 본다 */
function recognitionOf(attempt: Attempt): number {
  if (attempt.silent) return Number.NEGATIVE_INFINITY
  if (attempt.cer === undefined) return 1
  return 1 - attempt.cer
}

/** 통과 = 무음이 아니고 인식률이 기준 이상 (SPEC §2 · T-10) */
function passes(attempt: Attempt): boolean {
  return !attempt.silent && recognitionOf(attempt) >= RETRY_MIN_RECOGNITION
}

/**
 * 남길 녹음을 고른다 — 인식률이 높은 쪽 (같으면 나중 녹음).
 * 전부 무음(또는 녹음 없음)이면 아무것도 남기지 않는다 — 그 구간은 판단 보류.
 *
 * 받아쓰기가 시간 초과 · 실패한 녹음(cer 없음)은 "통과로 보고 넘어간다"일 뿐 인식률을 아는 것이 아니다.
 * 한쪽만 받아쓰기가 있으면 **받아쓰기가 있는 쪽**을 남긴다 — P-07 정밀 분석은 남긴 녹음과 그 받아쓰기를 같이 쓴다 (SPEC §3-3).
 * (문서에 없는 경우라 임시로 정한 규칙 — V2_BUILD_CHECKLIST §2)
 */
function chooseAttempt(attempts: Attempt[]): { keep: Attempt | null; drop: Attempt[] } {
  let keep: Attempt | null = null
  for (const attempt of attempts) {
    if (attempt.silent) continue
    if (!keep) {
      keep = attempt
      continue
    }
    const known = attempt.cer !== undefined
    const keepKnown = keep.cer !== undefined
    if (known !== keepKnown) {
      if (known) keep = attempt
      continue
    }
    if (recognitionOf(attempt) >= recognitionOf(keep)) keep = attempt
  }
  return { keep, drop: attempts.filter((a) => a !== keep) }
}

export function P05Speak(): ReactNode {
  const sessionId = useSession((s) => s.session.sessionId)
  const job = useSession((s) => s.session.job)
  const ageGroup = useSession((s) => s.session.ageGroup)
  const goto = useSession((s) => s.goto)

  // 세션 · 직업 · 연령 없이 들어온 경우 (개발용 화면 이동으로 건너뛴 경우 등)
  if (!sessionId || !job || !ageGroup) {
    return (
      <Screen id="P-05" note="세션 정보 없음">
        <p className="screen__sub">
          세션 · 직업 · 연령이 정해지지 않아 발화를 시작할 수 없습니다. P-00부터 다시 진행해 주세요.
        </p>
        <DevStrip label="세션 없음">
          <button className="btn btn--sm" onClick={() => goto('P-00')}>
            P-00으로
          </button>
        </DevStrip>
      </Screen>
    )
  }

  return <SpeakFlow sessionId={sessionId} job={job} ageGroup={ageGroup} />
}

function SpeakFlow({
  sessionId,
  job,
  ageGroup,
}: {
  sessionId: string
  job: JobId
  ageGroup: AgeGroup
}): ReactNode {
  const patch = useSession((s) => s.patch)
  const next = useSession((s) => s.next)
  const setFallback = useSession((s) => s.setFallback)
  const mockStt = useSession((s) => s.mockStt)
  const capture = useAudioCapture()

  const scenario = useMemo(() => scenarioFor(job, ageGroup), [job, ageGroup])

  const [step, setStep] = useState<Step>(FIRST_STEP)
  /** 다시 말하기 멘트가 끝났는가 — 끝난 뒤에야 버튼이 켜진다 */
  const [cueDone, setCueDone] = useState(false)
  /** 음성 파일이 없어 자막만 보여 주는 중인가 */
  const [subtitleOnly, setSubtitleOnly] = useState(false)
  /** MOCK: 개발용 받아쓰기 결과 버튼이 떠 있는가 */
  const [pickOpen, setPickOpen] = useState(false)

  const stepRef = useRef<Step>(FIRST_STEP)
  const aliveRef = useRef(true)
  /** 녹음을 끝내고 판단 · 저장하는 중 — 겹쳐 누르기 방지 */
  const busyRef = useRef(false)
  /** 지금 구간의 녹음들 (최대 2번) — ⚠️ 화면에 내보내지 않는다 */
  const attemptsRef = useRef<Attempt[]>([])
  const speechRef = useRef<SpeechLine[]>([])
  const timersRef = useRef(new Set<number>())
  const pickRef = useRef<((outcome: MockSttOutcome) => void) | null>(null)
  const finishRef = useRef<(byLimit?: boolean) => void>(() => undefined)
  /** 마이크가 실제로 열린 시각 — 그 직후의 [다 말했어요]를 거르는 데 쓴다 */
  const micLiveAtRef = useRef(0)

  const { phase, turn: turnIdx, part: partIdx } = step
  const turn = turnAt(scenario, step)
  const parts = turn.line.parts
  const part = partAt(scenario, step)

  const go = useCallback((change: Partial<Step>): void => {
    const nextStep = { ...stepRef.current, ...change }
    stepRef.current = nextStep
    setStep(nextStep)
  }, [])

  /** 화면을 떠나면 함께 지워지는 타이머 */
  function startTimer(ms: number): { done: Promise<void>; cancel: () => void } {
    let id = 0
    const done = new Promise<void>((resolve) => {
      id = window.setTimeout(() => {
        timersRef.current.delete(id)
        resolve()
      }, ms)
      timersRef.current.add(id)
    })
    return {
      done,
      cancel: () => {
        window.clearTimeout(id)
        timersRef.current.delete(id)
      },
    }
  }

  // ── 화면을 떠날 때: 재생 정지 · 타이머 정리 (마이크 스트림은 useAudioCapture가 닫는다) ──
  useEffect(() => {
    const timers = timersRef.current
    aliveRef.current = true
    return () => {
      aliveRef.current = false
      timers.forEach((id) => window.clearTimeout(id))
      timers.clear()
      pickRef.current = null
      stopClips()
      muteClips(false)
    }
  }, [])

  // ── 재생 단계: 장면 내레이션 · ① 문장 음성 · ② 녹음 멘트 · 다시 말하기 멘트 ──
  // 음성 파일이 없으면(SPEC T-3) 자막만 SUBTITLE_FALLBACK_MS 동안 보여 주고 넘어간다.
  useEffect(() => {
    const at = { turn: turnIdx, part: partIdx }
    let src: string | undefined
    let onEnd: () => void
    switch (phase) {
      case 'scene':
        src = turnAt(scenario, at).narrationAudio
        onEnd = () => go({ phase: 'listen' })
        break
      case 'listen':
        src = partAt(scenario, at).audio
        onEnd = () => go({ phase: 'cue' })
        break
      case 'cue':
        src = CUES.speakNow.audio
        onEnd = () => go({ phase: 'ready' })
        break
      case 'retry':
        src = CUES.oneMore.audio
        // 멘트가 끝난 뒤에 [다시 듣기] · [바로 말하기]가 켜진다
        onEnd = () => setCueDone(true)
        break
      default:
        // ⚠️ ready · recording · thinking 에서는 아무것도 재생하지 않는다 (금지사항 6)
        return
    }

    let cancelled = false
    const clip = playClip(src, SUBTITLE_FALLBACK_MS, {
      onPlaying: () => {
        if (!cancelled) setSubtitleOnly(false)
      },
      onMissing: () => {
        if (!cancelled) setSubtitleOnly(true)
      },
    })
    void clip.done.then((end) => {
      if (cancelled || end === 'stopped') return
      onEnd()
    })
    return () => {
      cancelled = true
      clip.stop()
    }
  }, [phase, turnIdx, partIdx, scenario, go])

  // ── 마이크를 못 켰다 → M-02 안내 + 화면에 [다시 시도] ──
  useEffect(() => {
    if (phase !== 'recording' || !capture.error) return
    muteClips(false)
    setFallback({ kind: 'device', message: MIC_MESSAGE, detail: capture.error })
    go({ phase: 'micError' })
  }, [phase, capture.error, setFallback, go])

  // ── [다 말했어요]를 안 누르면 제한 시간에서 저절로 끝낸다 (⏸ SPEC T-19 — 임시값) ──
  // useAudioCapture의 stop은 렌더마다 새로 만들어지므로 최신 핸들러를 ref로 부른다.
  const micLive = phase === 'recording' && capture.recording
  useEffect(() => {
    if (!micLive) return
    micLiveAtRef.current = performance.now()
    const id = window.setTimeout(() => finishRef.current(true), RECORD_LIMIT_SEC * 1000)
    return () => window.clearTimeout(id)
  }, [micLive])

  useEffect(() => {
    finishRef.current = (byLimit) => void finishRecording(byLimit)
  })

  // ────────────────────────────────────────────────
  // ③ 녹음
  // ────────────────────────────────────────────────

  /** [말하기 시작] · [바로 말하기] · [다시 시도] */
  function beginRecording(): void {
    const now = stepRef.current.phase
    if (busyRef.current) return
    if (now !== 'ready' && now !== 'micError' && !(now === 'retry' && cueDone)) return

    // ⚠️ 금지사항 6 — 녹음을 시작하기 전에 모든 소리를 멈추고, 끝날 때까지 잠근다
    stopAll()
    stopClips()
    muteClips(true)

    go({ phase: 'recording' })
    // ⚠️ 금지사항 5 — DSP 3종 전부 false
    void capture.start(undefined, DSP_OFF)
  }

  /** [다 말했어요] 또는 제한 시간(byLimit) */
  async function finishRecording(byLimit = false): Promise<void> {
    const at = stepRef.current
    if (at.phase !== 'recording' || busyRef.current) return
    // 연타 방지 — [말하기 시작]과 같은 자리의 버튼이라, 마이크가 열린 직후의 터치는 받지 않는다
    if (!byLimit && performance.now() - micLiveAtRef.current < RECORD_MIN_MS) return
    busyRef.current = true

    const shownAt = performance.now()
    go({ phase: 'thinking' })

    const result = await capture.stop()
    // 마이크를 닫은 뒤에 재생 잠금을 푼다
    muteClips(false)
    if (!aliveRef.current) return

    const attempt = await listenTo(result, at)
    if (!aliveRef.current) return

    // "잘 듣고 있어요"는 최소 STT_MIN_SHOW_MS 는 보여 준다
    const rest = STT_MIN_SHOW_MS - (performance.now() - shownAt)
    if (rest > 0) await startTimer(rest).done
    if (!aliveRef.current) return

    attemptsRef.current = [...attemptsRef.current, attempt]

    // ⑤ 첫 녹음이 통과하지 못했으면 다시 말하기 — 구간마다 1번만. 무음도 통과 못 함이다
    if (attemptsRef.current.length === 1 && !passes(attempt)) {
      busyRef.current = false
      setCueDone(false)
      go({ phase: 'retry' })
      return
    }

    // 통과했거나, 두 번째 녹음이면 결과와 상관없이 다음으로
    await finishPart(at)
    busyRef.current = false
  }

  // ────────────────────────────────────────────────
  // ④ 판단 — ⚠️ 결과는 화면에 절대 내보내지 않는다
  // ────────────────────────────────────────────────

  /** 녹음 저장 → 받아쓰기. 시간 초과 · 실패는 통과로 본다 (cer 없음) */
  async function listenTo(result: CaptureResult | null, at: Step): Promise<Attempt> {
    // 마이크에서 아무것도 못 받았다 — 무음 (WAV 없음)
    if (!result || result.pcm.length === 0) return { silent: true }

    const lineParts = turnAt(scenario, at).line.parts
    let wav: string
    try {
      const saved = await window.api.recording.saveWav({
        sessionId,
        lineIndex: at.turn,
        // 어절 순번은 만 4세처럼 구간이 여러 개일 때만 붙인다
        partIndex: lineParts.length > 1 ? at.part : undefined,
        retry: attemptsRef.current.length > 0,
        jobId: job,
        pcm: result.pcm.buffer as ArrayBuffer,
        sampleRate: result.sampleRate,
        dsp: DSP_OFF,
      })
      wav = saved.path
    } catch (e) {
      // 저장하지 못했으면 남길 녹음이 없다 — 무음과 같이 다룬다 (한 번 더 말할 기회를 준다)
      console.error('[P-05] 녹음 저장 실패', e)
      return { silent: true }
    }
    if (!aliveRef.current) return { wav, silent: false }

    const deadline = startTimer(STT_MAX_WAIT_MS)
    const timeout = deadline.done.then(() => 'timeout' as const)
    try {
      // MOCK: 받아쓰기 프로그램(faster-whisper)이 붙기 전까지 결과를 스토어의 mockStt로 정한다.
      //       실제 프로그램은 mock 필드를 무시한다 — 붙으면 이 갈래(manual 버튼 포함)를 걷어 낸다.
      const mode = useSession.getState().mockStt
      let mock: NonNullable<SttRequest['mock']>
      if (mode === 'manual') {
        // 개발용 버튼(통과 / 실패 / 무음)을 누를 때까지 기다린다
        const picked = await Promise.race([waitForPick(), timeout])
        if (picked === 'timeout') return { wav, silent: false }
        mock = { outcome: picked, skipSilenceCheck: true }
      } else {
        // 무음 검사는 메인이 실제로 한다
        mock = { outcome: mode }
      }

      const answer = await Promise.race([
        window.api.stt
          .transcribe({ wavPath: wav, targetText: partAt(scenario, at).text, mock })
          .catch((e: unknown) => {
            console.error('[P-05] 받아쓰기 실패', e)
            return 'failed' as const
          }),
        timeout,
      ])
      if (answer === 'timeout' || answer === 'failed') return { wav, silent: false }
      return { wav, silent: answer.silent, transcript: answer.transcript, cer: answer.cer }
    } finally {
      deadline.cancel()
      pickRef.current = null
      setPickOpen(false)
    }
  }

  /** MOCK: 개발용 버튼으로 받아쓰기 결과를 고른다 */
  function waitForPick(): Promise<MockSttOutcome> {
    return new Promise((resolve) => {
      pickRef.current = resolve
      setPickOpen(true)
    })
  }

  function pick(outcome: MockSttOutcome): void {
    const resolve = pickRef.current
    pickRef.current = null
    setPickOpen(false)
    resolve?.(outcome)
  }

  // ────────────────────────────────────────────────
  // ⑤ 구간 마무리 → 다음 구간 / 다음 아이 차례 / P-06
  // ────────────────────────────────────────────────

  async function finishPart(at: Step): Promise<void> {
    const attempts = attemptsRef.current
    attemptsRef.current = []

    // 인식률이 높은 쪽을 남기고, 안 쓰는 쪽 WAV는 바로 지운다 (둘 다 무음이면 둘 다)
    const { keep, drop } = chooseAttempt(attempts)
    await Promise.all(
      drop.map(async (attempt) => {
        if (!attempt.wav) return
        try {
          await window.api.recording.deleteWav(attempt.wav)
        } catch (e) {
          console.error('[P-05] 안 쓰는 녹음 삭제 실패', e)
        }
      }),
    )
    if (!aliveRef.current) return

    const text = partAt(scenario, at).text
    const retried = attempts.length > 1
    const speechPart: SpeechPart = keep
      ? { text, wav: keep.wav, transcript: keep.transcript, cer: keep.cer, retried }
      : { text, retried }

    // 구간이 끝날 때마다 세션에 적는다
    const lines = speechRef.current.slice()
    lines[at.turn] = {
      line: turnAt(scenario, at).line.text,
      parts: [...(lines[at.turn]?.parts ?? []), speechPart],
    }
    speechRef.current = lines
    patch({ speech: lines })

    if (at.part + 1 < turnAt(scenario, at).line.parts.length) {
      go({ part: at.part + 1, phase: 'listen' })
    } else if (at.turn + 1 < scenario.turns.length) {
      go({ turn: at.turn + 1, part: 0, phase: 'scene' })
    } else {
      go({ phase: 'leaving' })
      next()
    }
  }

  /** [다시 듣기] — ① 문장 음성부터 다시 (→ ② → ③) */
  function listenAgain(): void {
    if (stepRef.current.phase !== 'retry' || !cueDone || busyRef.current) return
    go({ phase: 'listen' })
  }

  /** 개발용 — 마이크 없는 PC에서 흐름을 확인할 때: 녹음 없이 이 구간을 넘긴다 */
  async function skipWithoutRecording(): Promise<void> {
    const at = stepRef.current
    if (at.phase !== 'micError' || busyRef.current) return
    busyRef.current = true
    setFallback(null)
    await finishPart(at)
    busyRef.current = false
  }

  // ────────────────────────────────────────────────
  // 화면
  // ────────────────────────────────────────────────

  const speaking =
    phase === 'listen' || phase === 'cue' || phase === 'ready' || phase === 'recording'
  /** 음성(또는 자막 시간)이 흐르는 중 — 이 동안은 녹음 버튼이 꺼져 있다 */
  const playing =
    phase === 'scene' || phase === 'listen' || phase === 'cue' || (phase === 'retry' && !cueDone)
  const contentPending =
    turn.narrationSource === 'placeholder' || turn.line.source === 'placeholder'

  return (
    <Screen
      id="P-05"
      note={`${jobLabel(job)} · ${ageGroupLabel(ageGroup)} · ${PHASE_NOTE[phase]}`}
    >
      <div className="p05">
        {/* 위: 직업 이름 · 문장 진행 표시 (만 4세는 어절을 점으로) */}
        <header className="p05-top">
          <span className="p05-job">{jobLabel(job)}</span>
          <span className="p05-progress">
            문장 {turnIdx + 1} / {scenario.turns.length}
          </span>
          {parts.length > 1 && (
            <span className="p05-dots">
              {parts.map((p, i) => (
                <span
                  key={`${i}-${p.text}`}
                  className={`p05-dot${
                    i < partIdx ? ' p05-dot--done' : i === partIdx ? ' p05-dot--now' : ''
                  }`}
                />
              ))}
            </span>
          )}
        </header>

        <div className="p05-main">
          {/* 시나리오 장면 — 연출은 미정 (SPEC T-17) */}
          <section className="p05-scene">
            <div className="p05-scene__art">
              <Placeholder label="시나리오 장면 — 그림 · 애니메이션 · 내레이션 (SPEC T-17)" />
            </div>
            <p className="p05-narration">{turn.narration}</p>
            <div className="p05-tags">
              {contentPending ? (
                <PlaceholderTag label="시나리오 · 문장 미확정 (SPEC T-3)" />
              ) : (
                <PlaceholderTag label="예시 문구 — 확정 전 (SPEC T-3)" />
              )}
              {playing && subtitleOnly && (
                <PlaceholderTag label="음성 파일 미제공 — 자막만 (SPEC T-3)" />
              )}
            </div>
          </section>

          {/* 아이 차례 */}
          {phase !== 'scene' && phase !== 'leaving' && (
            <section className="panel p05-turn">
              <div className="p05-turn__head">
                <strong className="p05-turn__label">내 차례!</strong>
                <PlaceholderTag label="안내 문구 임시 — 구성 스케치 기준" />
              </div>

              <div className="p05-turn__row">
                {/* ① ② ③ — 듣기 → 멘트 → 말하기 */}
                {speaking && (
                  <>
                    <div className="p05-turn__body">
                      {/* "따라 말해 보세요"는 마이크가 실제로 열린 뒤에 보인다 — 그 전에 말하면 앞소리가 녹음에서 빠진다 */}
                      <p
                        className={`p05-status${
                          phase === 'ready' || (phase === 'recording' && !capture.recording)
                            ? ' p05-off'
                            : ''
                        }`}
                      >
                        {phase === 'recording' ? '따라 말해 보세요' : '먼저 들어 봐요'}
                      </p>
                      {phase === 'recording' && (
                        // 마이크가 실제로 열린 뒤에만 "녹음 중"을 보인다
                        <div className={`p05-rec${capture.recording ? '' : ' p05-off'}`}>
                          <PlaceholderTag label="마이크 아이콘" />
                          <span className="p05-rec__label">녹음 중</span>
                          <div className="p05-meter">
                            <div
                              className="p05-meter__fill"
                              style={{ width: `${Math.round(capture.level * 100)}%` }}
                            />
                          </div>
                        </div>
                      )}
                      {/* 자막 = 지금 따라 말할 구간 */}
                      <p className="p05-line">{part.text}</p>
                      {parts.length > 1 && <p className="p05-whole">{turn.line.text}</p>}
                      {phase !== 'recording' && (
                        <p className={`p05-cue${phase === 'listen' ? ' p05-off' : ''}`}>
                          {CUES.speakNow.text}
                        </p>
                      )}
                    </div>
                    <div className="p05-turn__side">
                      {phase === 'recording' ? (
                        <button
                          className="btn btn--lg btn--primary p05-btn"
                          disabled={!capture.recording}
                          onClick={() => void finishRecording()}
                        >
                          <PlaceholderTag label="아이콘" />
                          <span>다 말했어요</span>
                        </button>
                      ) : (
                        // 음성 · 멘트가 끝난 뒤(ready)에만 켜진다
                        <button
                          className="btn btn--lg btn--primary p05-btn"
                          disabled={phase !== 'ready'}
                          onClick={beginRecording}
                        >
                          <PlaceholderTag label="마이크 아이콘" />
                          <span>말하기 시작</span>
                        </button>
                      )}
                    </div>
                  </>
                )}

                {/* ④ 잘 듣고 있어요 — 판단 결과는 내보내지 않는다 */}
                {phase === 'thinking' && (
                  <>
                    <div className="p05-char">
                      <Placeholder label="SD 캐릭터 — 고민하는 표정" />
                    </div>
                    <div className="p05-turn__body">
                      <p className="p05-say">잘 듣고 있어요…</p>
                      <span className="p05-wait" aria-hidden="true">
                        <i />
                        <i />
                        <i />
                      </span>
                    </div>
                  </>
                )}

                {/* 다시 말하기 — 아이에게는 이 멘트만 보인다 */}
                {phase === 'retry' && (
                  <>
                    <div className="p05-char">
                      <Placeholder label="SD 캐릭터 — 웃는 얼굴" />
                    </div>
                    <div className="p05-turn__body">
                      <p className="p05-say">{CUES.oneMore.text}</p>
                      <div className="p05-actions">
                        <button
                          className="btn btn--lg p05-btn"
                          disabled={!cueDone}
                          onClick={listenAgain}
                        >
                          <PlaceholderTag label="스피커 아이콘" />
                          <span>다시 듣기</span>
                        </button>
                        <button
                          className="btn btn--lg p05-btn"
                          disabled={!cueDone}
                          onClick={beginRecording}
                        >
                          <PlaceholderTag label="마이크 아이콘" />
                          <span>바로 말하기</span>
                        </button>
                      </div>
                    </div>
                  </>
                )}

                {/* 마이크를 못 켰다 — 안내는 M-02가 띄우고, 여기서는 다시 시도만 */}
                {phase === 'micError' && (
                  <>
                    <div className="p05-turn__body">
                      <p className="p05-say">{MIC_MESSAGE}</p>
                    </div>
                    <div className="p05-turn__side">
                      <button className="btn btn--lg btn--primary p05-btn" onClick={beginRecording}>
                        <PlaceholderTag label="아이콘" />
                        <span>다시 시도</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </section>
          )}
        </div>

        {/* 개발용 — 손님 화면에는 없다. ⚠️ 인식률 · 받아쓴 글자는 여기에도 띄우지 않는다 */}
        <div className="p05-dev">
          <DevStrip label="P-05">
            <span>{phase}</span>
            <span>· 받아쓰기 mock: {mockStt}</span>
          </DevStrip>

          {pickOpen && (
            <DevStrip label="MOCK 받아쓰기">
              <button className="btn btn--sm" onClick={() => pick('pass')}>
                통과
              </button>
              <button className="btn btn--sm" onClick={() => pick('fail')}>
                실패
              </button>
              <button className="btn btn--sm" onClick={() => pick('silent')}>
                무음
              </button>
            </DevStrip>
          )}

          {phase === 'micError' && (
            <DevStrip label="마이크 없음">
              <button className="btn btn--sm" onClick={() => void skipWithoutRecording()}>
                녹음 없이 이 구간 넘기기
              </button>
            </DevStrip>
          )}
        </div>
      </div>
    </Screen>
  )
}
