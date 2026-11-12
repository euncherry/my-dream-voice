/** src/shared/constants.ts — 설치처·규격 등 고정값 */

/** 설치처 (SPEC §1) — 리포트 헤더에 표기 */
export const PLACE = '한국잡월드'

/** 인쇄 규격 4×6인치 단판 @300dpi (SPIKE_PLAN ②) */
export const PRINT_DPI = 300
export const PRINT_INCHES = { width: 4, height: 6 } as const
/**
 * DP-DS620 드라이버의 4×6 용지 이름과 인쇄 페이지 크기 (D-01 실측).
 * 가로로 긴 방향이고, 프린터가 가장자리를 잘라 실물 6×4in로 만든다.
 */
export const PRINT_PAPER_NAME = '(6x4)'
export const PRINT_PAGE_INCHES = { width: 6.15, height: 4.13 } as const

/**
 * D-01 해상도 프리셋.
 * getUserMedia의 해상도는 "요청"일 뿐이라 카메라가 못 맞추면 조용히 낮은 값으로 떨어진다.
 * → D-01은 요청값과 track.getSettings()의 실제값을 나란히 보여준다 (SPIKE_PLAN ① 2번)
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

/** P-10 QR 유효기간 (SPEC §6) */
export const DOWNLOAD_TTL_HOURS = 24

/** 무조작 타임아웃 (PAGE_SPEC §2-6) — M-01은 스파이크 제외, 값만 확정해 둔다 */
export const IDLE_TIMEOUT_SEC = 60
export const IDLE_GRACE_SEC = 15
