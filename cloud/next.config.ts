import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // 이 앱은 업로드 API + 파일 서빙이 전부다. 페이지 UI는 /expired 하나뿐.
  poweredByHeader: false,
}

export default nextConfig
