/**
 * POST /api/upload — 키오스크가 최종 산출물을 올리고 다운로드 URL을 받는다
 *
 * SPEC §6 / SPIKE_PLAN ⑥
 *   - 시크릿 키 인증 (헤더 x-mdv-secret)
 *   - Vercel Blob 저장 → 랜덤 토큰 URL 반환
 *   - 24시간 후 만료 (정리는 /api/cron/cleanup)
 *
 * ⚠️ 업로드 대상은 최종 산출물(PDF·네컷 이미지)뿐. 원본 WAV·개별 사진은 받지 않는다
 *    (CLAUDE.md 금지사항 4) — kind 화이트리스트 + MIME 검사로 강제.
 */

import { put } from '@vercel/blob'
import { NextResponse } from 'next/server'
import { ALLOWED, TTL_MS, blobPathFor, isUploadKind, newToken } from '@/lib/blobPaths'

export const runtime = 'nodejs'

/** 4×6 이미지·A4 PDF 기준 넉넉한 상한 */
const MAX_BYTES = 20 * 1024 * 1024

function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
}

function originOf(req: Request): string {
  const configured = process.env.MDV_PUBLIC_ORIGIN
  if (configured) return configured.replace(/\/$/, '')
  return new URL(req.url).origin
}

export async function POST(req: Request): Promise<NextResponse> {
  const secret = process.env.MDV_UPLOAD_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'MDV_UPLOAD_SECRET 미설정' }, { status: 500 })
  }
  if (req.headers.get('x-mdv-secret') !== secret) return unauthorized()

  const form = await req.formData()
  const kind = form.get('kind')
  const file = form.get('file')

  if (!isUploadKind(kind)) {
    return NextResponse.json({ error: `허용되지 않은 kind: ${String(kind)}` }, { status: 400 })
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file 필드가 없습니다' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: '파일이 너무 큽니다' }, { status: 413 })
  }

  const token = newToken()
  const path = blobPathFor(token, kind)

  await put(path, file, {
    access: 'public',
    // 경로를 그대로 써야 /d/<token> 조회가 성립한다
    addRandomSuffix: false,
    contentType: kind === 'report-pdf' ? 'application/pdf' : 'image/png',
    // Blob 자체 캐시는 짧게 — 만료 삭제가 바로 반영되도록
    cacheControlMaxAge: 60,
  })

  const expiresAt = new Date(Date.now() + TTL_MS).toISOString()

  return NextResponse.json({
    // 보호자 폰이 여는 주소. 만료 시 /expired 로 보낸다.
    downloadUrl: `${originOf(req)}/d/${token}`,
    expiresAt,
    kind,
    fileName: ALLOWED[kind].name,
  })
}
