/**
 * P-03 [연령 입력] 🟡 — B모드 전용
 *
 * 목적: 관찰 문장(대사) 난이도와 안내 톤을 정하는 필터 (판정 기준 아님 — SPEC §3-1)
 * 쓰기: session.age, session.ageGroup, session.childName
 * ※ ageGroup 매핑 로직은 스파이크에서도 실제로 구현한다 (PAGE_SPEC P-03)
 */

import type { ReactNode } from 'react'
import { PlaceholderTag, Screen } from '../components/Screen'
import { useSession } from '../store/session'
import { AGE_OPTIONS, ageGroupLabel, targetSoundsFor } from '@shared/jobs'

export function P03AgeInput(): ReactNode {
  const { age, ageGroup, childName } = useSession((s) => s.session)
  const setAge = useSession((s) => s.setAge)
  const patch = useSession((s) => s.patch)
  const goto = useSession((s) => s.goto)
  const next = useSession((s) => s.next)

  return (
    <Screen id="P-03" note="연령 = 무엇을 살펴볼지 정하는 필터 (판정 기준 아님)">
      <h1 className="screen__title">몇 살이에요?</h1>

      <div className="row">
        {AGE_OPTIONS.map((a) => (
          <button
            key={a}
            className={`btn ${age === a ? 'btn--primary' : ''}`}
            onClick={() => setAge(a)}
          >
            만 {a}세{a === 8 ? ' 이상' : ''}
          </button>
        ))}
      </div>

      <label className="row" style={{ gap: 'var(--gap-sm)' }}>
        <span>이름</span>
        <input
          value={childName ?? ''}
          onChange={(e) => patch({ childName: e.target.value })}
          placeholder="리포트 헤더에 표기됩니다"
          style={{
            minHeight: 'var(--touch-min)',
            fontSize: 'var(--fs-body)',
            fontFamily: 'inherit',
            padding: '0 var(--gap-sm)',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--c-line)',
            background: 'var(--c-surface-2)',
            color: 'var(--c-text)',
          }}
        />
      </label>

      {ageGroup && (
        <p className="screen__sub">
          연령대 <b>{ageGroupLabel(ageGroup)}</b> · 오늘 살펴볼 소리{' '}
          <b>{targetSoundsFor(ageGroup).join(' · ')}</b>
        </p>
      )}

      <PlaceholderTag label="한글 IME 터치 키패드 미구현 (스파이크는 물리 키보드)" />

      <div className="row">
        <button className="btn btn--ghost" onClick={() => goto('P-02')}>
          뒤로
        </button>
        <button className="btn btn--primary" disabled={!age || !childName} onClick={() => next()}>
          다음 → P-04
        </button>
      </div>
    </Screen>
  )
}
