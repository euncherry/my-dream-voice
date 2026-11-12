/**
 * src/shared/types.ts — IPC 계약 · 데이터 인터페이스
 *
 * 메인 · preload · 렌더러가 함께 쓰는 단일 정의.
 * SPIKE_PLAN.md §5 / §7-4 · PAGE_SPEC.md §4 기준.
 *
 * ⚠️ 이번 스파이크의 산출물 중 하나가 "확정된 데이터 인터페이스"다.
 *    분석(ONNX/whisper) 모듈은 나중에 이 인터페이스를 그대로 채운다.
 */

// ────────────────────────────────────────────────────────────
// 1. 직업 (SPEC.md §5 — 대표 직업 8종 확정)
// ────────────────────────────────────────────────────────────

export type JobId =
  | 'athlete' // 운동선수
  | 'doctor' // 의사
  | 'chef' // 요리사
  | 'singer' // 가수/아이돌
  | 'police' // 경찰관
  | 'creator' // 콘텐츠크리에이터
  | 'astronaut' // 우주비행사
  | 'roboticist' // 로봇개발자

export type JobCategory = 'traditional' | 'future'

export interface JobDef {
  id: JobId
  /** 화면·리포트 표기명 */
  label: string
  category: JobCategory
  /** 아트 미제작 → 프레임/카드 placeholder 색 (PAGE_SPEC §5-5) */
  placeholderColor: string
}

// ────────────────────────────────────────────────────────────
// 2. 연령 (SPEC.md §3-2 — 판정 기준이 아니라 "무엇을 살펴볼지" 필터)
// ────────────────────────────────────────────────────────────

/** 관찰 문장 난이도 · 안내 톤을 정하는 구간 */
export type AgeGroup = '4-5' | '6-7' | '8+'

/** 관찰 목표음 — 우리말에서 늦게 습득되는 소리 (SPEC §3-2) */
export type TargetSound = 'ㅅ' | 'ㅆ' | 'ㄹ'

// ────────────────────────────────────────────────────────────
// 3. 관찰 결과 (SPEC.md §3-1 — 「판정」이 아닌 「관찰」)
// ────────────────────────────────────────────────────────────

/**
 * 결과 표현은 2단계뿐. 3단계(정상/주의/지연 의심) 금지 — CLAUDE.md 금지사항 8.
 * 문장의 주어는 아동이 아니라 AI의 인식이다. ("~하게 인식되었습니다")
 */
export type PhonemeResult = 'recognized' | 'different'

export interface PhonemeObservation {
  sound: TargetSound
  result: PhonemeResult
}

export interface ObservationResult {
  /** 참고형 안내 구조임을 응답 스스로 명시한다 (검수표 4) */
  type: 'reference'
  /** 진단이 아니다 — 항상 false. 이 값이 true가 되는 코드는 존재하면 안 된다 */
  diagnostic: false
  /** 관찰 대상 음소별 결과 — SPEC §3-2 */
  phonemes: PhonemeObservation[]
  /** 하나라도 different면 리포트에 '가능한 이유 + 연습 문장' 섹션 추가 */
  hasDifferent: boolean
}

/** 음도 요약 — 수치·그래프가 아니라 범주형만 낸다 (CLAUDE.md 금지사항 9) */
export type PitchSummary = 'stable' | 'varied' | 'unknown'

/**
 * 발화 1건의 음향 특성 — **녹음 품질·기술 지표**이지 아동 평가가 아니다.
 * 보호자 리포트(SessionResult)에는 넣지 않는다. 용도: 무음·클리핑 판정(재시도), 향후 T-1 중립 매칭.
 */
export interface SpeechFeature {
  /** 0-based 발화 순번 */
  index: number
  /** 전체 RMS 진폭 (0~1) */
  amplitudeRms: number
  /** 피크 진폭 (0~1) — 0.99 이상이면 클리핑 */
  peak: number
  /** 무음으로 판단된 20ms 프레임 비율 (0~1) */
  silenceRatio: number
  pitchSummary: PitchSummary
  /** 분석에 쓸 만한 녹음인가 — 무음·클리핑이면 false (재시도 대상) */
  usable: boolean
}

