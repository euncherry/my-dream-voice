/**
 * photo/composeFourCut.ts — 네컷 합성 (4×6인치 캔버스)
 *
 * SPIKE_PLAN ② 완료 기준
 *   - 각 컷에 직업 프레임(placeholder)이 합성된다
 *   - 4컷이 4×6인치 비율 캔버스에 배열되어 이미지로 저장된다 (300dpi 기준 1200×1800px)
 *
 * ※ 캔버스 합성은 GPU가 처리하는 렌더러 작업이고 결과는 dataURL 하나뿐이므로
 *   렌더러에 둔다. 디스크 IO는 메인(window.api.photo.save)에서 한다.
 */

import { PRINT_DPI, PRINT_INCHES } from '@shared/constants'
import { JOB_BY_ID } from '@shared/jobs'
import type { JobId } from '@shared/types'

export const FOURCUT_CANVAS = {
  width: PRINT_INCHES.width * PRINT_DPI, // 1200
  height: PRINT_INCHES.height * PRINT_DPI, // 1800
} as const

/** 네컷 배열 — 2×2 그리드 + 하단 로고 영역 */
const LAYOUT = {
  margin: 60,
  gutter: 30,
  footer: 180,
} as const

export interface CutCell {
  x: number
  y: number
  width: number
  height: number
}

/** 컷 4개의 좌표를 계산한다. 프레임 아트가 확정되면 이 값에 맞춰 아트를 제작한다. */
export function cutCells(): CutCell[] {
  const { margin, gutter, footer } = LAYOUT
  const usableW = FOURCUT_CANVAS.width - margin * 2
  const usableH = FOURCUT_CANVAS.height - margin * 2 - footer
  const w = (usableW - gutter) / 2
  const h = (usableH - gutter) / 2

  return [0, 1, 2, 3].map((i) => ({
    x: margin + (i % 2) * (w + gutter),
    y: margin + Math.floor(i / 2) * (h + gutter),
    width: w,
    height: h,
  }))
}

function newCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas')
  canvas.width = FOURCUT_CANVAS.width
  canvas.height = FOURCUT_CANVAS.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D 컨텍스트를 만들 수 없습니다')
  return { canvas, ctx }
}

function drawFooter(ctx: CanvasRenderingContext2D, recommendedJob?: JobId): void {
  const y = FOURCUT_CANVAS.height - LAYOUT.footer
  ctx.fillStyle = '#1b1f27'
  ctx.fillRect(0, y, FOURCUT_CANVAS.width, LAYOUT.footer)

  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.font = 'bold 52px "Malgun Gothic", sans-serif'
  ctx.fillText('마이 드림 보이스', FOURCUT_CANVAS.width / 2, y + 76)

  ctx.font = '38px "Malgun Gothic", sans-serif'
  ctx.fillStyle = '#c9d0dc'
  // B모드는 추천 직업이 표기된 프레임을 쓴다 (SPEC §4-1)
  const sub = recommendedJob
    ? `오늘의 추천 직업 · ${JOB_BY_ID[recommendedJob]?.label ?? recommendedJob}`
    : '[PLACEHOLDER] 프레임 아트 미제작'
  ctx.fillText(sub, FOURCUT_CANVAS.width / 2, y + 134)
}

/**
 * 칸을 꽉 채우도록 가운데를 잘라 그린다 (CSS object-fit: cover와 같은 결과).
 * 카메라는 3:2 가로, 칸은 5:7 세로라 그대로 그리면 사람이 찌그러진다.
 */
function drawCover(ctx: CanvasRenderingContext2D, shot: ImageBitmap, cell: CutCell): void {
  const scale = Math.max(cell.width / shot.width, cell.height / shot.height)
  const sw = cell.width / scale
  const sh = cell.height / scale
  ctx.drawImage(
    shot,
    (shot.width - sw) / 2,
    (shot.height - sh) / 2,
    sw,
    sh,
    cell.x,
    cell.y,
    cell.width,
    cell.height,
  )
}

/**
 * 실제 촬영 프레임으로 합성한다.
 * @param shots 컷 4개 이미지 (촬영 결과)
 */
export function composeFourCut(
  shots: ImageBitmap[],
  jobs: JobId[],
  recommendedJob?: JobId,
): string {
  const { canvas, ctx } = newCanvas()
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  // 2400만 화소를 525px로 크게 줄이므로 기본값(low)이면 계단 현상이 인쇄에 보인다
  ctx.imageSmoothingQuality = 'high'

  cutCells().forEach((cell, i) => {
    const shot = shots[i]
    if (shot) drawCover(ctx, shot, cell)

    // TODO: 직업별 프레임 아트 합성 (미제작 — 현재는 테두리만)
    const job = jobs[i]
    ctx.strokeStyle = job ? JOB_BY_ID[job]!.placeholderColor : '#cccccc'
    ctx.lineWidth = 12
    ctx.strokeRect(cell.x, cell.y, cell.width, cell.height)
  })

  drawFooter(ctx, recommendedJob)
  return canvas.toDataURL('image/png')
}

/**
 * 촬영 전(골격 단계) 규격 검증용 — 색 박스 + 직업명으로 4컷을 대신한다.
 * 카메라가 붙으면 composeFourCut()으로 대체된다.
 */
export function composePlaceholderFourCut(jobs: JobId[], recommendedJob?: JobId): string {
  const { canvas, ctx } = newCanvas()
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  cutCells().forEach((cell, i) => {
    const job = jobs[i]
    const def = job ? JOB_BY_ID[job] : undefined

    ctx.fillStyle = def?.placeholderColor ?? '#9aa2b1'
    ctx.fillRect(cell.x, cell.y, cell.width, cell.height)

    ctx.fillStyle = '#12151b'
    ctx.textAlign = 'center'
    ctx.font = 'bold 56px "Malgun Gothic", sans-serif'
    ctx.fillText(def?.label ?? `컷 ${i + 1}`, cell.x + cell.width / 2, cell.y + cell.height / 2)
    ctx.font = '30px "Malgun Gothic", sans-serif'
    ctx.fillText('PLACEHOLDER', cell.x + cell.width / 2, cell.y + cell.height / 2 + 52)
  })

  drawFooter(ctx, recommendedJob)
  return canvas.toDataURL('image/png')
}
