/**
 * P-03 [연령 선택] — B모드 전용 · 🎨 디자인 입힘 (2026-11-23)
 *
 * 근거: PAGE_SPEC §3 P-03 · SPEC §3-2 · 디자인 시안(연령 선택 화면)
 * 목적: 시나리오 문장 난이도와 안내 톤을 정하는 필터 — 아이를 가르는 기준이 아니다 (SPEC §3-1)
 * 쓰기: session.ageGroup = '4' | '5' | '6+'
 * 액션: 나이 카드 누르기(다시 누르면 바뀜) → [다음] → P-04[직업 선택]
 *       [뒤로] → P-01[모드 선택] (스토어가 보호자 연결을 버리고 열린 세션을 닫는다)
 *
 * 별명(이름) 입력은 없다 (v2). 살펴볼 소리 같은 분석 정보는 이 화면에 내보내지 않는다.
 *
 * 그림은 assets/ 에 있다 — 배경(bg/sky) · 로고(brand/logo-en) · 숫자(ages/num-4 · num-5 · num-6plus) ·
 *   손가락으로 나이를 보여 주는 우주인(characters/astronaut-age4 · age5 · age6) · 발밑 구름(deco/cloud-front) · 별(deco/star-yellow).
 * 배치는 1920×1080 좌표 그대로다 (components/Stage.tsx) — 값은 styles/p03.css. [← 뒤로]는 공통 부품이다.
 *
 * 왼쪽 아래 우주인은 고른 나이만큼 손가락을 편다 (2026-11-23 지정):
 *   만 4세 → 손가락 4개 · 만 5세 → 5개(손을 흔든다) · 만 6세 이상 → 5개 + 검지 1개.
 *   아직 고르지 않았을 때는 손을 흔드는 그림(5개)이다 — 시안의 그림 (확인 필요 — 체크리스트 7-5).
 *   세 그림은 같은 틀로 잘라 두어서, 바꿔 끼워도 캐릭터가 제자리에 있다.
 *
 * 시안에는 "만 5세를 고른 모습" 한 장뿐이다. 나머지는 같은 모양으로 만들었다 (확인 필요 — 체크리스트 7-5):
 *   · 아무것도 고르지 않았을 때 — 카드 3장이 다 같은 모양 · [다음]은 흐리게 잠긴다
 *   · 고른 카드 — 1.08배로 커지고(시안은 1.045배 — 더 눈에 띄게 2026-11-23 지정) 파란 테두리 · 오른쪽 위에 동그라미 체크 (자리 · 크기는 시안대로)
 *
 * 연달아 두드린 터치를 막는다 — 화면이 바뀐 직후 0.4초(TAP_GUARD_MS)는 카드 · [다음]을 받지 않는다
 *   (P-02a "연결됐어요" 카드가 LINKED_SHOW_MS 뒤 저절로 넘어올 때, 그 카드를 두드리던 터치가 자리가 겹치는 나이 카드에 떨어지는 것 등).
 */

import type { ReactNode } from 'react'
import type { AgeGroup } from '@shared/types'
import { AGE_GROUPS, ageGroupLabel } from '@shared/jobs'
import { BackButton } from '../components/BackButton'
import { Screen } from '../components/Screen'
import { Stage } from '../components/Stage'
import { justChangedScreen, useSession } from '../store/session'
import skyUrl from '../assets/bg/sky.webp'
import logoEnUrl from '../assets/brand/logo-en.png'
import num4Url from '../assets/ages/num-4.webp'
import num5Url from '../assets/ages/num-5.webp'
import num6PlusUrl from '../assets/ages/num-6plus.webp'
import astronautAge4Url from '../assets/characters/astronaut-age4.webp'
import astronautAge5Url from '../assets/characters/astronaut-age5.webp'
import astronautAge6Url from '../assets/characters/astronaut-age6.webp'
import cloudFrontUrl from '../assets/deco/cloud-front.webp'
import starYellowUrl from '../assets/deco/star-yellow.png'
import '../styles/p03.css'

/** 나이마다 — 카드의 숫자 그림 · 우주인 그림 · CSS 이름표 */
const AGE_ART: Record<AgeGroup, { num: string; character: string; key: string }> = {
  '4': { num: num4Url, character: astronautAge4Url, key: '4' },
  '5': { num: num5Url, character: astronautAge5Url, key: '5' },
  '6+': { num: num6PlusUrl, character: astronautAge6Url, key: '6' },
}

