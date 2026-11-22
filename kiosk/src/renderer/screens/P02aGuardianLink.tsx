/**
 * P-02a [보호자 연결] — B모드 전용 (2026-11-20) · 🎨 디자인 입힘 (2026-11-22)
 *
 * 리포트 받을 보호자를 체험 전에 정한다. 여기서 세션이 열리고, 인쇄가 끝나면(M-03) 닫힌다.
 * 근거: PAGE_SPEC "P-02a [보호자 연결]" · SPEC §2(보호자 연결은 동의 바로 다음 · 서버에 연결이 안 되면)
 *       · §6-1(역할 나누기) · §6-4(세션 번호 · QR) · 디자인 시안(보호자 연결 화면)
 * 스케치: docs/user-flow/wf/p02a-link · p02a-email · p02a-email-confirm · p02a-offline
 *
 * 화면 상태 (phase)
 *   opening   준비 중 — 도착하면 서버에 세션 열기를 요청한다
 *   link      연결 선택 — ① 카카오 QR (로그인이 끝났는지 LINK_POLL_MS마다 묻는다) ② [이메일 입력하기]
 *   email     이메일 입력 — 화면 키보드 · [확인](형식 검사). 이 동안에도 카카오 로그인 확인은 계속한다
 *             (보호자가 폰으로 로그인하는 사이 아이가 [이메일 입력하기]를 눌러도, 로그인이 끝나면 저절로 넘어가게)
 *   confirm   주소 확인 창 — 입력한 주소를 크게 다시 보여 준다 · [고치기] / [맞아요] (로그인 확인 계속)
 *   sending   이메일 전달 중 (확인 창 그대로)
 *   checking  로그인 확인을 다시 해 보는 중 ([다시 시도])
 *   linked    "연결됐어요" → LINKED_SHOW_MS 뒤 P-03
 *   error     연결 실패 — M-02 창이 아니라 이 화면 안에서: [다시 시도] → 또 안 되면 [사진만 찍기] (A로 P-04)
 *
 * 상태마다 할 일(요청 · 타이머)은 그 상태의 effect가 맡는다 — 상태가 바뀌거나 화면을 떠나면 effect 정리가
 * 타이머를 지우고 늦게 온 응답을 버린다.
 *
 * 🎨 그림은 assets/ 에 있다 — 배경(bg/sky) · 로고(brand/logo-en) · 폰을 든 우주인(characters/astronaut-phone) ·
 *    연결 실패 때의 시무룩한 우주인(characters/astronaut-sad) · 발밑 구름(deco/cloud-front) · 별(deco/star-yellow) · 카카오 표시(icons/kakao) · 편지 봉투(icons/mail-at).
 *    배치는 1920×1080 좌표 그대로다 (components/Stage.tsx) — 값은 styles/p02a.css. [← 뒤로]는 공통 부품이다.
 *
 *    시안은 두 장이다 — **연결 선택(link)** · **이메일 입력**(2026-11-23 — 자주 쓰는 주소 · 키보드 모양만 입혔다, 나머지는 체크리스트
 *    결정 표 ⑭). 그 밖은 같은 모양으로 만들었다 (확인 필요 — 체크리스트 7-4):
 *      · 준비 중(opening · checking) — 연결 선택 화면 그대로, QR 자리에 점 세 개 + "준비 중". [이메일 입력하기]는 흐리게 잠긴다
 *        (checking — 로그인 확인 실패 뒤 [다시 시도] — 에는 [← 뒤로]가 없다)
 *        (세션 열기는 보통 1초 안에 끝난다 — 그 사이 화면이 통째로 바뀌었다 돌아오지 않게)
 *      · 이메일 입력(email) — 흰 카드 안에 입력칸 · [확인] · 자주 쓰는 주소 · 화면 키보드 (자주 쓰는 주소 · 키보드 모양만 시안대로)
 *      · 주소 확인 창(confirm · sending) — 흰 창 + [고치기] / [맞아요]. 창이 떠 있는 동안 [← 뒤로]는 없다 ([고치기]로 돌아간다)
 *      · 연결됐어요(linked) · 연결 실패(error) — 가운데 흰 카드
 *
 * 연달아 두드린 터치를 막는다 — 화면이 바뀐 직후 · 상태(phase)가 바뀐 직후(손님이 눌러서든 서버 대답으로든) 0.4초(TAP_GUARD_MS)는
 *   버튼 · 화면 키를 받지 않는다. [이메일 입력하기] 자리에는 화면 키보드가, [확인] · [고치기] 자리에도 다른 버튼이 온다 —
 *   두 번 두드리면 둘째 터치가 글자를 치거나 다음 버튼을 누르기 때문이다.
 *
 * ⚠️ 개인정보 — 직접 입력한 이메일은 이 컴포넌트의 지역 상태(email)에만 있다.
 *    세션 스토어 · localStorage · console · 오류 메시지에 넣지 않는다.
 *    서버가 받은 직후와 화면을 떠날 때 지운다. guardianLink에는 주소를 넣지 않는다 (CLAUDE.md 금지사항 4).
 *
 * ⚠️ MOCK — 서버는 아직 가짜다 (src/main/mock/server.ts · API 합의 전 — SPEC T-14).
 *    렌더러는 window.api.server.* 만 부르므로 실제 서버가 붙어도 이 화면은 그대로다.
 *    로그인 확인 주기 · 실패 기준은 임시다 (T-14). 무조작 타임아웃(M-01)은 아직 없다 (T-18).
 *
 * ⚠️ 문구 — 연결 선택 화면의 글자는 시안 문구다. 시안에 없는 모습의 글자(이메일 입력 · 주소 확인 · 연결 실패)는 임시이고,
 *    이메일 입력 고지 문구는 법무 검토 전이다 (SPEC T-7). 그 자리에는 PLACEHOLDER 꼬리표를 남겨 둔다 —
 *    임의로 고지 · 약관 문구를 써 넣지 않는다.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import QRCode from 'qrcode'
import { BackButton } from '../components/BackButton'
import { EmailKeyboard } from '../components/EmailKeyboard'
import { DevStrip, PlaceholderTag, Screen } from '../components/Screen'
import { Stage } from '../components/Stage'
import { justChangedScreen, useSession } from '../store/session'
import {
  LINKED_SHOW_MS,
  LINK_POLL_FAIL_LIMIT,
  LINK_POLL_MS,
  TAP_GUARD_MS,
} from '@shared/constants'
import type { GuardianLink, MockServerState, ServerFailReason } from '@shared/types'
import skyUrl from '../assets/bg/sky.webp'
import logoEnUrl from '../assets/brand/logo-en.png'
import astronautPhoneUrl from '../assets/characters/astronaut-phone.webp'
import astronautSadUrl from '../assets/characters/astronaut-sad.webp'
import cloudFrontUrl from '../assets/deco/cloud-front.webp'
import starYellowUrl from '../assets/deco/star-yellow.png'
import kakaoUrl from '../assets/icons/kakao.webp'
import mailAtUrl from '../assets/icons/mail-at.webp'
import '../styles/p02a.css'

/** 연결 실패 때의 시무룩한 우주인을 앱이 뜰 때 미리 불러 둔다 — 처음 실패할 때 그림을 불러오는 동안 캐릭터가 비지 않게 */
const preloadedSad = new Image()
preloadedSad.src = astronautSadUrl

