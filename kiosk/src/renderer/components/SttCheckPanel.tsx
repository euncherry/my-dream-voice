/**
 * components/SttCheckPanel.tsx — D-01 [하드웨어 체크] 받아쓰기 · 인식률 점검 (개발 전용 · ⚠️ 받아쓰기는 아직 MOCK)
 *
 * 근거: PAGE_SPEC §3 D-01 「v2 할 일」 · V2_PLAN §3 D-01 행 · §5 (main/mock/stt.ts)
 *
 * D-01에서 녹음한 WAV 하나를 골라 목표 글자와 함께 메인에 받아쓰기를 요청하고, 돌아온 값을 그대로 보여 준다.
 * 볼 것은 두 가지다.
 *   - 문장당 받아쓰기 시간 (SPEC T-15)
 *   - 인식률(1 − 글자 CER)이 다시 말하기 기준 50%(RETRY_MIN_RECOGNITION)의 어느 쪽인가 (SPEC T-10)
 *
 * ⚠️ 받아쓴 글자 · 인식률 숫자는 **이 개발 화면에서만** 보인다.
 *    손님 화면(P-05 [발화] · P-07 [분석 및 프린트])에는 내보내지 않는다 (CLAUDE.md 금지사항 7 · 9).
 * ⚠️ 무음 검사 · 받아쓰기 · CER 계산은 전부 메인이 한다 — 여기서는 window.api.stt.transcribe 로
 *    요청만 한다 (CLAUDE.md 금지사항 2). 소리는 재생하지 않는다.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { RETRY_MIN_RECOGNITION } from '@shared/constants'
import { scenarioFor } from '@shared/jobs'
import type { MockSttOutcome, SttResult } from '@shared/types'

/**
 * 목표 글자 기본값 — 경찰 · 만 5세 시나리오의 문장 1.
 * SPEC §3-2의 예시 문장이라 확정이 아니다 (T-3). 입력칸에서 바꿔 볼 수 있다.
 */
const DEFAULT_TARGET = scenarioFor('police', '5').turns[0].line.text

/** MOCK 결과 고르기 — 무음은 고르지 않는다 (무음 여부는 실제 녹음을 재서 정한다) */
type MockPick = Exclude<MockSttOutcome, 'silent'>

const MOCK_PICKS: { id: MockPick; label: string }[] = [
  { id: 'pass', label: '통과' },
  { id: 'fail', label: '실패' },
]

const RETRY_PERCENT = Math.round(RETRY_MIN_RECOGNITION * 100)

/** 결과 표에 남기는 줄 수 */
const MAX_ROWS = 20

interface CheckRow {
  id: number
  wavPath: string
  targetText: string
  pick: MockPick
  result: SttResult
  /** 렌더러에서 잰 요청 → 응답 시간 (IPC 왕복 포함) — 아이가 기다리는 시간에 가깝다 */
  roundTripMs: number
}

const fileName = (path: string): string => path.split(/[\\/]/).pop() ?? path

/** 인식률 = 1 − 글자 CER. 무음이라 받아쓰지 않았으면 없다 */
function recognitionOf(result: SttResult): number | undefined {
  if (result.silent || result.cer === undefined) return undefined
  return Math.max(0, 1 - result.cer)
}

/** 0.296 → "29.6%" · 0.3 → "30%" */
const percent = (ratio: number): string => `${Math.round(ratio * 1000) / 10}%`

/** P-05 [발화]라면 이 녹음 뒤에 다시 말하기(1회)를 권하는가 — 기준은 SPEC §2 · T-10 */
function retryText(result: SttResult): string {
  if (result.silent) return '대상 — 무음'
  const recognition = recognitionOf(result)
  if (recognition === undefined) return '—'
  return recognition < RETRY_MIN_RECOGNITION
    ? `대상 — ${RETRY_PERCENT}% 미만`
    : `대상 아님 — ${RETRY_PERCENT}% 이상`
}

