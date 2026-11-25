/**
 * src/shared/jobs.ts — 직업 6종 · 연령 구간 · 관찰 목표음 · 시나리오 데이터 (v2)
 *
 * SPEC.md §3-2 / §5 · PAGE_SPEC P-05 기준.
 *
 * ⚠️ 따라 말할 문장(직업마다 2개 × 만 4 · 5 · 6세 이상 — 2026-11-24 연령마다 다른 문장, 만 4세도 끊지 않는다) · 목표 소리는
 *    우주비행사만 발화 대사 자문 자료 그대로('expert')이고, 나머지는 시나리오 초안(docs/P05_SCENARIO.md)의 **후보**다 (SPEC T-3).
 *    경찰 만 5 · 6세 문장 ①은 SPEC §3-2의 예시 그대로다.
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
// ⚠️ 2026-11-24 — 만 4 · 5 · 6세 이상 **모두 다른 문장**이고, 만 4세도 **끊지 않고 한 번에** 말한다.
//    우주비행사는 자문 자료 그대로('expert'), 경찰 만 5 · 6세 ①은 SPEC §3-2의 예시('spec'), 나머지는 초안('draft' — 사용자가 고칠 예정).

/** "ㅅ 사건 · ㄹ 현장으로·사이렌을" → 목표 소리와 그 소리가 든 낱말 */
function targets(spec: string): TargetLine['targets'] {
  return spec.split(' · ').flatMap((group) => {
    const [sound, words] = group.split(' ') as [TargetSound, string]
    return words.split('·').map((word) => ({ sound, word }))
  })
}

interface SentenceDef {
  text: string
  targets: string
  source?: ContentSource
}

/** 연령마다 문장 ① ② — 만 4 · 5 · 6+ 모두 다른 문장 (2026-11-24) */
type JobSentences = Record<AgeGroup, [SentenceDef, SentenceDef]>