type Phase =
  | 'opening'
  | 'link'
  | 'email'
  | 'confirm'
  | 'sending'
  | 'checking'
  | 'linked'
  | 'error'

/** 실패한 일 — [다시 시도]가 다시 할 일 */
type FailedJob = 'open' | 'poll' | 'email'

/**
 * [다시 시도] → 실패한 일을 맡는 상태로 돌아간다 (다시 열기 · 다시 확인).
 * 이메일 전달 실패는 곧바로 다시 보내지 않고 **주소 확인 창으로** 돌아간다 — 실패 화면에서 자리를 뜬 손님의
 * 주소가 다음 손님의 [다시 시도] 한 번으로 그대로 붙지 않게, [맞아요]를 다시 받는다 (SPEC §2 · §10-5).
 */
const RETRY_PHASE: Record<FailedJob, Phase> = {
  open: 'opening',
  poll: 'checking',
  email: 'confirm',
}

/** 개발용 띠에 띄우는 상태 이름 */
const PHASE_NOTE: Record<Phase, string> = {
  opening: '준비 중',
  link: '연결 선택',
  email: '이메일 입력',
  confirm: '주소 확인',
  sending: '이메일 전달 중',
  checking: '로그인 확인 다시',
  linked: '연결됨',
  error: '연결 실패',
}

/** 주소 길이 제한 — 임시값 (문서에 없다) */
const EMAIL_MAX_LENGTH = 80

/** 형식 검사 — @ 와 점이 있는 주소. 메인(src/main/server.ts)이 보내기 전에 한 번 더 본다 */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** 자주 쓰는 주소 — 스케치의 4개. 누르면 @ 뒤를 그 주소로 채운다 */
const EMAIL_DOMAINS = ['@naver.com', '@gmail.com', '@daum.net', '@hanmail.net'] as const

/** 입력칸의 글자 크기 (px) — 한 줄에 들어가는 동안은 큰 쪽, 넘치면 작은 쪽까지 줄이고 그래도 넘치면 두 줄 (styles/p02a.css) */
const ENTRY_FONT = { max: 54, min: 32 } as const

/** 주소 확인 창의 글자 크기 (px) — 같은 방식. 오타를 알아보게 되도록 크게 */
const CONFIRM_FONT = { max: 68, min: 44 } as const

/**
 * [사진만 찍기]는 연결 실패 카드가 뜬 뒤 이만큼 지나야 받는다 (임시값).
 * 처음 실패의 [다시 시도] 자리에 두 번째 실패의 [사진만 찍기]가 온다 — [다시 시도]를 급하게 거듭 누르던 손에
 * 사진만 찍기(동의 기록을 지우고 A모드로)가 눌리지 않게, 카드를 읽을 틈을 둔다.
 */
const PHOTO_ONLY_SETTLE_MS = 1_000

/** QR 이미지 한 변 (px) — 화면에는 262px로 그린다 (styles/p02a.css). 딱 두 배로 만들어 줄여도 점이 번지지 않게 한다 */
const QR_PIXELS = 524

