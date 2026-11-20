/**
 * P-04 [직업 선택] — A · B 공통
 *
 * 근거: PAGE_SPEC §3 P-04 · SPEC §5 (직업 6종) · 구성 스케치 p04-job
 * 목적: 6종 중 아이가 직접 1개를 고른다 — 프레임 그림을 보고 고른다
 * 쓰기: session.job (1개 — 다른 카드를 누르면 바뀐다)
 * 액션: 카드 터치 = 선택 → [다음] → A는 P-06[촬영] · B는 P-05[발화]
 *       [뒤로] → A는 P-01[모드 선택] · B는 P-03[연령 선택]
 *
 * 직업은 역할놀이 소재다 — 어떤 직업을 권하거나 골라 주지 않는다 (v2).
 * ⚠️ 직업 프레임 아트 6종은 미제작 — 카드 그림은 FramePreview가 임시 프레임으로 그린다.
 */

import type { CSSProperties, ReactNode } from 'react'
import { FOURCUT } from '@shared/constants'
import { JOBS } from '@shared/jobs'
import { PlaceholderTag, Screen } from '../components/Screen'
import { FramePreview } from '../photo/FramePreview'
import { useSession } from '../store/session'
import '../styles/select.css'

/**
 * 프레임 비율(가로 네컷)은 constants.ts가 단일 소스다.
 * CSS(select.css)가 이 값으로 카드 크기를 계산한다 — 칸 높이가 모자라면 그림 너비를 줄인다.
 */
const GRID_STYLE = { '--p04-ratio': String(FOURCUT.width / FOURCUT.height) } as CSSProperties

export function P04JobSelect(): ReactNode {
  const job = useSession((s) => s.session.job)
  const mode = useSession((s) => s.session.mode)
  const setJob = useSession((s) => s.setJob)
  const next = useSession((s) => s.next)
  const back = useSession((s) => s.back)

  return (
    <Screen
      id="P-04"
      note={`6개 중 1개 · [다음] → ${mode === 'B' ? 'P-05[발화]' : 'P-06[촬영]'}`}
      onBack={back}
    >
      <div className="pick">
        <header className="pick__head">
          <h1 className="screen__title">어떤 직업이 되어 볼까요?</h1>
          <p className="screen__sub">사진 프레임을 하나 골라 주세요</p>
        </header>

        <div className="p04-grid" style={GRID_STYLE}>
          {JOBS.map((def) => {
            const picked = job === def.id
            return (
              <div key={def.id} className="p04-cell">
                <button
                  type="button"
                  className="btn pick-choice p04-card"
                  aria-pressed={picked}
                  data-picked={picked}
                  onClick={() => setJob(def.id)}
                >
                  {/* 카드 그림 = 그 직업의 네컷 프레임 */}
                  <span className="p04-card__art">
                    <FramePreview job={def.id} />
                  </span>
                  <span className="p04-card__name">{def.label}</span>
                  {picked && (
                    <span className="p04-card__check" aria-hidden="true">
                      ✓
                    </span>
                  )}
                </button>
              </div>
            )
          })}
        </div>

        <footer className="pick__foot pick__foot--end">
          <PlaceholderTag label="직업 프레임 아트 6종 미제작" />
          <button
            type="button"
            className="btn btn--primary pick-go"
            disabled={!job}
            onClick={() => next()}
          >
            다음
          </button>
        </footer>
      </div>
    </Screen>
  )
}
