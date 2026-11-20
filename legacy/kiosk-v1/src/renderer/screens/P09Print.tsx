/**
 * P-09 [인쇄] 🟢 — 스파이크 ⑤ 🔴 최대 리스크
 *
 * 여기서 하는 일
 *   1) 네컷 PNG → 4×6 풀블리드 PDF 생성 (규격은 main/pdf.ts가 확정)
 *   2) B모드면 보호자 리포트 PDF도 생성 (PAGE_SPEC: reportPdf는 P-09 이전 생성)
 *   3) pdf-to-printer 사일런트 인쇄
 *
 * ⚠️ 운영 플로우에서는 이 화면이 자동으로 인쇄한다.
 *    스파이크에서는 종이를 낭비하지 않도록 [인쇄] 버튼을 명시적으로 눌러 실행한다.
 * ⚠️ 인쇄 실패 시 앱이 죽지 않고 M-02로 안내한 뒤 P-10으로 계속 진행한다.
 */

import { useEffect, useState, type ReactNode } from 'react'
import { Screen } from '../components/Screen'
import { useSession } from '../store/session'
import { PLACE } from '@shared/constants'
import type { PrinterInfo, SessionResult } from '@shared/types'

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export function P09Print(): ReactNode {
  const session = useSession((s) => s.session)
  const patch = useSession((s) => s.patch)
  const next = useSession((s) => s.next)
  const setFallback = useSession((s) => s.setFallback)
  const startUpload = useSession((s) => s.startUpload)
  const uploadState = useSession((s) => s.uploadState)

  const [printers, setPrinters] = useState<PrinterInfo[]>([])
  const [printer, setPrinter] = useState<string>('')
  const [log, setLog] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const say = (line: string): void => setLog((l) => [...l, line])

  useEffect(() => {
    void window.api.system.listPrinters().then((list) => {
      setPrinters(list)
      setPrinter(list.find((p) => p.isDefault)?.name ?? list[0]?.name ?? '')
    })
  }, [])

  // 산출물 생성은 자동 (인쇄만 수동)
  useEffect(() => {
    if (!session.sessionId) return
    void (async () => {
      setBusy(true)
      try {
        if (session.composedPhoto && !session.photoPdf) {
          const pdf = await window.api.photo.renderPdf({
            sessionId: session.sessionId!,
            imagePath: session.composedPhoto,
          })
          patch({ photoPdf: pdf.path })
          say(`네컷 PDF 생성 (4×6) — ${pdf.bytes.toLocaleString()} bytes`)
        }

        if (session.mode === 'B' && session.observation && !session.reportPdf) {
          const result: SessionResult = {
            childName: session.childName ?? '',
            ageGroup: session.ageGroup ?? '6-7',
            age: session.age ?? 6,
            date: todayIso(),
            place: PLACE,
            jobs: session.jobs,
            lines: session.lines ?? [],
            observation: session.observation,
            recommendedJob: session.recommendedJob ?? session.jobs[0]!,
            positiveMessage: session.positiveMessage ?? '',
          }
          const pdf = await window.api.report.renderPdf({ sessionId: session.sessionId!, result })
          patch({ reportPdf: pdf.path })
          say(`리포트 PDF 생성 (A4) — ${pdf.bytes.toLocaleString()} bytes`)
        }

        // ── 업로드를 여기서 시작한다 (SPEC §6-1) ──────────────────────
        // 인쇄에 약 8초가 걸리므로 그동안 올려두면 P-10에서 보호자 대기가 0초가 된다.
        // await하지 않는다 — 업로드가 실패하거나 느려도 인쇄를 막으면 안 된다.
        void startUpload()
        say('업로드 시작 (인쇄와 동시 진행)')
      } catch (e) {
        say(`PDF 생성 실패: ${(e as Error).message}`)
      } finally {
        setBusy(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.sessionId, session.composedPhoto, session.observation])

  async function doPrint(): Promise<void> {
    if (!session.photoPdf) return
    setBusy(true)
    try {
      const res = await window.api.print.silent({
        pdfPath: session.photoPdf,
        ...(printer ? { printerName: printer } : {}),
      })
      if (res.ok) {
        say(`인쇄 요청 완료 — ${res.printerName ?? '기본 프린터'}`)
      } else {
        say(`인쇄 실패 — ${res.error}`)
        setFallback({
          kind: 'print',
          message: '사진 출력이 조금 늦어지고 있어요. 옆의 직원에게 알려주세요!',
          detail: res.error,
        })
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen id="P-09" note="스파이크 ⑤ — 사일런트 인쇄 (스파이크는 수동 트리거)">
      <h1 className="screen__title">사진을 뽑고 있어요</h1>

      <div className="panel">
        <label className="row" style={{ justifyContent: 'flex-start' }}>
          <span style={{ fontSize: 'var(--fs-caption)' }}>프린터</span>
          <select
            value={printer}
            onChange={(e) => setPrinter(e.target.value)}
            style={{
              minHeight: 48,
              fontFamily: 'inherit',
              fontSize: 'var(--fs-caption)',
              background: 'var(--c-surface-2)',
              color: 'var(--c-text)',
              border: '1px solid var(--c-line)',
              borderRadius: 8,
              padding: '0 8px',
            }}
          >
            {printers.map((p) => (
              <option key={p.name} value={p.name}>
                {p.displayName || p.name}
                {p.isDefault ? ' (기본)' : ''}
              </option>
            ))}
            {printers.length === 0 && <option value="">연결된 프린터 없음</option>}
          </select>
        </label>

        <dl className="kv" style={{ marginTop: 'var(--gap-sm)' }}>
          <dt>네컷 PDF</dt>
          <dd>{session.photoPdf ?? '—'}</dd>
          <dt>리포트 PDF</dt>
          <dd>{session.reportPdf ?? (session.mode === 'B' ? '생성 중…' : '— (A모드)')}</dd>
          <dt>업로드 (SPEC §6-1)</dt>
          <dd>
            {uploadState === 'idle' && '대기'}
            {uploadState === 'pending' && '진행 중… (인쇄와 동시)'}
            {uploadState === 'done' && '완료 — P-10에서 즉시 QR 표시'}
            {uploadState === 'failed' && '실패 → 인쇄물만 제공 안내'}
          </dd>
        </dl>
      </div>

      <div className="row">
        <button className="btn" onClick={() => void doPrint()} disabled={busy || !session.photoPdf}>
          사일런트 인쇄 실행
        </button>
        <button className="btn btn--primary" onClick={() => next()} disabled={busy}>
          다음 → P-10
        </button>
      </div>

      {log.length > 0 && (
        <div className="panel">
          <ul style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-dim)', lineHeight: 1.9 }}>
            {log.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </div>
      )}
    </Screen>
  )
}
