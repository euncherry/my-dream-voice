/**
 * P-02a [보호자 연결] — B모드 전용 (2026-11-20) · 🎨 디자인 입힘 (2026-11-22) · 이메일만 (2026-11-24)
 *
 * 리포트 받을 보호자의 이메일을 체험 전에 받는다. 서버가 이메일을 받으면 세션이 열리고, 인쇄가 끝나면(M-03) 닫힌다.
 * 2026-11-24 **카카오 로그인을 없앴다** (사용자 결정) — 연결 선택 화면 · QR · 로그인 확인이 빠지고, 화면은 이메일 입력으로 바로 시작한다.
 * 근거: PAGE_SPEC "P-02a [보호자 연결]" · SPEC §2(보호자 연결은 동의 바로 다음 · 서버에 연결이 안 되면)
 *       · §6-1(역할 나누기) · §6-4(세션 번호) · 디자인 시안(이메일 입력 화면)
 * 스케치: docs/user-flow/wf/p02a-email · p02a-email-confirm · p02a-offline
 *
 * 화면 상태 (phase)
 *   email     이메일 입력 — 화면 키보드 · 자주 쓰는 주소 · [확인](형식 검사)
 *             입력칸은 **아이디 칸 · @ · 주소 칸** 둘로 나뉜다 (2026-11-28 — 아래 "입력칸 두 개")
 *   confirm   주소 확인 창 — 입력한 주소를 크게 다시 보여 준다 · [고치기] / [맞아요]
 *   sending   [맞아요] — 이메일과 함께 서버에 세션 열기를 요청하는 중 (확인 창 그대로)
 *   linked    "연결됐어요" → LINKED_SHOW_MS 뒤 P-03
 *   error     연결 실패 — M-02 창이 아니라 이 화면 안에서: [다시 시도](주소 확인 창으로) → 또 안 되면 [사진만 찍기] (A로 P-04)
 *
 * 상태마다 할 일(요청 · 타이머)은 그 상태의 effect가 맡는다 — 상태가 바뀌거나 화면을 떠나면 effect 정리가
 * 타이머를 지우고 늦게 온 응답을 버린다 (늦게 열린 세션은 바로 닫는다).
 *
 * 🎨 그림은 assets/ 에 있다 — 배경(bg/sky) · 로고(brand/logo-en) · 연결 실패 때의 시무룩한 우주인(characters/astronaut-sad) ·
 *    연결됐을 때의 엄지 척 우주인(characters/astronaut-thumbsup) · 발밑 구름(deco/cloud-front) · 별(deco/star-yellow).
 *    배치는 1920×1080 좌표 그대로다 (components/Stage.tsx) — 값은 styles/p02a.css. [← 뒤로]는 공통 부품이다.
 *
 *    시안은 **이메일 입력**(2026-11-23 — 자주 쓰는 주소 · 키보드 모양만 입혔다, 나머지는 체크리스트 결정 표 ⑭) 한 장이다.
 *    그 밖은 같은 모양으로 만들었다 (확인 필요 — 체크리스트 7-4):
 *      · 이메일 입력(email) — 흰 카드 안에 입력칸 · [확인] · 자주 쓰는 주소 · 화면 키보드. 제목 아래에 무엇을 받는지 한 줄
 *        (예전 연결 선택 화면 시안의 문구 "목소리 리포트는 보호자님 메일로 보내 드려요")
 *      · 주소 확인 창(confirm · sending) — 흰 창 + [고치기] / [맞아요]. 창이 떠 있는 동안 [← 뒤로]는 없다 ([고치기]로 돌아간다)
 *      · 연결됐어요(linked) · 연결 실패(error) — 가운데 흰 카드
 *
 * 입력칸 두 개 (2026-11-28 사용자 지정 — 시안 전, 지금 스타일을 둘로 쪼갬)
 *   전에는 칸 하나에 맨 끝에만 치고 맨 끝에서만 지워서, 아이디를 고치려면 @ 뒤를 다 지워야 했다.
 *   · [ 아이디 ] @ [ 주소 ] — @는 가운데 고정 글자다 (치지 않는다)
 *   · 누른 칸이 켜진다(진한 테두리 + 깜빡이는 커서) — 화면 키보드의 글자 · 지우기는 켜진 칸에만 들어간다
 *   · 자주 쓰는 주소 버튼은 어느 칸이 켜져 있든 주소 칸을 통째로 채운다
 *   · 키보드의 @ 키는 글자를 넣지 않고 주소 칸으로 넘어간다 · 빈 주소 칸에서 지우기를 누르면 아이디 칸으로 돌아간다
 *   · 칸마다 오른쪽 끝에 ✕(그 칸 전체 지우기)
 *   글자 사이를 눌러 커서를 옮기는 기능은 없다 — 칸 안에서는 지금처럼 끝에서만 치고 지운다
 *
 * 연달아 두드린 터치를 막는다 — 화면이 바뀐 직후 · 상태(phase)가 바뀐 직후(손님이 눌러서든 서버 대답으로든) 0.4초(TAP_GUARD_MS)는
 *   버튼 · 화면 키를 받지 않는다. [확인] · [고치기] 자리에도 다른 버튼이 온다 —
 *   두 번 두드리면 둘째 터치가 글자를 치거나 다음 버튼을 누르기 때문이다.
 *
 * ⚠️ 개인정보 — 직접 입력한 이메일은 이 컴포넌트의 지역 상태(local · domain — 합친 것이 email)에만 있다.
 *    세션 스토어 · localStorage · console · 오류 메시지에 넣지 않는다.
 *    서버가 받은 직후와 화면을 떠날 때 지운다. guardianLink에는 주소를 넣지 않는다 (CLAUDE.md 금지사항 4).
 *
 * ⚠️ MOCK — 서버는 아직 가짜다 (src/main/mock/server.ts · API 합의 전 — SPEC T-14).
 *    렌더러는 window.api.server.* 만 부르므로 실제 서버가 붙어도 이 화면은 그대로다.
 *    무조작 타임아웃(M-01)은 아직 없다 (T-18).
 *
 * ⚠️ 문구 — 시안에 없는 모습의 글자(이메일 입력 · 주소 확인 · 연결 실패)는 임시이고,
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
import { BackButton } from '../components/BackButton'
import { EmailKeyboard } from '../components/EmailKeyboard'
import { DevStrip, PlaceholderTag, Screen } from '../components/Screen'
import { Stage } from '../components/Stage'
import { justChangedScreen, useSession } from '../store/session'
import { LINKED_SHOW_MS, TAP_GUARD_MS } from '@shared/constants'
import type { MockServerState, ServerFailReason } from '@shared/types'
import skyUrl from '../assets/bg/sky.webp'
import logoEnUrl from '../assets/brand/logo-en.png'
import astronautSadUrl from '../assets/characters/astronaut-sad.webp'
import astronautThumbsUpUrl from '../assets/characters/astronaut-thumbsup.webp'
import cloudFrontUrl from '../assets/deco/cloud-front.webp'
import starYellowUrl from '../assets/deco/star-yellow.png'
import '../styles/p02a.css'

/**
 * 연결 실패 때의 시무룩한 우주인 · 연결됐을 때의 엄지 척 우주인을 앱이 뜰 때 미리 불러 둔다 —
 * 처음 바뀔 때 그림을 불러오는 동안 캐릭터가 비지 않게. 참조를 잡아 두어 캐시에서 빠지지 않게 한다
 */
