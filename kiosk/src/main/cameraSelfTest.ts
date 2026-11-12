/**
 * src/main/cameraSelfTest.ts — 실카메라(R100) 자가진단 (D-01 버튼)
 *
 * 키오스크에서 버튼 하나로: 연결 → 라이브뷰 3초 측정 → 4컷 촬영(라이브뷰 켠 채) → 촬영 뒤 라이브뷰 재개 확인.
 * 결과는 화면에 항목별 성공/주의/실패로 보여주고, 바탕화면 폴더에 남긴다.
 *   MDV_카메라테스트_<시각>/  결과.txt · result.json · cut_01~04.jpg · liveview.jpg · camera.log
 * 이 폴더를 통째로 받으면 원인을 볼 수 있다.
 *
 * ⚠️ 실제 셔터가 4번 눌린다.
 */

import { app, shell } from 'electron'
import { get, type ClientRequest } from 'node:http'
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { hostname } from 'node:os'
import { join } from 'node:path'
import {
  CAPTURE_TIMEOUT_MS,
  cameraLog,
  cameraLogDir,
  cameraLogPath,
  onCameraEvent,
  withCameraHost,
} from './camera'
import type {
  CameraLiveView,
  CameraSelfTestReport,
  SelfTestItem,
  SelfTestVerdict,
} from '../shared/types'

/** 라이브뷰 fps를 재는 시간 */
const LIVE_SAMPLE_MS = 3_000
/** 라이브뷰를 켜고 첫 화면이 나올 때까지 기다리는 시간 */
const FIRST_FRAME_TIMEOUT_MS = 8_000
/** 촬영 뒤 라이브뷰가 다시 나와야 하는 시간 */
const RESUME_TIMEOUT_MS = 5_000
const SHOTS = 4

// ── 판정 기준 (결과.txt에도 그대로 적는다) ──
const FPS_PASS = 15
const FPS_WARN = 8
const SHOT_PASS_MS = 3_000
const SHOT_WARN_MS = 6_000
/** 이보다 작으면 카메라 화질이 L이 아닌 것 — 인쇄에는 충분하지만 설정 확인 */
const MIN_PHOTO_WIDTH = 3_000

const CRITERIA = [
  `라이브뷰: ${FPS_PASS}fps 이상 성공 · ${FPS_WARN}~${FPS_PASS}fps 주의 · ${FPS_WARN}fps 미만이거나 ${FIRST_FRAME_TIMEOUT_MS / 1000}초 안에 화면이 안 나오면 실패`,
  `촬영 1장: ${SHOT_PASS_MS / 1000}초 이하 성공 · ${SHOT_WARN_MS / 1000}초 이하 주의 · 그보다 길거나 오류면 실패 (셔터+전송+저장)`,
  `촬영 뒤 라이브뷰: ${RESUME_TIMEOUT_MS / 1000}초 안에 다시 나오면 성공`,
  '시험 중 연결이 한 번이라도 끊기면 실패',
]

const VERDICT_LABEL: Record<SelfTestVerdict, string> = { pass: '성공', warn: '주의', fail: '실패' }
const RANK: Record<SelfTestVerdict, number> = { pass: 0, warn: 1, fail: 2 }

let lastDir: string | null = null

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
const pad = (n: number): string => String(n).padStart(2, '0')
const message = (e: unknown): string => (e instanceof Error ? e.message : String(e))

function stamp(d = new Date()): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

function worse(a: SelfTestVerdict, b: SelfTestVerdict): SelfTestVerdict {
  return RANK[a] >= RANK[b] ? a : b
}

/** JPEG 헤더에서 크기만 읽는다 */
function jpegSize(b: Buffer): { width: number; height: number } | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null
  let i = 2
  while (i + 8 < b.length) {
    if (b[i] !== 0xff) return null
    const m = b[i + 1]!
    if (m === 0xff) {
      i++
      continue
    }
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd8)) {
      i += 2
      continue
    }
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) }
    }
    i += 2 + b.readUInt16BE(i + 2)
  }
  return null
}

/** 사이드카의 MJPEG 스트림을 붙잡고 프레임이 온 시각을 기록한다 */
class FrameWatcher {
  readonly opened = Date.now()
  readonly times: number[] = []
  last: Buffer | null = null
  error: string | null = null
  private readonly req: ClientRequest

