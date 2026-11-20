/**
 * store/session.ts — 세션 스토어 (화면 전환의 단일 소스 · v2)
 *
 * PAGE_SPEC §7-1: 화면 전환은 세션 상태 기반 — 라우터 없이 `screen` 값 하나로 화면을 고른다.
 * 화면 순서는 `nextScreen()` · `prevScreen()` 두 곳에만 있다 (PAGE_SPEC §1 전체 흐름).
 *
 *   P-00 → P-01 ─ A ────────────────────────→ P-04 ────────→ P-06 → P-07 → (M-03) → P-00
 *               └ B → P-02 → P-02a → P-03 → P-04 → P-05 → P-06 → P-07 → (M-03) → P-00
 *
 * M-03[완료 안내]은 화면이 아니라 P-07 위에 뜨는 창이다 (`doneOpen`).
 */

import { create } from 'zustand'
import { TAP_GUARD_MS } from '@shared/constants'
import type {
  AgeGroup,
  AnalysisScenario,
  Consents,
  GuardianLink,
  JobId,
  KioskMode,
  PrintMode,
  Session,
} from '@shared/types'

export type ScreenId =
  | 'D-01' // 하드웨어 체크 (개발 전용)
  | 'P-00' // 대기
  | 'P-01' // 모드 선택
  | 'P-02' // 동의 (B)
  | 'P-02a' // 보호자 연결 (B)
  | 'P-03' // 연령 선택 (B)
  | 'P-04' // 직업 선택
  | 'P-05' // 발화 (B)
  | 'P-06' // 촬영
  | 'P-07' // 분석 및 프린트

export const SCREEN_TITLES: Record<ScreenId, string> = {
  'D-01': '하드웨어 체크',
  'P-00': '대기',
  'P-01': '모드 선택',
  'P-02': '동의',
  'P-02a': '보호자 연결',
  'P-03': '연령 선택',
  'P-04': '직업 선택',
  'P-05': '발화',
  'P-06': '촬영',
  'P-07': '분석 및 프린트',
}

/** DevBar 화면 이동 목록 순서 */
export const SCREEN_ORDER: ScreenId[] = [
  'D-01',
  'P-00',
  'P-01',
  'P-02',
  'P-02a',
  'P-03',
  'P-04',
  'P-05',
  'P-06',
  'P-07',
]

/** 다음 화면 — 경로는 P-01[모드 선택]에서 갈린다 (2026-11-19) */
export function nextScreen(current: ScreenId, mode: KioskMode | undefined): ScreenId {
  switch (current) {
    case 'P-00':
      return 'P-01'
    case 'P-01':
      // A는 동의 · 보호자 연결 없이 바로 직업 선택
      return mode === 'B' ? 'P-02' : 'P-04'
    case 'P-02':
      return 'P-02a'
    case 'P-02a':
      return 'P-03'
    case 'P-03':
      return 'P-04'
    case 'P-04':
      return mode === 'B' ? 'P-05' : 'P-06'
    case 'P-05':
      return 'P-06'
    case 'P-06':
      return 'P-07'
    case 'P-07':
      // M-03이 닫히면 endSession()이 P-00으로 보낸다
      return 'P-00'
    default:
      return 'P-00'
  }
}

/** [뒤로] — 없는 화면(촬영 · 분석 및 프린트 등)은 null */
export function prevScreen(current: ScreenId, mode: KioskMode | undefined): ScreenId | null {
  switch (current) {
    case 'P-01':
      return 'P-00'
    case 'P-02':
      return 'P-01'
    case 'P-02a':
      return 'P-02'
    case 'P-03':
      // 보호자 연결이 이미 끝났으므로, 연결을 버리고 모드 선택부터 다시 (PAGE_SPEC P-03 — 제안)
      return 'P-01'
    case 'P-04':
      return mode === 'B' ? 'P-03' : 'P-01'
    default:
      return null
  }
}

