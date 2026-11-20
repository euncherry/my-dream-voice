/**
 * src/shared/types.ts — IPC 계약 · 데이터 인터페이스 (v2)
 *
 * 메인 · preload · 렌더러가 함께 쓰는 단일 정의.
 * 기준: PAGE_SPEC.md §5(세션 데이터 모델) · SPEC.md §6-2(서버로 보내는 데이터) · V2_PLAN.md §1
 *
 * 분석(파이썬 별도 프로그램 — faster-whisper 받아쓰기 · 정밀 분석)은 아직 mock이다.
 * 나중에 붙는 프로그램은 여기의 SttRequest/SttResult · AnalysisInput/AnalysisOutput을 그대로 채운다.
 */

// ────────────────────────────────────────────────────────────
// 1. 직업 (SPEC §5 — 6종 · 아이는 1개만 고른다)
// ────────────────────────────────────────────────────────────

export type JobId =
  | 'police' // 경찰
  | 'astronaut' // 우주비행사
  | 'singer' // 가수
  | 'creator' // 크리에이터
  | 'doctor' // 의사
  | 'roboticist' // 로봇개발자

export type JobCategory = 'traditional' | 'future'

export interface JobDef {
  id: JobId
  /** 화면 · 리포트 표기명 */
  label: string
  category: JobCategory
  /** 프레임 아트 전 — 카드 · 프레임 placeholder 색 */
  placeholderColor: string
}

// ────────────────────────────────────────────────────────────
// 2. 연령 (SPEC §3-2 — 판정 기준이 아니라 문장 난이도 · 안내 톤을 정하는 필터)
// ────────────────────────────────────────────────────────────

/** 만 4세 · 만 5세 · 만 6세 이상 */
export type AgeGroup = '4' | '5' | '6+'

/** 관찰 목표음 — 우리말에서 늦게 습득되는 소리 (SPEC §3-2) */
export type TargetSound = 'ㅅ' | 'ㅆ' | 'ㄹ'

// ────────────────────────────────────────────────────────────
// 3. 시나리오 (P-05 — 직업 × 연령 → 장면 + 타깃 문장 2개)
// ────────────────────────────────────────────────────────────

export type ContentSource =
  /** SPEC.md에 적힌 예시 문장 (자문 전 — T-3) */
  | 'spec'
  /** 흐름도 구성 스케치에 적힌 예시 (임시) */
  | 'sketch'
  /** ⚠️ 미확정 — 화면에 PLACEHOLDER로 보인다 */
  | 'placeholder'

/** 따라 말하는 한 구간 — 만 5 · 6+는 문장 전체, 만 4세는 어절 */
export interface LinePart {
  text: string
  /** 들려주는 음성 파일 (public/ 기준 상대경로). 기획 제공 전에는 없다 (T-3) */
  audio?: string
}

export interface TargetLine {
  /** 타깃 문장 = 자막 */
  text: string
  parts: LinePart[]
  /** 이 문장에서 살펴보는 소리와 그 소리가 든 낱말 (SPEC §3-2) */
  targets: { sound: TargetSound; word: string }[]
  source: ContentSource
}

/** 아이 차례 하나 — 장면이 흘러가다가 타깃 문장을 말한다 */
export interface ScenarioTurn {
  /** 아이 차례 앞 장면의 내레이션 자막. 연출(그림 · 애니메이션)은 T-17 */
  narration: string
  narrationAudio?: string
  narrationSource: ContentSource
  line: TargetLine
}

export interface Scenario {
  job: JobId
  ageGroup: AgeGroup
  /** 아이 차례는 항상 2번 (타깃 문장 2개 — SPEC §2) */
  turns: [ScenarioTurn, ScenarioTurn]
}

// ────────────────────────────────────────────────────────────
// 4. 관찰 결과 (SPEC §3-1 — 「판정」이 아닌 「관찰」)
// ────────────────────────────────────────────────────────────

