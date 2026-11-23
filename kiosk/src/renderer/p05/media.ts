/**
 * p05/media.ts — P-05 장면 그림 · 캐릭터 목소리 파일 찾기
 *
 * 파일은 받는 대로 아래 자리에 넣으면 앱을 다시 빌드할 때 저절로 쓰인다 (코드 고칠 것 없음 — assets/p05/README.md).
 *   그림:   assets/p05/scenes/<직업>/<장면 번호>.webp|png|jpg   예) scenes/astronaut/A-03.webp
 *   목소리: assets/p05/voice/<직업>/<대사 이름>.mp3|wav|m4a     예) voice/astronaut/mission.mp3
 * 없으면 — 그림은 장면 번호 + 장면 설명을 적은 임시 판, 목소리는 자막만 글자 수만큼 보여 준다.
 *
 * 빌드할 때 파일 목록을 만든다(import.meta.glob) — 없는 파일을 요청했다가 기다리는 일이 없다.
 */

import type { JobId } from '@shared/types'

const sceneFiles = import.meta.glob<string>('../assets/p05/scenes/*/*.{webp,png,jpg}', {
  eager: true,
  query: '?url',
  import: 'default',
})

const voiceFiles = import.meta.glob<string>('../assets/p05/voice/*/*.{mp3,wav,m4a}', {
  eager: true,
  query: '?url',
  import: 'default',
})

/** '<직업>/<이름>' → 주소 */
function index(files: Record<string, string>): Map<string, string> {
  const map = new Map<string, string>()
  for (const [path, url] of Object.entries(files)) {
    const m = /\/([^/]+)\/([^/]+)\.[a-z0-9]+$/i.exec(path)
    if (m) map.set(`${m[1]}/${m[2]}`, url)
  }
  return map
}

const SCENES = index(sceneFiles)

/**
 * 그림을 불러온다 — decode()는 창이 가려져 있으면 끝나지 않을 수 있어(크로미움이 미룬다) onload를 기다린다.
 * 캔버스에 그려 재는 데는 불러오기만 끝나면 된다.
 */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`그림을 불러오지 못했습니다: ${url}`))
    img.src = url
  })
}
const VOICES = index(voiceFiles)

/** 장면 그림 — 없으면 undefined (임시 판) */
export function sceneUrl(job: JobId, id: string): string | undefined {
  return SCENES.get(`${job}/${id}`)
}

/** 캐릭터 목소리 — 없으면 undefined (자막만) */
export function voiceUrl(job: JobId, key: string): string | undefined {
  return VOICES.get(`${job}/${key}`)
}

/** 그 직업의 그림을 미리 풀어 두고 판의 자리를 재 둔다 — 장면이 넘어갈 때 한 박자 비지 않게 */
export function preloadScenes(job: JobId): void {
  for (const [key, url] of SCENES) {
    if (!key.startsWith(`${job}/`)) continue
    void measurePanel(url).catch(() => undefined)
  }
}

/** 띵 — "마이크가 반짝이고 띵! 하면 말해" 신호에만 쓴다 (public/audio/sfx/ding.wav · 2026-11-23 받은 소리) */
export const DING_URL = './audio/sfx/ding.wav'

// ────────────────────────────────────────────────
// 튀어나오는 그림 — 투명 바탕 위에 둥근 "판"이 있고, 캐릭터 머리 · 로켓 끝이 판 위로 튀어나온 그림 (2026-11-23 A-01)
// 판을 화면의 그림 칸에 맞추고, 튀어나온 부분은 칸 위(흰 카드 안)로 보이게 한다. 판의 자리는 그림을 재서 찾는다.
// 바탕이 투명하지 않은 그림(꽉 찬 그림)은 지금처럼 칸을 꽉 채운다.
// ────────────────────────────────────────────────

/** 그림 안 판의 자리 (그림 원래 크기 px) */
export interface ScenePanel {
  /** 그림 전체 폭 · 높이 */
  width: number
  height: number
  left: number
  right: number
  top: number
  bottom: number
}

/** undefined = 아직 안 잼 · null = 꽉 찬 그림 */
const panels = new Map<string, ScenePanel | null>()

export function panelOf(url: string): ScenePanel | null | undefined {
  return panels.get(url)
}

