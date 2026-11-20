/**
 * src/main/pdf.ts — printToPDF (네컷 인쇄용 PDF만)
 *
 * 합성한 네컷 PNG(가로 1844×1240)를 드라이버 인쇄 페이지(6.15×4.13in 가로)에 **1:1로** 얹는다.
 * 돌리지도 늘리지도 않는다 (SPEC §4-1 — 2026-11-18 가로 네컷).
 * 인쇄는 pdf-to-printer로 이 PDF를 보내므로(main/print.ts), 규격은 여기서 확정한다.
 *
 * 보호자 리포트 PDF는 v2부터 백엔드 서버가 만든다 — 여기에는 없다.
 */

import { BrowserWindow } from 'electron'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { assertSessionId, insideDataRoot, pathsFor } from './storage'
import { FOURCUT, PRINT_PAGE_INCHES } from '../shared/constants'
import type { RenderPhotoPdfRequest, SavedFile } from '../shared/types'

/** 페이지가 렌더를 마쳤는지 폴링 */
async function waitForRenderReady(win: BrowserWindow, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const ready = await win.webContents.executeJavaScript(
      'window.__MDV_RENDER_READY__ === true',
      true,
    )
    if (ready) return
    if (Date.now() > deadline) throw new Error('PDF 렌더 대기 시간 초과')
    await new Promise((r) => setTimeout(r, 50))
  }
}

async function withOffscreenWindow<T>(
  size: { width: number; height: number },
  fn: (win: BrowserWindow) => Promise<T>,
): Promise<T> {
  // offscreen 렌더링은 printToPDF와 조합 시 불안정한 사례가 있어 숨긴 창을 쓴다
  const win = new BrowserWindow({
    show: false,
    width: size.width,
    height: size.height,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  })
  try {
    return await fn(win)
  } finally {
    if (!win.isDestroyed()) win.destroy()
  }
}

/**
 * 합성 PNG 하나만 얹은 최소 HTML.
 * 웹폰트·외부 리소스 없음 (오프라인) — 이미지도 file:// 로컬 참조.
 *
 * 사일런트 인쇄는 PDF를 확대 없이 용지 왼쪽 위부터 얹는다 (DP-DS620 실기 확인).
 * 페이지를 용지와 같게 만들고 가로 네컷을 그대로 채운다. 인쇄 방향은 print.ts가 landscape로 고정한다.
 */
function photoPageHtml(imageUrl: string): string {
  const { width: w, height: h } = PRINT_PAGE_INCHES
  return `<!doctype html>
<meta charset="utf-8">
<style>
  @page { size: ${w}in ${h}in; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  /* 크로미움이 페이지 높이를 살짝 내림한다. 딱 맞추면 빈 2페이지가 생겨 종이가 한 장 더 나간다 */
  .page { position: relative; width: ${w}in; height: calc(${h}in - 1px); overflow: hidden; }
  img {
    position: absolute;
    top: 0;
    left: 0;
    width: ${w}in;
    height: ${h}in;
    /* 캔버스(1844×1240)와 페이지 비율이 같아 사실상 1:1이다. 어긋나도 여백 없이 채운다 (풀블리드) */
    object-fit: cover;
  }
</style>
<div class="page"><img id="shot" src="${imageUrl}"></div>
<script>
  window.__MDV_RENDER_READY__ = false;
  var img = document.getElementById('shot');
  function done() { window.__MDV_RENDER_READY__ = true; }
  if (img.complete) done(); else { img.onload = done; img.onerror = done; }
</script>`
}

export async function renderPhotoPdf(req: RenderPhotoPdfRequest): Promise<SavedFile> {
  // 렌더러가 넘긴 값 — 세션 폴더 안의 이미지만 받는다
  assertSessionId(req.sessionId, 'renderPhotoPdf')
  const imagePath = insideDataRoot(req.imagePath, 'renderPhotoPdf')
  if (!/\.(png|jpe?g)$/i.test(imagePath)) {
    throw new Error(`renderPhotoPdf: 이미지 파일이 아닙니다 (${req.imagePath})`)
  }

  const paths = pathsFor(req.sessionId)
  await mkdir(paths.outputDir, { recursive: true })

  const htmlPath = join(paths.outputDir, '_print_photo.html')
  await writeFile(htmlPath, photoPageHtml(pathToFileURL(imagePath).href), 'utf8')

  const outPath = join(paths.outputDir, 'photo_4x6.pdf')

  const pdf = await withOffscreenWindow(
    { width: FOURCUT.width, height: FOURCUT.height },
    async (win) => {
      await win.loadFile(htmlPath)
      await waitForRenderReady(win)

      return win.webContents.printToPDF({
        pageSize: { ...PRINT_PAGE_INCHES },
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
        printBackground: true,
        preferCSSPageSize: true,
      })
    },
  )

  await writeFile(outPath, pdf)
  return { path: outPath, bytes: pdf.length }
}