  constructor(url: string) {
    this.req = get(url, (res) => {
      let buffer = Buffer.alloc(0)
      res.on('data', (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk])
        for (;;) {
          const head = buffer.indexOf('\r\n\r\n')
          if (head < 0) return
          const match = /Content-Length: (\d+)/i.exec(buffer.subarray(0, head).toString())
          if (!match) return
          const length = Number(match[1])
          if (buffer.length < head + 4 + length + 2) return
          this.last = Buffer.from(buffer.subarray(head + 4, head + 4 + length))
          this.times.push(Date.now())
          buffer = buffer.subarray(head + 4 + length + 2)
        }
      })
      res.on('end', () => (this.error ??= '라이브뷰 스트림이 끊겼습니다'))
    })
    this.req.on('error', (e) => (this.error ??= e.message))
  }

  /** after 이후에 온 첫 프레임 시각. 시간 안에 안 오면 null */
  async frameAfter(after: number, timeoutMs: number): Promise<number | null> {
    const end = Date.now() + timeoutMs
    while (Date.now() < end) {
      const hit = this.times.find((t) => t > after)
      if (hit !== undefined) return hit
      await sleep(30)
    }
    return null
  }

  countBetween(from: number, to: number): number {
    return this.times.filter((t) => t > from && t <= to).length
  }

  close(): void {
    this.req.destroy()
  }
}

export async function runCameraSelfTest(): Promise<CameraSelfTestReport> {
  const startedAt = new Date()
  // MDV_SELFTEST_DIR: 개발 PC에서 바탕화면을 어지럽히지 않게 (키오스크에서는 바탕화면)
  const base = process.env['MDV_SELFTEST_DIR'] ?? app.getPath('desktop')
  const dir = join(base, `MDV_카메라테스트_${stamp(startedAt)}`)
  await mkdir(dir, { recursive: true })
  lastDir = dir

  const items: SelfTestItem[] = []
  const add = (name: string, verdict: SelfTestVerdict, detail: string): void => {
    items.push({ name, verdict, detail })
    cameraLog(`[selftest] ${VERDICT_LABEL[verdict]} · ${name} · ${detail}`)
  }

  cameraLog(`[selftest] 시작 · 앱 ${app.getVersion()} · ${dir}`)
  const lost: string[] = []
  const unsubscribe = onCameraEvent((e) => lost.push(`${e.type}: ${e.message}`))
  let connected = false

  try {
    await withCameraHost(async (host) => {
      // 개발 PC 검증용: 가짜 카메라로 전 과정을 밟아 본다 (키오스크에서는 쓰지 않는다)
      const allowFake = process.env['MDV_SELFTEST_FAKE'] === '1'
      if (host.backend !== 'edsdk' && !allowFake) {
        add('실물 카메라 모드', 'fail', `지금은 '${host.backend}' 모드입니다. 설치한 앱으로 실행했는지, MDV_CAMERA 환경변수가 없는지 확인하세요`)
        return
      }
      add(
        '실물 카메라 모드',
        host.backend === 'edsdk' ? 'pass' : 'warn',
        host.backend === 'edsdk' ? 'EDSDK' : '가짜 카메라 (개발 검증용)',
      )

      const t0 = Date.now()
      try {
        const info = await host.connect()
        add('카메라 연결', 'pass', `${info.model} · ${Date.now() - t0}ms`)
        connected = true
      } catch (e) {
        add('카메라 연결', 'fail', message(e))
        return
      }

      let url: string
      try {
        url = (await host.send<CameraLiveView>('startLiveView')).url
      } catch (e) {
        add('라이브뷰 시작', 'fail', message(e))
        return
      }

      const watcher = new FrameWatcher(url)
      try {
        const first = await watcher.frameAfter(0, FIRST_FRAME_TIMEOUT_MS)
        if (first === null) {
          add('라이브뷰 영상', 'fail', `${FIRST_FRAME_TIMEOUT_MS / 1000}초 동안 화면이 오지 않음${watcher.error ? ` · ${watcher.error}` : ''}`)
        } else {
          await sleep(LIVE_SAMPLE_MS)
          const end = Date.now()
          const fps = watcher.countBetween(first, end) / ((end - first) / 1000)
          const size = watcher.last ? jpegSize(watcher.last) : null
          if (watcher.last) await writeFile(join(dir, 'liveview.jpg'), watcher.last)
          add(
            '라이브뷰 영상',
            fps >= FPS_PASS ? 'pass' : fps >= FPS_WARN ? 'warn' : 'fail',
            `${size ? `${size.width}×${size.height}` : '크기 모름'} · ${fps.toFixed(1)}fps · 첫 화면까지 ${first - watcher.opened}ms`,
          )
        }

        const resumed: number[] = []
        let notResumed = 0
        for (let i = 1; i <= SHOTS; i++) {
          const shotStart = Date.now()
          try {
            const shot = await host.send<{ path: string; bytes: number; width: number; height: number }>(
              'capture',
              { path: join(dir, `cut_0${i}.jpg`) },
              CAPTURE_TIMEOUT_MS,
            )
            const ms = Date.now() - shotStart
            let verdict: SelfTestVerdict = ms <= SHOT_PASS_MS ? 'pass' : ms <= SHOT_WARN_MS ? 'warn' : 'fail'
            let note = ''
            if (shot.width < MIN_PHOTO_WIDTH) {
              verdict = worse(verdict, 'warn')
              note = ' · 사진이 작습니다 (카메라 화질을 JPEG L로)'
            }
            add(`촬영 ${i}`, verdict, `${(ms / 1000).toFixed(1)}초 · ${shot.width}×${shot.height} · ${(shot.bytes / 1e6).toFixed(1)}MB${note}`)
          } catch (e) {
            add(`촬영 ${i}`, 'fail', message(e))
            if (message(e).startsWith('not-connected')) break
            continue
          }

          const doneAt = Date.now()
          const back = await watcher.frameAfter(doneAt, RESUME_TIMEOUT_MS)
          if (back === null) notResumed++
          else resumed.push(back - doneAt)
        }

        if (resumed.length + notResumed > 0) {
          add(
            '촬영 뒤 라이브뷰 재개',
            notResumed ? 'fail' : 'pass',
            notResumed
              ? `${notResumed}번은 ${RESUME_TIMEOUT_MS / 1000}초 안에 화면이 돌아오지 않음`
              : `가장 늦은 것 ${Math.max(...resumed)}ms`,
          )
        }
      } finally {
        watcher.close()
        await host.send('stopLiveView').catch(() => undefined)
      }
    })
  } catch (e) {
    // 사이드카를 못 띄운 경우 (exe·DLL 없음 등)
    add('카메라 프로그램 기동', 'fail', message(e))
  } finally {
    unsubscribe()
  }

  if (connected) {
    add('시험 중 연결 유지', lost.length ? 'fail' : 'pass', lost.length ? lost.join(' / ') : '끊김 없음')
  }

  const verdict = items.reduce<SelfTestVerdict>((acc, item) => worse(acc, item.verdict), 'pass')
  cameraLog(`[selftest] 끝 · ${VERDICT_LABEL[verdict]}`)

  await writeResult(dir, startedAt, verdict, items)
  return { verdict, items, dir }
}

