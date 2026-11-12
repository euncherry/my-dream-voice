/**
 * src/shared/jobs.ts — 직업 8종 · 연령 매핑 · 관찰 목표음 · 대사
 *
 * SPEC.md §3-2 / §5 기준.
 * ⚠️ 대사 24종은 미확정(SPEC T-3). 이번 스파이크는 경찰관 3종만 실제 문장이고,
 *    나머지는 화면에서 PLACEHOLDER로 눈에 보이게 표시한다 (PAGE_SPEC §5-5).
 */

import type { AgeGroup, JobDef, JobId, TargetSound } from './types'

// ────────────────────────────────────────────────────────────
// 직업 8종 (SPEC §5 — 확정)
// ────────────────────────────────────────────────────────────

export const JOBS: JobDef[] = [
  { id: 'athlete', label: '운동선수', category: 'traditional', placeholderColor: '#e8734a' },
  { id: 'doctor', label: '의사', category: 'traditional', placeholderColor: '#4aa3e8' },
  { id: 'chef', label: '요리사', category: 'traditional', placeholderColor: '#e8b84a' },
  { id: 'singer', label: '가수/아이돌', category: 'traditional', placeholderColor: '#d05ac2' },
  { id: 'police', label: '경찰관', category: 'traditional', placeholderColor: '#3f5aa6' },
  { id: 'creator', label: '콘텐츠크리에이터', category: 'future', placeholderColor: '#4ac2a0' },
  { id: 'astronaut', label: '우주비행사', category: 'future', placeholderColor: '#6b5ce8' },
  { id: 'roboticist', label: '로봇개발자', category: 'future', placeholderColor: '#7d8a99' },
]

export const JOB_BY_ID: Record<JobId, JobDef> = Object.fromEntries(
  JOBS.map((j) => [j.id, j]),
) as Record<JobId, JobDef>

export function jobLabel(id: JobId): string {
  return JOB_BY_ID[id]?.label ?? id
}

/** 아동이 선택해야 하는 직업 개수 (SPEC §2) */
export const JOB_PICK_COUNT = 4

// ────────────────────────────────────────────────────────────
// 연령 → 연령대 매핑 (PAGE_SPEC P-03 — "매핑 로직은 실제로 구현")
// ────────────────────────────────────────────────────────────

/** 화면에 노출할 나이 버튼 (만 4·5·6·7·8세 이상) */
export const AGE_OPTIONS = [4, 5, 6, 7, 8] as const

export function toAgeGroup(age: number): AgeGroup {
  if (age <= 5) return '4-5'
  if (age <= 7) return '6-7'
  return '8+'
}

/** 화면·리포트 표기용 연령대 라벨 */
export function ageGroupLabel(ageGroup: AgeGroup): string {
  return ageGroup === '8+' ? '만 8세 이상' : `만 ${ageGroup}세`
}

/**
 * 연령대별 관찰 목표음 (SPEC §3-2)
 *  - 만 4-5세: ㅅ · ㄹ 중심 (ㅆ 제외)
 *  - 만 6-7세 / 8세+: ㅅ · ㅆ · ㄹ
 */
export function targetSoundsFor(ageGroup: AgeGroup): TargetSound[] {
  return ageGroup === '4-5' ? ['ㅅ', 'ㄹ'] : ['ㅅ', 'ㅆ', 'ㄹ']
}

// ────────────────────────────────────────────────────────────
// 대사 (SPEC T-3 미확정)
// ────────────────────────────────────────────────────────────

export type LineSource =
  /** SPEC.md §3-2에 명시된 확정 예시 */
  | 'spec'
  /** docs/REPORT_TEMPLATE.md 예시에서 가져온 문장 (연령 구분 없음) */
  | 'doc'
  /** ⚠️ 미확정 — 화면에 PLACEHOLDER로 표시 */
  | 'placeholder'

export interface JobLine {
  text: string
  source: LineSource
}

const PLACEHOLDER_LINE = (label: string, ageGroup: AgeGroup): JobLine => ({
  // TODO(T-3): 전문가 자문 후 직업별 대사 24종 확정 → 이 자리를 교체
  text: `(대사 미정) ${label} · ${ageGroupLabel(ageGroup)} 대사가 들어갈 자리`,
  source: 'placeholder',
})

/**
 * 직업 × 연령대 대사표.
 * 경찰관 3종만 SPEC 확정 예시, 요리사·가수는 REPORT_TEMPLATE 예시 문장,
 * 나머지 5종은 placeholder.
 */
const LINES: Partial<Record<JobId, Partial<Record<AgeGroup, JobLine>>>> = {
  // SPEC §3-2 대사 예시 — 경찰관 (확정 예시)
  police: {
    '4-5': { text: '출동! 사건 현장으로!', source: 'spec' },
    '6-7': { text: '시민 여러분을 지키겠습니다! 충성!', source: 'spec' },
    '8+': { text: '시민의 안전을 살피고, 질서를 지키겠습니다! 충성!', source: 'spec' },
  },
  // docs/REPORT_TEMPLATE.md 시나리오 예시에 등장하는 문장 (연령 구분 없음)
  chef: {
    '4-5': { text: '맛있게 만들어요!', source: 'doc' },
    '6-7': { text: '맛있게 만들어요!', source: 'doc' },
    '8+': { text: '맛있게 만들어요!', source: 'doc' },
  },
  singer: {
    '4-5': { text: '사랑을 노래할게요!', source: 'doc' },
    '6-7': { text: '사랑을 노래할게요!', source: 'doc' },
    '8+': { text: '사랑을 노래할게요!', source: 'doc' },
  },
}

export function lineFor(jobId: JobId, ageGroup: AgeGroup): JobLine {
  return LINES[jobId]?.[ageGroup] ?? PLACEHOLDER_LINE(jobLabel(jobId), ageGroup)
}

export function linesFor(jobs: JobId[], ageGroup: AgeGroup): JobLine[] {
  return jobs.map((j) => lineFor(j, ageGroup))
}
