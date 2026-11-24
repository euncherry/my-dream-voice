/**
 * photo/recordLiveView.ts — P-06 [촬영] 촬영 장면 녹화
 *
 * 근거: PAGE_SPEC "P-06 [촬영]" 촬영 장면 녹화 · V2_PLAN §3 P-06 행
 *
 * 라이브뷰는 사이드카가 주는 MJPEG <img>라 그대로는 녹화할 수 없다. 화면에 띄운 그 <img>를
 * 캔버스에 초당 약 15장 옮겨 그리고, canvas.captureStream() + MediaRecorder로 webm을 만든다.
 * 만든 영상은 P-07[분석 및 프린트]이 반복 재생한다.
 *
 *  - 기기 안에만 둔다 — 서버로 보내지 않고, 체험이 끝나면 세션 폴더째 지워진다 (CLAUDE.md 금지사항 4).
 *    이 파일은 Blob만 만든다. 저장은 화면이 window.api.video.save로 메인에 맡긴다.
 *  - 소리는 녹음하지 않는다 (영상 트랙뿐이다)
 *  - 화면에 보이는 것과 같은 가운데 잘라내기(cellAspect — 고른 직업 프레임의 칸 비율)로, **좌우 반전하지 않은 원본 방향**으로 담는다.
 *    거울처럼 보여 주는 것은 재생하는 쪽(P-07)이 한다
 *  - ⚠️ 녹화는 덤이다. 지원하지 않거나 캔버스가 잠기면(SecurityError) 조용히 영상 없이 간다.
 *    촬영 · 카운트다운을 막거나 늦추지 않도록, 여기의 어떤 함수도 예외를 던지거나 거절하지 않는다
 *
 * 캔버스가 잠기지 않으려면 <img crossOrigin="anonymous"> 여야 하고, 라이브뷰 응답에
 * Access-Control-Allow-Origin이 붙어 있어야 한다 (src/main/index.ts — allowLiveViewCapture).
 *
 * 구간: 라이브뷰 첫 프레임부터 stop()까지 통째로 담는다.
 * TODO(디자인): 영상 길이 · 구간(컷마다 몇 초만 담을지 등)은 디자인 때 정한다 (PAGE_SPEC P-06)
 */


/** 녹화 폭 상한(px) — 라이브뷰가 더 작으면 그 크기를 쓴다 */
const MAX_WIDTH = 960
/** 초당 그리는 장수 */
const FPS = 15
/** 과하지 않게 — 40초 안팎이면 12MB쯤 */
const BITS_PER_SECOND = 2_500_000
/** 앞에서부터 지원하는 첫 번째를 쓴다 */
const MIME_TYPES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
/** MediaRecorder가 데이터를 내놓는 주기 */
const TIMESLICE_MS = 1000
/** stop() 뒤 인코더가 마무리하기를 기다리는 한도 — 넘으면 영상 없이 간다 */
const STOP_TIMEOUT_MS = 3000

export interface LiveViewRecording {
  /**
   * 녹화를 끝내고 webm을 돌려준다. 녹화하지 못했으면(첫 프레임 전 · 실패) null.
   * 거절하지 않는다. 여러 번 불러도 같은 결과를 준다.
   */
  stop(): Promise<Blob | null>
  /** 결과를 버리고 정리한다 (화면을 떠날 때). stop() 뒤에는 아무 일도 하지 않는다 */
  cancel(): void
}

type State =
  | 'waiting' // 라이브뷰 첫 프레임을 기다린다
  | 'recording'
  | 'stopping' // stop()을 불렀고 인코더가 마무리하는 중
  | 'closed'

function pickMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  return MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? null
}

/** 가운데 잘라내기 — 화면의 object-fit: cover · 네컷 합성(composeFourCut)과 같은 영역 */
function coverCrop(
  width: number,
  height: number,
  aspect: number,
): { sx: number; sy: number; sw: number; sh: number } {
  const sw = Math.min(width, height * aspect)
  const sh = Math.min(height, width / aspect)
  return { sx: (width - sw) / 2, sy: (height - sh) / 2, sw, sh }
}

/** 영상 인코더는 짝수 크기를 좋아한다 */
function even(n: number): number {
  return Math.max(2, Math.round(n / 2) * 2)
}

/**
 * 라이브뷰 <img>의 녹화를 시작한다.
 *
 * 첫 프레임이 아직 안 왔어도 불러도 된다 — 프레임이 오면 그때부터 담는다.
 * 이 브라우저가 녹화를 지원하지 않으면 null을 돌려준다.
 *
 * @param img 화면에 띄운 라이브뷰 <img> (crossOrigin="anonymous"). 좌우 반전은 CSS로만 했으므로 원본 방향으로 그려진다
 * @param onStatus 녹화가 실제로 시작됐거나(recording) 포기했을 때(failed) 알려 준다 — 개발용 표시에 쓴다.
 *                 cancel() · stop() 뒤에는 부르지 않는다
 */
