/**
 * src/main/mock/stt.ts — ⚠️ MOCK 받아쓰기 (나중에 교체될 자리)
 *
 * 실제로 들어올 것 (SPEC §3-3 · V2_PLAN §5)
 *   앱 안에 같이 넣는 파이썬 별도 프로그램(faster-whisper) — 카메라 프로그램처럼 표준 입출력 JSON.
 *   녹음(16kHz 모노 WAV)과 목표 글자(힌트)를 넘기면 받아쓰기를 돌려준다. 문장당 평균 2.5~4초.
 *
 * 지금 하는 일
 *   ✅ 실측 — 무음 검사: 저장된 WAV를 실제로 읽어 잰다 (무음이면 받아쓰지 않는다)
 *   ⚠️ MOCK — 받아쓰기: 목표 글자를 그대로 돌려주거나(통과) 앞부분만(실패) 돌려준다
 *   ✅ 실측 — CER: 돌려준 글자와 목표 글자를 실제로 비교한다 (main/cer.ts)
 *
 * ⚠️ 교체 시에도 시그니처는 그대로: (SttRequest) => Promise<SttResult>
 * ⚠️ 클라우드 STT 금지 — 아이 음성은 기기 밖으로 나가지 않는다 (CLAUDE.md 금지사항 3)
 */

import { resolve, sep } from 'node:path'
import { isSilent, measureWavFile } from '../acoustic'
import { calculateCer, normalizeForCer } from '../cer'
import { getDataRoot } from '../storage'
import type { SttRequest, SttResult } from '../../shared/types'

/** 실제 받아쓰기 평균(2.5~4초)의 아래쪽을 흉내 낸다 — "잘 듣고 있어요" 화면이 보이는 시간 */
const MOCK_DELAY_MS = 2_500
/** 개발용 버튼으로 결과를 직접 골랐을 때는 이미 기다렸으므로 짧게 */
const MOCK_DELAY_PICKED_MS = 300

/** 실패 흉내 — 목표 글자의 앞 30%만 "인식된" 것으로 돌려준다 (인식률 약 30%) */
function partialTranscript(target: string): string {
  const chars = Array.from(normalizeForCer(target))
  return chars.slice(0, Math.floor(chars.length * 0.3)).join('')
}

export async function transcribe(req: SttRequest): Promise<SttResult> {
  const startedAt = Date.now()
  const done = (result: Omit<SttResult, 'elapsedMs' | 'mock'>): SttResult => ({
    ...result,
    elapsedMs: Date.now() - startedAt,
    mock: true,
  })

  const full = resolve(req.wavPath)
  if (!full.startsWith(resolve(getDataRoot()) + sep) || !full.toLowerCase().endsWith('.wav')) {
    throw new Error(`transcribe: 세션 폴더 안의 .wav만 받아쓸 수 있습니다 (${req.wavPath})`)
  }

  const outcome = req.mock?.outcome ?? 'pass'
  const picked = req.mock?.skipSilenceCheck === true

  // ✅ 실측 — 무음이면 받아쓰기 없이 끝낸다. (개발용 버튼으로 고른 경우만 건너뛴다)
  if (!picked) {
    const feature = await measureWavFile(full, 0)
    if (isSilent(feature)) return done({ silent: true })
  }
  if (outcome === 'silent') return done({ silent: true })

  // ⚠️ MOCK — 실제 받아쓰기가 들어올 자리
  await new Promise((r) => setTimeout(r, picked ? MOCK_DELAY_PICKED_MS : MOCK_DELAY_MS))
  const transcript = outcome === 'fail' ? partialTranscript(req.targetText) : req.targetText

  return done({
    silent: false,
    transcript,
    cer: calculateCer(req.targetText, transcript),
  })
}
