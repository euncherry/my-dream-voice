/**
 * P-05 [발화] — B모드 전용 · 🎨 디자인 입힘 (2026-11-23 — 새 흐름: 버튼 없음 · 띵 신호 · "준비 완료!" 연습)
 *
 * 근거: docs/P05_SCENARIO.md (흐름 · 대사 · 장면 번호) · PAGE_SPEC P-05 · SPEC §2 · 디자인 시안(발화 화면 — 가운데 카드 안에서 장면이 넘어간다)
 * 대본: p05/script.ts · 따라 말할 문장: shared/jobs.ts · 그림 · 목소리 파일: p05/media.ts · 녹음: p05/voiceRecorder.ts
 *
 * 흐름 (시나리오 §1) — 버튼 없이 저절로 흘러간다
 *   A 인사 · 역할 → B 임무 → C 신호 설명(진짜 띵을 한 번 들려준다) + 짝꿍 시범
 *   → D 연습 "준비 완료!" (반짝 + 띵 → 녹음 — 분석 안 함, 목소리 크기만)
 *   → E 반응 (연습은 한 번만 — 2026-11-24): 크게 = 칭찬 / 작게 = "○○가 너~무 멀리 있나 봐" / 무음 = "아직 못 들었나 봐!"
 *     작게 · 무음은 캐릭터가 "내가 다시 해 볼게! 준비 완료!" 하고 크게 시범을 보인 뒤 넘어간다 (아이에게 다시 시키지 않는다)
 *   → F1 문장 ① (소개 → 이끔이 문장 시범 → 띵 → 녹음 → "잘 듣고 있어요" → 응원, 또는 다시 말하기 1회)
 *   → G 이어 주기 → F2 문장 ② → I 마무리 → P-06
 *   어느 나이든 문장을 한 번에 말한다 (2026-11-24 만 4세 어절 끊기 없앰 — 대신 만 4 · 5 · 6세 이상 문장이 다 다르다).
 *
 * 화면 (시안): 위 제목(직업마다) · 가운데 흰 카드 = [직업 이름 · 진행 점] + 장면 그림(넘어간다) + 그림 안 자막 + 그림 아래 큰 글씨
 *   큰 글씨 = 아이가 따라 말할 말 ("준비 완료!" · 그 문장). 안내 대사 동안은 비운다.
 *   아래 알약 = 누르지 않는 마이크 표시 (시안의 [말하기 시작] 자리 — 버튼은 없앴다): 먼저 들어 봐요 → 녹음 중(빨간 마이크 + 실제 목소리 파형) → 잘 듣고 있어요
 *   마이크를 못 켜면 그 자리가 [다시 시도] 버튼이 된다 (직원용 — M-02 안내와 같이).
 *
 * ⚠️ CLAUDE.md 금지사항
 *   2 — WAV 저장 · 받아쓰기는 메인(window.api)
 *   5 — 마이크 DSP 전부 false (voiceRecorder)
 *   6 — 녹음 중에는 어떤 소리도 내지 않는다: 띵이 끝난 뒤 녹음을 시작하고, 녹음 동안 muteClips로 잠근다
 *   7 · 8 — 인식률 · 받아쓴 글자 · 목소리 크기 숫자는 화면 어디에도 내보내지 않는다 (개발용 띠 포함).
 *           아이에게는 응원 · "한 번 더 듣고 싶대"만 들린다
 *
 * ⚠️ MOCK — 받아쓰기는 아직 src/main/mock/stt.ts 다 (스토어의 mockStt · 개발용 띠의 통과/실패/무음).
 * ⚠️ 그림 · 목소리 파일이 없으면 임시 판(장면 번호 + 설명)과 자막만 — 파일을 넣으면 바뀐다 (assets/p05/README.md).
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { BackButton } from '../components/BackButton'
import { DevStrip, Screen } from '../components/Screen'
import { Stage } from '../components/Stage'
import { justChangedScreen, useSession } from '../store/session'
import { stopAll } from '../audio/playback'
import { muteClips, playClip, stopClips } from '../audio/clips'
import { DSP_OFF } from '../audio/useAudioCapture'
import {
  BEAT_GAP_MS,
  DING_TO_RECORD_MS,
  RECORD_MAX_LINE_MS,
  RECORD_MAX_WORD_MS,
  RETRY_MIN_RECOGNITION,
  STT_MAX_WAIT_MS,
  STT_MIN_SHOW_MS,
  SUBTITLE_MIN_MS,
  SUBTITLE_MS_PER_CHAR,
  VOICE_LOUD_DB,
} from '@shared/constants'
import { jobLabel, scenarioFor } from '@shared/jobs'
import type { AgeGroup, JobId, MockSttOutcome, SpeechLine, SpeechPart, SttRequest } from '@shared/types'
import { COMMON, SCRIPTS, lineScene, partnerOf, sceneId, type Kid, type LayeredScene, type SceneProp, type Who } from '../p05/script'
import {
  DING_URL,
  layerUrl,
  measurePanel,
  measureSprite,
  panelOf,
  preloadLayers,
  preloadScenes,
  sceneUrl,
  spriteOf,
  voiceUrl,
  type ScenePanel,
  type SpriteBox,
} from '../p05/media'
import { FLOOR_DB, VoiceRecorder, type RecordResult } from '../p05/voiceRecorder'
import skyUrl from '../assets/bg/sky.webp'
import logoEnUrl from '../assets/brand/logo-en.png'
import starYellowUrl from '../assets/deco/star-yellow.png'
import '../styles/p05.css'

/** 아래 마이크 알약의 모습 */
type MicState =
  | 'wait' // 캐릭터가 말하는 중 — "먼저 들어 봐요"
  | 'demo' // 신호 설명 때 진짜 띵을 들려줌 — 반짝이지만 녹음은 안 한다
  | 'live' // 띵 → 녹음 중 — "지금 말해요!" (반짝)
  | 'listening' // 받아쓰기 기다림 — "잘 듣고 있어요"
  | 'error' // 마이크를 못 켰다 — [다시 시도]

/** 진행 점 — 연습 / 문장 ① / 문장 ② */
type Progress = 'practice' | 0 | 1

/** 그림 아래 큰 글씨 — 따라 말할 말 (만 4세는 어절마다 나뉜다) */
interface Big {
  words: string[]
  /** 지금 따라 할 어절 — 만 4세만 */
  current: number | null
}

/**
 * 그림 칸 아래 진행 바 — 칸으로 나뉜다. 튜토리얼(인사 ~ "준비 완료!" 연습 반응)과 문장 2개를 따로 센다:
 * 연습이 끝나면 바가 비워지고 문장 바가 새로 시작한다 (2026-11-23 지정).
 * 다시 하기(09 · 11 · 문장 다시 듣기)와 만 4세 어절은 칸을 넘기지 않는다.
 */
const BAR_STEPS = { tutorial: 7, story: 6 } as const

