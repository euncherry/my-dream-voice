import type { KioskApi } from '../shared/types'

declare global {
  interface Window {
    api: KioskApi
  }
}

export {}
