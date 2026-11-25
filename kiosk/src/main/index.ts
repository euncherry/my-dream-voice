/**
 * src/main/index.ts — 창 생성 · 앱 수명주기
 *
 * CLAUDE.md 금지사항 2: 무거운 연산(받아쓰기·분석·PDF·인쇄·파일 IO)은 전부 이 프로세스.
 * 렌더러는 IPC로 요청만 한다.
 */

import { app, BrowserWindow, session, shell } from 'electron'
import { join } from 'node:path'
import { registerIpcHandlers } from './ipc'
import { ensureDataRoot, purgeLeftoverSessions } from './storage'

const isDev = !app.isPackaged

/** 렌더러 엔트리 URL/경로 해석 (dev = Vite devServer / prod = out/renderer) */
function rendererEntry(): { url?: string; file?: string } {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (isDev && devUrl) return { url: `${devUrl}/index.html` }
  return { file: join(__dirname, '../renderer/index.html') }
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

  const entry = rendererEntry()
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

/**
 * 카메라 라이브뷰(사이드카의 loopback MJPEG)를 렌더러가 캔버스로 읽을 수 있게 한다.
 *
 * P-06은 촬영 장면을 녹화한다 (라이브뷰 <img> → 캔버스 → MediaRecorder). 라이브뷰는
 * http://127.0.0.1:<포트>/live/<토큰> 이라 앱 화면과 출처가 달라, 그대로 그리면 캔버스가
 * 잠겨 녹화할 수 없다. 사이드카를 고치지 않고, 이 주소의 응답에만 허용 헤더를 붙인다.
 */
function allowLiveViewCapture(): void {
  session.defaultSession.webRequest.onHeadersReceived(
    { urls: ['http://127.0.0.1/*'] },
    (details, callback) => {
      let isLiveView = false
      try {
        isLiveView = new URL(details.url).pathname.startsWith('/live/')
      } catch {
        /* 주소를 읽지 못하면 건드리지 않는다 */
      }
      if (!isLiveView) {
        callback({})
        return
      }
      callback({
        responseHeaders: { ...details.responseHeaders, 'Access-Control-Allow-Origin': ['*'] },
      })
    },
  )
}

// 키오스크 앱은 하나만 뜬다 — 두 번째 실행은 바로 끝내고 먼저 뜬 창을 앞으로 가져온다.
// (시작할 때 남은 세션 폴더를 치우므로, 둘이 뜨면 먼저 뜬 쪽의 진행 중인 세션이 지워진다)
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  void app.whenReady().then(async () => {
    app.setAppUserModelId('kr.mdv.kiosk')

    allowMediaPermissions()
    allowLiveViewCapture()
    await ensureDataRoot()
    // 지난번에 끝까지 못 간 세션의 녹음 · 사진 · 영상이 남아 있으면 지운다 (설치판만 — storage.ts)
    await purgeLeftoverSessions()
    registerIpcHandlers()

    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}
