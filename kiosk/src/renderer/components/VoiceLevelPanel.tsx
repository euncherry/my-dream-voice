/**
 * components/VoiceLevelPanel.tsx — D-01 [하드웨어 체크] 목소리 크기 재기 (개발 · 설치 점검용)
 *
 * 근거: docs/P05_SCENARIO.md §0 「연습 반응」 — "준비 완료!" 연습은 **목소리 크기로만** 반응한다 (크게 / 작게 / 무음).
 * 그 기준(shared/constants.ts의 VOICE_START_DB · VOICE_LOUD_DB)은 마이크 자리 · 아이가 서는 거리 · 주변 소음에 따라 달라서
 * 미리 정할 수 없다 → 키오스크에서 이 칸으로 실제 목소리를 재 보고 맞춘다.
 *
 * 보는 것
 *   - 지금 소리 크기 (dBFS — 마이크가 받을 수 있는 가장 큰 소리 = 0, 작을수록 음수. 소음계의 dB와는 다른 숫자다)
 *   - 조용할 때 바닥 (최근 3초 중 작은 쪽) — VOICE_START_DB가 이보다 넉넉히 커야 주변 소음을 말소리로 잘못 알지 않는다
 *   - [말해 보기] — P-05 연습과 **똑같이** 녹음해서(조용해지면 끝 · 최대 4초) 가장 큰 소리와 판단(크게 / 작게 / 무음)을 보여 준다
 *
 * P-05와 같이 **기본 마이크**를 쓴다 (V2_BUILD_CHECKLIST 결정 ④ — 마이크 고정은 아직). 녹음은 저장하지 않는다.
 * ⚠️ 숫자는 이 개발 화면에서만 보인다 — 아이 화면(P-05)에는 내보내지 않는다 (CLAUDE.md 금지사항 7).
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { RECORD_MAX_WORD_MS, VOICE_LOUD_DB, VOICE_START_DB } from '@shared/constants'
import { FLOOR_DB, VoiceRecorder } from '../p05/voiceRecorder'

/** 막대가 보여 주는 범위 */
const BAR_MIN_DB = -80

interface Trial {
  at: string
  voiced: boolean
  peakDb: number
  sec: number
  end: string
}

function judge(t: Trial): string {
  if (!t.voiced) return '무음 → "아직 못 들었나 봐" · 한 번 더'
  return t.peakDb >= VOICE_LOUD_DB ? '크게 → 칭찬' : '작게 → "너~무 멀리 있나 봐"'
}

function pct(db: number): number {
  return Math.max(0, Math.min(100, ((db - BAR_MIN_DB) / -BAR_MIN_DB) * 100))
}

