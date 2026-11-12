/**
 * components/Screen.tsx — 화면 셸 · placeholder 표기
 *
 * 상단 바에 PAGE_SPEC의 화면 코드(P-XX)와 스파이크 범위를 항상 띄운다.
 * "코드·주석·커밋·대화 어디서든 코드와 한글명을 함께 쓴다" (PAGE_SPEC §0)
 */

import type { ReactNode } from 'react'
import { SCREEN_SPIKE, SCREEN_TITLES, type ScreenId } from '../store/session'

const SPIKE_LABEL = {
  full: '🟢 포함',
  min: '🟡 최소',
  none: '⚪ 제외',
} as const

export function Screen({
  id,
  children,
  note,
}: {
  id: ScreenId
  children: ReactNode
  note?: string
}): ReactNode {
  const level = SCREEN_SPIKE[id]
  return (
    <div className="screen">
      <div className="screen__bar">
        <span className="screen__code">{id}</span>
        <span>[{SCREEN_TITLES[id]}]</span>
        {note && <span style={{ opacity: 0.7 }}>· {note}</span>}
        <span className="screen__spike" data-level={level}>
          {SPIKE_LABEL[level]}
        </span>
      </div>
      <div className="screen__body">{children}</div>
    </div>
  )
}

/** 아트·문구가 미확정인 자리 — 눈에 보이게 (PAGE_SPEC §5-5) */
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
