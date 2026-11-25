/**
 * P-06 [촬영] — 고른 직업 프레임으로 4컷 자동 촬영 + 촬영 장면 녹화
 *
 * 근거: PAGE_SPEC "P-06 [촬영]" · SPEC §2 촬영 · V2_PLAN §3 P-06 행 · 구성 스케치 docs/user-flow/wf/p06-shoot.svg
 *
 * 흐름 — 버튼 없이 자동
 *   준비   라이브뷰 시작 → 표시 → 카메라 종류 확인 (라이브뷰가 뜨면 녹화도 시작된다)
 *   × 4    카운트다운 7 → 1 (1초마다) → 셔터 + 플래시 → 원본을 되읽어 프레임의 그 칸을 채운다 → 곧바로 다음 컷
 *   끝     녹화 정지 · 라이브뷰 정지 → 영상 저장 → 네컷 합성 · 저장 → P-07[분석 및 프린트]
 *
 * 카메라는 사이드카(src/main/camera.ts)가 제어한다. 라이브뷰는 <img>(MJPEG)로 받고,
 * 촬영 원본은 파일로 받아 합성한다 — 라이브뷰 프레임을 캡처해 사진으로 쓰지 않는다.
 * 라이브뷰는 지금 찍는 칸과 같은 비율 · 같은 가운데 잘라내기이고, 그 칸 둘레의 프레임을 겹쳐 보여 줘서 보이는 구도가 그대로 인쇄된다.
 * 라이브뷰는 거울처럼 뒤집어 보여 주고, 네컷(미리보기 · 인쇄)도 같은 방향으로 뒤집어 합성한다 (2026-11-23 — 본 모습 그대로 인쇄).
 * 저장하는 원본 사진 · 녹화 영상은 뒤집지 않는다 (영상은 P-07이 뒤집어 재생한다).
 *
 * 촬영 장면 녹화(photo/recordLiveView.ts)는 **덤**이다 — 실패해도 영상 없이 그대로 간다.
 * 영상은 기기 안에만 두고 서버로 보내지 않는다 (CLAUDE.md 금지사항 4).
 *
 * 이 화면에서 하지 않는 것
 *   - 분석 (촬영이 끝난 뒤 P-07에서 — 라이브뷰 · 카운트다운 보호)
 *   - 재촬영 (SPEC T-10 미결) · [뒤로] (촬영 중 비활성 — PAGE_SPEC §2-4)
 *   - 찍은 컷을 따로 크게 보여 주는 단계 (둘지는 디자인에서 정한다)
 *   - 포즈 추천 · 포즈 가이드 (2026-11-25 — 하지 않기로)
 *
 * 🎨 디자인 입힘 (2026-11-25 촬영 시안 2판) — 왼쪽 위 [📷 사진 촬영 중] (뒤로 대신) ·
 *   왼쪽 흰 패널: 라이브뷰만 (시안의 [● 영상 녹화 중] · 포즈 말풍선 "브이!"는 2026-11-25 뺐다 — 포즈 추천은 하지 않는다) ·
 *   오른쪽 흰 패널: "선택한 프레임" · 직업 이름 · 네컷 미리보기 · 시간 원(숫자 + "N초 뒤에 찍어요") | N / 4 · "○ 번째 사진을 찍어요" ·
 *   아래 "버튼을 누르지 않아도 자동으로 찍혀요".
 *   시간 원: 0초에는 테두리가 없고, 7초 동안 12시 방향부터 시계 방향으로 선이 그려져 찍는 순간 한 바퀴가 된다 (2026-11-25 지정).
 *   배치는 1920×1080 좌표 그대로다 (components/Stage.tsx) — 값은 styles/capture.css.
 *   시안과 다른 점: 라이브뷰는 지금 찍는 사진 칸의 비율이라 시안(더 넓은 화면)보다 좁다 — 남는 좌우는 옅은 바탕.
 */

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { DevStrip, Screen } from '../components/Screen'
import { Stage } from '../components/Stage'
import { useSession } from '../store/session'
import { cellAspect, cellsFor, composeFourCut, composePlaceholderFourCut, frameArtSrc } from '../photo/composeFourCut'
import { FramePreview } from '../photo/FramePreview'
import { startLiveViewRecording, type LiveViewRecording } from '../photo/recordLiveView'
import { CAPTURE_INTERVAL_SEC, CUT_COUNT, FOURCUT } from '@shared/constants'
import { jobLabel } from '@shared/jobs'
import type { CameraBackend, JobId } from '@shared/types'
import skyUrl from '../assets/bg/sky.webp'
import logoEnUrl from '../assets/brand/logo-en.png'
import cloudFrontUrl from '../assets/deco/cloud-front.webp'
import starYellowUrl from '../assets/deco/star-yellow.png'
import '../styles/capture.css'