export function VoiceLevelPanel({ disabled }: { disabled?: boolean }): ReactNode {
  const recRef = useRef<VoiceRecorder | null>(null)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(FLOOR_DB)
  const [floor, setFloor] = useState(FLOOR_DB)
  const [trying, setTrying] = useState(false)
  const [trials, setTrials] = useState<Trial[]>([])
  const historyRef = useRef<number[]>([])

  useEffect(() => () => recRef.current?.close(), [])

  // 마이크가 열려 있는 동안 소리 크기를 잰다 (10번/초)
  useEffect(() => {
    if (!open) return
    const id = window.setInterval(() => {
      const db = recRef.current?.levelDb() ?? FLOOR_DB
      setNow(db)
      const h = historyRef.current
      h.push(db)
      if (h.length > 30) h.shift()
      // 최근 3초 중 아래쪽 20% — 말소리가 섞여도 바닥 소음에 가깝게
      const sorted = [...h].sort((a, b) => a - b)
      setFloor(sorted[Math.floor(sorted.length * 0.2)] ?? FLOOR_DB)
    }, 100)
    return () => window.clearInterval(id)
  }, [open])

  async function toggle(): Promise<void> {
    setError(null)
    if (open) {
      recRef.current?.close()
      recRef.current = null
      historyRef.current = []
      setOpen(false)
      setNow(FLOOR_DB)
      return
    }
    const rec = new VoiceRecorder()
    try {
      await rec.open()
      recRef.current = rec
      setOpen(true)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function tryVoice(): Promise<void> {
    const rec = recRef.current
    if (!rec || trying) return
    setTrying(true)
    try {
      const started = performance.now()
      const r = await rec.record({ maxMs: RECORD_MAX_WORD_MS })
      // 녹음은 저장하지 않는다 — 크기만 본다
      setTrials((list) =>
        [
          {
            at: new Date().toLocaleTimeString('ko-KR'),
            voiced: r.voiced,
            peakDb: r.peakDb,
            sec: (performance.now() - started) / 1000,
            end: r.end === 'silence' ? '조용해져서' : r.end === 'max' ? '최대 시간' : '멈춤',
          },
          ...list,
        ].slice(0, 10),
      )
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setTrying(false)
    }
  }

  return (
    <section className="panel">
      <div className="panel__head">
        <strong>목소리 크기 재기 — P-05 "준비 완료!" 연습 기준 맞추기</strong>
      </div>

      <div className="row" style={{ justifyContent: 'flex-start' }}>
        <button className={`btn ${open ? 'btn--danger' : 'btn--primary'}`} onClick={() => void toggle()} disabled={disabled || trying}>
          {open ? '■ 마이크 닫기' : '● 마이크 열기 (기본 마이크)'}
        </button>
        <button className="btn" onClick={() => void tryVoice()} disabled={!open || trying}>
          {trying ? '말해 보세요… (조용해지면 끝)' : '🎤 말해 보기 (P-05와 똑같이)'}
        </button>
      </div>

      {error && <p className="err">{error}</p>}

      <div className="meter" style={{ position: 'relative' }}>
        <div className="meter__fill" style={{ width: `${pct(now)}%` }} />
        {/* 기준선 — 말소리 시작 · 크게 */}
        <i style={{ position: 'absolute', top: 0, bottom: 0, left: `${pct(VOICE_START_DB)}%`, width: 2, background: '#f5c542' }} />
        <i style={{ position: 'absolute', top: 0, bottom: 0, left: `${pct(VOICE_LOUD_DB)}%`, width: 2, background: '#ff6a4e' }} />
      </div>

      <dl className="kv">
        <dt>지금 소리</dt>
        <dd className="mono">{open ? `${now.toFixed(1)} dBFS` : '—'}</dd>
        <dt>조용할 때 바닥 (최근 3초)</dt>
        <dd className="mono">{open ? `${floor.toFixed(1)} dBFS` : '—'}</dd>
        <dt>기준 (shared/constants.ts)</dt>
        <dd className="mono">
          말소리 시작 VOICE_START_DB = {VOICE_START_DB} (노란 선) · 크게 VOICE_LOUD_DB = {VOICE_LOUD_DB} (빨간 선)
        </dd>
      </dl>

      <table className="tbl">
        <thead>
          <tr>
            <th>시각</th>
            <th>말소리</th>
            <th>가장 큰 소리</th>
            <th>길이</th>
            <th>끝난 까닭</th>
            <th>P-05 연습이라면</th>
          </tr>
        </thead>
        <tbody>
          {trials.map((t, i) => (
            <tr key={`${t.at}-${i}`}>
              <td className="mono">{t.at}</td>
              <td>{t.voiced ? '있음' : '없음'}</td>
              <td className="mono">{t.peakDb.toFixed(1)} dBFS</td>
              <td className="mono">{t.sec.toFixed(1)}s</td>
              <td>{t.end}</td>
              <td>{judge(t)}</td>
            </tr>
          ))}
          {trials.length === 0 && (
            <tr>
              <td colSpan={6}>아직 없음 — [마이크 열기] 뒤 [말해 보기]</td>
            </tr>
          )}
        </tbody>
      </table>

      <p className="hint">
        맞추는 법: ① 아무도 말하지 않을 때 <b>바닥</b>을 본다 — 말소리 시작(노란 선)은 바닥보다 10 dB 넘게 커야 한다.
        ② 아이가 서는 자리에서 보통 목소리 · 작은 목소리로 "준비 완료!"를 여러 번 말해 본다 — 크게(빨간 선)는 두 목소리의
        <b> 가장 큰 소리</b> 사이에 둔다. 숫자는 <code>shared/constants.ts</code>에서 고친다. 녹음은 저장하지 않는다.
      </p>
    </section>
  )
}