/** 판의 자리를 잰다 — 작게 줄여 투명도만 본다 (그림마다 한 번) */
export async function measurePanel(url: string): Promise<ScenePanel | null> {
  if (panels.has(url)) return panels.get(url) ?? null
  const img = await loadImage(url)
  const W = img.naturalWidth
  const H = img.naturalHeight
  const sw = 480
  const sh = Math.max(1, Math.round((H * sw) / W))
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  let panel: ScenePanel | null = null
  if (ctx) {
    ctx.canvas.width = sw
    ctx.canvas.height = sh
    ctx.drawImage(img, 0, 0, sw, sh)
    const data = ctx.getImageData(0, 0, sw, sh).data
    const solid = (x: number, y: number): boolean => (data[(y * sw + x) * 4 + 3] ?? 0) > 128
    const cornersSolid = solid(0, 0) && solid(sw - 1, 0) && solid(0, sh - 1) && solid(sw - 1, sh - 1)
    if (!cornersSolid) {
      // 판의 왼쪽 · 오른쪽 — 아래쪽 3/4 높이 줄에서 처음 · 마지막으로 꽉 찬 곳
      const row = Math.round(sh * 0.75)
      let left = 0
      let right = sw - 1
      while (left < sw - 1 && !solid(left, row)) left++
      while (right > 0 && !solid(right, row)) right--
      // 판의 위 · 아래 — 판 안쪽 가장자리(양옆에서 8%) 세로줄. 튀어나온 것이 한쪽에 걸려도 되게 위는 큰 쪽 · 아래는 작은 쪽
      const inset = Math.round((right - left) * 0.08)
      const edge = (x: number): [number, number] => {
        let t = 0
        let b = sh - 1
        while (t < sh - 1 && !solid(x, t)) t++
        while (b > 0 && !solid(x, b)) b--
        return [t, b]
      }
      const [t1, b1] = edge(left + inset)
      const [t2, b2] = edge(right - inset)
      const k = W / sw
      panel = {
        width: W,
        height: H,
        left: left * k,
        right: (right + 1) * k,
        top: Math.max(t1, t2) * k,
        bottom: (Math.min(b1, b2) + 1) * k,
      }
    }
  }
  panels.set(url, panel)
  return panel
}

// ────────────────────────────────────────────────
// 레이어 장면 (2026-11-24) — 배경 판 + 남녀 인물 포즈 그림을 따로 받아 겹친다 (아웃싸운드 탈출기처럼)
//   assets/p05/layers/<직업>/<이름>.webp   예) layers/astronaut/bg-moon.webp · girl-idle.webp · boy-hips.webp
// 배경은 튀어나오는 그림과 같은 규격(투명 바탕 위 판) — measurePanel로 판을 잰다.
// 인물은 바탕이 투명하면 캔버스 크기가 제각각이어도 된다 — measureSprite로 몸의 테두리 · 헬멧 가운데를 잰다.
// ────────────────────────────────────────────────

const layerFiles = import.meta.glob<string>('../assets/p05/layers/*/*.{webp,png}', {
  eager: true,
  query: '?url',
  import: 'default',
})

const LAYERS = index(layerFiles)

export function layerUrl(job: JobId, name: string): string | undefined {
  return LAYERS.get(`${job}/${name}`)
}

/** 인물 그림 안 몸의 자리 (그림 원래 크기 px) */
export interface SpriteBox {
  width: number
  height: number
  /** 몸 테두리 — 헬멧 꼭대기 ~ 발끝 */
  top: number
  bottom: number
  /** 머리(헬멧) 가운데 x — 포즈마다 팔이 달라도 머리를 기준으로 세우면 인물이 옆으로 흔들리지 않는다 */
  headCx: number
}

const sprites = new Map<string, SpriteBox>()

export function spriteOf(url: string): SpriteBox | undefined {
  return sprites.get(url)
}

export async function measureSprite(url: string): Promise<SpriteBox> {
  const known = sprites.get(url)
  if (known) return known
  const img = await loadImage(url)
  const W = img.naturalWidth
  const H = img.naturalHeight
  const sw = 300
  const sh = Math.max(1, Math.round((H * sw) / W))
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  let box: SpriteBox = { width: W, height: H, top: 0, bottom: H, headCx: W / 2 }
  if (ctx) {
    ctx.canvas.width = sw
    ctx.canvas.height = sh
    ctx.drawImage(img, 0, 0, sw, sh)
    const data = ctx.getImageData(0, 0, sw, sh).data
    const solid = (x: number, y: number): boolean => (data[(y * sw + x) * 4 + 3] ?? 0) > 128
    const rowHas = (y: number): boolean => {
      for (let x = 0; x < sw; x++) if (solid(x, y)) return true
      return false
    }
    let t = 0
    let b = sh - 1
    while (t < sh - 1 && !rowHas(t)) t++
    while (b > t && !rowHas(b)) b--
    // 머리 = 몸 위쪽 30% — 그 안에서 불투명한 곳의 가운데
    const headEnd = t + Math.round((b - t) * 0.3)
    let minX = sw
    let maxX = 0
    for (let y = t; y <= headEnd; y++) {
      for (let x = 0; x < sw; x++) {
        if (!solid(x, y)) continue
        if (x < minX) minX = x
        if (x > maxX) maxX = x
      }
    }
    const k = W / sw
    box = {
      width: W,
      height: H,
      top: t * k,
      bottom: (b + 1) * k,
      headCx: minX <= maxX ? ((minX + maxX + 1) / 2) * k : W / 2,
    }
  }
  sprites.set(url, box)
  return box
}

/** 그 직업의 레이어 그림을 미리 풀어 두고 재 둔다 — 다 재면 풀린다 (실패한 그림은 건너뛴다) */
export async function preloadLayers(job: JobId): Promise<void> {
  const work: Promise<unknown>[] = []
  for (const [key, url] of LAYERS) {
    if (!key.startsWith(`${job}/`)) continue
    const name = key.slice(job.length + 1)
    work.push((name.startsWith('bg') ? measurePanel(url) : measureSprite(url)).catch(() => undefined))
  }
  await Promise.all(work)
}