interface Bar {
  part: keyof typeof BAR_STEPS
  /** 채워진 칸 수 (지금 보이는 단계까지) */
  done: number
}

interface View {
  /** 장면 번호 뒤 두 자리 ('01' ~ '14' · '10b' · '13b') */
  scene: string
  /** 그림 안 자막 — 캐릭터가 지금 하는 말 */
  subtitle: string | null
  /** 지금 말하는 아이 — 말풍선 꼬리가 그 아이를 가리킨다 */
  who: Who | null
  big: Big | null
  mic: MicState
  progress: Progress
  bar: Bar
  /** 개발용 — 흐름 확인 스크립트가 읽는다 (data-step) */
  step: string
}

/** 개발용 — 다음 녹음의 목소리 크기를 정해 버린다 (마이크 없는 PC · 가짜 마이크로 갈래 확인) */
type VoiceForce = 'auto' | 'loud' | 'quiet' | 'silent'

/**
 * 녹음 한 번의 결과.
 * ⚠️ 화면에 내보내지 않는다 — state가 아니라 ref에만 둔다 (CLAUDE.md 금지사항 7 · 8).
 */
interface Attempt {
  /** 저장한 WAV. 말소리가 없었으면 없다 */
  wav?: string
  silent: boolean
  transcript?: string
  cer?: number
}

interface At {
  turn: 0 | 1
  part: number
}

/** 화면을 떠나 흐름을 멈출 때 던진다 */
class Stopped extends Error {}

/** 자막이 이 글자 수(띄어쓰기 빼고)보다 길면 글자를 조금 줄여 두 줄 안에 넣는다 (styles/p05.css data-long) */
const SUBTITLE_LONG_CHARS = 36

/** 장면 그림 칸의 폭 (styles/p05.css .p05-frame) */
const FRAME_W = 1338

/** 대사 없는 첫 장면 '00'을 보여 주는 시간 (2026-11-24 지정 — "0.5초 뒤 원래 장면으로") */
const OPENING_MS = 500

/**
 * 레이어 장면의 인물 자리 — 판 기준 비율 (A-01 완성 그림에서 잰 값).
 *   CAST_CX: 헬멧 가운데의 가로 자리 · BODY_H: 헬멧 꼭대기 ~ 발끝 키 (판 높이 대비 — 1보다 커서 헬멧이 판 위로 튀어나온다)
 *   FEET: 발끝의 세로 자리 (판 높이 대비)
 *   장면마다 `cast`로 바꿀 수 있다 — A-04부터 두 아이가 살짝 멀어져 가운데에 마이크 자리 (2026-11-26)
 */
const CAST_CX = { girl: 0.36, boy: 0.595 } as const
const BODY_H = 1.085
const FEET = 0.965

/** 인물 포즈가 바뀔 때 겹쳐 바뀌는 시간 (styles/p05.css p05-sprite-in · out 과 맞춘다) */
const POSE_FADE_MS = 320

/** 녹음 중 파형 — 막대 수 · 한 막대의 시간 · 높이로 바꾸는 소리 크기 범위(dBFS) · 조용할 때 높이 */
const WAVE_BARS = 21
const WAVE_STEP_MS = 50
const WAVE_MIN_DB = -60
const WAVE_MAX_DB = -12
const WAVE_FLOOR = 0.1

/** M-02에 띄우는 문구 — 아이가 읽어도 무섭지 않게 */
const MIC_MESSAGE = '마이크를 준비하고 있어요. 옆의 직원에게 알려주세요!'

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
 * 한쪽만 받아쓰기가 있으면 받아쓰기가 있는 쪽 (V2_BUILD_CHECKLIST §2 — P-07 정밀 분석이 같이 쓴다).
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

