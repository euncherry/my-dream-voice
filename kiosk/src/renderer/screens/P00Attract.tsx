/**
 * P-00 [대기 화면] 🟡
 * 데이터: 세션 초기화 (이전 세션 잔여 데이터 폐기) — 여기서 세션 폴더를 발급받는다.
 */

import { useState, type ReactNode } from 'react'
import { Placeholder, Screen } from '../components/Screen'
import { useSession } from '../store/session'

export function P00Attract(): ReactNode {
  const beginSession = useSession((s) => s.beginSession)
  const next = useSession((s) => s.next)
  const sessionId = useSession((s) => s.session.sessionId)
  const [busy, setBusy] = useState(false)

  async function start(): Promise<void> {
    setBusy(true)
    try {
      await beginSession()
      next()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen id="P-00" note="터치 → P-01">
      <h1 className="screen__title">마이 드림 보이스</h1>
      <p className="screen__sub">내 목소리는 어떤 직업에 어울릴까?</p>

      <Placeholder label="어트랙트 루프 (영상/애니메이션) — T-3 대사 확정 후 제작" width={480} height={200} />

      <button className="btn btn--primary btn--lg" onClick={() => void start()} disabled={busy}>
        {busy ? '준비 중…' : '시작하기'}
      </button>

      {sessionId && (
        <p style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-dim)' }}>
          직전 세션: {sessionId}
        </p>
      )}
    </Screen>
  )
}