/** M-02 [오류·폴백 안내] — 아동이 읽어도 무섭지 않은 문구 */
export interface Fallback {
  /**
   * 띄우는 경우는 둘뿐이다: 카메라/마이크 없음(device) · 인쇄 실패(print).
   * 분석 실패 · 서버 전송 실패 · P-02a 연결 실패는 M-02를 띄우지 않는다 (PAGE_SPEC M-02).
   */
  kind: 'device' | 'print'
  /** 화면에 그대로 보여줄 문구 */
  message: string
  /** 개발자용 상세 */
  detail?: string
}

/**
 * ⚠️ MOCK 전용 — 받아쓰기 프로그램이 없는 동안 P-05 다시 말하기 흐름을 돌리는 방법
 *   manual = "잘 듣고 있어요" 동안 화면의 개발용 버튼(통과 / 실패 / 무음)으로 고른다
 *   pass / fail = 고르지 않고 항상 그 결과 (무음 검사는 실제로 한다)
 */
export type MockSttMode = 'manual' | 'pass' | 'fail'

const EMPTY_SESSION: Session = {}

interface SessionStore {
  screen: ScreenId
  session: Session
  fallback: Fallback | null
  /** M-03[완료 안내]이 떠 있는가 */
  doneOpen: boolean

  // ── 개발 · MOCK 전용 (DevBar) ──
  mockScenario: AnalysisScenario
  mockStt: MockSttMode
  /** P-07 인쇄 — fake면 종이를 쓰지 않는다. 기본값은 메인이 정한다 (설치판 real · 개발 실행 fake) */
  printMode: PrintMode

  goto: (screen: ScreenId) => void
  next: () => void
  /** [뒤로] — 화면에 따라 지울 데이터도 함께 정리한다 */
  back: () => void
  patch: (partial: Partial<Session>) => void

  /** P-01 */
  setMode: (mode: KioskMode) => void
  /** P-02 — 세 항목 모두 체크했을 때만 부른다 */
  setConsents: (consents: Consents) => void
  /** P-02a — 보호자가 연결돼 세션이 열렸다 */
  setGuardianLink: (link: GuardianLink) => void
  /** P-02a — 연결 실패 → [사진만 찍기]: A모드로 바꾸고 동의 기록을 지운 뒤 P-04 */
  switchToPhotoOnly: () => void
  /** P-03 */
  setAgeGroup: (ageGroup: AgeGroup) => void
  /** P-04 — 1개 (다른 카드를 누르면 바뀐다) */
  setJob: (job: JobId) => void

  setFallback: (fallback: Fallback | null) => void
  setMockScenario: (scenario: AnalysisScenario) => void
  setMockStt: (mode: MockSttMode) => void
  setPrintMode: (mode: PrintMode) => void

  /** P-00 — 남은 세션이 있으면 지우고 새 세션 폴더를 발급받는다 */
  beginSession: () => Promise<void>
  /** P-07 — 인쇄 완료 + (B) 분석 끝 + 전송 완료 또는 실패 뒤에 부른다 */
  openDone: () => void
  /** M-03이 닫힐 때 — 세션 닫기(B) · 로컬 데이터 삭제 · P-00 */
  endSession: () => Promise<void>
}

/**
 * 세션 폴더 삭제 + 서버 세션 닫기. 실패해도 다음 손님을 막지 않는다.
 *
 * 폴더(녹음 · 사진 · 영상)를 **먼저** 지운다 — 서버 응답을 기다리는 사이에 앱이 꺼져도 아이 데이터가 남지 않게.
 * 서버 세션 닫기는 기다리지 않는다 (서버가 느려도 완료 창이 멈춰 있지 않게).
 * 삭제가 실패해도 메인이 다음 세션을 시작할 때 · 앱을 시작할 때 남은 폴더를 다시 치운다 (main/storage.ts).
 */
async function disposeSession(session: Session): Promise<void> {
  if (session.sessionId) {
    try {
      await window.api.session.purge(session.sessionId)
    } catch (e) {
      console.warn('[session] 세션 폴더 삭제 실패', e)
    }
  }
  const token = session.guardianLink?.sessionToken
  if (token) void window.api.server.closeSession(token).catch(() => undefined)
}

