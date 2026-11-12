/**
 * report/ReportTemplate.tsx — 보호자 리포트 템플릿 (PDF · 웹 공용, 템플릿 1개)
 *
 * SessionResult 하나만 받아 렌더하는 순수 컴포넌트. 하드코딩된 내용이 없다.
 * 섹션 구성은 docs/REPORT_TEMPLATE.md §1 순서를 그대로 따른다.
 *
 * ⚠️ 이 컴포넌트에 점수·별점·백분율·또래 비교 그래프·파형·아동의 실제 인식 결과를
 *    추가하지 말 것 — 전부 판정 성격 (CLAUDE.md 금지사항 9)
 */

import type { ReactNode } from 'react'
import { ageGroupLabel, jobLabel } from '@shared/jobs'
import type { SessionResult } from '@shared/types'
import {
  ALL_RECOGNIZED_SUMMARY,
  DISCLAIMER,
  HOME_PRACTICE_PLACEHOLDER,
  POSSIBLE_REASON,
  REPORT_TITLE,
  RESULT_PHRASE,
  SECTION_TITLES,
  WHY_BY_AGE_GROUP,
  closing,
} from './copy'
import './report.css'

function Section({ title, children }: { title: string; children: ReactNode }): ReactNode {
  return (
    <section className="rp-section">
      <h2 className="rp-section__title">{title}</h2>
      <div className="rp-section__body">{children}</div>
    </section>
  )
}

export function ReportTemplate({ data }: { data: SessionResult }): ReactNode {
  const { observation } = data
  const dateLabel = data.date.replaceAll('-', '.')

  return (
    <article className="rp">
      <header className="rp-header">
        <p className="rp-header__title">{REPORT_TITLE}</p>
        <p className="rp-header__meta">
          {data.childName || 'OO'}어린이 (만 {data.age}세) · {dateLabel} · {data.place}
        </p>
      </header>

      <Section title={SECTION_TITLES.jobs}>
        <p className="rp-jobs">{data.jobs.map((j) => jobLabel(j)).join(' · ')}</p>
      </Section>

      <Section title={SECTION_TITLES.lines}>
        <ul className="rp-lines">
          {data.jobs.map((job, i) => (
            <li key={`${job}-${i}`}>
              <span className="rp-lines__job">{jobLabel(job)}</span>
              <span className="rp-lines__text">&ldquo;{data.lines[i] ?? ''}&rdquo;</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={SECTION_TITLES.sounds}>
        <p className="rp-sounds">{observation.phonemes.map((p) => p.sound).join(' · ')}</p>
        <p className="rp-agegroup">{ageGroupLabel(data.ageGroup)} 기준</p>
      </Section>

      <Section title={SECTION_TITLES.why}>
        <p>{WHY_BY_AGE_GROUP[data.ageGroup]}</p>
      </Section>

      <Section title={SECTION_TITLES.observation}>
        <ul className="rp-observation">
          {observation.phonemes.map((p) => (
            <li key={p.sound} data-result={p.result}>
              <span className="rp-observation__sound">&lsquo;{p.sound}&rsquo; 소리</span>
              <span className="rp-observation__phrase">{RESULT_PHRASE[p.result]}</span>
            </li>
          ))}
        </ul>
        {!observation.hasDifferent && <p className="rp-summary">{ALL_RECOGNIZED_SUMMARY}</p>}
      </Section>

      {/* 조건부 — hasDifferent === true 일 때만 (REPORT_TEMPLATE.md §5) */}
      {observation.hasDifferent && (
        <>
          <Section title={SECTION_TITLES.reason}>
            <p>— {POSSIBLE_REASON}</p>
          </Section>
          <Section title={SECTION_TITLES.practice}>
            <p className="rp-placeholder">— {HOME_PRACTICE_PLACEHOLDER}</p>
          </Section>
        </>
      )}

      <p className="rp-closing">{closing(data.childName)}</p>

      <footer className="rp-disclaimer">{DISCLAIMER}</footer>
    </article>
  )
}