export function startLiveViewRecording(
  img: HTMLImageElement,
  /** 담을 비율 — 사진 칸의 가로 ÷ 세로 (composeFourCut.cellAspect) */
  aspect: number,
  onStatus?: (status: 'recording' | 'failed') => void,
): LiveViewRecording | null {
  const picked = pickMimeType()
  if (!picked || typeof HTMLCanvasElement.prototype.captureStream !== 'function') return null
  // 아래 함수들 안에서도 string으로 쓰이게 따로 받아 둔다
  const mimeType: string = picked

  let state: State = 'waiting'
  let timer = 0
  let canvas: HTMLCanvasElement | null = null
  let ctx: CanvasRenderingContext2D | null = null
  let stream: MediaStream | null = null
  let recorder: MediaRecorder | null = null
  let chunks: Blob[] = []
  let stopping: Promise<Blob | null> | null = null

  /** 타이머 · 스트림 · 캔버스를 놓는다 */
  function release(): void {
    window.clearInterval(timer)
    stream?.getTracks().forEach((track) => track.stop())
    stream = null
    recorder = null
    ctx = null
    if (canvas) {
      // 캔버스 메모리를 바로 돌려준다
      canvas.width = 0
      canvas.height = 0
    }
    canvas = null
  }

  /** 담은 것을 버리고 닫는다 */
  function discard(): void {
    state = 'closed'
    chunks = []
    if (recorder) {
      recorder.ondataavailable = null
      recorder.onerror = null
      try {
        if (recorder.state !== 'inactive') recorder.stop()
      } catch {
        /* 이미 멈췄다 */
      }
    }
    release()
  }

  /** 조용히 포기한다 — 촬영은 영상 없이 그대로 간다 */
  function giveUp(reason: unknown): void {
    if (state === 'closed' || state === 'stopping') return
    discard()
    console.warn('[P-06] 촬영 장면 녹화를 건너뜁니다 (영상 없이 진행):', reason)
    onStatus?.('failed')
  }

  function draw(): void {
    if (!canvas || !ctx) return
    const { naturalWidth, naturalHeight } = img
    if (!naturalWidth || !naturalHeight) return
    try {
      const { sx, sy, sw, sh } = coverCrop(naturalWidth, naturalHeight, aspect)
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
    } catch {
      /* 이번 장만 건너뛴다 (스트림이 잠깐 끊긴 경우 등) */
    }
  }

  /** 첫 프레임이 왔으면 캔버스 · 녹화기를 만든다 */
  function begin(): void {
    const { naturalWidth, naturalHeight } = img
    if (!naturalWidth || !naturalHeight) return // 아직 첫 프레임 전

    try {
      const { sw } = coverCrop(naturalWidth, naturalHeight, aspect)
      const width = even(Math.min(MAX_WIDTH, sw))
      canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = even(width / aspect)
      ctx = canvas.getContext('2d', { alpha: false })
      if (!ctx) throw new Error('2D 컨텍스트를 만들 수 없습니다')

      // 먼저 한 장 그린다 — 라이브뷰가 교차 출처로 읽혀 캔버스가 잠겼다면
      // 바로 아래 captureStream()이 SecurityError를 던지므로 여기서 걸러진다
      draw()
      stream = canvas.captureStream() // 인자 없음 = 캔버스에 그릴 때마다 한 장 (FPS는 타이머가 정한다)

      recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: BITS_PER_SECOND })
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data)
      }
      recorder.onerror = () => giveUp('MediaRecorder 오류')
      recorder.start(TIMESLICE_MS)

      state = 'recording'
      onStatus?.('recording')
    } catch (e) {
      giveUp(e)
    }
  }

  timer = window.setInterval(() => {
    if (state === 'waiting') begin()
    else if (state === 'recording') draw()
  }, 1000 / FPS)

  function stop(): Promise<Blob | null> {
    if (stopping) return stopping

    const active = recorder
    if (state !== 'recording' || !active) {
      // 첫 프레임이 오기 전이거나 이미 포기했다
      discard()
      stopping = Promise.resolve(null)
      return stopping
    }

    state = 'stopping'
    window.clearInterval(timer)
    stopping = new Promise<Blob | null>((resolve) => {
      let settled = false
      const finish = (blob: Blob | null): void => {
        if (settled) return
        settled = true
        window.clearTimeout(guard)
        state = 'closed'
        chunks = []
        release()
        resolve(blob && blob.size > 0 ? blob : null)
      }
      const guard = window.setTimeout(() => finish(null), STOP_TIMEOUT_MS)

      // 마지막 dataavailable이 stop 이벤트보다 먼저 온다
      active.onstop = () => finish(new Blob(chunks, { type: 'video/webm' }))
      active.onerror = () => finish(null)
      try {
        active.stop()
      } catch {
        finish(null)
      }
    })
    return stopping
  }

  function cancel(): void {
    if (state === 'stopping' || state === 'closed') return
    discard()
  }

  return { stop, cancel }
}