/**
 * 결과 표현은 "잘 인식됨 / 다르게 인식됨" 2단계뿐이다 (CLAUDE.md 금지사항 8).
 * skipped = 소음 · 무음 등으로 살펴보지 못함(판단 보류) — 결과 단계가 아니다.
 * 문장의 주어는 아동이 아니라 AI의 인식이다. ("~하게 인식되었습니다")
 */
export type SoundResult = 'well' | 'different' | 'skipped'

export interface SoundObservation {
  sound: TargetSound
  /** 그 소리가 든 낱말 (목표 문장의 낱말이지, 아이가 낸 소리가 아니다) */
  word?: string
  result: SoundResult
}

export interface ObservationResult {
  /** 참고형 안내 구조임을 응답 스스로 명시한다 */
  type: 'reference'
  /** 진단이 아니다 — 항상 false. 이 값이 true가 되는 코드는 존재하면 안 된다 */
  diagnostic: false
  sounds: SoundObservation[]
  /** 하나라도 different면 리포트에 '가능한 이유 + 연습 문장' 섹션이 붙는다 */
  hasDifferent: boolean
  /** 모든 소리가 판단 보류 — 표시해서 보내면 서버가 안내 리포트를 보낸다 (SPEC §6-5) */
  allSkipped: boolean
}

/** 음도 요약 — 수치 · 그래프가 아니라 범주형만 낸다 (CLAUDE.md 금지사항 9) */
export type PitchSummary = 'stable' | 'varied' | 'unknown'

/**
 * 녹음 1건의 음향 특성 — **녹음 품질 · 기술 지표**이지 아동 평가가 아니다.
 * 리포트 · 서버로 보내지 않는다. 용도: 무음 · 클리핑 확인.
 */
export interface SpeechFeature {
  /** 0-based 순번 */
  index: number
  /** 전체 RMS 진폭 (0~1) */
  amplitudeRms: number
  /** 피크 진폭 (0~1) — 0.99 이상이면 클리핑 */
  peak: number
  /** 무음으로 판단된 20ms 프레임 비율 (0~1) */
  silenceRatio: number
  /** 소리가 난 프레임을 다 합친 시간(ms) — P-05 무음 검사에 쓴다 */
  soundMs: number
  pitchSummary: PitchSummary
  /** 분석에 쓸 만한 녹음인가 — 무음 · 클리핑이면 false */
  usable: boolean
}

/**
 * ⚠️ 여기에 점수 · 백분율 · 또래 비교 · 아동의 실제 인식 결과("사건→다건")를
 *    서버 · 리포트로 나가는 타입에 추가하지 말 것 — CLAUDE.md 금지사항 9.
 */

// ────────────────────────────────────────────────────────────
// 5. 리포트 문구 완성본 (키오스크가 완성해서 보낸다 — SPEC §4-2 · §6-2)
// ────────────────────────────────────────────────────────────

export interface ReportSection {
  title: string
  /** 한 줄 또는 여러 줄 */
  lines: string[]
}

/**
 * 메일 리포트와 P-07 미리보기에 **똑같이** 쓰이는 문구.
 * 1~5(header · job · spoken · sounds · why)는 미리보기에도 나오고,
 * observation 이하는 아이 화면에서 가린다 (CLAUDE.md 금지사항 7 · SPEC T-16).
 */
export interface ReportText {
  title: string
  /** "만 6세 이상 · 2026.11.20 · 한국잡월드" — 이름 없음 */
  header: string
  job: ReportSection
  spoken: ReportSection
  sounds: ReportSection
  why: ReportSection
  /** 오늘의 관찰 결과 — 미리보기에서는 가린다 */
  observation: ReportSection
  /** 전부 잘 인식된 경우의 종합 한 줄 */
  summary?: string
  /** 다르게 인식된 소리가 있을 때만 */
  reason?: ReportSection
  practice?: ReportSection
  closing: string
  disclaimer: string
}

// ────────────────────────────────────────────────────────────
// 6. 세션 (PAGE_SPEC §5 — 화면 간 공유 상태)
// ────────────────────────────────────────────────────────────

export type KioskMode = 'A' | 'B'

