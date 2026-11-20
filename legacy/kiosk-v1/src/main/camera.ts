/**
 * src/main/camera.ts — 카메라 사이드카(CameraHost.exe) 관리
 *
 * R100은 UVC·UAC를 지원하지 않아 getUserMedia로 받을 수 없다.
 * EDSDK(C DLL)를 쓰는 C# 프로세스를 띄워 JSON Lines(stdin/stdout)로 제어하고,
 * 라이브뷰만 loopback MJPEG로 렌더러의 <img>에 바로 넘긴다.
 *
 * 프로토콜 정의는 camera-host/Program.cs.
 * 백엔드: 설치판은 edsdk(실물 R100, EdsdkCamera.cs), 개발 실행(npm run dev)은 fake.
 *         MDV_CAMERA=fake|edsdk 로 덮어쓸 수 있다.
 *
 * 로그: <userData>/logs/camera-YYYYMMDD.log — 사이드카 기동·stderr·오류·끊김·촬영 시간을 남긴다.
 *       키오스크 실기 시험 때 이 파일을 받아 원인을 본다.
 */

import { app } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync, type WriteStream } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { getMainWindow } from './index'
import { preparePhotoPath } from './storage'
import {
  IPC,
  type CameraBackend,
  type CameraCaptureRequest,
  type CameraCaptureResult,
  type CameraEvent,
  type CameraInfo,
  type CameraLiveView,
  type CameraStatus,
} from '../shared/types'

const READY_TIMEOUT_MS = 10_000
const COMMAND_TIMEOUT_MS = 10_000
/** 셔터 + 파일 전송. 초과하면 실패로 보고 M-02로 넘긴다 */
export const CAPTURE_TIMEOUT_MS = 20_000

interface HostResponse {
  type: 'response'
  id: number
  ok: boolean
  result?: unknown
  error?: { code: string; message: string }
}

interface HostMessage {
  type: 'ready' | 'response' | 'event' | 'fatal'
  backend?: CameraBackend
  event?: string
  code?: string
  message?: string
}

interface Pending {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

interface Host {
  proc: ChildProcessWithoutNullStreams
  pending: Map<number, Pending>
  nextId: number
  backend?: CameraBackend
  /** 앱 종료·재시작처럼 의도한 종료면 host-exit를 알리지 않는다 */
  stopping: boolean
}

let host: Host | null = null
let info: CameraInfo | null = null

function hostExePath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'camera-host', 'CameraHost.exe')
    : join(app.getAppPath(), 'camera-host', 'publish', 'CameraHost.exe')
}

// ── 로그 ─────────────────────────────────────────────────────

let logStream: WriteStream | null = null
let logDate = ''

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

export function cameraLogDir(): string {
  return join(app.getPath('userData'), 'logs')
}

export function cameraLogPath(): string {
  return join(cameraLogDir(), `camera-${today()}.log`)
}

/** 한 줄 남긴다. 날짜가 바뀌면 새 파일로 넘어간다. 로그 실패로 앱이 멈추지 않게 오류는 삼킨다 */
export function cameraLog(line: string): void {
  try {
    if (!logStream || logDate !== today()) {
      logStream?.end()
      mkdirSync(cameraLogDir(), { recursive: true })
      logDate = today()
      logStream = createWriteStream(cameraLogPath(), { flags: 'a' })
      logStream.on('error', (e) => console.error(`[camera-log] ${e.message}`))
    }
    const time = new Date().toTimeString().slice(0, 8)
    logStream.write(`${time} ${line}\n`)
  } catch (e) {
    console.error(`[camera-log] ${(e as Error).message}`)
  }
}

const eventListeners = new Set<(event: CameraEvent) => void>()

/** 메인 프로세스 안에서 끊김을 듣는다 (자가진단용). 해제 함수를 돌려준다 */
export function onCameraEvent(listener: (event: CameraEvent) => void): () => void {
  eventListeners.add(listener)
  return () => eventListeners.delete(listener)
}

function pushEvent(event: CameraEvent): void {
  cameraLog(`[event] ${event.type}: ${event.message}`)
  for (const listener of eventListeners) listener(event)
  getMainWindow()?.webContents.send(IPC.CAMERA_EVENT, event)
}

function failPending(target: Host, message: string): void {
  for (const p of target.pending.values()) {
    clearTimeout(p.timer)
    p.reject(new Error(message))
  }
  target.pending.clear()
}

