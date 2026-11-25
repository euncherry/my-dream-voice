/**
 * components/Screen.tsx — 화면 틀 · placeholder 표기 · 개발용 띠
 *
 * 디자인 전 화면: 위쪽 띠에 PAGE_SPEC의 화면 코드(P-XX)와 한글명을 띄운다 (PAGE_SPEC §0).
 *   ⚠️ 색 · 글꼴 · 배치는 임시다 — 화면마다 피그마 디자인(1920×1080)을 받아 입힌다.
 * 디자인을 입힌 화면(`designed`): 위쪽 띠를 감추고 창 전체를 쓴다 — 안쪽은 <Stage>(components/Stage.tsx)로 그린다.
 *   화면 코드는 감춘 채로 남겨 둔다 (개발용 바 · 흐름 확인 스크립트가 읽는다).
 */

import type { ReactNode } from 'react'
import { SCREEN_TITLES, type ScreenId } from '../store/session'

export function Screen({
  id,
  children,
  note,
  onBack,
  designed,
}: {
  id: ScreenId
  children: ReactNode
  /** 위쪽 띠에 붙이는 개발용 메모 */
  note?: string
  /** 주면 왼쪽 위에 [← 뒤로]가 생긴다 (PAGE_SPEC §2-4) — 디자인 전 화면만. 디자인 화면은 자기 자리에 직접 그린다 */
  onBack?: () => void
  /** 디자인을 입힌 화면 — 위쪽 띠 없이 창 전체를 쓴다 */
  designed?: boolean
}): ReactNode {
  if (designed) {
    return (
      <div className="screen screen--designed">
        <div className="screen__bar" hidden>
          <span className="screen__code">{id}</span>
        </div>
        {children}
      </div>
    )
  }

  return (
    <div className="screen">
      <div className="screen__bar">
        <span className="screen__code">{id}</span>
        <span>[{SCREEN_TITLES[id]}]</span>
        {note && <span style={{ opacity: 0.7 }}>· {note}</span>}
        <span className="screen__stage">구조 단계 · 디자인 전</span>
      </div>
      <div className="screen__body">
        {onBack && (
          <button className="btn btn--ghost screen__back" onClick={onBack}>
            ← 뒤로
          </button>
        )}
        {children}
      </div>
    </div>
  )
}

/** 아트 · 문구가 미확정인 자리 — 눈에 보이게 (PAGE_SPEC §7-5) */
export function Placeholder({
  label,
  width,
  height,
}: {
  label: string
  width?: number | string
  height?: number | string
}): ReactNode {
  return (
    <div className="ph" style={{ width, height }}>
      PLACEHOLDER · {label}
    </div>
  )
}

export function PlaceholderTag({ label }: { label: string }): ReactNode {
  return <span className="ph ph--tag">PLACEHOLDER · {label}</span>
}

/**
 * 개발용 조작 — 운영 화면에는 없는 버튼을 손님 화면 요소와 섞이지 않게 한 줄로 묶어 보여 준다.
 * (mock 서버 · mock 받아쓰기 조작 등)
 */
export function DevStrip({ label, children }: { label: string; children: ReactNode }): ReactNode {
  return (
    <div className="devstrip">
      <span className="devstrip__label">개발용 · {label}</span>
      {children}
    </div>
  )
}
