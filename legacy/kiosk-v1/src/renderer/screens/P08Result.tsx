/**
 * P-08 [결과] 🟡 — B모드 전용
 *
 * ⚠️ 관찰 결과(ㅅ·ㅆ·ㄹ)를 절대 표시하지 않는다 — CLAUDE.md 금지사항 7.
 *    아동 화면에는 네컷 미리보기 · 추천 직업 · 한 줄 긍정 문구만.
 *    관찰 결과는 보호자 리포트(PDF)에만 들어간다.
 */

import type { ReactNode } from 'react'
import { PlaceholderTag, Screen } from '../components/Screen'
import { useSession } from '../store/session'
import { JOB_BY_ID } from '@shared/jobs'

export function P08Result(): ReactNode {
  const { recommendedJob, positiveMessage, composedPhoto } = useSession((s) => s.session)
  const next = useSession((s) => s.next)

  const job = recommendedJob ? JOB_BY_ID[recommendedJob] : undefined

  return (
    <Screen id="P-08" note="아동 화면 — 긍정 문구만">
      <h1 className="screen__title">오늘의 추천 직업</h1>

      {job && (
        <>
          <div
            className="jobcard__art"
            style={{ background: job.placeholderColor, width: 160, height: 160, fontSize: 14 }}
          >
            ART
          </div>
          <p style={{ fontSize: 'var(--fs-title)', fontWeight: 800, margin: 0 }}>{job.label}</p>
        </>
      )}

      <p className="screen__sub">{positiveMessage}</p>
      <PlaceholderTag label="긍정 문구 세트 미확정 · 추천 직업 산출 로직 미정 (SPEC T-1 — 현재 랜덤)" />

      {composedPhoto && (
        <p style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-dim)' }}>
          네컷: {composedPhoto}
        </p>
      )}

      <button className="btn btn--primary btn--lg" onClick={() => next()}>
        사진 뽑기 → P-09
      </button>
    </Screen>
  )
}