/** 세션 폴더 경로 묶음 — 메인이 만들고 렌더러는 참조만 한다 */
export interface SessionPaths {
  /** YYYYMMDD-HHmmss-xxxx */
  sessionId: string
  root: string
  audioDir: string
  photoDir: string
  /** 촬영 장면 영상 — 기기 안에만, 체험이 끝나면 삭제 */
  videoDir: string
  outputDir: string
}

export interface Consents {
  guardian: true
  voice: true
  photo: true
}

/** P-02a — 보호자가 연결돼 세션이 열리면. 직접 입력한 이메일은 여기 남기지 않는다 */
export interface GuardianLink {
  method: 'kakao' | 'email'
  /** 서버가 준 세션 번호 — P-07 전송에 쓴다 (SPEC §6-4) */
  sessionToken: string
  linkedAt: string
}

/** 따라 말한 한 구간의 결과 */
export interface SpeechPart {
  /** 이 구간의 목표 글자 */
  text: string
  /** 남긴 녹음 (다시 말했으면 인식률이 높은 쪽) · 둘 다 무음이면 없음 */
  wav?: string
  /** 받아쓰기 — P-07 정밀 분석에도 쓴다. 서버로 보내지 않는다 */
  transcript?: string
  /** 다시 말하기 판단용 — 화면 · 서버로 보내지 않는다 */
  cer?: number
  retried: boolean
}

export interface SpeechLine {
  /** 타깃 문장 */
  line: string
  /** 만 5 · 6+는 1개, 만 4세는 어절마다 */
  parts: SpeechPart[]
}

export interface AnalysisState {
  status: 'running' | 'done' | 'failed'
  /** 전부 판단 보류일 수 있다 */
  observation?: ObservationResult
  /** 서버로 보내고, P-07 미리보기에도 쓴다 */
  reportText?: ReportText
  positiveMessage?: string
}

export interface Session {
  /** P-00에서 발급 — 메인의 세션 폴더와 1:1 */
  sessionId?: string
  paths?: SessionPaths
  createdAt?: string

  mode?: KioskMode // P-01

  // ── B모드 전용 ──
  consentAt?: string // P-02 (A는 동의 화면이 없어 비어 있다)
  consents?: Consents
  guardianLink?: GuardianLink // P-02a
  ageGroup?: AgeGroup // P-03
  speech?: SpeechLine[] // P-05 — 타깃 문장마다 (2개)

  // ── 공통 ──
  job?: JobId // P-04 — 1개
  photos?: string[] // P-06 — 원본 4컷
  composedPhoto?: string // P-06 — 4×6 가로 합성본 (1844×1240 · QR 없음)
  captureVideo?: string // P-06 — 촬영 장면 영상 (기기 안에만)

  // ── P-07 ──
  analysis?: AnalysisState
  reportSend?: { status: 'sending' | 'sent' | 'failed' }
  print?: { status: 'printing' | 'done' | 'failed' }
}

// ────────────────────────────────────────────────────────────
// 7. 받아쓰기 (STT) — P-05에서 녹음마다 (⚠️ 지금은 mock)
// ────────────────────────────────────────────────────────────

/** ⚠️ MOCK 전용 — 실제 받아쓰기 프로그램은 이 값을 무시한다 */
export type MockSttOutcome = 'pass' | 'fail' | 'silent'

export interface SttRequest {
  /** 세션 폴더 안의 WAV */
  wavPath: string
  /** 목표 글자 — 받아쓰기에 힌트로 준다 (SPEC §2 · 2026-11-20 결정) */
  targetText: string
  /** ⚠️ MOCK 전용 */
  mock?: {
    outcome: MockSttOutcome
    /** 개발용 버튼으로 직접 고른 경우 — 실제 무음 검사를 건너뛴다 */
    skipSilenceCheck?: boolean
  }
}