export function SttCheckPanel({
  recordings,
  disabled = false,
}: {
  /** D-01에서 녹음한 WAV 경로들 (녹음 순서) */
  recordings: string[]
  /** D-01이 녹음 · 저장 · 청음 중이면 요청을 막는다 — 고른 파일이 아직 쓰이는 중일 수 있다 */
  disabled?: boolean
}): ReactNode {
  const [wavPath, setWavPath] = useState('')
  const [targetText, setTargetText] = useState(DEFAULT_TARGET)
  const [pick, setPick] = useState<MockPick>('pass')
  const [rows, setRows] = useState<CheckRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const nextId = useRef(1)

  // 응답이 오기 전에 화면을 떠나면 결과를 버린다 (StrictMode의 두 번 실행에도 안전하게)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  // 새로 녹음하면 그 파일을 고른다 — 방금 녹음한 것을 바로 확인하는 흐름
  const latest = recordings[recordings.length - 1] ?? ''
  useEffect(() => {
    setWavPath(latest)
  }, [latest])

  const target = targetText.trim()
  const canRun = !disabled && !busy && wavPath !== '' && target !== ''

  async function onTranscribe(): Promise<void> {
    if (!canRun) return
    setBusy(true)
    setError(null)
    const started = performance.now()
    try {
      // MOCK: main/mock/stt.ts — 무음 검사와 CER 계산은 실제, 받아쓰기만 가짜다.
      //       faster-whisper 프로그램이 붙으면 mock 값은 무시되고, 같은 호출로 실제 받아쓰기가 온다.
      const result = await window.api.stt.transcribe({
        wavPath,
        targetText: target,
        mock: { outcome: pick },
      })
      if (!alive.current) return
      const row: CheckRow = {
        id: nextId.current++,
        wavPath,
        targetText: target,
        pick,
        result,
        roundTripMs: Math.round(performance.now() - started),
      }
      setRows((prev) => [row, ...prev].slice(0, MAX_ROWS))
    } catch (e) {
      if (alive.current) setError((e as Error).message)
    } finally {
      if (alive.current) setBusy(false)
    }
  }

  // 문장당 받아쓰기 시간 — 무음은 받아쓰지 않았으므로 평균에서 뺀다
  const timed = rows.filter((r) => !r.result.silent)
  const averageMs = timed.length
    ? Math.round(timed.reduce((sum, r) => sum + r.result.elapsedMs, 0) / timed.length)
    : null

  return (
    <section className="panel">
      <div className="panel__head">
        <strong>받아쓰기 · 인식률 점검</strong>
        <span className="tag">무음 검사 · CER 계산 실측 · 받아쓰기는 MOCK</span>
        {rows.length > 0 && (
          <button className="btn btn--sm btn--ghost" onClick={() => setRows([])} disabled={busy}>
            결과 지우기
          </button>
        )}
      </div>

      <div className="stt__row">
        <label className="stt__field">
          WAV
          <select
            className="sel"
            value={wavPath}
            onChange={(e) => setWavPath(e.target.value)}
            disabled={busy || recordings.length === 0}
          >
            {recordings.map((path) => (
              <option key={path} value={path}>
                {fileName(path)}
              </option>
            ))}
            {recordings.length === 0 && <option value="">녹음 없음 — 위에서 먼저 녹음</option>}
          </select>
        </label>

        <label className="stt__field stt__field--grow">
          목표 글자
          <input
            className="stt__input"
            type="text"
            value={targetText}
            onChange={(e) => setTargetText(e.target.value)}
            disabled={busy}
            spellCheck={false}
          />
        </label>
        <button
          className="btn btn--sm btn--ghost"
          onClick={() => setTargetText(DEFAULT_TARGET)}
          disabled={busy || targetText === DEFAULT_TARGET}
        >
          기본 문장으로
        </button>
      </div>

      <div className="stt__row">
        <span className="stt__field">MOCK 결과</span>
        {MOCK_PICKS.map((p) => (
          <button
            key={p.id}
            className={`btn btn--sm ${pick === p.id ? 'btn--primary' : ''}`}
            onClick={() => setPick(p.id)}
            disabled={busy}
          >
            {p.label}
          </button>
        ))}
        <button className="btn btn--sm btn--primary" onClick={() => void onTranscribe()} disabled={!canRun}>
          받아쓰기
        </button>
        {busy && <span className="hint">받아쓰는 중…</span>}
        {averageMs !== null && (
          <span className="hint">
            문장당 받아쓰기 평균 <b>{averageMs.toLocaleString()}ms</b> (무음 제외 {timed.length}건 · MOCK
            지연 포함)
          </span>
        )}
      </div>

      {error && <p className="err">{error}</p>}

      <table className="tbl tbl--stt">
        <thead>
          <tr>
            <th>파일</th>
            <th>목표 글자</th>
            <th>무음</th>
            <th>받아쓴 글자</th>
            <th>인식률</th>
            <th>다시 말하기 (기준 {RETRY_PERCENT}%)</th>
            <th>걸린 시간</th>
            <th>받아쓰기</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const recognition = recognitionOf(r.result)
            return (
              <tr key={r.id}>
                <td className="mono">{fileName(r.wavPath)}</td>
                <td>{r.targetText}</td>
                <td>{r.result.silent ? '⚠ 무음' : '아님'}</td>
                <td>{r.result.silent ? '— (받아쓰지 않음)' : (r.result.transcript ?? '—')}</td>
                <td className="mono">
                  {recognition === undefined
                    ? '—'
                    : `${percent(recognition)} (CER ${r.result.cer!.toFixed(2)})`}
                </td>
                <td>{retryText(r.result)}</td>
                <td className="mono">
                  {r.result.elapsedMs.toLocaleString()}ms
                  <span className="stt__dim"> · 왕복 {r.roundTripMs.toLocaleString()}ms</span>
                </td>
                <td>
                  {r.result.mock
                    ? `MOCK · ${MOCK_PICKS.find((p) => p.id === r.pick)?.label} 선택`
                    : '실제'}
                </td>
              </tr>
            )
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={8}>아직 없음 — WAV를 고르고 [받아쓰기]</td>
            </tr>
          )}
        </tbody>
      </table>

      <p className="hint">
        ⚠️ <b>받아쓰기는 아직 가짜다</b> — 실제로 하는 것은 무음 검사와 CER 계산뿐이다. MOCK 결과가
        「통과」면 목표 글자를 그대로, 「실패」면 일부만 받아쓴 것처럼 돌려준다 (main/mock/stt.ts).
        <br />
        문장당 받아쓰기 시간(SPEC T-15)과 {RETRY_PERCENT}% 기준 확인(SPEC T-10)은{' '}
        <b>faster-whisper 프로그램이 붙은 뒤에</b> 이 패널로 한다. 지금 보이는 시간은 가짜 지연이다.
        <br />
        받아쓴 글자와 인식률 숫자는 <b>이 개발 화면에서만</b> 보인다 — 손님 화면에는 내보내지 않는다
        (CLAUDE.md 금지사항 7). 목표 글자 기본값은 경찰 · 만 5세 문장 1이다 (SPEC §3-2 예시 — 확정 전 ·
        T-3).
      </p>
    </section>
  )
}
