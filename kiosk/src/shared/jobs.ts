/**
 * src/shared/jobs.ts — 직업 6종 · 연령 구간 · 관찰 목표음 · 시나리오 데이터 (v2)
 *
 * SPEC.md §3-2 / §5 · PAGE_SPEC P-05 기준.
 *
 * ⚠️ 따라 말할 문장(직업마다 2개 × 만 4·5세 / 만 6세 이상) · 목표 소리 · 만 4세 어절 나누기는
 *    시나리오 초안(docs/P05_SCENARIO.md, 2026-11-23)의 **후보**다 — 전문가 확인 전 (SPEC T-3).
 *    경찰 문장 ①만 SPEC §3-2의 예시 그대로다.
 */

import type {
  AgeGroup,
  ContentSource,
  JobDef,
  JobId,
  LinePart,
  Scenario,
  ScenarioTurn,
  TargetLine,
  TargetSound,
} from './types'

// ────────────────────────────────────────────────────────────
// 직업 6종 (SPEC §5 — 2026-11-18)
// ────────────────────────────────────────────────────────────

export const JOBS: JobDef[] = [
  { id: 'police', label: '경찰', category: 'traditional', placeholderColor: '#3f5aa6' },
  { id: 'astronaut', label: '우주비행사', category: 'future', placeholderColor: '#6b5ce8' },
  { id: 'singer', label: '가수', category: 'traditional', placeholderColor: '#d05ac2' },
  { id: 'creator', label: '크리에이터', category: 'future', placeholderColor: '#4ac2a0' },
  { id: 'doctor', label: '의사', category: 'traditional', placeholderColor: '#4aa3e8' },
  { id: 'roboticist', label: '로봇개발자', category: 'future', placeholderColor: '#7d8a99' },
]

export const JOB_BY_ID: Record<JobId, JobDef> = Object.fromEntries(
  JOBS.map((j) => [j.id, j]),
) as Record<JobId, JobDef>

export function jobLabel(id: JobId): string {
  return JOB_BY_ID[id]?.label ?? id
}

// ────────────────────────────────────────────────────────────
// 연령 구간 (SPEC §3-2 — 만 4세 / 만 5세 / 만 6세 이상)
// ────────────────────────────────────────────────────────────

export const AGE_GROUPS: AgeGroup[] = ['4', '5', '6+']

/** 화면 · 리포트 표기용 */
export function ageGroupLabel(ageGroup: AgeGroup): string {
  return ageGroup === '6+' ? '만 6세 이상' : `만 ${ageGroup}세`
}

/**
 * 연령 구간별 관찰 목표음 (SPEC §3-2 **임시안** — 이전 구간을 그대로 옮긴 것, 자문 때 확정 · T-3)
 *  - 만 4 · 5세: ㅅ · ㄹ 중심 (ㅆ 제외)
 *  - 만 6세 이상: ㅅ · ㅆ · ㄹ
 */
export function targetSoundsFor(ageGroup: AgeGroup): TargetSound[] {
  return ageGroup === '6+' ? ['ㅅ', 'ㅆ', 'ㄹ'] : ['ㅅ', 'ㄹ']
}

// ────────────────────────────────────────────────────────────
// 시나리오 — 직업 × 연령 → 따라 말할 문장 2개 (docs/P05_SCENARIO.md §2)
// ────────────────────────────────────────────────────────────
//
// 장면 · 캐릭터 대사 · 연습("준비 완료!") 같은 대본은 화면 쪽 renderer/p05/script.ts 에 있다.
// 여기는 리포트 · 분석 · 서버도 같이 쓰는 "따라 말할 문장"만 둔다.
//
// ⚠️ 문장 · 목표 소리 · 만 4세 끊는 위치는 시나리오 초안의 **후보**다 — 전문가 확인 전 (SPEC T-3).
//    경찰 ①만 SPEC §3-2의 예시 그대로('spec'), 나머지는 초안('draft').
//    만 4 · 5세는 같은 문장 (만 4세는 어절마다 끊어 하나씩) · 만 6세 이상은 따로.

/** "ㅅ 사건 · ㄹ 현장으로·사이렌을" → 목표 소리와 그 소리가 든 낱말 */
function targets(spec: string): TargetLine['targets'] {
  return spec.split(' · ').flatMap((group) => {
    const [sound, words] = group.split(' ') as [TargetSound, string]
    return words.split('·').map((word) => ({ sound, word }))
  })
}

interface SentenceDef {
  text: string
  /** 만 4세 끊는 위치 (만 4 · 5세 문장만) */
  words?: string[]
  targets: string
  source?: ContentSource
}

interface JobSentences {
  /** 만 4 · 5세 — 문장 ① ② */
  young: [SentenceDef, SentenceDef]
  /** 만 6세 이상 — 문장 ① ② */
  older: [SentenceDef, SentenceDef]
}

