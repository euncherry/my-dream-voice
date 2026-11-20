/**
 * src/main/index.ts — 창 생성 · 앱 수명주기
 *
 * CLAUDE.md 금지사항 2: 무거운 연산(ONNX·whisper·PDF·인쇄·파일 IO)은 전부 이 프로세스.
 * 렌더러는 IPC로 요청만 한다.
 */

import { app, BrowserWindow, session, shell } from 'electron'
import { join } from 'node:path'
import { registerIpcHandlers } from './ipc'
import { ensureDataRoot } from './storage'

const isDev = !app.isPackaged

/** 렌더러 엔트리 URL/경로 해석 (dev = Vite devServer / prod = out/renderer) */
export function rendererEntry(htmlFile: 'index.html' | 'report.html'): {
  url?: string
  file?: string
} {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (isDev && devUrl) return { url: `${devUrl}/${htmlFile}` }
  return { file: join(__dirname, `../renderer/${htmlFile}`) }
}

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#101216',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // 보안 기본값 유지 — 렌더러는 preload가 노출한 window.api로만 메인에 접근
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  // 키오스크는 devtools를 열어두기 어렵다 — 렌더러 로그를 메인 터미널로 끌어온다
  mainWindow.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`)
  })
  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error(`[renderer] 로드 실패 ${code} ${desc} — ${url}`)
  })

  // 외부 링크는 앱 안에서 열지 않는다 (키오스크 이탈 방지)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  const entry = rendererEntry('index.html')
  if (entry.url) void mainWindow.loadURL(entry.url)
  else void mainWindow.loadFile(entry.file!)
}

/**
 * 카메라·마이크 권한.
 * Electron은 기본적으로 media 권한 요청을 거부하므로 명시적으로 허용해야
 * 렌더러의 getUserMedia가 동작한다 (스파이크 ①).
 */
function allowMediaPermissions(): void {
  const ses = session.defaultSession
  ses.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media')
  })
  ses.setPermissionCheckHandler((_wc, permission) => permission === 'media')
}

void app.whenReady().then(async () => {
  app.setAppUserModelId('kr.mdv.kiosk')

  allowMediaPermissions()
  await ensureDataRoot()
  registerIpcHandlers()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}
