import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// 공통 CSS를 화면 CSS보다 먼저 싣는다 — 화면별 CSS(각 화면 파일이 import)가 뒤에 와서 덮어쓸 수 있게
import './styles/app.css'
import { App } from './App'
import { initClickFx } from './fx/clickFx'

// 화면 방향은 가로 확정(SPEC T-2). 세로 오버라이드는 tokens.css에 남겨 두었고 DevBar에서 바꿔 볼 수 있다.
document.documentElement.dataset['orientation'] = 'landscape'

// 화면 어디를 눌러도 그 자리에서 반짝 (디자이너 클릭 효과 · 2026-11-24)
initClickFx()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
