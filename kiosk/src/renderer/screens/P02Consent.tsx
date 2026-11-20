/**
 * P-02 [동의] — B모드 전용 · 읽는 사람은 보호자
 *
 * 근거: PAGE_SPEC §3 P-02 · SPEC §10 (T-7 설계안) · 구성 스케치 p02-consent · p02-consent-warn
 * 쓰기: session.consents · session.consentAt — 세 항목을 모두 체크하고 [시작]을 눌렀을 때만
 * 액션: 모두 체크 + [시작] → P-02a[보호자 연결]
 *       덜 체크 + [시작] → 안내 + 빠진 항목 강조 (화면 유지)
 *       [뒤로] → P-01[모드 선택] (스토어가 동의 기록을 지운다 — 목소리 동의가 싫으면 A를 고를 수 있다)
 *
 * ⚠️ 동의 문구 전문은 미확정이다 — 법무 검토 (SPEC T-7).
 *    [자세히] · [전문 보기] 창 안은 PLACEHOLDER다. 임의로 약관 문구를 써 넣지 않는다.
 */

import { useState, type ReactNode } from 'react'
import type { Consents } from '@shared/types'
import { Placeholder, Screen } from '../components/Screen'
import { useSession } from '../store/session'
import '../styles/select.css'

type ConsentKey = keyof Consents
type Checked = Record<ConsentKey, boolean>

interface ConsentItem {
  key: ConsentKey
  /** 체크 항목 문구 — PAGE_SPEC P-02 그대로 */
  label: string
  /** 항목 아래 작은 설명 */
  desc?: string
}

const ITEMS: ConsentItem[] = [
  { key: 'guardian', label: '보호자와 함께 체험합니다' },
  { key: 'voice', label: '목소리 녹음 · 분석에 동의합니다' },
  {
    key: 'photo',
    label: '사진 촬영 · 촬영 영상에 동의합니다',
    desc: '영상은 분석 및 프린트 화면 재생용, 체험 종료 시 삭제',
  },
]

/** 창에 띄우는 문서 — 항목 하나의 [자세히] 또는 전체 전문 */
type DocId = ConsentKey | 'full'

const FULL_DOC_TITLE = '개인정보 수집 · 이용 전문'

function docTitle(doc: DocId): string {
  if (doc === 'full') return FULL_DOC_TITLE
  return ITEMS.find((item) => item.key === doc)?.label ?? FULL_DOC_TITLE
}

export function P02Consent(): ReactNode {
  const setConsents = useSession((s) => s.setConsents)
  const next = useSession((s) => s.next)
  const back = useSession((s) => s.back)

  // P-02a[보호자 연결]에서 [뒤로]로 돌아오면 동의 기록이 남아 있다 — 체크해 둔 그대로 보여 준다.
  // (P-01까지 돌아갔다 오면 스토어가 기록을 지웠으므로 빈 칸에서 시작한다)
  const [checked, setChecked] = useState<Checked>(() => {
    const saved = useSession.getState().session.consents
    return {
      guardian: saved?.guardian === true,
      voice: saved?.voice === true,
      photo: saved?.photo === true,
    }
  })
  /** 덜 체크한 채 [시작]을 누른 적이 있는가 — 그때부터 빠진 항목을 강조한다 */
  const [warned, setWarned] = useState(false)
  const [doc, setDoc] = useState<DocId | null>(null)

  const allChecked = ITEMS.every((item) => checked[item.key])
  const showWarn = warned && !allChecked

  function toggle(key: ConsentKey): void {
    setChecked((c) => ({ ...c, [key]: !c[key] }))
  }

  // [시작]은 항상 누를 수 있다 — 덜 체크했으면 넘어가지 않고 안내한다
  function start(): void {
    if (!allChecked) {
      setWarned(true)
      return
    }
    setConsents({ guardian: true, voice: true, photo: true })
    next() // → P-02a
  }

  return (
    <>
      <Screen id="P-02" note="B모드 전용 · 모두 체크 + [시작] → P-02a[보호자 연결]" onBack={back}>
        <div className="pick">
          <header className="pick__head">
            <h1 className="screen__title">보호자님, 함께 확인해 주세요</h1>
            <p className="screen__sub">아래 내용에 모두 동의해야 체험할 수 있어요</p>
          </header>

          <ul className="p02-list">
            {ITEMS.map((item) => {
              const isChecked = checked[item.key]
              return (
                <li
                  key={item.key}
                  className="p02-item"
                  data-checked={isChecked}
                  data-missing={showWarn && !isChecked}
                >
                  {/* 줄 전체(자세히 버튼 빼고)가 체크 영역이다 */}
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={isChecked}
                    className="p02-item__check"
                    onClick={() => toggle(item.key)}
                  >
                    <span className="p02-item__box" aria-hidden="true">
                      {isChecked ? '✓' : ''}
                    </span>
                    <span className="p02-item__text">
                      <span className="p02-item__label">{item.label}</span>
                      {item.desc && <span className="p02-item__desc">{item.desc}</span>}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost p02-item__more"
                    onClick={() => setDoc(item.key)}
                  >
                    자세히 ›
                  </button>
                </li>
              )
            })}
          </ul>

          <div className="p02-warn" role="alert">
            {showWarn && (
              <span className="p02-warn__msg">모두 동의해야 체험을 진행할 수 있어요</span>
            )}
          </div>

          <footer className="pick__foot">
            <button type="button" className="btn btn--ghost" onClick={() => setDoc('full')}>
              개인정보 수집 · 이용 전문 보기 ›
            </button>
            <button type="button" className="btn btn--primary pick-go" onClick={start}>
              시작
            </button>
          </footer>
        </div>
      </Screen>

      {doc && (
        <div className="modal__scrim" role="dialog" aria-modal="true" aria-label={docTitle(doc)}>
          <div className="modal">
            <strong className="p02-doc__title">{docTitle(doc)}</strong>
            <div className="p02-doc__body">
              <Placeholder label="동의 문구 전문 미확정 — 법무 검토 (SPEC T-7)" width="100%" />
            </div>
            <button type="button" className="btn btn--primary" onClick={() => setDoc(null)}>
              닫기
            </button>
          </div>
        </div>
      )}
    </>
  )
}
