/**
 * camera-host/edsdk-test.mjs — 실물 R100 시험 (npm run camera:test:edsdk)
 *
 * 카메라 없이 돌리면: SDK 로드·카메라 탐색·재시도·종료까지만 확인한다.
 * 카메라를 꽂고 돌리면: 연결 → 라이브뷰(크기·fps) → 4컷 연속 촬영(지연 측정) → 촬영 뒤 라이브뷰 재개 → 정리.
 *
 * 시험 전에 EOS Utility·EOS Webcam Utility를 종료한다 (카메라를 먼저 잡고 있으면 연결이 안 된다).
 * 사진은 sessions/_edsdk-test-<시각>/ 에 남겨 눈으로 확인한다 (sessions/는 저장소 제외).
 */

import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { get } from 'node:http'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const exe = join(here, 'publish', 'CameraHost.exe')
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
const outDir = join(here, '..', 'sessions', `_edsdk-test-${stamp}`)

let failed = 0
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
  if (!ok) failed++
}
const note = (text) => console.log(`      ${text}`)

const proc = spawn(exe, ['--backend', 'edsdk'], { stdio: ['pipe', 'pipe', 'pipe'] })
const pending = new Map()
const events = []
let nextId = 1
let onReady
let onFatal

proc.stderr.on('data', (chunk) => {
  for (const line of chunk.toString().split(/\r?\n/)) if (line) console.log(`      [host] ${line}`)
})

createInterface({ input: proc.stdout }).on('line', (line) => {
  const msg = JSON.parse(line)
  if (msg.type === 'ready') onReady(msg)
  else if (msg.type === 'fatal') onFatal(msg)
  else if (msg.type === 'event') events.push(msg)
  else if (msg.type === 'response') {
    pending.get(msg.id)(msg)
    pending.delete(msg.id)
  }
})

const ready = new Promise((resolve, reject) => {
  onReady = resolve
  onFatal = (msg) => reject(new Error(`${msg.code}: ${msg.message}`))
})

function call(cmd, extra = {}) {
  const id = nextId++
  return new Promise((resolve) => {
    pending.set(id, resolve)
    proc.stdin.write(`${JSON.stringify({ id, cmd, ...extra })}\n`)
  })
}

/** JPEG 헤더에서 크기만 읽는다 (CameraHost의 Jpeg.Size와 같은 방식) */
function jpegSize(b) {
  if (b[0] !== 0xff || b[1] !== 0xd8) return null
  let i = 2
  while (i + 8 < b.length) {
    if (b[i] !== 0xff) return null
    const m = b[i + 1]
    if (m === 0xff) { i++; continue }
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd8)) { i += 2; continue }
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) }
    }
    i += 2 + b.readUInt16BE(i + 2)
  }
  return null
}

/** MJPEG 스트림에서 프레임 n장을 받는다 */
function readFrames(url, count, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const req = get(url, (res) => {
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
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`프레임 ${count}장을 받지 못함`)))
  })
}

const isJpeg = (b) => b[0] === 0xff && b[1] === 0xd8

try {
  const hello = await ready
  check('ready 알림 (edsdk)', hello.backend === 'edsdk')

  const connected = await call('connect')
  if (!connected.ok && connected.error.code === 'not-found') {
    check('카메라 없음을 정확히 보고', true, connected.error.message)
    const again = await call('connect')
    check('다시 찾기 (SDK 재초기화)', !again.ok && again.error.code === 'not-found')
    const shot = await call('capture', { path: join(outDir, 'x.jpg') })
    check('미연결 촬영은 오류', !shot.ok && shot.error.code === 'not-connected')
    note('카메라가 없어 여기까지만 확인했습니다. R100을 USB로 연결하고 다시 실행하세요.')
  } else {
    check('연결', connected.ok, connected.ok ? connected.result.model : `${connected.error.code}: ${connected.error.message}`)
    if (!connected.ok) throw new Error('연결 실패 — 위 메시지 확인')

    const live = await call('startLiveView')
    check('라이브뷰 시작', live.ok, live.ok ? '' : live.error.message)

    const first = await readFrames(live.result.url, 1, 10_000)
    note(`첫 프레임까지 ${first.elapsedMs}ms`)
    const { frames, elapsedMs } = await readFrames(live.result.url, 60)
    const fps = (frames.length - 1) / (elapsedMs / 1000)
    const size = jpegSize(frames[0])
    check('라이브뷰 프레임이 JPEG', frames.every(isJpeg))
    check('라이브뷰 15fps 이상', fps >= 15, `${fps.toFixed(1)}fps`)
    note(`라이브뷰 크기 ${size?.width}×${size?.height}, 평균 ${Math.round(frames.reduce((a, f) => a + f.length, 0) / frames.length / 1024)}KB/프레임`)

    mkdirSync(outDir, { recursive: true })
    const latencies = []
    for (let i = 1; i <= 4; i++) {
      const path = join(outDir, `cut_0${i}.jpg`)
      const started = Date.now()
      const shot = await call('capture', { path })
      const ms = Date.now() - started
      if (!shot.ok) {
        check(`촬영 ${i}`, false, `${shot.error.code}: ${shot.error.message}`)
        continue
      }
      const bytes = readFileSync(path)
      const real = jpegSize(bytes)
      latencies.push(ms)
      check(
        `촬영 ${i}`,
        isJpeg(bytes) && real?.width === shot.result.width && shot.result.bytes === bytes.length,
        `${ms}ms, ${shot.result.width}×${shot.result.height}, ${(bytes.length / 1e6).toFixed(1)}MB`,
      )
      // 실제 키오스크처럼 컷 사이에 라이브뷰가 다시 나오는지 본다
      const resumed = await readFrames(live.result.url, 3, 10_000).catch((e) => e)
      check(`촬영 ${i} 뒤 라이브뷰 재개`, !(resumed instanceof Error), resumed instanceof Error ? resumed.message : `${resumed.elapsedMs}ms`)
    }
    if (latencies.length) {
      note(`촬영 소요 평균 ${Math.round(latencies.reduce((a, b) => a + b) / latencies.length)}ms (셔터+전송+저장)`)
      note(`사진 폴더: ${outDir}`)
    }

    const stopped = await call('stopLiveView')
    check('라이브뷰 정지', stopped.ok)
    const gone = await call('disconnect')
    check('연결 해제', gone.ok)
  }

  check('끊김 이벤트 없음', events.length === 0, events.map((e) => e.message).join(' / '))

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
}

console.log(failed ? `\n${failed}건 실패` : '\n전부 통과')
process.exit(failed ? 1 : 0)
