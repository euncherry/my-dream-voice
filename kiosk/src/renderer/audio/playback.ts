/**
 * audio/playback.ts — 스피커 테스트음 · 저장된 WAV 청음
 *
 * ⚠️ CLAUDE.md 금지사항 6 — 녹음 중에는 어떤 소리도 내지 않는다.
 *    호출부(D-01, P-05)가 녹음 중이 아닐 때만 부르도록 지킨다.
 */

/** public/audio/ 에 넣는다. 없으면 사인파로 대체 (audio/README.md) */
const SPEAKER_TEST_SRC = './audio/speaker-test.mp3'

let current: HTMLAudioElement | null = null

export function stopAll(): void {
  current?.pause()
  current = null
}

/**
 * 스피커 테스트음.
 * @returns 'file' = 준비된 파일 재생 / 'tone' = 파일이 없어 440Hz 사인파로 대체
 */
export async function playSpeakerTest(): Promise<'file' | 'tone'> {
  stopAll()
  try {
    const audio = new Audio(SPEAKER_TEST_SRC)
    current = audio
    await audio.play()
    return 'file'
  } catch {
    current = null
    await playTone()
    return 'tone'
  }
}

/** 440Hz 사인파 1초 — 좌우 채널 모두 */
async function playTone(seconds = 1): Promise<void> {
  const ctx = new AudioContext()
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.type = 'sine'
  osc.frequency.value = 440
  // 딸깍 소리 방지용 페이드
  gain.gain.setValueAtTime(0, ctx.currentTime)
  gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.02)
  gain.gain.setValueAtTime(0.25, ctx.currentTime + seconds - 0.05)
  gain.gain.linearRampToValueAtTime(0, ctx.currentTime + seconds)

  osc.connect(gain).connect(ctx.destination)
  osc.start()
  osc.stop(ctx.currentTime + seconds)

  await new Promise((r) => setTimeout(r, seconds * 1000 + 100))
  await ctx.close()
}

/**
 * 저장된 WAV 파일을 되읽어 재생한다 (SPIKE_PLAN ① "저장된 WAV를 재생해 청음 확인").
 * 렌더러는 파일시스템에 접근할 수 없으므로 메인에서 바이트를 받아 디코드한다.
 */
export async function playSavedWav(path: string): Promise<{ durationSec: number }> {
  stopAll()
  const bytes = await window.api.recording.readWav(path)
  const ctx = new AudioContext()
  try {
    const buffer = await ctx.decodeAudioData(bytes)
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)
    source.start()
    await new Promise((r) => setTimeout(r, buffer.duration * 1000 + 150))
    return { durationSec: buffer.duration }
  } finally {
    await ctx.close()
  }
}
