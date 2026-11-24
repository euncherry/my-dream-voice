/**
 * photo/composeFourCut.ts — 가로 네컷 합성 (P-06 [촬영] → 인쇄 · P-07 화면)
 *
 * 근거: SPEC §4-1 (프레임 작업 규격) · V2_PLAN §4 · 구성 스케치 docs/user-flow/wf/print.svg
 *
 * 캔버스는 FOURCUT (1844 × 1240 px · 300dpi · 가로). 드라이버 (6x4) 인쇄 페이지와 같아
 * 돌리지도 늘리지도 않고 1:1로 인쇄된다 (얹는 쪽: src/main/pdf.ts).
 * 실제 종이는 가운데 1800 × 1200 — 바깥(좌우 22px · 위아래 20px)은 잘릴 수 있어, 중요한 것은 FOURCUT.safeInset 안쪽에 둔다.
 *
 * 사진 칸 4개 · 오른쪽 세로 띠 좌표는 전부 @shared/constants 의 FOURCUT 에서 읽는다.
 * 여기에 좌표를 다시 적지 않는다 — 디자이너 값이 오면 constants.ts 만 바꾼다.
 * QR 없음 · 추천 직업 없음 · A/B 같은 프레임 · 네 칸 모두 고른 직업 하나.
 *
 * 프레임 아트 — public/frames/<jobId>.png (public/frames/README.md · 2026-11-23 직업별 6장 · 직업 ↔ 파일은 FRAME_FILE)
 *   있으면 사진 위 **맨 위에** 얹고, 없으면 코드로 그린 PLACEHOLDER 프레임을 쓴다.
 *
 * ※ 캔버스 합성은 렌더러에서 한다 — 결과는 dataURL 하나뿐이다.
 *   저장은 메인(window.api.photo.save)이 한다. 이 파일에서는 IPC를 부르지 않는다.
 */

import { FOURCUT, type Rect } from '@shared/constants'
import { JOB_BY_ID, jobLabel } from '@shared/jobs'
import type { JobId } from '@shared/types'

/**
 * 그 직업 프레임의 사진 칸 4개 — 프레임마다 칸 자리가 다를 수 있다 (FOURCUT.cellsByJob · 없으면 FOURCUT.cells).
 * 합성 · 미리보기(FramePreview) · 촬영 라이브뷰(P-06) · 촬영 장면 녹화가 모두 이것을 쓴다.
 */
export function cellsFor(job: JobId): readonly Rect[] {
  return FOURCUT.cellsByJob[job] ?? FOURCUT.cells
}

/** 사진 칸 가로 ÷ 세로 — P-06 촬영 프리뷰가 이 비율로 잘라 보여 줘야 인쇄물과 같은 구도가 된다 */
export function cellAspect(job: JobId): number {
  const cell = cellsFor(job)[0]!
  return cell.width / cell.height
}

// ────────────────────────────────────────────────────────────
// 프레임 아트 (있으면 쓰고, 없으면 placeholder)
// ────────────────────────────────────────────────────────────

/**
 * 직업마다 얹을 프레임 파일 (public/frames/ 안) — 2026-11-23 받은 직업별 프레임 6장.
 * (그날 잠시 6개 직업이 한 장을 같이 썼다 — 그 한 장은 우주 그림이라 우주비행사 프레임이 됐다)
 * 프레임을 바꾸거나 여러 직업이 한 장을 같이 쓰게 하려면 여기만 바꾼다
 */
const FRAME_FILE: Record<JobId, string> = {
  police: 'police.png',
  astronaut: 'astronaut.png',
  singer: 'singer-test.png', // 2026-11-24 시험 — 새 틀(구름 칸). 원래 그림은 singer.png 그대로 있다
  creator: 'creator.png',
  doctor: 'doctor.png',
  roboticist: 'roboticist.png',
}

/** file:// 로 뜨는 설치판 때문에 상대 경로로 적는다 (`/frames/...` 절대 경로 금지) */
export const frameArtSrc = (job: JobId): string => `./frames/${FRAME_FILE[job]}`

const artLoads = new Map<JobId, Promise<HTMLImageElement | null>>()
const artKnown = new Map<JobId, HTMLImageElement | null>()

/**
 * 직업 프레임 아트를 불러 본다 — 있으면 이미지, 없으면 null.
 *
 * fetch 로 확인하지 않는다: 설치판은 file:// 이라 fetch 가 안 되고,
 * 개발 서버는 없는 파일에 index.html 을 돌려주므로 응답 코드로는 알 수 없다.
 * Image 로 불러 보아 **로드 실패 = 없음** 으로 본다.
 *
 * 결과는 직업별로 기억한다 — 파일을 새로 넣었으면 앱을 다시 띄워야 반영된다.
 */