/** M-02[오류·폴백 안내]에 띄우는 문구 (v1과 같다) */
const CAMERA_FALLBACK_MESSAGE = '카메라를 준비하고 있어요. 옆의 직원에게 알려주세요!'

type Phase =
  | 'preparing' // 라이브뷰를 켜는 중
  | 'countdown'
  | 'shutter' // 셔터 ~ 원본을 되읽을 때까지
  | 'composing' // 4컷 끝 — 영상 저장 · 네컷 합성
  | 'error'

interface Shot {
  /** 메인이 저장한 원본 JPEG */
  path: string
  blob: Blob
  /** 프레임 미리보기용 Blob URL — 화면을 떠날 때 해제한다 */
  url: string
}

/** 촬영 진행 한 번 — effect가 다시 돌거나([다시 시도]) 화면을 떠나면 cancelled가 된다 */
interface Run {
  cancelled: boolean
  /** 4컷을 다 찍었다 — 이 뒤의 카메라 끊김은 합성 · 저장을 막지 않는다 */
  cameraDone: boolean
  /** 카운트다운 타이머 */
  timer: number
}

/** "○ 번째 사진을 찍어요" */
const ORDINAL = ['첫 번째', '두 번째', '세 번째', '네 번째'] as const

/** "웃어" 밑에 깔리는 분홍 붓질 — P-03 · P-04 제목과 같은 그림 */
function TitleMark(): ReactNode {
  return (
    <svg className="p06-title__mark" viewBox="0 0 290 56" aria-hidden="true" focusable="false" preserveAspectRatio="none">
      <path d="M7 31C8 18 17 9 32 8L262 2c14-.5 23 6 23 17 0 13-9 24-22 25L150 45 44 52C20 53 6 45 7 31Z" />
    </svg>
  )
}

/** 카메라 그림 (선) */
function CameraIcon({ className, solid }: { className?: string; solid?: boolean }): ReactNode {
  if (solid) {
    // 채운 카메라 (왼쪽 위 [사진 촬영 중])
    return (
      <svg className={className} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <path
          fillRule="evenodd"
          fill="currentColor"
          d="M5 17a6 6 0 0 1 6-6h4.5l3.2-4.6A3 3 0 0 1 21.2 5h5.6a3 3 0 0 1 2.5 1.4L32.5 11H37a6 6 0 0 1 6 6v18a6 6 0 0 1-6 6H11a6 6 0 0 1-6-6ZM24 34a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17Zm0-4.5a4 4 0 1 1 0-8 4 4 0 0 1 0 8Z"
        />
      </svg>
    )
  }
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path
        d="M6 17a5 5 0 0 1 5-5h5l3.5-5h9L32 12h5a5 5 0 0 1 5 5v19a5 5 0 0 1-5 5H11a5 5 0 0 1-5-5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="4.2"
        strokeLinejoin="round"
      />
      <circle cx="24" cy="26" r="7.5" fill="none" stroke="currentColor" strokeWidth="4.2" />
    </svg>
  )
}