/** 목소리 파일이 없을 때 자막을 보여 주는 시간 */
function subtitleMs(text: string): number {
  return Math.max(SUBTITLE_MIN_MS, text.replace(/\s/g, '').length * SUBTITLE_MS_PER_CHAR)
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
  const back = useSession((s) => s.back)
  const setFallback = useSession((s) => s.setFallback)
  const mockStt = useSession((s) => s.mockStt)

  const script = SCRIPTS[job]
  const scenario = useMemo(() => scenarioFor(job, ageGroup), [job, ageGroup])

  const [view, setView] = useState<View>({
    scene: SCRIPTS[job].layered?.['00'] ? '00' : '01',
    subtitle: null,
    who: null,
    big: null,
    mic: 'wait',
    progress: 'practice',
    bar: { part: 'tutorial', done: 0 },
    step: 'start',
  })
  /** MOCK: 개발용 받아쓰기 결과 버튼이 떠 있는가 */
  const [pickOpen, setPickOpen] = useState(false)
  const [voiceForce, setVoiceForce] = useState<VoiceForce>('auto')

  const recorderRef = useRef<VoiceRecorder | null>(null)
  if (!recorderRef.current) recorderRef.current = new VoiceRecorder()
  /** 지금 돌고 있는 흐름 — 화면을 떠나면 alive = false */
  const runRef = useRef<{ alive: boolean } | null>(null)
  const timersRef = useRef(new Set<number>())
  /** 녹음 중 · 받아쓰기 중 — [뒤로]를 받지 않는다 */
  const busyRef = useRef(false)
  /** 구간마다 쌓는 결과 — 세션에 적는다 */
  const speechRef = useRef<SpeechLine[]>([])
  /** 지금 구간의 녹음들 (최대 2번) — ⚠️ 화면에 내보내지 않는다 */
  const attemptsRef = useRef<Attempt[]>([])
  /** 저장해 둔 WAV — [뒤로]로 나가면 지운다 */
  const savedRef = useRef(new Set<string>())
  const pickRef = useRef<((outcome: MockSttOutcome) => void) | null>(null)
  const micChoiceRef = useRef<((choice: 'retry' | 'skip') => void) | null>(null)
  const voiceForceRef = useRef<VoiceForce>('auto')
  const micRef = useRef<HTMLDivElement>(null)
  const lineRef = useRef<HTMLParagraphElement>(null)

  voiceForceRef.current = voiceForce

  /** 녹음 중 파형 — 막대마다 지나간 소리 크기 (오른쪽이 지금). 다시 그리지 않고 막대 높이만 바꾼다 */
  const waveRef = useRef({ bars: new Array<number>(WAVE_BARS).fill(0), peak: FLOOR_DB, at: 0 })

  function drawWave(): void {
    const bars = micRef.current?.querySelectorAll<HTMLElement>('.p05-wave i')
    bars?.forEach((el, i) => {
      const h = Math.max(WAVE_FLOOR, waveRef.current.bars[i] ?? 0)
      el.style.transform = `scaleY(${h.toFixed(3)})`
    })
  }

  /** 소리 크기(dBFS · 20ms마다) → 50ms마다 가장 큰 값을 막대 하나로 */
  function paintLevel(db: number): void {
    const w = waveRef.current
    w.peak = Math.max(w.peak, db)
    const now = performance.now()
    if (now - w.at < WAVE_STEP_MS) return
    w.at = now
    const h = Math.min(1, Math.max(0, (w.peak - WAVE_MIN_DB) / (WAVE_MAX_DB - WAVE_MIN_DB)))
    w.peak = FLOOR_DB
    w.bars.push(Math.sqrt(h))
    w.bars.shift()
    drawWave()
  }

  function resetWave(): void {
    waveRef.current = { bars: new Array<number>(WAVE_BARS).fill(0), peak: FLOOR_DB, at: 0 }
    drawWave()
  }

  /** 흐름을 멈추고 소리 · 마이크 · 타이머를 정리한다 (화면을 떠날 때 · [뒤로]) */
  function stopFlow(): void {
    if (runRef.current) runRef.current.alive = false
    timersRef.current.forEach((id) => window.clearTimeout(id))
    timersRef.current.clear()
    pickRef.current = null
    micChoiceRef.current = null
    stopClips()
    muteClips(false)
    recorderRef.current?.close()
    busyRef.current = false
  }

  // ────────────────────────────────────────────────
  // 흐름 — 버튼 없이 저절로 (시나리오 §1)
  // ────────────────────────────────────────────────

  async function flow(run: { alive: boolean }): Promise<void> {
    const recorder = recorderRef.current!
    const L = script.lines
    /** 말하는 아이 — 이끔(문장을 들려주는 쪽) · 짝꿍(아이 편) */
    const LEAD: Who = script.lead
    const PARTNER: Who = partnerOf(script.lead)
    const older = ageGroup === '6+'

    const check = (): void => {
      if (!run.alive) throw new Stopped()
    }
    const set = (change: Partial<View>): void => {
      check()
      setView((v) => ({ ...v, ...change }))
    }
    const sleep = (ms: number): Promise<void> =>
      new Promise<void>((resolve) => {
        const id = window.setTimeout(() => {
          timersRef.current.delete(id)
          resolve()
        }, ms)
        timersRef.current.add(id)
      }).then(check)

    /** 캐릭터 대사 하나 — 장면 + 자막 + 목소리(없으면 자막 시간만) */
    async function say(scene: string, text: string, key: string, who: Who): Promise<void> {
      set({ scene, subtitle: text, who, mic: 'wait', step: key })
      await playClip(voiceUrl(job, key), subtitleMs(text)).done
      check()
      await sleep(BEAT_GAP_MS)
    }

    /** 마이크를 연다 — 못 열면 M-02 + [다시 시도]. 개발용 [녹음 없이 넘기기]면 false */
    async function ensureMic(): Promise<boolean> {
      while (!recorder.isOpen) {
        try {
          await recorder.open()
          check()
        } catch (e) {
          check()
          setFallback({ kind: 'device', message: MIC_MESSAGE, detail: (e as Error).message })
          set({ mic: 'error', subtitle: null, step: 'micError' })
          const choice = await new Promise<'retry' | 'skip'>((resolve) => {
            micChoiceRef.current = resolve
          })
          micChoiceRef.current = null
          check()
          setFallback(null)
          if (choice === 'skip') return false
        }
      }
      return true
    }

    /** 아이 차례 — 반짝 + 띵 → 녹음 (조용해지면 저절로 끝). 마이크 없이 넘겼으면 null */
    async function childTurn(maxMs: number, step: string): Promise<RecordResult | null> {
      if (!(await ensureMic())) return null
      set({ scene: '06', subtitle: null, mic: 'live', step: `${step}:ding` })
      await playClip(DING_URL, 600).done
      check()
      await sleep(DING_TO_RECORD_MS)

      // ⚠️ 금지사항 6 — 녹음 전에 모든 소리를 멈추고, 끝날 때까지 잠근다
      stopAll()
      stopClips()
      muteClips(true)
      busyRef.current = true
      set({ step: `${step}:rec` })
      let result: RecordResult
      try {
        result = await recorder.record({ maxMs, onLevel: paintLevel })
      } finally {
        muteClips(false)
        resetWave()
      }
      check()
      if (result.end === 'cancel') throw new Stopped()

      // 개발용 — 목소리 크기를 정해 버린다 (가짜 마이크는 늘 같은 소리라 갈래를 못 본다)
      switch (voiceForceRef.current) {
        case 'loud':
          return { ...result, voiced: true, peakDb: 0 }
        case 'quiet':
          return { ...result, voiced: true, peakDb: VOICE_LOUD_DB - 10 }
        case 'silent':
          return { ...result, voiced: false, peakDb: FLOOR_DB }
        default:
          return result
      }
    }

    /** "준비 완료!" 연습 — 목소리 크기로만 (받아쓰기 · 저장 안 함) */
    async function practice(): Promise<'loud' | 'quiet' | 'silent'> {
      const r = await childTurn(RECORD_MAX_WORD_MS, 'practice')
      busyRef.current = false
      if (!r) return 'loud' // 마이크 없이 넘김 (개발용)
      if (!r.voiced) return 'silent'
      return r.peakDb >= VOICE_LOUD_DB ? 'loud' : 'quiet'
    }

    /** 녹음 저장 → 받아쓰기. 시간 초과 · 실패는 통과로 본다 (cer 없음) */
    async function listenTo(result: RecordResult, at: At): Promise<Attempt> {
      // 말소리가 없었다 — 무음 (저장하지 않는다)
      if (!result.voiced || result.pcm.length === 0) return { silent: true }

      const lineParts = scenario.turns[at.turn].line.parts
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
        savedRef.current.add(wav)
      } catch (e) {
        // 저장하지 못했으면 남길 녹음이 없다 — 무음과 같이 다룬다 (한 번 더 말할 기회를 준다)
        console.error('[P-05] 녹음 저장 실패', e)
        return { silent: true }
      }
      check()

      let deadlineId = 0
      const timeout = new Promise<'timeout'>((resolve) => {
        deadlineId = window.setTimeout(() => resolve('timeout'), STT_MAX_WAIT_MS)
        timersRef.current.add(deadlineId)
      })
      try {
        // MOCK: 받아쓰기 프로그램(faster-whisper)이 붙기 전까지 결과를 스토어의 mockStt로 정한다.
        //       실제 프로그램은 mock 필드를 무시한다 — 붙으면 이 갈래(manual 버튼 포함)를 걷어 낸다.
        const mode = useSession.getState().mockStt
        let mock: NonNullable<SttRequest['mock']>
        if (mode === 'manual') {
          // 개발용 버튼(통과 / 실패 / 무음)을 누를 때까지 기다린다
          const picked = await Promise.race([
            new Promise<MockSttOutcome>((resolve) => {
              pickRef.current = resolve
              setPickOpen(true)
            }),
            timeout,
          ])
          if (picked === 'timeout') return { wav, silent: false }
          mock = { outcome: picked, skipSilenceCheck: true }
        } else {
          // 무음 검사는 메인이 실제로 한다
          mock = { outcome: mode }
        }

        const text = scenario.turns[at.turn].line.parts[at.part]?.text ?? ''
        const answer = await Promise.race([
          window.api.stt.transcribe({ wavPath: wav, targetText: text, mock }).catch((e: unknown) => {
            console.error('[P-05] 받아쓰기 실패', e)
            return 'failed' as const
          }),
          timeout,
        ])
        if (answer === 'timeout' || answer === 'failed') return { wav, silent: false }
        return { wav, silent: answer.silent, transcript: answer.transcript, cer: answer.cer }
      } finally {
        window.clearTimeout(deadlineId)
        timersRef.current.delete(deadlineId)
        pickRef.current = null
        if (run.alive) setPickOpen(false)
      }
    }

    /** 문장(또는 어절) 녹음 한 번 — 띵 → 녹음 → "잘 듣고 있어요". 마이크 없이 넘겼으면 null */
    async function attempt(at: At, maxMs: number): Promise<Attempt | null> {
      const r = await childTurn(maxMs, `line${at.turn + 1}-${at.part + 1}`)
      if (!r) {
        busyRef.current = false
        return null
      }
      set({ mic: 'listening', step: `line${at.turn + 1}-${at.part + 1}:listening` })
      const shownAt = performance.now()
      try {
        const a = await listenTo(r, at)
        check()
        // "잘 듣고 있어요"는 최소 STT_MIN_SHOW_MS 는 보여 준다
        const rest = STT_MIN_SHOW_MS - (performance.now() - shownAt)
        if (rest > 0) await sleep(rest)
        return a
      } finally {
        busyRef.current = false
      }
    }

    /** 구간 마무리 — 더 나은 녹음만 남기고 세션에 적는다 */
    async function finishPart(at: At): Promise<void> {
      const attempts = attemptsRef.current
      attemptsRef.current = []
      const { keep, drop } = chooseAttempt(attempts)
      // 안 쓰는 녹음은 바로 지운다 (둘 다 무음이면 저장된 것이 없다)
      await Promise.all(
        drop.map(async (a) => {
          if (!a.wav) return
          savedRef.current.delete(a.wav)
          try {
            await window.api.recording.deleteWav(a.wav)
          } catch (e) {
            console.error('[P-05] 안 쓰는 녹음 삭제 실패', e)
          }
        }),
      )
      check()

      const line = scenario.turns[at.turn].line
      const text = line.parts[at.part]?.text ?? line.text
      const retried = attempts.length > 1
      const part: SpeechPart = keep
        ? { text, wav: keep.wav, transcript: keep.transcript, cer: keep.cer, retried }
        : { text, retried }
      const lines = speechRef.current.slice()
      lines[at.turn] = { line: line.text, parts: [...(lines[at.turn]?.parts ?? []), part] }
      speechRef.current = lines
      patch({ speech: lines })
    }

    // 레이어 그림(배경 · 인물)을 미리 재 둔다 — 처음 장면이 비지 않게 (오래 걸려도 2초까지만 기다린다)
    await Promise.race([preloadLayers(job), sleep(2_000)])
    check()
    // ── 대사 없는 첫 장면 '00' (있으면) — 둘이 이야기하다가 0.5초 뒤 아이를 돌아보며 인사 ──
    if (script.layered?.['00']) {
      set({ scene: '00', subtitle: null, step: 'opening' })
      await sleep(OPENING_MS)
    }

    // ── A · B · C — 인사 · 역할 · 임무 · 신호 설명 + 시범 ──
    set({ bar: { part: 'tutorial', done: 1 } })
    await say('01', L.hello, 'hello', LEAD)
    set({ bar: { part: 'tutorial', done: 2 } })
    await say('02', L.role, 'role', PARTNER)
    set({ bar: { part: 'tutorial', done: 3 } })
    // 임무 — 길면 자막 여러 개로 나뉜다 (진행 바는 한 칸 그대로)
    const mission = typeof L.mission === 'string' ? [{ text: L.mission }] : L.mission
    for (const [i, part] of mission.entries()) {
      await say(part.scene ?? '03', part.text, mission.length > 1 ? `mission-${i + 1}` : 'mission', LEAD)
    }
    set({ bar: { part: 'tutorial', done: 4 } })
    await say('04', COMMON.signal, 'signal', LEAD)
    // 진짜 띵을 한 번 들려준다 — 마이크가 반짝이지만 녹음은 하지 않는다
    set({ mic: 'demo', step: 'signal:ding' })
    await playClip(DING_URL, 600).done
    check()
    await sleep(600)
    // 목소리 게이지 소개 (게이지가 있는 직업만) — 짝꿍이 게이지를 가리킨다 · 마이크는 계속 빛난다 (진행 바는 그대로)
    if (L.gauge) await say('04-2', L.gauge, 'gauge', PARTNER)
    set({ bar: { part: 'tutorial', done: 5 } })
    await say('05', COMMON.demo, 'demo', PARTNER)

    // ── D · E — "준비 완료!" 연습 ──
    set({ progress: 'practice', big: { words: [COMMON.practiceWord], current: null }, bar: { part: 'tutorial', done: 6 } })
    await say('06', COMMON.practice, 'practice', LEAD)
    // 연습은 한 번만 — 작거나 무음이어도 다시 시키지 않는다 (2026-11-24 사용자 결정).
    // 반응만 하고 넘어간다: 작게 · 무음이면 캐릭터가 "내가 다시 해 볼게! 준비 완료!" 하고 크게 시범을 보인다
    // TODO(목소리 게이지): 작게 · 무음 반응 끝에 캐릭터 외침과 함께 게이지가 꽉 차오르게 (docs/P05_SCENARIO.md 우주비행사)
    const voice = await practice()
    set({ bar: { part: 'tutorial', done: 7 } })
    if (voice === 'loud') await say('07', L.loud, 'loud', PARTNER)
    else if (voice === 'quiet') await say('08', L.quiet, 'quiet', PARTNER)
    else await say('09', L.silent, 'silent', LEAD)
    set({ big: null })

    // ── F1 · G · F2 — 문장 2개 ──
    let cheer = 0
    for (const turn of [0, 1] as const) {
      if (turn === 1) {
        set({ bar: { part: 'story', done: 3 } })
        await say('12', L.bridge, 'bridge', PARTNER)
      }

      const line = scenario.turns[turn].line
      // 문장 바 — 연습이 끝나면 비워지고 새로 시작한다 (문장 ① = 1칸 · 문장 ② = 4칸)
      set({ progress: turn, big: { words: [line.text], current: null }, bar: { part: 'story', done: turn === 0 ? 1 : 4 } })
      await say(turn === 0 ? '10' : '13', COMMON.intro[turn], `intro${turn + 1}`, LEAD)

      const demoScene = lineScene(job, turn, older)
      // 구간은 늘 하나(문장 전체)다 — 구간 모양은 녹음 · 리포트 데이터와 맞추려고 그대로 둔다
      for (let p = 0; p < line.parts.length; p++) {
        const at: At = { turn, part: p }
        const text = line.parts[p]!.text
        // 문장 목소리 파일 — 나이마다 문장이 다르다: line1-4 · line1-5 · line1-6
        const key = `line${turn + 1}-${ageGroup === '6+' ? '6' : ageGroup}`

        attemptsRef.current = []
        await say(demoScene, text, key, LEAD)
        const first = await attempt(at, RECORD_MAX_LINE_MS)
        if (first) attemptsRef.current.push(first)

        // 첫 녹음이 통과하지 못했으면 다시 말하기 — 구간마다 1번만. 무음도 통과 못 함이다
        if (first && !passes(first)) {
          await say('11', L.retry, 'retry', PARTNER)
          await say('11', COMMON.retryLead, 'retry-lead', LEAD)
          await say(demoScene, text, key, LEAD)
          const second = await attempt(at, RECORD_MAX_LINE_MS)
          if (second) attemptsRef.current.push(second)
        }
        await finishPart(at)
      }

      const n = cheer++ % COMMON.cheers.length
      set({ bar: { part: 'story', done: turn === 0 ? 2 : 5 } })
      await say('07', COMMON.cheers[n]!, `cheer${n + 1}`, PARTNER)
      set({ big: null })
    }

    // ── I — 마무리 → P-06 ──
    set({ bar: { part: 'story', done: 6 } })
    await say('14', L.outro, 'outro', 'both')
    set({ step: 'leaving' })
    next()
  }

  useEffect(() => {
    const run = { alive: true }
    runRef.current = run
    preloadScenes(job)
    flow(run).catch((e: unknown) => {
      if (!(e instanceof Stopped)) console.error('[P-05] 흐름 오류', e)
    })
    return stopFlow
    // 직업 · 연령은 이 화면에 있는 동안 바뀌지 않는다 — 한 번만 돈다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** [← 뒤로] → P-04 [직업 선택]. 그때까지의 녹음은 지운다. 녹음 · 받아쓰기 중에는 받지 않는다 */
  function leave(): void {
    if (justChangedScreen() || busyRef.current) return
    stopFlow()
    setFallback(null)
    for (const path of savedRef.current) {
      void window.api.recording.deleteWav(path).catch(() => undefined)
    }
    savedRef.current.clear()
    speechRef.current = []
    patch({ speech: undefined })
    back()
  }

  function pick(outcome: MockSttOutcome): void {
    const resolve = pickRef.current
    pickRef.current = null
    setPickOpen(false)
    resolve?.(outcome)
  }

  function micChoice(choice: 'retry' | 'skip'): void {
    micChoiceRef.current?.(choice)
  }

  // ── 그림 아래 큰 글씨 — 한 줄에 들어가게 글자 크기를 줄인다 ──
  const bigKey = view.big ? view.big.words.join(' ') : ''
  useLayoutEffect(() => {
    const el = lineRef.current
    if (!el) return
    el.style.fontSize = ''
    if (!bigKey) return
    const room = el.clientWidth
    const need = el.scrollWidth
    if (need > room) {
      const base = parseFloat(getComputedStyle(el).fontSize)
      el.style.fontSize = `${Math.floor(base * (room / need) * 0.98)}px`
    }
  }, [bigKey])

  const { title } = script
  const busy = view.mic === 'live' || view.mic === 'listening'

  return (
    <Screen id="P-05" designed>
      <div className="p05" data-step={view.step} data-mic={view.mic}>
        <Stage background={skyUrl}>
          <img className="p05-logo" src={logoEnUrl} alt="MY DREAM VOICE" draggable={false} />

          <BackButton onClick={leave} disabled={busy} />

          <img className="p05-star" src={starYellowUrl} alt="" draggable={false} />

          <h1 className="p05-title">
            {title.before}
            <span className="p05-title__em">
              <TitleMark />
              <span className="p05-title__text">{title.em}</span>
            </span>
            {title.after}
          </h1>
          <p className="p05-sub">먼저 듣고, 따라 말해 봐요</p>

          <section className="p05-card" data-big={view.big ? 'true' : 'false'}>
            <span className="p05-chip">{jobLabel(job)}</span>
            <ProgressDots progress={view.progress} />

            <div
              className="p05-frame"
              data-gauge={SCRIPTS[job].layered?.[view.scene]?.gauge !== undefined ? 'true' : undefined}
            >
              <SceneFrame job={job} scene={view.scene} />
              <StepBar bar={view.bar} />
              {view.subtitle && (
                <SpeechBubble
                  key={view.step}
                  text={view.subtitle}
                  who={view.who}
                  cast={SCRIPTS[job].layered?.[view.scene]?.cast}
                />
              )}
            </div>

            <p className="p05-line" ref={lineRef} aria-live="polite">
              {view.big && <BigLine big={view.big} />}
            </p>
          </section>

          <MicPill state={view.mic} micRef={micRef} onRetry={() => micChoice('retry')} />
        </Stage>

        {/* 개발용 — 손님 화면에는 없다. ⚠️ 인식률 · 받아쓴 글자 · 목소리 크기 숫자는 여기에도 띄우지 않는다 */}
        <div className="p05-dev">
          <DevStrip label={`P-05 · ${view.step}`}>
            <span>목소리:</span>
            {(['auto', 'loud', 'quiet', 'silent'] as const).map((v) => (
              <button
                key={v}
                className={`btn btn--sm${voiceForce === v ? ' btn--primary' : ''}`}
                onClick={() => setVoiceForce(v)}
              >
                {VOICE_FORCE_LABEL[v]}
              </button>
            ))}
            <span>· 받아쓰기 mock: {mockStt}</span>
            {pickOpen && (
              <>
                <button className="btn btn--sm" onClick={() => pick('pass')}>
                  통과
                </button>
                <button className="btn btn--sm" onClick={() => pick('fail')}>
                  실패
                </button>
                <button className="btn btn--sm" onClick={() => pick('silent')}>
                  무음
                </button>
              </>
            )}
            {view.mic === 'error' && (
              <button className="btn btn--sm" onClick={() => micChoice('skip')}>
                녹음 없이 넘기기
              </button>
            )}
          </DevStrip>
        </div>
      </div>
    </Screen>
  )
}

const VOICE_FORCE_LABEL: Record<VoiceForce, string> = {
  auto: '실제',
  loud: '크게',
  quiet: '작게',
  silent: '무음',
}

/** 제목의 강조 낱말 밑에 깔리는 분홍 붓질 — P-03 · P-04 제목과 같은 그림 */
function TitleMark(): ReactNode {
  return (
    <svg className="p05-title__mark" viewBox="0 0 290 56" aria-hidden="true" focusable="false">
      <path d="M7 31C8 18 17 9 32 8L262 2c14-.5 23 6 23 17 0 13-9 24-22 25L150 45 44 52C20 53 6 45 7 31Z" />
    </svg>
  )
}

/** 그림 칸 아래 진행 바 — 칸 수 = 그 부분의 단계 수. 튜토리얼에서 문장으로 넘어가면 key가 바뀌어 비워진 채 새로 그려진다 */
function StepBar({ bar }: { bar: Bar }): ReactNode {
  const total = BAR_STEPS[bar.part]
  return (
    <div className="p05-bar" key={bar.part} data-part={bar.part} aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <i key={i} data-on={i < bar.done} />
      ))}
    </div>
  )
}

