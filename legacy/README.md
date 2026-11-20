# legacy — 빼 둔 옛 코드 (참고용)

지금 앱은 `../kiosk/`다. 여기 있는 것은 **빌드 · 실행 대상이 아니다** — 읽어 보는 용도로만 둔다.

## kiosk-v1/src

기획 v1 화면 흐름으로 만든 키오스크 앱의 `kiosk/src` 스냅숏 (커밋 `1671626` 기준, 코드만 — 글꼴 · 소리 파일 제외).
2026-11-20 v2 개편 때 고쳐 쓰지 않고 통째로 빼 두고, `kiosk/src`를 v2 화면 흐름대로 새로 썼다.

| v1 (여기) | v2 (`kiosk/src`) |
| --- | --- |
| 화면 P-00 ~ P-11 (14개) — 직업 4개 · 연령/별명 · 동의 자리만 · 분석 중/결과/인쇄/QR 따로 | 화면 P-00 ~ P-07 · P-02a · M-03 — `PAGE_SPEC.md` v0.3 |
| `renderer/report*` 리포트 템플릿 + `main/pdf.ts` 리포트 PDF | 리포트 PDF는 백엔드 서버가 만든다. 키오스크는 문구(`report/copy.ts`)만 완성해 보낸다 |
| `main/upload.ts` — v1 클라우드 업로드 → QR 다운로드 | `main/server.ts` — 세션 열기 · 로그인 확인 · 이메일 전달 · 데이터 전송 (지금은 mock) |
| 세로 네컷 1200×1800 (인쇄 때 90° 회전) | 가로 네컷 1844×1240 (돌리지 않고 1:1) |
| 추천 직업 (랜덤) | 없음 — 컨셉에서 빠졌다 |

**그대로 가져다 쓰는 것** (키오스크에서 검증된 하드웨어 쪽 — `kiosk/`에 살아 있다):
`camera-host/`(C# · EDSDK) · `main/camera.ts` · `main/cameraSelfTest.ts` · `main/print.ts` · `main/acoustic.ts` ·
`main/storage.ts` · `renderer/audio/*` · D-01 하드웨어 점검 · 설치판 설정(`package.json`의 electron-builder).
이 스냅숏에도 같은 파일이 들어 있지만, 고칠 때는 `kiosk/` 쪽을 고친다.

v1을 실제로 돌려 보려면 이 폴더가 아니라 저장소를 커밋 `1671626`(또는 `5dc349d`)으로 체크아웃한다.
