/**
 * src/main/print.ts — 사일런트 인쇄 (pdf-to-printer)
 *
 * SPIKE_PLAN ⑤ 🔴 최대 리스크
 *   - 프린터 목록을 앱에서 조회할 수 있다
 *   - 다이얼로그 없이(사일런트) 인쇄가 실행된다
 *   - 4×6 용지에 여백·잘림 없이(풀블리드) 출력된다  ← 규격은 pdf.ts가 확정
 *   - 인쇄 실패(용지 없음 등) 시 앱이 죽지 않고 에러를 감지한다
 *
 * ⚠️ DNP 실기 확보 전까지는 일반 프린터로 "사일런트 인쇄 경로"만 검증한다.
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { print as ptpPrint } from 'pdf-to-printer'
import { getMainWindow } from './index'
import { PRINT_PAPER_NAME } from '../shared/constants'
import type {
  PrintRequest,
  PrinterConnection,
  PrinterInfo,
  PrinterPaper,
  PrinterPaperInfo,
  PrintResult,
} from '../shared/types'

const execFileAsync = promisify(execFile)

/**
 * Windows 스풀러 조회 — 포트명·오프라인 여부까지 받는다.
 * Electron getPrintersAsync()는 포트를 주지 않아 "USB로 실제 꽂힌 프린터"를 구분할 수 없다.
 * (출력 인코딩을 UTF-8로 고정하지 않으면 한글 프린터 이름이 깨진다)
 */
const PS_QUERY =
  '[Console]::OutputEncoding=[Text.Encoding]::UTF8;' +
  'Get-CimInstance Win32_Printer | Select-Object Name,PortName,Default,WorkOffline,DriverName | ConvertTo-Json -Compress'

interface CimPrinter {
  Name: string
  PortName?: string
  Default?: boolean
  WorkOffline?: boolean
  DriverName?: string
}

function classify(port: string | undefined, name: string): PrinterConnection {
  const p = (port ?? '').toUpperCase()
  if (/^USB\d+/.test(p) || p.startsWith('DOT4')) return 'usb'
  if (p.startsWith('WSD-') || p.startsWith('IP_') || p.startsWith('TCP') || p.startsWith('\\\\') || /^\d{1,3}(\.\d{1,3}){3}/.test(p)) {
    return 'network'
  }
  if (['PORTPROMPT:', 'FILE:', 'SHRFAX:', 'NUL:', 'NUL'].includes(p) || /PDF|XPS|OneNote|Fax|팩스/i.test(name)) {
    return 'virtual'
  }
  return 'other'
}

const ORDER: Record<PrinterConnection, number> = { usb: 0, network: 1, other: 2, virtual: 3 }

export async function listPrinters(): Promise<PrinterInfo[]> {
  if (process.platform === 'win32') {
    try {
      const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', PS_QUERY], {
        windowsHide: true,
        timeout: 8_000,
      })
      const parsed = JSON.parse(stdout.trim() || '[]') as CimPrinter | CimPrinter[]
      const rows = Array.isArray(parsed) ? parsed : [parsed]
      return rows
        .map<PrinterInfo>((r) => ({
          name: r.Name,
          displayName: r.Name,
          description: r.DriverName ?? '',
          isDefault: !!r.Default,
          port: r.PortName,
          connection: classify(r.PortName, r.Name),
          offline: !!r.WorkOffline,
        }))
        .sort((a, b) => ORDER[a.connection] - ORDER[b.connection] || a.name.localeCompare(b.name))
    } catch {
      /* 아래 Electron 목록으로 대체 */
    }
  }

  const win = getMainWindow()
  if (!win) return []
  const printers = await win.webContents.getPrintersAsync()
  return printers.map((p) => ({
    name: p.name,
    displayName: p.displayName,
    description: p.description,
    isDefault: p.isDefault,
    connection: classify(undefined, p.name),
    offline: false,
  }))
}

/**
 * 드라이버 용지 설정 조회 (D-01 점검용).
 * 프린터 이름은 명령 문자열에 넣지 않고 환경변수로 넘긴다.
 */