/** 오른쪽 위 진행 — 점 2개 + "문장 1 / 2" (연습 동안은 "연습") */
function ProgressDots({ progress }: { progress: Progress }): ReactNode {
  const done = progress === 'practice' ? 0 : progress + 1
  return (
    <div className="p05-progress">
      <span className="p05-progress__dots" aria-hidden="true">
        <i data-on={done >= 1} />
        <i data-on={done >= 2} />
      </span>
      <span className="p05-progress__label">
        {progress === 'practice' ? '연습' : `문장 ${progress + 1} / 2`}
      </span>
    </div>
  )
}

/**
 * 장면 그림 — 바뀔 때 옆으로 넘어간다 (새 그림이 오른쪽에서 들어오고, 앞 그림은 왼쪽으로 나간다).
 * 그림 파일이 없으면 장면 번호 + 장면 설명을 적은 임시 판.
 */
/** 넘기기 단위 — 레이어 장면은 배경, 그 밖은 장면 번호. 같으면 넘기지 않고 그 자리에서 바꾼다 */
function slideKey(job: JobId, scene: string): string {
  const bg = SCRIPTS[job].layered?.[scene]?.bg
  return bg ? `bg:${bg}` : `scene:${scene}`
}

function SceneFrame({ job, scene }: { job: JobId; scene: string }): ReactNode {
  const [layers, setLayers] = useState([{ scene, key: slideKey(job, scene), n: 0 }])

  useEffect(() => {
    setLayers((ls) => {
      const last = ls[ls.length - 1]!
      if (last.scene === scene) return ls
      const key = slideKey(job, scene)
      // 같은 배경 — 넘기지 않고 인물 포즈만 바꾼다
      if (last.key === key) return [...ls.slice(0, -1), { ...last, scene }]
      return [last, { scene, key, n: last.n + 1 }]
    })
  }, [job, scene])

  useEffect(() => {
    if (layers.length < 2) return
    const id = window.setTimeout(() => setLayers((ls) => ls.slice(-1)), 560)
    return () => window.clearTimeout(id)
  }, [layers])

  return (
    <div className="p05-scene">
      {layers.map((layer, i) => (
        <SceneArt
          key={layer.n}
          job={job}
          scene={layer.scene}
          motion={layers.length > 1 ? (i === 0 ? 'leave' : 'enter') : undefined}
        />
      ))}
    </div>
  )
}

