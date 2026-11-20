/**
 * P-07 [분석 및 프린트] 🆕 — 촬영 다음 한 페이지 (A모드는 프린트만)
 *
 * 근거: PAGE_SPEC "P-07 [분석 및 프린트]" · "M-02" · "M-03" / SPEC §2(진행 순서) · §4-1(아이 화면) · §6-1 · §6-2 / V2_PLAN §3
 * 구성 스케치: docs/user-flow/wf/p07-result-a.svg · p07-result-b-analyzing.svg · p07-result-b.svg
 * (v1의 P-07[분석 중] · P-08[결과] · P-09[인쇄] · P-10[QR 제공]을 한 화면으로 합쳤다. QR은 없다)
 *
 * 화면 구성
 *   ① 진행도 — B: 분석 중 → 프린트 중 / A: 프린트 중
 *   ② 촬영 장면 영상 — 도착 즉시 반복 재생 (거울처럼 좌우 반전 · 소리 없음)
 *   ③ A: SD 캐릭터 + 한 줄 긍정 문구 (직업 · 사진 칭찬 — 목소리 칭찬 금지)
 *      B: 분석 중 연출 → 분석이 끝나면 리포트 미리보기 (관찰 결과는 가린다)
 *   ④ 메일 안내 (B만 · QR 없음)
 *   ⑤ 사진 나오는 곳 안내
 *   [뒤로] 없음
 *
 * 동작 — 한 세션에 한 번만 돈다 (runPipeline)
 *   A: 도착하자마자 인쇄
 *   B: 분석 → (성공) 리포트 문구 완성 → 서버 전송을 뒤에서 시작 → 인쇄
 *            (실패) 미리보기 · 전송 없이 인쇄 — M-02를 띄우지 않는다
 *   인쇄 실패만 M-02[오류·폴백 안내]를 띄운다. [확인]으로 닫히면 완료로 넘어간다
 *   완료: 인쇄가 끝나고 (B) 분석 · 전송까지 끝나면(성공이든 실패든) M-03[완료 안내]
 *         — 먼저 띄우면 리포트 데이터가 나가기 전에 세션이 지워진다
 *
 * 진행 상태는 세션 스토어(session.analysis · reportSend · print)가 단일 소스이고, 화면은 그것을 그린다.
 *
 * ⚠️ 아이 화면에 관찰 결과 · 인식률 · 받아쓴 글자를 내보내지 않는다 (CLAUDE.md 금지사항 7).
 *    분석 실패 · 전송 실패도 화면에 쓰지 않는다 (아이가 할 수 있는 일이 없다 — SPEC §6-1).
 * ⚠️ 분석 · PDF · 인쇄 · 서버 통신 · 파일 읽기는 전부 메인(window.api)이 한다 (CLAUDE.md 금지사항 2).
 * ⚠️ MOCK: 정밀 분석(main/mock/analysis.ts) · 서버(main/mock/server.ts)는 아직 mock이다.
 * ⚠️ 색 · 글꼴 · 배치는 임시 — 피그마 디자인이 오면 입힌다. 문구 · 아트 미확정 자리는 PLACEHOLDER.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { DevStrip, Placeholder, PlaceholderTag, Screen } from '../components/Screen'
import { ReportPreview } from '../report/ReportPreview'
import { buildReportText, positiveMessageFor } from '../report/copy'
import { useSession } from '../store/session'
import { PRINT_REQUEST_TIMEOUT_MS, PRINT_WAIT_MS } from '@shared/constants'
import { targetLinesFor } from '@shared/jobs'
import type { ObservationResult, ReportText, SendReportRequest, Session } from '@shared/types'
import '../styles/p07.css'

/** M-02에 띄우는 인쇄 실패 문구 (v1 P-09와 같은 문구) */
const PRINT_FAIL_MESSAGE = '사진 출력이 조금 늦어지고 있어요. 옆의 직원에게 알려주세요!'

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

// ────────────────────────────────────────────────────────────
// 파이프라인 — 분석 → (전송) → 인쇄. 한 세션에 한 번만 돈다
//
// 컴포넌트 밖에 둔다 — 언마운트로 취소하지 않는다(취소하면 종이는 나왔는데 상태가 안 남는다).
// 대신 세션이 도중에 바뀌면(개발용 화면 이동 등) 새 세션에는 아무것도 쓰지 않는다.
// ────────────────────────────────────────────────────────────

