import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// 공통 CSS를 화면 CSS보다 먼저 싣는다 — 화면별 CSS(각 화면 파일이 import)가 뒤에 와서 덮어쓸 수 있게
import './styles/app.css'
import { App } from './App'

// 화면 방향은 가로 확정(SPEC T-2). 세로 오버라이드는 tokens.css에 남겨 두었고 DevBar에서 바꿔 볼 수 있다.
document.documentElement.dataset['orientation'] = 'landscape'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
