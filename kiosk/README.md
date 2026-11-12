# kiosk — 마이 드림 보이스 키오스크 앱 (스파이크)

Electron(메인=Node) + Vite + React + TypeScript(렌더러).
전체 개요·현재 상태는 [`../README.md`](../README.md), 규칙은 `../CLAUDE.md`, 화면 정의는 `../PAGE_SPEC.md`, 작업 계획은 `../SPIKE_PLAN.md`.

## 실행

```bash
npm run dev
```

```bash
npm run build
```

카메라 사이드카는 따로 빌드한다 (.NET 10 SDK 필요, 키오스크 PC에는 불필요).

```bash
npm run camera:build
```

```bash
npm run camera:test
```

```bash
npm run camera:test:edsdk
```

설치 파일(NSIS 설치판 + 포터블)은 `npm run dist` → `dist/`.

## 구조

```
camera-host/             R100 제어 사이드카 (C# · .NET 10 · self-contained exe)
├── Program.cs           stdin/stdout JSON Lines 프로토콜 · 백엔드 선택(--backend)
├── ICamera.cs           백엔드 계약 — FakeCamera / EdsdkCamera
├── FakeCamera.cs        실물 없는 검증용
├── EdsdkCamera.cs       실물 R100 (연결·라이브뷰·촬영·끊김 감지·전원 꺼짐 방지)
├── Edsdk.cs             Canon EDSDK P/Invoke 선언 · 오류 코드 → 안내 문구
├── CameraWorker.cs      카메라 호출 전담 스레드
├── LiveViewServer.cs    라이브뷰 MJPEG (loopback + 토큰)
├── edsdk/               EDSDK.dll · EdsImage.dll (64비트) — ⚠️ 저장소 제외, 직접 넣는다
├── smoke-test.mjs       프로토콜 검증 (가짜 카메라)
└── edsdk-test.mjs       실물 R100 시험
src/
├── main/                메인 프로세스 — 무거운 작업은 전부 여기 (CLAUDE.md 금지사항 2)
│   ├── index.ts         창 생성 · 수명주기 · 미디어 권한
│   ├── ipc.ts           IPC 핸들러 등록
│   ├── camera.ts        사이드카 기동 · 명령 · 복구 · 카메라 로그
│   ├── cameraSelfTest.ts D-01 실카메라 자가진단 (결과 폴더를 바탕화면에)
│   ├── storage.ts       세션 폴더 · 16kHz WAV 작성 · 사진 저장
│   ├── acoustic.ts      녹음 음향 지표 (크기·무음·음도) — 재녹음 판단용, 리포트에 넣지 않음
│   ├── pdf.ts           printToPDF (리포트 A4 · 네컷 4×6 풀블리드)
│   ├── print.ts         pdf-to-printer 사일런트 인쇄
│   ├── upload.ts        클라우드 업로드 (P-09에서 인쇄와 동시 시작 · 15초 타임아웃)
│   └── mock/analysis.ts ⚠️ MOCK 분석 — 이후 실제 모듈이 이 파일만 교체
├── preload/index.ts     contextBridge → window.api
├── renderer/            Vite + React (Next.js 금지)
│   ├── index.html       키오스크 UI 엔트리
│   ├── report.html      보호자 리포트 엔트리 (PDF·웹 공용)
│   ├── screens/         D-01 · P-00 ~ P-11 · M-02
│   ├── components/      화면 틀 · DevBar · 카메라/인쇄 점검 패널
│   ├── audio/           마이크 장치 · PCM 수집 (DSP off) · 재생
│   ├── report/          리포트 템플릿 1개 + 문구
│   ├── photo/           네컷 합성 (1200×1800 @300dpi) · 인쇄 점검표
│   ├── store/session.ts 세션 스토어 = 화면 전환의 단일 소스
│   └── styles/tokens.css 디자인 토큰 (임시 다크 톤 — 디자인 확정 시 교체)
└── shared/              메인·렌더러 공용
    ├── types.ts         IPC 계약 · 데이터 인터페이스
    ├── jobs.ts          직업 8종 · 연령 매핑 · 대사
    └── constants.ts     설치처 · 인쇄 규격 · TTL
```

