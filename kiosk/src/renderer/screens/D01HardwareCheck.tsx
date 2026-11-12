/**
 * D-01 [하드웨어 체크] 🟢 개발 전용 — 스파이크 ①
 *
 * 완료 기준 (SPIKE_PLAN ①)
 *   1. 연결된 카메라/마이크/스피커 장치 목록이 표시된다
 *   2. 카메라 프리뷰가 뜨고, 요청 해상도가 실제로 적용된 값으로 표시된다
 *   3. 마이크 레벨 미터가 실시간으로 움직인다
 *   4. DSP 3종 off 상태로 녹음되고, on/off 비교 녹음이 가능하다
 *   5. 스피커 테스트음이 재생된다
 *   6. USB 재연결 후에도 장치를 다시 찾을 수 있다 (deviceId 유지 여부 기록)
 *
 * 여기서 채집한 WAV가 이후 분석 스파이크의 입력이 된다 (SPIKE_PLAN 산출물 3).
 * 세션 폴더는 'dev-' 접두사로 만들어 P-11 폐기 대상과 구분한다.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { CameraHostPanel } from '../components/CameraHostPanel'
import { PrintTestPanel } from '../components/PrintTestPanel'
import { Screen } from '../components/Screen'
import { useSession } from '../store/session'
import { useDevices } from '../audio/useDevices'
import { DSP_OFF, useAudioCapture } from '../audio/useAudioCapture'
import { playSavedWav, playSpeakerTest, stopAll } from '../audio/playback'
import { cutCells } from '../photo/composeFourCut'
import { RESOLUTION_PRESETS, type ResolutionPreset } from '@shared/constants'
import { linesFor } from '@shared/jobs'
import type {
  AnalysisInput,
  AnalysisOutput,
  DspFlags,
  EnvInfo,
  JobId,
  PrinterConnection,
  PrinterInfo,
  SessionPaths,
  SpeechFeature,
} from '@shared/types'

/** 네컷 인쇄에 필요한 컷 1개 크기 — 카메라 해상도 판정 기준 */
const CUT = cutCells()[0]!

interface Recorded {
  path: string
  bytes: number
  durationSec: number
  dsp: DspFlags
  sourceRate: number
  /** 저장 시 메인이 실측한 음향 특성 (진폭·무음·음도) */
  quality?: SpeechFeature
}

const PRINTER_CONNECTION_LABEL: Record<PrinterConnection, string> = {
  usb: 'USB 연결',
  network: '네트워크',
  virtual: '가상 프린터',
  other: '기타',
}

/** IPC 연동 확인용 — 녹음 순서대로 붙일 직업 */
const IPC_CHECK_JOBS: JobId[] = ['police', 'chef', 'singer', 'astronaut']