/**
 * ⚠️ 여기에 점수 · 백분율 · 또래 비교 · 아동의 실제 인식 결과("사건→다건")를
 *    담는 필드를 절대 추가하지 말 것 — CLAUDE.md 금지사항 9.
 */

// ────────────────────────────────────────────────────────────
// 4. 세션 (PAGE_SPEC.md §4 — 화면 간 공유 상태)
// ────────────────────────────────────────────────────────────

export type KioskMode = 'A' | 'B'

/** 세션 폴더 경로 묶음 — 메인이 만들고 렌더러가 참조만 한다 */
export interface SessionPaths {
  /** YYYYMMDD-HHmmss-xxxx */
  sessionId: string
  /** 세션 루트 폴더 (절대경로) */
  root: string
  audioDir: string
  photoDir: string
  outputDir: string
}

export interface Session {
  /** P-00에서 발급 — 메인의 세션 폴더와 1:1 */
  sessionId?: string
  paths?: SessionPaths

  mode?: KioskMode

  /** P-02 · 4개 · 선택 순서 = 발화·촬영 순서 (SPEC §2) */
  jobs: JobId[]

  // ── B모드 전용 ──
  childName?: string // P-03
  age?: number // P-03
  ageGroup?: AgeGroup // P-03 (age에서 파생)
  consentAt?: string // P-04 (ISO8601)
  recordings?: string[] // P-05 · WAV 경로 4개
  lines?: string[] // P-05 · 실제 발화한 대사 4개

  // ── 공통 ──
  photos?: string[] // P-06 · 원본 4컷
  composedPhoto?: string // P-06 · 4×6 합성본 (1200×1800 @300dpi)

  // ── 분석 결과 (P-07 — 스파이크에서는 mock) ──
  observation?: ObservationResult
  recommendedJob?: JobId
  positiveMessage?: string

  // ── 산출물 ──
  reportPdf?: string // P-09 이전 생성
  photoPdf?: string // 인쇄용 4×6 PDF (풀블리드)
  downloadUrl?: string // P-10
}

/**
 * 리포트 렌더에 필요한 값만 추린 스냅샷.
 * 리포트 템플릿은 이 객체 하나만 받아 렌더한다 (템플릿 1개 · 하드코딩 없음 — SPIKE_PLAN ④)
 */
export interface SessionResult {
  childName: string
  ageGroup: AgeGroup
  /** 표기용 실제 나이 (만 N세) */
  age: number
  /** YYYY-MM-DD */
  date: string
  /** "한국잡월드" */
  place: string
  /** 아동이 선택한 4종 (순서 = 발화·촬영 순서) */
  jobs: JobId[]
  /** 실제 발화한 대사 4개 (jobs와 같은 순서) */
  lines: string[]
  observation: ObservationResult
  recommendedJob: JobId
  /** 아동용 한 줄 긍정 문구 — 리포트가 아니라 P-08 화면용 */
  positiveMessage: string
}

// ────────────────────────────────────────────────────────────
// 5. 분석 인터페이스 (이번 스파이크는 mock · 이후 이 자리를 실제 모듈이 채운다)
// ────────────────────────────────────────────────────────────

/** MOCK 전용 — 두 리포트 레이아웃을 모두 확인하기 위한 시나리오 토글 (SPIKE_PLAN §5) */
export type AnalysisScenario = 'random' | 'all-recognized' | 'some-different'

export interface AnalysisInput {
  sessionId: string
  ageGroup: AgeGroup
  jobs: JobId[]
  lines: string[]
  /** P-05에서 저장된 WAV 절대경로 4개 */
  recordings: string[]
  /** ⚠️ MOCK 전용. 실제 분석 모듈은 이 필드를 무시한다. */
  scenario?: AnalysisScenario
}