## 세션 폴더

기본 위치: `./sessions/<YYYYMMDD-HHmmss-xxxx>/`
(`MDV_DATA_DIR` 환경변수로 변경 가능. 패키징 빌드에서는 userData 아래)

```
audio/   01_police.wav ...        16kHz 모노 16bit
photo/   cut_01.jpg ...           카메라 원본
output/  fourcut.png · photo_4x6.pdf · report.pdf
```

D-01의 DSP 비교 녹음은 파일명에 `_dsp-ns-ec-agc` 접미사가 붙는다.
본 플로우(P-05)는 DSP를 전부 끄므로 접미사가 없다.

## 카메라

R100은 UVC가 아니라 `getUserMedia`에 잡히지 않는다. 사이드카가 EDSDK로 제어하고,
라이브뷰는 `http://127.0.0.1:<port>/live/<token>` MJPEG를 `<img>`로 받는다.

백엔드는 두 가지다 (`MDV_CAMERA`로 덮어쓸 수 있다).

| 실행 방식 | 기본 백엔드 |
| --- | --- |
| `npm run dev` | `fake` — 화면에 "가짜 카메라"와 `FAKE CAMERA`가 표시된다 |
| 설치판 (`npm run dist`) | `edsdk` — 실물 R100. `camera-host/edsdk/`에 DLL이 있어야 한다 |

⚠️ EDSDK 백엔드는 R100 실물 시험 전이다 (SPEC T-11).
EDSDK DLL은 Canon 이용약관상 앱 패키지에만 포함하고 단독 배포하지 않는다.

D-01 `②-B` 패널에서 연결 · 라이브뷰 · 테스트 촬영 · USB 분리 흉내(가짜 카메라), 그리고
**[실카메라 자가진단]** (연결 → 라이브뷰 측정 → 4컷 촬영 → 결과 폴더)을 실행할 수 있다.
카메라 로그는 `%APPDATA%\MyDreamVoice\logs\camera-YYYYMMDD.log`.

## 인쇄 점검

사일런트 인쇄는 PDF를 확대 없이 용지 왼쪽 위부터 얹는다 (SumatraPDF `noscale`).
그래서 네컷 PDF는 DP-DS620의 `(6x4)` 페이지(6.15×4.13in 가로)에 맞춰 사진을 돌려 만든다.
인쇄할 때 `(6x4)` 용지와 `landscape`를 지정한다. 방향을 지정하지 않으면 드라이버의 세로 표시를 따라 PDF가 다시 세로로 돌아가 아래가 잘린다.
드라이버의 기본 용지와 방향은 이 인쇄에 영향을 주지 않는다.
D-01 인쇄 점검 패널에서 `(6x4)` 용지를 확인하고, 크기 점검표를 네컷과 같은 경로로 뽑아볼 수 있다.

## 클라우드 연동

`cloud/` 배포 후 아래를 설정한다.

```
MDV_UPLOAD_ENDPOINT=https://<앱>.vercel.app/api/upload
MDV_UPLOAD_SECRET=<cloud와 동일한 값>
```

미설정 시 P-10은 업로드 실패 → 오프라인 폴백("인쇄물만 제공됩니다") 경로로 동작한다.

## 스파이크 전용 장치

- 시작 화면이 **D-01[하드웨어 체크]** 다 (운영 빌드에서는 P-00).
- 우하단 DevBar
  - `D-01` 이동
  - **방향 토글** — 가로 확정(T-2) 후에도 세로 대응을 CSS 변수로 남겨 둔 것을 확인
  - **MOCK 시나리오** — 「전부 잘 인식됨」/「일부 다르게 인식됨」 두 리포트 레이아웃 확인
- `report.html#demo=all` / `#demo=some` 으로 리포트 템플릿만 따로 볼 수 있다.