function SceneArt({
  job,
  scene,
  motion,
}: {
  job: JobId
  scene: string
  motion?: 'enter' | 'leave'
}): ReactNode {
  const id = sceneId(job, scene)
  const layered = SCRIPTS[job].layered?.[scene]
  if (layered) return <LayeredArt job={job} id={id} def={layered} motion={motion} />
  return <FlatArt job={job} scene={scene} id={id} motion={motion} />
}

/** 장면 그림 한 장(꽉 찬 그림 · 튀어나오는 그림) 또는 임시 판 */
function FlatArt({
  job,
  scene,
  id,
  motion,
}: {
  job: JobId
  scene: string
  id: string
  motion?: 'enter' | 'leave'
}): ReactNode {
  const url = sceneUrl(job, id)
  const className = `p05-scene__art${motion ? ` is-${motion}` : ''}`
  // 그림 안 판의 자리 — undefined = 재는 중 · null = 꽉 찬 그림
  const [panel, setPanel] = useState<ScenePanel | null | undefined>(() =>
    url ? panelOf(url) : null,
  )

  useEffect(() => {
    if (!url || panel !== undefined) return
    let alive = true
    measurePanel(url)
      .then((p) => {
        if (alive) setPanel(p)
      })
      .catch(() => {
        if (alive) setPanel(null)
      })
    return () => {
      alive = false
    }
  }, [url, panel])

  if (url && panel) {
    // 튀어나오는 그림 — 판을 그림 칸에 맞춘다. 판 위로 튀어나온 머리 · 로켓 끝은 칸 위(흰 카드 안)로 보이고,
    // 판이 칸(3.1 : 1)보다 높으면 아래가 잘린다
    const k = FRAME_W / (panel.right - panel.left)
    return (
      <img
        className={`${className} p05-scene__art--pop`}
        src={url}
        alt=""
        draggable={false}
        data-scene={id}
        style={{ left: -panel.left * k, top: -panel.top * k, width: panel.width * k }}
      />
    )
  }
  if (url && panel === null) {
    return <img className={className} src={url} alt="" draggable={false} data-scene={id} />
  }
  // 판을 재는 동안 (처음 한 번 · 아주 잠깐) — 빈 자리
  if (url) return <span className={className} data-scene={id} />
  return (
    <div className={`${className} p05-scene__ph`} data-scene={id} data-job={job}>
      <strong className="p05-scene__id">{id}</strong>
      <span className="p05-scene__desc">{SCRIPTS[job].scenes[scene] ?? ''}</span>
      <span className="p05-scene__tag">임시 판 · 그림이 오면 바뀝니다</span>
    </div>
  )
}