interface SessionWriter {
  /** 이 파이프라인이 시작한 세션이 아직 그대로인가 */
  alive: () => boolean
  patch: (partial: Partial<Session>) => void
}

function writerFor(sessionId: string): SessionWriter {
  const alive = (): boolean => useSession.getState().session.sessionId === sessionId
  return {
    alive,
    patch: (partial) => {
      if (alive()) useSession.getState().patch(partial)
    },
  }
}

/**
 * 프린터 고르기 — USB로 꽂혀 있는 것(DNP) 우선 → 없으면 OS 기본 프린터.
 *
 * 가상 프린터(PDF 저장 · XPS · 팩스)는 고르지 않는다 — 저장 창이 떠서 인쇄 요청이 끝나지 않는다.
 * 고른 프린터가 꺼져 있으면(오프라인) 보내지 않고 실패로 본다 — 큐에만 쌓였다가 프린터를 켤 때
 * 앞 손님들 사진이 한꺼번에 나오고, 화면에는 "사진이 나왔어요"가 떠 버린다.
 */
async function pickPrinterName(): Promise<string> {
  const printers = (await window.api.system.listPrinters()).filter((p) => p.connection !== 'virtual')
  const picked =
    printers.find((p) => p.connection === 'usb' && !p.offline) ??
    printers.find((p) => p.connection === 'usb') ??
    printers.find((p) => p.isDefault)
  if (!picked) throw new Error('쓸 수 있는 프린터를 찾지 못함 (가상 프린터 제외)')
  if (picked.offline) throw new Error(`프린터가 꺼져 있거나 연결이 끊김: ${picked.name}`)
  return picked.name
}

/** 인쇄 요청이 끝나지 않을 때(드라이버 대화창 · 멈춤) 실패로 넘긴다 */
function withPrintTimeout<T>(work: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`인쇄 요청 시간 초과 (${PRINT_REQUEST_TIMEOUT_MS / 1000}초)`)),
      PRINT_REQUEST_TIMEOUT_MS,
    )
    work.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

/**
 * 인쇄 — 실패하면 M-02를 띄운다 (분석 · 전송 실패와 달리 직원이 도울 수 있다).
 * 드라이버가 "다 나왔다"를 알려 주지 않아, 인쇄 요청 뒤 인쇄 시간(PRINT_WAIT_MS)만큼 기다린 뒤 끝난 것으로 본다.
 */
async function runPrint(
  w: SessionWriter,
  sessionId: string,
  composedPhoto: string | undefined,
): Promise<void> {
  w.patch({ print: { status: 'printing' } })
  try {
    if (!composedPhoto) throw new Error('합성된 네컷 사진이 없음 (session.composedPhoto)')

    if (useSession.getState().printMode === 'fake') {
      // MOCK: 가짜 인쇄 — 종이를 쓰지 않고 인쇄 시간만 흉내 낸다 (개발 실행 기본값 · 화면에 표시한다)
      await sleep(PRINT_WAIT_MS)
    } else {
      const [printerName, pdf] = await Promise.all([
        pickPrinterName(),
        window.api.photo.renderPdf({ sessionId, imagePath: composedPhoto }),
      ])
      // 그 사이 세션이 지워졌으면 인쇄하지 않는다
      if (!w.alive()) return
      const result = await withPrintTimeout(
        window.api.print.silent({ pdfPath: pdf.path, printerName }),
      )
      if (!result.ok) throw new Error(result.error ?? '인쇄 요청 실패')
      await sleep(PRINT_WAIT_MS)
    }

    w.patch({ print: { status: 'done' } })
  } catch (e) {
    if (!w.alive()) return
    // M-02를 먼저 띄우고 상태를 바꾼다 — "failed인데 M-02가 없다"는 곧 사용자가 [확인]으로 닫았다는 뜻이 된다
    useSession.getState().setFallback({
      kind: 'print',
      message: PRINT_FAIL_MESSAGE,
      detail: (e as Error).message,
    })
    w.patch({ print: { status: 'failed' } })
  }
}