const SENTENCES: Record<JobId, JobSentences> = {
  police: {
    young: [
      { text: '출동! 사건 현장으로!', words: ['출동!', '사건', '현장으로!'], targets: 'ㅅ 사건 · ㄹ 현장으로', source: 'spec' },
      { text: '사이렌을 울려라!', words: ['사이렌을', '울려라!'], targets: 'ㅅ 사이렌 · ㄹ 사이렌을·울려라' },
    ],
    older: [
      { text: '시민 여러분을 지키겠습니다! 충성!', targets: 'ㅅ 시민·충성 · ㄹ 여러분 · ㅆ 지키겠습니다', source: 'spec' },
      { text: '사이렌을 울리며 씽씽 달려갑니다!', targets: 'ㅅ 사이렌 · ㄹ 울리며·달려 · ㅆ 씽씽' },
    ],
  },
  astronaut: {
    young: [
      { text: '로켓 발사!', words: ['로켓', '발사!'], targets: 'ㄹ 로켓·발사 · ㅅ 발사' },
      { text: '별 사이로 출발!', words: ['별', '사이로', '출발!'], targets: 'ㄹ 별·출발 · ㅅ 사이로' },
    ],
    older: [
      { text: '로켓 발사! 별들 사이로 쌩쌩 날아가요!', targets: 'ㄹ 로켓·별들·날아 · ㅅ 발사·사이로 · ㅆ 쌩쌩' },
      { text: '새로운 별을 찾았습니다!', targets: 'ㅅ 새로운 · ㄹ 새로운·별을 · ㅆ 찾았습니다' },
    ],
  },
  singer: {
    young: [
      { text: '노래 시작!', words: ['노래', '시작!'], targets: 'ㄹ 노래 · ㅅ 시작' },
      { text: '사랑해요, 여러분!', words: ['사랑해요,', '여러분!'], targets: 'ㅅ 사랑 · ㄹ 사랑·여러분' },
    ],
    older: [
      { text: '씩씩하게 노래를 시작할게요!', targets: 'ㅆ 씩씩 · ㄹ 노래를·할게요 · ㅅ 시작' },
      { text: '여러분 사랑해요! 오늘 정말 신났어요!', targets: 'ㄹ 여러분·오늘·정말 · ㅅ 사랑·신났어요 · ㅆ 신났어요' },
    ],
  },
  creator: {
    young: [
      { text: '촬영 시작!', words: ['촬영', '시작!'], targets: 'ㄹ 촬영 · ㅅ 시작' },
      { text: '새 영상 올렸어!', words: ['새', '영상', '올렸어!'], targets: 'ㅅ 새·영상 · ㄹ 올렸어' },
    ],
    older: [
      { text: '안녕하세요, 여러분! 촬영을 시작할게요!', targets: 'ㅅ 하세요·시작 · ㄹ 여러분·촬영·할게요' },
      { text: '재미있는 영상, 쏙쏙 올릴게요!', targets: 'ㅅ 영상 · ㅆ 쏙쏙 · ㄹ 올릴게요' },
    ],
  },
  doctor: {
    young: [
      { text: '숨을 크게 쉬어요!', words: ['숨을', '크게', '쉬어요!'], targets: 'ㅅ 숨·쉬어요 · ㄹ 숨을' },
      { text: '선생님이 도와줄게!', words: ['선생님이', '도와줄게!'], targets: 'ㅅ 선생님 · ㄹ 도와줄게' },
    ],
    older: [
      { text: '숨을 크게 쉬어 보세요! 하나, 둘, 셋!', targets: 'ㅅ 숨·쉬어·보세요·셋 · ㄹ 숨을·둘' },
      { text: '씩씩하게 잘 참았어요! 사탕 선물!', targets: 'ㅆ 씩씩·참았어요 · ㄹ 잘·선물 · ㅅ 사탕·선물' },
    ],
  },
  roboticist: {
    young: [
      { text: '로봇 시동!', words: ['로봇', '시동!'], targets: 'ㄹ 로봇 · ㅅ 시동' },
      { text: '손을 흔들어 봐!', words: ['손을', '흔들어 봐!'], targets: 'ㅅ 손을 · ㄹ 손을·흔들어' },
    ],
    older: [
      { text: '로봇아, 스위치를 켜고 일어서라!', targets: 'ㄹ 로봇·스위치를·일어서라 · ㅅ 스위치·일어서라' },
      { text: '씽씽 달려서 선물을 가져와!', targets: 'ㅆ 씽씽 · ㄹ 달려서·선물을 · ㅅ 달려서·선물' },
    ],
  },
}

function turnOf(def: SentenceDef, ageGroup: AgeGroup): ScenarioTurn {
  // 만 4세만 어절마다 끊는다 (SPEC §2) — 그 외는 문장 전체가 한 구간
  const parts: LinePart[] =
    ageGroup === '4' && def.words ? def.words.map((text) => ({ text })) : [{ text: def.text }]
  return {
    line: { text: def.text, parts, targets: targets(def.targets), source: def.source ?? 'draft' },
  }
}

export function scenarioFor(job: JobId, ageGroup: AgeGroup): Scenario {
  const set = SENTENCES[job]
  const defs = ageGroup === '6+' ? set.older : set.young
  return { job, ageGroup, turns: [turnOf(defs[0], ageGroup), turnOf(defs[1], ageGroup)] }
}

/** 시나리오의 타깃 문장 2개 — 리포트 「오늘 말한 문장」 · 서버 lines */
export function targetLinesFor(job: JobId, ageGroup: AgeGroup): string[] {
  return scenarioFor(job, ageGroup).turns.map((t) => t.line.text)
}
