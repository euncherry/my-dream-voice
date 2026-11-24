/**
 * src/main/server.ts — 백엔드 서버와 주고받기 (B모드에서만 쓴다 — A모드는 인터넷을 쓰지 않는다)
 *
 * 키오스크 몫은 "세션 열기 → 데이터 보내기 → 세션 닫기"까지다 (SPEC §6-1).
 *   P-02a  세션 열기 — 보호자가 직접 입력한 이메일과 함께 한 번에 (2026-11-24 카카오 로그인 없앰)
 *   P-07   리포트 데이터 전송 (타임아웃 15초 · 실패해도 화면에 안 띄움 · 다시 보내려고 남기지 않음)
 *   M-03   세션 닫기
 * 리포트 PDF · 메일 발송 · 데이터가 안 왔을 때의 처리는 서버 몫이다.
 *
 * ⚠️ 지금은 mock 응답이다 — 백엔드 API가 합의 전이라(SPEC T-14) `Backend` 자리에
 *    main/mock/server.ts를 꽂아 두었다. API가 정해지면 같은 모양의 HTTP 구현으로 바꾼다
 *    (백엔드 주소 · API 인증 키 환경 변수도 그때 정한다).
 *
 * ⚠️ 보내는 것은 SPEC §6-2의 데이터뿐이다 (CLAUDE.md 금지사항 4 · 9).
 *    원본 WAV · 개별 사진 · 촬영 영상 · 인식된 글자 · 점수 · 보호자 이메일은 넣지 않는다.
 *    → buildReportPayload()가 허용한 필드만 골라 담고, assertSendable()이 한 번 더 막는다.
 */

import { nativeImage } from 'electron'
import { KIOSK_ID, LINK_REQUEST_TIMEOUT_MS, REPORT_SEND_TIMEOUT_MS } from '../shared/constants'
import { MockNetworkError, mockBackend } from './mock/server'
import { composedPhotoPath, fileSize } from './storage'
import type {
  OpenSessionRequest,
  OpenSessionResult,
  ReportPayload,
  SendReportRequest,
  SendReportResult,
  ServerFailReason,
} from '../shared/types'

/** 서버가 해 주는 일 — mock과 (나중의) HTTP 구현이 같은 모양을 채운다 */
interface Backend {
  openSession(email: string): Promise<{ sessionToken: string }>
  sendReport(payload: ReportPayload): Promise<void>
  closeSession(sessionToken: string): Promise<void>
}

// TODO(T-14): API 합의 후 HTTP 구현으로 교체
const backend: Backend = mockBackend

class TimeoutError extends Error {}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(`${ms}ms 초과`)), ms)
    work.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: Error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

function failure(e: unknown): { ok: false; reason: ServerFailReason; error: string } {
  const err = e as Error
  const reason: ServerFailReason =
    err instanceof TimeoutError
      ? 'timeout'
      : err instanceof MockNetworkError || err.name === 'TypeError'
        ? 'offline'
        : err instanceof NotSendableError
          ? 'rejected'
          : 'server'
  return { ok: false, reason, error: err.message }
}

// ── P-02a ────────────────────────────────────────────────────

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * 보호자 이메일과 함께 세션을 연다 — 서버가 세션 번호를 준다.
 * ⚠️ 주소는 여기서 서버로 넘기고 끝이다 — 변수에 두지 않고, 로그 · 파일에 쓰지 않는다.
 */
export async function openSession(req: OpenSessionRequest): Promise<OpenSessionResult> {
  if (typeof req?.email !== 'string' || !EMAIL_SHAPE.test(req.email)) {
    return { ok: false, reason: 'rejected', error: '이메일 형식이 아님' }
  }
  try {
    const opened = await withTimeout(backend.openSession(req.email), LINK_REQUEST_TIMEOUT_MS)
    return { ok: true, sessionToken: opened.sessionToken }
  } catch (e) {
    return failure(e)
  }
}

// ── P-07 ─────────────────────────────────────────────────────