export interface SttResult {
  /** 무음이라 받아쓰지 않았다 */
  silent: boolean
  transcript?: string
  /** 글자 단위 CER (띄어쓰기 · 문장부호 무시). 인식률 = 1 − cer. 화면 · 서버로 내보내지 않는다 */
  cer?: number
  /** 받아쓰기에 걸린 시간 (D-01 측정용 — SPEC T-15) */
  elapsedMs: number
  /** mock 결과인가 — D-01 표시용 */
  mock: boolean
}

// ────────────────────────────────────────────────────────────
// 8. 정밀 분석 — P-07에서 촬영 뒤 (⚠️ 지금은 mock)
// ────────────────────────────────────────────────────────────

/** ⚠️ MOCK 전용 — 리포트 갈래를 모두 확인하기 위한 시나리오 토글 */
export type AnalysisScenario =
  | 'random'
  | 'all-well'
  | 'some-different'
  /** 전부 판단 보류 → 서버 안내 리포트 경로 */
  | 'all-skipped'
  /** 분석 실패 → 미리보기 없이 인쇄 경로 */
  | 'fail'

export interface AnalysisInput {
  sessionId: string
  ageGroup: AgeGroup
  job: JobId
  /** P-05 결과 — 남긴 WAV + 받아쓰기 */
  speech: SpeechLine[]
  /** ⚠️ MOCK 전용. 실제 분석 프로그램은 이 필드를 무시한다 */
  scenario?: AnalysisScenario
}

export interface AnalysisOutput {
  /** 남긴 녹음별 음향 특성 — 실측값. 리포트 · 서버로 넘기지 않는다 */
  speechFeatures: SpeechFeature[]
  observation: ObservationResult
  /** 소요 시간(ms) — B모드는 이만큼 사진이 늦게 나온다 (SPEC T-15) */
  elapsedMs: number
}

// ────────────────────────────────────────────────────────────
// 9. 하드웨어 · 환경 (D-01)
// ────────────────────────────────────────────────────────────

export interface EnvInfo {
  electron: string
  chrome: string
  node: string
  platform: string
  arch: string
  /** 세션 폴더들이 놓이는 루트 */
  dataRoot: string
  /** 설치판인가 (false = npm run dev) */
  packaged: boolean
  /** P-07 인쇄 기본값 — 설치판은 real, 개발 실행은 fake (MDV_PRINT로 덮어쓴다) */
  printMode: PrintMode
}

/** fake = 종이를 쓰지 않고 인쇄 시간만 흉내 낸다. 화면에 반드시 표시한다 */
export type PrintMode = 'real' | 'fake'

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
// 10. 파일 저장 (녹음 · 촬영 · 영상)
// ────────────────────────────────────────────────────────────

/**
 * 렌더러는 getUserMedia로 PCM만 뽑아 넘긴다.
 * 리샘플링(→16kHz) · WAV 헤더 작성 · 디스크 IO는 전부 메인 (CLAUDE.md 금지사항 2)
 *
 * 파일명: 01_police.wav · 02_police.wav — 만 4세는 어절 순번(01-2_police.wav),
 *         다시 말한 녹음은 _retry (판단 직후 안 쓰는 쪽을 지운다)
 */
export interface SaveWavRequest {
  sessionId: string
  /** 0-based 문장 순번 (P-05는 0~1) */
  lineIndex: number
  /** 0-based 어절 순번 — 만 4세만. 문장 단위면 생략 */
  partIndex?: number
  /** 다시 말하기 녹음인가 */
  retry?: boolean
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
  /** true면 4×6 가로 합성본(fourcut.png)으로 저장 */
  composed?: boolean
}

/** P-06 촬영 장면 영상 — 기기 안에만 둔다 (서버로 보내지 않는다) */
export interface SaveVideoRequest {
  sessionId: string
  /** MediaRecorder가 만든 webm 바이트 */
  data: ArrayBuffer
}

// ────────────────────────────────────────────────────────────
// 10-1. 카메라 사이드카 (CameraHost.exe — R100은 UVC가 아니라 EDSDK로 제어)
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

/** D-01 실카메라 자가진단 — 항목별 결과 */
export type SelfTestVerdict = 'pass' | 'warn' | 'fail'

