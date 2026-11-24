/** src/shared/constants.ts — 설치처 · 규격 · 시간 등 고정값 (v2) */

/** 설치처 (SPEC §1) — 리포트 헤더에 표기 */
export const PLACE = '한국잡월드'

/** 키오스크 식별자 — 서버로 보내는 데이터에 넣는다 (SPEC §6-2 예시값. 실제 값은 설치 때 — T-14) */
export const KIOSK_ID = 'jobworld-01'

// ────────────────────────────────────────────────────────────
// 네컷 · 인쇄 규격 (SPEC §4-1 — 2026-11-18 가로)
// ────────────────────────────────────────────────────────────

export const PRINT_DPI = 300

/**
 * DP-DS620 드라이버의 4×6 용지 이름과 인쇄 페이지 크기 (D-01 실측).
 * 가로로 긴 방향이고, 프린터가 가장자리를 잘라 실물 6×4in로 만든다.
 */
export const PRINT_PAPER_NAME = '(6x4)'
export const PRINT_PAGE_INCHES = { width: 6.15, height: 4.13 } as const

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * 네컷 캔버스 — 1844 × 1240 px (300dpi · 가로).
 * 드라이버 (6x4) 인쇄 페이지(6.15 × 4.13in)와 같아 돌리거나 늘리지 않고 1:1로 인쇄된다.
 * 실제 종이는 가운데 1800 × 1200 — 바깥 약 20px은 잘려 나갈 수 있다.
 *
 * 사진 칸 좌표는 받은 직업 프레임 6장(public/frames/<jobId>.png — 2026-11-23)의 투명한 사진 칸에서 잰 값이다.
 *   6장은 칸 자리 · 모양이 같은 틀이다. 칸은 물결 · 구름 모양이라 6장의 칸을 모두 감싸는 네모로 잡고 3px씩 넉넉히 둔다 —
 *   사진은 이 네모를 채우고, 칸 바깥은 프레임이 덮는다.
 *   네 칸의 크기가 조금씩 다르다 (합성은 칸마다 가운데를 맞춰 자른다).
 *   프레임이 바뀌면 여기만 바꾸면 합성(composeFourCut) · 촬영 프리뷰 비율(P-06) · 카드 그림(P-04)이 따라온다.
 * 오른쪽 띠(strip)는 프레임 그림이 없을 때 그리는 PLACEHOLDER 프레임에서만 쓴다.
 * QR 자리는 없다 (2026-11-20 — A · B 같은 프레임).
 */
export const FOURCUT = {
  width: 1844,
  height: 1240,
  /** 중요 요소는 가장자리에서 이만큼 안쪽에 둔다 */
  safeInset: 60,
  /** 사진 칸 4개 — 가로 (왼쪽 위 → 오른쪽 위 → 왼쪽 아래 → 오른쪽 아래). 프레임 6장의 칸을 모두 감싸는 네모 + 3px */
  cells: [
    { x: 151, y: 132, width: 660, height: 471 },
    { x: 898, y: 143, width: 655, height: 458 },
    { x: 145, y: 674, width: 664, height: 483 },
    { x: 892, y: 673, width: 663, height: 479 },
  ] as readonly Rect[],
  /** 오른쪽 세로 띠 — 로고 자리 */
  strip: { x: 1562, y: 62, width: 220, height: 1116 } as Rect,
  /**
   * 칸 자리가 다른 프레임 — 직업 id → 칸 4개 (없으면 위 cells).
   * 우주비행사 (2026-11-24 새 프레임 · 노란 격자 · 띠 없음): 투명 칸 네 개가 762~763×561 —
   * 그림에서 잰 구멍(153,52 · 929,52 · 153,627 · 929,627)에 둘레 3px을 더했다.
   */
  cellsByJob: {
    astronaut: [
      { x: 150, y: 49, width: 768, height: 567 },
      { x: 926, y: 49, width: 769, height: 567 },
      { x: 150, y: 624, width: 768, height: 567 },
      { x: 926, y: 624, width: 769, height: 567 },
    ],
  } as Readonly<Record<string, readonly Rect[]>>,
} as const

/** 촬영 컷 수 */
export const CUT_COUNT = 4

// ────────────────────────────────────────────────────────────
// 시간 (SPEC §2 · PAGE_SPEC)
// ────────────────────────────────────────────────────────────

/** P-06 — 컷마다 카운트다운 7초 (2026-11-18) */
export const CAPTURE_INTERVAL_SEC = 7

/** M-03 — 완료 창이 닫히기까지 */
export const DONE_MODAL_SEC = 5

/** P-07 — 서버 전송 타임아웃 (SPEC §6-1) */
export const REPORT_SEND_TIMEOUT_MS = 15_000

/**
 * P-07 — 인쇄 요청 뒤 사진이 나오기까지 기다리는 시간.
 * 드라이버가 "다 나왔다"를 알려 주지 않아 DS620A의 4×6 인쇄 시간(약 8.3초)만큼 기다린 뒤 완료 창을 띄운다.
 * ⚠️ 임시값 — 실물에서 재어 보고 맞춘다.
 */
export const PRINT_WAIT_MS = 9_000

/**
 * P-07 — 인쇄 요청(프린터 큐에 넣기)이 이보다 오래 걸리면 인쇄 실패로 본다 (M-02 → M-03).
 * 프린터 드라이버가 대화창을 띄우거나 멈추면 요청이 끝나지 않아 화면이 "프린트 중"에 머문다 — 그걸 막는 안전값이다.
 */