/**
 * 화면이 바뀐 직후의 터치는 받지 않는다 — [← 뒤로]는 모든 화면에서 같은 자리라,
 * 연달아 두드리면 새 화면의 [뒤로]까지 눌려 두 칸을 넘어간다 (P-04 → P-03 → P-01: 보호자 연결이 버려진다).
 */
let screenChangedAt = 0

/** 방금(TAP_GUARD_MS 안에) 화면이 바뀌었는가 — 화면이 뜨자마자 들어온 터치를 거를 때 쓴다 */
export function justChangedScreen(): boolean {
  return performance.now() - screenChangedAt < TAP_GUARD_MS
}

export const useSession = create<SessionStore>((set, get) => ({
  screen: 'D-01', // 개발 단계 시작점. 운영 빌드에서는 P-00
  session: EMPTY_SESSION,
  fallback: null,
  doneOpen: false,

  mockScenario: 'random',
  mockStt: 'manual',
  printMode: 'fake', // App.tsx가 시작할 때 메인의 기본값으로 바꾼다

  goto: (screen) => set({ screen }),
  next: () => set((s) => ({ screen: nextScreen(s.screen, s.session.mode) })),

  back: () => {
    // 연타 방지 — 화면이 바뀐 직후의 [뒤로]는 무시한다. (next에는 걸지 않는다: 코드가 부르는 전환을 삼키면 안 된다)
    if (justChangedScreen()) return

    const { screen, session } = get()
    const target = prevScreen(screen, session.mode)
    if (!target) return

    if (screen === 'P-03') {
      // 연결을 버리고 모드 선택부터 다시 — 열린 세션도 닫는다
      const token = session.guardianLink?.sessionToken
      if (token) void window.api.server.closeSession(token).catch(() => undefined)
      set({
        screen: target,
        session: {
          ...session,
          mode: undefined,
          consentAt: undefined,
          consents: undefined,
          guardianLink: undefined,
          ageGroup: undefined,
        },
      })
      return
    }

    if (screen === 'P-02') {
      set({ screen: target, session: { ...session, consentAt: undefined, consents: undefined } })
      return
    }

    set({ screen: target })
  },

  patch: (partial) => set((s) => ({ session: { ...s.session, ...partial } })),

  setMode: (mode) => set((s) => ({ session: { ...s.session, mode } })),

  setConsents: (consents) =>
    set((s) => ({
      session: { ...s.session, consents, consentAt: new Date().toISOString() },
    })),

  setGuardianLink: (guardianLink) => set((s) => ({ session: { ...s.session, guardianLink } })),

  switchToPhotoOnly: () =>
    set((s) => ({
      screen: 'P-04',
      session: {
        ...s.session,
        mode: 'A',
        // A는 동의 화면이 없다 — B에서 받은 동의 기록을 남기지 않는다
        consentAt: undefined,
        consents: undefined,
        guardianLink: undefined,
        ageGroup: undefined,
        speech: undefined,
      },
    })),

  setAgeGroup: (ageGroup) => set((s) => ({ session: { ...s.session, ageGroup } })),
  setJob: (job) => set((s) => ({ session: { ...s.session, job } })),

  setFallback: (fallback) => set({ fallback }),
  setMockScenario: (mockScenario) => set({ mockScenario }),
  setMockStt: (mockStt) => set({ mockStt }),
  setPrintMode: (printMode) => set({ printMode }),

  beginSession: async () => {
    // 이전 세션 잔여 데이터 폐기 (PAGE_SPEC P-00)
    await disposeSession(get().session)
    const paths = await window.api.session.begin()
    set({
      session: { sessionId: paths.sessionId, paths, createdAt: new Date().toISOString() },
      fallback: null,
      doneOpen: false,
    })
  },

  openDone: () => set({ doneOpen: true }),

  endSession: async () => {
    await disposeSession(get().session)
    set({ session: EMPTY_SESSION, fallback: null, doneOpen: false, screen: 'P-00' })
  },
}))

useSession.subscribe((state, prev) => {
  if (state.screen !== prev.screen) screenChangedAt = performance.now()
})
