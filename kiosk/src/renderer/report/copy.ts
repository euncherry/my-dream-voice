/**
 * report/copy.ts — 보호자 리포트 문구 + 아이 화면 긍정 문구
 *
 * 원본: docs/REPORT_TEMPLATE.md (기획 보완 및 직업 후보 제안서 PART 1)
 *
 * 리포트 PDF는 백엔드 서버가 만든다. 키오스크는 여기서 **문구를 완성해** 보내고(ReportText),
 * 같은 문구의 앞부분을 P-07[분석 및 프린트] B모드 미리보기에도 쓴다 — 문구 규칙을 한 곳에서 지키려는 것이다.
 *
 * ⚠️ 작성 원칙 (CLAUDE.md 금지사항 7~10)
 *   - "판정" 표현 금지 — 정상/주의/지연 의심 · 스크리닝 · 선별 · 정확도 % 전부 금지
 *   - 문장의 주어는 아동이 아니라 AI의 인식 ("~하게 인식되었습니다")
 *   - 점수·별점·백분율·또래 비교·아동의 실제 인식 결과 표기 금지
 *   - 항상 면책 문구 포함
 *   - 추천 직업은 어디에도 넣지 않는다 (v2)
 *
 * ⚠️ 문구는 아직 확정이 아니다 — 원문(보완서)을 v2에 맞게 기계적으로 옮긴 것이다
 *    (이름 삭제 · "네 가지 직업" → 직업 1개 · "네 문장" → 두 문장). 확정은 전문가 자문 뒤 (SPEC T-3).
 */

import { PLACE } from '@shared/constants'
import { ageGroupLabel, jobLabel, targetLinesFor, targetSoundsFor } from '@shared/jobs'
import type {
  AgeGroup,
  JobId,
  KioskMode,
  ObservationResult,
  ReportText,
  SoundResult,
} from '@shared/types'

/** 리포트 제목 */
export const REPORT_TITLE = '마이 드림 보이스 · 오늘의 발화 관찰 리포트'

/**
 * 연령 구간별 「왜 이 소리들을 살펴봤나요?」
 * ⚠️ 임시 배정 — 이전 구간(만 4-5세 · 만 6-7세) 문구를 그대로 옮겼다. 만 5세를 만 4세와 같게 둘지,
 *    만 6세 이상에 다른 톤을 섞을지는 자문 때 확정한다 (SPEC §3-2 · T-3).
 */
export const WHY_BY_AGE_GROUP: Record<AgeGroup, string> = {
  '4': 'ㅅ, ㄹ 같은 소리는 대체로 이 시기 아이들이 한창 익혀가는 소리예요. 그래서 오늘 직업 문장에 담아 어떻게 들리는지 살펴봤어요.',
  '5': 'ㅅ, ㄹ 같은 소리는 대체로 이 시기 아이들이 한창 익혀가는 소리예요. 그래서 오늘 직업 문장에 담아 어떻게 들리는지 살펴봤어요.',
  '6+':
    'ㅅ, ㅆ, ㄹ 소리는 우리말에서 비교적 늦게까지 익혀지는 소리로 알려져 있어요. 이 시기 아이들이 자연스럽게 익혀가는 소리라, 오늘 직업 문장에 담아 어떻게 들리는지 살펴봤어요.',
}

/**
 * 소리별 관찰 결과 — 결과 표현은 "잘 인식됨 / 다르게 인식됨" 2단계뿐이다.
 * skipped는 결과가 아니라 "살펴보지 못함"이다.
 */
export const RESULT_PHRASE: Record<SoundResult, string> = {
  well: '또렷하게 잘 인식되었어요!',
  different: '일부 문장에서 다르게 인식되었어요',
  // TODO: 살펴보지 못한 경우의 문구는 리포트 문구 확정 때 함께 정한다 (SPEC §6-5)
  skipped: '[PLACEHOLDER] 오늘은 살펴보지 못했어요 (문구 미확정)',
}

/** 전부 잘 인식된 경우에만 붙는 종합 한 줄 */
export const ALL_WELL_SUMMARY = '오늘은 살펴본 소리들이 목표 소리와 잘 맞게 인식되었어요.'

/** 조건부 — 다르게 인식된 소리가 있을 때만 */
export const POSSIBLE_REASON =
  '주변 소음이나 마이크와의 거리, 긴장 등 외부 요인의 영향일 수 있어요.'

/**
 * 집에서 들어볼 연습 문장.
 * ⚠️ 원문 PDF에서 잘려 있어 확정 문구가 없다 (REPORT_TEMPLATE.md §4 주석).
 */
// TODO(T-3): 「집에서 들어보기」 연습 문장 확정 문구 확보 후 교체
export const HOME_PRACTICE_PLACEHOLDER = '[PLACEHOLDER] 연습 문장 확정 문구 미확보'