/**
 * 레이어 장면 — 배경 판을 그림 칸에 맞추고(튀어나오는 그림과 같은 방식), 그 판 위에 두 아이를 세운다.
 * 인물은 헬멧 가운데 · 발끝을 기준으로 놓아, 포즈마다 그림 캔버스가 달라도 같은 자리 · 같은 키로 선다.
 */
function LayeredArt({
  job,
  id,
  def,
  motion,
}: {
  job: JobId
  id: string
  def: LayeredScene
  motion?: 'enter' | 'leave'
}): ReactNode {
  const bgUrl = layerUrl(job, def.bg)
  const [panel, setPanel] = useState<ScenePanel | null | undefined>(() =>
    bgUrl ? panelOf(bgUrl) : null,
  )

  useEffect(() => {
    if (!bgUrl || panel !== undefined) return
    let alive = true
    measurePanel(bgUrl)
      .then((p) => {
        if (alive) setPanel(p)
      })
      .catch(() => {
        if (alive) setPanel(null)
      })
    return () => {
      alive = false
    }
  }, [bgUrl, panel])

  const className = `p05-scene__art p05-scene__art--layered${motion ? ` is-${motion}` : ''}`
  if (!bgUrl || !panel) return <span className={className} data-scene={id} />

  const k = FRAME_W / (panel.right - panel.left)
  const panelH = (panel.bottom - panel.top) * k
  return (
    <div className={className} data-scene={id} data-mic-on={def.micOn ? 'true' : undefined}>
      <img
        className="p05-layer-bg"
        src={bgUrl}
        alt=""
        draggable={false}
        style={{ left: -panel.left * k, top: -panel.top * k, width: panel.width * k }}
      />
      <Props job={job} props={def.props ?? NO_PROPS} panel={panel} k={k} />
      <Sprite
        url={layerUrl(job, def.girl)}
        cx={def.cast?.girl ?? CAST_CX.girl}
        scale={def.scale?.girl ?? 1}
        panelH={panelH}
        who="girl"
      />
      <Sprite
        url={layerUrl(job, def.boy)}
        cx={def.cast?.boy ?? CAST_CX.boy}
        scale={def.scale?.boy ?? 1}
        panelH={panelH}
        who="boy"
      />
      {def.gauge !== undefined && (
        <VoiceGauge
          level={def.gauge}
          shine={def.gaugeShine}
          style={
            def.gaugeBox && {
              left: (def.gaugeBox.cx - def.gaugeBox.w / 2 - panel.left) * k,
              top: (def.gaugeBox.top - panel.top) * k,
              width: def.gaugeBox.w * k,
              height: (def.gaugeBox.bottom - def.gaugeBox.top) * k,
              right: 'auto',
              bottom: 'auto',
            }
          }
        />
      )}
    </div>
  )
}

