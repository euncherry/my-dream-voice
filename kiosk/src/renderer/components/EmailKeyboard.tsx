/**
 * components/EmailKeyboard.tsx — 이메일용 화면 키보드 (P-02a [보호자 연결] — 이메일 직접 입력)
 *
 * 키오스크에는 물리 키보드가 없고 OS 화면 키보드도 쓰지 않는다 — 주소는 이 키보드로만 넣는다.
 * 줄 배치는 구성 스케치(docs/user-flow/wf/p02a-email.svg)대로다.
 *
 *   1 2 3 4 5 6 7 8 9 0
 *   q w e r t y u i o p
 *   a s d f g h j k l @
 *   z x c v b n m . _ -
 *                 [⌫ 지우기]
 *
 * 내는 글자는 영문 소문자 · 숫자 · @ . _ - 뿐이다 (대문자 · 한글 · 띄어쓰기 없음).
 *
 * 이 컴포넌트는 값을 갖지 않는다 — 누른 글자만 알려 준다.
 * 주소는 화면(P02aGuardianLink)의 지역 상태에만 있고, 여기서는 기억하지도 기록하지도 않는다
 * (직접 입력한 이메일은 기기에 남기지 않는다 — PAGE_SPEC P-02a · CLAUDE.md 금지사항 4).
 *
 * 🎨 키 크기 · 모양은 styles/p02a.css의 .p02a-kbd · .p02a-key — 이메일 입력 화면 시안(2026-11-23)대로
 *    옅은 하늘색 판 안의 흰 키, [⌫ 지우기]는 파란 특수 키. 그 시안의 키 배치(⌫ 자리 · ⇧ · + · .com)는 아직 따르지 않았다
 *    (V2_BUILD_CHECKLIST 결정 표 ⑭).
 */

import { useEffect, type MouseEvent, type ReactNode } from 'react'
import '../styles/p02a.css'

/** 글자 키 4줄 — 한 줄에 10개 (스케치 배치) */
export const EMAIL_KEY_ROWS: readonly (readonly string[])[] = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', '@'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', '.', '_', '-'],
]

const EMAIL_CHARS: ReadonlySet<string> = new Set(EMAIL_KEY_ROWS.flat())

/** 이 키보드로 넣을 수 있는 글자인가 */
export function isEmailChar(char: string): boolean {
  return EMAIL_CHARS.has(char)
}

/**
 * 누른 키에 포커스가 남지 않게 한다.
 * 남아 있으면 (개발 PC) 물리 키보드의 Enter · Space가 그 키를 한 번 더 누른다.
 */
function keepFocus(e: MouseEvent<HTMLButtonElement>): void {
  e.preventDefault()
}

/** 다른 입력 요소(DevBar의 선택 상자 등)에 치는 중인가 */
function isTypingElsewhere(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    target.closest('input, select, textarea, [contenteditable="true"]') !== null
  )
}

export function EmailKeyboard({
  onKey,
  onBackspace,
  onEnter,
  disabled = false,
}: {
  /** 글자 키 하나 — 영문 소문자 · 숫자 · @ . _ - 중 하나 */
  onKey: (char: string) => void
  /** [⌫ 지우기] — 마지막 한 글자 */
  onBackspace: () => void
  /** 물리 키보드의 Enter (개발 PC) — 화면 키보드에는 Enter 키가 없다 ([확인]은 화면이 따로 둔다) */
  onEnter?: () => void
  /** 주소 확인 창이 떠 있는 동안 등 — 화면 키 · 물리 키 모두 받지 않는다 */
  disabled?: boolean
}): ReactNode {
  // 개발 PC — 물리 키보드로도 칠 수 있게 한다 (허용 문자만). 키오스크에는 물리 키보드가 없다.
  useEffect(() => {
    if (disabled) return

    const onKeyDown = (e: KeyboardEvent): void => {
      // 단축키(DevTools 등) · 한글 조합 중 · 다른 입력 요소는 건드리지 않는다
      if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return
      if (isTypingElsewhere(e.target)) return

      if (e.key === 'Backspace') {
        e.preventDefault()
        onBackspace()
        return
      }
      if (e.key === 'Enter') {
        if (!onEnter || e.repeat) return
        e.preventDefault()
        onEnter()
        return
      }
      // 대문자(Shift · CapsLock)는 소문자로 받는다. 그 밖의 글자는 버린다
      const char = e.key.length === 1 ? e.key.toLowerCase() : ''
      if (isEmailChar(char)) {
        e.preventDefault()
        onKey(char)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [disabled, onKey, onBackspace, onEnter])

  return (
    <div className="p02a-kbd" role="group" aria-label="이메일 입력 키보드">
      {EMAIL_KEY_ROWS.flat().map((char) => (
        <button
          key={char}
          type="button"
          className="p02a-key"
          tabIndex={-1}
          disabled={disabled}
          onMouseDown={keepFocus}
          onClick={() => onKey(char)}
        >
          {char}
        </button>
      ))}
      <button
        type="button"
        className="p02a-key p02a-key--back"
        tabIndex={-1}
        disabled={disabled}
        onMouseDown={keepFocus}
        onClick={onBackspace}
      >
        {/* 지우기 표시(⌫)는 글꼴에 맡기지 않고 직접 그린다 — 화면 글꼴에 이 글자가 없어 다른 글꼴의 가는 그림이 나온다 */}
        <svg className="p02a-key__bksp" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
          <path
            d="M18 10h21a3 3 0 0 1 3 3v22a3 3 0 0 1-3 3H18L5 24Z M24 19l9 10 M33 19l-9 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="5.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        지우기
      </button>
    </div>
  )
}
