# kiosk — 마이 드림 보이스 키오스크 앱

Electron(메인=Node) + Vite + React + TypeScript(렌더러).
전체 개요·현재 상태는 [`../README.md`](../README.md), 규칙은 `../CLAUDE.md`, 화면 정의는 `../PAGE_SPEC.md`, 진행 순서는 `../V2_BUILD_CHECKLIST.md`.

> **v2 화면 흐름** (기획 2026-11-16 · 18 · 19 · 20) — `src/`를 v2대로 새로 썼다. v1 화면 흐름 코드는 `../legacy/kiosk-v1/src`에 빼 두었다(참고용).
> 지금은 **구조와 동작만** 있다 — 화면 디자인은 P-00 · P-01 · P-02 · P-02a까지 입혔고(나머지는 입히기 전), 받아쓰기 · 정밀 분석 · 백엔드 서버는 `src/main/mock/`의 가짜가 대신한다.

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

| 실행 방식 | 카메라 | 인쇄 (P-07) | 서버 |
| --- | --- | --- | --- |
| `npm run dev` | 가짜 (`MDV_CAMERA`로 바꿈) | 가짜 — 종이를 쓰지 않는다 (`MDV_PRINT`로 바꿈) | mock |
| 설치판 | 실물 R100 (EDSDK) | **실제 인쇄 — P-07에 도착하면 자동으로 나간다** | mock (API 합의 전 — SPEC T-14) |

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
│   ├── index.ts         창 생성 · 수명주기 · 미디어 권한 · 라이브뷰 녹화 허용 헤더
│   ├── ipc.ts           IPC 핸들러 등록 · 인쇄 기본값(실제/가짜)
│   ├── camera.ts        사이드카 기동 · 명령 · 복구 · 카메라 로그
│   ├── cameraSelfTest.ts D-01 실카메라 자가진단 (결과 폴더를 바탕화면에)
│   ├── storage.ts       세션 폴더 · 16kHz WAV 작성/삭제 · 사진 · 촬영 영상 저장
│   ├── acoustic.ts      녹음 음향 지표 (크기·무음·음도) · 무음 검사 — 리포트에 넣지 않음
│   ├── cer.ts           글자 단위 CER — P-05 다시 말하기 판단에만 쓴다
│   ├── pdf.ts           printToPDF — 가로 네컷(1844×1240)을 4×6 페이지에 1:1로
│   ├── print.ts         pdf-to-printer 사일런트 인쇄
│   ├── server.ts        백엔드와 주고받기 — 세션 열기 · 로그인 확인 · 이메일 전달 · 데이터 전송 · 세션 닫기
│   │                    (보내도 되는 것만 골라 담는다 — SPEC §6-2). 지금은 mock/server.ts에 연결
│   └── mock/            ⚠️ 가짜 — 나중에 교체될 자리
│       ├── stt.ts       받아쓰기 (무음 검사 · CER은 실제) → 파이썬 faster-whisper 프로그램으로
│       ├── analysis.ts  정밀 분석 → 파이썬 분석 프로그램으로
│       └── server.ts    백엔드 서버의 대답 흉내 → HTTP로 (SPEC T-14)
├── preload/index.ts     contextBridge → window.api
├── renderer/            Vite + React (Next.js 금지)
│   ├── index.html       키오스크 UI 엔트리 (하나뿐 — 리포트 PDF는 서버가 만든다)
│   ├── screens/         D-01 · P-00 ~ P-07 · P-02a · M-02 · M-03 (PAGE_SPEC v0.3 번호)
│   ├── components/      화면 틀(Screen) · 디자인 화면 틀(Stage) · [← 뒤로](BackButton) · 색 덩어리(Blob) · DevBar · 이메일 화면 키보드 · 카메라/인쇄/받아쓰기 점검 패널
│   ├── audio/           마이크 장치 · PCM 수집 (DSP off) · 재생 · P-05 음성 클립
│   ├── report/          리포트 문구 완성본(copy.ts) · P-07 미리보기
│   ├── photo/           가로 네컷 합성 1844×1240 · 프레임 미리보기 · 촬영 장면 녹화 · 인쇄 점검표
│   ├── public/          audio/(음성 · 효과음) · frames/(직업 프레임 PNG — 아직 없음) · worklets/
│   ├── store/session.ts 세션 스토어 = 화면 전환의 단일 소스 (순서는 nextScreen() · prevScreen())
│   └── styles/          tokens.css(임시 톤 + 디자인 토큰 --d-*) · app.css(공통) · design.css(디자인 화면 공통 부품) · 화면별 CSS
└── shared/              메인·렌더러 공용
    ├── types.ts         IPC 계약 · 세션 모델 · 서버로 보내는 데이터
    ├── jobs.ts          직업 6종 · 연령 구간(만 4 · 5 · 6+) · 시나리오 데이터(타깃 문장 2개 · 어절) · 녹음 멘트
    └── constants.ts     설치처 · 네컷 규격과 칸 좌표(임시) · 시간 값