const NO_PROPS: readonly SceneProp[] = []

type PropItem = { p: SceneProp; fade?: 'in' | 'out' }

/**
 * 소품(로켓 · 별 · 행성) — 배경 위 · 인물 뒤 (2026-11-26).
 * 같은 배경에서 장면이 바뀌면: 같은 이름은 새 자리 · 크기로 스르르 옮겨 가고, 빠진 것은 사라지고, 새것은 나타난다.
 */
function Props({
  job,
  props,
  panel,
  k,
}: {
  job: JobId
  props: readonly SceneProp[]
  panel: ScenePanel
  k: number
}): ReactNode {
  const [items, setItems] = useState<PropItem[]>(() => props.map((p) => ({ p })))

  useEffect(() => {
    setItems((prev) => {
      const now = new Set(props.map((p) => p.name))
      const shown = new Set(prev.filter((it) => it.fade !== 'out').map((it) => it.p.name))
      const leaving = prev
        .filter((it) => !now.has(it.p.name))
        .map((it): PropItem => ({ ...it, fade: 'out' }))
      return [
        ...leaving,
        ...props.map((p): PropItem => (shown.has(p.name) ? { p } : { p, fade: 'in' })),
      ]
    })
  }, [props])

  useEffect(() => {
    if (!items.some((it) => it.fade === 'out')) return
    const id = window.setTimeout(
      () => setItems((its) => its.filter((it) => it.fade !== 'out')),
      POSE_FADE_MS + 40,
    )
    return () => window.clearTimeout(id)
  }, [items])

  return (
    <>
      {items.map(({ p, fade }) => {
        const url = layerUrl(job, p.img ?? p.name)
        if (!url) return null
        return (
          <span
            key={p.name}
            className={`p05-prop${fade ? ` is-${fade}` : ''}`}
            data-prop={p.name}
            data-fx={p.fx}
            data-still={p.still ? 'true' : undefined}
            data-shine={p.shine ? 'true' : undefined}
            style={{ left: (p.cx - panel.left) * k, top: (p.cy - panel.top) * k, width: p.w * k }}
          >
            <img src={url} alt="" draggable={false} />
            {p.fx === 'mic' && <MicGlow job={job} name={p.img ?? p.name} />}
          </span>
        )
      })}
    </>
  )
}

/**
 * 가운데 마이크의 빛나는 그림 — 보통 마이크와 같은 크기로 위에 겹쳐 두고, "띵!" 신호 · 녹음 중에만 보인다
 * (.p05[data-mic=demo|live] — CSS). 그림이 없으면 CSS 빛만
 */
function MicGlow({ job, name }: { job: JobId; name: string }): ReactNode {
  const url = layerUrl(job, `${name}-glow`)
  if (!url) return null
  return <img className="p05-prop__glow" src={url} alt="" draggable={false} />
}

/**
 * 목소리 게이지 — 그림 위 오른쪽에 크게 덮어 그리는 세로 캡슐 (2026-11-26 — 로켓과 따로, 눈에 띄게 · 꼭대기 작은 로켓은 같은 날 뺌).
 * 아래에서부터 차오른다 (0 ~ 1). 모양은 별빛 유리관 + 오른쪽 눈금 5단계 (2026-11-26 사용자가 시안 중 고름 — p05.css).
 * 채우기(아이 차례 A-06 · 연습 반응)는 아직 안 붙였다 — 지금은 늘 빈 채
 */
function VoiceGauge({
  level,
  shine,
  style,
}: {
  level: number
  shine?: boolean
  /** 자리 (장면의 gaugeBox — 없으면 CSS 기본: 그림 오른쪽 끝) */
  style?: CSSProperties | undefined
}): ReactNode {
  const pct = Math.round(Math.min(1, Math.max(0, level)) * 100)
  return (
    <span className="p05-vgauge" data-shine={shine ? 'true' : undefined} style={style} aria-hidden="true">
      <span className="p05-vgauge__tube">
        <span className="p05-vgauge__track">
          <span className="p05-vgauge__fill" style={{ height: `${pct}%` }} />
        </span>
      </span>
    </span>
  )
}

/** 인물 한 명 — 포즈 그림이 바뀌면 새 포즈가 스르르 나타나고 앞 포즈는 사라진다 (아웃싸운드 탈출기의 포즈 전환처럼) */
function Sprite({
  url,
  cx,
  scale,
  panelH,
  who,
}: {
  url: string | undefined
  cx: number
  /** 이 장면에서의 키 배율 (LayeredScene.scale — 기본 1) */
  scale: number
  panelH: number
  who: 'girl' | 'boy'
}): ReactNode {
  const [poses, setPoses] = useState(() => (url ? [{ url, scale, n: 0 }] : []))

  useEffect(() => {
    if (!url) return
    setPoses((ps) => {
      const last = ps[ps.length - 1]
      if (last?.url === url) return last.scale === scale ? ps : [...ps.slice(0, -1), { ...last, scale }]
      return last ? [last, { url, scale, n: last.n + 1 }] : [{ url, scale, n: 0 }]
    })
  }, [url, scale])

  useEffect(() => {
    if (poses.length < 2) return
    const id = window.setTimeout(() => setPoses((ps) => ps.slice(-1)), POSE_FADE_MS + 40)
    return () => window.clearTimeout(id)
  }, [poses])

  return (
    <>
      {poses.map((pose, i) => (
        <SpritePose
          key={pose.n}
          url={pose.url}
          cx={cx}
          scale={pose.scale}
          panelH={panelH}
          who={who}
          fade={poses.length > 1 ? (i === 0 ? 'out' : 'in') : undefined}
        />
      ))}
    </>
  )
}

