import type { ReactNode } from 'react'

export const metadata = {
  title: '마이 드림 보이스',
  description: '체험 결과물 전달',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  )
}
