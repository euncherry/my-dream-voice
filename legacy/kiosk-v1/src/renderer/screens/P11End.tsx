/**
 * P-11 [종료] 🟡
 * 데이터: 세션 데이터 폐기 — 로컬 WAV·사진·PDF 삭제
 *        (업로드본은 클라우드에서 24h 후 자동 삭제)
 */

import { useEffect, useState, type ReactNode } from 'react'
import { PlaceholderTag, Screen } from '../components/Screen'
import { useSession } from '../store/session'

const COUNTDOWN_SEC = 5

export function P11End(): ReactNode {
  const endSession = useSession((s) => s.endSession)
  const sessionId = useSession((s) => s.session.sessionId)
  const [left, setLeft] = useState(COUNTDOWN_SEC)
  const [purged, setPurged] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setLeft((n) => n - 1), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (left > 0) return
    void endSession().then(() => setPurged(true))
  }, [left, endSession])

  return (
    <Screen id="P-11" note="세션 데이터 폐기 후 P-00 복귀">
      <h1 className="screen__title">오늘도 멋졌어요!</h1>
      <PlaceholderTag label="체험관 유도 문구 미확정 (직업별 체험실 매핑 필요)" />
      <p className="screen__sub">{Math.max(left, 0)}초 후 처음으로</p>
      <p style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-dim)' }}>
        {purged ? '로컬 세션 폴더 삭제 완료' : `삭제 예정: ${sessionId ?? '—'}`}
      </p>
    </Screen>
  )
}
