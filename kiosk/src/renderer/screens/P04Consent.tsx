/**
 * P-04 [동의] ⚪ — B모드 전용 · 스파이크 제외
 *
 * 문구 전체 미확정 (SPEC T-7 · 법무 검토 필요).
 * 임의 문구를 넣지 않는다 — placeholder 화면 + 즉시 통과.
 */

import type { ReactNode } from 'react'
import { Placeholder, Screen } from '../components/Screen'
import { useSession } from '../store/session'

export function P04Consent(): ReactNode {
  const patch = useSession((s) => s.patch)
  const next = useSession((s) => s.next)
  const goto = useSession((s) => s.goto)

  function accept(): void {
    patch({ consentAt: new Date().toISOString() })
    next()
  }

  return (
    <Screen id="P-04" note="스파이크 제외 — 즉시 통과">
      <h1 className="screen__title">보호자 확인</h1>

      <Placeholder
        label="개인정보 수집·이용 동의 문구 미확정 (SPEC T-7) — 법무 검토 후 작성. 음성·사진 폐기 시점 명시 필요"
        width={720}
        height={220}
      />

      <div className="row">
        <button className="btn btn--ghost" onClick={() => goto('P-03')}>
          뒤로
        </button>
        <button className="btn btn--primary" onClick={accept}>
          동의하고 시작 → P-05
        </button>
      </div>
    </Screen>
  )
}
