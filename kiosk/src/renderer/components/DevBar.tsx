/**
 * components/DevBar.tsx — 개발 전용 조작 바 (오른쪽 아래 고정)
 *
 * 운영 빌드에는 넣지 않는다 (D-01 [하드웨어 체크]와 같은 취급). 근거: V2_PLAN §3 D-01 행 · §5 · §6
 *  - 화면 이동: PAGE_SPEC v0.3 화면 번호 전체 (SCREEN_ORDER) · [D-01] 바로 가기
 *  - MOCK 분석 시나리오: 리포트 갈래(전부 잘 인식됨 / 일부 다르게 인식됨 / 전부 판단 보류 / 분석 실패) 확인
 *  - MOCK 받아쓰기: P-05 [발화] 다시 말하기 흐름 (직접 고르기 / 항상 통과 / 항상 실패)
 *  - MOCK 서버: 연결됨 / 끊김 — P-02a [보호자 연결] 실패 경로 · P-07 전송 실패 경로
 *  - 인쇄: 실제 / 가짜 (가짜는 종이를 쓰지 않는다)
 *  - 화면 방향 토글: 가로 확정(SPEC T-2)이지만 세로 오버라이드를 눈으로 확인할 수 있게 남겨 둔다
 *
 * 손님 화면의 버튼을 가리지 않게 기본은 한 줄 요약이고, [펼치기]를 눌러야 조작이 나온다.
 */

import { useEffect, useState, type ReactNode } from 'react'
import { SCREEN_ORDER, SCREEN_TITLES, useSession, type MockSttMode, type ScreenId } from '../store/session'
import type { AgeGroup, AnalysisScenario, JobId, MockServerState, Session } from '@shared/types'

// ⚠️ MOCK 전용 — 아래 목록은 전부 mock을 고르는 값이다. 실제 분석 · 받아쓰기 · 서버가 붙으면 쓰이지 않는다.

const SCENARIOS: { id: AnalysisScenario; label: string; short: string }[] = [
  { id: 'random', label: '랜덤', short: '랜덤' },
  { id: 'all-well', label: '전부 잘 인식됨', short: '전부 잘' },
  { id: 'some-different', label: '일부 다르게 인식됨', short: '일부 다르게' },
  { id: 'all-skipped', label: '전부 판단 보류', short: '전부 보류' },
  { id: 'fail', label: '분석 실패', short: '실패' },
]

const STT_MODES: { id: MockSttMode; label: string; short: string }[] = [
  { id: 'manual', label: '직접 고르기', short: '직접' },
  { id: 'pass', label: '항상 통과', short: '통과' },
  { id: 'fail', label: '항상 실패', short: '실패' },
]

type Network = MockServerState['network']

const NETWORK_LABEL: Record<Network, string> = { online: '연결됨', offline: '끊김' }

// ── 화면 건너뛰기 — 앞 화면들이 채웠을 값의 개발용 기본값 ──

const DEV_JOB: JobId = 'police'
const DEV_AGE: AgeGroup = '5'

/** 이 화면들로 갈 때는 세션에 아무것도 채우지 않는다 */
const NO_FILL: ReadonlySet<ScreenId> = new Set<ScreenId>(['D-01', 'P-00', 'P-01'])
/** B모드에만 있는 화면 */
const B_ONLY: ReadonlySet<ScreenId> = new Set<ScreenId>(['P-02', 'P-02a', 'P-03', 'P-05'])
/** P-03 [연령 선택]을 지난 화면 — B모드면 연령 구간이 있어야 한다 */
const AFTER_AGE: ReadonlySet<ScreenId> = new Set<ScreenId>(['P-04', 'P-05', 'P-06', 'P-07'])
/** P-04 [직업 선택]을 지난 화면 — 직업이 있어야 한다 */
const AFTER_JOB: ReadonlySet<ScreenId> = new Set<ScreenId>(['P-05', 'P-06', 'P-07'])

