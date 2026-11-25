/**
 * src/main/ipc.ts — IPC 핸들러 등록
 *
 * 렌더러는 window.api(preload)로만 여기에 접근한다.
 * 채널 이름과 요청/응답 타입은 src/shared/types.ts가 단일 정의.
 */

import { app, ipcMain, shell } from 'electron'
import {
  cameraCapture,
  cameraConnect,
  cameraSimulateDisconnect,
  cameraStartLiveView,
  cameraStatus,
  cameraStopLiveView,
  shutdownCamera,
} from './camera'
import { openCameraFolder, runCameraSelfTest } from './cameraSelfTest'
import { getMainWindow } from './index'
import { runAnalysis } from './mock/analysis'
import { mockServerGet, mockServerSet } from './mock/server'
import { transcribe } from './mock/stt'
import { renderPhotoPdf } from './pdf'
import { listPrinters, printSilent, readPrinterPaper } from './print'
import { closeSession, openSession, sendReport } from './server'
import {
  beginSession,
  deleteWav,
  getDataRoot,
  insideDataRoot,
  purgeSession,
  readPhoto,
  readVideo,
  readWav,
  savePhoto,
  saveVideo,
  saveWav,
} from './storage'
import {
  IPC,
  type AnalysisInput,
  type CameraCaptureRequest,
  type EnvInfo,
  type MockServerState,
  type OpenSessionRequest,
  type PrintMode,
  type PrintRequest,
  type RenderPhotoPdfRequest,
  type SavePhotoRequest,
  type SaveVideoRequest,
  type SaveWavRequest,
  type SendReportRequest,
  type SttRequest,
} from '../shared/types'

/**
 * P-07 인쇄 기본값 — 카메라와 같은 규칙이다.
 * 설치판은 실제 인쇄, 개발 실행(npm run dev)은 가짜 인쇄(종이를 쓰지 않는다). MDV_PRINT=real|fake 로 덮어쓴다.
 */
function defaultPrintMode(): PrintMode {
  const forced = process.env['MDV_PRINT']
  if (forced === 'real' || forced === 'fake') return forced
  return app.isPackaged ? 'real' : 'fake'
}

function envInfo(): EnvInfo {
  return {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    dataRoot: getDataRoot(),
    packaged: app.isPackaged,
    printMode: defaultPrintMode(),
  }
}

export function registerIpcHandlers(): void {
  // ── 시스템 / 환경 ──
  ipcMain.handle(IPC.SYSTEM_ENV_INFO, () => envInfo())
  ipcMain.handle(IPC.SYSTEM_LIST_PRINTERS, () => listPrinters())
  ipcMain.handle(IPC.SYSTEM_PRINTER_PAPER, (_e, printerName: string) =>
    readPrinterPaper(printerName),
  )
  ipcMain.handle(IPC.SYSTEM_SET_FULLSCREEN, (_e, on: boolean) => {
    getMainWindow()?.setFullScreen(on)
  })
  ipcMain.handle(IPC.SYSTEM_REVEAL_PATH, (_e, path: string) => {
    shell.showItemInFolder(insideDataRoot(path, 'revealPath'))
  })

  // ── 세션 폴더 ──
  ipcMain.handle(IPC.SESSION_BEGIN, (_e, prefix?: string) => beginSession(prefix))
  ipcMain.handle(IPC.SESSION_PURGE, (_e, sessionId: string) => purgeSession(sessionId))

  // ── 녹음 (리샘플·WAV 작성은 메인에서 — CLAUDE.md 금지사항 2) ──
  ipcMain.handle(IPC.RECORDING_SAVE_WAV, (_e, req: SaveWavRequest) => saveWav(req))
  ipcMain.handle(IPC.RECORDING_READ_WAV, (_e, path: string) => readWav(path))
  ipcMain.handle(IPC.RECORDING_DELETE_WAV, (_e, path: string) => deleteWav(path))

  // ── 받아쓰기 (⚠️ MOCK — src/main/mock/stt.ts) ──
  ipcMain.handle(IPC.STT_TRANSCRIBE, (_e, req: SttRequest) => transcribe(req))

  // ── 촬영 · 네컷 ──
  ipcMain.handle(IPC.PHOTO_SAVE, (_e, req: SavePhotoRequest) => savePhoto(req))
  ipcMain.handle(IPC.PHOTO_READ, (_e, path: string) => readPhoto(path))
  ipcMain.handle(IPC.PHOTO_RENDER_PDF, (_e, req: RenderPhotoPdfRequest) => renderPhotoPdf(req))

  // ── 촬영 장면 영상 (기기 안에만) ──
  ipcMain.handle(IPC.VIDEO_SAVE, (_e, req: SaveVideoRequest) => saveVideo(req))
  ipcMain.handle(IPC.VIDEO_READ, (_e, path: string) => readVideo(path))

  // ── 카메라 사이드카 ──
  ipcMain.handle(IPC.CAMERA_STATUS, () => cameraStatus())
  ipcMain.handle(IPC.CAMERA_CONNECT, () => cameraConnect())
  ipcMain.handle(IPC.CAMERA_LIVE_START, () => cameraStartLiveView())
  ipcMain.handle(IPC.CAMERA_LIVE_STOP, () => cameraStopLiveView())
  ipcMain.handle(IPC.CAMERA_CAPTURE, (_e, req: CameraCaptureRequest) => cameraCapture(req))
  ipcMain.handle(IPC.CAMERA_SIMULATE_DISCONNECT, () => cameraSimulateDisconnect())
  ipcMain.handle(IPC.CAMERA_SELF_TEST, () => runCameraSelfTest())
  ipcMain.handle(IPC.CAMERA_OPEN_FOLDER, (_e, which: 'test' | 'logs') => openCameraFolder(which))

  // ── 정밀 분석 (⚠️ MOCK — src/main/mock/analysis.ts) ──
  ipcMain.handle(IPC.ANALYSIS_RUN, (_e, req: AnalysisInput) => runAnalysis(req))

  // ── 인쇄 ──
  ipcMain.handle(IPC.PRINT_SILENT, (_e, req: PrintRequest) => {
    // 인쇄하는 것은 세션 폴더 안에서 만든 PDF뿐이다 (네컷 · D-01 점검표)
    const pdfPath = insideDataRoot(req.pdfPath, 'print')
    if (!pdfPath.toLowerCase().endsWith('.pdf')) throw new Error('print: PDF만 인쇄할 수 있습니다')
    return printSilent({ ...req, pdfPath })
  })

  // ── 백엔드 서버 (⚠️ 지금은 mock 응답 — src/main/server.ts) ──
  ipcMain.handle(IPC.SERVER_OPEN_SESSION, (_e, req: OpenSessionRequest) => openSession(req))
  ipcMain.handle(IPC.SERVER_SEND_REPORT, (_e, req: SendReportRequest) => sendReport(req))
  ipcMain.handle(IPC.SERVER_CLOSE_SESSION, (_e, sessionToken: string) => closeSession(sessionToken))
  ipcMain.handle(IPC.SERVER_MOCK_GET, () => mockServerGet())
  ipcMain.handle(IPC.SERVER_MOCK_SET, (_e, state: Partial<MockServerState>) =>
    mockServerSet(state),
  )
}

export function unregisterIpcHandlers(): void {
  Object.values(IPC).forEach((channel) => ipcMain.removeHandler(channel))
}

app.on('will-quit', () => {
  shutdownCamera()
  unregisterIpcHandlers()
})
