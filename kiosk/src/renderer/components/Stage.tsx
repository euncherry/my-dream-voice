/**
 * components/Stage.tsx — 디자인을 입힌 화면의 틀 (1920×1080 기준)
 *
 * 디자인 시안은 1920×1080이다 (SPEC T-2 — 가로 고정). 디자인을 입힌 화면은 그 좌표 그대로 그리고,
 * 창 크기에 맞춰 **통째로** 줄이거나 늘린다 — 키오스크(1920×1080 전체 화면)에서는 1:1, 개발 창에서는 축소.
 * 화면 비율이 다르면 남는 띠에는 바깥 배경(background)이 이어져 보인다.
 * 그 띠의 두께(도화지 px)는 CSS 변수 `--stage-gap-x`(왼쪽 · 오른쪽 띠 하나) · `--stage-gap-y`(위 · 아래 띠 하나)로 안쪽에 알려 준다 —
 * 발밑 구름처럼 창 가장자리에 붙어야 하는 것이 그만큼 밀려 나간다 (2026-11-27 — 개발 창에서 구름이 바닥에서 떠 보였다)
 *
 * 안쪽 요소는 1920×1080 px 좌표로 배치한다 (position: absolute · px 단위).
 */

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

export const STAGE_SIZE = { width: 1920, height: 1080 } as const

export function Stage({
  children,
  background,
  className,
}: {
  children: ReactNode
  /** 창 전체를 덮는 배경 그림 (cover) */
  background?: string
  className?: string
}): ReactNode {
  const frameRef = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState({ scale: 1, gapX: 0, gapY: 0 })

  useLayoutEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    const measure = (): void => {
      const w = frame.clientWidth
      const h = frame.clientHeight
      const scale = Math.min(w / STAGE_SIZE.width, h / STAGE_SIZE.height)
      if (scale <= 0) return
      setFit({
        scale,
        gapX: Math.max(0, (w / scale - STAGE_SIZE.width) / 2),
        gapY: Math.max(0, (h / scale - STAGE_SIZE.height) / 2),
      })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(frame)
    return () => observer.disconnect()
  }, [])

  const frameStyle: CSSProperties | undefined = background
    ? { backgroundImage: `url(${background})` }
    : undefined

  return (
    <div ref={frameRef} className={`stage${className ? ` ${className}` : ''}`} style={frameStyle}>
      <div
        className="stage__canvas"
        style={
          {
            transform: `translate(-50%, -50%) scale(${fit.scale})`,
            '--stage-gap-x': `${fit.gapX}px`,
            '--stage-gap-y': `${fit.gapY}px`,
          } as CSSProperties
        }
      >
        {children}
      </div>
    </div>
  )
}
