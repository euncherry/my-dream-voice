/**
 * P-01 [모드 선택] 🟡
 * 쓰기: session.mode = "A" | "B"
 */

import type { ReactNode } from 'react'
import { PlaceholderTag, Screen } from '../components/Screen'
import { useSession } from '../store/session'
import type { KioskMode } from '@shared/types'

export function P01ModeSelect(): ReactNode {
  const setMode = useSession((s) => s.setMode)
  const goto = useSession((s) => s.goto)

  function pick(mode: KioskMode): void {
    setMode(mode)
    goto('P-02')
  }

  return (
    <Screen id="P-01" note="카드 2개 → P-02">
      <h1 className="screen__title">무엇을 할까요?</h1>

      <div className="row">
        <button className="btn btn--lg" onClick={() => pick('A')} style={{ width: 380 }}>
          A · 사진만 찍기
        </button>
        <button className="btn btn--lg" onClick={() => pick('B')} style={{ width: 380 }}>
          B · 목소리도 분석받기
        </button>
      </div>

      <PlaceholderTag label="카드 일러스트 · 소요 시간/제공물 안내 아이콘 · 문구 톤 미확정" />

      <button className="btn btn--ghost" onClick={() => goto('P-00')}>
        뒤로
      </button>
    </Screen>
  )
}
