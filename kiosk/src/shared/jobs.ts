/**
 * src/shared/jobs.ts — 직업 6종 · 연령 구간 · 관찰 목표음 · 시나리오 데이터 (v2)
 *
 * SPEC.md §3-2 / §5 · PAGE_SPEC P-05 기준.
 *
 * ⚠️ 시나리오 18종(6직업 × 3연령) · 타깃 문장 36개 · 문장 음성 파일 · 만 4세 어절 나누기는
 *    전부 미확정이다 (SPEC T-3 — 기획 · 전문가 자문). 지금 들어 있는 실제 문장은
 *    SPEC §3-2의 경찰 예시뿐이고, 나머지는 화면에서 PLACEHOLDER로 눈에 보이게 표시한다.
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
// 녹음 멘트 (SPEC §2 — 음성 파일은 기획 제공 전, T-3)
// ────────────────────────────────────────────────────────────

/**
 * 멘트 자막은 SPEC에 확정된 문구다. 음성 파일은 아직 없다 —
 * 파일을 아래 경로에 넣으면 그대로 재생되고, 없으면 자막만 잠깐 보여 준다.
 */
export const CUES = {
  speakNow: { text: '이제 말해 보자!', audio: './audio/voice/cue-speak-now.mp3' },
  oneMore: { text: '한 번 더 말해 볼까요?', audio: './audio/voice/cue-one-more.mp3' },
} as const

// ────────────────────────────────────────────────────────────
// 시나리오 (직업 × 연령 → 장면 + 타깃 문장 2개)
// ────────────────────────────────────────────────────────────

const whole = (text: string): LinePart[] => [{ text }]

function line(
  text: string,
  targets: TargetLine['targets'],
  source: ContentSource,
  parts: LinePart[] = whole(text),
): TargetLine {
  return { text, parts, targets, source }
}

/** TODO(T-3): 시나리오 · 타깃 문장 확정 후 이 자리를 교체 */
function placeholderTurn(job: JobId, ageGroup: AgeGroup, order: 1 | 2): ScenarioTurn {
  const tag = `${jobLabel(job)} · ${ageGroupLabel(ageGroup)}`
  return {
    narration: `(장면 미정) ${tag} 시나리오 장면 ${order}`,
    narrationSource: 'placeholder',
    line: line(`(문장 미정) ${tag} 타깃 문장 ${order}`, [], 'placeholder'),
  }
}

/** 흐름도 구성 스케치(p05-speak)의 예시 내레이션 — 임시 */
const POLICE_NARRATION = '출동 신호가 왔어요! 경찰관, 외쳐 볼까요?'

/**
 * 지금 들어 있는 실제 문장 — SPEC §3-2 「문장 예시 — 경찰」.
 * 시나리오 속 타깃 문장으로 다시 쓰기로 했으므로(T-3) 이것도 확정이 아니다.
 * 경찰도 두 번째 타깃 문장은 아직 없다.
 */
const TURNS: Partial<Record<JobId, Partial<Record<AgeGroup, Partial<Record<1 | 2, ScenarioTurn>>>>>> =
  {
    police: {
      '4': {
        1: {
          narration: POLICE_NARRATION,
          narrationSource: 'sketch',
          // 만 4세는 어절마다 끊는다 — 끊는 위치는 SPEC §2의 예시 그대로 (확정은 T-3)
          line: line(
            '출동! 사건 현장으로!',
            [
              { sound: 'ㅅ', word: '사건' },
              { sound: 'ㄹ', word: '현장으로' },
            ],
            'spec',
            [{ text: '출동!' }, { text: '사건' }, { text: '현장으로!' }],
          ),
        },
      },
      '5': {
        1: {
          narration: POLICE_NARRATION,
          narrationSource: 'sketch',
          line: line(
            '출동! 사건 현장으로!',
            [
              { sound: 'ㅅ', word: '사건' },
              { sound: 'ㄹ', word: '현장으로' },
            ],
            'spec',
          ),
        },
      },
      '6+': {
        1: {
          narration: POLICE_NARRATION,
          narrationSource: 'sketch',
          line: line(
            '시민 여러분을 지키겠습니다! 충성!',
            [
              { sound: 'ㅅ', word: '시민' },
              { sound: 'ㄹ', word: '여러분' },
              { sound: 'ㅆ', word: '지키겠습니다' },
            ],
            'spec',
          ),
        },
      },
    },
  }

export function scenarioFor(job: JobId, ageGroup: AgeGroup): Scenario {
  const known = TURNS[job]?.[ageGroup]
  return {
    job,
    ageGroup,
    turns: [
      known?.[1] ?? placeholderTurn(job, ageGroup, 1),
      known?.[2] ?? placeholderTurn(job, ageGroup, 2),
    ],
  }
}

/** 시나리오의 타깃 문장 2개 — 리포트 「오늘 말한 문장」 · 서버 lines */
export function targetLinesFor(job: JobId, ageGroup: AgeGroup): string[] {
  return scenarioFor(job, ageGroup).turns.map((t) => t.line.text)
}
