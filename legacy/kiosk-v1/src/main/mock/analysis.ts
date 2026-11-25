/**
 * src/main/mock/analysis.ts — ⚠️ MOCK 분석 (나중에 교체될 자리)
 *
 * SPIKE_PLAN §5 "Mock 처리 규칙"
 *   분석은 이번 범위가 아니므로, 결과 데이터를 만들어내는 함수 하나로 격리한다.
 *   이후 실제 분석 모듈로 **이 파일만** 교체된다.
 *
 * 실제 분석이 들어올 자리 (SPEC §3-3)
 *   16kHz 모노 WAV 4개
 *     ├→ WWC Voice Care Model (fp32 ONNX) → 원시 발음 전사
 *     └→ whisper.cpp (로컬)               → 의미 교정 전사
 *          ↓  대사별 목표음 위치와 대조 → 음소별 "잘 인식됨 / 다르게 인식됨"
 *
 * ⚠️ 교체 시에도 시그니처는 그대로 유지할 것: (AnalysisInput) => Promise<AnalysisOutput>
 */

import { randomInt } from 'node:crypto'
import { measureWavFile } from '../acoustic'
import { targetSoundsFor } from '../../shared/jobs'
import type {
  AnalysisInput,
  AnalysisOutput,
  JobId,
  ObservationResult,
  PhonemeObservation,
} from '../../shared/types'

/** 실제 분석 목표 소요 5~7초 (PAGE_SPEC P-07). mock도 같은 체감을 준다. */
const MOCK_DELAY_MS = { min: 3_000, max: 5_000 }

function buildObservation(input: AnalysisInput): ObservationResult {
  const sounds = targetSoundsFor(input.ageGroup)

  let results: PhonemeObservation[]
  switch (input.scenario) {
    case 'all-recognized':
      results = sounds.map((sound) => ({ sound, result: 'recognized' as const }))
      break
    case 'some-different': {
      // 한 개만 different — 「가능한 이유 + 집에서 들어보기」 섹션이 붙는 레이아웃 확인용
      const hit = randomInt(sounds.length)
      results = sounds.map((sound, i) => ({
        sound,
        result: i === hit ? ('different' as const) : ('recognized' as const),
      }))
      break
    }
    default:
      results = sounds.map((sound) => ({
        sound,
        result: randomInt(100) < 30 ? ('different' as const) : ('recognized' as const),
      }))
  }

  return {
    type: 'reference',
    diagnostic: false,
    phonemes: results,
    hasDifferent: results.some((p) => p.result === 'different'),
  }
}

function pickRecommendedJob(jobs: JobId[]): JobId {
  // TODO(T-1): 추천 직업 산출 로직 확정 후 교체
  //   후보 A(목표음이 가장 잘 인식된 직업)는 아동 화면에 평가가 노출되어
  //   CLAUDE.md 금지사항 7·8과 충돌한다. 후보 B(음향 특성 기반 중립 매칭)가 유력.
  //   확정 전까지는 "선택한 4개 중 랜덤" (SPEC T-1)
  return jobs[randomInt(jobs.length)]!
}

function pickPositiveMessage(): string {
  // TODO: 긍정 문구 세트 미확정 (PAGE_SPEC P-08 미결) — 문구 확정 후 교체
  return '[PLACEHOLDER] 오늘 목소리 정말 씩씩했어요!'
}

/**
 * ⚠️ MOCK: 실제 분석 모듈로 교체 예정.
 * 입력 WAV는 읽지 않는다(경로 존재만 확인). 로딩 화면(P-07) 동작 검증이 목적.
 */
export async function runAnalysis(input: AnalysisInput): Promise<AnalysisOutput> {
  const startedAt = Date.now()

  // ✅ 실측 — 진폭·무음·음도는 mock이 아니라 저장된 WAV를 실제로 읽어 계산한다
  const speechFeatures = await Promise.all(
    input.recordings.map((path, i) => measureWavFile(path, i)),
  )

  // ⚠️ MOCK — 전사·음소 대조는 아직 없다. 지연만 시뮬레이션한다
  const delay = MOCK_DELAY_MS.min + randomInt(MOCK_DELAY_MS.max - MOCK_DELAY_MS.min)
  await new Promise((r) => setTimeout(r, delay))

  const output: AnalysisOutput = {
    speechFeatures,
    observation: buildObservation(input),
    recommendedJob: pickRecommendedJob(input.jobs),
    positiveMessage: pickPositiveMessage(),
    elapsedMs: Date.now() - startedAt,
  }

  return output
}
