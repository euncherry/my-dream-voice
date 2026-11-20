/**
 * photo/printTestChart.ts — 인쇄 크기 점검표 (D-01 [하드웨어 체크] 테스트 인쇄 · 개발 전용)
 *
 * 근거: SPEC §4-1 (프레임 작업 규격) · V2_PLAN §4
 *
 * 네컷과 같은 경로로 내보낸다 — 가로 1844 × 1240 PNG → (6x4) 인쇄 페이지 PDF에 1:1 (main/pdf.ts) → 사일런트 인쇄.
 * 돌리지도 늘리지도 않으므로, 뽑힌 종이를 자로 재면 배율 · 잘림 · 가운데 정렬을 바로 읽을 수 있다.
 *
 * 프린터는 인쇄 페이지의 가장자리를 잘라 6 × 4 in 종이로 만든다 → 사방 약 0.07in 가 잘린다.
 * 그래서 맨 바깥 검정 테두리는 잘리고 빨강(0.1in)부터 보이는 것이 **예상값**이다 (실물 확인 전 — V2_PLAN §4 「실물」).
 *
 * 글자 · 눈금은 전부 FOURCUT.safeInset 안쪽(초록 테두리 안)에 둔다.
 */

import { FOURCUT, PRINT_DPI, PRINT_PAGE_INCHES, PRINT_PAPER_NAME } from '@shared/constants'

const { width: W, height: H } = FOURCUT
const CM = PRINT_DPI / 2.54
const FONT = '"Malgun Gothic", sans-serif'

/** 프린터가 가장자리를 잘라 남기는 실제 종이 (SPEC §4-1 「실제 종이」) */
const PAPER_IN = { width: 6, height: 4 } as const

/**
 * 한쪽에서 잘려 나가는 양(in) — 캔버스와 종이의 차이를 양쪽으로 나눈 값.
 * 좌우 0.073 · 위아래 0.067 로 조금 다르다 — 안내에는 큰 쪽을 "약 0.07" 로 적는다.
 */
const TRIM_IN = Math.max(
  (W / PRINT_DPI - PAPER_IN.width) / 2,
  (H / PRINT_DPI - PAPER_IN.height) / 2,
)

/** 바깥부터 안쪽으로 — 어느 색부터 보이는지로 잘린 양을 읽는다 */
const RINGS = [
  { insetIn: 0, color: '#000000', name: '검정 0' },
  { insetIn: 0.1, color: '#d6232f', name: '빨강 0.1' },
  { insetIn: 0.2, color: '#1f5fd6', name: '파랑 0.2' },
  { insetIn: 0.3, color: '#1e9e4a', name: '초록 0.3in' },
] as const

const LINE = 6
const INK = '#000000'

/** 글자 · 눈금을 두는 안쪽 상자 — 맨 안쪽 테두리와 안전 영역 중 더 안쪽에서 조금 더 들어간다 */
const INNER = Math.max(FOURCUT.safeInset, RINGS[RINGS.length - 1]!.insetIn * PRINT_DPI + LINE) + 24

const CX = W / 2
const CY = H / 2

/** 배치 — 서로 겹치지 않게 자리를 나눈다 (왼쪽: 제목 · 세로 막대 / 가운데: 원 / 오른쪽: 판독 안내 / 아래: 가로 막대) */
const LAYOUT = {
  /** 위 · 아래 · 왼쪽 · 오른쪽 글자의 가운데가 안쪽 상자 가장자리에서 떨어진 거리 */
  sideLabelY: 40,
  sideLabelX: 66,
  /** 세로 막대 (5cm) */
  vRuler: { x: INNER + 170, y: INNER + 120, cm: 5 },
  /** 가로 막대 (10cm) — 가운데 정렬 */
  hRuler: { y: H - INNER - 170, cm: 10 },
  /** 제목 · 규격 · 프린터 · 시각 */
  title: { x: INNER + 320, y: INNER + 112, maxWidth: 460 },
  /** 판독 안내 — 오른쪽 글자보다 위에서 끝난다 */
  guide: { x: CX + 218, y: INNER + 112, maxWidth: 560 },
  /** 테두리 색 이름 — 오른쪽 글자 아래 */
  legend: { x: CX + 218, y: CY + 86 },
  /** 가운데 십자의 팔 길이 */
  crossArm: 180,
} as const

function text(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  font: string,
  align: CanvasTextAlign = 'left',
  maxWidth?: number,
): void {
  ctx.font = `${font} ${FONT}`
  ctx.textAlign = align
  // maxWidth 를 넘으면 캔버스가 가로로 눌러 맞춘다 — 옆 자리로 넘치지 않게 하는 안전 장치
  ctx.fillText(value, x, y, maxWidth)
}

function drawRings(ctx: CanvasRenderingContext2D): void {
  ctx.lineWidth = LINE
  for (const ring of RINGS) {
    const inset = ring.insetIn * PRINT_DPI + LINE / 2
    ctx.strokeStyle = ring.color
    ctx.strokeRect(inset, inset, W - inset * 2, H - inset * 2)
  }
}

/** 종이의 어느 쪽인지 — 방향이 돌아가 나왔는지 본다 */
function drawSideLabels(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = INK
  ctx.textBaseline = 'middle'
  text(ctx, '위', CX, INNER + LAYOUT.sideLabelY, 'bold 44px', 'center')
  text(ctx, '아래', CX, H - INNER - LAYOUT.sideLabelY, 'bold 44px', 'center')
  text(ctx, '왼쪽', INNER + LAYOUT.sideLabelX, CY, 'bold 44px', 'center')
  text(ctx, '오른쪽', W - INNER - LAYOUT.sideLabelX, CY, 'bold 44px', 'center')
  ctx.textBaseline = 'alphabetic'
}

