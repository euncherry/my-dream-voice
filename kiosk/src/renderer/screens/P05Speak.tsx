/**
 * P-05 [발화] 🟢 — B모드 전용 · 스파이크 ③
 *
 * 골격 단계: 대사 선택 로직(직업 × 연령대)과 세션 기록까지 실제로 배선한다.
 * 카운트다운 · getUserMedia 캡처 · WAV 저장은 SPIKE_PLAN §6 3번 단계에서 구현
 * (저장 IPC는 window.api.recording.saveWav 로 이미 열려 있음).
 *
 * ⚠️ 녹음 중 스피커 음소거 · DSP off (CLAUDE.md 금지사항 5·6)
 */

import { useMemo, type ReactNode } from 'react'
import { PlaceholderTag, Screen } from '../components/Screen'
import { useSession } from '../store/session'
import { jobLabel, linesFor } from '@shared/jobs'

const TODO_ITEMS = [
  '카운트다운(3·2·1) 후 자동 녹음 시작 → 4회 루프',
  'getUserMedia (DSP 전부 false) → Float32 PCM 수집',
  '녹음 중 스피커 음소거',
  '레벨 미터 · 재시도 버튼',
  'window.api.recording.saveWav 로 16kHz 모노 WAV 저장 ← 배선 완료',
  '자동 종료 조건 · 재시도 횟수 미정 (SPEC T-10)',
]

export function P05Speak(): ReactNode {
  const { jobs, ageGroup } = useSession((s) => s.session)
  const patch = useSession((s) => s.patch)
  const next = useSession((s) => s.next)

  const lines = useMemo(() => (ageGroup ? linesFor(jobs, ageGroup) : []), [jobs, ageGroup])

  function proceed(): void {
    // 실제 발화한 대사 4개를 세션에 기록 (리포트 §3 "오늘 말한 문장")
    patch({ lines: lines.map((l) => l.text) })
    next()
  }

  return (
    <Screen id="P-05" note="스파이크 ③ — 골격 단계: 대사 선택만 배선">
      <h1 className="screen__title">직업 대사 말하기</h1>
      <p className="screen__sub">발화 4회를 몰아서 진행한 뒤 촬영으로 넘어간다 (SPEC §2)</p>

      <div className="panel">
        {lines.map((line, i) => (
          <div key={jobs[i]} style={{ marginBottom: 'var(--gap-md)' }}>
            <div style={{ color: 'var(--c-text-dim)', fontSize: 'var(--fs-caption)' }}>
              {i + 1}/4 · {jobLabel(jobs[i]!)} · 출처 {line.source}
            </div>
            <div style={{ fontSize: 'var(--fs-heading)', fontWeight: 700 }}>{line.text}</div>
            {line.source === 'placeholder' && <PlaceholderTag label="대사 미확정 (SPEC T-3)" />}
          </div>
        ))}
      </div>

      <div className="panel">
        <strong>남은 구현 (SPIKE_PLAN §6 3번 단계)</strong>
        <ul style={{ fontSize: 'var(--fs-caption)', color: 'var(--c-text-dim)', lineHeight: 1.9 }}>
          {TODO_ITEMS.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>

      <button className="btn btn--primary" onClick={proceed}>
        발화 완료 → P-06
      </button>
    </Screen>
  )
}
