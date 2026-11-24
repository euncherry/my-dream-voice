/**
 * P-00 [대기] — 타이틀 화면 겸용 (별도 타이틀 화면 없음) · 🎨 디자인 입힘 (2026-11-21)
 *
 * 근거: PAGE_SPEC §3 P-00 · 디자인 시안(타이틀 화면 1920×1080)
 * 액션: [시작하기] 또는 화면 아무 곳이나 터치 → 세션 시작 → P-01[모드 선택]
 * 데이터: 세션 초기화 — 이전 세션의 남은 데이터를 지우고 새 세션 폴더를 받는다 (스토어 beginSession)
 *
 * 그림은 assets/ 에 있다 — 배경(bg/sky) · 제목(brand/title-ko · logo-en) · 캐릭터 2명 · 별 2개.
 * 배치는 1920×1080 좌표 그대로다 (components/Stage.tsx가 창 크기에 맞춰 통째로 줄인다) — 값은 styles/p00.css.
 *
 * 컨셉 문구 "꿈을 찍고, 목소리를 담아요"는 디자인 시안의 문구다 (v1 문구는 추천 직업이 빠지면서 폐기).
 * 어트랙트 영상은 없다 — 캐릭터 · 별이 천천히 떠 있는 움직임만 넣었다 (멈춘 화면은 고장으로 보이므로 · PAGE_SPEC §2-5).
 */

import { useRef, useState, type ReactNode } from 'react'
import { DevStrip, Screen } from '../components/Screen'
import { Stage } from '../components/Stage'
import { useSession } from '../store/session'
import skyUrl from '../assets/bg/sky.webp'
import logoEnUrl from '../assets/brand/logo-en.png'
import titleKoUrl from '../assets/brand/title-ko.png'
import policeBoyUrl from '../assets/characters/police-boy.webp'
import astronautGirlUrl from '../assets/characters/astronaut-girl.webp'
import starCoralUrl from '../assets/deco/star-coral.png'
import starYellowUrl from '../assets/deco/star-yellow.png'
import '../styles/p00.css'

/** 누를 때 찌그러지는 비율 (가로 · 세로) — styles/p00.css `.p00-start.is-pressed`와 같은 값 */
const PRESS_X = 1.05
const PRESS_Y = 0.9
/** 놓은 뒤 출렁임 전체 길이 */
const BOUNCE_MS = 650
/** 다음 화면으로 넘어가기 전 최소한 기다리는 시간 — 크게 한 번 튀어 오르고 돌아오는 데까지 */
const BOUNCE_WAIT_MS = 420

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export function P00Attract(): ReactNode {
  const beginSession = useSession((s) => s.beginSession)
  const next = useSession((s) => s.next)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // busy 상태는 다음 렌더에야 바뀐다 — 연달아 들어오는 터치는 ref로 바로 막는다
  const startingRef = useRef(false)
  const buttonRef = useRef<HTMLButtonElement>(null)

  async function start(): Promise<void> {
    if (startingRef.current) return
    startingRef.current = true
    setBusy(true)
    setError(null)
    try {
      // 이전 세션 정리 · 세션 폴더 발급은 메인이 한다 (스토어가 window.api로 요청)
      // 버튼이 띠용 튀어 오르는 걸 보고 넘어가도록 출렁임 앞부분만큼은 기다린다
      await Promise.all([beginSession(), wait(BOUNCE_WAIT_MS)])
      // 기다리는 사이 개발용 화면 이동(DevBar)으로 화면이 바뀌었으면 넘기지 않는다
      if (useSession.getState().screen === 'P-00') next()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      // 성공하면 화면이 바뀌어 이 컴포넌트는 사라진다 — 실패해서 남아 있을 때 다시 누를 수 있게 푼다
      startingRef.current = false
      setBusy(false)
    }
  }

  /** 누르는 동안 버튼이 눌린 모양 — 화면 어디를 눌러도 [시작하기]가 반응한다 (터치 영역이 화면 전체라서) */
  function press(): void {
    if (startingRef.current) return
    buttonRef.current?.classList.add('is-pressed')
  }

  /** 놓으면 마시멜로처럼 출렁이며 제자리로 — 늘어났다 줄었다를 점점 작게 되풀이한다 */
  function release(): void {
    const el = buttonRef.current
    if (!el?.classList.contains('is-pressed')) return
    el.classList.remove('is-pressed')
    const dx = PRESS_X - 1
    const dy = 1 - PRESS_Y
    el.animate(
      [
        { transform: `translateY(3px) scale(${PRESS_X}, ${PRESS_Y})` },
        { transform: `translateY(-8px) scale(${1 - dx * 0.7}, ${1 + dy * 0.7})` },
        { transform: `translateY(0) scale(${1 + dx * 0.35}, ${1 - dy * 0.35})` },
        { transform: `translateY(-2px) scale(${1 - dx * 0.15}, ${1 + dy * 0.15})` },
        { transform: 'translateY(0) scale(1, 1)' },
      ],
      { duration: BOUNCE_MS, easing: 'ease-out' },
    )
  }

  return (
    <Screen id="P-00" designed>
      {/* 터치 영역 — 화면 어디를 눌러도 클릭이 여기로 올라와 start()가 한 번 불린다 */}
      <div
        className="p00"
        onClick={() => void start()}
        onPointerDown={press}
        onPointerUp={release}
        onPointerLeave={release}
        onPointerCancel={release}
      >
        <Stage background={skyUrl}>
          <img className="p00-logo-en" src={logoEnUrl} alt="MY DREAM VOICE" draggable={false} />

          <img className="p00-star p00-star--coral" src={starCoralUrl} alt="" draggable={false} />
          <img className="p00-star p00-star--yellow" src={starYellowUrl} alt="" draggable={false} />

          <img className="p00-char p00-char--police" src={policeBoyUrl} alt="" draggable={false} />
          <img
            className="p00-char p00-char--astronaut"
            src={astronautGirlUrl}
            alt=""
            draggable={false}
          />

          <h1 className="p00-title">
            <img src={titleKoUrl} alt="마이 드림 보이스" draggable={false} />
          </h1>

          <p className="p00-tagline">꿈을 찍고, 목소리를 담아요</p>

          {/* 핸들러를 따로 달지 않는다 — 누르면 클릭이 바깥 터치 영역으로 올라간다 (두 번 불리지 않게) */}
          <button type="button" className="p00-start" disabled={busy} ref={buttonRef}>
            <span className="p00-start__label">시작하기</span>
            <span className="p00-start__arrow" aria-hidden="true">
              <svg viewBox="0 0 48 48" width="100%" height="100%">
                <path
                  d="M11 24h25M26 13l11 11-11 11"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="6.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </button>

          <p className="p00-hint">화면 어디든 터치해 주세요</p>
        </Stage>

        {error && (
          <div className="p00-dev">
            <DevStrip label="세션 시작 실패">{error}</DevStrip>
          </div>
        )}
      </div>
    </Screen>
  )
}
