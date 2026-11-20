/**
 * src/main/upload.ts — 클라우드 업로드 (유일한 온라인 구간)
 *
 * SPIKE_PLAN ⑥ / SPEC §6 · §6-1
 *   - 키오스크가 PDF/이미지를 업로드하고 URL을 받는다 (시크릿 키 인증)
 *   - 업로드 실패(오프라인) 시 타임아웃 후 폴백 안내 ("인쇄물만 제공됩니다")
 *
 * ⚠️ CLAUDE.md 금지사항 4 — 업로드 대상은 최종 산출물(PDF·네컷 이미지)뿐.
 *    원본 WAV·개별 사진은 절대 올리지 않는다. (아래 ALLOWED_KINDS로 강제)
 */

import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import type { UploadKind, UploadRequest, UploadResult } from '../shared/types'

/**
 * SPEC §6-1 — 업로드는 P-09[인쇄]에서 인쇄와 동시에 시작한다.
 * 인쇄에 약 8초가 걸리므로 그 시간을 쓸 수 있고, 보호자 체감 대기는 0초다.
 * (이전 3초는 P-10 도착 후에 시작하던 시절의 값 — Wi-Fi 환경에서는 너무 빠듯하다)
 */
export const UPLOAD_TIMEOUT_MS = 15_000

const ALLOWED_KINDS: Record<UploadKind, { ext: string[]; mime: string }> = {
  'report-pdf': { ext: ['.pdf'], mime: 'application/pdf' },
  'fourcut-image': { ext: ['.png', '.jpg', '.jpeg'], mime: 'image/png' },
}

function config(): { endpoint: string; secret: string } | null {
  const endpoint = process.env['MDV_UPLOAD_ENDPOINT']
  const secret = process.env['MDV_UPLOAD_SECRET']
  if (!endpoint || !secret) return null
  return { endpoint, secret }
}

export async function uploadArtifact(req: UploadRequest): Promise<UploadResult> {
  const rule = ALLOWED_KINDS[req.kind]
  if (!rule) {
    return { ok: false, reason: 'config', error: `허용되지 않은 업로드 종류: ${req.kind}` }
  }

  const name = basename(req.filePath)
  const lower = name.toLowerCase()
  if (!rule.ext.some((e) => lower.endsWith(e))) {
    // 원본 WAV 등이 실수로 흘러드는 것을 막는 마지막 방어선
    return { ok: false, reason: 'config', error: `${req.kind}에 허용되지 않은 확장자: ${name}` }
  }

  const cfg = config()
  if (!cfg) {
    return {
      ok: false,
      reason: 'config',
      error: 'MDV_UPLOAD_ENDPOINT / MDV_UPLOAD_SECRET 미설정 (cloud 배포 후 .env에 설정)',
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS)

  try {
    const bytes = await readFile(req.filePath)
    const form = new FormData()
    form.set('kind', req.kind)
    form.set('file', new Blob([new Uint8Array(bytes)], { type: rule.mime }), name)

    const res = await fetch(cfg.endpoint, {
      method: 'POST',
      headers: { 'x-mdv-secret': cfg.secret },
      body: form,
      signal: controller.signal,
    })

    if (!res.ok) {
      return { ok: false, reason: 'server', error: `HTTP ${res.status}` }
    }

    const json = (await res.json()) as { downloadUrl?: string; expiresAt?: string }
    if (!json.downloadUrl) {
      return { ok: false, reason: 'server', error: '응답에 downloadUrl 없음' }
    }

    return { ok: true, downloadUrl: json.downloadUrl, expiresAt: json.expiresAt }
  } catch (e) {
    const err = e as Error
    const reason = err.name === 'AbortError' ? 'timeout' : 'offline'
    return { ok: false, reason, error: err.message }
  } finally {
    clearTimeout(timer)
  }
}
