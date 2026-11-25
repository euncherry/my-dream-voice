/**
 * components/DevBar.tsx — 스파이크 전용 조작 바
 *
 * 운영 빌드에는 포함하지 않는다 (D-01과 같은 취급).
 *  - 화면 방향 토글: T-2(가로/세로 미정) 대응이 실제로 되는지 눈으로 확인
 *  - mock 시나리오 토글: 「전부 잘 인식됨」/「일부 다르게 인식됨」 두 리포트 레이아웃 확인 (SPIKE_PLAN §5)
 */

import { useState, type ReactNode } from 'react'
import { useSession } from '../store/session'
import type { AnalysisScenario } from '@shared/types'

const SCENARIOS: { id: AnalysisScenario; label: string }[] = [
  { id: 'random', label: '랜덤' },
  { id: 'all-recognized', label: '전부 잘 인식됨' },
  { id: 'some-different', label: '일부 다르게 인식됨' },
]

export function DevBar(): ReactNode {
  const goto = useSession((s) => s.goto)
  const mockScenario = useSession((s) => s.mockScenario)
  const setMockScenario = useSession((s) => s.setMockScenario)
  const [portrait, setPortrait] = useState(false)

  function toggleOrientation(): void {
    const nextPortrait = !portrait
    setPortrait(nextPortrait)
    document.documentElement.dataset['orientation'] = nextPortrait ? 'portrait' : 'landscape'
  }

  function cycleScenario(): void {
    const i = SCENARIOS.findIndex((s) => s.id === mockScenario)
    setMockScenario(SCENARIOS[(i + 1) % SCENARIOS.length]!.id)
  }

  return (
    <div className="devbar">
      <button onClick={() => goto('D-01')}>D-01</button>
      <button onClick={toggleOrientation}>방향: {portrait ? '세로' : '가로'} (T-2)</button>
      <button onClick={cycleScenario}>
        MOCK: {SCENARIOS.find((s) => s.id === mockScenario)?.label}
      </button>
    </div>
  )
}
