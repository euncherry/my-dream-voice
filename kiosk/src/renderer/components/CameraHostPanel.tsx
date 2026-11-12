/**
 * components/CameraHostPanel.tsx — D-01 카메라 사이드카 점검 (개발 전용)
 *
 * R100은 getUserMedia에 잡히지 않으므로 위쪽 프리뷰와 별도로 확인한다.
 * 연결 → 라이브뷰 → 테스트 촬영 → 파일 저장, 그리고 끊김 처리까지 여기서 본다.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type {
  CameraEvent,
  CameraSelfTestReport,
  CameraStatus,
  SelfTestVerdict,
  SessionPaths,
} from '@shared/types'

const VERDICT: Record<SelfTestVerdict, { label: string; mark: string; color: string }> = {
  pass: { label: '성공', mark: '✓', color: '#2f9e5f' },
  warn: { label: '주의', mark: '!', color: 'var(--c-accent-2)' },
  fail: { label: '실패', mark: '✕', color: 'var(--c-danger)' },
}

const SUMMARY: Record<SelfTestVerdict, string> = {
  pass: '성공 — 실제 카메라로 촬영할 수 있습니다',
  warn: '주의 — 촬영은 되지만 기준보다 느리거나 설정 확인이 필요합니다',
  fail: '실패 — 바탕화면의 결과 폴더를 통째로 보내주세요',
}

const STATE_LABEL: Record<CameraStatus['state'], string> = {
  unavailable: '사용 불가',
  disconnected: '연결 안 됨',
  connected: '연결됨',
  liveview: '라이브뷰 중',
}

/** 실제 카메라(edsdk)는 연결 시점에 크기를 모른다 — 0이면 어디서 확인하는지 안내한다 */
function sizeText(width: number, height: number, unknown: string): string {
  return width > 0 ? `${width}×${height}` : unknown
}

interface TestShot {
  path: string
  bytes: number
  width: number
  height: number
  elapsedMs: number
  url: string
}

