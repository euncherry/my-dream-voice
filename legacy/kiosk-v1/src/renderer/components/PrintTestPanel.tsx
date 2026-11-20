/**
 * components/PrintTestPanel.tsx — D-01 인쇄 점검 (개발 전용)
 *
 * 용지 설정 확인은 종이를 쓰지 않는다. 테스트 인쇄는 네컷과 같은 경로로 점검표 1장을 뽑는다.
 */

import { useEffect, useState, type ReactNode } from 'react'
import { composePrintTestChart } from '../photo/printTestChart'
import { PRINT_PAGE_INCHES, PRINT_PAPER_NAME } from '@shared/constants'
import type { PrinterInfo, PrinterPaper, PrinterPaperInfo, SessionPaths } from '@shared/types'

const inch = (n: number): string => n.toFixed(2)
const size = (p: PrinterPaper): string => `${inch(p.widthIn)} × ${inch(p.heightIn)} in`

/** 인쇄는 이 용지를 지정해 나가므로, 드라이버에 없거나 크기가 다르면 인쇄물이 어긋난다 */
function paperVerdict(info: PrinterPaperInfo): { ok: boolean; text: string } {
  const paper = info.papers.find((p) => p.name === PRINT_PAPER_NAME)
  if (!paper) {
    return { ok: false, text: `드라이버에 ${PRINT_PAPER_NAME} 용지가 없음 — 사진이 잘리거나 여백이 생길 수 있음` }
  }
  const target = PRINT_PAGE_INCHES
  if (Math.abs(paper.widthIn - target.width) <= 0.02 && Math.abs(paper.heightIn - target.height) <= 0.02) {
    return { ok: true, text: `${PRINT_PAPER_NAME} · ${size(paper)} (정상)` }
  }
  return {
    ok: false,
    text: `${PRINT_PAPER_NAME} 크기가 ${size(paper)}로, 인쇄 페이지(${target.width} × ${target.height} in)와 다름 — 사진이 잘리거나 여백이 생길 수 있음`,
  }
}

export function PrintTestPanel({
  printers,
  ensureSession,
}: {
  printers: PrinterInfo[]
  ensureSession: () => Promise<SessionPaths>
}): ReactNode {
  const [printer, setPrinter] = useState('')
  const [paper, setPaper] = useState<PrinterPaperInfo | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // 실물 USB 프린터를 먼저 고른다 — 목록은 USB부터 정렬되어 있다
  useEffect(() => {
    if (printer || printers.length === 0) return
    const usb = printers.find((p) => p.connection === 'usb')
    setPrinter(usb?.name ?? printers.find((p) => p.isDefault)?.name ?? printers[0]!.name)
  }, [printers, printer])

  async function act(work: () => Promise<void>): Promise<void> {
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      await work()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const readPaper = (): Promise<void> =>
    act(async () => setPaper(await window.api.system.printerPaper(printer)))

  const testPrint = (): Promise<void> =>
    act(async () => {
      // 결과 사진과 같이 볼 수 있게 설정도 함께 읽는다. 못 읽어도 인쇄는 진행한다
      setPaper(await window.api.system.printerPaper(printer).catch(() => null))

      const { sessionId } = await ensureSession()
      const saved = await window.api.photo.save({
        sessionId,
        index: 0,
        dataUrl: composePrintTestChart(printer),
        composed: true,
      })
      const pdf = await window.api.photo.renderPdf({ sessionId, imagePath: saved.path })
      const res = await window.api.print.silent({ pdfPath: pdf.path, printerName: printer })
      if (!res.ok) throw new Error(res.error ?? '인쇄 실패')
      setResult(`인쇄 요청 완료 — ${printer} (큐에 넣은 것까지 확인됨)`)
    })

  const verdict = paper ? paperVerdict(paper) : null

  return (
    <section className="panel">
      <div className="panel__head">
        <strong>인쇄 점검 · 용지 설정 · 테스트 인쇄</strong>
      </div>

      <div className="row" style={{ justifyContent: 'flex-start' }}>
        <select
          className="sel"
          value={printer}
          disabled={busy}
          onChange={(e) => {
            setPrinter(e.target.value)
            setPaper(null)
            setResult(null)
          }}
        >
          {printers.map((p) => (
            <option key={p.name} value={p.name}>
              {p.displayName}
              {p.isDefault ? ' (기본)' : ''}
            </option>
          ))}
          {printers.length === 0 && <option value="">연결된 프린터 없음</option>}
        </select>
        <button className="btn btn--sm" disabled={busy || !printer} onClick={() => void readPaper()}>
          용지 설정 확인
        </button>
        <button
          className="btn btn--sm btn--primary"
          disabled={busy || !printer}
          onClick={() => void testPrint()}
        >
          {busy ? '처리 중…' : '테스트 인쇄 (1장)'}
        </button>
      </div>

      {error && <p className="err">{error}</p>}
      {result && <p className="hint">{result}</p>}

      {paper && verdict && (
        <dl className="kv">
          <dt>인쇄 용지</dt>
          <dd style={verdict.ok ? undefined : { color: 'var(--c-danger)' }}>{verdict.text}</dd>
          <dt>기본 용지 (참고)</dt>
          <dd>
            {paper.defaultPaper.name} · {size(paper.defaultPaper)}
          </dd>
          <dt>인쇄 가능 영역</dt>
          <dd>
            {inch(paper.printableWidthIn)} × {inch(paper.printableHeightIn)} in · 여백{' '}
            {inch(paper.marginXIn)} / {inch(paper.marginYIn)} in
          </dd>
          <dt>드라이버 용지</dt>
          <dd>{paper.papers.map((p) => `${p.name} (${size(p)})`).join(', ') || '—'}</dd>
        </dl>
      )}

      <p className="hint">
        뽑은 종이를 자와 함께 사진으로 남기세요. 눈금 막대와 사방 테두리로 배율과 잘림을 판독합니다.
      </p>
    </section>
  )
}