/**
 * 서버 전송 (B · 분석 성공 시) — 인쇄와 나란히 돈다. 기다리지 않는다.
 * 실패해도 화면에 아무것도 띄우지 않고, 다시 보내려고 남기지도 않는다 (SPEC §6-1).
 * 네컷 이미지는 메인이 세션 폴더의 합성본을 직접 읽어 붙인다 — 여기서는 파일 경로를 넘기지 않는다.
 */
async function sendReport(w: SessionWriter, request: SendReportRequest | null): Promise<void> {
  if (!request) {
    // 보호자 연결 없이 들어온 경우(개발용 건너뛰기) — 보낼 곳이 없다
    w.patch({ reportSend: { status: 'failed' } })
    return
  }
  w.patch({ reportSend: { status: 'sending' } })
  try {
    // MOCK: main/server.ts가 지금은 mock 서버로 보낸다 (API 합의 전 — SPEC T-14)
    const result = await window.api.server.sendReport(request)
    w.patch({ reportSend: { status: result.ok ? 'sent' : 'failed' } })
  } catch {
    w.patch({ reportSend: { status: 'failed' } })
  }
}

async function runPipeline(sessionId: string): Promise<void> {
  const { session, mockScenario } = useSession.getState()
  const { job, ageGroup } = session
  if (!job) return
  const w = writerFor(sessionId)

  // ── B모드: 분석 → 리포트 문구 → 전송(뒤에서) ──
  if (session.mode === 'B' && ageGroup) {
    w.patch({ analysis: { status: 'running' } })

    // 말한 문장 = P-05에서 남긴 타깃 문장. 없으면(개발용 건너뛰기) 시나리오 데이터의 문장
    const spoken = session.speech?.length ? session.speech.map((s) => s.line) : undefined

    let observation: ObservationResult | null = null
    let reportText: ReportText | null = null
    try {
      // MOCK: main/mock/analysis.ts — 파이썬 분석 프로그램으로 교체 예정 (scenario는 mock 전용 토글)
      const output = await window.api.analysis.run({
        sessionId,
        ageGroup,
        job,
        speech: session.speech ?? [],
        scenario: mockScenario,
      })
      observation = output.observation
      // 결과 모양이 어긋나 문구를 못 만드는 경우도 분석 실패로 본다 — 인쇄까지 막히면 안 된다
      reportText = buildReportText({ ageGroup, job, lines: spoken, observation })
    } catch {
      // 분석 실패 — 미리보기 없이 인쇄한다. M-02를 띄우지 않는다 (PAGE_SPEC M-02)
      observation = null
    }
    if (!w.alive()) return

    if (observation && reportText) {
      const positiveMessage = positiveMessageFor('B', job).text
      w.patch({ analysis: { status: 'done', observation, reportText, positiveMessage } })

      // ⚠️ 보내는 것은 아래 필드뿐이다 — WAV · 사진 · 영상 · 받아쓰기 · cer · 파일 경로를 넣지 않는다 (CLAUDE.md 금지사항 4)
      const token = session.guardianLink?.sessionToken
      const request: SendReportRequest | null = token
        ? {
            sessionId,
            sessionToken: token,
            createdAt: session.createdAt ?? new Date().toISOString(),
            ageGroup,
            job,
            lines: spoken ?? targetLinesFor(job, ageGroup),
            observation,
            positiveMessage,
            reportText,
          }
        : null
      void sendReport(w, request) // 기다리지 않는다 — 전송 결과와 무관하게 인쇄는 그대로 간다
    } else {
      w.patch({ analysis: { status: 'failed' } })
    }
  }

  // ── 인쇄 (A는 도착하자마자 여기부터) ──
  await runPrint(w, sessionId, session.composedPhoto)
}

// ────────────────────────────────────────────────────────────
// 화면 조각
// ────────────────────────────────────────────────────────────

type StepState = 'todo' | 'active' | 'done'

function Step({ state, label }: { state: StepState; label: string }): ReactNode {
  return (
    <li className="p07-step" data-state={state} aria-current={state === 'active' ? 'step' : undefined}>
      <span className="p07-step__mark" aria-hidden="true" />
      {label}
    </li>
  )
}

/**
 * ② 촬영 장면 영상 — 메인에서 바이트를 받아 Blob 주소로 반복 재생한다.
 * 기기 안에서만 쓰는 영상이다 (서버로 보내지 않는다 · 체험이 끝나면 삭제).
 */
