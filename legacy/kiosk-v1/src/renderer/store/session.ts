/**
 * store/session.ts — 세션 스토어 (화면 전환의 단일 소스)
 *
 * PAGE_SPEC §5-2:
 *   "화면 전환은 세션 상태 기반 — 라우터 경로에 데이터를 싣지 말고
 *    세션 스토어를 단일 소스로 (중간 이탈·타임아웃 복구가 쉬움)"
 *
 * → react-router를 쓰지 않는다. screen 값 하나로 렌더링할 화면을 고른다.
 */

import { create } from 'zustand'
import { toAgeGroup } from '@shared/jobs'
import type { AnalysisScenario, JobId, KioskMode, Session } from '@shared/types'

export type ScreenId =
  | 'D-01' // 하드웨어 체크 (개발 전용)
  | 'P-00' // 대기
  | 'P-01' // 모드 선택
  | 'P-02' // 직업 선택
  | 'P-03' // 연령 입력 (B)
  | 'P-04' // 동의 (B)
  | 'P-05' // 발화 (B)
  | 'P-06' // 촬영
  | 'P-07' // 분석 중 (B)
  | 'P-08' // 결과 (B)
  | 'P-09' // 인쇄
  | 'P-10' // QR 제공
  | 'P-11' // 종료

export const SCREEN_TITLES: Record<ScreenId, string> = {
  'D-01': '하드웨어 체크',
  'P-00': '대기 화면',
  'P-01': '모드 선택',
  'P-02': '직업 선택',
  'P-03': '연령 입력',
  'P-04': '동의',
  'P-05': '발화',
  'P-06': '촬영',
  'P-07': '분석 중',
  'P-08': '결과',
  'P-09': '인쇄',
  'P-10': 'QR 제공',
  'P-11': '종료',
}

/** PAGE_SPEC §0 스파이크 범위 표기 */
export type SpikeLevel = 'full' | 'min' | 'none'
export const SCREEN_SPIKE: Record<ScreenId, SpikeLevel> = {
  'D-01': 'full',
  'P-00': 'min',
  'P-01': 'min',
  'P-02': 'min',
  'P-03': 'min',
  'P-04': 'none',
  'P-05': 'full',
  'P-06': 'full',
  'P-07': 'min',
  'P-08': 'min',
  'P-09': 'full',
  'P-10': 'full',
  'P-11': 'min',
}

/** 업로드 진행 상태 (SPEC §6-1) */
export type UploadState = 'idle' | 'pending' | 'done' | 'failed'

/** M-02 [오류·폴백 안내] — 아동이 읽어도 무섭지 않은 문구 */
export interface Fallback {
  /** 개발자용 케이스 구분 */
  kind: 'print' | 'upload' | 'analysis' | 'device'
  /** 화면에 그대로 보여줄 문구 */
  message: string
  /** 개발자용 상세 (스파이크 화면에서만 노출) */
  detail?: string
}

const EMPTY_SESSION: Session = { jobs: [] }

/** PAGE_SPEC §1 전체 흐름 */
export function nextScreen(current: ScreenId, mode: KioskMode | undefined): ScreenId {
  switch (current) {
    case 'P-00':
      return 'P-01'
    case 'P-01':
      return 'P-02'
    case 'P-02':
      return mode === 'B' ? 'P-03' : 'P-06'
    case 'P-03':
      return 'P-04'
    case 'P-04':
      return 'P-05'
    case 'P-05':
      return 'P-06'
    case 'P-06':
      return mode === 'B' ? 'P-07' : 'P-09'
    case 'P-07':
      return 'P-08'
    case 'P-08':
      return 'P-09'
    case 'P-09':
      return 'P-10'
    case 'P-10':
      return 'P-11'
    case 'P-11':
      return 'P-00'
    default:
      return 'P-00'
  }
}

interface SessionStore {
  screen: ScreenId
  session: Session
  fallback: Fallback | null

  /** ⚠️ MOCK 전용 — 두 리포트 레이아웃을 모두 확인하기 위한 시나리오 토글 */
  mockScenario: AnalysisScenario

