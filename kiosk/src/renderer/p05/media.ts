/**
 * p05/media.ts — P-05 장면 그림 · 캐릭터 목소리 파일 찾기
 *
 * 파일은 받는 대로 아래 자리에 넣으면 앱을 다시 빌드할 때 저절로 쓰인다 (코드 고칠 것 없음 — assets/p05/README.md).
 *   그림:   assets/p05/scenes/<직업>/<장면 번호>.webp|png|jpg   예) scenes/astronaut/A-03.webp
 *   목소리: assets/p05/voice/<직업>/<대사 이름>.mp3|wav|m4a     예) voice/astronaut/mission.mp3
 * 없으면 — 그림은 장면 번호 + 장면 설명을 적은 임시 판, 목소리는 자막만 글자 수만큼 보여 준다.
 *
 * 빌드할 때 파일 목록을 만든다(import.meta.glob) — 없는 파일을 요청했다가 기다리는 일이 없다.
 */

import type { JobId } from '@shared/types'

const sceneFiles = import.meta.glob<string>('../assets/p05/scenes/*/*.{webp,png,jpg}', {
  eager: true,
  query: '?url',
  import: 'default',
})

const voiceFiles = import.meta.glob<string>('../assets/p05/voice/*/*.{mp3,wav,m4a}', {
  eager: true,
  query: '?url',
  import: 'default',
})

/** '<직업>/<이름>' → 주소 */
function index(files: Record<string, string>): Map<string, string> {
  const map = new Map<string, string>()
  for (const [path, url] of Object.entries(files)) {
    const m = /\/([^/]+)\/([^/]+)\.[a-z0-9]+$/i.exec(path)
    if (m) map.set(`${m[1]}/${m[2]}`, url)
  }
  return map
}

const SCENES = index(sceneFiles)
const VOICES = index(voiceFiles)

/** 장면 그림 — 없으면 undefined (임시 판) */
export function sceneUrl(job: JobId, id: string): string | undefined {
  return SCENES.get(`${job}/${id}`)
}

/** 캐릭터 목소리 — 없으면 undefined (자막만) */
export function voiceUrl(job: JobId, key: string): string | undefined {
  return VOICES.get(`${job}/${key}`)
}

/** 그 직업의 그림을 미리 풀어 둔다 — 장면이 넘어갈 때 한 박자 비지 않게 */
export function preloadScenes(job: JobId): void {
  for (const [key, url] of SCENES) {
    if (!key.startsWith(`${job}/`)) continue
    const img = new Image()
    img.src = url
    void img.decode().catch(() => undefined)
  }
}

/** 띵 — "마이크가 반짝이고 띵! 하면 말해" 신호에만 쓴다 (public/audio/sfx/ding.wav · 2026-11-23 받은 소리) */
export const DING_URL = './audio/sfx/ding.wav'