export function loadFrameArt(job: JobId): Promise<HTMLImageElement | null> {
  const cached = artLoads.get(job)
  if (cached) return cached

  const load = new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = frameArtSrc(job)
  }).then((img) => {
    if (img && (img.naturalWidth !== FOURCUT.width || img.naturalHeight !== FOURCUT.height)) {
      // 크기가 달라도 캔버스 전체에 맞춰 얹기는 한다 — 비율이 다르면 칸이 어긋난다
      console.warn(
        `[frame] ${frameArtSrc(job)} 크기가 ${img.naturalWidth}×${img.naturalHeight} — 규격은 ${FOURCUT.width}×${FOURCUT.height} (SPEC §4-1)`,
      )
    }
    artKnown.set(job, img)
    return img
  })

  artLoads.set(job, load)
  return load
}

/**
 * 이미 확인한 결과를 기다리지 않고 읽는다 (FramePreview 가 첫 그림부터 맞는 프레임을 그리려고 쓴다).
 * @returns 이미지 = 아트 있음 / null = 없음(placeholder) / undefined = 아직 확인 전
 */
export function peekFrameArt(job: JobId): HTMLImageElement | null | undefined {
  return artKnown.get(job)
}

// ────────────────────────────────────────────────────────────
// PLACEHOLDER 프레임 — 아트가 오기 전까지 (SPEC §4-1 · 디자이너 제작)
// ────────────────────────────────────────────────────────────

/** 오른쪽 띠 글자 — 구성 스케치(print.svg)의 띠 구성. FramePreview 가 같은 글자를 쓴다 */
export const PLACEHOLDER_FRAME_COPY = {
  brand: ['마이 드림', '보이스'],
  /** 인쇄물에서도 placeholder 임이 보이게 띠에 세로로 적는다 */
  mark: 'PLACEHOLDER 프레임',
} as const

/**
 * 종이 위의 색 — 화면 토큰(tokens.css)이 아니라 인쇄물 색이다.
 * styles/frame.css 의 --frame-* 과 같은 값 (FramePreview 가 같은 모양으로 그린다).
 */
const PAPER = {
  base: '#ffffff',
  strip: 'rgba(255, 255, 255, 0.88)',
  ink: '#1b1f27',
  emptyCell: '#d9dce2',
  emptyInk: '#6b707a',
} as const

const FONT = '"Malgun Gothic", sans-serif'

/**
 * 띠 안 글자 배치 — 띠 너비(u)에 대한 비율. styles/frame.css 의 .frame__strip 과 맞춘 값이다.
 * (띠 좌표가 바뀌어도 따라가게 비율로 둔다)
 */
const STRIP = {
  pad: 0.1,
  bottomPad: 0.12,
  brandSize: 0.18,
  brandCenters: [0.237, 0.471],
  jobSize: 0.16,
  jobCenter: 0.792,
  markSize: 0.26,
} as const

/** 가운데 정렬 한 줄 — 폭을 넘으면 글자 크기를 줄여 맞춘다 */
function fitText(
  ctx: CanvasRenderingContext2D,
  value: string,
  cx: number,
  cy: number,
  maxWidth: number,
  px: number,
): void {
  ctx.font = `bold ${px}px ${FONT}`
  const width = ctx.measureText(value).width
  if (width > maxWidth) ctx.font = `bold ${Math.floor((px * maxWidth) / width)}px ${FONT}`
  ctx.fillText(value, cx, cy)
}

/**
 * 프레임 PNG 와 같은 모양으로 그린다 — 칸 바깥 전부를 직업 색으로 덮고 칸만 뚫어 둔다.
 * 사진을 먼저 그린 뒤 그 위에 부른다.
 */
function drawPlaceholderFrame(ctx: CanvasRenderingContext2D, job: JobId): void {
  const { width: W, height: H, cells, strip } = FOURCUT

  ctx.beginPath()
  ctx.rect(0, 0, W, H)
  for (const cell of cells) ctx.rect(cell.x, cell.y, cell.width, cell.height)
  ctx.fillStyle = JOB_BY_ID[job]?.placeholderColor ?? PAPER.emptyInk
  ctx.fill('evenodd')

  // 오른쪽 세로 띠 (로고 자리)
  ctx.fillStyle = PAPER.strip
  ctx.fillRect(strip.x, strip.y, strip.width, strip.height)

  const u = strip.width
  const cx = strip.x + u / 2
  const maxWidth = u * (1 - STRIP.pad * 2)

  ctx.fillStyle = PAPER.ink
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  PLACEHOLDER_FRAME_COPY.brand.forEach((text, i) => {
    fitText(ctx, text, cx, strip.y + u * STRIP.brandCenters[i]!, maxWidth, u * STRIP.brandSize)
  })
  fitText(ctx, jobLabel(job), cx, strip.y + u * STRIP.jobCenter, maxWidth, u * STRIP.jobSize)

  // 띠가 좁아 placeholder 표시는 세로로 — 위에서 아래로 읽히게 시계 방향으로 돌린다
  const markRoom = strip.height - u * (STRIP.jobCenter + STRIP.jobSize + STRIP.bottomPad)
  ctx.font = `bold ${u * STRIP.markSize}px ${FONT}`
  const markLength = Math.min(ctx.measureText(PLACEHOLDER_FRAME_COPY.mark).width, markRoom)
  ctx.save()
  ctx.translate(cx, strip.y + strip.height - u * STRIP.bottomPad - markLength / 2)
  ctx.rotate(Math.PI / 2)
  fitText(ctx, PLACEHOLDER_FRAME_COPY.mark, 0, 0, markRoom, u * STRIP.markSize)
  ctx.restore()
}

