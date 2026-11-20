import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

/**
 * CLAUDE.md 기술 확정 사항:
 *  - 렌더러는 Vite 정적 빌드 (Next.js 금지)
 *  - 무거운 연산은 전부 메인 프로세스 → 렌더러는 IPC 요청만
 *
 * 렌더러 엔트리는 index.html 하나다 (키오스크 UI — P-00 ~ P-07 · P-02a · M-02 · M-03 · D-01).
 * 보호자 리포트 PDF는 v2부터 백엔드 서버가 만든다 — 리포트 템플릿 엔트리는 없다.
 */
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared'),
        '@renderer': resolve(__dirname, 'src/renderer'),
      },
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') },
      },
    },
  },
})