const preloadedCharacters: HTMLImageElement[] = [astronautSadUrl, astronautThumbsUpUrl].map((url) => {
  const img = new Image()
  img.src = url
  return img
})
void preloadedCharacters

type Phase = 'email' | 'confirm' | 'sending' | 'linked' | 'error'

/** 개발용 띠에 띄우는 상태 이름 */
const PHASE_NOTE: Record<Phase, string> = {
  email: '이메일 입력',
  confirm: '주소 확인',
  sending: '세션 열기 · 이메일 전달 중',
  linked: '연결됨',
  error: '연결 실패',
}

/** 주소 길이 제한 — 임시값 (문서에 없다) */
const EMAIL_MAX_LENGTH = 80

/** 형식 검사 — @ 와 점이 있는 주소. 메인(src/main/server.ts)이 보내기 전에 한 번 더 본다 */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** 자주 쓰는 주소 — 스케치의 4개. 누르면 주소 칸(@ 뒤)을 그 주소로 채운다 */
const EMAIL_DOMAINS = ['@naver.com', '@gmail.com', '@daum.net', '@hanmail.net'] as const

/** 입력칸 두 개 — 아이디(@ 앞) · 주소(@ 뒤) */
type Field = 'local' | 'domain'

/** 형식 안내가 가리키는 칸 — all은 어느 칸인지 모를 때 (서버가 돌려보낸 경우) */
type Notice = Field | 'all' | null

