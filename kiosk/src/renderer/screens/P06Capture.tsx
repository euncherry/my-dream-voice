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
 *
 * ⚠️ 색 · 글꼴 · 배치는 임시다. 프레임 · 포즈 가이드 아트는 미제작 — placeholder로 표시한다.
 */

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { DevStrip, PlaceholderTag, Screen } from '../components/Screen'
import { useSession } from '../store/session'
import { cellAspect, cellsFor, composeFourCut, composePlaceholderFourCut, frameArtSrc } from '../photo/composeFourCut'
import { FramePreview } from '../photo/FramePreview'
import { startLiveViewRecording, type LiveViewRecording } from '../photo/recordLiveView'
import { CAPTURE_INTERVAL_SEC, CUT_COUNT, FOURCUT } from '@shared/constants'
import { jobLabel } from '@shared/jobs'
import type { CameraBackend, JobId } from '@shared/types'
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

  return (
    <Screen id="P-06" note="버튼 없이 자동 4컷 · 프레임 · 포즈 가이드 아트는 placeholder">
      {/* 라이브뷰 비율 = 네컷 사진 칸의 비율 (계산값이라 변수로 넘긴다) */}
      <div className="p06" style={{ '--p06-aspect': liveCell.width / liveCell.height } as CSSProperties}>
        <div className="p06-stagebox">
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

            {(phase === 'countdown' || phase === 'shutter') && (
              <div className="p06-pose">
                <PlaceholderTag label="포즈 가이드 아트 미제작" />
              </div>
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
                <button className="btn btn--primary" onClick={retry}>
                  다시 시도
                </button>
                <DevStrip label="카메라 없는 개발 PC">
                  <button
                    className="btn btn--sm"
                    disabled={placeholderBusy}
                    onClick={() => void continueWithPlaceholder()}
                  >
                    placeholder 사진으로 계속
                  </button>
                  {error && <span className="p06-error__detail">{error}</span>}
                </DevStrip>
              </div>
            )}
          </div>
        </div>

        <aside className="p06-side">
          <strong className="p06-job">{jobLabel(job)}</strong>
          <p className="p06-progress">
            {cutNo} / {CUT_COUNT}
          </p>

          {/* 카운트다운 — 라이브뷰를 가리지 않게 오른쪽에 (2026-11-24 지정). 자리는 늘 잡아 둬 미리보기가 들썩이지 않게 */}
          <div className="p06-count" data-on={phase === 'countdown'} aria-hidden={phase !== 'countdown'}>
            <span className="p06-count__num">{phase === 'countdown' ? count : ''}</span>
            <span className="p06-count__text">{count}초 뒤에 찍어요</span>
          </div>

          <div className="p06-frame">
            <FramePreview job={job} shots={frameShots} activeCell={activeCell} />
          </div>

          <div className="p06-tags">
            {backend === 'fake' && <PlaceholderTag label="가짜 카메라 — 실제 촬영이 아닙니다" />}
            <PlaceholderTag label="문구 미확정" />
          </div>

          <DevStrip label="촬영">
            <span>카메라 {backend ?? '확인 중'}</span>
            <span>· 장면 녹화 {REC_LABEL[recState]}</span>
          </DevStrip>
        </aside>
      </div>
    </Screen>
  )
}