const SENTENCES: Record<JobId, JobSentences> = {
  police: {
    '4': [
      { text: '사이렌 출동!', targets: 'ㅅ 사이렌 · ㄹ 사이렌' },
      { text: '도둑을 잡아라!', targets: 'ㄹ 잡아라' },
    ],
    '5': [
      { text: '출동! 사건 현장으로!', targets: 'ㅅ 사건 · ㄹ 현장으로', source: 'spec' },
      { text: '사이렌을 울려라!', targets: 'ㅅ 사이렌 · ㄹ 사이렌을·울려라' },
    ],
    '6+': [
      { text: '시민 여러분을 지키겠습니다! 충성!', targets: 'ㅅ 시민·충성 · ㄹ 여러분 · ㅆ 지키겠습니다', source: 'spec' },
      { text: '사이렌을 울리며 씽씽 달려갑니다!', targets: 'ㅅ 사이렌 · ㄹ 울리며·달려 · ㅆ 씽씽' },
    ],
  },
  // 우주비행사 — 발화 대사 자문 자료 3.5 (2026-11-24 사용자 제공) 그대로. 목표 소리는 표의 ● (모음 사이 ㄹ · 다른 모음 앞 ㅅ·ㅆ)만 —
  // 보조 ○ (만 4세 없음 · 만 5세 ② 출 · ① 발 · ② 을·출 · 만 6세+ ① 시(ㅣ 앞))는 아직 데이터에 넣지 않았다
  astronaut: {
    '4': [
      { text: '우주로 날아가자!', targets: 'ㄹ 우주로', source: 'expert' },
      { text: '별나라로 출발!', targets: 'ㄹ 별나라로', source: 'expert' },
    ],
    '5': [
      { text: '우주선 발사 준비 끝!', targets: 'ㅅ 우주선·발사', source: 'expert' },
      { text: '별을 찾으러 우주로 출발!', targets: 'ㄹ 찾으러·우주로', source: 'expert' },
    ],
    '6+': [
      { text: '시스템 정상! 우주 여행 시작!', targets: 'ㅅ 시스템·정상', source: 'expert' },
      { text: '신비로운 별을 찾으러 가자!', targets: 'ㄹ 신비로운·찾으러', source: 'expert' },
    ],
  },
  singer: {
    '4': [
      { text: '노래하자!', targets: 'ㄹ 노래' },
      { text: '마이크 들고 시작!', targets: 'ㅅ 시작 · ㄹ 들고' },
    ],
    '5': [
      { text: '노래 시작!', targets: 'ㄹ 노래 · ㅅ 시작' },
      { text: '사랑해요, 여러분!', targets: 'ㅅ 사랑 · ㄹ 사랑·여러분' },
    ],
    '6+': [
      { text: '씩씩하게 노래를 시작할게요!', targets: 'ㅆ 씩씩 · ㄹ 노래를·할게요 · ㅅ 시작' },
      { text: '여러분 사랑해요! 오늘 정말 신났어요!', targets: 'ㄹ 여러분·오늘·정말 · ㅅ 사랑·신났어요 · ㅆ 신났어요' },
    ],
  },
  creator: {
    '4': [
      { text: '영상 찍자!', targets: 'ㅅ 영상' },
      { text: '구독 눌러 줘!', targets: 'ㄹ 눌러' },
    ],
    '5': [
      { text: '촬영 시작!', targets: 'ㄹ 촬영 · ㅅ 시작' },
      { text: '새 영상 올렸어!', targets: 'ㅅ 새·영상 · ㄹ 올렸어' },
    ],
    '6+': [
      { text: '안녕하세요, 여러분! 촬영을 시작할게요!', targets: 'ㅅ 하세요·시작 · ㄹ 여러분·촬영·할게요' },
      { text: '재미있는 영상, 쏙쏙 올릴게요!', targets: 'ㅅ 영상 · ㅆ 쏙쏙 · ㄹ 올릴게요' },
    ],
  },
  doctor: {
    '4': [
      { text: '숨을 쉬어 봐!', targets: 'ㅅ 숨을·쉬어 · ㄹ 숨을' },
      { text: '곰돌이 힘내!', targets: 'ㄹ 곰돌이' },
    ],
    '5': [
      { text: '숨을 크게 쉬어요!', targets: 'ㅅ 숨·쉬어요 · ㄹ 숨을' },
      { text: '선생님이 도와줄게!', targets: 'ㅅ 선생님 · ㄹ 도와줄게' },
    ],
    '6+': [
      { text: '숨을 크게 쉬어 보세요! 하나, 둘, 셋!', targets: 'ㅅ 숨·쉬어·보세요·셋 · ㄹ 숨을·둘' },
      { text: '씩씩하게 잘 참았어요! 사탕 선물!', targets: 'ㅆ 씩씩·참았어요 · ㄹ 잘·선물 · ㅅ 사탕·선물' },
    ],
  },
  roboticist: {
    '4': [
      { text: '로봇 일어나!', targets: 'ㄹ 로봇' },
      { text: '로봇아, 손 들어!', targets: 'ㅅ 손 · ㄹ 로봇아·들어' },
    ],
    '5': [
      { text: '로봇 시동!', targets: 'ㄹ 로봇 · ㅅ 시동' },
      { text: '손을 흔들어 봐!', targets: 'ㅅ 손을 · ㄹ 손을·흔들어' },
    ],
    '6+': [
      { text: '로봇아, 스위치를 켜고 일어서라!', targets: 'ㄹ 로봇·스위치를·일어서라 · ㅅ 스위치·일어서라' },
      { text: '씽씽 달려서 선물을 가져와!', targets: 'ㅆ 씽씽 · ㄹ 달려서·선물을 · ㅅ 달려서·선물' },
    ],
  },
}

function turnOf(def: SentenceDef): ScenarioTurn {
  // 어느 나이든 문장 전체를 한 번에 말한다 (2026-11-24 만 4세 끊기 없앰) — 구간은 늘 하나
  const parts: LinePart[] = [{ text: def.text }]
  return {
    line: { text: def.text, parts, targets: targets(def.targets), source: def.source ?? 'draft' },
  }
}

export function scenarioFor(job: JobId, ageGroup: AgeGroup): Scenario {
  const defs = SENTENCES[job][ageGroup]
  return { job, ageGroup, turns: [turnOf(defs[0]), turnOf(defs[1])] }
}

/** 시나리오의 타깃 문장 2개 — 리포트 「오늘 말한 문장」 · 서버 lines */
export function targetLinesFor(job: JobId, ageGroup: AgeGroup): string[] {
  return scenarioFor(job, ageGroup).turns.map((t) => t.line.text)
}