/** 칸이 비었을 때 옅게 보여 주는 이름 · 형식 안내 — 임시 문구 (문서 · 시안에 없다) */
const FIELD_HINT: Record<Field, string> = { local: '아이디', domain: '주소' }
const NOTICE_TEXT: Record<Exclude<Notice, null>, string> = {
  local: '아이디를 입력해 주세요',
  domain: '주소를 확인해 주세요',
  all: '이메일 주소를 다시 확인해 주세요',
}

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
  /** 글자는 같아도 다시 재야 할 때 바뀌는 값 (커서가 생기거나 없어질 때) */
  remeasure: unknown = null,
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
  }, [text, max, min, remeasure])

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

  const [phase, setPhase] = useState<Phase>('email')
  /** ⚠️ 직접 입력한 이메일 — 여기에만 둔다 (파일 머리 주석). 아이디(@ 앞) · 주소(@ 뒤) 두 칸 */
  const [local, setLocal] = useState('')
  const [domain, setDomain] = useState('')
  /** 켜진 칸 — 화면 키보드의 글자 · 지우기가 들어가는 곳 */
  const [field, setField] = useState<Field>('local')
  const [formatNotice, setFormatNotice] = useState<Notice>(null)
  /** 두 칸을 합친 주소 — 확인 창에 보여 주고 서버에 넘기는 값. 둘 다 비었으면 빈 글자 */
  const email = local.length === 0 && domain.length === 0 ? '' : `${local}@${domain}`
  const clearEmail = useCallback((): void => {
    setLocal('')
    setDomain('')
    setField('local')
  }, [])
  /** 연결 실패가 이어진 횟수 — 1이면 [다시 시도]만, 2부터 [사진만 찍기]도. 성공하면 0 */
  const [failCount, setFailCount] = useState(0)
  /** 개발용 — MOCK 서버 연결 상태 */
  const [mockNetwork, setMockNetwork] = useState<MockServerState['network'] | null>(null)

  /** 상태가 마지막으로 바뀐 때 — 그 직후의 터치는 받지 않는다 (파일 머리 주석 "연달아 두드린 터치") */
  const phaseChangedAt = useRef(-Infinity)
  useLayoutEffect(() => {
    phaseChangedAt.current = performance.now()
  }, [phase])
  const tappedTooSoon = (): boolean =>
    justChangedScreen() || performance.now() - phaseChangedAt.current < TAP_GUARD_MS

  /** 연결 실패 — 안내로 간다 */
  const fail = useCallback((reason: ServerFailReason): void => {
    // 개발자용 — 왜 안 됐는지만 남긴다 (주소 · 서버가 준 오류 글은 쓰지 않는다)
    console.warn(`[P-02a] 연결 실패 — 세션 열기 · ${reason}`)
    setFailCount((n) => n + 1)
    setPhase('error')
  }, [])

  // 화면을 떠날 때 — 치던 주소를 지운다
  useEffect(() => {
    return () => clearEmail()
  }, [clearEmail])

  // [맞아요] · ([다시 시도] → 주소 확인 창 → [맞아요]) — 이메일과 함께 서버에 세션 열기를 요청한다
  useEffect(() => {
    if (phase !== 'sending') return
    let cancelled = false

    // 주소는 여기서 메인으로 넘기는 것이 전부다 — 다른 곳에 복사하지 않는다
    void settle(window.api.server.openSession({ email })).then((res) => {
      if (cancelled) {
        // 받는 사이에 화면을 떠났다(DevBar 이동 등) — 쓰지 않을 세션은 바로 닫는다. 서버에 열린 채 남지 않게
        if (res.ok) closeQuietly(res.sessionToken)
        return
      }
      if (res.ok) {
        closeStoredLink(res.sessionToken)
        // 주소는 넣지 않는다 — 세션 번호 · 시각뿐 (PAGE_SPEC §5). 이제 이 세션은 스토어 것이다 (닫기: M-03 · P-03 [뒤로])
        setGuardianLink({ sessionToken: res.sessionToken, linkedAt: new Date().toISOString() })
        // 서버가 받았다 → 기기에 남기지 않는다
        clearEmail()
        setFormatNotice(null)
        setFailCount(0)
        setPhase('linked')
        return
      }
      if (res.reason === 'rejected') {
        // 형식 오류 — 서버에는 닿았다. 안내와 함께 입력으로 (고칠 수 있게 주소는 그대로)
        setFailCount(0)
        setFormatNotice('all')
        setPhase('email')
        return
      }
      // 연결 실패 — [다시 시도]가 주소 확인 창으로 돌아가 [맞아요]를 다시 받을 수 있게
      // 주소를 이 화면에만 잠시 둔다 ([사진만 찍기] · 화면을 떠나면 지운다)
      fail(res.reason)
    })

    return () => {
      cancelled = true
    }
  }, [phase, email, setGuardianLink, fail, clearEmail])

  // 연결됨 — "연결됐어요"를 잠깐 보여 주고 P-03으로
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

  /** [← 뒤로] — 이메일 입력에서만 있다. 치던 주소는 남기지 않고 P-02로 */
  function handleBack(): void {
    if (tappedTooSoon()) return
    clearEmail()
    setFormatNotice(null)
    back()
  }

  /** 칸을 누른다 — 그 칸이 켜진다 (글자 · 지우기가 그 칸으로) */
  function handleField(target: Field): void {
    if (tappedTooSoon()) return
    setField(target)
  }

  /** 칸 오른쪽 끝의 ✕ — 그 칸을 통째로 지우고 그 칸을 켠다 */
  function handleClear(target: Field): void {
    if (tappedTooSoon()) return
    setFormatNotice(null)
    if (target === 'local') setLocal('')
    else setDomain('')
    setField(target)
  }

  /** 화면 키 하나 — 켜진 칸의 끝에 붙는다. @ 는 글자로 넣지 않고 주소 칸으로 넘어간다 */
  function handleKey(char: string): void {
    if (tappedTooSoon()) return
    setFormatNotice(null)
    if (char === '@') {
      setField('domain')
      return
    }
    // 두 칸 + @ 를 합쳐 길이 제한 안에서만
    if (local.length + domain.length + 1 >= EMAIL_MAX_LENGTH) return
    if (field === 'local') setLocal((value) => value + char)
    else setDomain((value) => value + char)
  }

  /** [⌫ 지우기] — 켜진 칸의 마지막 한 글자. 빈 주소 칸에서 누르면 아이디 칸으로 돌아간다 */
  function handleBackspace(): void {
    if (tappedTooSoon()) return
    setFormatNotice(null)
    if (field === 'local') {
      setLocal((value) => value.slice(0, -1))
    } else if (domain.length === 0) {
      setField('local')
    } else {
      setDomain((value) => value.slice(0, -1))
    }
  }

  /** 자주 쓰는 주소 — 어느 칸이 켜져 있든 주소 칸을 통째로 바꾼다 (켜진 칸은 그대로) */
  function handleDomain(chosen: string): void {
    if (tappedTooSoon()) return
    setFormatNotice(null)
    const filled = chosen.replace(/^@/, '')
    if (local.length + filled.length + 1 > EMAIL_MAX_LENGTH) return
    setDomain(filled)
  }

  /** [확인] — 형식이 맞으면 주소 확인 창, 틀리면 틀린 칸을 켜고 안내를 띄운다 (입력 화면 그대로) */
  function handleSubmitInput(): void {
    if (tappedTooSoon()) return
    if (!EMAIL_SHAPE.test(email)) {
      // 아이디가 비었으면 아이디 칸, 아니면 주소 칸(비었거나 점이 없다)이 틀린 것이다
      const wrong: Field = local.length === 0 ? 'local' : 'domain'
      setFormatNotice(wrong)
      setField(wrong)
      return
    }
    setFormatNotice(null)
    setPhase('confirm')
  }

  /** 주소 확인 창의 [고치기] — 입력으로 돌아간다 (주소는 그대로) */
  function handleEditAgain(): void {
    if (tappedTooSoon()) return
    setPhase('email')
  }

  /** 주소 확인 창의 [맞아요] — 이메일과 함께 세션을 연다 */
  function handleSend(): void {
    if (tappedTooSoon()) return
    setPhase('sending')
  }

  /**
   * [다시 시도] — 곧바로 다시 보내지 않고 **주소 확인 창으로** 돌아간다. 실패 화면에서 자리를 뜬 손님의
   * 주소가 다음 손님의 [다시 시도] 한 번으로 그대로 붙지 않게, [맞아요]를 다시 받는다 (SPEC §2 · §10-5)
   */
  function handleRetry(): void {
    if (tappedTooSoon()) return
    setPhase('confirm')
  }

  /** [사진만 찍기] — A모드로 (스토어가 동의 기록을 지우고 P-04로 보낸다) */
  function handlePhotoOnly(): void {
    if (tappedTooSoon()) return
    // 연결 실패 카드가 뜬 직후에는 받지 않는다 (PHOTO_ONLY_SETTLE_MS)
    if (performance.now() - phaseChangedAt.current < PHOTO_ONLY_SETTLE_MS) return
    closeStoredLink()
    clearEmail()
    switchToPhotoOnly()
  }

  // ── 개발용 조작 ──────────────────────────────────────────────

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
  // 칸마다 따로 잰다. 커서는 켜진 칸에만 있어 폭이 달라진다 → 켜진 칸이 바뀌면 다시 잰다
  const localRef = useFitText<HTMLDivElement>(showEmail ? local : '', ENTRY_FONT, inputOpen && field === 'local')
  const domainRef = useFitText<HTMLDivElement>(showEmail ? domain : '', ENTRY_FONT, inputOpen && field === 'domain')
  const fieldRefs: Record<Field, RefObject<HTMLDivElement>> = { local: localRef, domain: domainRef }
  const fieldValues: Record<Field, string> = { local, domain }

  /** 입력칸 하나 — 누르면 켜진다. 켜진 칸에 커서, 글자가 있으면 오른쪽 끝에 ✕ */
  const renderField = (name: Field): ReactNode => {
    const value = fieldValues[name]
    const active = inputOpen && field === name
    const invalid = formatNotice === name || formatNotice === 'all'
    // 안내 글은 틀린 칸 아래에 — 어느 칸인지 모르면(all) 아이디 칸에
    const notice = formatNotice === name || (formatNotice === 'all' && name === 'local') ? formatNotice : null
    return (
      <div
        className="p02a-entry__box"
        data-field={name}
        data-active={active}
        data-invalid={invalid}
        onClick={() => handleField(name)}
      >
        <div className="p02a-entry__text">
          <div className="p02a-entry__value" ref={fieldRefs[name]}>
            <span className="p02a-fit">
              {value}
              {active && <span className="p02a-entry__caret" aria-hidden="true" />}
              {value.length === 0 && <span className="p02a-entry__hint">{FIELD_HINT[name]}</span>}
            </span>
          </div>
          {notice && (
            <div className="p02a-entry__notice" role="alert">
              {NOTICE_TEXT[notice]} <PlaceholderTag label="형식 안내 — 임시 문구 (문서에 없음)" />
            </div>
          )}
        </div>
        {value.length > 0 && (
          <button
            type="button"
            className="p02a-entry__clear"
            aria-label={`${FIELD_HINT[name]} 지우기`}
            disabled={!inputOpen}
            onClick={(e) => {
              // 칸을 누른 것으로 번지지 않게 — ✕ 는 지우기만 한다
              e.stopPropagation()
              handleClear(name)
            }}
          >
            <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
              <path d="M15 15l18 18M33 15L15 33" fill="none" stroke="currentColor" strokeWidth="5.5" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>
    )
  }
  const confirmRef = useFitText<HTMLParagraphElement>(confirmOpen ? email : '', CONFIRM_FONT)
  const offerPhotoOnly = failCount >= 2
  const mockNetworkLabel =
    mockNetwork === null ? '확인 중' : mockNetwork === 'offline' ? '끊김' : '연결됨'
  // 주소 확인 창 · 전달 중 · 연결됨 · 연결 실패에는 [뒤로]가 없다 (연결 실패는 스케치대로)
  const canGoBack = phase === 'email'

  let view: ReactNode

  if (showEmail) {
    view = (
      <>
        <h1 className="p02a-title p02a-title--sm">보호자님 이메일을 입력해 주세요</h1>
        <p className="p02a-legal">
          <span className="p02a-legal__text">목소리 리포트는 보호자님 메일로 보내 드려요</span>
          <PlaceholderTag label="이메일 입력 고지 문구 미확정 — 법무 (SPEC T-7)" />
        </p>

        <div className="p02a-email">
          <div className="p02a-entry">
            {/* <input>을 쓰지 않는다 — OS 화면 키보드가 뜨지 않게. 글자는 화면 키보드로만 들어온다.
                아이디 칸 · @ · 주소 칸 (2026-11-28) — 누른 칸이 켜진다 */}
            <div className="p02a-entry__fields">
              {renderField('local')}
              <span className="p02a-entry__at" aria-hidden="true">
                @
              </span>
              {renderField('domain')}
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
                  <button type="button" className="p02a-pill p02a-pill--blue" onClick={handleSend}>
                    <span className="p02a-pill__label">맞아요</span>
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
            <button type="button" className="p02a-pill p02a-pill--blue" onClick={handlePhotoOnly}>
              <span className="p02a-pill__label">사진만 찍기</span>
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
              연결 실패 때는 시무룩한 우주인 · 연결됐을 때는 엄지 척 우주인 (2026-11-23 지정) */}
          {!showEmail && (
            <>
              {phase === 'error' ? (
                <img
                  className="p02a-char p02a-char--sad"
                  src={astronautSadUrl}
                  alt=""
                  draggable={false}
                />
              ) : phase === 'linked' ? (
                <img
                  className="p02a-char p02a-char--happy"
                  src={astronautThumbsUpUrl}
                  alt=""
                  draggable={false}
                />
              ) : null}
              <img className="p02a-cloud" src={cloudFrontUrl} alt="" draggable={false} />
            </>
          )}
        </Stage>

        {/* 개발용 — 손님 화면에는 없다. 도화지 밖(창 기준)에 둔다 */}
        <div className="p02a-dev">
          <DevStrip label={`MOCK 서버 · ${PHASE_NOTE[phase]}`}>
            <button
              className="btn btn--sm"
              disabled={mockNetwork === null}
              onClick={handleToggleNetwork}
            >
              MOCK 서버: {mockNetworkLabel}
            </button>
          </DevStrip>
        </div>
      </div>
    </Screen>
  )
}
