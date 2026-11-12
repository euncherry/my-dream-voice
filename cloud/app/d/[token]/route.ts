/**
 * GET /d/<token> — 보호자가 QR로 여는 다운로드 주소
 *
 * 목록 조회 API는 제공하지 않는다 (SPEC §6). 토큰을 알아야만 접근 가능.
 * 만료(또는 삭제)된 경우 /expired 안내 페이지로 보낸다.
 */

import { list } from '@vercel/blob'
import { NextResponse } from 'next/server'
import { BLOB_PREFIX, TTL_MS, isValidToken } from '@/lib/blobPaths'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  req: Request,
  ctx: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await ctx.params
  const expired = NextResponse.redirect(new URL('/expired', req.url))

  if (!isValidToken(token)) return expired

  const { blobs } = await list({ prefix: `${BLOB_PREFIX}${token}/`, limit: 1 })
  const blob = blobs[0]
  if (!blob) return expired

  // cron이 아직 돌지 않았더라도 24시간이 지났으면 내주지 않는다
  if (Date.now() - new Date(blob.uploadedAt).getTime() > TTL_MS) return expired

  return NextResponse.redirect(blob.downloadUrl)
}
