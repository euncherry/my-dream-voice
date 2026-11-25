/**
 * audio/clips.ts — P-05 [발화]의 문장 음성 · 녹음 멘트 · 장면 내레이션 재생
 *
 * 근거: PAGE_SPEC "P-05 [발화]" 아이 차례 ① · ② · SPEC §2 「아이 차례 진행」
 *
 * 음성 파일은 기획에서 만들어 준다 (SPEC T-3) — 아직 없다.
 * 경로가 없거나 · 파일이 없거나 · 재생에 실패하면 **자막만** fallbackMs 동안 보여 준 것으로 치고 끝낸다.
 *   개발 서버는 없는 파일에 index.html을 돌려주므로 "파일이 있나"를 미리 물어서는 알 수 없다.
 *   → 재생 오류(error 이벤트 · play() 거부 · 제때 시작 못 함)로 판단한다.
 *
 * ⚠️ CLAUDE.md 금지사항 6 — 녹음 중에는 어떤 소리도 내지 않는다.
 *    녹음 직전에 muteClips(true)를 부르면 재생 중인 것을 모두 멈추고,
 *    muteClips(false)로 풀 때까지 playClip은 소리를 내지 않는다 (호출부 실수 대비 이중 잠금).
 */

export type ClipEnd =
  /** 음성을 끝까지 재생했다 */
  | 'played'
  /** 음성 없이 자막 시간만 채웠다 */
  | 'missing'
  /** 중간에 멈췄다 (화면을 떠남 · 녹음 시작) — 다음 단계로 넘어가면 안 된다 */
  | 'stopped'

export interface ClipHandle {
  /** 재생(또는 자막 시간)이 끝나면 풀린다. 거부되지 않는다 */
  done: Promise<ClipEnd>
  stop(): void
}

export interface ClipOptions {
  /** 소리가 실제로 나기 시작했다 */
  onPlaying?: () => void
  /** 음성 없이 자막만 보여 주게 됐다 — 화면에 PLACEHOLDER를 띄울 때 쓴다 */
  onMissing?: () => void
}

/** 이 시간 안에 소리가 나기 시작하지 않으면 파일이 없는 것으로 본다 */
const START_TIMEOUT_MS = 1_500

/** 재생이 끝났다는 신호(ended)가 오지 않을 때를 대비한 여유 */
const END_MARGIN_MS = 1_500

/** 지금 재생 중이거나 자막 시간을 재고 있는 것들의 정지 함수 */
const stoppers = new Set<() => void>()

/** 녹음 중 잠금 — true인 동안은 어떤 소리도 내지 않는다 */
let muted = false

/**
 * 음성 하나를 재생한다.
 * @param src public/ 기준 상대경로 (예: './audio/voice/cue-speak-now.mp3'). 없으면 자막만
 * @param fallbackMs 음성이 없을 때 자막을 보여 주는 시간
 */
export function playClip(
  src: string | undefined,
  fallbackMs: number,
  options: ClipOptions = {},
): ClipHandle {
  let settled = false
  let fellBack = false
  let audio: HTMLAudioElement | null = null
  let timer: number | null = null
  let resolveDone: (end: ClipEnd) => void = () => undefined
  const done = new Promise<ClipEnd>((resolve) => {
    resolveDone = resolve
  })
  const startedAt = performance.now()

  const clearTimer = (): void => {
    if (timer !== null) window.clearTimeout(timer)
    timer = null
  }

  const releaseAudio = (): void => {
    if (!audio) return
    const el = audio
    audio = null
    el.onplaying = null
    el.onended = null
    el.onerror = null
    el.pause()
    // 내려받기 · 디코딩을 놓아 준다
    el.removeAttribute('src')
    el.load()
  }

  const finish = (end: ClipEnd): void => {
    if (settled) return
    settled = true
    clearTimer()
    releaseAudio()
    stoppers.delete(stop)
    resolveDone(end)
  }

  const stop = (): void => finish('stopped')

  /** 음성 없이 자막만 — 처음부터 센 fallbackMs를 채우고 끝낸다 */
  const fallBack = (): void => {
    if (settled || fellBack) return
    fellBack = true
    clearTimer()
    releaseAudio()
    options.onMissing?.()
    const rest = Math.max(0, fallbackMs - (performance.now() - startedAt))
    timer = window.setTimeout(() => finish('missing'), rest)
  }

  // ⚠️ 금지사항 6 — 녹음 중에는 재생하지 않는다
  if (muted) {
    finish('stopped')
    return { done, stop }
  }

  stoppers.add(stop)

  if (!src) {
    fallBack()
    return { done, stop }
  }

  const el = new Audio()
  audio = el
  el.preload = 'auto'
  el.onplaying = (): void => {
    if (settled || fellBack) return
    clearTimer()
    options.onPlaying?.()
    if (Number.isFinite(el.duration)) {
      const remainMs = Math.max(0, el.duration - el.currentTime) * 1000
      timer = window.setTimeout(() => finish('played'), remainMs + END_MARGIN_MS)
    }
  }
  el.onended = (): void => finish('played')
  el.onerror = fallBack
  el.src = src
  timer = window.setTimeout(fallBack, START_TIMEOUT_MS)
  el.play().catch(fallBack)

  return { done, stop }
}

/** 재생 중인 것을 모두 멈춘다 (화면을 떠날 때 · 녹음 시작 전) */
export function stopClips(): void {
  for (const stop of [...stoppers]) stop()
}

/**
 * 녹음 중 잠금 (CLAUDE.md 금지사항 6).
 * true — 재생 중인 것을 모두 멈추고, 풀 때까지 playClip이 소리를 내지 않는다.
 * false — 녹음이 끝나 마이크를 닫은 뒤에 부른다.
 */
export function muteClips(on: boolean): void {
  muted = on
  if (on) stopClips()
}
