/**
 * components/BackButton.tsx — 디자인을 입힌 화면의 [← 뒤로] (PAGE_SPEC §2-4 되돌리기)
 *
 * 모양은 P-01 시안(2026-11-22)에서 정했다 — 왼쪽 위의 흰 알약. 디자인을 입힌 화면이 같이 쓴다.
 * <Stage> 안(1920×1080 좌표)에 둔다. 자리 · 크기는 styles/design.css.
 * 디자인 전 화면은 <Screen onBack>이 그리는 임시 버튼을 쓴다 (components/Screen.tsx).
 */

import type { ReactNode } from 'react'
import '../styles/design.css'

export function BackButton({
  onClick,
  disabled,
}: {
  onClick: () => void
  /** 진행 중이라 돌아갈 수 없을 때 (촬영 · 분석 · 인쇄 — PAGE_SPEC §2-4) */
  disabled?: boolean
}): ReactNode {
  return (
    <button type="button" className="d-back" onClick={onClick} disabled={disabled}>
      <svg className="d-back__arrow" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <path
          d="M40.5 24H9M21.5 9.5 7.5 24l14 14.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="9.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="d-back__label">뒤로</span>
    </button>
  )
}
