/**
 * src/main/mock/analysis.ts — ⚠️ MOCK 정밀 분석 (나중에 교체될 자리)
 *
 * 실제로 들어올 것 (SPEC §3-3 · V2_PLAN §5)
 *   앱 안에 같이 넣는 파이썬 별도 프로그램 — P-05에서 남긴 녹음 + 받아쓰기로
 *   스펙트로그램 · 피치 등을 보고 소리별 "잘 인식됨 / 다르게 인식됨"을 낸다 (로직은 SPEC T-4).
 *   P-07[분석 및 프린트]에서 촬영 뒤에 돈다 — 영상 재생이 끊기지 않게 낮은 우선순위로.
 *
 * 지금 하는 일
 *   ✅ 실측 — 남긴 WAV의 진폭 · 무음 · 음도 (리포트 · 서버로 넘기지 않는다)
 *   ⚠️ MOCK — 소리별 관찰 결과는 시나리오 토글(DevBar)대로 만들어 낸다
 *
 * ⚠️ 교체 시에도 시그니처는 그대로: (AnalysisInput) => Promise<AnalysisOutput>
 * ⚠️ 추천 직업은 v2에서 컨셉에서 빠졌다 — 여기서 만들지 않는다.
 */

import { randomInt } from 'node:crypto'
import { measureWavFile } from '../acoustic'
import { scenarioFor, targetSoundsFor } from '../../shared/jobs'
import type {
  AnalysisInput,
  AnalysisOutput,
  ObservationResult,
  SoundObservation,
  SoundResult,
  TargetSound,
} from '../../shared/types'

/** mock 지연 — 실제 분석 시간은 키오스크 PC에서 잰다 (SPEC T-15) */
const MOCK_DELAY_MS = { min: 3_000, max: 5_000 }

/** 녹음이 남은 문장에서 그 소리가 든 낱말을 찾는다 */
function wordFor(input: AnalysisInput, sound: TargetSound): string | undefined {
  const turns = scenarioFor(input.job, input.ageGroup).turns
  for (let i = 0; i < turns.length; i++) {
    const recorded = input.speech[i]?.parts.some((p) => p.wav)
    if (!recorded) continue
    const hit = turns[i]!.line.targets.find((t) => t.sound === sound)
    if (hit) return hit.word
  }
  return undefined
}

function buildObservation(input: AnalysisInput): ObservationResult {
  const sounds = targetSoundsFor(input.ageGroup)
  const anyRecording = input.speech.some((line) => line.parts.some((p) => p.wav))

  let results: SoundResult[]
  if (!anyRecording || input.scenario === 'all-skipped') {
    // 남은 녹음이 없으면(전부 무음) 살펴볼 수 없다 — 전부 판단 보류
    results = sounds.map(() => 'skipped')
  } else {
    switch (input.scenario) {
      case 'all-well':
        results = sounds.map(() => 'well')
        break
      case 'some-different': {
        // 한 개만 different — 「가능한 이유 + 집에서 들어보기」가 붙는 갈래 확인용
        const hit = randomInt(sounds.length)
        results = sounds.map((_, i) => (i === hit ? 'different' : 'well'))
        break
      }
      default:
        results = sounds.map(() => (randomInt(100) < 30 ? 'different' : 'well'))
    }
  }

  const observations: SoundObservation[] = sounds.map((sound, i) => {
    const word = wordFor(input, sound)
    return { sound, ...(word ? { word } : {}), result: results[i]! }
  })

  return {
    type: 'reference',
    diagnostic: false,
    sounds: observations,
    hasDifferent: observations.some((o) => o.result === 'different'),
    allSkipped: observations.every((o) => o.result === 'skipped'),
  }
}

/** ⚠️ MOCK: 실제 분석 프로그램으로 교체 예정 */
export async function runAnalysis(input: AnalysisInput): Promise<AnalysisOutput> {
  const startedAt = Date.now()

  // ✅ 실측 — 남긴 녹음을 실제로 읽어 잰다
  const wavs = input.speech.flatMap((line) => line.parts.flatMap((p) => (p.wav ? [p.wav] : [])))
  const speechFeatures = await Promise.all(wavs.map((path, i) => measureWavFile(path, i)))

  // ⚠️ MOCK — 지연만 흉내 낸다
  const delay = MOCK_DELAY_MS.min + randomInt(MOCK_DELAY_MS.max - MOCK_DELAY_MS.min)
  await new Promise((r) => setTimeout(r, delay))

  // 분석 실패 갈래 확인용 — P-07은 미리보기 없이 인쇄로 넘어가야 한다
  if (input.scenario === 'fail') throw new Error('MOCK: 분석 실패 흉내 (DevBar 시나리오)')

  return {
    speechFeatures,
    observation: buildObservation(input),
    elapsedMs: Date.now() - startedAt,
  }
}