  /**
   * 업로드 진행 상태 (SPEC §6-1).
   * P-09[인쇄]에서 시작해 P-10[QR]이 결과만 받는다 — 화면이 바뀌어도 진행 중인
   * Promise는 계속 살아 있으므로, 상태를 스토어에 두고 P-10은 이 값만 본다.
   */
  uploadState: UploadState
  uploadError: string | null

  goto: (screen: ScreenId) => void
  next: () => void
  patch: (partial: Partial<Session>) => void

  setMode: (mode: KioskMode) => void
  toggleJob: (jobId: JobId) => void
  setAge: (age: number) => void

  setFallback: (fallback: Fallback | null) => void
  setMockScenario: (scenario: AnalysisScenario) => void

  /** 세션 폴더 발급 (메인) */
  beginSession: () => Promise<void>
  /**
   * 최종 산출물 업로드 — **P-09[인쇄]에서 인쇄와 동시에 호출한다** (SPEC §6-1).
   * 중복 호출은 내부에서 막으므로 StrictMode 이중 마운트에도 안전하다.
   */
  startUpload: () => Promise<void>
  /** P-11 — 로컬 산출물 삭제 + 상태 초기화 */
  endSession: () => Promise<void>
}

export const useSession = create<SessionStore>((set, get) => ({
  screen: 'D-01', // 스파이크 시작점. 운영 빌드에서는 P-00.
  session: EMPTY_SESSION,
  fallback: null,
  mockScenario: 'random',
  uploadState: 'idle',
  uploadError: null,

  goto: (screen) => set({ screen }),
  next: () => set((s) => ({ screen: nextScreen(s.screen, s.session.mode) })),
  patch: (partial) => set((s) => ({ session: { ...s.session, ...partial } })),

  setMode: (mode) => set((s) => ({ session: { ...s.session, mode } })),

  toggleJob: (jobId) =>
    set((s) => {
      const jobs = s.session.jobs
      const picked = jobs.includes(jobId)
      // 재터치=해제 / 4개를 채우면 더 못 고름 (PAGE_SPEC P-02)
      const nextJobs = picked
        ? jobs.filter((j) => j !== jobId)
        : jobs.length >= 4
          ? jobs
          : [...jobs, jobId]
      return { session: { ...s.session, jobs: nextJobs } }
    }),

  setAge: (age) =>
    set((s) => ({ session: { ...s.session, age, ageGroup: toAgeGroup(age) } })),

  setFallback: (fallback) => set({ fallback }),
  setMockScenario: (mockScenario) => set({ mockScenario }),

  beginSession: async () => {
    const paths = await window.api.session.begin()
    set((s) => ({
      session: { ...s.session, sessionId: paths.sessionId, paths },
    }))
  },

  startUpload: async () => {
    // 중복 방지 — P-09 재진입·StrictMode 이중 마운트에도 한 번만 올라간다
    if (get().uploadState !== 'idle') return

    const { mode, reportPdf, composedPhoto } = get().session
    // ⚠️ 업로드 대상은 최종 산출물만 (CLAUDE.md 금지사항 4)
    const isReport = mode === 'B' && !!reportPdf
    const target = isReport ? reportPdf : composedPhoto

    if (!target) {
      set({ uploadState: 'failed', uploadError: '업로드할 산출물이 없습니다' })
      return
    }

    set({ uploadState: 'pending', uploadError: null })

    const res = await window.api.upload.artifact({
      kind: isReport ? 'report-pdf' : 'fourcut-image',
      filePath: target,
    })

    if (res.ok && res.downloadUrl) {
      set((s) => ({
        session: { ...s.session, downloadUrl: res.downloadUrl },
        uploadState: 'done',
      }))
    } else {
      set({ uploadState: 'failed', uploadError: `${res.reason} · ${res.error}` })
    }
  },

  endSession: async () => {
    const { sessionId } = get().session
    // PAGE_SPEC P-11: 세션 데이터 폐기 — 로컬 WAV·사진·PDF 삭제
    if (sessionId) {
      try {
        await window.api.session.purge(sessionId)
      } catch {
        /* 폐기 실패가 다음 손님을 막지 않게 한다 */
      }
    }
    set({
      session: EMPTY_SESSION,
      fallback: null,
      screen: 'P-00',
      uploadState: 'idle',
      uploadError: null,
    })
  },
}))