/** 면책 — 의료적 진단이 아님을 항상 명시 (원문의 "네 문장" → 두 문장) */
export const DISCLAIMER =
  '이 결과는 오늘 말한 두 문장에서 관찰된 내용이며, 발달을 평가하는 것이 아니라 참고용 안내예요. AI가 인식한 결과를 알려드리는 것으로, 의료적 진단이 아닙니다.'

export const SECTION_TITLES = {
  job: '오늘 체험한 직업',
  spoken: '오늘 말한 문장',
  sounds: '오늘 살펴본 소리',
  why: '왜 이 소리들을 살펴봤나요?',
  observation: '오늘의 관찰 결과',
  reason: '가능한 이유 안내',
  practice: '집에서 들어보기',
} as const

/** 격려 마무리 — 결과와 무관하게 항상 긍정 (원문의 이름 · "네 가지 직업"을 뺐다) */
function closing(job: JobId): string {
  return `오늘은 ${jobLabel(job)} 직업을 씩씩하게 체험했어요. 멋진 하루였어요! 🌟`
}

function dateLabel(date: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}.${p(date.getMonth() + 1)}.${p(date.getDate())}`
}

/**
 * 리포트 문구 완성본 — 서버로 보내고, P-07 미리보기에도 쓴다.
 * 헤더에 이름은 없다 (v2에서 별명을 받지 않는다).
 */
export function buildReportText(input: {
  ageGroup: AgeGroup
  job: JobId
  /** 타깃 문장 2개 — 생략하면 시나리오 데이터에서 가져온다 */
  lines?: string[]
  observation: ObservationResult
  date?: Date
}): ReportText {
  const { ageGroup, job, observation } = input
  const lines = input.lines ?? targetLinesFor(job, ageGroup)

  const text: ReportText = {
    title: REPORT_TITLE,
    header: `${ageGroupLabel(ageGroup)} · ${dateLabel(input.date ?? new Date())} · ${PLACE}`,
    job: { title: SECTION_TITLES.job, lines: [jobLabel(job)] },
    spoken: { title: SECTION_TITLES.spoken, lines: lines.map((l) => `"${l}"`) },
    sounds: { title: SECTION_TITLES.sounds, lines: [targetSoundsFor(ageGroup).join(' · ')] },
    why: { title: SECTION_TITLES.why, lines: [WHY_BY_AGE_GROUP[ageGroup]] },
    observation: {
      title: SECTION_TITLES.observation,
      // 소리 단위로만 적는다 — 아이의 실제 인식 결과(예: '사건→다건')는 쓰지 않는다
      lines: observation.sounds.map((o) => `'${o.sound}' 소리 — ${RESULT_PHRASE[o.result]}`),
    },
    closing: closing(job),
    disclaimer: DISCLAIMER,
  }

  if (observation.sounds.length > 0 && observation.sounds.every((o) => o.result === 'well')) {
    text.summary = ALL_WELL_SUMMARY
  }
  if (observation.hasDifferent) {
    text.reason = { title: SECTION_TITLES.reason, lines: [POSSIBLE_REASON] }
    text.practice = { title: SECTION_TITLES.practice, lines: [HOME_PRACTICE_PLACEHOLDER] }
  }
  return text
}

// ────────────────────────────────────────────────────────────
// 아이 화면 긍정 문구 (P-07)
// ────────────────────────────────────────────────────────────

/** 받침이 있으면 '이', 없으면 '가' */
function subjectParticle(word: string): string {
  const last = word.charCodeAt(word.length - 1)
  if (last < 0xac00 || last > 0xd7a3) return '이(가)'
  return (last - 0xac00) % 28 === 0 ? '가' : '이'
}

export interface PositiveMessage {
  text: string
  /** spec = SPEC.md에 적힌 예시 문구 · placeholder = 같은 꼴로 임시로 만든 문구 */
  source: 'spec' | 'placeholder'
}

/**
 * 한 줄 긍정 문구. ⚠️ 문구 세트는 미확정이다 (PAGE_SPEC P-07 미결) — 화면에 PLACEHOLDER 표시를 같이 둔다.
 *
 *  - A모드: 발화가 없으므로 **목소리를 칭찬하지 않는다** — 고른 직업 · 사진만 (CLAUDE.md 금지사항 7)
 *  - B모드: 목소리 칭찬 가능
 */
export function positiveMessageFor(mode: KioskMode, job: JobId): PositiveMessage {
  if (mode === 'B') {
    // SPEC §6-2 예시 문구
    return { text: '또박또박 멋진 목소리!', source: 'spec' }
  }
  if (job === 'police') {
    // SPEC §4-1 예시 문구
    return { text: '멋진 경찰관이 되었어요!', source: 'spec' }
  }
  const label = jobLabel(job)
  return { text: `멋진 ${label}${subjectParticle(label)} 되었어요!`, source: 'placeholder' }
}