export function CameraHostPanel({
  ensureSession,
}: {
  ensureSession: () => Promise<SessionPaths>
}): ReactNode {
  const [status, setStatus] = useState<CameraStatus | null>(null)
  const [liveUrl, setLiveUrl] = useState<string | null>(null)
  const [shot, setShot] = useState<TestShot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastEvent, setLastEvent] = useState<CameraEvent | null>(null)
  const [busy, setBusy] = useState(false)
  const [testing, setTesting] = useState(false)
  const [report, setReport] = useState<CameraSelfTestReport | null>(null)
  const nextIndex = useRef(0)

  const refresh = useCallback(async () => {
    setStatus(await window.api.camera.status())
  }, [])

  useEffect(() => {
    void refresh()
    const unsubscribe = window.api.camera.onEvent((event) => {
      setLastEvent(event)
      setLiveUrl(null)
      void refresh()
    })
    return () => {
      unsubscribe()
      void window.api.camera.stopLiveView().catch(() => undefined)
    }
  }, [refresh])

  useEffect(() => {
    const url = shot?.url
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [shot])

  async function act(work: () => Promise<void>): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await work()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
      await refresh()
    }
  }

  const startLive = (): Promise<void> =>
    act(async () => {
      const live = await window.api.camera.startLiveView()
      setLastEvent(null)
      setLiveUrl(live.url)
    })

  const stopLive = (): Promise<void> =>
    act(async () => {
      setLiveUrl(null)
      await window.api.camera.stopLiveView()
    })

  const testCapture = (): Promise<void> =>
    act(async () => {
      const { sessionId } = await ensureSession()
      const index = nextIndex.current
      nextIndex.current = (index + 1) % 4

      const started = performance.now()
      const saved = await window.api.camera.capture({ sessionId, index })
      const elapsedMs = Math.round(performance.now() - started)

      const bytes = await window.api.photo.read(saved.path)
      const url = URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }))
      setShot({ ...saved, elapsedMs, url })
    })

  const runSelfTest = async (): Promise<void> => {
    setTesting(true)
    setReport(null)
    setError(null)
    // 자가진단이 라이브뷰를 직접 켜고 끈다 — 패널의 스트림은 먼저 내린다
    setLiveUrl(null)
    try {
      setReport(await window.api.camera.selfTest())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setTesting(false)
      await refresh()
    }
  }

  const openFolder = (which: 'test' | 'logs'): void => {
    window.api.camera.openFolder(which).catch((e: Error) => setError(e.message))
  }

  const info = status?.info
  const available = status !== null && status.state !== 'unavailable'

  return (
    <section className="panel">
      <div className="panel__head">
        <strong>②-B 카메라 사이드카 · 라이브뷰 · 촬영</strong>
        {status?.backend === 'fake' && <span className="tag">가짜 카메라 — 실제 촬영 아님</span>}
        {status?.backend === 'edsdk' && <span className="tag">실물 카메라 (EDSDK)</span>}
      </div>

      <div className="selftest">
        <div className="row" style={{ justifyContent: 'flex-start' }}>
          <button className="btn btn--primary" disabled={busy || testing} onClick={() => void runSelfTest()}>
            {testing ? '자가진단 중… (약 30초, 셔터 4번)' : '실카메라 자가진단'}
          </button>
          <button className="btn btn--sm btn--ghost" disabled={!report} onClick={() => openFolder('test')}>
            결과 폴더 열기
          </button>
          <button className="btn btn--sm btn--ghost" onClick={() => openFolder('logs')}>
            카메라 로그 폴더
          </button>
        </div>
        {report && (
          <div className="selftest__result">
            <p className="selftest__summary" style={{ color: VERDICT[report.verdict].color }}>
              {SUMMARY[report.verdict]}
            </p>
            <ul className="selftest__items">
              {report.items.map((item) => (
                <li key={item.name}>
                  <span className="selftest__mark" style={{ background: VERDICT[item.verdict].color }}>
                    {VERDICT[item.verdict].mark}
                  </span>
                  <strong>{item.name}</strong>
                  <span>{item.detail}</span>
                </li>
              ))}
            </ul>
            <p className="selftest__dir">결과 폴더: {report.dir}</p>
          </div>
        )}
      </div>

      <div className="row" style={{ justifyContent: 'flex-start' }}>
        <button
          className="btn btn--sm"
          disabled={busy || !available}
          onClick={() => void act(async () => void (await window.api.camera.connect()))}
        >
          연결
        </button>
        <button className="btn btn--sm" disabled={busy || !available} onClick={() => void startLive()}>
          라이브뷰 시작
        </button>
        <button className="btn btn--sm btn--ghost" disabled={busy} onClick={() => void stopLive()}>
          정지
        </button>
        <button className="btn btn--sm" disabled={busy || !available} onClick={() => void testCapture()}>
          {busy ? '처리 중…' : '테스트 촬영'}
        </button>
        {status?.backend === 'fake' && (
          <button
            className="btn btn--sm btn--ghost"
            disabled={busy}
            onClick={() => void act(() => window.api.camera.simulateDisconnect())}
          >
            USB 분리 흉내
          </button>
        )}
      </div>

      {status?.reason && <p className="err">{status.reason}</p>}
      {error && <p className="err">{error}</p>}
      {lastEvent && (
        <p className="err">
          끊김 감지 · {lastEvent.type} · {lastEvent.message}
        </p>
      )}

      <div className="cam">
        {liveUrl ? (
          <img className="cam__video" src={liveUrl} alt="라이브뷰" />
        ) : (
          <div className="cam__video" />
        )}
        {shot ? (
          <img className="cam__video" src={shot.url} alt="테스트 촬영 결과" />
        ) : (
          <div className="cam__video" />
        )}
        <dl className="kv">
          <dt>상태</dt>
          <dd>{status ? STATE_LABEL[status.state] : '—'}</dd>
          <dt>모델</dt>
          <dd>{info?.model ?? '—'}</dd>
          <dt>사진 해상도</dt>
          <dd>{info ? sizeText(info.photoWidth, info.photoHeight, '촬영 결과에 표시') : '—'}</dd>
          <dt>라이브뷰 크기</dt>
          <dd>{info ? sizeText(info.liveViewWidth, info.liveViewHeight, '사이드카 로그에 표시') : '—'}</dd>
          <dt>촬영 소요</dt>
          <dd>{shot ? `${shot.elapsedMs}ms` : '—'}</dd>
          <dt>저장 파일</dt>
          <dd>
            {shot ? `${shot.path} (${shot.width}×${shot.height}, ${(shot.bytes / 1e6).toFixed(1)}MB)` : '—'}
          </dd>
        </dl>
      </div>
    </section>
  )
}