export const PRINT_REQUEST_TIMEOUT_MS = 30_000

/**
 * 화면이 바뀐 직후 이 시간 동안은 [뒤로]와 첫 화면의 선택 터치를 받지 않는다 (연타로 두 칸 넘어가는 것 방지).
 * ⚠️ 임시값 — 실물 터치 패널에서 맞춘다.
 */
export const TAP_GUARD_MS = 400

// ── P-05 발화 (docs/P05_SCENARIO.md §0 — 버튼 없음 · 띵 신호 · 저절로 녹음) ──

/** 다시 말하기 기준 — 인식률(1 − 글자 CER)이 이 값 미만이면 1회 다시 (SPEC §2 · T-10) */
export const RETRY_MIN_RECOGNITION = 0.5

/** "잘 듣고 있어요"를 최소 이만큼은 보여 준다 */
export const STT_MIN_SHOW_MS = 1_000

/** 받아쓰기가 이보다 오래 걸리거나 실패하면 통과로 본다 */
export const STT_MAX_WAIT_MS = 8_000

/**
 * 띵 소리 파일이 끝난 뒤 녹음을 시작하기까지 — 띵이 녹음에 섞이지 않게 (CLAUDE.md 금지사항 6).
 * 파일(audio/sfx/ding.wav 0.49초)은 소리가 0.35초에 끝나고 뒤가 조용하다 → 소리가 끝나고 약 0.3초 뒤 녹음 (시나리오 §0)
 */
export const DING_TO_RECORD_MS = 150

/**
 * 녹음 최대 시간 — 아예 말이 없을 때 여기서 끝난다 (시나리오 §0 · ⚠️ 임시 — SPEC T-19).
 * 어절 = 만 4세 어절 · "준비 완료!" 연습 / 문장 = 만 5 · 6세 문장
 */
export const RECORD_MAX_WORD_MS = 4_000
export const RECORD_MAX_LINE_MS = 6_000

/** 말을 시작한 뒤 이만큼 조용하면 녹음이 저절로 끝난다 (시나리오 §0 — 약 1초) */
export const SILENCE_END_MS = 1_000

/**
 * 목소리 크기 기준 — 마이크에 들어온 소리 크기(dBFS: 마이크가 받을 수 있는 가장 큰 소리 = 0, 작을수록 음수).
 * 짧은 구간(약 40ms)마다 잰다. ⚠️ 임시값 — 키오스크에서 D-01 [목소리 크기 재기]로 실제 아이 목소리를 재 보고 맞춘다.
 *   VOICE_START_DB — 이보다 크면 "말소리"로 친다 (주변 소음보다 커야 한다)
 *   VOICE_LOUD_DB  — 말한 부분 중 가장 큰 소리가 이보다 작으면 "작게 말함" ("○○가 너~무 멀리 있나 봐")
 */
export const VOICE_START_DB = -45
export const VOICE_LOUD_DB = -30

/** 말소리가 이만큼 이어져야 "말을 시작했다"로 본다 — 톡 치는 소리 같은 잡음을 거른다 */
export const VOICE_MIN_MS = 150

/** 목소리 파일이 없을 때 자막을 보여 주는 시간 — 글자당 · 최소 (목소리 파일이 오면 파일 길이를 따른다) */
export const SUBTITLE_MS_PER_CHAR = 150
export const SUBTITLE_MIN_MS = 1_500

/** 대사와 대사 사이 숨 고르기 */
export const BEAT_GAP_MS = 250

// ── P-02a 보호자 연결 (⚠️ 전부 임시값 — 서버와 합의 후 정한다, SPEC T-14) ──

/** 카카오 로그인이 끝났는지 서버에 묻는 주기 */
export const LINK_POLL_MS = 2_000

/** 세션 열기 · 이메일 전달 · 로그인 확인 요청 타임아웃 */
export const LINK_REQUEST_TIMEOUT_MS = 5_000

/** 로그인 확인이 연속으로 이만큼 실패하면 "연결이 잘 안 돼요"를 띄운다 */
export const LINK_POLL_FAIL_LIMIT = 3

/** "연결됐어요"를 보여 주고 P-03으로 넘어가기까지 */
export const LINKED_SHOW_MS = 1_500

// ────────────────────────────────────────────────────────────
// D-01
// ────────────────────────────────────────────────────────────

/**
 * D-01 해상도 프리셋.
 * getUserMedia의 해상도는 "요청"일 뿐이라 카메라가 못 맞추면 조용히 낮은 값으로 떨어진다.
 * → D-01은 요청값과 track.getSettings()의 실제값을 나란히 보여준다
 */
export interface ResolutionPreset {
  id: '720p' | '1080p' | '4k'
  label: string
  width: number
  height: number
}

export const RESOLUTION_PRESETS: ResolutionPreset[] = [
  { id: '720p', label: '720p', width: 1280, height: 720 },
  { id: '1080p', label: '1080p', width: 1920, height: 1080 },
  { id: '4k', label: '4K', width: 3840, height: 2160 },
]

/**
 * 무조작 타임아웃 (PAGE_SPEC §2-6) — M-01은 아직 미구현, 값만 둔다.
 * P-02a에서 보호자가 폰으로 가입하는 동안의 처리와 함께 다시 정한다 (SPEC T-18).
 */
export const IDLE_TIMEOUT_SEC = 60
export const IDLE_GRACE_SEC = 15
