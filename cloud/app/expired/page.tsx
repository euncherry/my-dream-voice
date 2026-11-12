/**
 * /expired — 만료 안내 페이지 (SPEC §6)
 * "만료 후 접근 시: '만료되었어요' 안내 페이지"
 */

import { TTL_HOURS } from '@/lib/blobPaths'

export const metadata = {
  title: '마이 드림 보이스 — 만료되었어요',
}

export default function ExpiredPage() {
  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: 24,
        textAlign: 'center',
        fontFamily: 'system-ui, -apple-system, "Malgun Gothic", sans-serif',
        color: '#22272f',
      }}
    >
      <h1 style={{ fontSize: 24, margin: 0 }}>만료되었어요</h1>
      <p style={{ margin: 0, color: '#6b7480', lineHeight: 1.7 }}>
        결과물은 체험 후 {TTL_HOURS}시간 동안만 받을 수 있어요.
        <br />
        아이의 개인정보 보호를 위해 저장된 파일은 자동으로 삭제됩니다.
      </p>
      <p style={{ margin: 0, color: '#9aa2b1', fontSize: 14 }}>
        인쇄된 네컷 사진은 계속 간직하실 수 있어요.
      </p>
    </main>
  )
}
