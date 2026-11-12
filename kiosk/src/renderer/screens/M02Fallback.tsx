/**
 * M-02 [오류·폴백 안내] 🟡
 *
 * 케이스: 카메라/마이크 없음 · 인쇄 실패 · 업로드 실패 · 분석 실패
 * 아동이 읽어도 무섭지 않은 문구 + 다음 행동 안내 + [확인]
 * 스파이크: 인쇄·업로드 실패 케이스만 최소 구현
 */

import type { ReactNode } from 'react'
import { useSession } from '../store/session'

export function M02Fallback(): ReactNode {
  const fallback = useSession((s) => s.fallback)
  const setFallback = useSession((s) => s.setFallback)

  if (!fallback) return null

  return (
    <div className="modal__scrim">
      <div className="modal">
        <strong style={{ fontSize: 'var(--fs-heading)' }}>{fallback.message}</strong>
        {fallback.detail && (
          <code style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-dim)' }}>
            [개발용] {fallback.kind} · {fallback.detail}
          </code>
        )}
        <button className="btn btn--primary" onClick={() => setFallback(null)}>
          확인
        </button>
      </div>
    </div>
  )
}