function startHost(): Promise<Host> {
  return new Promise((resolve, reject) => {
    const exe = hostExePath()
    if (!existsSync(exe)) {
      cameraLog(`[host] exe 없음: ${exe}`)
      reject(new Error(`CameraHost.exe가 없습니다 (${exe}) — npm run camera:build`))
      return
    }

    const backend = process.env['MDV_CAMERA'] ?? (app.isPackaged ? 'edsdk' : 'fake')
    cameraLog(`[host] 기동 · 앱 ${app.getVersion()} · backend=${backend} · ${exe}`)
    const proc = spawn(exe, ['--backend', backend], { windowsHide: true })
    const started: Host = { proc, pending: new Map(), nextId: 1, stopping: false }

    let settled = false
    const fail = (message: string): void => {
      if (settled) return
      settled = true
      clearTimeout(readyTimer)
      proc.kill()
      reject(new Error(message))
    }
    const readyTimer = setTimeout(() => fail('CameraHost 기동 시간 초과'), READY_TIMEOUT_MS)

    proc.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString().trimEnd()
      console.error(`[camera-host] ${text}`)
      for (const line of text.split(/\r?\n/)) if (line) cameraLog(`[host] ${line}`)
    })

    // 죽은 프로세스에 쓰면 EPIPE가 난다. 처리하지 않으면 메인 프로세스가 통째로 죽는다.
    proc.stdin.on('error', (e) => {
      console.error(`[camera-host] stdin: ${e.message}`)
    })

    createInterface({ input: proc.stdout }).on('line', (line) => {
      let msg: HostMessage
      try {
        msg = JSON.parse(line) as HostMessage
      } catch {
        console.error(`[camera-host] 해석할 수 없는 출력: ${line}`)
        return
      }

      if (msg.type === 'ready') {
        if (settled) return
        settled = true
        clearTimeout(readyTimer)
        started.backend = msg.backend
        cameraLog(`[host] 준비됨 · backend=${msg.backend}`)
        resolve(started)
      } else if (msg.type === 'fatal') {
        cameraLog(`[host] 기동 실패 ${msg.code}: ${msg.message}`)
        fail(`${msg.code}: ${msg.message}`)
      } else if (msg.type === 'response') {
        settle(started, msg as unknown as HostResponse)
      } else if (msg.type === 'event' && msg.event === 'disconnected') {
        info = null
        pushEvent({ type: 'disconnected', message: msg.message ?? '' })
      }
    })

    proc.on('error', (e) => {
      fail(`CameraHost 실행 실패: ${e.message}`)
      failPending(started, e.message)
    })

    proc.on('exit', (code) => {
      cameraLog(`[host] 종료 exit=${code}${started.stopping ? ' (앱 종료)' : ''}`)
      if (host === started) {
        host = null
        info = null
      }
      failPending(started, `CameraHost 종료 (exit ${code})`)
      fail(`CameraHost가 준비되기 전에 종료됨 (exit ${code})`)
      if (!started.stopping && settled) {
        pushEvent({ type: 'host-exit', message: `exit ${code}` })
      }
    })
  })
}

function settle(target: Host, msg: HostResponse): void {
  const p = target.pending.get(msg.id)
  if (!p) return
  target.pending.delete(msg.id)
  clearTimeout(p.timer)
  if (msg.ok) p.resolve(msg.result)
  else p.reject(new Error(`${msg.error?.code}: ${msg.error?.message}`))
}

/** 사이드카가 죽었으면 다음 호출에서 다시 띄운다 — 키오스크는 재시작 없이 복구돼야 한다 */
async function ensureHost(): Promise<Host> {
  if (host && host.proc.exitCode !== null) host = null
  if (!host) host = await startHost()
  return host
}

function call<T>(
  target: Host,
  cmd: string,
  args: Record<string, unknown> = {},
  timeoutMs = COMMAND_TIMEOUT_MS,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = target.nextId++
    const started = Date.now()
    // status는 화면 갱신마다 불려 로그만 채우므로 실패만 남긴다
    const quiet = cmd === 'status'
    const timer = setTimeout(() => {
      target.pending.delete(id)
      cameraLog(`[cmd] ${cmd} 시간 초과 (${timeoutMs}ms)`)
      reject(new Error(`CameraHost 응답 시간 초과 (${cmd})`))
    }, timeoutMs)
    target.pending.set(id, {
      resolve: (value) => {
        if (!quiet) cameraLog(`[cmd] ${cmd} 성공 ${Date.now() - started}ms${describe(value)}`)
        resolve(value as T)
      },
      reject: (error) => {
        cameraLog(`[cmd] ${cmd} 실패 ${Date.now() - started}ms · ${error.message}`)
        reject(error)
      },
      timer,
    })
    target.proc.stdin.write(`${JSON.stringify({ id, cmd, ...args })}\n`)
  })
}

