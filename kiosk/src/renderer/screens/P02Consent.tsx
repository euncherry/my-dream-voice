/**
 * P-02 [동의] — B모드 전용 · 읽는 사람은 보호자 · 🎨 디자인 입힘 (2026-11-22)
 *
 * 근거: PAGE_SPEC §3 P-02 · SPEC §10 (T-7 설계안) · 디자인 시안(동의 화면)
 * 쓰기: session.consents · session.consentAt — 세 항목을 모두 체크하고 [시작]을 눌렀을 때만
 * 액션: 모두 체크 + [시작] → P-02a[보호자 연결]
 *       덜 체크 + [시작] → 안내 + 빠진 항목 강조 (화면 유지)
 *       [뒤로] → P-01[모드 선택] (스토어가 동의 기록을 지운다 — 목소리 동의가 싫으면 A를 고를 수 있다)
 *
 * 그림은 assets/ 에 있다 — 배경(bg/sky) · 로고(brand/logo-en) · 안내하는 우주인(characters/astronaut-guide) ·
 *   캐릭터 발밑을 가리는 구름(deco/cloud-front) · 별(deco/star-yellow).
 * 배치는 1920×1080 좌표 그대로다 (components/Stage.tsx) — 값은 styles/p02.css. [← 뒤로]는 공통 부품이다.
 *
 * 시안에는 "아무것도 체크하지 않은 모습" 한 장뿐이다. 나머지는 같은 모양으로 만들었다 (확인 필요 — 체크리스트 7-3):
 *   · 체크한 모습 — 네모가 남색으로 차고 흰 체크 표시
 *   · 덜 체크하고 [시작]을 눌렀을 때 — 제목 아래 한 줄이 안내("모두 동의해야 체험을 진행할 수 있어요")로 바뀌고,
 *     빠진 줄에 붉은(--d-warn) 테두리가 생기며 한 번 흔들린다
 *   · [자세히] · [전문 보기] 창
 *   · [시작] — 세 줄을 다 체크하기 전에는 흐린 모습(누르면 안내), 다 체크하면 또렷해지며 한 번 통 튄다 (2026-11-22 지정)
 * 사진 항목의 덧붙임 말("영상은 분석 및 프린트 화면 재생용, 체험 종료 시 삭제" — PAGE_SPEC)은 시안의 줄에 없어서
 *   그 항목의 [자세히] 창으로 옮겼다 (내용을 없애지는 않았다).
 *
 * 연달아 두드린 터치를 막는다 (동의 화면이라 저절로 체크되면 안 된다):
 *   · 화면이 바뀐 직후(0.4초) — P-01의 B 카드를 두 번 두드리면 둘째 터치가 이 화면의 체크 줄 · [시작]에 떨어진다
 *   · 창이 열리거나 닫힌 직후(0.4초) — [닫기]가 [전문 보기] · 셋째 줄 바로 위에 있어서, 닫자마자 다시 열리거나 체크가 바뀐다
 *
 * ⚠️ 동의 문구 전문은 미확정이다 — 법무 검토 (SPEC T-7).
 *    [자세히] · [전문 보기] 창 안은 PLACEHOLDER다. 임의로 약관 문구를 써 넣지 않는다.
 */

import { useRef, useState, type ReactNode } from 'react'
import { TAP_GUARD_MS } from '@shared/constants'
import type { Consents } from '@shared/types'
import { BackButton } from '../components/BackButton'
import { Placeholder, Screen } from '../components/Screen'
import { Stage } from '../components/Stage'
import { justChangedScreen, useSession } from '../store/session'
import skyUrl from '../assets/bg/sky.webp'
import logoEnUrl from '../assets/brand/logo-en.png'
import astronautGuideUrl from '../assets/characters/astronaut-guide.webp'
import cloudFrontUrl from '../assets/deco/cloud-front.webp'
import starYellowUrl from '../assets/deco/star-yellow.png'
import '../styles/p02.css'

type ConsentKey = keyof Consents
type Checked = Record<ConsentKey, boolean>

interface ConsentItem {
  key: ConsentKey
  /** 체크 항목 문구 — 시안 문구 (PAGE_SPEC P-02의 세 항목) */
  label: string
  /** 덧붙임 말 — 줄에는 없고 [자세히] 창에 보인다 */
  desc?: string
}

const ITEMS: ConsentItem[] = [
  { key: 'guardian', label: '보호자와 함께 체험합니다.' },
  { key: 'voice', label: '목소리 녹음·분석에 동의합니다.' },
  {
    key: 'photo',
    label: '사진 촬영·촬영 영상에 동의합니다.',
    desc: '영상은 분석 및 프린트 화면 재생용, 체험 종료 시 삭제',
  },
]

const SUB_DEFAULT = '아래 내용에 모두 동의해야 체험할 수 있어요'
/** 덜 체크하고 [시작]을 눌렀을 때의 안내 — PAGE_SPEC P-02 문구 그대로 */
const SUB_WARN = '모두 동의해야 체험을 진행할 수 있어요'

/** 창에 띄우는 문서 — 항목 하나의 [자세히] 또는 전체 전문 */
type DocId = ConsentKey | 'full'

const FULL_DOC_TITLE = '개인정보 수집·이용 전문'

function docItem(doc: DocId): ConsentItem | undefined {
  return doc === 'full' ? undefined : ITEMS.find((item) => item.key === doc)
}

