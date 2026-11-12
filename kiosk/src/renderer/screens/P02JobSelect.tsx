/**
 * P-02 [직업 선택] 🟡
 * 쓰기: session.jobs (4개) — 선택 순서 = 이후 발화·촬영 순서 (SPEC §2)
 * 아트 미제작 → 색 박스 + 텍스트 placeholder
 */

import type { ReactNode } from 'react'
import { PlaceholderTag, Screen } from '../components/Screen'
import { useSession } from '../store/session'
import { JOBS, JOB_PICK_COUNT } from '@shared/jobs'

export function P02JobSelect(): ReactNode {
  const jobs = useSession((s) => s.session.jobs)
  const mode = useSession((s) => s.session.mode)
  const toggleJob = useSession((s) => s.toggleJob)
  const goto = useSession((s) => s.goto)
  const next = useSession((s) => s.next)

  const done = jobs.length === JOB_PICK_COUNT

  return (
    <Screen id="P-02" note={`8종 중 ${JOB_PICK_COUNT}종 · 순서 = 발화·촬영 순서`}>
      <h1 className="screen__title">해보고 싶은 직업을 골라요</h1>
      <p className="screen__sub">
        {JOB_PICK_COUNT}개 중 {jobs.length}개 골랐어요
      </p>

      <div className="jobgrid">
        {JOBS.map((job) => {
          const order = jobs.indexOf(job.id)
          return (
            <button
              key={job.id}
              className="jobcard"
              data-picked={order >= 0}
              onClick={() => toggleJob(job.id)}
            >
              <span className="jobcard__art" style={{ background: job.placeholderColor }}>
                ART
              </span>
              <span>{job.label}</span>
              {order >= 0 && <span className="jobcard__badge">{order + 1}</span>}
            </button>
          )
        })}
      </div>

      <PlaceholderTag label="직업 일러스트 · SD 캐릭터 미제작 (색 박스로 대체)" />

      <div className="row">
        <button className="btn btn--ghost" onClick={() => goto('P-01')}>
          뒤로
        </button>
        <button className="btn btn--primary" disabled={!done} onClick={() => next()}>
          다음 {done && `→ ${mode === 'B' ? 'P-03' : 'P-06'}`}
        </button>
      </div>
    </Screen>
  )
}