function CaptureVideo({ path }: { path: string | undefined }): ReactNode {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!path) return
    let cancelled = false
    let objectUrl: string | null = null
    setFailed(false)

    window.api.video
      .read(path)
      .then((bytes) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(new Blob([bytes], { type: 'video/webm' }))
        setUrl(objectUrl)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })

    return () => {
      cancelled = true
      setUrl(null)
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [path])

  if (!path || failed) {
    return (
      <div className="p07-video">
        <Placeholder label="촬영 장면 영상 없음" />
      </div>
    )
  }

  return (
    <div className="p07-video">
      {url && (
        <video
          className="p07-video__media"
          src={url}
          autoPlay
          loop
          muted
          playsInline
          disablePictureInPicture
          aria-label="촬영 장면 영상"
          // MediaRecorder가 만든 webm은 길이 정보가 없어 loop가 안 먹을 수 있다 — 끝나면 처음으로 돌려 다시 튼다
          onEnded={(e) => {
            const video = e.currentTarget
            video.currentTime = 0
            void video.play().catch(() => undefined)
          }}
          onError={() => setFailed(true)}
        />
      )}
    </div>
  )
}

/** ③ SD 캐릭터 자리 + 말풍선. 말풍선 글이 없으면 캐릭터 자리만 */
function Buddy({
  art,
  main,
  sub,
  tag,
}: {
  /** 캐릭터 아트 자리 라벨 (아트 미확정) */
  art: string
  main?: string
  sub?: string
  /** 미확정 문구 표시 */
  tag?: string
}): ReactNode {
  return (
    <div className={main ? 'p07-buddy' : 'p07-buddy p07-buddy--solo'}>
      <div className="p07-buddy__char">
        <Placeholder label={art} />
      </div>
      {main && (
        <div className="p07-bubble">
          <p className="p07-bubble__main">{main}</p>
          {sub && <p className="p07-bubble__sub">{sub}</p>}
          {tag && <PlaceholderTag label={tag} />}
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// 화면
// ────────────────────────────────────────────────────────────

export function P07AnalyzePrint(): ReactNode {
  const session = useSession((s) => s.session)
  const fallback = useSession((s) => s.fallback)
  const doneOpen = useSession((s) => s.doneOpen)
  const printMode = useSession((s) => s.printMode)
  const mockScenario = useSession((s) => s.mockScenario)
  const openDone = useSession((s) => s.openDone)
  const goto = useSession((s) => s.goto)

  const { sessionId, job, ageGroup, analysis, reportSend, print } = session
  const isB = session.mode === 'B'
  /** DevBar로 건너뛰어 들어오면 비어 있을 수 있다 */
  const ready = !!sessionId && !!job && (!isB || !!ageGroup)

  // ── 파이프라인 시작 — 한 세션에 한 번만 ──
  // StrictMode에서 effect가 두 번 돌아도 분석 · 전송 · 인쇄가 두 번 일어나면 안 된다(종이가 두 장 나간다).
  //  · ref 가드: 같은 컴포넌트 인스턴스에서 유지된다
  //  · 스토어 확인: 이미 돌기 시작한 세션이면(화면을 나갔다 다시 들어온 경우) 다시 돌리지 않는다
  // cleanup에서 취소하지 않는다 — 스토어에 쓰는 것은 언마운트 뒤에도 안전하다.
  const startedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!ready || !sessionId) return
    if (startedFor.current === sessionId) return
    startedFor.current = sessionId
    const current = useSession.getState().session
    if (current.analysis || current.print) return
    void runPipeline(sessionId)
  }, [ready, sessionId])

  // ── 완료 → M-03[완료 안내] ──
  // 인쇄: 끝났고(done), 실패했으면 M-02가 [확인]으로 닫힌 뒤 — M-02와 M-03이 겹치지 않는다
  const printSettled = (print?.status === 'done' || print?.status === 'failed') && fallback === null
  // B: 분석이 끝났고(성공이든 실패든), 성공했으면 전송도 끝났다(성공이든 실패든)
  const reportSettled =
    !isB ||
    analysis?.status === 'failed' ||
    (analysis?.status === 'done' &&
      (reportSend?.status === 'sent' || reportSend?.status === 'failed'))
  const finished = ready && printSettled && reportSettled

  useEffect(() => {
    if (finished && !doneOpen) openDone()
  }, [finished, doneOpen, openDone])

  if (!ready || !job) {
    return (
      <Screen id="P-07" note="세션 정보 없음">
        <p className="screen__sub">
          세션 · 직업{isB ? ' · 연령' : ''} 정보가 없어 분석 및 프린트를 시작할 수 없습니다. P-00[대기]부터
          다시 진행해 주세요.
        </p>
        <DevStrip label="화면을 건너뛰어 들어온 경우">
          <button className="btn btn--sm" onClick={() => goto('P-00')}>
            P-00으로
          </button>
        </DevStrip>
      </Screen>
    )
  }

  // ① 진행도 — 지금 단계 강조 · 끝난 단계는 완료 표시
  // 분석이 실패해도 화면에는 실패라고 쓰지 않는다 — 끝난 단계로만 표시한다
  const analysisEnded = analysis?.status === 'done' || analysis?.status === 'failed'
  const analysisStep: StepState = analysisEnded ? 'done' : 'active'
  const printStep: StepState =
    print?.status === 'done' ? 'done' : print || !isB ? 'active' : 'todo'

  return (
    <Screen
      id="P-07"
      note={isB ? 'B — 분석(MOCK) → 전송(뒤에서) → 인쇄' : 'A — 인쇄만'}
    >
      <div className="p07">
        <div className="p07-top">
          <ol className="p07-progress" aria-label="진행도">
            {isB && (
              <>
                <Step state={analysisStep} label={analysisEnded ? '분석 완료' : '분석 중'} />
                <li className="p07-progress__arrow" aria-hidden="true">
                  →
                </li>
              </>
            )}
            {/* "프린트 완료"는 스케치에 없다 — "분석 완료"에 맞춘 임시 문구 */}
            <Step state={printStep} label={printStep === 'done' ? '프린트 완료' : '프린트 중'} />
          </ol>
          {printMode === 'fake' && <PlaceholderTag label="가짜 인쇄 — 종이를 쓰지 않습니다" />}
        </div>

        <div className="p07-main">
          <div className="p07-col">
            <CaptureVideo path={session.captureVideo} />

            <div className="p07-out">
              <svg className="p07-out__arrow" viewBox="0 0 140 155" aria-hidden="true">
                <path d="M45 0h50v75h45l-70 80l-70-80h45z" />
              </svg>
              <p className="p07-out__text">사진은 아래에서 나와요</p>
              <PlaceholderTag label="문구 미확정" />
            </div>
          </div>

          <div className="p07-col">
            {!isB ? (
              // A모드 — 말하기가 없다. 목소리를 칭찬하지 않는다: 문구는 copy.ts가 주는 직업 · 사진 칭찬만 쓴다
              <Buddy
                art="SD 캐릭터 — 긍정적인 모습"
                main={positiveMessageFor('A', job).text}
                tag="긍정 문구 세트 미확정"
              />
            ) : analysis?.status === 'done' && analysis.reportText ? (
              <ReportPreview text={analysis.reportText} />
            ) : analysisEnded ? (
              // 분석 실패 — 미리보기 없이 캐릭터 자리만 남긴다. 실패했다는 말을 화면에 쓰지 않는다
              <Buddy art="SD 캐릭터 — 긍정적인 모습" />
            ) : (
              <Buddy
                art="SD 캐릭터 — 분석 중 연출"
                main="목소리를 살펴보고 있어요"
                sub="끝나면 미리보기가 나와요"
                tag="문구 미확정"
              />
            )}

            {isB && (
              <div className="p07-mail">
                <p className="p07-mail__text">자세한 리포트는 보호자님 메일로 보내 드려요</p>
                <PlaceholderTag label="메일 그림 · 문구 미확정" />
              </div>
            )}
          </div>
        </div>

        <div className="p07-dev">
          <DevStrip label="P-07 진행 상태">
            <span>분석 {isB ? (analysis?.status ?? '—') : '없음(A)'}</span>
            <span>전송 {isB ? (reportSend?.status ?? '—') : '없음(A)'}</span>
            <span>
              인쇄 {print?.status ?? '—'} ({printMode === 'fake' ? '가짜' : '실제'})
            </span>
            {isB && <span>MOCK 시나리오 {mockScenario}</span>}
          </DevStrip>
        </div>
      </div>
    </Screen>
  )
}