/** 눈금 막대 — 자로 재서 1:1 인지 확인한다 (가로 10cm · 세로 5cm) */
function drawRulers(ctx: CanvasRenderingContext2D): void {
  ctx.strokeStyle = INK
  ctx.fillStyle = INK
  ctx.lineWidth = 4

  const v = LAYOUT.vRuler
  ctx.beginPath()
  ctx.moveTo(v.x, v.y)
  ctx.lineTo(v.x, v.y + v.cm * CM)
  for (let i = 0; i <= v.cm; i++) {
    ctx.moveTo(v.x, v.y + i * CM)
    ctx.lineTo(v.x + 30, v.y + i * CM)
  }
  ctx.stroke()
  for (let i = 0; i <= v.cm; i++) {
    text(ctx, i === v.cm ? `${v.cm}cm` : String(i), v.x + 42, v.y + i * CM + 10, '28px')
  }

  const h = LAYOUT.hRuler
  const hx = CX - (h.cm * CM) / 2
  ctx.beginPath()
  ctx.moveTo(hx, h.y)
  ctx.lineTo(hx + h.cm * CM, h.y)
  for (let i = 0; i <= h.cm; i++) {
    ctx.moveTo(hx + i * CM, h.y)
    ctx.lineTo(hx + i * CM, h.y + 30)
  }
  ctx.stroke()
  for (let i = 0; i <= h.cm; i++) {
    text(ctx, i === h.cm ? `${h.cm}cm` : String(i), hx + i * CM, h.y + 66, '28px', 'center')
  }
}

/** 가운데 표시 — 지름 1in 원과 십자. 원이 찌그러지면 가로 · 세로 배율이 다른 것이다 */
function drawCenter(ctx: CanvasRenderingContext2D): void {
  const arm = LAYOUT.crossArm
  ctx.strokeStyle = INK
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.arc(CX, CY, PRINT_DPI / 2, 0, Math.PI * 2)
  ctx.moveTo(CX - arm, CY)
  ctx.lineTo(CX + arm, CY)
  ctx.moveTo(CX, CY - arm)
  ctx.lineTo(CX, CY + arm)
  ctx.stroke()
  ctx.fillStyle = INK
  text(ctx, '원 지름 2.54cm (1in)', CX, CY + arm + 40, '26px', 'center')
}

function drawTitle(ctx: CanvasRenderingContext2D, printerName: string): void {
  const { x, y, maxWidth } = LAYOUT.title
  const page = PRINT_PAGE_INCHES
  const cm = (inches: number): string => (inches * 2.54).toFixed(2)

  ctx.fillStyle = INK
  text(ctx, '인쇄 테스트', x, y, 'bold 52px', 'left', maxWidth)
  const lines = [
    `캔버스 ${W} × ${H} px · ${PRINT_DPI}dpi · 가로`,
    `인쇄 페이지 ${PRINT_PAPER_NAME} · ${page.width} × ${page.height} in`,
    `종이 ${PAPER_IN.width} × ${PAPER_IN.height} in (${cm(PAPER_IN.width)} × ${cm(PAPER_IN.height)} cm)`,
    printerName.slice(0, 32),
    new Date().toLocaleString('ko-KR'),
  ]
  lines.forEach((line, i) => text(ctx, line, x, y + 50 + i * 38, '26px', 'left', maxWidth))
}

/** 판독 안내 — 사실만 적는다. 잘림은 실물 확인 전이라 "예상"이다 */
function drawGuide(ctx: CanvasRenderingContext2D): void {
  const { x, y, maxWidth } = LAYOUT.guide
  const h = LAYOUT.hRuler.cm.toFixed(1)
  const v = LAYOUT.vRuler.cm.toFixed(1)
  const trim = TRIM_IN.toFixed(2)

  ctx.fillStyle = INK
  text(ctx, '판독 — 가로 · 1:1 인쇄', x, y, 'bold 30px', 'left', maxWidth)
  const lines = [
    `① 가로 막대 ${h}cm · 세로 막대 ${v}cm 로`,
    '    재져야 한다 (돌리지 않음 · 늘리지 않음)',
    `② 종이는 가운데 ${PAPER_IN.width} × ${PAPER_IN.height} in 만 남는다 —`,
    `    사방 약 ${trim}in 가 잘린다`,
    '    예상: 검정 테두리는 잘리고 빨강부터',
    '    보인다 (실물 확인 전)',
    '③ 사방에 같은 색까지 보이면 가운데 정렬',
  ]
  lines.forEach((line, i) => text(ctx, line, x, y + 46 + i * 38, '26px', 'left', maxWidth))
}

function drawLegend(ctx: CanvasRenderingContext2D): void {
  const { x, y } = LAYOUT.legend
  ctx.fillStyle = INK
  text(ctx, '테두리 — 바깥부터 (가장자리에서 in)', x, y, '26px')

  let cursor = x
  for (const ring of RINGS) {
    ctx.fillStyle = ring.color
    text(ctx, ring.name, cursor, y + 44, 'bold 28px')
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
  drawTitle(ctx, printerName)
  drawGuide(ctx)
  drawLegend(ctx)
  return canvas.toDataURL('image/png')
}