function SpritePose({
  url,
  cx,
  scale,
  panelH,
  who,
  fade,
}: {
  url: string
  cx: number
  scale: number
  panelH: number
  who: 'girl' | 'boy'
  fade?: 'in' | 'out'
}): ReactNode {
  const [box, setBox] = useState<SpriteBox | undefined>(() => spriteOf(url))

  useEffect(() => {
    if (box) return
    let alive = true
    measureSprite(url)
      .then((b) => {
        if (alive) setBox(b)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [url, box])

  if (!box) return null
  // 키를 판 높이에 맞추고, 헬멧 가운데 · 발끝을 정한 자리에 놓는다
  const s = (BODY_H * scale * panelH) / (box.bottom - box.top)
  return (
    <img
      className={`p05-sprite${fade ? ` is-${fade}` : ''}`}
      data-who={who}
      src={url}
      alt=""
      draggable={false}
      style={{
        left: cx * FRAME_W - box.headCx * s,
        top: FEET * panelH - box.bottom * s,
        width: box.width * s,
      }}
    />
  )
}

/**
 * 그림 안 자막 = 말풍선 — 꼬리가 말하는 아이를 가리키고 테두리 색으로 한 번 더 구분한다 (2026-11-24).
 *   여자아이 분홍 · 남자아이 파랑 · 둘이 같이 보라(꼬리 두 개). 말풍선은 가운데 그대로 — 꼬리만 그 아이 쪽으로.
 * 꼬리 자리는 인물이 서는 자리(CAST_CX)에서 계산한다 — 말풍선의 실제 폭을 재서 그 안에서의 자리로 바꾼다.
 */
function SpeechBubble({
  text,
  who,
  cast,
}: {
  text: string
  who: Who | null
  /** 장면마다 바뀐 인물 자리 (LayeredScene.cast) */
  cast?: { girl?: number; boy?: number }
}): ReactNode {
  const ref = useRef<HTMLParagraphElement>(null)
  const [tails, setTails] = useState<number[]>([])
  const long = text.replace(/\s/g, '').length > SUBTITLE_LONG_CHARS

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !who) {
      setTails([])
      return
    }
    // 말풍선은 left 50% + translate -50% — 실제 왼쪽 끝 = offsetLeft − 폭/2 (그림 칸 기준)
    const left = el.offsetLeft - el.offsetWidth / 2
    const kids: Kid[] = who === 'both' ? ['girl', 'boy'] : [who]
    const margin = 46 // 둥근 모서리에 걸리지 않게
    setTails(
      kids.map((k) =>
        Math.min(el.offsetWidth - margin, Math.max(margin, (cast?.[k] ?? CAST_CX[k]) * FRAME_W - left)),
      ),
    )
  }, [text, who, cast])

  return (
    <p ref={ref} className="p05-subtitle" data-long={long} data-who={who ?? undefined}>
      {tails.map((x, i) => (
        <svg
          key={i}
          className="p05-subtitle__tail"
          style={{ left: x }}
          viewBox="0 0 70 50"
          aria-hidden="true"
          focusable="false"
        >
          {/* 픽셀 그대로(70×50) — y 42~46이 말풍선 테두리(4px) 자리.
              ① 흰 면이 꼬리 안쪽과 그 아래 테두리를 지워 말풍선 안과 하나로 잇고
              ② 선은 테두리 한가운데(y 44)에서 둥글게 끝나 테두리 선에 그대로 녹아든다 */}
          <path className="p05-subtitle__tail-fill" d="M4 44 L35 4 L66 44 L66 47 L4 47 Z" />
          <path className="p05-subtitle__tail-line" d="M4 44 L35 4 L66 44" />
        </svg>
      ))}
      {text}
    </p>
  )
}

/** 그림 아래 큰 글씨 — 따옴표 안에 따라 말할 말. 만 4세는 지금 어절을 진하게 */
function BigLine({ big }: { big: Big }): ReactNode {
  // 한 덩어리로 감싼다 — 줄(p)이 flex라, 낱말마다 따로 놓이면 낱말 사이 띄어쓰기가 사라진다
  return (
    <span className="p05-line__text">
      “
      {big.words.map((word, i) => (
        <span key={`${i}-${word}`}>
          {i > 0 && ' '}
          <span
            className={
              big.current === null
                ? 'p05-word'
                : i === big.current
                  ? 'p05-word is-now'
                  : i < big.current
                    ? 'p05-word is-done'
                    : 'p05-word is-later'
            }
          >
            {word}
          </span>
        </span>
      ))}
      ”
    </span>
  )
}

const MIC_LABEL: Record<Exclude<MicState, 'error'>, string> = {
  wait: '먼저 들어 봐요',
  demo: '띵! 하면 말해요',
  live: '지금 말해요!',
  listening: '잘 듣고 있어요',
}

/**
 * 아래 마이크 알약 — 시안의 [말하기 시작] 자리. 누르는 버튼이 아니다 (버튼 없음 — 2026-11-23).
 * 마이크를 못 켰을 때만 [다시 시도] 버튼이 된다.
 */
function MicPill({
  state,
  micRef,
  onRetry,
}: {
  state: MicState
  micRef: RefObject<HTMLDivElement>
  onRetry: () => void
}): ReactNode {
  if (state === 'error') {
    return (
      <button type="button" className="p05-mic p05-mic--retry" onClick={onRetry}>
        <span className="p05-mic__label">다시 시도</span>
        <span className="p05-mic__icon" aria-hidden="true">
          <MicIcon />
        </span>
      </button>
    )
  }
  return (
    <div className="p05-mic" data-state={state} ref={micRef} role="status" aria-label={MIC_LABEL[state]}>
      {/* 녹음 중에는 글자 대신 실제 목소리 파형 — 소리가 들어가고 있는지 눈으로 본다 */}
      <span className="p05-wave" aria-hidden="true">
        {Array.from({ length: WAVE_BARS }, (_, i) => (
          <i key={i} />
        ))}
      </span>
      <span className="p05-mic__label">
        {MIC_LABEL[state]}
        {state === 'listening' && (
          <span className="p05-mic__dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        )}
      </span>
      <span className="p05-mic__icon" aria-hidden="true">
        <MicIcon />
      </span>
    </div>
  )
}

function MicIcon(): ReactNode {
  return (
    <svg viewBox="0 0 48 48" focusable="false">
      <rect x="17" y="6" width="14" height="24" rx="7" fill="currentColor" />
      <path
        d="M11 23a13 13 0 0 0 26 0M24 36v6"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  )
}
