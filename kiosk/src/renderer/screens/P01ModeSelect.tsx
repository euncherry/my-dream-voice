/**
 * P-01 [모드 선택] — 네컷만 찍을지, 목소리 리포트까지 받을지 · 🎨 디자인 입힘 (2026-11-22)
 *
 * 근거: PAGE_SPEC §3 P-01 · V2_PLAN §3 · SPEC §10 (A모드 안내 — T-7) · 디자인 시안(모드 선택 화면)
 * 쓰기: session.mode = 'A' | 'B'
 * 액션: A 카드 → P-04[직업 선택] (동의 화면 없음) / B 카드 → P-02[동의] / [뒤로] → P-00[대기]
 *       다음 화면은 스토어의 nextScreen()이 정한다 — 여기서 화면 번호를 고르지 않는다.
 *
 * 카드 한 장이 통째로 버튼이다 — 그림 · 이름 · [선택하기] 어디를 눌러도 그 모드로 간다.
 *   ([선택하기]는 "누르는 곳"임을 보여 주는 모양이다. 버튼 안에 버튼을 또 두지 않는다.)
 *
 * 그림은 assets/ 에 있다 — 배경(bg/sky) · 로고(brand/logo-en) · 캐릭터 2명(카메라 든 기장 = A · 마이크 든 우주인 = B) · 별.
 * 캐릭터 뒤의 색 덩어리는 그림 파일이 아니라 코드로 그린다 (components/Blob.tsx).
 * 배치는 1920×1080 좌표 그대로다 (components/Stage.tsx) — 값은 styles/p01.css.
 *
 * B 카드의 받는 방법은 기획 문구 "(카카오 로그인 또는 이메일 입력)"이다 — 시안에는 "(카카오 로그인)"만 적혀 있지만,
 *   이메일 직접 입력으로도 리포트를 받으므로(P-02a · 2026-11-20 확정) 줄이지 않았다. 시안대로 줄일지는 확인 필요.
 *
 * A는 동의 화면을 거치지 않으므로 안내 한 줄을 이 화면에 둔다 (2026-11-19).
 * ⚠️ 시안에는 이 안내가 없다 — 기획(PAGE_SPEC P-01 · SPEC §10-3)에 있는 줄이라 빼지 않고 A 카드 안 빈자리에 작게 뒀다.
 *    문구 · 위치 · 둘지 말지는 미확정이다 (법무 확인 — SPEC T-7). 문구는 PAGE_SPEC의 임시 문구 그대로다.
 */

import type { ReactNode } from 'react'
import type { KioskMode } from '@shared/types'
import { BackButton } from '../components/BackButton'
import { Blob } from '../components/Blob'
import { Screen } from '../components/Screen'
import { Stage } from '../components/Stage'
import { justChangedScreen, useSession } from '../store/session'
import skyUrl from '../assets/bg/sky.webp'
import logoEnUrl from '../assets/brand/logo-en.png'
import pilotCameraUrl from '../assets/characters/pilot-camera.webp'
import astronautMicUrl from '../assets/characters/astronaut-mic.webp'
import starCoralUrl from '../assets/deco/star-coral.png'
import starYellowUrl from '../assets/deco/star-yellow.png'
import '../styles/p01.css'

interface ModeCard {
  mode: KioskMode
  /** 카드 이름 (PAGE_SPEC P-01) */
  name: string
  /** 한 줄 설명 (시안 문구) */
  desc: string
  /** 카드 그림 — 캐릭터 */
  art: string
}

const MODE_CARDS: ModeCard[] = [
  {
    mode: 'A',
    name: '사진만 찍기',
    desc: '직업을 고르고 네컷 사진을 찍어요.',
    art: pilotCameraUrl,
  },
  {
    mode: 'B',
    name: '목소리도 분석받기',
    desc: '사진도 찍고, 직업 대사도 말해요.',
    art: astronautMicUrl,
  },
]

/** A 안내 — PAGE_SPEC P-01의 임시 문구 그대로, 두 줄로 나눠 적는다 (법무 확인 전 · SPEC T-7) */
const A_NOTICE = ['사진과 촬영 영상은 이 기기에서만 쓰고 체험이 끝나면 지워요', '보호자와 함께 이용해 주세요']

function MailIcon(): ReactNode {
  return (
    <svg className="p01-card__mail-icon" viewBox="0 0 56 44" aria-hidden="true" focusable="false">
      <rect
        x="2.5"
        y="2.5"
        width="51"
        height="39"
        rx="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="4.2"
      />
      <path
        d="M6 8.5 28 26 50 8.5M34.5 26.5l11 10.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="4.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function P01ModeSelect(): ReactNode {
  const setMode = useSession((s) => s.setMode)
  const next = useSession((s) => s.next)
  const back = useSession((s) => s.back)

  function pick(mode: KioskMode): void {
    // P-00은 화면 아무 곳이나 터치하면 넘어온다 — 연달아 두드린 터치가 이 화면의 카드에 들어가지 않게 한다
    if (justChangedScreen()) return
    setMode(mode)
    next() // A → P-04 · B → P-02
  }

  return (
    <Screen id="P-01" designed>
      <div className="p01">
        <Stage background={skyUrl}>
          <img className="p01-logo" src={logoEnUrl} alt="MY DREAM VOICE" draggable={false} />

          <BackButton onClick={back} />

          <img className="p01-star p01-star--yellow" src={starYellowUrl} alt="" draggable={false} />
          <img className="p01-star p01-star--coral" src={starCoralUrl} alt="" draggable={false} />

          <h1 className="p01-title">어떤 체험을 해볼까요?</h1>
          <p className="p01-sub">원하는 체험을 골라 주세요</p>

          {MODE_CARDS.map((card) => (
            <button
              key={card.mode}
              type="button"
              className={`p01-card p01-card--${card.mode === 'A' ? 'a' : 'b'}`}
              onClick={() => pick(card.mode)}
            >
              {/* 그림 — 색 덩어리 위에 캐릭터. 캐릭터는 덩어리 아랫줄에서 잘리고 위로는 카드 밖까지 올라온다 */}
              <span className="p01-art" aria-hidden="true">
                <Blob className="p01-art__blob" />
                <img className="p01-art__star" src={starYellowUrl} alt="" draggable={false} />
                <span className="p01-art__clip">
                  <img className="p01-art__char" src={card.art} alt="" draggable={false} />
                </span>
              </span>

              <span className="p01-card__name">{card.name}</span>
              <span className="p01-card__desc">{card.desc}</span>

              {card.mode === 'B' && (
                <span className="p01-card__mail">
                  <MailIcon />
                  <span className="p01-card__mail-text">
                    보호자 메일로 목소리 리포트
                    <br />
                    (카카오 로그인 또는 이메일 입력)
                  </span>
                </span>
              )}

              {card.mode === 'A' && (
                <span className="p01-card__notice">
                  {A_NOTICE[0]}
                  <br />
                  {A_NOTICE[1]}
                </span>
              )}

              <span className="p01-go">
                <span className="p01-go__label">선택하기</span>
                <span className="p01-go__arrow" aria-hidden="true">
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
              </span>
            </button>
          ))}
        </Stage>
      </div>
    </Screen>
  )
}