export function D01HardwareCheck(): ReactNode {
  const goto = useSession((s) => s.goto)
  const { devices, log, permission, error: deviceError, requestPermission, refresh } = useDevices()
  const capture = useAudioCapture()

  const [env, setEnv] = useState<EnvInfo | null>(null)
  const [printers, setPrinters] = useState<PrinterInfo[]>([])
  const [paths, setPaths] = useState<SessionPaths | null>(null)

  // 카메라
  const videoRef = useRef<HTMLVideoElement>(null)
  const camStreamRef = useRef<MediaStream | null>(null)
  const [camId, setCamId] = useState('')
  const [preset, setPreset] = useState<ResolutionPreset>(RESOLUTION_PRESETS[0]!)
  const [camSettings, setCamSettings] = useState<MediaTrackSettings | null>(null)
  const [camError, setCamError] = useState<string | null>(null)

  // 마이크
  const [micId, setMicId] = useState('')
  const [dsp, setDsp] = useState<DspFlags>(DSP_OFF)
  const [recorded, setRecorded] = useState<Recorded[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  // IPC 연동 확인 (검수 ④) — 요청/응답을 그대로 보여준다
  const mockScenario = useSession((s) => s.mockScenario)
  const [ipcReq, setIpcReq] = useState<AnalysisInput | null>(null)
  const [ipcRes, setIpcRes] = useState<AnalysisOutput | null>(null)
  const [ipcErr, setIpcErr] = useState<string | null>(null)
  const [speakerResult, setSpeakerResult] = useState<string | null>(null)

  const cameras = devices.filter((d) => d.kind === 'videoinput')
  const mics = devices.filter((d) => d.kind === 'audioinput')
  const speakers = devices.filter((d) => d.kind === 'audiooutput')

  /** 프린터는 미디어 장치와 달리 꽂아도 이벤트가 안 와서 버튼으로 다시 읽는다 */
  const loadPrinters = useCallback(async () => {
    try {
      setPrinters(await window.api.system.listPrinters())
    } catch {
      setPrinters([])
    }
  }, [])

  useEffect(() => {
    void window.api.system.envInfo().then(setEnv)
    void loadPrinters()
  }, [loadPrinters])

  // 기본 장치 자동 선택 — 'Default -' / 'Communications -' 별칭은 피한다.
  // 그걸 골라두면 Windows 기본 장치가 바뀔 때 조용히 다른 마이크로 녹음된다.
  useEffect(() => {
    const pickReal = (list: typeof devices): string =>
      list.find((d) => d.present && !d.isPseudo)?.deviceId ??
      list.find((d) => d.present)?.deviceId ??
      ''
    if (!camId && cameras.length) setCamId(pickReal(cameras))
    if (!micId && mics.length) setMicId(pickReal(mics))
  }, [cameras, mics, camId, micId, devices])

  const stopCamera = useCallback(() => {
    camStreamRef.current?.getTracks().forEach((t) => t.stop())
    camStreamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setCamSettings(null)
  }, [])

  useEffect(() => stopCamera, [stopCamera])

  const startCamera = useCallback(async () => {
    setCamError(null)
    stopCamera()
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          ...(camId ? { deviceId: { exact: camId } } : {}),
          // ideal — 카메라가 못 맞추면 조용히 낮은 값으로 떨어진다.
          // 그래서 아래에서 "실제 적용값"을 반드시 확인한다.
          width: { ideal: preset.width },
          height: { ideal: preset.height },
        },
      })
      camStreamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setCamSettings(stream.getVideoTracks()[0]!.getSettings())
    } catch (e) {
      setCamError((e as Error).message)
    }
  }, [camId, preset, stopCamera])

  async function ensureSession(): Promise<SessionPaths> {
    if (paths) return paths
    const p = await window.api.session.begin('dev')
    setPaths(p)
    return p
  }

  async function toggleRecord(): Promise<void> {
    if (capture.recording) {
      setBusy('저장 중…')
      try {
        const result = await capture.stop()
        if (!result || result.pcm.length === 0) return

        const p = await ensureSession()
        const saved = await window.api.recording.saveWav({
          sessionId: p.sessionId,
          index: recorded.length,
          jobId: 'police', // D-01은 직업과 무관 — 파일명 자리만 채운다
          pcm: result.pcm.buffer as ArrayBuffer,
          sampleRate: result.sampleRate,
          dsp,
        })
        setRecorded((r) => [
          ...r,
          {
            path: saved.path,
            bytes: saved.bytes,
            durationSec: result.durationSec,
            dsp,
            sourceRate: result.sampleRate,
            quality: saved.quality,
          },
        ])
      } finally {
        setBusy(null)
      }
    } else {
      // ⚠️ 녹음 시작 전 모든 출력 정지 (CLAUDE.md 금지사항 6)
      stopAll()
      setSpeakerResult(null)
      await ensureSession()
      await capture.start(micId || undefined, dsp)
    }
  }

  async function onSpeakerTest(): Promise<void> {
    if (capture.recording) return
    const kind = await playSpeakerTest()
    setSpeakerResult(
      kind === 'file'
        ? 'speaker-test.mp3 재생'
        : '파일 없음 → 440Hz 사인파로 대체 (public/audio/README.md 참조)',
    )
  }

  /** 검수 ④ — 녹음한 WAV로 analysis.run IPC를 실제 호출하고 응답을 그대로 표시 */
  async function onIpcCheck(): Promise<void> {
    if (!paths || recorded.length === 0) return
    const jobs = IPC_CHECK_JOBS.slice(0, recorded.length)
    const req: AnalysisInput = {
      sessionId: paths.sessionId,
      ageGroup: '6-7',
      jobs,
      lines: linesFor(jobs, '6-7').map((l) => l.text),
      recordings: recorded.map((r) => r.path),
      scenario: mockScenario,
    }
    setIpcReq(req)
    setIpcRes(null)
    setIpcErr(null)
    setBusy('analysis.run 호출 중…')
    try {
      setIpcRes(await window.api.analysis.run(req))
    } catch (e) {
      setIpcErr((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function onPlaySaved(path: string): Promise<void> {
    if (capture.recording) return
    setBusy('재생 중…')
    try {
      await playSavedWav(path)
    } catch (e) {
      setBusy(null)
      alert(`재생 실패: ${(e as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  const applied = camSettings
  const meets300dpi = applied?.height ? applied.height >= CUT.height : false

  return (
    <Screen id="D-01" note="스파이크 ①">
      <div className="hw">
        {/* ── 1. 장치 ─────────────────────────────── */}
        <section className="panel">
          <div className="panel__head">
            <strong>① 장치 목록</strong>
            <span className="tag">{permission === 'granted' ? '권한 있음' : '권한 필요'}</span>
          </div>

          <div className="row" style={{ justifyContent: 'flex-start' }}>
            <button
              className="btn btn--sm btn--primary"
              onClick={() => {
                void requestPermission()
                void loadPrinters()
              }}
            >
              권한 요청 + 새로고침
            </button>
            <button
              className="btn btn--sm"
              onClick={() => {
                void refresh()
                void loadPrinters()
              }}
            >
              다시 조회
            </button>
          </div>

          {deviceError && <p className="err">{deviceError}</p>}

          <table className="tbl tbl--devices">
            <thead>
              <tr>
                <th>종류</th>
                <th>이름</th>
                <th>deviceId / 포트</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => (
                <tr key={d.deviceId} data-off={!d.present}>
                  <td>
                    {d.kind === 'videoinput' ? '카메라' : d.kind === 'audioinput' ? '마이크' : '스피커'}
                  </td>
                  <td>
                    {d.label}
                    {d.isPseudo && <span className="tag" style={{ marginLeft: 8 }}>Windows 별칭</span>}
                  </td>
                  <td className="mono">{d.deviceId.slice(0, 16)}…</td>
                  <td>
                    {!d.present ? '분리됨' : d.returnedSameId ? '재연결 · id 유지 ✅' : '연결됨'}
                  </td>
                </tr>
              ))}
              {devices.length === 0 && (
                <tr>
                  <td colSpan={4}>장치 없음 — [권한 요청]을 눌러주세요</td>
                </tr>
              )}
              {printers.map((p) => (
                <tr
                  key={`printer-${p.name}`}
                  style={p.connection === 'virtual' ? { opacity: 0.5 } : undefined}
                >
                  <td>프린터</td>
                  <td>
                    {p.displayName}
                    {p.isDefault && (
                      <span className="tag" style={{ marginLeft: 8 }}>
                        기본
                      </span>
                    )}
                  </td>
                  <td className="mono" title={p.port}>
                    {!p.port ? '—' : p.port.length > 18 ? `${p.port.slice(0, 16)}…` : p.port}
                  </td>
                  <td>
                    {PRINTER_CONNECTION_LABEL[p.connection]}
                    {p.offline && <span style={{ color: 'var(--c-danger)' }}> · 오프라인</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="hint">
            ⑥ 확인법: 웹캠/마이크 USB를 <b>다른 포트에 다시 꽂고</b> 위 표에서 deviceId가 그대로인지
            본다. 아래 로그에 자동 기록된다.
          </p>

          <ul className="log">
            {log.map((l, i) => (
              <li key={i}>
                <span className="mono">{l.at}</span> {l.message}
              </li>
            ))}
          </ul>
        </section>

        {/* ── 2. 카메라 ───────────────────────────── */}
        <section className="panel">
          <div className="panel__head">
            <strong>② 카메라 프리뷰 · 실제 적용 해상도</strong>
          </div>

          <div className="row" style={{ justifyContent: 'flex-start' }}>
            <select className="sel" value={camId} onChange={(e) => setCamId(e.target.value)}>
              {cameras.map((c) => (
                <option key={c.deviceId} value={c.deviceId} disabled={!c.present}>
                  {c.label}
                </option>
              ))}
              {cameras.length === 0 && <option value="">카메라 없음</option>}
            </select>

            {RESOLUTION_PRESETS.map((p) => (
              <button
                key={p.id}
                className={`btn btn--sm ${preset.id === p.id ? 'btn--primary' : ''}`}
                onClick={() => setPreset(p)}
              >
                {p.label}
              </button>
            ))}

            <button className="btn btn--sm" onClick={() => void startCamera()}>
              프리뷰 시작
            </button>
            <button className="btn btn--sm btn--ghost" onClick={stopCamera}>
              정지
            </button>
          </div>

          {camError && <p className="err">{camError}</p>}

          <div className="cam">
            <video ref={videoRef} muted playsInline className="cam__video" />
            <dl className="kv">
              <dt>요청</dt>
              <dd>
                {preset.width}×{preset.height}
              </dd>
              <dt>실제 적용</dt>
              <dd>
                {applied
                  ? `${applied.width}×${applied.height} @ ${Math.round(applied.frameRate ?? 0)}fps`
                  : '—'}
              </dd>
              <dt>일치 여부</dt>
              <dd>
                {applied
                  ? applied.width === preset.width && applied.height === preset.height
                    ? '요청대로 적용됨'
                    : '⚠️ 카메라가 못 맞춰 낮은 값으로 떨어짐'
                  : '—'}
              </dd>
              <dt>인쇄 300dpi</dt>
              <dd>
                {applied
                  ? meets300dpi
                    ? `충족 (컷 1개 세로 ${CUT.height}px 필요)`
                    : `⚠️ 부족 — 컷 1개에 세로 ${CUT.height}px 필요한데 ${applied.height}px`
                  : '—'}
              </dd>
            </dl>
          </div>
        </section>

        <CameraHostPanel ensureSession={ensureSession} />

        {/* ── 3·4. 마이크 ─────────────────────────── */}
        <section className="panel">
          <div className="panel__head">
            <strong>③④ 마이크 · 레벨 미터 · DSP</strong>
          </div>

          <div className="row" style={{ justifyContent: 'flex-start' }}>
            <select
              className="sel"
              value={micId}
              onChange={(e) => setMicId(e.target.value)}
              disabled={capture.recording}
            >
              {mics.map((m) => (
                <option key={m.deviceId} value={m.deviceId} disabled={!m.present}>
                  {m.isPseudo ? `⚠ ${m.label}` : m.label}
                </option>
              ))}
              {mics.length === 0 && <option value="">마이크 없음</option>}
            </select>
          </div>

          <div className="row" style={{ justifyContent: 'flex-start' }}>
            {(
              [
                ['noiseSuppression', '잡음제거'],
                ['echoCancellation', '에코제거'],
                ['autoGainControl', '자동음량'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className={`chk ${dsp[key] ? 'chk--on' : ''}`}>
                <input
                  type="checkbox"
                  checked={dsp[key]}
                  disabled={capture.recording}
                  onChange={(e) => setDsp((d) => ({ ...d, [key]: e.target.checked }))}
                />
                {label} {dsp[key] ? 'ON' : 'off'}
              </label>
            ))}
            <button className="btn btn--sm btn--ghost" onClick={() => setDsp(DSP_OFF)}>
              전부 off로
            </button>
          </div>

          <p className="hint">
            ⚠️ 본 플로우(P-05)는 <b>항상 전부 off</b>다 (CLAUDE.md 금지사항 5). 여기서만 켜서
            비교한다 — 같은 말을 off/on 두 번 녹음해 파일을 비교하면 ㅅ·ㅆ가 어떻게 깎이는지 보인다.
          </p>

          <div className="meter">
            <div className="meter__fill" style={{ width: `${capture.level * 100}%` }} />
          </div>

          <div className="row" style={{ justifyContent: 'flex-start' }}>
            <button
              className={`btn ${capture.recording ? 'btn--danger' : 'btn--primary'}`}
              onClick={() => void toggleRecord()}
              disabled={!!busy}
            >
              {capture.recording ? `■ 정지 (${capture.elapsedSec.toFixed(1)}s)` : '● 녹음'}
            </button>
            {busy && <span className="hint">{busy}</span>}
          </div>

          {capture.error && <p className="err">{capture.error}</p>}

          {capture.settings && (
            <dl className="kv">
              <dt>실제 적용 DSP</dt>
              <dd>
                잡음제거 {String(capture.settings.noiseSuppression ?? '—')} · 에코제거{' '}
                {String(capture.settings.echoCancellation ?? '—')} · 자동음량{' '}
                {String(capture.settings.autoGainControl ?? '—')}
              </dd>
              <dt>채널 / 샘플레이트</dt>
              <dd>
                {capture.settings.channelCount ?? '—'}ch / {capture.settings.sampleRate ?? '—'}Hz
                {' → 저장은 16000Hz 모노로 변환'}
              </dd>
            </dl>
          )}
        </section>

        {/* ── 녹음 결과 ───────────────────────────── */}
        <section className="panel">
          <div className="panel__head">
            <strong>채집한 WAV ({recorded.length})</strong>
            {paths && (
              <button
                className="btn btn--sm btn--ghost"
                onClick={() => void window.api.system.revealPath(paths.audioDir)}
              >
                폴더 열기
              </button>
            )}
          </div>

          <table className="tbl">
            <thead>
              <tr>
                <th>파일</th>
                <th>길이</th>
                <th>진폭(RMS)</th>
                <th>피크</th>
                <th>무음</th>
                <th>음도</th>
                <th>판정</th>
                <th>DSP</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {recorded.map((r) => (
                <tr key={r.path} style={r.quality && !r.quality.usable ? { opacity: 0.55 } : undefined}>
                  <td className="mono">{r.path.split(/[\\/]/).pop()}</td>
                  <td>{r.durationSec.toFixed(1)}s</td>
                  <td className="mono">{r.quality?.amplitudeRms.toFixed(2) ?? '—'}</td>
                  <td className="mono">{r.quality?.peak.toFixed(2) ?? '—'}</td>
                  <td className="mono">
                    {r.quality ? `${Math.round(r.quality.silenceRatio * 100)}%` : '—'}
                  </td>
                  <td>{r.quality?.pitchSummary ?? '—'}</td>
                  <td>{r.quality ? (r.quality.usable ? 'usable' : '⚠ 재시도') : '—'}</td>
                  <td>
                    {r.dsp.noiseSuppression || r.dsp.echoCancellation || r.dsp.autoGainControl
                      ? 'ON'
                      : 'off'}
                  </td>
                  <td>
                    <button
                      className="btn btn--sm"
                      onClick={() => void onPlaySaved(r.path)}
                      disabled={!!busy || capture.recording}
                    >
                      ▶ 청음
                    </button>
                  </td>
                </tr>
              ))}
              {recorded.length === 0 && (
                <tr>
                  <td colSpan={9}>아직 없음</td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="hint">
            [▶ 청음]은 메모리가 아니라 <b>저장된 파일을 다시 읽어</b> 재생한다 — 16kHz 변환 결과가
            멀쩡한지 귀로 확인하는 것이 목적이다.
          </p>
        </section>

        {/* ── IPC 연동 확인 (검수 ④) ─────────────── */}
        <section className="panel">
          <div className="panel__head">
            <strong>IPC 연동 확인 — analysis.run</strong>
            <span className="tag">진폭·무음·음도 실측 · 전사·음소는 MOCK</span>
          </div>

          <div className="row" style={{ justifyContent: 'flex-start' }}>
            <button
              className="btn btn--sm btn--primary"
              onClick={() => void onIpcCheck()}
              disabled={!!busy || capture.recording || recorded.length === 0}
            >
              녹음 {recorded.length}건으로 호출
            </button>
            {ipcRes && (
              <span className="hint">
                응답 {ipcRes.elapsedMs.toLocaleString()}ms · speechFeatures {ipcRes.speechFeatures.length}건
              </span>
            )}
          </div>

          {ipcErr && <p className="err">{ipcErr}</p>}

          {ipcReq && (
            <div className="cam" style={{ alignItems: 'stretch' }}>
              <pre className="ipc-json">
                {'// 요청 → window.api.analysis.run\n'}
                {JSON.stringify(ipcReq, null, 2)}
              </pre>
              <pre className="ipc-json">
                {'// 응답 ← AnalysisOutput\n'}
                {ipcRes ? JSON.stringify(ipcRes, null, 2) : '(대기 중…)'}
              </pre>
            </div>
          )}
        </section>

        {/* ── 5. 스피커 · 환경 ────────────────────── */}
        <section className="panel">
          <div className="panel__head">
            <strong>⑤ 스피커 · 환경</strong>
          </div>

          <div className="row" style={{ justifyContent: 'flex-start' }}>
            <button
              className="btn btn--sm"
              onClick={() => void onSpeakerTest()}
              disabled={capture.recording}
            >
              🔊 테스트음 재생
            </button>
            <button
              className="btn btn--sm btn--ghost"
              onClick={() => {
                stopAll()
                setSpeakerResult(null)
              }}
            >
              ■ 정지
            </button>
            {speakerResult && <span className="hint">{speakerResult}</span>}
          </div>

          <dl className="kv">
            <dt>출력 장치</dt>
            <dd>
              {speakers.filter((s) => s.present).map((s) => s.label).join(', ') || '—'}
            </dd>
            <dt>Electron / Chromium</dt>
            <dd>
              {env?.electron ?? '…'} / {env?.chrome ?? '…'}
            </dd>
            <dt>세션 폴더</dt>
            <dd>{paths?.root ?? `${env?.dataRoot ?? '…'} (녹음 시 생성)`}</dd>
            <dt>프린터</dt>
            <dd>
              {printers.map((p) => `${p.displayName}${p.isDefault ? ' (기본)' : ''}`).join(', ') ||
                '연결된 프린터 없음'}
            </dd>
          </dl>
        </section>

        <PrintTestPanel printers={printers} ensureSession={ensureSession} />

        <div className="row">
          <button className="btn btn--primary" onClick={() => goto('P-00')}>
            플로우 시작 (P-00)
          </button>
        </div>
      </div>
    </Screen>
  )
}