```

## 세션 폴더

기본 위치: `./sessions/<YYYYMMDD-HHmmss-xxxx>/`
(`MDV_DATA_DIR` 환경변수로 변경 가능. 설치판에서는 `%APPDATA%\MyDreamVoice\sessions`)

```
audio/   01_police.wav · 02_police.wav     16kHz 모노 16bit — 타깃 문장 순번
         01-2_police.wav                   만 4세는 어절 순번을 붙인다
         01_police_retry.wav               다시 말한 녹음 (판단 직후 안 쓰는 쪽을 지운다)
photo/   cut_01.jpg ... cut_04.jpg         카메라 원본
video/   capture.webm                      촬영 장면 영상 (P-07 재생용 — 서버로 보내지 않는다)
output/  fourcut.png · photo_4x6.pdf       가로 네컷 · 인쇄용 PDF
```

체험이 끝나면(M-03) 폴더째 지운다. D-01에서 만든 `dev-…` 폴더는 지우지 않는다.

체험 도중 앱이 꺼지면 그 폴더를 기억하는 곳이 없으므로, **설치판은 앱을 켤 때와 새 체험을 시작할 때(P-00) 남은 손님 세션 폴더를 지운다**
(`main/storage.ts`의 `purgeLeftoverSessions`). 개발 실행(`./sessions`)은 뽑아 본 결과물을 남겨 두려고 지우지 않는다.
그래서 앱은 하나만 뜬다 — 두 번째 실행은 바로 꺼진다.

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

키오스크에서 실물 촬영까지 확인했다 (2026-11 · v1 화면 흐름으로). 라이브뷰 크기·셔터 지연·장시간 동작은 자가진단 결과로 확인 중 (SPEC T-11).
EDSDK DLL은 Canon 이용약관상 앱 패키지에만 포함하고 단독 배포하지 않는다.

D-01 `②-B` 패널에서 연결 · 라이브뷰 · 테스트 촬영 · USB 분리 흉내(가짜 카메라), 그리고
**[실카메라 자가진단]** (연결 → 라이브뷰 측정 → 4컷 촬영 → 결과 폴더)을 실행할 수 있다.
카메라 로그는 `%APPDATA%\MyDreamVoice\logs\camera-YYYYMMDD.log`.

**촬영 장면 녹화 (P-06)** — 라이브뷰 `<img>`를 캔버스에 그려 `MediaRecorder`로 webm을 만든다 (`photo/recordLiveView.ts`).
라이브뷰는 앱 화면과 출처가 달라, 메인이 그 주소의 응답에만 허용 헤더를 붙인다 (`main/index.ts`).
녹화는 덤이다 — 실패하면 영상 없이 촬영을 그대로 진행한다. ⚠️ 실물 R100 라이브뷰에서는 아직 확인하지 못했다.

## 네컷 · 인쇄

네컷은 **가로 1844×1240** 으로 합성한다 (`photo/composeFourCut.ts` — 규격 SPEC §4-1). DP-DS620의 `(6x4)` 페이지(6.15×4.13in 가로)와 같아
PDF에 **돌리지 않고 1:1로** 얹는다 (`main/pdf.ts`). 사일런트 인쇄는 PDF를 확대 없이 용지 왼쪽 위부터 얹고(SumatraPDF `noscale`),
`(6x4)` 용지와 `landscape`를 지정한다. 드라이버의 기본 용지와 방향은 이 인쇄에 영향을 주지 않는다.

- 사진 칸 4개 · 오른쪽 띠 좌표는 `shared/constants.ts`의 `FOURCUT` — **임시값**이다. 디자이너의 칸 좌표가 오면 여기만 바꾼다
- 직업 프레임 PNG는 `src/renderer/public/frames/<jobId>.png` 에 넣는다 (없으면 PLACEHOLDER 프레임 — `public/frames/README.md`)
- P-07은 **USB로 꽂힌 프린터**를 고른다 (없으면 기본 프린터 · PDF 저장 같은 가상 프린터는 제외). 고른 프린터가 꺼져 있거나 인쇄 요청이 30초 안에 끝나지 않으면 인쇄 실패(M-02)로 본다
- 인쇄 "완료"는 프린터 큐에 넣은 뒤 9초(임시) 기다린 것이다 — 용지 · 리본이 떨어진 것은 아직 잡지 못한다
- D-01 인쇄 점검 패널에서 `(6x4)` 용지를 확인하고, 크기 점검표를 네컷과 같은 경로로 뽑아볼 수 있다
- ⚠️ 가로 네컷은 **실물 인쇄로 아직 확인하지 못했다** — 키오스크에서 점검표부터 뽑아 본다

## 서버 연동 (지금은 mock)

키오스크 몫은 **세션 열기 → 데이터 보내기 → 세션 닫기**까지다 (SPEC §6-1). B모드에서만 쓴다.

| 언제 | 하는 일 | 코드 |
| --- | --- | --- |
| P-02a 도착 | 세션 열기 → 세션 번호 · QR 주소 | `server.openSession` |
| P-02a | 카카오 로그인이 끝났는지 몇 초마다 확인 / 직접 입력한 이메일 전달 (보낸 뒤 기기에 남기지 않는다) | `linkStatus` · `submitEmail` |
| P-07 분석 직후 | 리포트 데이터 전송 — 15초 타임아웃 · 실패해도 화면에 안 띄움 · 다시 보내려고 남기지 않음 | `sendReport` |
| M-03이 닫힐 때 | 세션 닫기 | `closeSession` |

`main/server.ts`가 보내는 데이터를 SPEC §6-2의 항목만으로 다시 짠다 — 요청 타입에 녹음 · 사진 · 영상 · 받아쓴 글자 · 인식률 · 이메일 자리가 아예 없고,
네컷은 메인이 세션 폴더의 합성본만 읽어 붙인다. 마지막으로 그런 이름의 필드나 파일 경로(.wav · .webm · .jpg …)가 섞여 있으면 보내지 않는다
(이름 · 확장자 검사다 — 문구 안의 내용까지 읽어 가리지는 않는다).
백엔드 API가 정해지면 `server.ts`의 `Backend` 자리(`mock/server.ts`)를 HTTP 구현으로 바꾼다. 주소 · 인증 키 환경 변수도 그때 정한다.

## 개발용 장치

- 시작 화면이 **D-01[하드웨어 체크]** 다 (운영 빌드에서는 P-00).
- 오른쪽 아래 **DevBar** ([펼치기])
  - 화면 이동 — 흐름 중간으로 건너뛰면 세션 · 모드 · 직업 · 연령을 개발용 기본값으로 채운다
  - **MOCK 분석** — 랜덤 · 전부 잘 인식됨 · 일부 다르게 인식됨 · 전부 판단 보류 · 분석 실패
  - **MOCK 받아쓰기** — 직접 고르기(P-05에 [통과] [실패] [무음] 버튼) · 항상 통과 · 항상 실패
  - **MOCK 서버** — 연결됨 · 끊김 (P-02a 연결 실패 · P-07 전송 실패 확인)
  - **인쇄** — 실제 · 가짜
- 화면 안의 점선 띠(**개발용 · …**)는 손님 화면에는 없는 조작이다 (P-02a [카카오 로그인 완료 흉내] 등).
- ⚠️ DevBar · 개발용 띠 · D-01을 운영 빌드에서 숨기는 처리는 아직 없다.
