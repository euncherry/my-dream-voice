/**
 * src/main/mock/server.ts — ⚠️ MOCK 백엔드 서버 (나중에 교체될 자리)
 *
 * 백엔드 API가 아직 없다 (SPEC T-14 — 주소 · 인증 · 오류 코드 모두 합의 전).
 * 그래서 서버가 할 대답을 앱 안에서 흉내 낸다. 화면 흐름(P-02a · P-07)만 돌려 보기 위한 것이다.
 *
 *   세션 열기        → 보호자 이메일을 받고 세션 번호를 준다. ⚠️ 주소를 저장하지도 로그에 쓰지도 않는다
 *                      (2026-11-24 카카오 로그인 없앰 — QR · 로그인 확인 없음)
 *   리포트 데이터    → 받았다고만 답한다 (내용은 버린다 — 로그에는 크기만)
 *   연결 끊김 흉내   → DevBar [MOCK 서버: 끊김]이면 모든 요청이 실패한다
 *
 * 실제 서버를 붙일 때는 main/server.ts의 `Backend` 구현을 HTTP로 바꾼다. 이 파일은 지운다.
 */

import { randomBytes } from 'node:crypto'
import type { MockServerState, ReportPayload } from '../../shared/types'

/** 연결이 안 될 때 fetch가 던지는 것과 같은 꼴 — main/server.ts가 'offline'으로 바꾼다 */
export class MockNetworkError extends Error {
  constructor() {
    super('MOCK: 서버에 연결할 수 없음 (DevBar에서 끊김으로 설정됨)')
    this.name = 'MockNetworkError'
  }
}

/** 응답이 오기까지 — 화면의 "준비 중" 표시가 보이도록 */
const LATENCY_MS = 500
/** 끊겼을 때는 조금 더 걸려서 실패한다 */
const OFFLINE_LATENCY_MS = 1_200

interface MockSession {
  reportReceived: boolean
}

const state: MockServerState = { network: 'online' }
const sessions = new Map<string, MockSession>()

const log = (line: string): void => console.log(`[mock-server] ${line}`)
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function reach(): Promise<void> {
  if (state.network === 'offline') {
    await sleep(OFFLINE_LATENCY_MS)
    throw new MockNetworkError()
  }
  await sleep(LATENCY_MS)
}

function find(sessionToken: string): MockSession {
  const session = sessions.get(sessionToken)
  if (!session) throw new Error('MOCK: 없는 세션 번호')
  return session
}

export const mockBackend = {
  async openSession(email: string): Promise<{ sessionToken: string }> {
    await reach()
    if (!email) throw new Error('MOCK: 이메일이 비어 있음')
    const sessionToken = randomBytes(12).toString('base64url')
    sessions.set(sessionToken, { reportReceived: false })
    // ⚠️ 주소는 어디에도 남기지 않는다 (CLAUDE.md 금지사항 4)
    log(`세션 열림 — 보호자 이메일 받음 (주소는 기록하지 않음 · 열려 있는 세션 ${sessions.size}개)`)
    return { sessionToken }
  },

  async sendReport(payload: ReportPayload): Promise<void> {
    await reach()
    find(payload.sessionToken).reportReceived = true
    log(
      `리포트 데이터 받음 — ${payload.job} · ${payload.ageGroup} · 소리 ${payload.observations.length}개` +
        `${payload.allSkipped ? ' (전부 판단 보류 → 안내 리포트)' : ''}` +
        ` · 네컷 ${Math.round((payload.fourcut.length * 3) / 4 / 1024)}KB`,
    )
  },

  async closeSession(sessionToken: string): Promise<void> {
    // 닫힘을 서버에 따로 알릴지는 합의 전이다 (T-14). mock은 기억만 지운다
    if (sessions.delete(sessionToken)) log('세션 닫힘')
  },
}

// ── 개발용 조작 ──────────────────────────────────────────────

export function mockServerGet(): MockServerState {
  return { ...state }
}

export function mockServerSet(next: Partial<MockServerState>): MockServerState {
  if (next.network === 'online' || next.network === 'offline') {
    state.network = next.network
    log(`연결 상태 → ${state.network === 'online' ? '연결됨' : '끊김'}`)
  }
  return { ...state }
}
