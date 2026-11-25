/**
 * M-02 [오류·폴백 안내] ✅ — 화면 위에 뜨는 창
 *
 * 근거: PAGE_SPEC "M-02 [오류·폴백 안내]" (v2)
 *
 * 띄우는 경우는 둘뿐이다 (store/session.ts의 Fallback.kind)
 *   - 카메라/마이크 없음 (device)
 *   - 인쇄 실패 (print) — P-07[분석 및 프린트]이 띄운다. [확인]으로 닫히면 M-03[완료 안내]로 넘어간다
 *
 * 띄우지 않는 경우 (v2 — v1에서는 띄웠다)
 *   - 분석 실패 · 서버 전송 실패 — 아이가 할 수 있는 일이 없고, 그 뒤 처리는 서버 몫이다 (SPEC §6-5).
 *     분석이 실패하면 P-07은 미리보기 없이 그대로 인쇄한다
 *   - P-02a[보호자 연결]의 서버 연결 실패 — 그 화면 안에서 [다시 시도] → [사진만 찍기]로 처리한다
 *
 * 구성: 아동이 읽어도 무섭지 않은 문구 + 다음 행동 안내 + [확인]
 * (detail은 개발자용 — 운영 화면에서는 뺀다)
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