const PS_PAPER =
  '[Console]::OutputEncoding=[Text.Encoding]::UTF8;' +
  'Add-Type -AssemblyName System.Drawing;' +
  '$s=New-Object System.Drawing.Printing.PrinterSettings;' +
  '$s.PrinterName=$env:MDV_PRINTER;' +
  "if(-not $s.IsValid){throw 'printer not found'};" +
  '$d=$s.DefaultPageSettings;' +
  '@{Paper=@{Name=$d.PaperSize.PaperName;W=$d.PaperSize.Width;H=$d.PaperSize.Height};' +
  'PrintableW=$d.PrintableArea.Width;PrintableH=$d.PrintableArea.Height;' +
  'MarginX=$d.HardMarginX;MarginY=$d.HardMarginY;' +
  'Papers=@($s.PaperSizes|ForEach-Object{@{Name=$_.PaperName;W=$_.Width;H=$_.Height}})}' +
  '|ConvertTo-Json -Compress -Depth 4'

interface CimPaper {
  Name: string
  W: number
  H: number
}

interface CimPaperSettings {
  Paper: CimPaper
  PrintableW: number
  PrintableH: number
  MarginX: number
  MarginY: number
  Papers: CimPaper[]
}

/** System.Drawing은 1/100인치 단위로 준다 */
const toPaper = (p: CimPaper): PrinterPaper => ({
  name: p.Name,
  widthIn: p.W / 100,
  heightIn: p.H / 100,
})

export async function readPrinterPaper(printerName: string): Promise<PrinterPaperInfo> {
  if (process.platform !== 'win32') throw new Error('Windows에서만 조회할 수 있습니다')

  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', PS_PAPER], {
    windowsHide: true,
    timeout: 15_000,
    env: { ...process.env, MDV_PRINTER: printerName },
  })
  const raw = JSON.parse(stdout.trim()) as CimPaperSettings
  return {
    printerName,
    defaultPaper: toPaper(raw.Paper),
    printableWidthIn: raw.PrintableW / 100,
    printableHeightIn: raw.PrintableH / 100,
    marginXIn: raw.MarginX / 100,
    marginYIn: raw.MarginY / 100,
    papers: raw.Papers.map(toPaper),
  }
}

export async function printSilent(req: PrintRequest): Promise<PrintResult> {
  if (process.platform !== 'win32') {
    return { ok: false, error: 'pdf-to-printer 사일런트 인쇄는 Windows에서만 검증한다' }
  }

  try {
    await ptpPrint(req.pdfPath, {
      ...(req.printerName ? { printer: req.printerName } : {}),
      // PDF 페이지가 이미 드라이버 용지와 같으므로 프린터가 다시 줄이지 않게 한다 (pdf.ts)
      scale: 'noscale',
      // 방향을 안 주면 SumatraPDF가 드라이버의 세로 표시를 따라 가로 PDF를 세로로 돌려 아래가 잘린다.
      // 방향을 주면 용지 자동 선택을 건너뛰므로 용지도 함께 지정한다.
      orientation: 'landscape',
      paperSize: PRINT_PAPER_NAME,
      silent: true,
      printDialog: false,
    })
    // ⚠️ 여기서의 성공은 "인쇄 큐에 넣었다"까지다. 실제로 종이가 나왔다는 뜻이 아니다.
    //    용지·리본 소진, 커버 열림 같은 실기 오류는 Windows 인쇄 큐 상태를 봐야 잡힌다.
    // TODO(⑤): 큐 폴링(Win32_PrintJob / Get-Printer)으로 실제 완료·실패를 판정할 것.
    //           SPIKE_PLAN ⑤ "인쇄 실패(용지 없음 등) 시 에러를 감지한다" 는 이것까지 되어야 충족.
    return { ok: true, printerName: req.printerName }
  } catch (e) {
    // 앱을 죽이지 않는다 — 렌더러가 M-02[오류·폴백 안내]로 처리하고 P-10으로 계속 진행
    return { ok: false, printerName: req.printerName, error: (e as Error).message }
  }
}
