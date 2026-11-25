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
import { renderPhotoPdf, renderReportPdf } from './pdf'
import { listPrinters, printSilent, readPrinterPaper } from './print'
import {
  beginSession,
  getDataRoot,
  purgeSession,
  readPhoto,
  readWav,
  savePhoto,
  saveWav,
} from './storage'
import { uploadArtifact } from './upload'
import {
  IPC,
  type AnalysisInput,
  type CameraCaptureRequest,
  type EnvInfo,
  type PrintRequest,
  type RenderPhotoPdfRequest,
  type RenderReportPdfRequest,
  type SavePhotoRequest,
  type SaveWavRequest,
  type UploadRequest,
} from '../shared/types'

function envInfo(): EnvInfo {
  return {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    dataRoot: getDataRoot(),
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
    if (!path.startsWith(getDataRoot())) throw new Error('세션 폴더 밖은 열 수 없습니다')
    shell.showItemInFolder(path)
  })

  // ── 세션 폴더 ──
  ipcMain.handle(IPC.SESSION_BEGIN, (_e, prefix?: string) => beginSession(prefix))
  ipcMain.handle(IPC.SESSION_PURGE, (_e, sessionId: string) => purgeSession(sessionId))

  // ── ③ 녹음 (리샘플·WAV 작성은 메인에서 — CLAUDE.md 금지사항 2) ──
  ipcMain.handle(IPC.RECORDING_SAVE_WAV, (_e, req: SaveWavRequest) => saveWav(req))
  ipcMain.handle(IPC.RECORDING_READ_WAV, (_e, path: string) => readWav(path))

  // ── ② 촬영 ──
  ipcMain.handle(IPC.PHOTO_SAVE, (_e, req: SavePhotoRequest) => savePhoto(req))
  ipcMain.handle(IPC.PHOTO_READ, (_e, path: string) => readPhoto(path))
  ipcMain.handle(IPC.PHOTO_RENDER_PDF, (_e, req: RenderPhotoPdfRequest) => renderPhotoPdf(req))

  // ── ② 카메라 사이드카 ──
  ipcMain.handle(IPC.CAMERA_STATUS, () => cameraStatus())
  ipcMain.handle(IPC.CAMERA_CONNECT, () => cameraConnect())
  ipcMain.handle(IPC.CAMERA_LIVE_START, () => cameraStartLiveView())
  ipcMain.handle(IPC.CAMERA_LIVE_STOP, () => cameraStopLiveView())
  ipcMain.handle(IPC.CAMERA_CAPTURE, (_e, req: CameraCaptureRequest) => cameraCapture(req))
  ipcMain.handle(IPC.CAMERA_SIMULATE_DISCONNECT, () => cameraSimulateDisconnect())
  ipcMain.handle(IPC.CAMERA_SELF_TEST, () => runCameraSelfTest())
  ipcMain.handle(IPC.CAMERA_OPEN_FOLDER, (_e, which: 'test' | 'logs') => openCameraFolder(which))

  // ── 분석 (⚠️ MOCK — src/main/mock/analysis.ts) ──
  ipcMain.handle(IPC.ANALYSIS_RUN, (_e, req: AnalysisInput) => runAnalysis(req))

  // ── ④ 리포트 PDF ──
  ipcMain.handle(IPC.REPORT_RENDER_PDF, (_e, req: RenderReportPdfRequest) => renderReportPdf(req))

  // ── ⑤ 인쇄 ──
  ipcMain.handle(IPC.PRINT_SILENT, (_e, req: PrintRequest) => printSilent(req))

  // ── ⑥ 업로드 ──
  ipcMain.handle(IPC.UPLOAD_ARTIFACT, (_e, req: UploadRequest) => uploadArtifact(req))
}

export function unregisterIpcHandlers(): void {
  Object.values(IPC).forEach((channel) => ipcMain.removeHandler(channel))
}

app.on('will-quit', () => {
  shutdownCamera()
  unregisterIpcHandlers()
})
