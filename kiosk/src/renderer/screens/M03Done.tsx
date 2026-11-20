/**
 * M-03 [완료 안내] 🆕 — P-07[분석 및 프린트] 위에 뜨는 창 (v1 P-11[종료] 화면을 대신한다)
 *
 * 근거: PAGE_SPEC "M-03 [완료 안내]" · SPEC §2(5초 완료 창 → 세션 닫기 · 폐기 → P-00) · V2_PLAN §3 M-03 행
 * 구성 스케치: docs/user-flow/wf/m03-done.svg
 *
 * 띄우는 쪽: P-07 — 인쇄 완료 + (B) 분석 · 서버 전송 완료(또는 실패) 뒤에 openDone() 한다.
 *            인쇄가 실패한 경우에는 M-02[오류·폴백 안내]가 [확인]으로 닫힌 뒤에 온다 (두 창이 겹치지 않는다).
 * 구성: "사진이 나왔어요!" · "아래에서 가져가세요" · 큰 카운트다운 숫자 · "N초 뒤 처음 화면으로 돌아가요"
 * 동작: DONE_MODAL_SEC(5초) 뒤 저절로 닫힌다 — 버튼 없음.
 *       닫힐 때 endSession() 한 번 — 스토어가 세션 닫기(B) · 로컬 데이터 삭제(WAV · 사진 · 영상 · PDF) · P-00 이동을 한다.
 *
 * App이 항상 렌더한다 — doneOpen이 false면 아무것도 그리지 않는다.
 * 카운트다운은 창이 열릴 때마다 새로 마운트되는 안쪽 컴포넌트가 들고 있어, 다시 열리면 처음부터 센다.
 *
 * ⚠️ 문구 · 색 · 배치는 임시 — 피그마 디자인이 오면 입힌다.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { PlaceholderTag } from '../components/Screen'
import { useSession } from '../store/session'
import { DONE_MODAL_SEC } from '@shared/constants'
import '../styles/p07.css'

export function M03Done(): ReactNode {
  const doneOpen = useSession((s) => s.doneOpen)
  if (!doneOpen) return null
  return <DoneCountdown />
}

function DoneCountdown(): ReactNode {
  const endSession = useSession((s) => s.endSession)
  /** 인쇄가 실패한 채로 온 경우(M-02를 닫은 뒤) — "사진이 나왔어요"라고 말하지 않는다 */
  const printFailed = useSession((s) => s.session.print?.status === 'failed')
  const [left, setLeft] = useState(DONE_MODAL_SEC)
  /** endSession은 한 번만 — StrictMode · 재렌더로 effect가 다시 돌아도 두 번 부르지 않는다 */
  const ended = useRef(false)

  useEffect(() => {
    if (left > 0) {
      const timer = setTimeout(() => setLeft((n) => n - 1), 1000)
      return () => clearTimeout(timer)
    }
    if (!ended.current) {
      ended.current = true
      // 세션 닫기(B) · 로컬 데이터 삭제 · P-00 이동 — 끝나면 doneOpen이 false가 되어 이 창이 사라진다
      void endSession()
    }
    return undefined
  }, [left, endSession])

  return (
    <div className="modal__scrim">
      <div className="modal m03-modal" role="dialog" aria-modal="true" aria-label="완료 안내">
        {printFailed ? (
          // TODO: 인쇄가 실패했을 때의 완료 문구는 문서에 없다 — 정해지면 넣는다 (지금은 사진 안내 두 줄을 뺀다)
          <PlaceholderTag label="인쇄 실패 때 완료 문구 미확정" />
        ) : (
          <>
            <strong className="m03-title">사진이 나왔어요!</strong>
            <p className="m03-sub">아래에서 가져가세요</p>
          </>
        )}
        <div className="m03-count" aria-hidden="true">
          {left}
        </div>
        <p className="m03-note">{left}초 뒤 처음 화면으로 돌아가요</p>
        {!printFailed && <PlaceholderTag label="문구 미확정" />}
      </div>
    </div>
  )
}
