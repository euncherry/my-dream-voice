/**
 * camera-host/smoke-test.mjs — CameraHost 프로토콜 검증 (npm run camera:test)
 *
 * 실제 exe를 띄워 Electron이 쓸 경로를 그대로 밟는다. 외부 패키지 없이 Node만 쓴다.
 * 가짜 카메라 기준이므로 통과해도 R100 동작을 보장하지는 않는다.
 */

import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { get } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const exe = join(here, 'publish', 'CameraHost.exe')
// 사용자 폴더 경로에 한글이 있어도 깨지지 않아야 한다
const dir = mkdtempSync(join(tmpdir(), '카메라-테스트-'))

let failed = 0
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
  if (!ok) failed++
}

const proc = spawn(exe, ['--backend', 'fake'], { stdio: ['pipe', 'pipe', 'inherit'] })
const pending = new Map()
const events = []
let nextId = 1
let onReady

createInterface({ input: proc.stdout }).on('line', (line) => {
  const msg = JSON.parse(line)
  if (msg.type === 'ready') onReady(msg)
  else if (msg.type === 'event') events.push(msg)
  else if (msg.type === 'response') {
    pending.get(msg.id)(msg)
    pending.delete(msg.id)
  }
})

const ready = new Promise((resolve) => (onReady = resolve))

function call(cmd, extra = {}) {
  const id = nextId++
  return new Promise((resolve) => {
    pending.set(id, resolve)
    proc.stdin.write(`${JSON.stringify({ id, cmd, ...extra })}\n`)
  })
}

/** MJPEG 스트림에서 프레임 n장을 받아 JPEG 시그니처를 확인한다 */
function readFrames(url, count) {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const req = get(url, (res) => {
      if (!res.headers['content-type']?.startsWith('multipart/x-mixed-replace')) {
        res.destroy()
        reject(new Error(`content-type: ${res.headers['content-type']}`))
        return
      }
      let buffer = Buffer.alloc(0)
      const frames = []
      res.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk])
        for (;;) {
          const head = buffer.indexOf('\r\n\r\n')
          if (head < 0) return
          const match = /Content-Length: (\d+)/i.exec(buffer.subarray(0, head).toString())
          if (!match) return
          const length = Number(match[1])
          if (buffer.length < head + 4 + length + 2) return
          frames.push(buffer.subarray(head + 4, head + 4 + length))
          buffer = buffer.subarray(head + 4 + length + 2)
          if (frames.length === count) {
            res.destroy()
            resolve({ frames, elapsedMs: Date.now() - started })
            return
          }
        }
      })
    })
    req.on('error', reject)
    req.setTimeout(10_000, () => req.destroy(new Error('스트림 타임아웃')))
  })
}

function statusOf(url) {
  return new Promise((resolve, reject) => {
    const req = get(url, (res) => {
      res.destroy()
      resolve(res.statusCode)
    })
    req.on('error', reject)
  })
}

/** 정지 시 서버가 스트림을 끊는지 확인한다 */
function waitForClose(url, trigger) {
  return new Promise((resolve, reject) => {
    const req = get(url, (res) => {
      res.once('data', () => void trigger())
      res.on('close', () => resolve(true))
      res.on('error', () => resolve(true))
    })
    req.on('error', reject)
    req.setTimeout(10_000, () => req.destroy(new Error('스트림이 닫히지 않음')))
  })
}

const isJpeg = (b) => b[0] === 0xff && b[1] === 0xd8 && b.at(-2) === 0xff && b.at(-1) === 0xd9

try {
  const hello = await ready
  check('ready 알림', hello.protocol === 1 && hello.backend === 'fake')

  const beforeConnect = await call('capture', { path: join(dir, 'x.jpg') })
  check('미연결 촬영은 오류', !beforeConnect.ok && beforeConnect.error.code === 'not-connected')

  const connected = await call('connect')
  check('연결', connected.ok, connected.result?.model)

  const live = await call('startLiveView')
  check('라이브뷰 시작', live.ok && live.result.url.startsWith('http://127.0.0.1:'))

  const wrong = new URL(live.result.url)
  wrong.pathname = '/live/wrong-token'
  check('토큰이 틀리면 404', (await statusOf(wrong.href)) === 404)

  const { frames, elapsedMs } = await readFrames(live.result.url, 24)
  const fps = (frames.length - 1) / (elapsedMs / 1000)
  check('프레임이 JPEG', frames.every(isJpeg))
  check('프레임이 매번 다름', Buffer.compare(frames[0], frames[23]) !== 0)
  check('15fps 이상', fps >= 15, `${fps.toFixed(1)}fps`)

  const path = join(dir, 'cut_01.jpg')
  const started = Date.now()
  const shot = await call('capture', { path })
  const bytes = readFileSync(path)
  check('촬영 파일 생성 (한글 경로)', shot.ok && isJpeg(bytes), `${(bytes.length / 1e6).toFixed(1)}MB`)
  check('크기 보고값 일치', shot.result?.bytes === bytes.length && shot.result?.width === 6000)
  console.log(`      촬영 소요 ${Date.now() - started}ms`)

  const relative = await call('capture', { path: 'relative.jpg' })
  check('상대경로 거부', !relative.ok && relative.error.code === 'bad-path')

  const unknown = await call('nope')
  check('알 수 없는 명령 거부', !unknown.ok && unknown.error.code === 'unknown-command')

  check('라이브뷰 정지 시 스트림 종료', await waitForClose(live.result.url, () => call('stopLiveView')))

  const restarted = await call('startLiveView')
  const again = await readFrames(restarted.result.url, 2)
  check('라이브뷰 재시작', again.frames.every(isJpeg))

  await call('simulateDisconnect')
  check('끊김 이벤트', events.some((e) => e.event === 'disconnected'))
  const status = await call('status')
  check('끊긴 뒤 상태', status.result.connected === false && status.result.liveView === false)
  const afterLoss = await call('capture', { path: join(dir, 'y.jpg') })
  check('끊긴 뒤 촬영은 오류', !afterLoss.ok && afterLoss.error.code === 'not-connected')

  const reconnected = await call('connect')
  check('재연결', reconnected.ok)

  const exited = new Promise((resolve) => proc.once('exit', resolve))
  proc.stdin.end()
  const code = await Promise.race([
    exited,
    new Promise((resolve) => setTimeout(() => resolve('timeout'), 5_000)),
  ])
  check('stdin이 닫히면 종료', code === 0, `exit ${code}`)
} catch (e) {
  check('예외 없이 완료', false, e.message)
} finally {
  proc.kill()
  rmSync(dir, { recursive: true, force: true })
}

console.log(failed ? `\n${failed}건 실패` : '\n전부 통과')
process.exit(failed ? 1 : 0)