export interface AnalysisOutput {
  /** 발화별 음향 특성 — 실측값. 리포트로 넘기지 않는다 */
  speechFeatures: SpeechFeature[]
  observation: ObservationResult
  recommendedJob: JobId
  positiveMessage: string
  /** 소요 시간(ms) — P-07 체감 관리 검증용 */
  elapsedMs: number
}

// ────────────────────────────────────────────────────────────
// 6. 하드웨어 · 환경 (D-01)
// ────────────────────────────────────────────────────────────

export interface EnvInfo {
  electron: string
  chrome: string
  node: string
  platform: string
  arch: string
  /** 세션 폴더들이 놓이는 루트 */
  dataRoot: string
}

/** 프린터 연결 방식 — Windows 포트명으로 판별한다 */
export type PrinterConnection = 'usb' | 'network' | 'virtual' | 'other'

export interface PrinterInfo {
  name: string
  displayName: string
  description: string
  isDefault: boolean
  /** Windows 포트명 (USB001 · WSD-… · PORTPROMPT: 등) */
  port?: string
  /** USB = 실물 직결 (DNP는 여기), network = 네트워크, virtual = PDF·XPS·팩스 등 */
  connection: PrinterConnection
  /** Windows가 오프라인으로 표시 중인가 */
  offline: boolean
}

export interface PrinterPaper {
  name: string
  widthIn: number
  heightIn: number
}

/** D-01 인쇄 점검 — 드라이버 용지 설정 */
export interface PrinterPaperInfo {
  printerName: string
  defaultPaper: PrinterPaper
  printableWidthIn: number
  printableHeightIn: number
  marginXIn: number
  marginYIn: number
  papers: PrinterPaper[]
}

// ────────────────────────────────────────────────────────────
// 7. 파일 저장 (③ 녹음 · ② 촬영)
// ────────────────────────────────────────────────────────────

/**
 * 렌더러는 getUserMedia로 PCM만 뽑아 넘긴다.
 * 리샘플링(→16kHz) · WAV 헤더 작성 · 디스크 IO는 전부 메인 (CLAUDE.md 금지사항 2)
 */
export interface SaveWavRequest {
  sessionId: string
  /** 0-based 발화 순번 (0~3) */
  index: number
  jobId: JobId
  /** Float32 모노 PCM의 raw ArrayBuffer */
  pcm: ArrayBuffer
  /** 렌더러 AudioContext의 실제 샘플레이트 (예: 48000) */
  sampleRate: number
  /** 녹음 시 DSP 상태 기록 — D-01 on/off 비교용. 본 플로우에서는 항상 전부 false */
  dsp: DspFlags
}

/** ⚠️ 본 플로우에서는 반드시 전부 false — CLAUDE.md 금지사항 5 */
export interface DspFlags {
  noiseSuppression: boolean
  echoCancellation: boolean
  autoGainControl: boolean
}

export interface SavedFile {
  path: string
  bytes: number
  /** WAV 저장 시에만 — 저장한 PCM으로 바로 측정한 음향 특성 */
  quality?: SpeechFeature
}

export interface SavePhotoRequest {
  sessionId: string
  /** 0-based 컷 번호 (0~3). composed=true면 무시 */
  index: number
  /** data:image/png;base64,... */
  dataUrl: string
  /** true면 4×6 합성본(fourcut.png)으로 저장 */
  composed?: boolean
}

// ────────────────────────────────────────────────────────────
// 7-1. 카메라 사이드카 (CameraHost.exe — R100은 UVC가 아니라 EDSDK로 제어)
// ────────────────────────────────────────────────────────────

/** fake = 실물 없는 검증용. 화면에 반드시 표시한다 (실제 촬영 오인 방지) */
export type CameraBackend = 'fake' | 'edsdk'

export interface CameraInfo {
  model: string
  photoWidth: number
  photoHeight: number
  liveViewWidth: number
  liveViewHeight: number
}

export interface CameraStatus {
  /** unavailable = 사이드카를 띄울 수 없음 (exe 없음·기동 실패) */
  state: 'unavailable' | 'disconnected' | 'connected' | 'liveview'
  backend?: CameraBackend
  info?: CameraInfo
  /** unavailable일 때 개발자용 사유 */
  reason?: string
}

