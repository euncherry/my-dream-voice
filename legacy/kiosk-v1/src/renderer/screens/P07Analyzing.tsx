/**
 * P-07 [분석 중] 🟡 — B모드 전용
 *
 * ⚠️ MOCK: src/main/mock/analysis.ts 가 3~5초 지연 후 결과를 반환한다 (SPIKE_PLAN §5).
 * 이 화면의 목적은 그 대기 시간을 화면이 감당하는지 확인하는 것.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Placeholder, Screen } from '../components/Screen'
import { useSession } from '../store/session'

export function P07Analyzing(): ReactNode {
  const session = useSession((s) => s.session)
  const mockScenario = useSession((s) => s.mockScenario)
  const patch = useSession((s) => s.patch)
  const next = useSession((s) => s.next)
  const setFallback = useSession((s) => s.setFallback)

  const [elapsed, setElapsed] = useState(0)
  const started = useRef(false)

  useEffect(() => {
    const timer = setInterval(() => setElapsed((e) => e + 100), 100)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (started.current) return
    started.current = true

    void (async () => {
      try {
        const out = await window.api.analysis.run({
          sessionId: session.sessionId ?? '',
          ageGroup: session.ageGroup ?? '6-7',
          jobs: session.jobs,
          lines: session.lines ?? [],
          recordings: session.recordings ?? [],
          scenario: mockScenario, // ⚠️ MOCK 전용
        })
        patch({
          observation: out.observation,
          recommendedJob: out.recommendedJob,
          positiveMessage: out.positiveMessage,
        })
        next()
      } catch (e) {
        setFallback({
          kind: 'analysis',
          message: '목소리를 듣는 데 시간이 조금 더 걸렸어요. 사진은 그대로 나와요!',
          detail: (e as Error).message,
        })
        next()
      }
    })()
  }, [session, mockScenario, patch, next, setFallback])

  return (
    <Screen id="P-07" note="⚠️ MOCK 분석 (3~5초 지연)">
      <h1 className="screen__title">AI가 목소리를 듣고 있어요</h1>
      <Placeholder label="파형/애니메이션 연출 미구현" width={480} height={160} />
      <p className="screen__sub">{(elapsed / 1000).toFixed(1)}초</p>
      <p style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-dim)' }}>
        실제 분석 목표 5~7초 · 현재 시나리오: {mockScenario}
      </p>
    </Screen>
  )
}