/** 로그에 남길 결과 요약 (촬영 크기·모델) */
function describe(value: unknown): string {
  if (!value || typeof value !== 'object') return ''
  const v = value as Record<string, unknown>
  if (typeof v['width'] === 'number') {
    return ` · ${v['width']}×${v['height']} · ${((v['bytes'] as number) / 1e6).toFixed(1)}MB`
  }
  if (typeof v['model'] === 'string') return ` · ${v['model']}`
  return ''
}

/**
 * 명령을 요청 순서대로 하나씩 처리한다.
 * start 도중 stop이 들어와 라이브뷰가 켜진 채 남는 일을 막는다
 * (화면 전환·StrictMode 이중 마운트에서 실제로 나는 순서다).
 */
let queue: Promise<unknown> = Promise.resolve()
function serial<T>(work: () => Promise<T>): Promise<T> {
  const run = queue.then(work, work)
  queue = run.catch(() => undefined)
  return run
}

interface HostStatus {
  connected: boolean
  liveView: boolean
}

async function ensureConnected(target: Host): Promise<void> {
  const { connected } = await call<HostStatus>(target, 'status')
  if (!connected) info = await call<CameraInfo>(target, 'connect')
}

async function readStatus(): Promise<CameraStatus> {
  try {
    const target = await ensureHost()
    const { connected, liveView } = await call<HostStatus>(target, 'status')
    return {
      state: !connected ? 'disconnected' : liveView ? 'liveview' : 'connected',
      backend: target.backend,
      info: info ?? undefined,
    }
  } catch (e) {
    return { state: 'unavailable', reason: (e as Error).message }
  }
}

export function cameraStatus(): Promise<CameraStatus> {
  return serial(readStatus)
}

export function cameraConnect(): Promise<CameraStatus> {
  return serial(async () => {
    await ensureConnected(await ensureHost())
    return readStatus()
  })
}

export function cameraStartLiveView(): Promise<CameraLiveView> {
  return serial(async () => {
    const target = await ensureHost()
    await ensureConnected(target)
    return call<CameraLiveView>(target, 'startLiveView')
  })
}

export function cameraStopLiveView(): Promise<void> {
  return serial(async () => {
    // 띄운 적이 없으면 멈출 것도 없다 — 정지만을 위해 사이드카를 기동하지 않는다
    if (host) await call(host, 'stopLiveView')
  })
}

export function cameraCapture(req: CameraCaptureRequest): Promise<CameraCaptureResult> {
  return serial(async () => {
    const path = await preparePhotoPath(req.sessionId, req.index)
    const target = await ensureHost()
    await ensureConnected(target)
    const shot = await call<{ path: string; bytes: number; width: number; height: number }>(
      target,
      'capture',
      { path },
      CAPTURE_TIMEOUT_MS,
    )
    return { path: shot.path, bytes: shot.bytes, width: shot.width, height: shot.height }
  })
}

export function cameraSimulateDisconnect(): Promise<void> {
  return serial(async () => {
    await call(await ensureHost(), 'simulateDisconnect')
  })
}

export interface HostSession {
  backend: CameraBackend | undefined
  /** 연결이 안 되어 있으면 연결하고 카메라 정보를 돌려준다 */
  connect(): Promise<CameraInfo>
  send<T>(cmd: string, args?: Record<string, unknown>, timeoutMs?: number): Promise<T>
}

/**
 * 자가진단처럼 여러 명령을 이어서 보내야 할 때 — 끝날 때까지 큐를 잡아 다른 요청이 끼어들지 않게 한다.
 */
export function withCameraHost<T>(work: (session: HostSession) => Promise<T>): Promise<T> {
  return serial(async () => {
    const target = await ensureHost()
    return work({
      backend: target.backend,
      connect: async () => {
        await ensureConnected(target)
        if (!info) throw new Error('카메라 정보를 받지 못했습니다')
        return info
      },
      send: (cmd, args = {}, timeoutMs = COMMAND_TIMEOUT_MS) => call(target, cmd, args, timeoutMs),
    })
  })
}

/** stdin을 닫으면 사이드카가 카메라 세션을 정리하고 스스로 종료한다 */
export function shutdownCamera(): void {
  if (!host) return
  host.stopping = true
  host.proc.stdin.end()
  host = null
}
