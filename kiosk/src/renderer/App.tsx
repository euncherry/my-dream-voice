/**
 * App.tsx — 화면 전환 (세션 스토어 단일 소스 · 라우터 없음)
 * PAGE_SPEC §5-2
 */

import type { ReactNode } from 'react'
import { useSession, type ScreenId } from './store/session'
import { D01HardwareCheck } from './screens/D01HardwareCheck'
import { P00Attract } from './screens/P00Attract'
import { P01ModeSelect } from './screens/P01ModeSelect'
import { P02JobSelect } from './screens/P02JobSelect'
import { P03AgeInput } from './screens/P03AgeInput'
import { P04Consent } from './screens/P04Consent'
import { P05Speak } from './screens/P05Speak'
import { P06Capture } from './screens/P06Capture'
import { P07Analyzing } from './screens/P07Analyzing'
import { P08Result } from './screens/P08Result'
import { P09Print } from './screens/P09Print'
import { P10Qr } from './screens/P10Qr'
import { P11End } from './screens/P11End'
import { M02Fallback } from './screens/M02Fallback'
import { DevBar } from './components/DevBar'

const SCREENS: Record<ScreenId, () => ReactNode> = {
  'D-01': D01HardwareCheck,
  'P-00': P00Attract,
  'P-01': P01ModeSelect,
  'P-02': P02JobSelect,
  'P-03': P03AgeInput,
  'P-04': P04Consent,
  'P-05': P05Speak,
  'P-06': P06Capture,
  'P-07': P07Analyzing,
  'P-08': P08Result,
  'P-09': P09Print,
  'P-10': P10Qr,
  'P-11': P11End,
}

export function App(): ReactNode {
  const screen = useSession((s) => s.screen)
  const Current = SCREENS[screen]

  return (
    <>
      <Current />
      <M02Fallback />
      <DevBar />
    </>
  )
}