export function DevBar(): ReactNode {
  const screen = useSession((s) => s.screen)
  const goto = useSession((s) => s.goto)
  const mockScenario = useSession((s) => s.mockScenario)
  const setMockScenario = useSession((s) => s.setMockScenario)
  const mockStt = useSession((s) => s.mockStt)
  const setMockStt = useSession((s) => s.setMockStt)
  const printMode = useSession((s) => s.printMode)
  const setPrintMode = useSession((s) => s.setPrintMode)

  const [open, setOpen] = useState(false)
  const [portrait, setPortrait] = useState(
    () => document.documentElement.dataset['orientation'] === 'portrait',
  )
  /** MOCK 서버 연결 상태 — 메인이 갖고 있다. null = 아직 못 읽음 */
  const [network, setNetwork] = useState<Network | null>(null)
  const [jumping, setJumping] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // MOCK: main/mock/server.ts 의 연결 상태를 읽는다.
  // 다른 화면의 개발용 버튼이 바꿨을 수 있어 화면이 바뀔 때 · 펼칠 때마다 다시 읽는다.
  useEffect(() => {
    let cancelled = false
    window.api.server
      .mockGet()
      .then((state) => {
        if (!cancelled) setNetwork(state.network)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [screen, open])

  /**
   * 화면 이동. 흐름 중간 화면으로 건너뛰면 앞 화면들이 채웠을 값이 비어 있으므로
   * 개발용 기본값을 채운다 (이미 있는 값은 건드리지 않는다).
   *  - 세션 폴더가 없으면 새로 받는다 (P-00이 하는 일)
   *  - B모드 전용 화면으로 가면 B모드로
   *  - P-03을 지났는데 B모드면 연령 '5' · P-04를 지났으면 직업 '경찰'
   * 동의 · 보호자 연결 · 발화 · 사진은 채우지 않는다 — 예: P-07로 바로 가면 합성본이 없어
   * 인쇄 실패 경로가 된다 (그 경로 확인용으로 그대로 둔다).
   */
  async function jump(target: ScreenId): Promise<void> {
    if (jumping) return
    setError(null)

    if (NO_FILL.has(target)) {
      goto(target)
      return
    }

    setJumping(true)
    try {
      const before = useSession.getState().session
      if (!before.sessionId) {
        await useSession.getState().beginSession()
        // beginSession은 세션을 새로 만든다 — 그 전에 골라 둔 값(모드 · 연령 · 직업 등)은 되살린다
        const { sessionId: _id, paths: _paths, createdAt: _at, ...picked } = before
        useSession.getState().patch(picked)
      }

      const { session, patch } = useSession.getState()
      const fill: Partial<Session> = {}
      if (B_ONLY.has(target) && session.mode !== 'B') fill.mode = 'B'
      const mode = fill.mode ?? session.mode
      if (AFTER_AGE.has(target) && mode === 'B' && !session.ageGroup) fill.ageGroup = DEV_AGE
      if (AFTER_JOB.has(target) && !session.job) fill.job = DEV_JOB
      if (Object.keys(fill).length > 0) patch(fill)

      goto(target)
    } catch (e) {
      setError(`화면 이동 실패 — ${(e as Error).message}`)
    } finally {
      setJumping(false)
    }
  }

  function toggleOrientation(): void {
    const nextPortrait = !portrait
    setPortrait(nextPortrait)
    document.documentElement.dataset['orientation'] = nextPortrait ? 'portrait' : 'landscape'
  }

  function cycleScenario(): void {
    const i = SCENARIOS.findIndex((s) => s.id === mockScenario)
    setMockScenario(SCENARIOS[(i + 1) % SCENARIOS.length]!.id)
  }

  function cycleStt(): void {
    const i = STT_MODES.findIndex((m) => m.id === mockStt)
    setMockStt(STT_MODES[(i + 1) % STT_MODES.length]!.id)
  }

  /** MOCK: 서버 연결 끊김 흉내 — 끊김이면 서버 요청이 전부 실패한다 (main/mock/server.ts) */
  async function toggleNetwork(): Promise<void> {
    setError(null)
    try {
      const state = await window.api.server.mockSet({
        network: network === 'offline' ? 'online' : 'offline',
      })
      setNetwork(state.network)
    } catch (e) {
      setError(`MOCK 서버 설정 실패 — ${(e as Error).message}`)
    }
  }

  const scenario = SCENARIOS.find((s) => s.id === mockScenario)
  const stt = STT_MODES.find((m) => m.id === mockStt)
  const networkLabel = network ? NETWORK_LABEL[network] : '…'
  const printLabel = printMode === 'real' ? '실제' : '가짜'

  if (!open) {
    return (
      <div className="devbar devbar--closed">
        <span className="devbar__summary">
          DEV · {screen} · 분석 {scenario?.short} · 받아쓰기 {stt?.short} · 서버 {networkLabel} · 인쇄{' '}
          {printLabel}
        </span>
        <button onClick={() => void jump('D-01')}>← 점검 화면 (D-01)</button>
        <button onClick={() => setOpen(true)}>펼치기 ▲</button>
      </div>
    )
  }

  return (
    <div className="devbar devbar--open">
      <div className="devbar__row">
        <span className="devbar__label">개발용 조작 · 운영 빌드에는 없음</span>
        <button onClick={() => setOpen(false)}>접기 ▼</button>
      </div>

      <div className="devbar__row">
        <span className="devbar__label">화면 이동</span>
        <select
          value={screen}
          disabled={jumping}
          onChange={(e) => void jump(e.target.value as ScreenId)}
        >
          {SCREEN_ORDER.map((id) => (
            <option key={id} value={id}>
              {id} {SCREEN_TITLES[id]}
            </option>
          ))}
        </select>
        <button onClick={() => void jump('D-01')}>← 점검 화면 (D-01)</button>
      </div>

      <div className="devbar__row">
        <button onClick={cycleScenario}>MOCK 분석: {scenario?.label}</button>
        <button onClick={cycleStt}>MOCK 받아쓰기: {stt?.label}</button>
      </div>

      <div className="devbar__row">
        <button onClick={() => void toggleNetwork()} disabled={network === null}>
          MOCK 서버: {networkLabel}
        </button>
        <button onClick={() => setPrintMode(printMode === 'real' ? 'fake' : 'real')}>
          인쇄: {printMode === 'real' ? '실제 (종이 씀)' : '가짜 (종이 안 씀)'}
        </button>
        <button onClick={toggleOrientation}>방향: {portrait ? '세로' : '가로'} (T-2)</button>
      </div>

      {error && <div className="devbar__error">{error}</div>}
    </div>
  )
}
