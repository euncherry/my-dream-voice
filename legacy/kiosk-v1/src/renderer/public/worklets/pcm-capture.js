/**
 * pcmWorklet.js — 마이크 raw PCM 수집 (AudioWorklet)
 *
 * ⚠️ 이 파일은 TypeScript로 컴파일되지 않는 별도 스크립트다.
 *    AudioWorklet은 자체 전역 스코프에서 도는 순수 JS여야 한다.
 *
 * 역할은 여기까지다 — 모아서 넘기기만 한다.
 * 16kHz 리샘플링·WAV 헤더 작성·디스크 저장은 전부 메인 프로세스가 한다
 * (CLAUDE.md 금지사항 2: 렌더러에서 무거운 연산 금지)
 *
 * process()는 128 프레임마다 불린다. 그대로 postMessage하면 초당 375번이라
 * 4096 샘플씩 모아서 넘긴다.
 */

const CHUNK = 4096

class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this._buf = new Float32Array(CHUNK)
    this._n = 0
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0]
    if (!channel) return true

    for (let i = 0; i < channel.length; i++) {
      this._buf[this._n++] = channel[i]
      if (this._n === CHUNK) {
        // 복사본을 보낸다 — 원본은 계속 재사용된다
        this.port.postMessage(this._buf.slice(0))
        this._n = 0
      }
    }
    return true
  }
}

registerProcessor('pcm-capture', PcmCaptureProcessor)
