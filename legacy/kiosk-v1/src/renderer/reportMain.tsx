/**
 * reportMain.tsx — report.html 엔트리
 *
 * 데이터는 URL 해시(#data=<encodeURIComponent(JSON)>)로 주입된다.
 * → 템플릿은 데이터의 순수 함수로 유지되고, PDF/웹 어느 쪽에서도 같은 방식으로 렌더된다.
 *
 * main/pdf.ts는 window.__MDV_RENDER_READY__ 가 true가 될 때까지 기다린 뒤 printToPDF를 호출한다.
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ReportTemplate } from './report/ReportTemplate'
import type { SessionResult } from '@shared/types'

declare global {
  interface Window {
    __MDV_RENDER_READY__?: boolean
  }
}

/** 개발용 — report.html#demo=some 으로 열면 템플릿을 바로 확인할 수 있다 */
function demoData(kind: 'all' | 'some'): SessionResult {
  return {
    childName: '지민',
    ageGroup: kind === 'some' ? '4-5' : '6-7',
    age: kind === 'some' ? 5 : 6,
    date: new Date().toISOString().slice(0, 10),
    place: '한국잡월드',
    jobs: ['police', 'chef', 'singer', 'astronaut'],
    lines: [
      '출동! 사건 현장으로!',
      '맛있게 만들어요!',
      '사랑을 노래할게요!',
      '(대사 미정) 우주비행사 대사가 들어갈 자리',
    ],
    observation:
      kind === 'some'
        ? {
            phonemes: [
              { sound: 'ㅅ', result: 'different' },
              { sound: 'ㄹ', result: 'recognized' },
            ],
            type: 'reference',
            diagnostic: false,
            hasDifferent: true,
          }
        : {
            phonemes: [
              { sound: 'ㅅ', result: 'recognized' },
              { sound: 'ㅆ', result: 'recognized' },
              { sound: 'ㄹ', result: 'recognized' },
            ],
            type: 'reference',
            diagnostic: false,
            hasDifferent: false,
          },
    recommendedJob: 'police',
    positiveMessage: '[PLACEHOLDER] 오늘 목소리 정말 씩씩했어요!',
  }
}

function readData(): SessionResult | null {
  const params = new URLSearchParams(location.hash.replace(/^#/, ''))

  const demo = params.get('demo')
  if (demo === 'all' || demo === 'some') return demoData(demo)

  const raw = params.get('data')
  if (!raw) return null
  try {
    return JSON.parse(raw) as SessionResult
  } catch {
    return null
  }
}

const data = readData()
const root = createRoot(document.getElementById('root')!)

root.render(
  <StrictMode>
    {data ? (
      <ReportTemplate data={data} />
    ) : (
      <p style={{ padding: 40, fontFamily: 'sans-serif' }}>
        데이터가 없습니다. <code>report.html#demo=all</code> 또는{' '}
        <code>report.html#demo=some</code> 으로 열어보세요.
      </p>
    )}
  </StrictMode>,
)

// 폰트 로딩까지 끝나고 한 프레임 그린 뒤 준비 완료를 알린다 (main/pdf.ts가 폴링)
void document.fonts.ready.then(() => {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.__MDV_RENDER_READY__ = true
    })
  })
})
