/**
 * GET /api/cron/cleanup — 24시간 경과 파일 정리 (Vercel Cron)
 *
 * SPIKE_PLAN ⑥: "24시간 만료 삭제가 동작한다 (TTL 짧게 설정해 테스트)"
 * → 테스트 시에는 MDV_TTL_MINUTES 를 짧게 잡아 확인한다.
 */

import { del, list } from '@vercel/blob'
import { NextResponse } from 'next/server'
import { BLOB_PREFIX, TTL_MS } from '@/lib/blobPaths'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function ttlMs(): number {
  const override = Number(process.env.MDV_TTL_MINUTES)
  return Number.isFinite(override) && override > 0 ? override * 60_000 : TTL_MS
}

export async function GET(req: Request): Promise<NextResponse> {
  // Vercel Cron은 Authorization: Bearer $CRON_SECRET 을 붙여 호출한다
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const cutoff = Date.now() - ttlMs()
  const expired: string[] = []
  let cursor: string | undefined

  do {
    const page = await list({ prefix: BLOB_PREFIX, cursor, limit: 1000 })
    for (const blob of page.blobs) {
      if (new Date(blob.uploadedAt).getTime() < cutoff) expired.push(blob.url)
    }
    cursor = page.hasMore ? page.cursor : undefined
  } while (cursor)

  if (expired.length > 0) await del(expired)

  return NextResponse.json({ deleted: expired.length, cutoff: new Date(cutoff).toISOString() })
}