/**
 * 시간 원의 선 — 카운트다운 7초 동안 12시 방향부터 시계 방향으로 그려진다.
 * 매 프레임 "카운트다운을 시작한 뒤 지난 시간"으로 선 길이를 정한다 — CSS 애니메이션은 화면이 바쁠 때 늦게 출발해
 * 찍는 순간에 한 바퀴를 못 채웠다 (2026-11-25 확인). 이렇게 하면 늦게 붙거나 프레임이 밀려도 찍는 순간 한 바퀴다.
 */
function RingArc({ startedAt }: { startedAt: number }): ReactNode {
  const ref = useRef<SVGCircleElement>(null)
  useEffect(() => {
    let raf = 0
    const draw = (): void => {
      const done = Math.min(1, Math.max(0, (performance.now() - startedAt) / (CAPTURE_INTERVAL_SEC * 1000)))
      ref.current?.style.setProperty('stroke-dashoffset', String(100 - done * 100))
      if (done < 1) raf = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [startedAt])
  return <circle ref={ref} className="p06-timer__arc" cx="110" cy="110" r="104" pathLength={100} />
}

/** 개발용 표시 — 촬영 장면 녹화 상태 */
type RecState = 'idle' | 'unsupported' | 'waiting' | 'recording' | 'failed'

const REC_LABEL: Record<RecState, string> = {
  idle: '꺼짐',
  unsupported: '지원하지 않음 — 영상 없이 진행',
  waiting: '첫 프레임을 기다리는 중',
  recording: '녹화 중',
  failed: '실패 — 영상 없이 진행',
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/** deadline(performance.now 기준)까지 기다린다. 타이머는 run에 걸어 두어 취소할 수 있다 */
function waitUntil(run: Run, deadline: number): Promise<void> {
  return new Promise((resolve) => {
    run.timer = window.setTimeout(resolve, Math.max(0, deadline - performance.now()))
  })
}

/**
 * 녹화를 끝내고 세션 폴더에 저장한다 (기기 안에만 — 메인이 쓴다).
 * 녹화는 덤이라 거절하지 않는다 — 영상이 없으면 undefined.
 */
async function saveRecording(
  sessionId: string,
  recording: LiveViewRecording | null,
): Promise<string | undefined> {
  if (!recording) return undefined
  try {
    const blob = await recording.stop()
    if (!blob) return undefined
    const saved = await window.api.video.save({ sessionId, data: await blob.arrayBuffer() })
    return saved.path
  } catch (e) {
    console.warn('[P-06] 촬영 장면 영상을 저장하지 못했습니다 (영상 없이 진행):', e)
    return undefined
  }
}

export function P06Capture(): ReactNode {
  const sessionId = useSession((s) => s.session.sessionId)
  const job = useSession((s) => s.session.job)
  const patch = useSession((s) => s.patch)
  const next = useSession((s) => s.next)
  const goto = useSession((s) => s.goto)
  const setFallback = useSession((s) => s.setFallback)

  const [phase, setPhase] = useState<Phase>('preparing')
  const [count, setCount] = useState(CAPTURE_INTERVAL_SEC)
  const [liveUrl, setLiveUrl] = useState<string | null>(null)
  /** 직업 프레임 그림을 불러왔는가 — 없으면 라이브뷰에 겹치지 않는다 */
  const [frameArtOk, setFrameArtOk] = useState(true)
  /** 라이브뷰를 crossOrigin으로 받는가 — 녹화하려면 필요하다. 그 때문에 안 뜨면 끈다 */
  const [liveCors, setLiveCors] = useState(true)
  const [backend, setBackend] = useState<CameraBackend | null>(null)
  const [shots, setShots] = useState<Shot[]>([])
  const [error, setError] = useState<string | null>(null)
  /** [다시 시도] — 값이 바뀌면 촬영을 이어서 다시 돌린다 */
  const [attempt, setAttempt] = useState(0)
  const [recState, setRecState] = useState<RecState>('idle')
  const [placeholderBusy, setPlaceholderBusy] = useState(false)

  // 다시 시도해도 이미 찍은 컷은 유지한다
  const shotsRef = useRef<Shot[]>([])
  const liveImgRef = useRef<HTMLImageElement | null>(null)
  /** 지금 라이브뷰 <img>가 프레임을 한 장이라도 받았는가 */
  const liveFrameSeenRef = useRef(false)
  const recordingRef = useRef<LiveViewRecording | null>(null)
  /** 4컷을 다 찍고 저장을 맡긴 영상 — 합성에서 실패해 다시 시도해도 그대로 쓴다 */
  const videoRef = useRef<Promise<string | undefined> | null>(null)
  const aliveRef = useRef(true)
  /** 이번 컷 카운트다운을 시작한 시각 (performance.now) — 시간 원을 카운트다운과 맞춘다 */
  const countStartRef = useRef(0)

  // 떠날 때 — 프레임 미리보기에 쓴 Blob URL 해제
  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
      shotsRef.current.forEach((s) => URL.revokeObjectURL(s.url))
    }
  }, [])

  // ── 촬영 장면 녹화 — 라이브뷰 <img>가 화면에 있는 동안 ──
  // 라이브뷰가 뜬 때부터 마지막 컷까지 통째로 담는다. 중간에 카메라가 끊겨 [다시 시도]하면
  // 그 뒤부터만 담긴다. TODO(디자인): 길이 · 구간은 디자인 때 정한다 (PAGE_SPEC P-06)
  useEffect(() => {
    if (!liveUrl) return
    if (!liveCors) {
      // crossOrigin 없이 띄운 <img>는 캔버스를 잠근다 — 녹화하지 않는다
      setRecState('failed')
      return
    }
    const img = liveImgRef.current
    if (!img || !job) return

    const recording = startLiveViewRecording(img, cellAspect(job), setRecState)
    recordingRef.current = recording
    setRecState(recording ? 'waiting' : 'unsupported')

    return () => {
      // 4컷을 다 찍어 stop()을 부른 뒤라면 아무 일도 하지 않는다
      recording?.cancel()
      if (recordingRef.current === recording) recordingRef.current = null
      setRecState('idle')
    }
  }, [liveUrl, liveCors, job])

  // ── 촬영 ──
  useEffect(() => {
    if (!sessionId || !job) return

    // StrictMode에서 effect가 두 번 돌아도 촬영이 겹치지 않는다 — 앞의 것은 cancelled로 멈춘다
    const run: Run = { cancelled: false, cameraDone: false, timer: 0 }

    function fail(detail: string): void {
      if (run.cancelled) return
      run.cancelled = true
      window.clearTimeout(run.timer)
      // 라이브뷰를 내린다 (녹화도 함께 정리된다). 이미 찍은 컷은 남긴다
      setLiveUrl(null)
      void window.api.camera.stopLiveView().catch(() => undefined)
      setError(detail)
      setPhase('error')
      setFallback({ kind: 'device', message: CAMERA_FALLBACK_MESSAGE, detail })
    }

    async function shoot(session: string, jobId: JobId): Promise<void> {
      setError(null)

      if (shotsRef.current.length < CUT_COUNT) {
        setPhase('preparing')

        const live = await window.api.camera.startLiveView()
        if (run.cancelled) return
        liveFrameSeenRef.current = false
        setLiveUrl(live.url)
        const status = await window.api.camera.status()
        if (run.cancelled) return
        setBackend(status.backend ?? null)

        while (shotsRef.current.length < CUT_COUNT) {
          const index = shotsRef.current.length

          // 카운트다운 — 시작 시각 기준으로 눈금을 맞춰 오차가 쌓이지 않게 한다 (정확히 1초 간격)
          setPhase('countdown')
          const startedAt = performance.now()
          countStartRef.current = startedAt
          for (let n = CAPTURE_INTERVAL_SEC; n > 0; n--) {
            setCount(n)
            await waitUntil(run, startedAt + (CAPTURE_INTERVAL_SEC - n + 1) * 1000)
            if (run.cancelled) return
          }

          setPhase('shutter')
          const saved = await window.api.camera.capture({ sessionId: session, index })
          if (run.cancelled) return
          const bytes = await window.api.photo.read(saved.path)
          if (run.cancelled) return

          const blob = new Blob([bytes], { type: 'image/jpeg' })
          shotsRef.current = [
            ...shotsRef.current,
            { path: saved.path, blob, url: URL.createObjectURL(blob) },
          ]
          setShots(shotsRef.current)
          // 찍은 컷을 따로 보여 주지 않고 곧바로 다음 컷으로 간다
        }

        // ── 4컷 끝 ──
        run.cameraDone = true
        // 녹화를 먼저 멈춘다 (라이브뷰가 살아 있을 때). 저장은 기다리지 않고 맡겨 둔다
        const recording = recordingRef.current
        recordingRef.current = null
        videoRef.current = saveRecording(session, recording)

        setPhase('composing')
        setLiveUrl(null)
        // 사진은 이미 다 받았다 — 정지에 실패해도 합성은 계속한다
        await window.api.camera.stopLiveView().catch(() => undefined)
        if (run.cancelled) return
      } else {
        // 합성 · 저장에서 실패해 다시 온 경우 — 카메라를 다시 켜지 않는다
        setPhase('composing')
      }

      const bitmaps = await Promise.all(shotsRef.current.map((s) => createImageBitmap(s.blob)))
      let dataUrl: string
      try {
        dataUrl = await composeFourCut(bitmaps, jobId)
      } finally {
        bitmaps.forEach((b) => b.close())
      }
      if (run.cancelled) return

      const saved = await window.api.photo.save({
        sessionId: session,
        index: 0,
        dataUrl,
        composed: true,
      })
      if (run.cancelled) return

      // 영상이 없으면 undefined — P-07은 영상 없이 진행한다
      const captureVideo = videoRef.current ? await videoRef.current : undefined
      if (run.cancelled) return

      patch({
        photos: shotsRef.current.map((s) => s.path),
        composedPhoto: saved.path,
        captureVideo,
      })
      next()
    }

    const unsubscribe = window.api.camera.onEvent((event) => {
      if (run.cameraDone) return
      fail(`${event.type}: ${event.message}`)
    })

    shoot(sessionId, job).catch((e: unknown) => {
      if (!run.cancelled) fail(errorText(e))
    })

    return () => {
      run.cancelled = true
      window.clearTimeout(run.timer)
      unsubscribe()
      setLiveUrl(null)
      void window.api.camera.stopLiveView().catch(() => undefined)
    }
  }, [attempt, sessionId, job, patch, next, setFallback])

  function retry(): void {
    setFallback(null)
    setAttempt((a) => a + 1)
  }

  /** 개발용 — 카메라 없는 개발 PC에서도 나머지 흐름을 확인할 수 있게 한다 */
  async function continueWithPlaceholder(): Promise<void> {
    if (!sessionId || !job || placeholderBusy) return
    setPlaceholderBusy(true)
    try {
      // MOCK: 실제 촬영 대신 placeholder 네컷 — 개별 사진 · 영상은 없다
      const dataUrl = await composePlaceholderFourCut(job)
      const saved = await window.api.photo.save({ sessionId, index: 0, dataUrl, composed: true })
      if (!aliveRef.current) return
      patch({ composedPhoto: saved.path, captureVideo: undefined })
      setFallback(null)
      next()
    } catch (e) {
      if (!aliveRef.current) return
      setError(errorText(e))
      setPlaceholderBusy(false)
    }
  }

  /**
   * crossOrigin을 붙였더니 라이브뷰가 아예 안 뜨는 경우(응답에 허용 헤더가 없을 때) —
   * 녹화를 포기하고 그냥 띄운다. 촬영이 녹화 때문에 막히면 안 된다.
   */
  function onLiveError(img: HTMLImageElement): void {
    if (liveCors && !liveFrameSeenRef.current && img.naturalWidth === 0) setLiveCors(false)
  }

  // DevBar로 건너뛰어 온 경우
  if (!sessionId || !job) {
    return (
      <Screen id="P-06" note="세션 · 직업 없음">
        <p className="screen__sub">세션 또는 직업이 없습니다 — P-00[대기]부터 시작하세요</p>
        <DevStrip label="화면을 건너뛴 경우">
          <button className="btn btn--sm" onClick={() => goto('P-00')}>
            P-00으로
          </button>
        </DevStrip>
      </Screen>
    )
  }

  const done = shots.length
  /** 지금 찍는 컷 (1부터) */
  const cutNo = Math.min(done + 1, CUT_COUNT)
  const shooting = phase === 'preparing' || phase === 'countdown' || phase === 'shutter'
  /** 프레임에서 강조할 칸 — 없으면 -1 */
  const activeCell = shooting && done < CUT_COUNT ? done : -1
  const frameShots = Array.from({ length: CUT_COUNT }, (_, i) => shots[i]?.url)
  /**
   * 라이브뷰 칸 = 지금 찍는 사진 칸 — 비율도 그 칸에 맞춘다 (칸마다 조금씩 다르다).
   * 그 칸 둘레의 프레임을 라이브뷰 위에 겹쳐서, 인쇄될 모습 그대로 보이게 한다 (2026-11-23 지정)
   */
  const liveCell = cellsFor(job)[activeCell >= 0 ? activeCell : 0]!
  const frameOver = {
    '--fx': liveCell.x / liveCell.width,
    '--fy': liveCell.y / liveCell.width,
    '--fw': FOURCUT.width / liveCell.width,
  } as CSSProperties
  /** 시간 원 — 카운트다운이 시작될 때부터 7초 동안 시계 방향으로 그려진다 (셔터 때는 다 그려진 채) */

  return (
    <Screen id="P-06" designed>
      <div className="p06">
        <Stage background={skyUrl}>
          <img className="p06-logo" src={logoEnUrl} alt="MY DREAM VOICE" draggable={false} />

          {/* 왼쪽 위 — [뒤로] 대신 지금 하는 일 (촬영 중에는 돌아갈 곳이 없다 — PAGE_SPEC §2-4) */}
          <span className="p06-badge">
            <CameraIcon className="p06-badge__icon" solid />
            사진 촬영 중
          </span>

          <img className="p06-star" src={starYellowUrl} alt="" draggable={false} />

          {/* 아래 구름 — 패널 뒤에 깔린다 */}
          <img className="p06-cloud p06-cloud--l" src={cloudFrontUrl} alt="" draggable={false} />
          <img className="p06-cloud p06-cloud--r" src={cloudFrontUrl} alt="" draggable={false} />

          <h1 className="p06-title">
            카메라를 보고{' '}
            <span className="p06-title__em">
              <TitleMark />
              <span className="p06-title__text">웃어</span>
            </span>{' '}
            주세요!
          </h1>
          <p className="p06-sub">{CAPTURE_INTERVAL_SEC}초마다 찰칵! 네 장을 찍어요</p>

          {/* ── 왼쪽 — 카메라 미리보기 ── */}
          <section className="p06-panel p06-panel--live">
            {/* 라이브뷰 비율 = 네컷 사진 칸의 비율 (계산값이라 변수로 넘긴다) — 남는 좌우는 옅은 바탕 */}
            <div
              className="p06-livebox"
              style={{ '--p06-aspect': liveCell.width / liveCell.height } as CSSProperties}
            >
              <div className="p06-stage">
                {liveUrl && (
                  <img
                    key={liveCors ? 'cors' : 'plain'}
                    ref={liveImgRef}
                    className="p06-live"
                    // 녹화용 캔버스가 잠기지 않게 한다 (photo/recordLiveView.ts)
                    crossOrigin={liveCors ? 'anonymous' : undefined}
                    src={liveUrl}
                    alt=""
                    onLoad={() => {
                      liveFrameSeenRef.current = true
                    }}
                    onError={(e) => onLiveError(e.currentTarget)}
                  />
                )}

                {/* 지금 찍는 칸 둘레의 프레임 — 라이브뷰는 거울 · 프레임은 뒤집지 않는다 (인쇄와 같다) */}
                {activeCell >= 0 && frameArtOk && (
                  <img
                    className="p06-frame-over"
                    src={frameArtSrc(job)}
                    alt=""
                    draggable={false}
                    style={frameOver}
                    onError={() => setFrameArtOk(false)}
                  />
                )}

                {/* 촬영 플래시 연출 — 컷마다 다시 돈다 */}
                {phase === 'shutter' && <div key={done} className="p06-flash" />}

                {(phase === 'preparing' || phase === 'composing') && (
                  <span className="p06-notice">
                    {phase === 'preparing' ? '카메라를 켜고 있어요…' : '사진을 만들고 있어요…'}
                  </span>
                )}

                {phase === 'error' && (
                  <div className="p06-error">
                    <p className="p06-error__text">{CAMERA_FALLBACK_MESSAGE}</p>
                    <button className="p06-retry" onClick={retry}>
                      다시 시도
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* ── 오른쪽 — 고른 프레임 · 시간 원 · 몇 번째 ── */}
          <aside className="p06-panel p06-panel--side">
            <h2 className="p06-side-title">선택한 프레임</h2>
            <p className="p06-job">{jobLabel(job)}</p>

            <div className="p06-frame">
              <FramePreview job={job} shots={frameShots} activeCell={activeCell} />
            </div>

            {/* 시간 원 — 0초에는 테두리가 없고, 7초 동안 12시 방향부터 시계 방향으로 그려져 찍는 순간 한 바퀴가 된다 */}
            <div className="p06-timer" data-phase={phase}>
              <svg className="p06-timer__ring" viewBox="0 0 220 220" aria-hidden="true" focusable="false">
                {phase === 'countdown' && <RingArc key={`count-${done}`} startedAt={countStartRef.current} />}
                {phase === 'shutter' && (
                  // 찍는 순간 — 다 그려진 원
                  <circle className="p06-timer__arc p06-timer__arc--full" cx="110" cy="110" r="104" pathLength={100} />
                )}
              </svg>
              {phase === 'countdown' ? (
                <>
                  <span key={count} className="p06-timer__num">
                    {count}
                  </span>
                  <span className="p06-timer__text">{count}초 뒤에 찍어요</span>
                </>
              ) : (
                <span className="p06-timer__word">
                  {phase === 'shutter'
                    ? '찰칵!'
                    : phase === 'preparing'
                      ? '준비 중'
                      : phase === 'composing'
                        ? '완성!'
                        : '잠깐만요'}
                </span>
              )}
            </div>

            <i className="p06-divider" aria-hidden="true" />

            <div className="p06-step">
              <p className="p06-progress">
                {cutNo} / {CUT_COUNT}
              </p>
              <p className="p06-step__main">
                {phase === 'composing' ? (
                  <>
                    네 장을
                    <br />
                    다 찍었어요!
                  </>
                ) : (
                  <>
                    {ORDINAL[cutNo - 1]} 사진을
                    <br />
                    찍어요
                  </>
                )}
              </p>
              <p className="p06-step__sub">찍은 칸이 차례로 채워져요</p>
            </div>
          </aside>

          <p className="p06-foot">버튼을 누르지 않아도 자동으로 찍혀요</p>
        </Stage>

        {/* 개발용 — 손님 화면에는 없다 */}
        <div className="p06-dev">
          <DevStrip label="촬영">
            <span>카메라 {backend ?? '확인 중'}</span>
            <span>· 장면 녹화 {REC_LABEL[recState]}</span>
            {backend === 'fake' && <span>· 가짜 카메라</span>}
            {phase === 'error' && (
              <button
                className="btn btn--sm"
                disabled={placeholderBusy}
                onClick={() => void continueWithPlaceholder()}
              >
                placeholder 사진으로 계속
              </button>
            )}
            {phase === 'error' && error && <span className="p06-error__detail">{error}</span>}
          </DevStrip>
        </div>
      </div>
    </Screen>
  )
}