export interface SelfTestItem {
  name: string
  verdict: SelfTestVerdict
  detail: string
}

export interface CameraSelfTestReport {
  /** 항목 중 가장 나쁜 결과 */
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
// 11. 네컷 PDF · 인쇄
// ────────────────────────────────────────────────────────────

/** 네컷 이미지를 4×6 가로 풀블리드 PDF로 감싼다 (돌리지 않고 1:1) */
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

// ────────────────────────────────────────────────────────────
// 12. 백엔드 서버 (SPEC §6 — ⚠️ API 합의 전(T-14)이라 지금은 mock 응답)
//     키오스크 몫: 세션 열기 → 데이터 보내기 → 세션 닫기
// ────────────────────────────────────────────────────────────

/** 서버 요청이 실패한 까닭 — 개발자용. 아이 화면에는 그대로 내보내지 않는다 */
export type ServerFailReason = 'offline' | 'timeout' | 'server' | 'rejected'

export type ServerResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; reason: ServerFailReason; error?: string }

/** P-02a 도착 시 — 세션 번호 · QR 주소를 받는다 (SPEC §6-4) */
export type OpenSessionResult = ServerResult<{
  sessionToken: string
  /** QR로 그릴 주소 (예: https://<서버>/s/<세션 번호>) */
  qrUrl: string
}>

/** 카카오 로그인이 끝났는지 — 몇 초마다 묻는다 (방식은 T-14) */
export type LinkStatusResult = ServerResult<{ linked: boolean }>

/** 직접 입력한 이메일 전달 — 보낸 뒤 기기에 남기지 않는다 (로그에도 쓰지 않는다) */
export interface SubmitEmailRequest {
  sessionToken: string
  email: string
}

/**
 * 렌더러 → 메인: 리포트 데이터 전송 요청.
 * 네컷 이미지는 메인이 세션 폴더의 합성본만 읽어 붙인다 — 렌더러는 파일 경로를 넘기지 않는다.
 */
export interface SendReportRequest {
  sessionId: string
  sessionToken: string
  createdAt: string
  ageGroup: AgeGroup
  job: JobId
  /** 타깃 문장 2개 (speech[].line) */
  lines: string[]
  observation: ObservationResult
  positiveMessage: string
  reportText: ReportText
}

/**
 * 메인 → 서버: 실제로 나가는 데이터 (SPEC §6-2).
 * ⚠️ 여기에 없는 것은 나가지 않는다 — 원본 WAV · 개별 사진 · 촬영 영상 · 인식된 글자 · 점수 금지
 *    (CLAUDE.md 금지사항 4 · 9). 보호자 이메일도 넣지 않는다.
 */
export interface ReportPayload {
  sessionToken: string
  sessionId: string
  kioskId: string
  createdAt: string
  ageGroup: AgeGroup
  job: JobId
  lines: string[]
  observations: SoundObservation[]
  /** 모든 소리가 판단 보류 — 서버가 안내 리포트를 보낸다 (SPEC §6-5) */
  allSkipped: boolean
  positiveMessage: string
  reportText: ReportText
  /** 네컷 이미지 (JPEG) base64 */
  fourcut: string
}

export type SendReportResult = ServerResult

/** ⚠️ MOCK 전용 — 개발용 서버 흉내 조작 (DevBar · P-02a 개발용 버튼) */
export interface MockServerState {
  /** offline이면 모든 요청이 연결 실패로 끝난다 */
  network: 'online' | 'offline'
}

// ────────────────────────────────────────────────────────────
// 13. IPC 채널
// ────────────────────────────────────────────────────────────

