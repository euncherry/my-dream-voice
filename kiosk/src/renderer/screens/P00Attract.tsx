/**
 * P-00 [대기] — 타이틀 화면 겸용 (별도 타이틀 화면 없음)
 *
 * 근거: PAGE_SPEC §3 P-00 · V2_PLAN §3
 * 액션: [시작하기] 또는 화면 아무 곳이나 터치 → 세션 시작 → P-01[모드 선택]
 * 데이터: 세션 초기화 — 이전 세션의 남은 데이터를 지우고 새 세션 폴더를 받는다 (스토어 beginSession)
 *
 * ⚠️ 컨셉 문구 · 어트랙트 루프는 미확정이다 — 화면 디자인 때 새로 정한다 (PAGE_SPEC P-00 미결).
 *    v1의 컨셉 문구는 추천 직업이 빠지면서 폐기됐다 — 다시 넣지 않는다.
 */

import { useRef, useState, type ReactNode } from 'react'
import { DevStrip, Placeholder, Screen } from '../components/Screen'
import { useSession } from '../store/session'
import '../styles/select.css'

export function P00Attract(): ReactNode {
  const beginSession = useSession((s) => s.beginSession)
  const next = useSession((s) => s.next)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // busy 상태는 다음 렌더에야 바뀐다 — 연달아 들어오는 터치는 ref로 바로 막는다
  const startingRef = useRef(false)

  async function start(): Promise<void> {
    if (startingRef.current) return
    startingRef.current = true
    setBusy(true)
    setError(null)
    try {
      // 이전 세션 정리 · 세션 폴더 발급은 메인이 한다 (스토어가 window.api로 요청)
      await beginSession()
      // 기다리는 사이 개발용 화면 이동(DevBar)으로 화면이 바뀌었으면 넘기지 않는다
      if (useSession.getState().screen === 'P-00') next()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      // 성공하면 화면이 바뀌어 이 컴포넌트는 사라진다 — 실패해서 남아 있을 때 다시 누를 수 있게 푼다
      startingRef.current = false
      setBusy(false)
    }
  }

  return (
    <Screen id="P-00" note="화면 아무 곳이나 터치 → P-01[모드 선택]">
      {/* 터치 영역 — 바닥이든 본문이든 안쪽 어디를 눌러도 클릭이 여기로 올라와 start()가 한 번 불린다 */}
      <div className="p00-root" onClick={() => void start()}>
        {/* 본문 밖(양옆 여백 · 위쪽 띠)까지 덮는 투명한 바닥 */}
        <div className="p00-backdrop" aria-hidden="true" />

        <div className="p00-body">
          <h1 className="screen__title">마이 드림 보이스</h1>

          <div className="p00-concept">
            <Placeholder
              label="컨셉 문구 미확정 — 화면 디자인 때 새로 정함 (PAGE_SPEC P-00)"
              width="100%"
            />
          </div>

          <div className="p00-loop">
            <Placeholder label="어트랙트 루프 (영상 / 애니메이션) — 콘텐츠 미확정" width="100%" />
          </div>

          {/* 핸들러를 따로 달지 않는다 — 누르면 클릭이 바깥 터치 영역으로 올라간다 (두 번 불리지 않게) */}
          <button type="button" className="btn btn--primary btn--lg p00-start" disabled={busy}>
            시작하기
          </button>

          {error && <DevStrip label="세션 시작 실패">{error}</DevStrip>}
        </div>
      </div>
    </Screen>
  )
}