/** 아직 고르지 않았을 때의 우주인 — 손을 흔드는 그림 (시안의 그림) */
const CHARACTER_IDLE = astronautAge5Url

/**
 * 만 4세 · 6세 이상 우주인을 앱이 뜰 때 미리 불러 둔다 — 처음 고를 때 그림을 불러오는 동안 우주인이 한두 프레임 비지 않게.
 * 참조를 잡아 두어 캐시에서 빠지지 않게 한다
 */
const preloadedCharacters: HTMLImageElement[] = [astronautAge4Url, astronautAge6Url].map((url) => {
  const img = new Image()
  img.src = url
  return img
})
void preloadedCharacters

function Arrow(): ReactNode {
  return (
    <span className="p03-next__arrow" aria-hidden="true">
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

/** 고른 카드 오른쪽 위의 체크 — 주황 동그라미 안의 흰 체크 */
function PickedMark(): ReactNode {
  return (
    <span className="p03-card__mark" aria-hidden="true">
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

/** "몇 살" 밑에 깔리는 분홍 붓질 — 시안의 강조 표시 */
function TitleMark(): ReactNode {
  return (
    <svg className="p03-title__mark" viewBox="0 0 290 56" aria-hidden="true" focusable="false">
      <path d="M7 31C8 18 17 9 32 8L262 2c14-.5 23 6 23 17 0 13-9 24-22 25L150 45 44 52C20 53 6 45 7 31Z" />
    </svg>
  )
}

export function P03AgeSelect(): ReactNode {
  const ageGroup = useSession((s) => s.session.ageGroup)
  const setAgeGroup = useSession((s) => s.setAgeGroup)
  const next = useSession((s) => s.next)
  const back = useSession((s) => s.back)

  function pick(group: AgeGroup): void {
    if (justChangedScreen()) return
    setAgeGroup(group)
  }

  function goNext(): void {
    if (justChangedScreen() || !ageGroup) return
    next() // → P-04
  }

  const character = ageGroup ? AGE_ART[ageGroup].character : CHARACTER_IDLE

  return (
    <Screen id="P-03" designed>
      <div className="p03">
        <Stage background={skyUrl}>
          <img className="p03-logo" src={logoEnUrl} alt="MY DREAM VOICE" draggable={false} />

          <BackButton onClick={back} />

          <img className="p03-star" src={starYellowUrl} alt="" draggable={false} />

          <h1 className="p03-title">
            <span className="p03-title__em">
              <TitleMark />
              <span className="p03-title__text">몇 살</span>
            </span>
            이에요?
          </h1>
          <p className="p03-sub">만 나이를 골라 주세요</p>

          {AGE_GROUPS.map((group, i) => {
            const picked = ageGroup === group
            const art = AGE_ART[group]
            return (
              <button
                key={group}
                type="button"
                className={`p03-card p03-card--${i + 1}`}
                aria-pressed={picked}
                data-picked={picked}
                onClick={() => pick(group)}
              >
                <img
                  className={`p03-card__num p03-card__num--${art.key}`}
                  src={art.num}
                  alt=""
                  draggable={false}
                />
                <span className="p03-card__label">{ageGroupLabel(group)}</span>
                {picked && <PickedMark />}
              </button>
            )
          })}

          <p className="p03-guide">나이에 맞는 직업 이야기를 준비해요</p>

          {/* 나이를 고르기 전에는 흐리게 잠긴다 */}
          <button type="button" className="p03-next" disabled={!ageGroup} onClick={goNext}>
            <span className="p03-next__label">다음</span>
            <Arrow />
          </button>

          {/* 왼쪽 아래 우주인 — 고른 나이만큼 손가락을 편다. 바뀔 때마다 한 번 통 튄다 (key로 새로 그린다).
              꾸밈이라 터치는 받지 않는다. 발밑은 구름이 가린다 */}
          <img
            key={ageGroup ?? 'idle'}
            className="p03-char"
            data-picked={ageGroup !== undefined}
            src={character}
            alt=""
            draggable={false}
          />
          <img className="p03-cloud" src={cloudFrontUrl} alt="" draggable={false} />
        </Stage>
      </div>
    </Screen>
  )
}
