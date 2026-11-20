/**
 * App.tsx — 화면 전환 (세션 스토어 단일 소스 · 라우터 없음)
 * PAGE_SPEC §7-1 · 화면 번호는 PAGE_SPEC v0.3 (v2)
 */

import { useEffect, type ReactNode } from 'react'
import { useSession, type ScreenId } from './store/session'
import { D01HardwareCheck } from './screens/D01HardwareCheck'
import { P00Attract } from './screens/P00Attract'
import { P01ModeSelect } from './screens/P01ModeSelect'
import { P02Consent } from './screens/P02Consent'
import { P02aGuardianLink } from './screens/P02aGuardianLink'
import { P03AgeSelect } from './screens/P03AgeSelect'
import { P04JobSelect } from './screens/P04JobSelect'
import { P05Speak } from './screens/P05Speak'
import { P06Capture } from './screens/P06Capture'
import { P07AnalyzePrint } from './screens/P07AnalyzePrint'
import { M02Fallback } from './screens/M02Fallback'
import { M03Done } from './screens/M03Done'
import { DevBar } from './components/DevBar'

const SCREENS: Record<ScreenId, () => ReactNode> = {
  'D-01': D01HardwareCheck,
  'P-00': P00Attract,
  'P-01': P01ModeSelect,
  'P-02': P02Consent,
  'P-02a': P02aGuardianLink,
  'P-03': P03AgeSelect,
  'P-04': P04JobSelect,
  'P-05': P05Speak,
  'P-06': P06Capture,
  'P-07': P07AnalyzePrint,
}

export function App(): ReactNode {
  const screen = useSession((s) => s.screen)
  const setPrintMode = useSession((s) => s.setPrintMode)
  const Current = SCREENS[screen]

  // 인쇄 기본값(실제 / 가짜)은 메인이 정한다 — 설치판은 실제, 개발 실행은 가짜
  useEffect(() => {
    void window.api.system.envInfo().then((env) => setPrintMode(env.printMode))
  }, [setPrintMode])

  return (
    <>
      <Current />
      {/* M-03[완료 안내] · M-02[오류·폴백 안내]는 화면 위에 뜨는 창이다 */}
      <M03Done />
      <M02Fallback />
      <DevBar />
    </>
  )
}
