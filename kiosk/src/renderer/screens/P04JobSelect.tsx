/**
 * P-04 [직업 선택] — A · B 공통 · 🎨 디자인 입힘 (2026-11-23)
 *
 * 근거: PAGE_SPEC §3 P-04 · SPEC §5 (직업 6종) · 디자인 시안(직업 선택 화면)
 * 목적: 6종 중 아이가 직접 1개를 고른다 — 프레임 그림을 보고 고른다
 * 쓰기: session.job (1개 — 다른 카드를 누르면 바뀐다)
 * 액션: 카드 터치 = 선택 → [다음] → A는 P-06[촬영] · B는 P-05[발화]
 *       [뒤로] → A는 P-01[모드 선택] · B는 P-03[연령 선택]
 *
 * 직업은 역할놀이 소재다 — 어떤 직업을 권하거나 골라 주지 않는다 (v2).
 *
 * 그림은 assets/ 에 있다 — 배경(bg/sky) · 로고(brand/logo-en) · 프레임을 든 우주인(characters/astronaut-frame) ·
 *   발밑 구름(deco/cloud-front) · 별(deco/star-yellow). 카드 그림은 그 직업의 네컷 프레임이다 (photo/FramePreview —
 *   인쇄되는 것과 같은 그림. 2026-11-23부터 6개 직업이 같은 프레임 하나 — photo/composeFourCut.ts FRAME_FILE).
 * 배치는 1920×1080 좌표 그대로다 (components/Stage.tsx) — 값은 styles/p04.css. [← 뒤로]는 공통 부품이다.
 *
 * 시안에는 "우주비행사를 고른 모습" 한 장뿐이다. 나머지는 같은 모양으로 만들었다 (확인 필요 — 체크리스트 7-6):
 *   · 아무것도 고르지 않았을 때 — 카드 6장이 다 같은 모양 · [다음]은 흐리게 잠긴다 (P-03과 같은 꼴)
 *   · 고른 카드 — 파란 테두리 · 옅은 하늘색 바탕 · 오른쪽 위 체크 (시안 그대로) + 조금 커진다(1.04배 — P-03처럼 · 시안에는 없다)
 *
 * 연달아 두드린 터치를 막는다 — 화면이 바뀐 직후 0.4초(TAP_GUARD_MS)는 카드 · [다음]을 받지 않는다
 *   (P-03 [다음] 자리 바로 위가 이 화면의 아래 줄 카드 · [다음]이라 두 번 두드리면 둘째 터치가 떨어진다).
 */

import type { ReactNode } from 'react'
import type { JobId } from '@shared/types'
import { JOBS } from '@shared/jobs'
import { BackButton } from '../components/BackButton'
import { Screen } from '../components/Screen'
import { Stage } from '../components/Stage'
import { FramePreview } from '../photo/FramePreview'
import { justChangedScreen, useSession } from '../store/session'
import skyUrl from '../assets/bg/sky.webp'
import logoEnUrl from '../assets/brand/logo-en.png'
import astronautFrameUrl from '../assets/characters/astronaut-frame.webp'
import cloudFrontUrl from '../assets/deco/cloud-front.webp'
import starYellowUrl from '../assets/deco/star-yellow.png'
import '../styles/p04.css'

function Arrow(): ReactNode {
  return (
    <span className="p04-next__arrow" aria-hidden="true">
      <svg viewBox="0 0 48 48" width="100%" height="100%" focusable="false">
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
  )
}

/** 고른 카드 오른쪽 위의 체크 — 동그라미 안의 흰 체크 (P-03과 같은 그림) */
function PickedMark(): ReactNode {
  return (
    <span className="p04-card__mark" aria-hidden="true">
      <svg viewBox="0 0 48 48" focusable="false">
        <path
          d="M12 25l8 8L36.5 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}

/** "직업" 밑에 깔리는 분홍 붓질 — P-03 제목과 같은 그림 */
function TitleMark(): ReactNode {
  return (
    <svg className="p04-title__mark" viewBox="0 0 290 56" aria-hidden="true" focusable="false">
      <path d="M7 31C8 18 17 9 32 8L262 2c14-.5 23 6 23 17 0 13-9 24-22 25L150 45 44 52C20 53 6 45 7 31Z" />
    </svg>
  )
}

export function P04JobSelect(): ReactNode {
  const job = useSession((s) => s.session.job)
  const setJob = useSession((s) => s.setJob)
  const next = useSession((s) => s.next)
  const back = useSession((s) => s.back)

  function pick(id: JobId): void {
    if (justChangedScreen()) return
    setJob(id)
  }

  function goNext(): void {
    if (justChangedScreen() || !job) return
    next() // → A: P-06 · B: P-05
  }

  return (
    <Screen id="P-04" designed>
      <div className="p04">
        <Stage background={skyUrl}>
          <img className="p04-logo" src={logoEnUrl} alt="MY DREAM VOICE" draggable={false} />

          <BackButton onClick={back} />

          <img className="p04-star" src={starYellowUrl} alt="" draggable={false} />

          <h1 className="p04-title">
            어떤{' '}
            <span className="p04-title__em">
              <TitleMark />
              <span className="p04-title__text">직업</span>
            </span>
            이 되어 볼까요?
          </h1>
          <p className="p04-sub">사진 프레임을 하나 골라 주세요</p>

          <div className="p04-grid">
            {JOBS.map((def) => {
              const picked = job === def.id
              return (
                <button
                  key={def.id}
                  type="button"
                  className="p04-card"
                  aria-pressed={picked}
                  data-picked={picked}
                  onClick={() => pick(def.id)}
                >
                  {/* 카드 그림 = 그 직업의 네컷 프레임 (인쇄되는 것과 같은 그림) */}
                  <span className="p04-card__art">
                    <FramePreview job={def.id} />
                  </span>
                  <span className="p04-card__name">{def.label}</span>
                  {picked && <PickedMark />}
                </button>
              )
            })}
          </div>

          {/* 직업을 고르기 전에는 흐리게 잠긴다 */}
          <button type="button" className="p04-next" disabled={!job} onClick={goNext}>
            <span className="p04-next__label">다음</span>
            <Arrow />
          </button>

          {/* 왼쪽 아래 — 프레임을 든 우주인. 꾸밈이라 터치는 받지 않는다. 발밑은 구름이 가린다 */}
          <img className="p04-char" src={astronautFrameUrl} alt="" draggable={false} />
          <img className="p04-cloud" src={cloudFrontUrl} alt="" draggable={false} />
        </Stage>
      </div>
    </Screen>
  )
}