export interface CameraLiveView {
  /** http://127.0.0.1:<port>/live/<token> — <img src>로 받는 MJPEG 스트림 */
  url: string
}

export interface CameraCaptureRequest {
  sessionId: string
  /** 0-based 컷 번호 (0~3). 저장 경로는 메인이 정한다 */
  index: number
}

export interface CameraCaptureResult extends SavedFile {
  width: number
  height: number
}

/** D-01 실카메라 자가진단 — 항목별 판정 */
export type SelfTestVerdict = 'pass' | 'warn' | 'fail'

export interface SelfTestItem {
  name: string
  verdict: SelfTestVerdict
  detail: string
}

export interface CameraSelfTestReport {
  /** 항목 중 가장 나쁜 판정 */
  verdict: SelfTestVerdict
  items: SelfTestItem[]
  /** 결과 폴더 (바탕화면) — 사진·결과.txt·camera.log */
  dir: string
}

/** 메인 → 렌더러 푸시 */
export interface CameraEvent {
  /** disconnected = USB 분리 등 / host-exit = 사이드카가 예기치 않게 종료 */
  type: 'disconnected' | 'host-exit'
  message: string
}

// ────────────────────────────────────────────────────────────
// 8. PDF · 인쇄 · 업로드
// ────────────────────────────────────────────────────────────

export interface RenderReportPdfRequest {
  sessionId: string
  result: SessionResult
}

/** 네컷 이미지를 4×6인치 풀블리드 PDF로 감싼다 (인쇄 규격 고정 — SPIKE_PLAN ⑤) */
export interface RenderPhotoPdfRequest {
  sessionId: string
  /** 합성된 네컷 PNG 절대경로 */
  imagePath: string
}

export interface PrintRequest {
  /** 인쇄할 PDF 절대경로 */
  pdfPath: string
  /** 미지정 시 OS 기본 프린터 */
  printerName?: string
}

export interface PrintResult {
  ok: boolean
  printerName?: string
  /** 실패 시 사용자 노출용이 아닌 개발자용 메시지 (M-02는 별도 문구) */
  error?: string
}

export type UploadKind = 'report-pdf' | 'fourcut-image'

export interface UploadRequest {
  kind: UploadKind
  /** 업로드할 최종 산출물 경로. ⚠️ 원본 WAV·개별 사진 금지 — CLAUDE.md 금지사항 4 */
  filePath: string
}

export interface UploadResult {
  ok: boolean
  /** QR로 렌더할 다운로드 URL */
  downloadUrl?: string
  /** 만료 시각 (ISO8601) — 업로드 후 24시간 */
  expiresAt?: string
  /** 'timeout' | 'offline' | 'server' | 'config' */
  reason?: 'timeout' | 'offline' | 'server' | 'config'
  error?: string
}

// ────────────────────────────────────────────────────────────
// 9. IPC 채널
// ────────────────────────────────────────────────────────────

