/**
 * lib/blobPaths.ts — Blob 경로 · 토큰 규칙
 *
 * SPEC §6
 *   - 토큰: 추측 불가능한 랜덤 문자열, 목록 조회 API 없음
 *   - 24시간 후 만료
 */

export const BLOB_PREFIX = 'mdv/'

/** SPEC §6 — 24시간 */
export const TTL_HOURS = 24
export const TTL_MS = TTL_HOURS * 60 * 60 * 1000

/** 업로드 가능한 종류 — 최종 산출물만 (CLAUDE.md 금지사항 4) */
export const ALLOWED = {
  'report-pdf': { ext: '.pdf', name: 'report.pdf' },
  'fourcut-image': { ext: '.png', name: 'fourcut.png' },
} as const

export type UploadKind = keyof typeof ALLOWED

export function isUploadKind(v: unknown): v is UploadKind {
  return typeof v === 'string' && v in ALLOWED
}

/** 추측 불가능한 랜덤 토큰 (192bit, base64url) */
export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return Buffer.from(bytes).toString('base64url')
}

/** 토큰 형식 검증 — 경로 조작 차단 */
export function isValidToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{32}$/.test(token)
}

export function blobPathFor(token: string, kind: UploadKind): string {
  return `${BLOB_PREFIX}${token}/${ALLOWED[kind].name}`
}

export function tokenFromBlobPath(pathname: string): string | null {
  const rest = pathname.startsWith(BLOB_PREFIX) ? pathname.slice(BLOB_PREFIX.length) : null
  if (!rest) return null
  const token = rest.split('/')[0]
  return token && isValidToken(token) ? token : null
}