class NotSendableError extends Error {}

/** 서버로 나가면 안 되는 필드 이름 — 어느 깊이에 있든 막는다 */
const FORBIDDEN_KEYS = new Set([
  'wav',
  'transcript',
  'cer',
  'score',
  'photos',
  'captureVideo',
  'speech',
  'speechFeatures',
  'email',
])
/** 네컷 이미지(fourcut) 말고는 파일 경로 · 원본 파일이 실려 나갈 일이 없다 */
const RAW_FILE = /\.(wav|webm|mp4|jpe?g|png|pdf)$/i

/** 마지막 방어선 — 허용하지 않은 것이 섞여 있으면 보내지 않는다 */
function assertSendable(value: unknown, path = 'payload'): void {
  if (typeof value === 'string') {
    if (path !== 'payload.fourcut' && RAW_FILE.test(value.trim())) {
      throw new NotSendableError(`보낼 수 없는 값(파일 경로): ${path}`)
    }
    return
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertSendable(v, `${path}[${i}]`))
    return
  }
  if (value && typeof value === 'object') {
    for (const [key, v] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(key)) throw new NotSendableError(`보낼 수 없는 필드: ${path}.${key}`)
      assertSendable(v, `${path}.${key}`)
    }
  }
}

/** 네컷 합성본(output/fourcut.png)만 읽어 JPEG로 바꾼다 — 렌더러가 준 경로는 쓰지 않는다 */
async function fourcutJpegBase64(sessionId: string): Promise<string> {
  const path = composedPhotoPath(sessionId)
  await fileSize(path) // 없으면 여기서 던진다
  const image = nativeImage.createFromPath(path)
  if (image.isEmpty()) throw new Error('네컷 이미지를 읽을 수 없음')
  return image.toJPEG(90).toString('base64')
}

/** SPEC §6-2 — 허용한 필드만 하나씩 골라 담는다 (요청 객체를 통째로 펼치지 않는다) */
async function buildReportPayload(req: SendReportRequest): Promise<ReportPayload> {
  const payload: ReportPayload = {
    sessionToken: req.sessionToken,
    sessionId: req.sessionId,
    kioskId: KIOSK_ID,
    createdAt: req.createdAt,
    ageGroup: req.ageGroup,
    job: req.job,
    lines: req.lines.map(String),
    observations: req.observation.sounds.map((o) => ({
      sound: o.sound,
      ...(o.word ? { word: o.word } : {}),
      result: o.result,
    })),
    allSkipped: req.observation.allSkipped,
    positiveMessage: req.positiveMessage,
    reportText: req.reportText,
    fourcut: await fourcutJpegBase64(req.sessionId),
  }
  assertSendable(payload)
  return payload
}

/**
 * 분석이 끝나면 바로 부른다. 인쇄와 나란히 돌고, 결과와 무관하게 인쇄는 그대로 간다.
 * 실패해도 다시 보내려고 데이터를 남기지 않는다 — 그 뒤 처리는 서버 몫 (SPEC §6-1 · §6-5).
 */
export async function sendReport(req: SendReportRequest): Promise<SendReportResult> {
  try {
    const work = buildReportPayload(req).then((payload) => backend.sendReport(payload))
    await withTimeout(work, REPORT_SEND_TIMEOUT_MS)
    return { ok: true }
  } catch (e) {
    const failed = failure(e)
    console.warn(`[server] 리포트 데이터 전송 실패 — ${failed.reason} · ${failed.error}`)
    return failed
  }
}

// ── M-03 ─────────────────────────────────────────────────────

/** 세션 닫기. 서버에 따로 알릴지는 합의 전이다 (T-14) — 실패해도 다음 손님을 막지 않는다 */
export async function closeSession(sessionToken: string): Promise<void> {
  try {
    await withTimeout(backend.closeSession(sessionToken), LINK_REQUEST_TIMEOUT_MS)
  } catch {
    /* 무시 */
  }
}
