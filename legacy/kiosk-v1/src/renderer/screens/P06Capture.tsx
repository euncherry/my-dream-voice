/**
 * P-06 [촬영] 🟢 — 스파이크 ②
 *
 * 완료 기준 (SPIKE_PLAN ②)
 *   1. 카운트다운 후 4컷 연속 촬영된다
 *   2. 각 컷에 직업 프레임(placeholder)이 합성된다
 *   3. 4컷이 4×6인치 비율 캔버스에 배열되어 이미지로 저장된다 (1200×1800px)
 *
 * 카메라는 사이드카(src/main/camera.ts)가 제어한다. 라이브뷰는 <img>로 받고,
 * 촬영 원본은 파일로 받아 합성한다 — 프리뷰 프레임을 캡처해 쓰지 않는다.
 * 프리뷰는 합성과 같은 비율·같은 중앙 크롭이라 구도가 그대로 인쇄된다.
 * 프리뷰와 찍은 직후 화면만 거울처럼 뒤집어 보여주고, 썸네일·완성 화면·인쇄는 뒤집지 않는다.
 *
 * ⚠️ 가짜 카메라일 때는 화면에 표시한다. 재촬영은 미정이라 넣지 않았다 (SPEC T-10).
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { PlaceholderTag, Screen } from '../components/Screen'
import { useSession } from '../store/session'
import { composeFourCut, composePlaceholderFourCut } from '../photo/composeFourCut'
import { JOB_BY_ID, jobLabel } from '@shared/jobs'
import type { CameraBackend } from '@shared/types'

const CUTS = 4
const COUNTDOWN_FROM = 5
const COUNTDOWN_TICK_MS = 1000
/** 찍힌 컷을 보여주는 시간 */
const REVIEW_MS = 1500
/** 완성된 네컷을 보여주고 다음 화면으로 넘어가기까지 */
const RESULT_MS = 3000

type Phase = 'preparing' | 'countdown' | 'shutter' | 'review' | 'composing' | 'result' | 'error'

