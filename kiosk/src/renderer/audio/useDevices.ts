/**
 * audio/useDevices.ts — 장치 목록 · USB 재연결 추적
 *
 * SPIKE_PLAN ① 완료 기준
 *   - 연결된 카메라/마이크/스피커 장치 목록이 표시된다
 *   - USB 재연결 후에도 장치를 다시 찾을 수 있다 (deviceId 유지 여부 기록)
 *
 * 운영기에서 실제로 나는 사고가 "USB를 다른 포트에 꽂았더니 deviceId가 바뀌어
 * 저장해둔 장치 설정이 무효가 되는 것"이다. 그래서 한 번 본 deviceId를 기억해두고
 * 뽑았다 꽂았을 때 같은 id로 돌아오는지 기록한다.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

export interface DeviceRow {
  kind: MediaDeviceKind
  label: string
  deviceId: string
  groupId: string
  /** 현재 연결되어 있는가 */
  present: boolean
  /** 뽑혔다가 같은 deviceId로 돌아온 적이 있는가 */
  returnedSameId: boolean
  /**
   * Windows가 만들어내는 가상 별칭('Default -', 'Communications -').
   * 실제 장치가 아니라 "현재 기본값"을 가리키는 포인터라, 이걸 골라두면
   * 나중에 기본 장치가 바뀔 때 조용히 다른 마이크로 녹음된다. 자동 선택에서 제외한다.
   */
  isPseudo: boolean
}

const PSEUDO_IDS = new Set(['default', 'communications'])

export interface DeviceLogEntry {
  at: string
  message: string
}

function timeLabel(): string {
  return new Date().toTimeString().slice(0, 8)
}

export function useDevices(): {
  devices: DeviceRow[]
  log: DeviceLogEntry[]
  permission: 'unknown' | 'granted' | 'denied'
  error: string | null
  requestPermission: () => Promise<void>
  refresh: () => Promise<void>
} {
  const [devices, setDevices] = useState<DeviceRow[]>([])
  const [log, setLog] = useState<DeviceLogEntry[]>([])
  const [permission, setPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown')
  const [error, setError] = useState<string | null>(null)

  /** 지금까지 본 모든 장치 (뽑혀도 남는다) */
  const seenRef = useRef(new Map<string, DeviceRow>())

  const say = useCallback((message: string) => {
    setLog((l) => [{ at: timeLabel(), message }, ...l].slice(0, 30))
  }, [])

  const refresh = useCallback(async () => {
    const list = await navigator.mediaDevices.enumerateDevices()
    const seen = seenRef.current
    const nowIds = new Set(list.map((d) => d.deviceId))

    for (const d of list) {
      const prev = seen.get(d.deviceId)
      if (!prev) {
        seen.set(d.deviceId, {
          kind: d.kind,
          label: d.label || '(라벨 없음 — 권한 필요)',
          deviceId: d.deviceId,
          groupId: d.groupId,
          present: true,
          returnedSameId: false,
          isPseudo: PSEUDO_IDS.has(d.deviceId),
        })
        say(`+ 연결 ${d.kind} · ${d.label || '(라벨 없음)'}`)
      } else if (!prev.present) {
        // 같은 deviceId로 돌아왔다 = 포트를 바꿔도 설정이 살아남는다
        seen.set(d.deviceId, {
          ...prev,
          present: true,
          returnedSameId: true,
          label: d.label || prev.label,
        })
        say(`↻ 같은 deviceId로 복귀 ✅ ${prev.label}`)
      } else if (d.label && d.label !== prev.label) {
        seen.set(d.deviceId, { ...prev, label: d.label })
      }
    }

    for (const [id, row] of seen) {
      if (row.present && !nowIds.has(id)) {
        seen.set(id, { ...row, present: false })
        say(`− 분리 ${row.kind} · ${row.label}`)
      }
    }

    // 라벨이 보인다 = 이전 실행에서 권한을 이미 받았다 (Electron이 기억한다)
    if (list.some((d) => d.label)) setPermission('granted')

    setDevices([...seen.values()])
  }, [say])

  /** 라벨과 deviceId는 권한을 한 번 받아야 노출된다 */
  const requestPermission = useCallback(async () => {
    setError(null)
    try {
      // ⚠️ 여기서도 DSP는 전부 off (CLAUDE.md 금지사항 5)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: { noiseSuppression: false, echoCancellation: false, autoGainControl: false },
      })
      stream.getTracks().forEach((t) => t.stop())
      setPermission('granted')
      say('권한 허용 — 라벨/deviceId 노출됨')
      await refresh()
    } catch (e) {
      setPermission('denied')
      setError((e as Error).message)
      say(`권한 실패 — ${(e as Error).message}`)
    }
  }, [refresh, say])

  useEffect(() => {
    void refresh()
    const onChange = (): void => {
      say('devicechange 이벤트')
      void refresh()
    }
    navigator.mediaDevices.addEventListener('devicechange', onChange)
    return () => navigator.mediaDevices.removeEventListener('devicechange', onChange)
  }, [refresh, say])

  return { devices, log, permission, error, requestPermission, refresh }
}
