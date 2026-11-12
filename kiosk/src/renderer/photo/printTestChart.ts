/**
 * photo/printTestChart.ts — 인쇄 크기 점검표 (D-01 테스트 인쇄, 개발 전용)
 *
 * 네컷과 같은 경로(1200×1800 PNG → 4×6 PDF → 사일런트 인쇄)로 내보낸다.
 * 뽑힌 종이를 자로 재면 배율·잘림·여백·회전을 바로 알 수 있다.
 * 인쇄 페이지를 채우느라 약 3% 커지고, 프린터가 가장자리를 잘라 검정·빨강 테두리는 사라질 수 있다.
 */

import { PRINT_DPI } from '@shared/constants'
import { FOURCUT_CANVAS } from './composeFourCut'

const { width: W, height: H } = FOURCUT_CANVAS
const CM = PRINT_DPI / 2.54
const FONT = '"Malgun Gothic", sans-serif'

/** 바깥부터 안쪽으로 — 어느 색까지 사라졌는지로 잘린 양을 읽는다 */
const RINGS = [
  { insetIn: 0, color: '#000000', name: '검정 0' },
  { insetIn: 0.1, color: '#d6232f', name: '빨강 0.1' },
  { insetIn: 0.2, color: '#1f5fd6', name: '파랑 0.2' },
  { insetIn: 0.3, color: '#1e9e4a', name: '초록 0.3in' },
] as const

const LINE = 6

function text(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  font: string,
  align: CanvasTextAlign = 'left',
): void {
  ctx.font = `${font} ${FONT}`
  ctx.textAlign = align
  ctx.fillText(value, x, y)
}

function drawRings(ctx: CanvasRenderingContext2D): void {
  ctx.lineWidth = LINE
  for (const ring of RINGS) {
    const inset = ring.insetIn * PRINT_DPI + LINE / 2
    ctx.strokeStyle = ring.color
    ctx.strokeRect(inset, inset, W - inset * 2, H - inset * 2)
  }
}

function drawSideLabels(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#000000'
  text(ctx, '위', W / 2, 170, 'bold 44px', 'center')
  text(ctx, '아래', W / 2, 1670, 'bold 44px', 'center')
  text(ctx, '왼쪽', 170, H / 2, 'bold 44px', 'center')
  text(ctx, '오른쪽', 1030, H / 2, 'bold 44px', 'center')
}

/** 눈금 막대 — 자로 재서 100% 배율인지 확인한다 */
function drawRulers(ctx: CanvasRenderingContext2D): void {
  ctx.strokeStyle = '#000000'
  ctx.fillStyle = '#000000'
  ctx.lineWidth = 4

  const vx = 300
  const vy = 290
  ctx.beginPath()
  ctx.moveTo(vx, vy)
  ctx.lineTo(vx, vy + 10 * CM)
  for (let i = 0; i <= 10; i++) {
    ctx.moveTo(vx, vy + i * CM)
    ctx.lineTo(vx + 30, vy + i * CM)
  }
  ctx.stroke()
  for (let i = 0; i <= 10; i++) {
    text(ctx, i === 10 ? '10cm' : String(i), vx + 40, vy + i * CM + 10, '28px')
  }

  const hx = 420
  const hy = 1200
  ctx.beginPath()
  ctx.moveTo(hx, hy)
  ctx.lineTo(hx + 5 * CM, hy)
  for (let i = 0; i <= 5; i++) {
    ctx.moveTo(hx + i * CM, hy)
    ctx.lineTo(hx + i * CM, hy + 30)
  }
  ctx.stroke()
  for (let i = 0; i <= 5; i++) {
    text(ctx, i === 5 ? '5cm' : String(i), hx + i * CM, hy + 66, '28px', 'center')
  }
}

/** 가운데 표시 — 원이 찌그러지면 가로세로 배율이 다른 것이다 */
function drawCenter(ctx: CanvasRenderingContext2D): void {
  const cx = W / 2
  const cy = H / 2
  ctx.strokeStyle = '#000000'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.arc(cx, cy, PRINT_DPI / 2, 0, Math.PI * 2)
  ctx.moveTo(cx - 190, cy)
  ctx.lineTo(cx + 190, cy)
  ctx.moveTo(cx, cy - 190)
  ctx.lineTo(cx, cy + 190)
  ctx.stroke()
  ctx.fillStyle = '#000000'
  text(ctx, '원 지름 2.54cm', cx, cy + 235, '28px', 'center')
}

function drawGuide(ctx: CanvasRenderingContext2D, printerName: string): void {
  const x = 700
  ctx.fillStyle = '#000000'
  text(ctx, '인쇄 테스트', x, 310, 'bold 56px', 'center')
  text(ctx, '완성 크기 10.16 × 15.24 cm (4 × 6 in)', x, 368, '32px', 'center')
  text(ctx, printerName.slice(0, 32), x, 414, '28px', 'center')
  text(ctx, new Date().toLocaleString('ko-KR'), x, 456, '28px', 'center')

  const left = 420
  text(ctx, '① 세로 막대 약 10.3cm, 가로 막대 약 5.2cm', left, 1345, '28px')
  text(ctx, '② 사방에 파랑 테두리까지 보이면 정상', left, 1389, '28px')
  text(ctx, '③ 종이 끝에 흰 띠·검은 띠가 없으면 정상', left, 1433, '28px')

  let cursor = left
  for (const ring of RINGS) {
    ctx.fillStyle = ring.color
    text(ctx, ring.name, cursor, 1540, 'bold 28px')
    cursor += ctx.measureText(ring.name).width + 24
  }
}

export function composePrintTestChart(printerName: string): string {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D 컨텍스트를 만들 수 없습니다')

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)
  drawRings(ctx)
  drawSideLabels(ctx)
  drawRulers(ctx)
  drawCenter(ctx)
  drawGuide(ctx, printerName)
  return canvas.toDataURL('image/png')
}
