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
 * 움직이는 것은 별 네 개뿐이다 (2026-11-22 지정 — 별만 · 잔잔하게). 저마다 다른 박자로 조금씩 떠다니고,
 *   7.2초에 한 번씩 돌아가며 별 옆에 반짝이가 잠깐 나타났다 사라진다 (강조는 이것뿐 — 별은 커지지 않는다).
 *   캐릭터 · 카드 · 버튼은 멈춰 있다.
 *   정한 과정: 폭을 2배쯤 키운 "더 화려하게"는 너무 둥실거려서 되돌렸고, 별이 한 번씩 커지는 것도 뺐다 — 다시 넣지 않는다.
 *   멈춘 화면은 고장으로 보이므로(PAGE_SPEC §2-5) 움직임을 아예 없애지는 않는다.
 *
 * 카드 글자는 이름과 한 줄 설명뿐이다 (2026-11-22 지정 — 카드를 가볍게).
 *   이름은 A "네컷 사진 찍기" · B "목소리도 분석받기" — 앞 낱말("네컷 사진" · "목소리도 분석")은 강조색(산호색)으로 쓴다.
 *   한 줄 설명은 A "직업을 고르고 네컷 사진을 찍어요." · B "사진도 찍고, 목소리 리포트도 받아요." (2026-11-22 지정).
 *   전에 있던 두 가지를 화면에서 뺐다 —
 *     · A 안내("사진과 촬영 영상은 이 기기에서만 쓰고 체험이 끝나면 지워요 · 보호자와 함께 이용해 주세요")
 *     · B의 받는 방법("보호자 메일로 목소리 리포트 (카카오 로그인 또는 이메일 입력)")
 * ⚠️ A는 동의 화면을 거치지 않는다 — A 안내를 뺀 지금은 A모드에 고지가 어디에도 없다.
 *    고지가 필요한지 · 필요하면 어디에 둘지는 법무 확인 (SPEC §10-3 · T-7). B는 P-02[동의] · P-02a[보호자 연결]에서 안내한다.
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
  /** 카드 이름 (PAGE_SPEC P-01) — 강조할 앞 낱말(em) + 나머지(rest). 이어 붙이면 이름 전체다 */
  name: { em: string; rest: string }
  /** 한 줄 설명 */
  desc: string
  /** 카드 그림 — 캐릭터 */
  art: string
}

const MODE_CARDS: ModeCard[] = [
  {
    mode: 'A',
    name: { em: '네컷 사진', rest: ' 찍기' },
    desc: '직업을 고르고 네컷 사진을 찍어요.',
    art: pilotCameraUrl,
  },
  {
    mode: 'B',
    name: { em: '목소리도 분석', rest: '받기' },
    desc: '사진도 찍고, 목소리 리포트도 받아요.',
    art: astronautMicUrl,
  },
]

/**
 * 별 하나 — 떠다니는 상자 안에 별 그림과 반짝이 두 개가 들어 있다.
 * 상자가 조금씩 떠다니고(위아래 · 좌우 · 기울기), 차례가 오면 별 옆에 반짝이가 잠깐 나타났다 사라진다 (별 그림은 커지지 않는다).
 * 자리 · 크기 · 박자는 className으로 받는다 (styles/p01.css). 꾸밈이라 터치는 받지 않는다.
 */
function Star({ className, src }: { className: string; src: string }): ReactNode {
  return (
    <span className={`p01-starbox ${className}`} aria-hidden="true">
      <img className="p01-starbox__img" src={src} alt="" draggable={false} />
      <i className="p01-starbox__spark p01-starbox__spark--1" />
      <i className="p01-starbox__spark p01-starbox__spark--2" />
    </span>
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

          <Star className="p01-star p01-star--yellow" src={starYellowUrl} />
          <Star className="p01-star p01-star--coral" src={starCoralUrl} />

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
                <Star className="p01-art__star" src={starYellowUrl} />
                <span className="p01-art__clip">
                  <img className="p01-art__char" src={card.art} alt="" draggable={false} />
                </span>
              </span>

              <span className="p01-card__name">
                <em>{card.name.em}</em>
                {card.name.rest}
              </span>
              <span className="p01-card__desc">{card.desc}</span>

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
