/**
 * fx/clickFx.ts — 화면을 누르면 그 자리에서 반짝 터지는 효과 (MY DREAM VOICE 클릭 효과 6번 · 최종 구성)
 *
 * 디자이너가 준 click-fx.js(2026-11-24)를 TypeScript 모듈로 옮겼다 — 움직임 · 크기 · 색은 그대로다.
 * 켜진 레이어: 반짝 · 번쩍 · 링 · 빛 번짐 · 빛 점 (그리는 순서 뒤 → 앞)
 *
 * main.tsx 가 앱 시작 때 한 번 initClickFx() 를 부른다 — 화면 어디를 눌러도 터진다.
 * 효과 레이어는 클릭을 통과시키므로(pointer-events: none) 버튼 동작에 끼어들지 않는다.
 * 소리는 없다 (P-05 녹음 중에도 마이크에 섞일 것이 없다).
 *
 * 다른 점 두 가지:
 *  - 크기 배율: 기준이 1920×1080 이라 창 크기에 맞춰 Stage 와 같은 배율을 쓴다 (키오스크 전체 화면 = 1).
 *  - Windows '애니메이션 표시' 끔(prefers-reduced-motion)이어도 켠다 — 키오스크 PC는 그 설정이 꺼져 있는 일이 많다.
 */

import { STAGE_SIZE } from '../components/Stage'

type LayerKey = 'glow' | 'ring' | 'flash' | 'dots' | 'sparkles'

/** 그리는 순서 (뒤 → 앞) */
const ALL_LAYERS: readonly LayerKey[] = ['glow', 'ring', 'flash', 'dots', 'sparkles']
/** 순간적으로 튀어나가는 곡선 */
const POP = 'cubic-bezier(.12,.9,.3,1)'
const SPARK =
  'M12 0C12.9 7.6 16.4 11.1 24 12 16.4 12.9 12.9 16.4 12 24 11.1 16.4 7.6 12.9 0 12 7.6 11.1 11.1 7.6 12 0Z'
const SPARK_FILLS = ['#ffffff', '#fff3a6', '#ffffff', '#d4efff', '#ffffff', '#ffe08a']
const rand = (a: number, b: number): number => a + Math.random() * (b - a)

export interface ClickFx {
  /** 원하는 위치(화면 px)에서 직접 터뜨리기 */
  burst(x: number, y: number): void
  setLayers(list: LayerKey[]): void
  destroy(): void
}

export interface ClickFxOptions {
  /** 클릭을 감지할 대상 (기본 window) */
  target?: Window | HTMLElement
  layers?: readonly LayerKey[]
  /** 크기 배율 (기본: 창 크기 ÷ 1920×1080 — Stage 와 같은 배율) */
  scale?: number | (() => number)
  zIndex?: number
  /** OS '동작 줄이기' 설정 시 효과 끄기 (기본 false — 키오스크에서는 늘 켠다) */
  respectReducedMotion?: boolean
}

const stageScale = (): number =>
  Math.min(window.innerWidth / STAGE_SIZE.width, window.innerHeight / STAGE_SIZE.height)

let current: ClickFx | null = null