function Chevron(): ReactNode {
  return (
    <svg className="p02-chevron" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M8 4l8 8-8 8"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function P02Consent(): ReactNode {
  const setConsents = useSession((s) => s.setConsents)
  const next = useSession((s) => s.next)
  const back = useSession((s) => s.back)

  // P-02a[보호자 연결]에서 [뒤로]로 돌아오면 동의 기록이 남아 있다 — 체크해 둔 그대로 보여 준다.
  // (P-01까지 돌아갔다 오면 스토어가 기록을 지웠으므로 빈 칸에서 시작한다)
  const [checked, setChecked] = useState<Checked>(() => {
    const saved = useSession.getState().session.consents
    return {
      guardian: saved?.guardian === true,
      voice: saved?.voice === true,
      photo: saved?.photo === true,
    }
  })
  /** 덜 체크한 채 [시작]을 누른 횟수 — 0보다 크면 빠진 항목을 강조한다. 누를 때마다 바뀌므로 흔들림도 다시 돈다 */
  const [warnCount, setWarnCount] = useState(0)
  const [doc, setDoc] = useState<DocId | null>(null)

  /** 창이 마지막으로 열리거나 닫힌 때 — 그 직후의 터치는 받지 않는다 (위 머리말) */
  const docChangedAt = useRef(-Infinity)
  const docJustChanged = (): boolean => performance.now() - docChangedAt.current < TAP_GUARD_MS

  const allChecked = ITEMS.every((item) => checked[item.key])
  const showWarn = warnCount > 0 && !allChecked

  function showDoc(next: DocId | null): void {
    if (justChangedScreen() || docJustChanged()) return
    docChangedAt.current = performance.now()
    setDoc(next)
  }

  function toggle(key: ConsentKey): void {
    if (justChangedScreen() || docJustChanged()) return
    setChecked((c) => ({ ...c, [key]: !c[key] }))
  }

  // [시작]은 항상 누를 수 있다 — 덜 체크했으면 넘어가지 않고 안내한다
  function start(): void {
    if (justChangedScreen() || docJustChanged()) return
    if (!allChecked) {
      setWarnCount((n) => n + 1)
      return
    }
    setConsents({ guardian: true, voice: true, photo: true })
    next() // → P-02a
  }

  const openItem = doc ? docItem(doc) : undefined

  return (
    <Screen id="P-02" designed>
      <div className="p02">
        <Stage background={skyUrl}>
          <img className="p02-logo" src={logoEnUrl} alt="MY DREAM VOICE" draggable={false} />

          <BackButton onClick={back} />

          <img className="p02-star" src={starYellowUrl} alt="" draggable={false} />

          <h1 className="p02-title">보호자님, 함께 확인해 주세요</h1>
          <p className="p02-sub" role="alert" data-warn={showWarn}>
            {showWarn ? SUB_WARN : SUB_DEFAULT}
          </p>

          <div className="p02-card">
            <ul className="p02-list">
              {ITEMS.map((item) => {
                const isChecked = checked[item.key]
                const isMissing = showWarn && !isChecked
                return (
                  <li
                    // 빠진 줄은 [시작]을 다시 누를 때마다 새로 그려서 흔들림이 다시 돈다
                    key={isMissing ? `${item.key}-${warnCount}` : item.key}
                    className="p02-item"
                    data-checked={isChecked}
                    data-missing={isMissing}
                  >
                    {/* 줄 전체(자세히 버튼 빼고)가 체크 영역이다 */}
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={isChecked}
                      className="p02-item__check"
                      onClick={() => toggle(item.key)}
                    >
                      <span className="p02-item__box" aria-hidden="true">
                        <svg viewBox="0 0 48 48" focusable="false">
                          <path
                            d="M11 25.5l9 9L37.5 15"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="6.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                      <span className="p02-item__badge">필수</span>
                      <span className="p02-item__label">{item.label}</span>
                    </button>
                    <button
                      type="button"
                      className="p02-item__more"
                      onClick={() => showDoc(item.key)}
                    >
                      자세히
                      <Chevron />
                    </button>
                  </li>
                )
              })}
            </ul>

            <button type="button" className="p02-full" onClick={() => showDoc('full')}>
              개인정보 수집·이용 전문 보기
              <Chevron />
            </button>
          </div>

          {/* 안내하는 캐릭터 — 카드 왼쪽 아래 모서리 앞에 서 있고, 발밑은 구름이 가린다. 꾸밈이라 터치는 받지 않는다 */}
          <img className="p02-char" src={astronautGuideUrl} alt="" draggable={false} />
          <img className="p02-cloud" src={cloudFrontUrl} alt="" draggable={false} />

          {/* 다 체크하기 전에는 흐린 모습이다 (data-ready) — 그래도 눌리고, 누르면 안내가 뜬다 */}
          <button type="button" className="p02-start" data-ready={allChecked} onClick={start}>
            <span className="p02-start__label">시작</span>
            <span className="p02-start__arrow" aria-hidden="true">
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
          </button>

          {doc && (
            <div
              className="p02-doc"
              role="dialog"
              aria-modal="true"
              aria-label={openItem?.label ?? FULL_DOC_TITLE}
            >
              <div className="p02-doc__panel">
                <strong className="p02-doc__title">{openItem?.label ?? FULL_DOC_TITLE}</strong>
                {openItem?.desc && <p className="p02-doc__desc">{openItem.desc}</p>}
                <div className="p02-doc__body">
                  <Placeholder
                    label="동의 문구 전문 미확정 — 법무 검토 (SPEC T-7)"
                    width="100%"
                    height="100%"
                  />
                </div>
                <button type="button" className="p02-doc__close" onClick={() => showDoc(null)}>
                  닫기
                </button>
              </div>
            </div>
          )}
        </Stage>
      </div>
    </Screen>
  )
}
