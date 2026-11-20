/**
 * P-03 [연령 선택] — B모드 전용
 *
 * 근거: PAGE_SPEC §3 P-03 · SPEC §3-2 · 구성 스케치 p03-age
 * 목적: 시나리오 문장 난이도와 안내 톤을 정하는 필터 — 아이를 가르는 기준이 아니다 (SPEC §3-1)
 * 쓰기: session.ageGroup = '4' | '5' | '6+'
 * 액션: 나이 선택(다시 고르면 바뀜) → [다음] → P-04[직업 선택]
 *       [뒤로] → P-01[모드 선택] (스토어가 보호자 연결을 버리고 열린 세션을 닫는다)
 *
 * 별명(이름) 입력은 없다 (v2). 살펴볼 소리 같은 분석 정보는 이 화면에 내보내지 않는다.
 * ⚠️ 나이 버튼 그림 3개는 미제작 — PLACEHOLDER.
 */

import type { ReactNode } from 'react'
import { AGE_GROUPS, ageGroupLabel } from '@shared/jobs'
import { Placeholder, Screen } from '../components/Screen'
import { useSession } from '../store/session'
import '../styles/select.css'

export function P03AgeSelect(): ReactNode {
  const ageGroup = useSession((s) => s.session.ageGroup)
  const setAgeGroup = useSession((s) => s.setAgeGroup)
  const next = useSession((s) => s.next)
  const back = useSession((s) => s.back)

  return (
    <Screen id="P-03" note="B모드 전용 · 나이를 골라야 [다음] → P-04[직업 선택]" onBack={back}>
      <div className="pick">
        <header className="pick__head">
          <h1 className="screen__title">몇 살이에요?</h1>
          <p className="screen__sub">만 나이를 골라 주세요</p>
        </header>

        <div className="pick__main">
          {AGE_GROUPS.map((group) => {
            const picked = ageGroup === group
            return (
              <button
                key={group}
                type="button"
                className="btn pick-choice p03-age"
                aria-pressed={picked}
                data-picked={picked}
                onClick={() => setAgeGroup(group)}
              >
                <span className="p03-age__art">
                  <Placeholder label={`${ageGroupLabel(group)} 그림`} width="100%" />
                </span>
                <span className="p03-age__label">{ageGroupLabel(group)}</span>
              </button>
            )
          })}
        </div>

        <footer className="pick__foot pick__foot--end">
          <button
            type="button"
            className="btn btn--primary pick-go"
            disabled={!ageGroup}
            onClick={() => next()}
          >
            다음
          </button>
        </footer>
      </div>
    </Screen>
  )
}