interface Shot {
  path: string
  blob: Blob
  url: string
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

export function P06Capture(): ReactNode {
  const { jobs, sessionId } = useSession((s) => s.session)
  const patch = useSession((s) => s.patch)
  const next = useSession((s) => s.next)
  const setFallback = useSession((s) => s.setFallback)

  const [phase, setPhase] = useState<Phase>('preparing')
  const [count, setCount] = useState(COUNTDOWN_FROM)
  const [liveUrl, setLiveUrl] = useState<string | null>(null)
  const [backend, setBackend] = useState<CameraBackend | null>(null)
  const [shots, setShots] = useState<Shot[]>([])
  const [composed, setComposed] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** [다시 시도] — 값이 바뀌면 촬영을 이어서 다시 돌린다 */
  const [attempt, setAttempt] = useState(0)

  // 재시도해도 이미 찍은 컷은 유지한다
  const shotsRef = useRef<Shot[]>([])

  useEffect(() => () => shotsRef.current.forEach((s) => URL.revokeObjectURL(s.url)), [])

  useEffect(() => {
    const run = { cancelled: false }

    function fail(detail: string): void {
      run.cancelled = true
      setLiveUrl(null)
      setError(detail)
      setPhase('error')
      setFallback({
        kind: 'device',
        message: '카메라를 준비하고 있어요. 옆의 직원에게 알려주세요!',
        detail,
      })
    }

    async function shoot(session: string): Promise<void> {
      setError(null)
      setPhase('preparing')

      const live = await window.api.camera.startLiveView()
      if (run.cancelled) return
      setLiveUrl(live.url)
      const status = await window.api.camera.status()
      if (run.cancelled) return
      setBackend(status.backend ?? null)

      while (shotsRef.current.length < CUTS) {
        const index = shotsRef.current.length

        setPhase('countdown')
        for (let n = COUNTDOWN_FROM; n > 0; n--) {
          setCount(n)
          await sleep(COUNTDOWN_TICK_MS)
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

        setPhase('review')
        await sleep(REVIEW_MS)
        if (run.cancelled) return
      }

      await window.api.camera.stopLiveView()
      if (run.cancelled) return
      setLiveUrl(null)
      setPhase('composing')

      const bitmaps = await Promise.all(shotsRef.current.map((s) => createImageBitmap(s.blob)))
      const dataUrl = composeFourCut(bitmaps, jobs)
      bitmaps.forEach((b) => b.close())
      if (run.cancelled) return

      const saved = await window.api.photo.save({
        sessionId: session,
        index: 0,
        dataUrl,
        composed: true,
      })
      if (run.cancelled) return
      patch({ photos: shotsRef.current.map((s) => s.path), composedPhoto: saved.path })

      setComposed(dataUrl)
      setPhase('result')
      await sleep(RESULT_MS)
      if (run.cancelled) return
      next()
    }

    if (!sessionId) {
      setError('세션이 없습니다 — P-00부터 시작하세요')
      setPhase('error')
      return
    }

    const unsubscribe = window.api.camera.onEvent((event) => {
      fail(`${event.type}: ${event.message}`)
    })

    shoot(sessionId).catch((e: Error) => {
      if (!run.cancelled) fail(e.message)
    })

    return () => {
      run.cancelled = true
      unsubscribe()
      setLiveUrl(null)
      void window.api.camera.stopLiveView().catch(() => undefined)
    }
    // jobs·patch·next는 이 화면이 떠 있는 동안 바뀌지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, sessionId])

  /** 카메라 없이도 나머지 플로우를 확인할 수 있게 한다 (개발용) */
  async function continueWithPlaceholder(): Promise<void> {
    if (!sessionId) return
    const dataUrl = composePlaceholderFourCut(jobs)
    const saved = await window.api.photo.save({ sessionId, index: 0, dataUrl, composed: true })
    patch({ composedPhoto: saved.path })
    next()
  }

  const done = shots.length
  const currentIndex = Math.min(done, CUTS - 1)
  // 찍은 직후에는 방금 찍은 컷의 직업을 그대로 보여준다
  const shownIndex = phase === 'review' ? done - 1 : currentIndex
  const job = jobs[shownIndex]
  const frameColor = job ? JOB_BY_ID[job]?.placeholderColor : undefined
  const lastShot = shots[done - 1]

  return (
    <Screen id="P-06" note="스파이크 ② — 프레임·포즈 아트는 placeholder">
      <div className="capture">
        {composed ? (
          <img className="capture__result" src={composed} alt="완성된 네컷 사진" />
        ) : (
          <div className="capture__stage" style={{ borderColor: frameColor }}>
            {phase === 'review' && lastShot ? (
              <img className="capture__image" src={lastShot.url} alt="" />
            ) : (
              liveUrl && <img className="capture__image" src={liveUrl} alt="" />
            )}

            {job && <span className="capture__job">{jobLabel(job)}</span>}
            {phase === 'countdown' && (
              <span key={count} className="capture__count">
                {count}
              </span>
            )}
            {phase === 'shutter' && <div className="capture__flash" />}
            {(phase === 'preparing' || phase === 'composing') && (
              <span className="capture__notice">
                {phase === 'preparing' ? '카메라를 켜고 있어요…' : '사진을 만들고 있어요…'}
              </span>
            )}
          </div>
        )}

        <div className="capture__side">
          <h1 className="screen__title">
            {phase === 'result' ? '완성!' : `${Math.min(done + 1, CUTS)} / ${CUTS}`}
          </h1>

          <div className="capture__thumbs">
            {Array.from({ length: CUTS }, (_, i) => (
              <div key={i} className="capture__thumb">
                {shots[i] && <img src={shots[i]!.url} alt={`${i + 1}번째 컷`} />}
              </div>
            ))}
          </div>

          {backend === 'fake' && <PlaceholderTag label="가짜 카메라 — 실제 촬영이 아닙니다" />}
          <PlaceholderTag label="직업 프레임 · 포즈 가이드 아트 미제작" />

          {phase === 'error' && (
            <div className="row">
              <button className="btn btn--primary" onClick={() => setAttempt((a) => a + 1)}>
                다시 시도
              </button>
              <button className="btn btn--sm" onClick={() => void continueWithPlaceholder()}>
                [개발용] placeholder로 계속
              </button>
            </div>
          )}
          {error && <p className="err">{error}</p>}
        </div>
      </div>
    </Screen>
  )
}