// ────────────────────────────────────────────────────────────
// 합성
// ────────────────────────────────────────────────────────────

function newCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas')
  canvas.width = FOURCUT.width
  canvas.height = FOURCUT.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D 컨텍스트를 만들 수 없습니다')

  ctx.fillStyle = PAPER.base
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  // 2400만 화소 원본을 칸 크기로 크게 줄인다 — 기본값(low)이면 계단 현상이 인쇄에 보인다
  ctx.imageSmoothingQuality = 'high'
  return { canvas, ctx }
}

/**
 * 칸을 꽉 채우도록 가운데를 잘라 그린다 (CSS object-fit: cover 와 같은 결과).
 * 카메라 원본은 3:2 — 칸 비율(cellAspect)과 다른 만큼 위아래나 좌우가 잘린다.
 * **거울처럼 좌우 반전해서 그린다** (2026-11-23 지정) — P-06 라이브뷰에서 본 모습 그대로 인쇄되게
 * (오른손을 들면 사진에서도 오른쪽 · 옷의 글씨는 거꾸로). 사진만 뒤집고 프레임 그림은 뒤집지 않는다.
 */
function drawCover(ctx: CanvasRenderingContext2D, shot: ImageBitmap, cell: Rect): void {
  const scale = Math.max(cell.width / shot.width, cell.height / shot.height)
  const sw = cell.width / scale
  const sh = cell.height / scale
  ctx.save()
  // 칸의 오른쪽 끝을 원점으로 옮겨 가로를 뒤집는다 — 가운데 잘라내기라 뒤집어도 같은 부분이 담긴다
  ctx.translate(cell.x + cell.width, cell.y)
  ctx.scale(-1, 1)
  ctx.drawImage(
    shot,
    (shot.width - sw) / 2,
    (shot.height - sh) / 2,
    sw,
    sh,
    0,
    0,
    cell.width,
    cell.height,
  )
  ctx.restore()
}

function fillCell(ctx: CanvasRenderingContext2D, cell: Rect): void {
  ctx.fillStyle = PAPER.emptyCell
  ctx.fillRect(cell.x, cell.y, cell.width, cell.height)
}

/** 프레임을 맨 위에 얹는다 — 아트 PNG 가 있으면 그것을, 없으면 placeholder 프레임을 */
async function drawFrame(ctx: CanvasRenderingContext2D, job: JobId): Promise<void> {
  const art = await loadFrameArt(job)
  if (art) ctx.drawImage(art, 0, 0, FOURCUT.width, FOURCUT.height)
  else drawPlaceholderFrame(ctx, job)
}

/**
 * 촬영한 네 컷을 고른 직업 프레임 한 장에 합성한다.
 * @param shots 컷 4개 (cellsFor(job) 순서 — 왼쪽 위 → 오른쪽 위 → 왼쪽 아래 → 오른쪽 아래)
 * @returns PNG dataURL (1844 × 1240)
 */
export async function composeFourCut(shots: ImageBitmap[], job: JobId): Promise<string> {
  const { canvas, ctx } = newCanvas()

  cellsFor(job).forEach((cell, i) => {
    const shot = shots[i]
    if (shot) drawCover(ctx, shot, cell)
    else fillCell(ctx, cell) // 컷이 모자라면 빈 칸으로 — 눈에 보이게
  })

  await drawFrame(ctx, job)
  return canvas.toDataURL('image/png')
}

/**
 * 카메라 없이 흐름을 확인할 때(개발) — 사진 자리에 "PLACEHOLDER" 를 적은 네컷.
 * 프레임은 composeFourCut 과 같은 것을 얹는다.
 */
export async function composePlaceholderFourCut(job: JobId): Promise<string> {
  const { canvas, ctx } = newCanvas()

  cellsFor(job).forEach((cell, i) => {
    fillCell(ctx, cell)

    const cx = cell.x + cell.width / 2
    const cy = cell.y + cell.height / 2
    const maxWidth = cell.width * 0.8
    ctx.fillStyle = PAPER.emptyInk
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    fitText(ctx, String(i + 1), cx, cy - cell.height * 0.08, maxWidth, cell.height * 0.3)
    fitText(ctx, 'PLACEHOLDER', cx, cy + cell.height * 0.2, maxWidth, cell.height * 0.09)
  })

  await drawFrame(ctx, job)
  return canvas.toDataURL('image/png')
}
