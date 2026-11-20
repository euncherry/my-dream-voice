/**
 * src/preload/index.ts — contextBridge (window.api)
 *
 * contextIsolation을 켠 채로 렌더러에 노출하는 유일한 표면.
 * 여기에 없는 기능은 렌더러가 할 수 없다 = IPC 계약이 곧 이 파일.
 */

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import {
  IPC,
  type AnalysisInput,
  type AnalysisOutput,
  type CameraCaptureRequest,
  type CameraCaptureResult,
  type CameraEvent,
  type CameraLiveView,
  type CameraSelfTestReport,
  type CameraStatus,
  type EnvInfo,
  type KioskApi,
  type LinkStatusResult,
  type MockServerState,
  type OpenSessionResult,
  type PrintRequest,
  type PrinterInfo,
  type PrinterPaperInfo,
  type PrintResult,
  type RenderPhotoPdfRequest,
  type SavePhotoRequest,
  type SaveVideoRequest,
  type SaveWavRequest,
  type SavedFile,
  type SendReportRequest,
  type SendReportResult,
  type ServerResult,
  type SessionPaths,
  type SttRequest,
  type SttResult,
  type SubmitEmailRequest,
} from '../shared/types'

const api: KioskApi = {
  system: {
    envInfo: (): Promise<EnvInfo> => ipcRenderer.invoke(IPC.SYSTEM_ENV_INFO),
    listPrinters: (): Promise<PrinterInfo[]> => ipcRenderer.invoke(IPC.SYSTEM_LIST_PRINTERS),
    printerPaper: (printerName: string): Promise<PrinterPaperInfo> =>
      ipcRenderer.invoke(IPC.SYSTEM_PRINTER_PAPER, printerName),
    setFullscreen: (on: boolean): Promise<void> =>
      ipcRenderer.invoke(IPC.SYSTEM_SET_FULLSCREEN, on),
    revealPath: (path: string): Promise<void> =>
      ipcRenderer.invoke(IPC.SYSTEM_REVEAL_PATH, path),
  },
  session: {
    begin: (prefix?: string): Promise<SessionPaths> =>
      ipcRenderer.invoke(IPC.SESSION_BEGIN, prefix),
    purge: (sessionId: string): Promise<void> => ipcRenderer.invoke(IPC.SESSION_PURGE, sessionId),
  },
  recording: {
    saveWav: (req: SaveWavRequest): Promise<SavedFile> =>
      ipcRenderer.invoke(IPC.RECORDING_SAVE_WAV, req),
    readWav: (path: string): Promise<ArrayBuffer> =>
      ipcRenderer.invoke(IPC.RECORDING_READ_WAV, path),
    deleteWav: (path: string): Promise<void> =>
      ipcRenderer.invoke(IPC.RECORDING_DELETE_WAV, path),
  },
  stt: {
    // ⚠️ MOCK: src/main/mock/stt.ts — 파이썬 받아쓰기 프로그램으로 교체 예정
    transcribe: (req: SttRequest): Promise<SttResult> =>
      ipcRenderer.invoke(IPC.STT_TRANSCRIBE, req),
  },
  photo: {
    save: (req: SavePhotoRequest): Promise<SavedFile> => ipcRenderer.invoke(IPC.PHOTO_SAVE, req),
    read: (path: string): Promise<ArrayBuffer> => ipcRenderer.invoke(IPC.PHOTO_READ, path),
    renderPdf: (req: RenderPhotoPdfRequest): Promise<SavedFile> =>
      ipcRenderer.invoke(IPC.PHOTO_RENDER_PDF, req),
  },
  video: {
    save: (req: SaveVideoRequest): Promise<SavedFile> => ipcRenderer.invoke(IPC.VIDEO_SAVE, req),
    read: (path: string): Promise<ArrayBuffer> => ipcRenderer.invoke(IPC.VIDEO_READ, path),
  },
  camera: {
    status: (): Promise<CameraStatus> => ipcRenderer.invoke(IPC.CAMERA_STATUS),
    connect: (): Promise<CameraStatus> => ipcRenderer.invoke(IPC.CAMERA_CONNECT),
    startLiveView: (): Promise<CameraLiveView> => ipcRenderer.invoke(IPC.CAMERA_LIVE_START),
    stopLiveView: (): Promise<void> => ipcRenderer.invoke(IPC.CAMERA_LIVE_STOP),
    capture: (req: CameraCaptureRequest): Promise<CameraCaptureResult> =>
      ipcRenderer.invoke(IPC.CAMERA_CAPTURE, req),
    simulateDisconnect: (): Promise<void> => ipcRenderer.invoke(IPC.CAMERA_SIMULATE_DISCONNECT),
    selfTest: (): Promise<CameraSelfTestReport> => ipcRenderer.invoke(IPC.CAMERA_SELF_TEST),
    openFolder: (which: 'test' | 'logs'): Promise<void> =>
      ipcRenderer.invoke(IPC.CAMERA_OPEN_FOLDER, which),
    onEvent: (listener: (event: CameraEvent) => void): (() => void) => {
      const handler = (_e: IpcRendererEvent, event: CameraEvent): void => listener(event)
      ipcRenderer.on(IPC.CAMERA_EVENT, handler)
      return () => ipcRenderer.removeListener(IPC.CAMERA_EVENT, handler)
    },
  },
  analysis: {
    // ⚠️ MOCK: src/main/mock/analysis.ts — 파이썬 분석 프로그램으로 교체 예정
    run: (req: AnalysisInput): Promise<AnalysisOutput> => ipcRenderer.invoke(IPC.ANALYSIS_RUN, req),
  },
  print: {
    silent: (req: PrintRequest): Promise<PrintResult> => ipcRenderer.invoke(IPC.PRINT_SILENT, req),
  },
  // ⚠️ 지금은 mock 응답 (API 합의 전 — SPEC T-14)
  server: {
    openSession: (): Promise<OpenSessionResult> => ipcRenderer.invoke(IPC.SERVER_OPEN_SESSION),
    linkStatus: (sessionToken: string): Promise<LinkStatusResult> =>
      ipcRenderer.invoke(IPC.SERVER_LINK_STATUS, sessionToken),
    submitEmail: (req: SubmitEmailRequest): Promise<ServerResult> =>
      ipcRenderer.invoke(IPC.SERVER_SUBMIT_EMAIL, req),
    sendReport: (req: SendReportRequest): Promise<SendReportResult> =>
      ipcRenderer.invoke(IPC.SERVER_SEND_REPORT, req),
    closeSession: (sessionToken: string): Promise<void> =>
      ipcRenderer.invoke(IPC.SERVER_CLOSE_SESSION, sessionToken),
    mockGet: (): Promise<MockServerState> => ipcRenderer.invoke(IPC.SERVER_MOCK_GET),
    mockSet: (state: Partial<MockServerState>): Promise<MockServerState> =>
      ipcRenderer.invoke(IPC.SERVER_MOCK_SET, state),
    mockKakaoLogin: (sessionToken: string): Promise<void> =>
      ipcRenderer.invoke(IPC.SERVER_MOCK_KAKAO_LOGIN, sessionToken),
  },
}

contextBridge.exposeInMainWorld('api', api)
