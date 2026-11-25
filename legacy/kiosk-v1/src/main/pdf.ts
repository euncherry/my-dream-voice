/**
 * src/main/pdf.ts — printToPDF
 *
 * SPIKE_PLAN ④ 완료 기준
 *   - 리포트 HTML 템플릿에 데이터만 주입하면 내용이 바뀐다 (템플릿 1개, 하드코딩 없음)
 *   - printToPDF로 A4 PDF가 생성·저장된다
 *   - 한글 폰트가 깨지지 않는다 (⚠️ 웹폰트 CDN 금지 — 폰트 파일 로컬 포함)
 *
 * 두 종류를 만든다.
 *   1) 보호자 리포트 PDF (A4)          → report.html?#data=... 를 렌더
 *   2) 인쇄용 네컷 PDF (4×6 풀블리드)   → 합성 PNG를 드라이버 인쇄 페이지에 돌려 얹음
 *      (⑤ 인쇄는 pdf-to-printer로 PDF를 보내므로, 규격은 여기서 확정한다)
 */

import { BrowserWindow } from 'electron'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { rendererEntry } from './index'
import { pathsFor } from './storage'
import { PRINT_PAGE_INCHES } from '../shared/constants'
import type { RenderPhotoPdfRequest, RenderReportPdfRequest, SavedFile } from '../shared/types'

/** 리포트/사진 페이지가 렌더를 마쳤는지 폴링 */
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

// ────────────────────────────────────────────────────────────
// 1) 보호자 리포트 PDF (A4)
// ────────────────────────────────────────────────────────────

export async function renderReportPdf(req: RenderReportPdfRequest): Promise<SavedFile> {
  const paths = pathsFor(req.sessionId)
  await mkdir(paths.outputDir, { recursive: true })
  const outPath = join(paths.outputDir, 'report.pdf')

  // 데이터 주입은 URL 해시로 — 템플릿은 데이터의 순수 함수로 유지한다.
  const hash = `#data=${encodeURIComponent(JSON.stringify(req.result))}`
  const entry = rendererEntry('report.html')

  const pdf = await withOffscreenWindow({ width: 794, height: 1123 }, async (win) => {
    if (entry.url) await win.loadURL(entry.url + hash)
    else await win.loadFile(entry.file!, { hash: hash.slice(1) })

    await waitForRenderReady(win)

    return win.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      // 여백은 리포트 CSS(@page)에서 관리한다
      preferCSSPageSize: true,
    })
  })

  await writeFile(outPath, pdf)
  return { path: outPath, bytes: pdf.length }
}

// ────────────────────────────────────────────────────────────
// 2) 인쇄용 네컷 PDF (4×6 풀블리드)
// ────────────────────────────────────────────────────────────

/**
 * 합성 PNG 하나만 얹은 최소 HTML.
 * 웹폰트·외부 리소스 없음 (오프라인) — 이미지도 file:// 로컬 참조.
 *
 * 사일런트 인쇄는 PDF를 확대 없이 용지 왼쪽 위부터 얹는다 (DP-DS620 실기 확인).
 * 세로 페이지를 그대로 보내면 가로 용지에서 아래가 잘리므로, 페이지를 용지와 같게 만들고
 * 세로 네컷을 90° 돌려 얹는다. 이 페이지가 다시 돌지 않도록 print.ts가 인쇄 방향을 고정한다.
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
    top: 50%;
    left: 50%;
    width: ${h}in;
    height: ${w}in;
    /* 비율이 어긋나도 여백이 생기지 않도록 채운다 (풀블리드) */
    object-fit: cover;
    transform: translate(-50%, -50%) rotate(90deg);
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
  const paths = pathsFor(req.sessionId)
  await mkdir(paths.outputDir, { recursive: true })

  const htmlPath = join(paths.outputDir, '_print_photo.html')
  await writeFile(htmlPath, photoPageHtml(pathToFileURL(req.imagePath).href), 'utf8')

  const outPath = join(paths.outputDir, 'photo_4x6.pdf')

  const pdf = await withOffscreenWindow({ width: 1200, height: 1800 }, async (win) => {
    await win.loadFile(htmlPath)
    await waitForRenderReady(win)

    return win.webContents.printToPDF({
      pageSize: { ...PRINT_PAGE_INCHES },
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      printBackground: true,
      preferCSSPageSize: true,
    })
  })

  await writeFile(outPath, pdf)
  return { path: outPath, bytes: pdf.length }
}
