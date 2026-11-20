/**
 * P-01 [모드 선택] — 네컷만 찍을지, 목소리 리포트까지 받을지
 *
 * 근거: PAGE_SPEC §3 P-01 · V2_PLAN §3 · SPEC §10 (A모드 안내 — T-7)
 * 쓰기: session.mode = 'A' | 'B'
 * 액션: A 카드 → P-04[직업 선택] (동의 화면 없음) / B 카드 → P-02[동의] / [뒤로] → P-00[대기]
 *       다음 화면은 스토어의 nextScreen()이 정한다 — 여기서 화면 번호를 고르지 않는다.
 *
 * A는 동의 화면을 거치지 않으므로 안내 한 줄을 이 화면에 둔다 (2026-11-19).
 * ⚠️ 안내 문구 · 위치(A 카드 안 / 화면 아래)는 미확정 — 법무 확인 (SPEC T-7).
 *    지금은 PAGE_SPEC의 임시 문구를 화면 아래에 둔다.
 */

import type { ReactNode } from 'react'
import type { KioskMode } from '@shared/types'
import { Placeholder, PlaceholderTag, Screen } from '../components/Screen'
import { justChangedScreen, useSession } from '../store/session'
import '../styles/select.css'

interface ModeCard {
  mode: KioskMode
  /** 카드 이름 (PAGE_SPEC P-01) */
  name: string
  /** 제공물 안내 (PAGE_SPEC P-01) */
  gives: string
  /** 리포트를 받는 방법 — B만 */
  how?: string
}

const MODE_CARDS: ModeCard[] = [
  { mode: 'A', name: '사진만 찍기', gives: '네컷 사진' },
  {
    mode: 'B',
    name: '목소리도 분석받기',
    gives: '네컷 사진 + 보호자 메일로 목소리 리포트',
    how: '카카오 로그인 또는 이메일 입력',
  },
]

/** A 안내 한 줄 — PAGE_SPEC P-01의 임시 문구 그대로 (법무 확인 전 · SPEC T-7) */
const A_NOTICE =
  '사진과 촬영 영상은 이 기기에서만 쓰고 체험이 끝나면 지워요 · 보호자와 함께 이용해 주세요'

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
    <Screen id="P-01" note="A → P-04[직업 선택] · B → P-02[동의]" onBack={back}>
      <div className="pick">
        <header className="pick__head">
          {/* 문서에 제목 문구가 없다 — 흐름도 앱 캡처(shots/p01)의 임시 문구를 그대로 둔다 */}
          <h1 className="screen__title">무엇을 할까요?</h1>
          <PlaceholderTag label="제목 문구 미확정 (임시)" />
        </header>

        <div className="pick__main">
          {MODE_CARDS.map((card) => (
            <button
              key={card.mode}
              type="button"
              className="btn p01-card"
              onClick={() => pick(card.mode)}
            >
              <span className="p01-card__art">
                <Placeholder label={`${card.mode} 카드 그림`} width="100%" />
              </span>
              <span className="p01-card__name">
                {card.mode} · {card.name}
              </span>
              <span className="p01-card__gives">{card.gives}</span>
              {card.how && <span className="p01-card__how">({card.how})</span>}
              <PlaceholderTag label="소요 시간 · 제공물 아이콘 미확정" />
            </button>
          ))}
        </div>

        <footer className="pick__foot p01-notice">
          <p className="p01-notice__text">{A_NOTICE}</p>
          <PlaceholderTag label="안내 문구 · 위치 — 법무 확인 (SPEC T-7)" />
        </footer>
      </div>
    </Screen>
  )
}
