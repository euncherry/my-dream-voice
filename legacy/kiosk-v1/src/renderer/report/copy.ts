/**
 * report/copy.ts — 보호자 리포트 문구
 *
 * 원본: docs/REPORT_TEMPLATE.md (기획 보완 및 직업 후보 제안서 PART 1)
 *
 * ⚠️ 작성 원칙 (CLAUDE.md 금지사항 8~10)
 *   - "판정" 표현 금지 — 정상/주의/지연 의심 · 스크리닝 · 선별 · 정확도 % 전부 금지
 *   - 문장의 주어는 아동이 아니라 AI의 인식 ("~하게 인식되었습니다")
 *   - 점수·별점·백분율·또래 비교·아동의 실제 인식 결과 표기 금지
 *   - 항상 면책 문구 포함
 */

import type { AgeGroup, PhonemeResult } from '@shared/types'

/** 리포트 제목 */
export const REPORT_TITLE = '마이 드림 보이스 · 오늘의 발화 관찰 리포트'

/** §2 연령대별 「왜 이 소리들을 살펴봤나요?」 */
export const WHY_BY_AGE_GROUP: Record<AgeGroup, string> = {
  '4-5':
    'ㅅ, ㄹ 같은 소리는 대체로 이 시기 아이들이 한창 익혀가는 소리예요. 그래서 오늘 직업 문장에 담아 어떻게 들리는지 살펴봤어요.',
  '6-7':
    'ㅅ, ㅆ, ㄹ 소리는 우리말에서 비교적 늦게까지 익혀지는 소리로 알려져 있어요. 이 시기 아이들이 자연스럽게 익혀가는 소리라, 오늘 직업 문장에 담아 어떻게 들리는지 살펴봤어요.',
  '8+': 'ㅅ, ㅆ, ㄹ 소리는 우리말에서 또렷하게 내기 까다로운 편이에요.',
}

/** §6 음소별 관찰 결과 — 2단계뿐 */
export const RESULT_PHRASE: Record<PhonemeResult, string> = {
  recognized: '또렷하게 잘 인식되었어요!',
  different: '일부 문장에서 다르게 인식되었어요',
}

/** 전부 잘 인식된 경우에만 붙는 종합 한 줄 */
export const ALL_RECOGNIZED_SUMMARY = '오늘은 살펴본 소리들이 목표 소리와 잘 맞게 인식되었어요.'

/** §7 조건부 — hasDifferent === true 일 때만 */
export const POSSIBLE_REASON =
  '주변 소음이나 마이크와의 거리, 긴장 등 외부 요인의 영향일 수 있어요.'

/**
 * 집에서 들어볼 연습 문장.
 * ⚠️ 원문 PDF에서 잘려 있어 확정 문구 미확보 (REPORT_TEMPLATE.md §4 주석).
 *    스파이크에서는 레이아웃만 검증한다.
 */
// TODO(T-3): 「집에서 들어보기」 연습 문장 확정 문구 확보 후 교체
export const HOME_PRACTICE_PLACEHOLDER = '[PLACEHOLDER] 연습 문장 확정 문구 미확보'

/** §8 격려 마무리 — 결과와 무관하게 항상 긍정 */
export function closing(childName: string): string {
  return `오늘 ${childName || 'OO'}이는 네 가지 직업을 씩씩하게 체험했어요. 멋진 하루였어요! 🌟`
}

/** §9 면책 — 의료적 진단이 아님을 항상 명시 */
export const DISCLAIMER =
  '이 결과는 오늘 말한 네 문장에서 관찰된 내용이며, 발달을 평가하는 것이 아니라 참고용 안내예요. AI가 인식한 결과를 알려드리는 것으로, 의료적 진단이 아닙니다.'

export const SECTION_TITLES = {
  jobs: '오늘 참여한 직업',
  lines: '오늘 말한 문장',
  sounds: '오늘 살펴본 소리',
  why: '왜 이 소리들을 살펴봤나요?',
  observation: '오늘의 관찰 결과',
  reason: '가능한 이유 안내',
  practice: '집에서 들어보기',
} as const