async function writeResult(
  dir: string,
  startedAt: Date,
  verdict: SelfTestVerdict,
  items: SelfTestItem[],
): Promise<void> {
  const when = `${startedAt.getFullYear()}-${pad(startedAt.getMonth() + 1)}-${pad(startedAt.getDate())} ${startedAt.toTimeString().slice(0, 8)}`
  const text = [
    '마이 드림 보이스 · 실카메라 자가진단',
    `시각: ${when}`,
    `PC: ${hostname()} · 앱 ${app.getVersion()}`,
    '',
    `판정: ${VERDICT_LABEL[verdict]}`,
    '',
    ...items.map((i) => `[${VERDICT_LABEL[i.verdict]}] ${i.name} — ${i.detail}`),
    '',
    '판정 기준',
    ...CRITERIA.map((c) => `- ${c}`),
    '',
    '이 폴더의 파일',
    '- cut_01~04.jpg: 촬영 원본',
    '- liveview.jpg: 라이브뷰 한 장',
    '- camera.log: 카메라 로그 (오늘 하루치)',
    '',
  ].join('\r\n')

  // 메모장에서 한글이 깨지지 않게 BOM을 붙인다
  await writeFile(join(dir, '결과.txt'), `﻿${text}`, 'utf8')
  await writeFile(
    join(dir, 'result.json'),
    JSON.stringify({ verdict, items, app: app.getVersion(), host: hostname(), at: when }, null, 2),
    'utf8',
  )

  // 방금 쓴 로그 줄이 파일에 내려갈 시간을 준다
  await sleep(300)
  try {
    await copyFile(cameraLogPath(), join(dir, 'camera.log'))
  } catch (e) {
    console.error(`[selftest] 로그 복사 실패: ${message(e)}`)
  }
}

export async function openCameraFolder(which: 'test' | 'logs'): Promise<void> {
  if (which === 'logs') {
    await mkdir(cameraLogDir(), { recursive: true })
    await shell.openPath(cameraLogDir())
    return
  }
  if (!lastDir || !existsSync(lastDir)) throw new Error('아직 자가진단을 실행하지 않았습니다')
  await shell.openPath(lastDir)
}