interface OpenedSession {
  /** 서버가 준 세션 번호 (SPEC §6-4) */
  sessionToken: string
  qrUrl: string
}

const IPC_FAILED: { ok: false; reason: ServerFailReason } = { ok: false, reason: 'server' }

/** IPC 자체가 실패해도(메인 쪽 오류) 서버 실패와 똑같이 다룬다 — 화면은 ok / 실패 두 갈래만 본다 */
async function settle<R>(work: Promise<R>): Promise<R | typeof IPC_FAILED> {
  try {
    return await work
  } catch {
    return IPC_FAILED
  }
}

/** 쓰지 않을 세션을 닫는다 — 실패해도 흐름을 막지 않는다 */
function closeQuietly(sessionToken: string): void {
  void window.api.server.closeSession(sessionToken).catch(() => undefined)
}

/**
 * 스토어에 이미 연결된 세션이 남아 있었다면 닫는다 (정상 흐름에는 없다 — DevBar로 이 화면에 다시 온 경우).
 * 새 연결로 덮어쓰거나 A모드로 바꾸면 그 세션 번호를 잃어버려 서버에 열린 채 남기 때문이다.
 */
function closeStoredLink(keep?: string): void {
  const stored = useSession.getState().session.guardianLink?.sessionToken
  if (stored && stored !== keep) closeQuietly(stored)
}

/**
 * 글자가 한 줄에 들어가게 글자 크기를 줄인다 (max → min). min에서도 넘치면 줄을 바꾼다 (data-wrap="true").
 * 글자 수로 어림하면 m · w · 숫자가 많은 주소가 넘친다 — 그려진 폭을 재서 맞춘다.
 * 돌려주는 ref는 바깥 요소에 단다. 그 첫 자식(.p02a-fit)이 재는 대상이다.
 * 크기 · 줄 바꿈은 요소에 바로 적는다 — 주소는 어디에도 따로 두지 않는다.
 */
function useFitText<T extends HTMLElement>(
  text: string,
  { max, min }: { max: number; min: number },
): RefObject<T> {
  const ref = useRef<T>(null)

  useLayoutEffect(() => {
    const box = ref.current
    const inner = box?.firstElementChild
    if (!box || !(inner instanceof HTMLElement)) return

    // 가장 큰 크기 · 한 줄로 놓고 잰다 (도화지 좌표 — 창 크기에 맞춰 줄인 배율과 무관하다)
    box.dataset.wrap = 'false'
    box.style.fontSize = `${max}px`
    const style = getComputedStyle(box)
    const room = box.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 1
    const need = inner.offsetWidth
    if (need <= room || need === 0) return

    const fit = Math.floor(((max * room) / need) * 10) / 10
    if (fit >= min) {
      box.style.fontSize = `${fit}px`
    } else {
      box.style.fontSize = `${min}px`
      box.dataset.wrap = 'true'
    }
  }, [text, max, min])

  return ref
}

/** 진행 표시 — 기다리는 동안 화면이 멈춘 것처럼 보이지 않게 (PAGE_SPEC §2-5) */
function WaitDots(): ReactNode {
  return (
    <div className="p02a-wait" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  )
}

