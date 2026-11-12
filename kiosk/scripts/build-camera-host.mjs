/**
 * scripts/build-camera-host.mjs — CameraHost.exe 빌드
 *
 * camera-host/publish/ 에 self-contained 단일 exe를 만든다.
 * electron-builder가 이 폴더를 resources/camera-host로 복사한다 (package.json extraResources).
 *
 * .NET SDK를 사용자 폴더에만 설치한 PC는 PATH에 dotnet이 없어 알려진 위치도 찾아본다.
 */

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const project = join(root, 'camera-host', 'CameraHost.csproj')
const output = join(root, 'camera-host', 'publish')

function findDotnet() {
  const candidates = [
    process.env.DOTNET_ROOT && join(process.env.DOTNET_ROOT, 'dotnet.exe'),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Microsoft', 'dotnet', 'dotnet.exe'),
  ].filter(Boolean)
  return candidates.find((p) => existsSync(p)) ?? 'dotnet'
}

const result = spawnSync(
  findDotnet(),
  ['publish', project, '-c', 'Release', '-o', output, '--nologo'],
  {
    stdio: 'inherit',
    env: { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_NOLOGO: '1' },
  },
)

if (result.error) {
  console.error(`dotnet 실행 실패: ${result.error.message}`)
  console.error('.NET 10 SDK가 설치되어 있는지 확인하세요.')
  process.exit(1)
}
process.exit(result.status ?? 1)
