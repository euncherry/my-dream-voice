import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles/app.css'

// T-2 미정 — 기본 가로. DevBar에서 토글해 레이아웃이 따라오는지 확인한다.
document.documentElement.dataset['orientation'] = 'landscape'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