export function initClickFx(options: ClickFxOptions = {}): ClickFx {
  // 한 번만 — HMR로 다시 불려도 레이어가 겹치지 않게
  current?.destroy()

  const opt = {
    target: window as Window | HTMLElement,
    layers: ALL_LAYERS,
    scale: stageScale as number | (() => number),
    zIndex: 9999,
    respectReducedMotion: false,
    ...options,
  }
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  let enabled = new Set<LayerKey>(opt.layers)

  // 효과가 그려질 전체 화면 레이어 (클릭은 통과)
  const layer = document.createElement('div')
  layer.className = 'click-fx'
  layer.setAttribute('aria-hidden', 'true')
  Object.assign(layer.style, {
    position: 'fixed',
    inset: '0',
    pointerEvents: 'none',
    overflow: 'hidden',
    zIndex: String(opt.zIndex),
  })
  document.body.appendChild(layer)

  const getScale = (): number => (typeof opt.scale === 'function' ? opt.scale() : opt.scale)

  /** (x, y)가 중심이 되도록 파티클 생성 */
  function spawn(
    x: number,
    y: number,
    size: number,
    inner: string | Partial<CSSStyleDeclaration>,
    round = false,
  ): HTMLDivElement {
    const el = document.createElement('div')
    Object.assign(el.style, {
      position: 'absolute',
      pointerEvents: 'none',
      willChange: 'transform, opacity',
      width: size + 'px',
      height: size + 'px',
      left: x - size / 2 + 'px',
      top: y - size / 2 + 'px',
    })
    if (round) el.style.borderRadius = '50%'
    if (typeof inner === 'string') el.innerHTML = inner
    else Object.assign(el.style, inner)
    layer.appendChild(el)
    return el
  }

  function play(el: HTMLElement, frames: Keyframe[], timing: KeyframeAnimationOptions): void {
    const anim = el.animate(frames, { fill: 'forwards', ...timing })
    anim.onfinish = () => el.remove()
    anim.oncancel = () => el.remove()
  }

  const LAYERS: Record<LayerKey, (x: number, y: number, S: number) => void> = {
    /* 빛 번짐 — 가운데 은은한 빛 */
    glow(x, y, S) {
      play(
        spawn(
          x,
          y,
          200 * S,
          {
            background:
              'radial-gradient(circle, rgba(255,255,255,.95), rgba(210,238,255,.35) 45%, rgba(255,255,255,0) 70%)',
          },
          true,
        ),
        [
          { transform: 'scale(.3)', opacity: 1 },
          { transform: 'scale(1.4)', opacity: 0 },
        ],
        { duration: 420, easing: 'ease-out' },
      )
    },

    /* 링 — 하얀 링이 퍼짐 */
    ring(x, y, S) {
      play(
        spawn(
          x,
          y,
          180 * S,
          {
            border: `${5 * S}px solid #fff`,
            boxShadow: `0 0 0 ${2 * S}px rgba(80,160,255,.3)`,
            boxSizing: 'border-box',
          },
          true,
        ),
        [
          { transform: 'scale(.2)', opacity: 1 },
          { transform: 'scale(1.45)', opacity: 0 },
        ],
        { duration: 480, easing: POP },
      )
    },

    /* 번쩍 — 가운데 하얀 빛살 8개 */
    flash(x, y, S) {
      const rays = Array.from({ length: 8 }, (_, i) => {
        const len = i % 2 ? rand(14, 20) : rand(24, 32)
        return `<line x1="0" y1="-4" x2="0" y2="${-len}" transform="rotate(${i * 45})" stroke="#fff" stroke-width="${i % 2 ? 2.4 : 3.4}" stroke-linecap="round"/>`
      }).join('')
      const el = spawn(
        x,
        y,
        80 * S,
        `<svg viewBox="-40 -40 80 80" width="100%" height="100%" style="display:block;overflow:visible">${rays}<circle r="5" fill="#fff"/></svg>`,
      )
      el.style.filter = `drop-shadow(0 0 ${6 * S}px rgba(255,255,255,1)) drop-shadow(0 0 ${12 * S}px rgba(150,205,255,.9))`
      play(
        el,
        [
          { transform: 'scale(.3) rotate(0deg)', opacity: 1 },
          { transform: 'scale(1.15) rotate(15deg)', opacity: 1, offset: 0.35 },
          { transform: 'scale(1.5) rotate(25deg)', opacity: 0 },
        ],
        { duration: 320, easing: 'ease-out' },
      )
    },

    /* 빛 점 — 작은 하얀 점 8개 */
    dots(x, y, S) {
      for (let i = 0; i < 8; i++) {
        const a = rand(0, Math.PI * 2)
        const d = rand(80, 200) * S
        const el = spawn(x, y, rand(8, 13) * S, { background: '#fff', boxShadow: `0 0 ${8 * S}px #fff` }, true)
        play(
          el,
          [
            { transform: 'translate(0,0) scale(0)', opacity: 1, easing: POP },
            {
              transform: `translate(${Math.cos(a) * d * 0.85}px,${Math.sin(a) * d * 0.85}px) scale(1)`,
              opacity: 1,
              offset: 0.4,
            },
            { transform: `translate(${Math.cos(a) * d}px,${Math.sin(a) * d}px) scale(0)`, opacity: 0 },
          ],
          { duration: 700 },
        )
      }
    },

    /* 반짝 — ✦ 반짝이 6개가 원형으로 튀어나감 */
    sparkles(x, y, S) {
      for (let i = 0; i < 6; i++) {
        const a = ((i + 0.5) / 6) * Math.PI * 2 + rand(-0.1, 0.1)
        const d = rand(125, 160) * S
        const size = rand(34, 50) * S
        const dx = Math.cos(a) * d
        const dy = Math.sin(a) * d
        const el = spawn(
          x,
          y,
          size,
          `<svg viewBox="0 0 24 24" width="100%" height="100%" style="display:block;overflow:visible"><path d="${SPARK}" fill="${SPARK_FILLS[i]}"/></svg>`,
        )
        el.style.filter = `drop-shadow(0 0 ${6 * S}px rgba(255,255,255,.95)) drop-shadow(0 ${S}px ${3 * S}px rgba(255,170,0,.3))`
        // 한 번에 튀어나가서 → 멈칫 없이 작아지며 사라짐
        play(
          el,
          [
            { transform: 'translate(0,0) scale(.3) rotate(0deg)', opacity: 1, easing: POP },
            {
              transform: `translate(${dx * 0.88}px,${dy * 0.88}px) scale(1.1) rotate(27deg)`,
              opacity: 1,
              offset: 0.38,
              easing: 'cubic-bezier(.4,0,.7,1)',
            },
            { transform: `translate(${dx}px,${dy}px) scale(0) rotate(45deg)`, opacity: 0.7 },
          ],
          { duration: 820 },
        )
      }
    },
  }

  /** 켜진 레이어를 같은 순간에 모두 실행 */
  function burst(x: number, y: number): void {
    if (opt.respectReducedMotion && reduceMotion.matches) return
    const S = getScale()
    ALL_LAYERS.forEach((key) => {
      if (enabled.has(key)) LAYERS[key](x, y, S)
    })
  }

  const onPointerDown = (e: Event): void => {
    const p = e as PointerEvent
    burst(p.clientX, p.clientY)
  }
  opt.target.addEventListener('pointerdown', onPointerDown)

  const api: ClickFx = {
    burst,
    setLayers(list) {
      enabled = new Set(list)
    },
    destroy() {
      opt.target.removeEventListener('pointerdown', onPointerDown)
      layer.remove()
      if (current === api) current = null
    },
  }
  current = api
  return api
}