/** 알약 버튼 오른쪽의 주황 동그라미 화살표 ([시작하기] · [선택하기] · [시작]과 같은 그림) */
function PillArrow(): ReactNode {
  return (
    <span className="p02a-pill__arrow" aria-hidden="true">
      <svg viewBox="0 0 48 48" width="100%" height="100%" focusable="false">
        <path
          d="M11 24h25M26 13l11 11-11 11"
          fill="none"
          stroke="currentColor"
          strokeWidth="6.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}

/** "연결됐어요" — 남색 동그라미 안의 흰 체크 (P-02의 체크한 네모와 같은 체크 표시) */
function LinkedMark(): ReactNode {
  return (
    <span className="p02a-status__mark p02a-status__mark--ok" aria-hidden="true">
      <svg viewBox="0 0 48 48" focusable="false">
        <path
          d="M11 25.5l9 9L37.5 15"
          fill="none"
          stroke="currentColor"
          strokeWidth="6.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}

/** 연결 실패 — 끊긴 신호 표시 (부채꼴 신호 위에 주황 빗금) */
function OfflineMark(): ReactNode {
  return (
    <span className="p02a-status__mark p02a-status__mark--off" aria-hidden="true">
      <svg viewBox="0 0 96 96" focusable="false">
        <g fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round">
          <path d="M17 42a44 44 0 0 1 62 0" />
          <path d="M30 55a26 26 0 0 1 36 0" />
        </g>
        <circle cx="48" cy="70" r="6.5" fill="currentColor" />
        <path
          className="p02a-status__slash"
          d="M24 18l48 62"
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
        />
      </svg>
    </span>
  )
}

export function P02aGuardianLink(): ReactNode {
  const back = useSession((s) => s.back)
  const next = useSession((s) => s.next)
  const setGuardianLink = useSession((s) => s.setGuardianLink)
  const switchToPhotoOnly = useSession((s) => s.switchToPhotoOnly)

  const [phase, setPhase] = useState<Phase>('opening')
  const [opened, setOpened] = useState<OpenedSession | null>(null)
  const [qrImage, setQrImage] = useState<string | null>(null)
  /** ⚠️ 직접 입력한 이메일 — 여기에만 둔다 (파일 머리 주석) */
  const [email, setEmail] = useState('')
  const [formatNotice, setFormatNotice] = useState(false)
  const [failedJob, setFailedJob] = useState<FailedJob | null>(null)
  /** 연결 실패가 이어진 횟수 — 1이면 [다시 시도]만, 2부터 [사진만 찍기]도. 성공하면 0 */
  const [failCount, setFailCount] = useState(0)
  /** 개발용 — MOCK 서버 연결 상태 */
  const [mockNetwork, setMockNetwork] = useState<MockServerState['network'] | null>(null)

  /** 이 화면이 열어 둔, 아직 스토어에 넘기지 않은 세션 — 연결되지 않은 채 떠나면 닫는다 */
  const openTokenRef = useRef<string | null>(null)
  /** effect 정리가 세션을 닫았다 — 정리 뒤에 effect가 다시 돌면(개발 실행) 세션을 다시 열어야 한다 */
  const reopenRef = useRef(false)

  const sessionToken = opened?.sessionToken ?? null
  const qrUrl = opened?.qrUrl ?? null

  /** 카카오 로그인 확인을 하는 상태인가 — 연결 선택 · 이메일 입력 · 주소 확인 */
  const polling = phase === 'link' || phase === 'email' || phase === 'confirm'
  /** 로그인 확인 effect가 지금 상태를 읽는다 (상태가 바뀔 때마다 타이머를 다시 잡지 않으려고 ref로) */
  const phaseRef = useRef(phase)
  phaseRef.current = phase

  /** 상태가 마지막으로 바뀐 때 — 그 직후의 터치는 받지 않는다 (파일 머리 주석 "연달아 두드린 터치") */
  const phaseChangedAt = useRef(-Infinity)
  const prevPhaseRef = useRef<Phase | null>(null)
  useLayoutEffect(() => {
    const prev = prevPhaseRef.current
    prevPhaseRef.current = phase
    // 준비가 끝나 QR이 뜬 것(준비 중 → 연결 선택)만은 화면 모양이 그대로다(QR 자리만 채워진다) — 막지 않는다
    if (phase === 'link' && (prev === 'opening' || prev === 'checking')) return
    phaseChangedAt.current = performance.now()
  }, [phase])
  const tappedTooSoon = (): boolean =>
    justChangedScreen() || performance.now() - phaseChangedAt.current < TAP_GUARD_MS

  /** 열어 둔 세션을 버린다. 닫은 세션이 있었으면 true */
  const discardOpenSession = useCallback((): boolean => {
    const token = openTokenRef.current
    openTokenRef.current = null
    if (token) closeQuietly(token)
    return token !== null
  }, [])

  /** 5. 연결 실패 — 실패한 일을 적어 두고 안내로 간다 */
  const fail = useCallback((job: FailedJob, reason: ServerFailReason): void => {
    // 개발자용 — 무엇이 왜 안 됐는지만 남긴다 (주소 · 서버가 준 오류 글은 쓰지 않는다)
    console.warn(`[P-02a] 연결 실패 — ${job} · ${reason}`)
    setFailedJob(job)
    setFailCount((n) => n + 1)
    setPhase('error')
  }, [])

  /** 4. 연결됨 — 세션을 스토어에 넘기고 "연결됐어요"로 */
  const completeLink = useCallback(
    (method: GuardianLink['method'], token: string): void => {
      closeStoredLink(token)
      // 주소는 넣지 않는다 — 방법 · 세션 번호 · 시각뿐 (PAGE_SPEC §5)
      setGuardianLink({ method, sessionToken: token, linkedAt: new Date().toISOString() })
      // 이제 이 세션은 스토어 것이다 — 화면을 떠나도 여기서 닫지 않는다 (닫기는 스토어 몫: M-03 · P-03 [뒤로])
      openTokenRef.current = null
      // 서버가 받았다 → 기기에 남기지 않는다
      setEmail('')
      setFormatNotice(false)
      setFailedJob(null)
      setFailCount(0)
      setPhase('linked')
    },
    [setGuardianLink],
  )

  // 화면을 떠날 때 — 연결되지 않은 채 열려 있던 세션을 닫고, 치던 주소를 지운다
  useEffect(() => {
    if (reopenRef.current) {
      // 개발 실행(Fast Refresh)은 상태를 둔 채 effect만 다시 돌린다.
      // 바로 앞 정리에서 세션을 닫았으니 화면에 남은 세션 번호는 죽은 것이다 → 처음부터 다시 연다
      reopenRef.current = false
      setOpened(null)
      setQrImage(null)
      setFormatNotice(false)
      setPhase('opening')
    }
    return () => {
      reopenRef.current = discardOpenSession()
      setEmail('')
    }
  }, [discardOpenSession])

  // 1. 준비 중 — 세션 열기 (화면 도착 · [다시 시도])
  useEffect(() => {
    if (phase !== 'opening') return
    let cancelled = false

    void settle(window.api.server.openSession()).then((res) => {
      if (cancelled) {
        // 쓰지 않을 세션은 바로 닫는다 — StrictMode가 effect를 두 번 돌릴 때의 첫 번째 것,
        // 받는 사이에 [뒤로]로 떠난 것. 세션이 서버에 열린 채 남지 않게 한다
        if (res.ok) closeQuietly(res.sessionToken)
        return
      }
      if (!res.ok) {
        fail('open', res.reason)
        return
      }
      openTokenRef.current = res.sessionToken
      setOpened({ sessionToken: res.sessionToken, qrUrl: res.qrUrl })
      setFailCount(0)
      setPhase('link')
    })

    return () => {
      cancelled = true
    }
  }, [phase, fail])

  // QR — 서버가 준 주소를 이미지로. 그리기 자체는 오프라인이고 가벼워 렌더러에서 한다 (CLAUDE.md 기술 스택)
  useEffect(() => {
    if (!qrUrl) return
    let cancelled = false

    // 둘레 여백은 넣지 않는다 — 흰 판과 흰 카드가 QR 둘레의 여백 노릇을 한다 (styles/p02a.css .p02a-qr)
    void QRCode.toDataURL(qrUrl, { width: QR_PIXELS, margin: 0 }).then(
      (dataUrl) => {
        if (!cancelled) setQrImage(dataUrl)
      },
      () => {
        if (!cancelled) setQrImage(null)
      },
    )

    return () => {
      cancelled = true
    }
  }, [qrUrl])

  // 2. 카카오 로그인이 끝났는지 LINK_POLL_MS마다 묻는다 (방식 · 주기는 임시 — SPEC T-14)
  //    연결 선택뿐 아니라 이메일 입력 · 주소 확인 중에도 계속 묻는다 — QR로 연 세션은 서버에 살아 있고,
  //    보호자가 폰으로 로그인을 끝내면 키오스크는 저절로 넘어가야 한다 (PAGE_SPEC P-02a ① · §4).
  //    이메일을 서버로 보내는 중(sending)에는 멈춘다
  useEffect(() => {
    if (!polling || !sessionToken) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    /** 연속 실패 횟수 */
    let fails = 0

    const ask = async (): Promise<void> => {
      const res = await settle(window.api.server.linkStatus(sessionToken))
      if (cancelled) return
      if (res.ok && res.linked) {
        completeLink('kakao', sessionToken)
        return
      }
      if (res.ok) {
        fails = 0
      } else {
        fails += 1
        // 주소를 치는 중에는 확인 실패로 연결 실패 화면에 내쫓지 않는다 — 연결 문제는 [맞아요] 뒤 전달 실패로 드러난다
        if (phaseRef.current === 'link' && fails >= LINK_POLL_FAIL_LIMIT) {
          fail('poll', res.reason)
          return
        }
      }
      // 응답을 받은 뒤에 다음 차례를 잡는다 — 요청이 겹쳐 쌓이지 않게
      timer = setTimeout(() => void ask(), LINK_POLL_MS)
    }

    timer = setTimeout(() => void ask(), LINK_POLL_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [polling, sessionToken, completeLink, fail])

  // 5 → [다시 시도] (로그인 확인 실패) — 한 번 다시 물어본다. 닿으면 연결 선택으로 돌아가 계속 묻는다
  useEffect(() => {
    if (phase !== 'checking' || !sessionToken) return
    let cancelled = false

    void settle(window.api.server.linkStatus(sessionToken)).then((res) => {
      if (cancelled) return
      if (!res.ok) {
        fail('poll', res.reason)
        return
      }
      if (res.linked) {
        completeLink('kakao', sessionToken)
        return
      }
      setFailedJob(null)
      setFailCount(0)
      setPhase('link')
    })

    return () => {
      cancelled = true
    }
  }, [phase, sessionToken, completeLink, fail])

  // 3. [맞아요] · [다시 시도](이메일 전달 실패) — 입력한 주소를 세션 번호와 함께 서버로 보낸다
  useEffect(() => {
    if (phase !== 'sending' || !sessionToken) return
    let cancelled = false

    // 주소는 여기서 메인으로 넘기는 것이 전부다 — 다른 곳에 복사하지 않는다
    void settle(window.api.server.submitEmail({ sessionToken, email })).then((res) => {
      if (cancelled) return
      if (res.ok) {
        // 서버가 받았다 — completeLink가 주소를 지운다
        completeLink('email', sessionToken)
        return
      }
      if (res.reason === 'rejected') {
        // 형식 오류 — 서버에는 닿았다. 안내와 함께 입력으로 (고칠 수 있게 주소는 그대로)
        setFailedJob(null)
        setFailCount(0)
        setFormatNotice(true)
        setPhase('email')
        return
      }
      // 연결 실패 — [다시 시도]가 주소 확인 창으로 돌아가 [맞아요]를 다시 받을 수 있게
      // 주소를 이 화면에만 잠시 둔다 ([사진만 찍기] · [뒤로]를 고르거나 화면을 떠나면 지운다)
      fail('email', res.reason)
    })

    return () => {
      cancelled = true
    }
  }, [phase, sessionToken, email, completeLink, fail])

  // 4. 연결됨 — "연결됐어요"를 잠깐 보여 주고 P-03으로
  useEffect(() => {
    if (phase !== 'linked') return
    const timer = setTimeout(next, LINKED_SHOW_MS)
    return () => clearTimeout(timer)
  }, [phase, next])

  // 개발용 — MOCK 서버 연결 상태. DevBar에서도 바꿀 수 있어 화면 상태가 바뀔 때마다 다시 읽는다
  useEffect(() => {
    let cancelled = false
    void window.api.server.mockGet().then(
      (state) => {
        if (!cancelled) setMockNetwork(state.network)
      },
      () => undefined,
    )
    return () => {
      cancelled = true
    }
  }, [phase])

  // ── 손님 조작 ────────────────────────────────────────────────

  function handleBack(): void {
    if (tappedTooSoon()) return
    if (phase === 'email') {
      // 이메일 입력을 그만두고 연결 선택으로 — 치던 주소는 남기지 않는다 (로그인 확인은 계속 돌고 있다)
      setEmail('')
      setFormatNotice(false)
      setPhase('link')
      return
    }
    // 준비 중 · 연결 선택 — 열던 세션을 버리고 P-02로
    // (세션 열기 응답을 받는 중이었다면 위 effect의 정리가 도착하는 대로 닫는다)
    discardOpenSession()
    back()
  }

  /** [이메일 입력하기] */
  function handleOpenEmail(): void {
    if (tappedTooSoon()) return
    setPhase('email')
  }

  function handleKey(char: string): void {
    if (tappedTooSoon()) return
    setFormatNotice(false)
    setEmail((value) => (value.length < EMAIL_MAX_LENGTH ? value + char : value))
  }

  function handleBackspace(): void {
    if (tappedTooSoon()) return
    setFormatNotice(false)
    setEmail((value) => value.slice(0, -1))
  }

  /** 자주 쓰는 주소 — @ 뒤를 통째로 바꾼다 (@ 가 아직 없으면 뒤에 붙인다) */
  function handleDomain(domain: string): void {
    if (tappedTooSoon()) return
    setFormatNotice(false)
    setEmail((value) => {
      const at = value.indexOf('@')
      const filled = (at === -1 ? value : value.slice(0, at)) + domain
      return filled.length <= EMAIL_MAX_LENGTH ? filled : value
    })
  }

  /** [확인] — 형식이 맞으면 주소 확인 창, 틀리면 안내를 띄우고 입력 화면 그대로 */
  function handleSubmitInput(): void {
    if (tappedTooSoon()) return
    if (!EMAIL_SHAPE.test(email)) {
      setFormatNotice(true)
      return
    }
    setFormatNotice(false)
    setPhase('confirm')
  }

  /** 주소 확인 창의 [고치기] — 입력으로 돌아간다 (주소는 그대로) */
  function handleEditAgain(): void {
    if (tappedTooSoon()) return
    setPhase('email')
  }

  /** 주소 확인 창의 [맞아요] — 서버로 보낸다 */
  function handleSend(): void {
    if (tappedTooSoon()) return
    setPhase('sending')
  }

  function handleRetry(): void {
    if (tappedTooSoon()) return
    if (!failedJob) return
    // 실패한 일을 다시 한다 (이메일 전달은 주소 확인 창부터). 열린 세션이 없으면(세션 열기 실패) 세션 열기부터다
    setPhase(sessionToken ? RETRY_PHASE[failedJob] : 'opening')
  }

  /** [사진만 찍기] — 열던 세션을 닫고 A모드로 (스토어가 동의 기록을 지우고 P-04로 보낸다) */
  function handlePhotoOnly(): void {
    if (tappedTooSoon()) return
    // 연결 실패 카드가 뜬 직후에는 받지 않는다 (PHOTO_ONLY_SETTLE_MS)
    if (performance.now() - phaseChangedAt.current < PHOTO_ONLY_SETTLE_MS) return
    discardOpenSession()
    closeStoredLink()
    setEmail('')
    switchToPhotoOnly()
  }

  // ── 개발용 조작 ──────────────────────────────────────────────

  function handleMockKakao(): void {
    // MOCK: 보호자가 폰에서 카카오 로그인을 끝낸 것처럼 만든다 — 다음 로그인 확인에서 연결된 것으로 나온다
    if (sessionToken) void window.api.server.mockKakaoLogin(sessionToken).catch(() => undefined)
  }

  function handleToggleNetwork(): void {
    // MOCK: 끊김이면 모든 서버 요청이 실패한다 — 연결 실패 경로 확인용.
    // DevBar에서도 바꿀 수 있어 화면에 적힌 값이 낡았을 수 있다 → 지금 값을 읽어서 뒤집는다
    void window.api.server
      .mockGet()
      .then((now) =>
        window.api.server.mockSet({ network: now.network === 'offline' ? 'online' : 'offline' }),
      )
      .then(
        (state) => setMockNetwork(state.network),
        () => undefined,
      )
  }

  // ── 화면 ─────────────────────────────────────────────────────

  const inputOpen = phase === 'email'
  const confirmOpen = phase === 'confirm' || phase === 'sending'
  /** 이메일 입력 화면 (그 위에 주소 확인 창이 뜨는 상태까지) — 키보드에 자리를 내주려고 캐릭터가 없다 */
  const showEmail = inputOpen || confirmOpen
  // 입력칸 · 확인 창 요소는 그 화면에서만 있다 — 없는 동안은 빈 글자로 둬서, 요소가 다시 생길 때 폭을 새로 재게 한다
  // (연결 실패 → [다시 시도]로 주소가 그대로인 채 돌아오는 경우)
  const entryRef = useFitText<HTMLDivElement>(showEmail ? email : '', ENTRY_FONT)
  const confirmRef = useFitText<HTMLParagraphElement>(confirmOpen ? email : '', CONFIRM_FONT)
  const offerPhotoOnly = failCount >= 2
  const mockNetworkLabel =
    mockNetwork === null ? '확인 중' : mockNetwork === 'offline' ? '끊김' : '연결됨'
  /** 연결 선택 화면을 그리는 상태 — 준비 중(세션 열기 · 다시 확인)에도 같은 화면이고 QR 자리만 "준비 중"이다 */
  const showLink = phase === 'opening' || phase === 'checking' || phase === 'link'
  /** QR을 보여 줄 수 있나 — 세션이 열렸고 그림도 다 그렸다 */
  const qrReady = phase === 'link' && qrImage !== null
  // 요청이 오가는 중(전달 · 다시 확인) · 주소 확인 창 · 연결됨 · 연결 실패에는 [뒤로]가 없다 (연결 실패는 스케치대로)
  const canGoBack = phase === 'opening' || phase === 'link' || phase === 'email'

  let view: ReactNode

  if (showLink) {
    view = (
      <>
        <h1 className="p02a-title">보호자님을 연결해 주세요</h1>
        <p className="p02a-sub">목소리 리포트는 보호자님 메일로 보내 드려요</p>

        <section className="p02a-card p02a-card--kakao">
          <h2 className="p02a-card__title">
            <img className="p02a-kakao" src={kakaoUrl} alt="" draggable={false} />
            <span className="p02a-num">1</span>
            <span className="p02a-card__name">카카오로 간편 로그인</span>
          </h2>
          <div className="p02a-qr">
            {qrReady ? (
              <img
                className="p02a-qr__img"
                src={qrImage ?? undefined}
                alt="카카오 로그인 QR"
                draggable={false}
              />
            ) : (
              // 세션을 여는 중 · 로그인 확인을 다시 하는 중 — PAGE_SPEC P-02a "받는 동안 준비 중 표시"
              <div className="p02a-qr__wait" role="status">
                <WaitDots />
                <span>준비 중</span>
              </div>
            )}
          </div>
          <p className="p02a-card__lead">
            폰 카메라로 QR을
            <br />
            찍어 주세요
          </p>
          <p className="p02a-card__sub">
            카카오 로그인이 끝나면
            <br />
            자동으로 넘어가요
          </p>
        </section>

        <section className="p02a-card p02a-card--email">
          <h2 className="p02a-card__title">
            <span className="p02a-num">2</span>
            <span className="p02a-card__name">이메일 직접 입력</span>
          </h2>
          <img className="p02a-mail" src={mailAtUrl} alt="" draggable={false} />
          <p className="p02a-card__lead">카카오 계정이 없어도 괜찮아요</p>
          {/* 준비 중에는 잠근다 — 세션이 열려야 주소를 보낼 수 있다 */}
          <button
            type="button"
            className="p02a-pill p02a-go"
            disabled={phase !== 'link'}
            onClick={handleOpenEmail}
          >
            <span className="p02a-pill__label">이메일 입력하기</span>
            <PillArrow />
          </button>
        </section>

        <p className="p02a-foot">연결이 완료되면 다음 화면으로 넘어가요</p>
      </>
    )
  } else if (showEmail) {
    view = (
      <>
        <h1 className="p02a-title p02a-title--sm">보호자님 이메일을 입력해 주세요</h1>
        <p className="p02a-legal">
          <PlaceholderTag label="이메일 입력 고지 문구 미확정 — 법무 (SPEC T-7)" />
        </p>

        <div className="p02a-email">
          <div className="p02a-entry">
            {/* <input>을 쓰지 않는다 — OS 화면 키보드가 뜨지 않게. 글자는 화면 키보드로만 들어온다 */}
            <div className="p02a-entry__box" data-invalid={formatNotice}>
              <div className="p02a-entry__value" ref={entryRef}>
                <span className="p02a-fit">
                  {email}
                  {inputOpen && <span className="p02a-entry__caret" aria-hidden="true" />}
                </span>
              </div>
              {formatNotice && (
                <div className="p02a-entry__notice" role="alert">
                  이메일 주소를 다시 확인해 주세요{' '}
                  <PlaceholderTag label="형식 안내 — 임시 문구 (문서에 없음)" />
                </div>
              )}
            </div>
            <button
              type="button"
              className="p02a-pill p02a-entry__ok"
              disabled={!inputOpen || email.length === 0}
              onClick={handleSubmitInput}
            >
              <span className="p02a-pill__label">확인</span>
              <PillArrow />
            </button>
          </div>
          <div className="p02a-domains">
            {EMAIL_DOMAINS.map((domain) => (
              <button
                key={domain}
                type="button"
                className="p02a-domain"
                disabled={!inputOpen}
                onClick={() => handleDomain(domain)}
              >
                {domain}
              </button>
            ))}
          </div>
          <EmailKeyboard
            onKey={handleKey}
            onBackspace={handleBackspace}
            onEnter={handleSubmitInput}
            disabled={!inputOpen}
          />
        </div>

        {/* 주소 확인 — 오타면 다른 사람에게 리포트가 가므로 크게 한 번 더 보여 준다 (SPEC §2) */}
        {confirmOpen && (
          <div
            className="p02a-scrim"
            role="dialog"
            aria-modal="true"
            aria-label="이 주소로 보내 드릴까요?"
          >
            <div className="p02a-confirm">
              <strong className="p02a-confirm__ask">이 주소로 보내 드릴까요?</strong>
              <p className="p02a-confirm__address" ref={confirmRef}>
                <span className="p02a-fit">{email}</span>
              </p>
              <p className="p02a-confirm__note">
                체험이 끝나면 이 주소로 리포트가 가요{' '}
                <PlaceholderTag label="문구 미확정 (SPEC T-7)" />
              </p>
              {phase === 'sending' ? (
                <div className="p02a-confirm__wait" role="status">
                  <WaitDots />
                  <PlaceholderTag label="이메일 전달 중 — 문구 미확정" />
                </div>
              ) : (
                <div className="p02a-confirm__actions">
                  <button
                    type="button"
                    className="p02a-pill p02a-pill--plain"
                    onClick={handleEditAgain}
                  >
                    <span className="p02a-pill__label">고치기</span>
                  </button>
                  <button type="button" className="p02a-pill" onClick={handleSend}>
                    <span className="p02a-pill__label">맞아요</span>
                    <PillArrow />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </>
    )
  } else if (phase === 'linked') {
    view = (
      <div className="p02a-status" data-kind="linked" role="status">
        <LinkedMark />
        <h1 className="p02a-status__title">연결됐어요</h1>
      </div>
    )
  } else {
    // 연결 실패 — 처음에는 [다시 시도]만, 다시 해도 안 되면 [사진만 찍기]까지
    view = (
      <div className="p02a-status" data-kind="error" role="alert">
        <OfflineMark />
        <h1 className="p02a-status__title">
          {offerPhotoOnly ? '지금은 사진만 찍을 수 있어요' : '연결이 잘 안 돼요'}
        </h1>
        <p className="p02a-status__tag">
          <PlaceholderTag label="문구 미확정 (SPEC T-7)" />
        </p>
        <div className="p02a-status__actions">
          <button
            type="button"
            className={offerPhotoOnly ? 'p02a-pill p02a-pill--plain' : 'p02a-pill'}
            onClick={handleRetry}
          >
            <span className="p02a-pill__label">다시 시도</span>
            {!offerPhotoOnly && <PillArrow />}
          </button>
          {offerPhotoOnly && (
            <button type="button" className="p02a-pill" onClick={handlePhotoOnly}>
              <span className="p02a-pill__label">사진만 찍기</span>
              <PillArrow />
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <Screen id="P-02a" designed>
      <div className="p02a" data-phase={phase}>
        <Stage background={skyUrl}>
          <img className="p02a-logo" src={logoEnUrl} alt="MY DREAM VOICE" draggable={false} />

          {canGoBack && <BackButton onClick={handleBack} />}

          <img className="p02a-star" src={starYellowUrl} alt="" draggable={false} />

          {view}

          {/* 왼쪽 아래 캐릭터 — 발밑은 구름이 가린다 (이메일 입력 화면에는 없다).
              평소는 폰을 든 우주인(왼쪽 카드의 왼쪽 아래 모서리 앞), 연결 실패 때는 시무룩한 우주인 (2026-11-23 지정) */}
          {!showEmail && (
            <>
              {phase === 'error' ? (
                <img
                  className="p02a-char p02a-char--sad"
                  src={astronautSadUrl}
                  alt=""
                  draggable={false}
                />
              ) : (
                <img className="p02a-char" src={astronautPhoneUrl} alt="" draggable={false} />
              )}
              <img className="p02a-cloud" src={cloudFrontUrl} alt="" draggable={false} />
            </>
          )}
        </Stage>

        {/* 개발용 — 손님 화면에는 없다. 도화지 밖(창 기준)에 둔다 */}
        <div className="p02a-dev">
          <DevStrip label={`MOCK 서버 · ${PHASE_NOTE[phase]}`}>
            <button
              className="btn btn--sm"
              disabled={!polling || !sessionToken}
              onClick={handleMockKakao}
            >
              카카오 로그인 완료 흉내
            </button>
            <button
              className="btn btn--sm"
              disabled={mockNetwork === null}
              onClick={handleToggleNetwork}
            >
              MOCK 서버: {mockNetworkLabel}
            </button>
            {/* MOCK: QR 주소는 가짜다 (https://mock-server.invalid/…) — 실제 서버가 붙으면 이 표시를 뺀다 */}
            {phase === 'link' && <PlaceholderTag label="MOCK — QR을 폰으로 찍어도 열리지 않습니다" />}
          </DevStrip>
        </div>
      </div>
    </Screen>
  )
}