export const IPC = {
  SYSTEM_ENV_INFO: 'system:envInfo',
  SYSTEM_LIST_PRINTERS: 'system:listPrinters',
  SYSTEM_PRINTER_PAPER: 'system:printerPaper',
  SYSTEM_SET_FULLSCREEN: 'system:setFullscreen',
  /** D-01 — 채집한 WAV를 탐색기에서 열어보기 위한 개발 편의 기능 */
  SYSTEM_REVEAL_PATH: 'system:revealPath',

  SESSION_BEGIN: 'session:begin',
  /** M-03 — 로컬 WAV · 사진 · 영상 · PDF 삭제 */
  SESSION_PURGE: 'session:purge',

  RECORDING_SAVE_WAV: 'recording:saveWav',
  /** D-01 — 저장된 WAV를 되읽어 청음 확인 */
  RECORDING_READ_WAV: 'recording:readWav',
  /** P-05 — 다시 말하기로 안 쓰게 된 녹음을 바로 지운다 */
  RECORDING_DELETE_WAV: 'recording:deleteWav',

  /** ⚠️ MOCK: main/mock/stt.ts — 파이썬 받아쓰기 프로그램으로 교체 예정 */
  STT_TRANSCRIBE: 'stt:transcribe',

  PHOTO_SAVE: 'photo:save',
  /** 촬영 원본을 되읽어 네컷으로 합성한다 */
  PHOTO_READ: 'photo:read',
  PHOTO_RENDER_PDF: 'photo:renderPdf',

  /** P-06 촬영 장면 영상 저장 · P-07 재생용 되읽기 */
  VIDEO_SAVE: 'video:save',
  VIDEO_READ: 'video:read',

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

  /** ⚠️ MOCK: main/mock/analysis.ts — 파이썬 분석 프로그램으로 교체 예정 */
  ANALYSIS_RUN: 'analysis:run',

  PRINT_SILENT: 'print:silent',

  // ── 백엔드 서버 (⚠️ 지금은 mock 응답 — main/server.ts) ──
  SERVER_OPEN_SESSION: 'server:openSession',
  SERVER_LINK_STATUS: 'server:linkStatus',
  SERVER_SUBMIT_EMAIL: 'server:submitEmail',
  SERVER_SEND_REPORT: 'server:sendReport',
  SERVER_CLOSE_SESSION: 'server:closeSession',
  /** ⚠️ MOCK 전용 — 서버 연결 끊김 흉내 · 카카오 로그인 완료 흉내 */
  SERVER_MOCK_GET: 'server:mockGet',
  SERVER_MOCK_SET: 'server:mockSet',
  SERVER_MOCK_KAKAO_LOGIN: 'server:mockKakaoLogin',
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
    /** 세션 폴더 안의 WAV 하나를 지운다 */
    deleteWav(path: string): Promise<void>
  }
  stt: {
    /** ⚠️ MOCK: src/main/mock/stt.ts — 무음 검사는 실측, 받아쓰기는 가짜 */
    transcribe(req: SttRequest): Promise<SttResult>
  }
  photo: {
    save(req: SavePhotoRequest): Promise<SavedFile>
    /** 세션 폴더 안의 사진 원본 바이트 */
    read(path: string): Promise<ArrayBuffer>
    renderPdf(req: RenderPhotoPdfRequest): Promise<SavedFile>
  }
  video: {
    save(req: SaveVideoRequest): Promise<SavedFile>
    /** 세션 폴더 안의 촬영 영상 바이트 */
    read(path: string): Promise<ArrayBuffer>
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
    /** ⚠️ MOCK: src/main/mock/analysis.ts — 실제 분석 프로그램으로 교체 예정 */
    run(req: AnalysisInput): Promise<AnalysisOutput>
  }
  print: {
    silent(req: PrintRequest): Promise<PrintResult>
  }
  /** ⚠️ 지금은 mock 응답 (API 합의 전 — SPEC T-14) */
  server: {
    openSession(): Promise<OpenSessionResult>
    linkStatus(sessionToken: string): Promise<LinkStatusResult>
    submitEmail(req: SubmitEmailRequest): Promise<ServerResult>
    sendReport(req: SendReportRequest): Promise<SendReportResult>
    closeSession(sessionToken: string): Promise<void>
    /** ⚠️ MOCK 전용 */
    mockGet(): Promise<MockServerState>
    mockSet(state: Partial<MockServerState>): Promise<MockServerState>
    mockKakaoLogin(sessionToken: string): Promise<void>
  }
}
