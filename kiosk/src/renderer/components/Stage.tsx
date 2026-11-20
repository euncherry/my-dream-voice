/**
 * components/Stage.tsx — 디자인을 입힌 화면의 틀 (1920×1080 기준)
 *
 * 디자인 시안은 1920×1080이다 (SPEC T-2 — 가로 고정). 디자인을 입힌 화면은 그 좌표 그대로 그리고,
 * 창 크기에 맞춰 **통째로** 줄이거나 늘린다 — 키오스크(1920×1080 전체 화면)에서는 1:1, 개발 창에서는 축소.
 * 화면 비율이 다르면 남는 띠에는 바깥 배경(background)이 이어져 보인다.
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
  const [scale, setScale] = useState(1)

  useLayoutEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    const fit = (): void => {
      const next = Math.min(
        frame.clientWidth / STAGE_SIZE.width,
        frame.clientHeight / STAGE_SIZE.height,
      )
      if (next > 0) setScale(next)
    }
    fit()
    const observer = new ResizeObserver(fit)
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
        style={{ transform: `translate(-50%, -50%) scale(${scale})` }}
      >
        {children}
      </div>
    </div>
  )
}