export const IPC = {
  SYSTEM_ENV_INFO: 'system:envInfo',
  SYSTEM_LIST_PRINTERS: 'system:listPrinters',
  SYSTEM_PRINTER_PAPER: 'system:printerPaper',
  SYSTEM_SET_FULLSCREEN: 'system:setFullscreen',
  /** D-01 — 채집한 WAV를 탐색기에서 열어보기 위한 개발 편의 기능 */
  SYSTEM_REVEAL_PATH: 'system:revealPath',

  SESSION_BEGIN: 'session:begin',
  /** P-11 — 로컬 WAV·사진·PDF 삭제 (PAGE_SPEC P-11) */
  SESSION_PURGE: 'session:purge',

  RECORDING_SAVE_WAV: 'recording:saveWav',
  /** D-01 — 저장된 WAV를 되읽어 청음 확인 (SPIKE_PLAN ① 4번) */
  RECORDING_READ_WAV: 'recording:readWav',

  PHOTO_SAVE: 'photo:save',
  /** 촬영 원본을 되읽어 네컷으로 합성한다 */
  PHOTO_READ: 'photo:read',
  PHOTO_RENDER_PDF: 'photo:renderPdf',

  CAMERA_STATUS: 'camera:status',
  CAMERA_CONNECT: 'camera:connect',
  CAMERA_LIVE_START: 'camera:liveStart',
  CAMERA_LIVE_STOP: 'camera:liveStop',
  CAMERA_CAPTURE: 'camera:capture',
  /** D-01 — 가짜 카메라의 USB 분리 흉내 (오류 경로 확인용) */
  CAMERA_SIMULATE_DISCONNECT: 'camera:simulateDisconnect',
  /** D-01 — 실카메라 자가진단 (연결·라이브뷰·4컷·로그를 바탕화면 폴더로) */
  CAMERA_SELF_TEST: 'camera:selfTest',
  /** D-01 — 자가진단 결과 폴더 / 카메라 로그 폴더 열기 */
  CAMERA_OPEN_FOLDER: 'camera:openFolder',
  /** 메인 → 렌더러 푸시 (handle이 아니라 send) */
  CAMERA_EVENT: 'camera:event',

  ANALYSIS_RUN: 'analysis:run',

  REPORT_RENDER_PDF: 'report:renderPdf',

  PRINT_SILENT: 'print:silent',

  UPLOAD_ARTIFACT: 'upload:artifact',
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]

/** preload가 contextBridge로 노출하는 표면 — window.api */
export interface KioskApi {
  system: {
    envInfo(): Promise<EnvInfo>
    listPrinters(): Promise<PrinterInfo[]>
    /** D-01 — 드라이버 기본 용지·용지 목록 조회 */
    printerPaper(printerName: string): Promise<PrinterPaperInfo>
    setFullscreen(on: boolean): Promise<void>
    /** 탐색기에서 해당 파일/폴더를 연다 (개발 편의) */
    revealPath(path: string): Promise<void>
  }
  session: {
    /** prefix를 주면 sessionId 앞에 붙는다. D-01은 'dev'를 써서 플로우 세션과 구분한다. */
    begin(prefix?: string): Promise<SessionPaths>
    /** 세션 폴더 전체 삭제 */
    purge(sessionId: string): Promise<void>
  }
  recording: {
    saveWav(req: SaveWavRequest): Promise<SavedFile>
    /** 저장된 WAV 원본 바이트 (decodeAudioData로 재생) */
    readWav(path: string): Promise<ArrayBuffer>
  }
  photo: {
    save(req: SavePhotoRequest): Promise<SavedFile>
    /** 세션 폴더 안의 사진 원본 바이트 */
    read(path: string): Promise<ArrayBuffer>
    renderPdf(req: RenderPhotoPdfRequest): Promise<SavedFile>
  }
  camera: {
    status(): Promise<CameraStatus>
    connect(): Promise<CameraStatus>
    /** 연결이 안 되어 있으면 먼저 연결한다 */
    startLiveView(): Promise<CameraLiveView>
    stopLiveView(): Promise<void>
    capture(req: CameraCaptureRequest): Promise<CameraCaptureResult>
    simulateDisconnect(): Promise<void>
    /** 실카메라 자가진단 — 셔터가 4번 눌린다 */
    selfTest(): Promise<CameraSelfTestReport>
    openFolder(which: 'test' | 'logs'): Promise<void>
    /** 해제 함수를 돌려준다 */
    onEvent(listener: (event: CameraEvent) => void): () => void
  }
  analysis: {
    /** ⚠️ MOCK: src/main/mock/analysis.ts — 실제 분석 모듈로 교체 예정 */
    run(req: AnalysisInput): Promise<AnalysisOutput>
  }
  report: {
    renderPdf(req: RenderReportPdfRequest): Promise<SavedFile>
  }
  print: {
    silent(req: PrintRequest): Promise<PrintResult>
  }
  upload: {
    artifact(req: UploadRequest): Promise<UploadResult>
  }
}
