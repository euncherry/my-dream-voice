/**
 * P-10 [QR 제공] 🟢 — 스파이크 ⑥
 *
 * ⚠️ 이 화면은 업로드를 시작하지 않는다. **P-09[인쇄]에서 인쇄와 동시에 이미 시작**했고,
 *    여기서는 결과(downloadUrl)만 받아 QR로 렌더한다 (SPEC §6-1).
 *    → 보호자 대기 시간이 0초가 되고, 업로드에는 인쇄 시간만큼의 여유가 생긴다.
 *
 * 오프라인 폴백: 업로드 실패 시 QR 대신 "인쇄물만 제공됩니다" 안내
 */

import { useEffect, useState, type ReactNode } from 'react'
import QRCode from 'qrcode'
import { Screen } from '../components/Screen'
import { useSession } from '../store/session'
import { DOWNLOAD_TTL_HOURS } from '@shared/constants'

export function P10Qr(): ReactNode {
  const downloadUrl = useSession((s) => s.session.downloadUrl)
  const uploadState = useSession((s) => s.uploadState)
  const uploadError = useSession((s) => s.uploadError)
  const startUpload = useSession((s) => s.startUpload)
  const next = useSession((s) => s.next)
  const setFallback = useSession((s) => s.setFallback)

  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

  // P-09를 건너뛰고 들어온 예외 상황 대비 — 정상 흐름에서는 이미 'pending'/'done'이라 무시된다
  useEffect(() => {
    if (uploadState === 'idle') void startUpload()
  }, [uploadState, startUpload])

  // QR 생성 자체는 오프라인 (CLAUDE.md 기술표)
  useEffect(() => {
    if (uploadState !== 'done' || !downloadUrl) return
    void QRCode.toDataURL(downloadUrl, { width: 512, margin: 1 }).then(setQrDataUrl)
  }, [uploadState, downloadUrl])

  useEffect(() => {
    if (uploadState !== 'failed') return
    setFallback({
      kind: 'upload',
      message: '오늘은 인쇄물만 제공돼요. 사진 잘 챙겨가세요!',
      detail: uploadError ?? undefined,
    })
  }, [uploadState, uploadError, setFallback])

  return (
    <Screen id="P-10" note="스파이크 ⑥ — 업로드는 P-09에서 이미 시작됨">
      {uploadState === 'done' && qrDataUrl && (
        <>
          <h1 className="screen__title">보호자님, 카메라로 찍어주세요</h1>
          <img
            src={qrDataUrl}
            alt="다운로드 QR"
            style={{ width: 360, height: 360, background: '#fff', borderRadius: 12 }}
          />
          <p className="screen__sub">{DOWNLOAD_TTL_HOURS}시간 동안 받을 수 있어요</p>
          <p style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-dim)' }}>{downloadUrl}</p>
        </>
      )}

      {(uploadState === 'idle' || uploadState === 'pending') && (
        <>
          <h1 className="screen__title">결과물을 준비하고 있어요…</h1>
          <p className="screen__sub">
            인쇄 중에 올려두므로 보통은 이 화면을 보지 않고 바로 QR이 뜹니다
          </p>
        </>
      )}

      {uploadState === 'failed' && (
        <>
          <h1 className="screen__title">인쇄물만 제공됩니다</h1>
          <div className="panel">
            <dl className="kv">
              <dt>업로드 결과</dt>
              <dd>{uploadError}</dd>
              <dt>다음 할 일</dt>
              <dd>cloud/ 배포 후 MDV_UPLOAD_ENDPOINT · MDV_UPLOAD_SECRET 설정</dd>
            </dl>
          </div>
        </>
      )}

      <button className="btn btn--primary" onClick={() => next()}>
        완료 → P-11
      </button>
    </Screen>
  )
}
