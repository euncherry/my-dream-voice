/**
 * photo/FramePreview.tsx — 직업 프레임 미리보기
 *
 * 쓰는 곳: P-04 [직업 선택] 카드 그림 · P-06 [촬영] 옆 패널 (지금 찍는 칸 표시 · 찍은 칸 채워짐)
 * 근거: PAGE_SPEC P-04 · P-06 · SPEC §4-1 · 구성 스케치 docs/user-flow/wf/p04-job.svg · print.svg
 *
 * 인쇄되는 네컷(photo/composeFourCut.ts)을 화면에 작게 옮긴 것이다 — 캔버스가 아니라 DOM/CSS 로 그린다.
 * 칸 · 띠 위치는 FOURCUT 좌표를 % 로 바꿔 놓으므로 좌표를 다시 적지 않는다.
 *
 * 프레임 아트(public/frames/<jobId>.png — 직업마다 어느 파일인지는 composeFourCut.ts 의 FRAME_FILE · 2026-11-23 직업별 6장)가
 * 있으면 사진 위에 얹고,
 * 없으면 composeFourCut 의 PLACEHOLDER 프레임과 같은 모양(직업 색 + 띠 글자)으로 그린다.
 *
 * ⚠️ 색 · 글꼴은 임시다 — 프레임 아트가 오면 placeholder 쪽은 쓰이지 않는다.
 */

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { FOURCUT, type Rect } from '@shared/constants'
import { JOB_BY_ID, jobLabel } from '@shared/jobs'
import type { JobId } from '@shared/types'
import { PLACEHOLDER_FRAME_COPY, loadFrameArt, peekFrameArt } from './composeFourCut'
import '../styles/frame.css'

const pct = (value: number, of: number): string => `${(value / of) * 100}%`

/** FOURCUT 좌표(px) → 프레임 기준 % */
function place(rect: Rect): CSSProperties {
  return {
    left: pct(rect.x, FOURCUT.width),
    top: pct(rect.y, FOURCUT.height),
    width: pct(rect.width, FOURCUT.width),
    height: pct(rect.height, FOURCUT.height),
  }
}

const FRAME_RATIO = `${FOURCUT.width} / ${FOURCUT.height}`
const CELL_STYLES: CSSProperties[] = FOURCUT.cells.map(place)
const STRIP_STYLE: CSSProperties = place(FOURCUT.strip)

export function FramePreview({
  job,
  shots,
  activeCell,
  className,
}: {
  job: JobId
  /** 칸에 채울 사진 URL (없으면 빈 칸) */
  shots?: (string | undefined)[]
  /** 지금 찍는 칸(0~3) 강조 */
  activeCell?: number
  className?: string
}): ReactNode {
  // 프레임 아트가 있는지 불러 본 결과 — 직업이 바뀌면 그 직업 것으로 다시 본다
  const [loaded, setLoaded] = useState<{ job: JobId; art: HTMLImageElement | null } | null>(null)

  useEffect(() => {
    let cancelled = false
    void loadFrameArt(job).then((art) => {
      if (!cancelled) setLoaded({ job, art })
    })
    return () => {
      cancelled = true
    }
  }, [job])

  // undefined = 아직 확인 전 (한 번 확인한 직업은 peekFrameArt 로 첫 그림부터 맞게 나온다)
  const art = loaded?.job === job ? loaded.art : peekFrameArt(job)
  const kind = art === undefined ? 'pending' : art ? 'art' : 'placeholder'
  const activeStyle = activeCell === undefined ? undefined : CELL_STYLES[activeCell]

  const style = {
    aspectRatio: FRAME_RATIO,
    '--frame-color': JOB_BY_ID[job]?.placeholderColor,
  } as CSSProperties

  return (
    <div
      className={className ? `frame ${className}` : 'frame'}
      data-frame={kind}
      role="img"
      aria-label={`${jobLabel(job)} 프레임`}
      style={style}
    >
      {CELL_STYLES.map((cellStyle, i) => {
        const shot = shots?.[i]
        return (
          <div key={i} className="frame__cell" style={cellStyle}>
            {shot ? (
              // 인쇄물과 같게 — 좌우 반전하지 않는다
              <img className="frame__shot" src={shot} alt="" draggable={false} />
            ) : (
              <span className="frame__num">{i + 1}</span>
            )}
          </div>
        )
      })}

      {art && <img className="frame__art" src={art.src} alt="" draggable={false} />}

      {art === null && (
        // PLACEHOLDER 프레임 — 아트가 없을 때만. composeFourCut.drawPlaceholderFrame 과 같은 구성
        <div className="frame__strip" style={STRIP_STYLE}>
          <div className="frame__strip-in">
            <span className="frame__brand">
              {PLACEHOLDER_FRAME_COPY.brand.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </span>
            <span className="frame__job">{jobLabel(job)}</span>
            <span className="frame__mark">{PLACEHOLDER_FRAME_COPY.mark}</span>
          </div>
        </div>
      )}

      {activeStyle && <div className="frame__active" style={activeStyle} />}
    </div>
  )
}
