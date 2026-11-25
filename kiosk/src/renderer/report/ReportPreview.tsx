/**
 * report/ReportPreview.tsx — P-07 [분석 및 프린트] B모드 「리포트 미리보기」
 *
 * 근거: PAGE_SPEC "P-07 [분석 및 프린트]" ③ · SPEC §4-1(아이 화면) · §4-2(구성 요소 1~3) · CLAUDE.md 금지사항 7
 * 구성 스케치: docs/user-flow/wf/p07-result-b.svg
 *
 * 메일로 가는 리포트와 **같은 문구**(report/copy.ts의 buildReportText)의 **앞부분만** 보여 준다.
 *   보이는 것   — 제목 · 헤더(연령 · 날짜 · 장소) · 오늘 체험한 직업 · 오늘 말한 문장 · 오늘 살펴본 소리 · 왜 살펴봤는지
 *   가리는 것   — 오늘의 관찰 결과부터 끝까지
 *
 * ⚠️ 가리는 방식 — observation · summary · reason · practice · closing 의 **내용을 DOM에 넣지 않는다.**
 *    여럿이 보는 공공장소 화면이고, 아이 화면에 관찰 결과를 보이지 않는다는 원칙(CLAUDE.md 금지사항 7) 때문이다.
 *    CSS blur 등으로 "글자는 있는데 흐리게" 만드는 방식은 쓰지 않는다 — 그 자리에는 회색 막대(빈 요소)만 둔다.
 *    막대의 수 · 길이도 고정이다 (관찰 결과에 따라 모양이 달라지면 그것도 노출이다).
 *
 * ⚠️ 미리보기 범위는 확인 중이다 (SPEC T-16) — 지금은 제안안(직업 · 말한 문장 · 살펴본 소리와 이유)대로.
 *    색 · 글꼴 · 배치는 임시 — 피그마 디자인이 오면 입힌다.
 */

import type { ReactNode } from 'react'
import { PlaceholderTag } from '../components/Screen'
import type { ReportSection, ReportText } from '@shared/types'
import '../styles/p07.css'

/** 가린 자리의 회색 막대 수 — 고정 (길이는 p07.css) */
const VEIL_BARS = 4

/** 제목 | 내용 한 줄 (내용이 여러 줄이면 줄마다 — 넘치면 줄임) */
function Row({ section }: { section: ReportSection }): ReactNode {
  return (
    <>
      <dt>{section.title}</dt>
      <dd>
        {section.lines.map((line, i) => (
          <span key={i} className="p07-preview__line">
            {line}
          </span>
        ))}
      </dd>
    </>
  )
}

export function ReportPreview({ text }: { text: ReportText }): ReactNode {
  // 앞부분만 꺼낸다 — 관찰 결과 이하(observation · summary · reason · practice · closing)는 여기서 읽지 않는다
  const { title, header, job, spoken, sounds, why } = text

  return (
    <section className="p07-preview" aria-label="리포트 미리보기">
      <div className="p07-preview__top">
        <span className="p07-preview__badge">리포트 미리보기</span>
        <PlaceholderTag label="미리보기 범위 확인 중 (SPEC T-16)" />
      </div>

      <h2 className="p07-preview__title">{title}</h2>
      <p className="p07-preview__header p07-preview__line">{header}</p>

      <dl className="p07-preview__rows">
        <Row section={job} />
        <Row section={spoken} />
        <Row section={sounds} />
      </dl>

      <div className="p07-preview__why">
        <h3 className="p07-preview__why-title">{why.title}</h3>
        {why.lines.map((line, i) => (
          <p key={i} className="p07-preview__why-text">
            {line}
          </p>
        ))}
      </div>

      {/* 관찰 결과 자리 — 가린다. 막대는 빈 요소이고, 리포트 글자는 들어 있지 않다 */}
      <div className="p07-preview__veil">
        {Array.from({ length: VEIL_BARS }, (_, i) => (
          <span key={i} className="p07-preview__bar" aria-hidden="true" />
        ))}
        <strong className="p07-preview__veil-label">관찰 결과는 리포트에서</strong>
      </div>
    </section>
  )
}
