---
title: "Live Meeting AI 구현 누락 분석 및 작업 계획"
date: 2026-07-01
source_spec: "../상세서.md"
status: "analysis"
---

# Live Meeting AI 구현 누락 분석 및 작업 계획

## 1. 기준과 전제

- 기준 문서: `상세서.md`
- 현재 앱: TanStack Start, React 19, Vite, Tailwind CSS v4, Zustand 기반 프론트엔드 데모
- 현재 검증 결과:
  - `node_modules` 없음
  - `npm run lint` 실패: `eslint` 실행 파일 없음
  - `npm run build` 실패: `@lovable.dev/vite-tanstack-config` 패키지 없음
  - `package.json`에 `test` 스크립트 없음
  - 현재 폴더는 git 저장소가 아님
- `find-skills` 적용 결과:
  - `npx skills find "project planning code analysis api"` 실행
  - 관련 후보로 `context-master`, `drift-analysis`, `project-planning` 등이 검색됨
  - 현재 작업은 로컬 코드 분석과 구현 계획 작성이므로 추가 스킬 설치는 필요 없음
- 확실한 정보 없음:
  - 내부 STT, 요약, 액션 아이템 추출, 결정사항 추출 API의 실제 URL, 인증 방식, payload, timeout, rate limit
  - 배포 대상 런타임의 WebSocket 지원 방식

## 2. 현재 파일 구조 요약

```text
.
├─ AGENTS.md
├─ bun.lock
├─ package.json
├─ vite.config.ts
├─ tsconfig.json
├─ eslint.config.js
├─ 상세서.md
├─ docs/
│  └─ live-meeting-ai-implementation-plan.md
└─ src/
   ├─ routes/
   │  ├─ __root.tsx
   │  ├─ index.tsx
   │  ├─ session.$sessionId.tsx
   │  └─ session.$sessionId.result.tsx
   ├─ components/
   │  ├─ meeting/
   │  │  ├─ AppShell.tsx
   │  │  ├─ AudioMeter.tsx
   │  │  ├─ ConfirmModal.tsx
   │  │  ├─ SettingsModal.tsx
   │  │  ├─ StatusBadge.tsx
   │  │  └─ TranscriptRow.tsx
   │  └─ ui/
   └─ lib/
      ├─ meeting/
      │  ├─ audio.ts
      │  ├─ export.ts
      │  ├─ mockAdapter.ts
      │  ├─ store.ts
      │  └─ types.ts
      └─ error-*.ts
```

## 3. 이미 구현된 항목

### 3.1 라우트와 화면

- `/`: 세션 설정 화면 존재
- `/session/:sessionId`: 실시간 처리 화면 존재
- `/session/:sessionId/result`: 결과 검토 화면 존재
- 공통 앱 셸, 상단 상태 배지, 설정 버튼 존재

### 3.2 세션 설정 화면

- 브라우저 지원 확인 일부 구현
- 마이크 권한 요청 구현
- 입력 장치 목록 조회 구현
- 음량 meter 구현
- 회의 제목, 언어, 요약 주기, chunk 간격 설정 UI 존재
- 권한 거부, 미지원 브라우저 배너 일부 구현

### 3.3 실시간 처리 화면

- `MockAdapter` 기반 partial/final 자막 시뮬레이션
- 요약, 할 일, 결정사항, 키워드 시뮬레이션
- 자막 필터: 전체, 확정, 낮은 신뢰도
- 하단 녹음 컨트롤, 일시정지, 종료 확인 모달 존재
- `beforeunload` 경고 일부 구현
- 음량 meter, 무음 감지 문구 일부 구현

### 3.4 결과 화면

- 최종 요약, 메타, 전체 자막, 할 일, 결정사항 탭 존재
- 자막 검색 UI 존재
- `.md`, `.txt`, `.json` 브라우저 다운로드 구현
- 결과 없음 상태에서 다운로드 버튼 비활성화 구현

### 3.5 디자인 토큰

- `상세서.md`의 핵심 색상 토큰 대부분 반영
- 기본 radius, focus-visible, reduced-motion 일부 반영

## 4. 누락 또는 미완성 항목

### 4.1 P0 - 실행 환경과 검증 기반

- `node_modules`가 없어 로컬 빌드와 린트가 불가능함
- 잠금 파일은 `bun.lock`만 존재하나, 프로젝트 지침은 의존성 설치 시 `pnpm` 우선임
- `package.json`에 `test` 스크립트가 없음
- Vitest, Testing Library, Playwright, 접근성 검사 도구가 없음
- `README.md` 없음
- 기존 `docs/` 디렉터리가 없었고, API/운영 문서가 없음

### 4.2 P0 - 실제 API 연동

- `/api/health` 구현 없음
- `/api/sessions` 구현 없음
- `/api/sessions/:id` 구현 없음
- `/api/sessions/:id/result` 구현 없음
- `/api/sessions/:id/export` 구현 없음
- `/api/sessions/:id/audio` WebSocket 구현 없음
- 현재 세션 ID는 `local-${Date.now()}`로 프론트에서 임의 생성함
- 현재 API 상태 패널은 항상 정상으로 표시되는 정적 UI임
- React Query는 설치되어 있으나 API 조회/캐싱에 사용되지 않음

### 4.3 P0 - 실제 오디오 스트리밍

- `MediaRecorder` 또는 `AudioWorklet`으로 audio chunk를 생성하지 않음
- 설정된 `chunkIntervalMs`가 실제 전송에 사용되지 않음
- WebSocket으로 오디오 chunk를 전송하지 않음
- `audio.chunk`, `session.pause`, `session.resume`, `session.stop`, `summary.request` 이벤트 송신 없음
- 10초 오디오 전송 큐 없음
- heartbeat 5초 감시 없음
- 1초, 2초, 4초 재연결 로직 없음
- 재연결 후 큐 flush 없음

### 4.4 P1 - 상태 모델과 오류 처리

- `ErrorPayload` 타입 없음
- `SummaryState`, `ExportState`가 명시적 상태로 관리되지 않음
- `AppSessionState`는 타입만 있고 엄격한 상태 전이 검증이 없음
- `BROWSER_UNSUPPORTED`, `MIC_PERMISSION_DENIED`, `MIC_NOT_FOUND`, `WS_CONNECT_FAILED`, `WS_RECONNECT_FAILED`, `AUDIO_BUFFER_OVERFLOW`, `AI_API_TIMEOUT`, `TRANSCRIPT_EMPTY`, `EXPORT_FAILED` 코드 기반 처리가 없음
- 오류 상세 모달 없음
- trace id 표시 없음
- API timeout degraded 상태 없음
- `processing_final` 결과가 서버 응답이 아니라 `setTimeout`으로 처리됨
- 결과 화면의 `endedAt`이 실제 종료 시각으로 store에 저장되지 않음

### 4.5 P1 - 결과와 export 계약

- `POST /api/sessions/:id/export`를 호출하지 않음
- export payload 생성은 전부 브라우저 로컬에서 수행됨
- 다운로드 형식 선택 모달 없음
- export retry 2회 로직 없음
- `ExportState` 표시 없음
- 서버 최종 결과 조회가 없음

### 4.6 P2 - UI/UX 세부 기준

- 설정 모달은 저장 후 실시간 화면에서 실제 stream 재시작, 언어 변경, chunk 변경, 요약 주기 변경을 적용하지 않음
- 내보내기 모달 없음
- 오류 상세 모달 없음
- icon-only 버튼에 `title`은 있으나 상세서 기준 tooltip 컴포넌트 적용은 불완전함
- segmented control의 Arrow Left/Right 키보드 조작 없음
- 탭 컴포넌트는 `role="tablist"`, `role="tab"`, `aria-selected` 구조가 아님
- 모달 focus trap 없음
- 모달 닫힘 후 focus return 없음
- 위험 확인 모달은 backdrop click으로 닫히지는 않지만 focus trap이 없음
- 설정 화면의 제목 입력은 `maxLength={100}`이고, 유효성 기준은 80자라 UI 제약과 검증 기준이 불일치함
- `showLowConfidence` 설정이 실제 필터링/표시에 반영되지 않음

### 4.7 P2 - 반응형/접근성 검증

- 360, 390, 768, 1024, 1366, 1920 viewport 실측 검증 결과 없음
- 자동 접근성 검사 없음
- 키보드만으로 녹음 시작, 일시정지, 종료, 다운로드가 가능한지 검증 없음
- 실시간 partial/final 자막의 screen reader announce 정책이 코드로 분리되어 있지 않음

### 4.8 P3 - 성능과 운영성

- 초기 JS bundle 크기 확인 없음
- LCP, row 추가 렌더 지연, meter 갱신 성능 측정 없음
- session/result 데이터가 새로고침 시 소실됨
- 장기 보관은 MVP 제외지만, 결과 화면 새로고침 대응을 위해 최소 서버 조회가 필요함
- 내부 API 장애와 프론트 상태의 관측 로그/trace 연동 없음

## 5. 연결해야 할 API

내부 AI API의 실제 명세는 확실한 정보 없음. 프론트엔드는 아래 백엔드 어댑터 계약에만 연결해야 한다. 백엔드 어댑터가 내부 API를 감싼다.

### 5.1 환경 변수

| 이름 | 위치 | 목적 |
|---|---|---|
| `VITE_API_BASE_URL` | browser | HTTP API base URL. 없으면 same-origin 사용 |
| `VITE_WS_BASE_URL` | browser | WebSocket base URL. 없으면 현재 origin에서 `ws`/`wss` 변환 |
| `INTERNAL_STT_API_URL` | server | 내부 STT API URL. 실제 값 확실한 정보 없음 |
| `INTERNAL_SUMMARY_API_URL` | server | 내부 요약 API URL. 실제 값 확실한 정보 없음 |
| `INTERNAL_ACTION_API_URL` | server | 내부 액션 아이템 API URL. 실제 값 확실한 정보 없음 |
| `INTERNAL_DECISION_API_URL` | server | 내부 결정사항 API URL. 실제 값 확실한 정보 없음 |
| `INTERNAL_AI_API_KEY` | server | 내부 AI API 인증. 실제 방식 확실한 정보 없음 |

### 5.2 HTTP API

#### GET `/api/health`

목적: 백엔드, STT, 요약, 액션 추출 API 상태 확인.

Response:

```ts
interface HealthResponse {
  status: "ok" | "degraded" | "failed";
  services: {
    backend: ServiceHealth;
    stt: ServiceHealth;
    summary: ServiceHealth;
    action: ServiceHealth;
    decision: ServiceHealth;
  };
  checkedAt: string;
}

interface ServiceHealth {
  status: "ok" | "degraded" | "failed";
  latencyMs?: number;
  message?: string;
}
```

#### POST `/api/sessions`

목적: 서버 세션 생성. 프론트의 `local-*` ID 생성을 제거한다.

Request:

```ts
interface CreateSessionRequest {
  title: string;
  language: "ko-KR" | "en-US" | "ja-JP";
  summaryInterval: 30 | 60 | "manual";
  chunkIntervalMs: number;
  clientCapabilities: {
    mimeTypes: string[];
    sampleRate?: number;
  };
}
```

Response:

```ts
interface CreateSessionResponse {
  session: SessionMeta;
  wsUrl: string;
}
```

#### GET `/api/sessions/:id`

목적: 세션 메타 조회. 새로고침/직접 진입 대응.

Response:

```ts
interface SessionResponse {
  session: SessionMeta;
}
```

#### GET `/api/sessions/:id/result`

목적: 최종 결과 조회.

Response:

```ts
interface SessionResultResponse {
  session: SessionMeta;
  summaries: SummarySnapshot[];
  actionItems: ActionItem[];
  decisions: DecisionItem[];
  segments: TranscriptSegment[];
  emptyReason?: "no_audio" | "silence_only" | "processing_failed";
}
```

#### POST `/api/sessions/:id/export`

목적: export payload 생성. 브라우저 로컬 생성은 fallback으로만 둔다.

Request:

```ts
interface ExportRequest {
  format: "md" | "txt" | "json";
  include: {
    summary: boolean;
    decisions: boolean;
    actionItems: boolean;
    transcript: boolean;
  };
}
```

Response:

```ts
interface ExportResponse {
  filename: string;
  mimeType: string;
  content: string;
}
```

### 5.3 WebSocket API

Path: `/api/sessions/:id/audio`

Client -> Server events:

```ts
type ClientSocketEvent =
  | { type: "audio.chunk"; payload: AudioChunkPayload }
  | { type: "session.pause"; payload: { at: string } }
  | { type: "session.resume"; payload: { at: string } }
  | { type: "session.stop"; payload: { at: string } }
  | { type: "summary.request"; payload: { reason: "manual" } }
  | { type: "heartbeat.ping"; payload: { sentAt: string } };

interface AudioChunkPayload {
  sequence: number;
  mimeType: string;
  durationMs: number;
  data: string; // base64. 성능 최적화 시 binary로 교체 가능
}
```

Server -> Client events:

```ts
type ServerSocketEvent =
  | { type: "status.ready"; payload: { sessionId: string } }
  | { type: "status.latency"; payload: { latencyMs: number } }
  | { type: "transcript.partial"; payload: TranscriptSegment }
  | { type: "transcript.final"; payload: TranscriptSegment }
  | { type: "summary.snapshot"; payload: SummarySnapshot }
  | { type: "action_item.detected"; payload: ActionItem }
  | { type: "decision.detected"; payload: DecisionItem }
  | { type: "session.completed"; payload: { resultId: string } }
  | { type: "heartbeat.pong"; payload: { sentAt: string; receivedAt: string } }
  | { type: "error"; payload: ErrorPayload };
```

추가 타입:

```ts
interface ErrorPayload {
  code: string;
  message: string;
  retryable: boolean;
  traceId?: string;
}
```

## 6. 구현 작업 순서

### P0-1. 의존성 및 스크립트 복구

작업 파일:

- `package.json`
- 새 파일: `pnpm-lock.yaml`

작업:

1. 프로젝트 패키지 매니저를 `pnpm`으로 확정한다.
2. `pnpm install`로 의존성을 설치하고 lockfile을 생성한다.
3. `package.json`에 테스트 스크립트를 추가한다.
   - `test`: `vitest run`
   - `test:watch`: `vitest`
   - `test:e2e`: `playwright test`
4. 필요한 devDependency를 추가한다.
   - `vitest`
   - `jsdom`
   - `@testing-library/react`
   - `@testing-library/user-event`
   - `@testing-library/jest-dom`
   - `@playwright/test`
5. `npm run lint`, `npm run build`, `npm test`가 실행 가능한 상태로 만든다.

완료 기준:

- `node_modules` 설치 완료
- `npm run lint` 통과
- `npm run build` 통과
- `npm test` 통과

### P0-2. API 계약 타입과 클라이언트 계층 추가

작업 파일:

- `src/lib/meeting/types.ts`
- 새 파일: `src/lib/meeting/api/contracts.ts`
- 새 파일: `src/lib/meeting/api/httpClient.ts`
- 새 파일: `src/lib/meeting/api/socketClient.ts`
- 새 파일: `src/lib/meeting/api/audioRecorder.ts`

작업:

1. `ErrorPayload`, `HealthResponse`, `CreateSessionRequest`, `CreateSessionResponse`, `SessionResultResponse`, `ExportRequest`, `ExportResponse` 타입을 추가한다.
2. HTTP client를 작성한다.
   - base URL은 `VITE_API_BASE_URL` 또는 same-origin
   - 모든 실패 응답을 `ErrorPayload` 형태로 normalize
3. WebSocket client를 작성한다.
   - `connect(sessionId, wsUrl)` 제공
   - client/server event를 discriminated union으로 parse
   - 알 수 없는 이벤트는 error로 처리
4. `MockAdapter`와 실제 `socketClient`가 같은 callback interface를 쓰도록 어댑터 인터페이스를 분리한다.
5. `audioRecorder.ts`에 `MediaRecorder` 기반 chunk 생성기를 구현한다.
   - 기본 mimeType: `audio/webm;codecs=opus`
   - fallback mimeType: `audio/webm`, `audio/mp4`
   - timeslice: `chunkIntervalMs`
   - chunk sequence 증가
   - Blob -> base64 변환

완료 기준:

- 실제 API와 mock API를 설정으로 교체할 수 있음
- 타입 불일치가 컴파일 단계에서 차단됨

### P0-3. 백엔드 어댑터 HTTP API 구현

작업 파일:

- `src/server.ts`
- 새 파일: `src/server/meeting/router.ts`
- 새 파일: `src/server/meeting/sessionStore.ts`
- 새 파일: `src/server/meeting/exporter.ts`
- 새 파일: `src/server/meeting/internalAiClient.ts`

작업:

1. `src/server.ts`에서 `/api/` 요청을 TanStack SSR 핸들러보다 먼저 분기한다.
2. `GET /api/health`를 구현한다.
3. `POST /api/sessions`를 구현한다.
   - title 1-80자 검증
   - language 허용 값 검증
   - summaryInterval 허용 값 검증
   - chunkIntervalMs 100-1000 검증
4. `GET /api/sessions/:id`를 구현한다.
5. `GET /api/sessions/:id/result`를 구현한다.
6. `POST /api/sessions/:id/export`를 구현한다.
7. 내부 AI API 명세가 없으므로 `internalAiClient.ts`는 명확히 두 모드로 작성한다.
   - `mock`: 현재 `MockAdapter` seed와 유사한 결과 생성
   - `real`: 환경 변수 없으면 `AI_API_NOT_CONFIGURED` 반환

완료 기준:

- 프론트에서 HTTP API 호출만으로 세션 생성과 결과 조회가 가능함
- 내부 API 미설정 상태가 조용히 성공으로 표시되지 않음

### P0-4. WebSocket 오디오 API 구현

작업 파일:

- `src/server.ts`
- 새 파일: `src/server/meeting/audioSocket.ts`
- `src/lib/meeting/api/socketClient.ts`
- `src/lib/meeting/api/audioRecorder.ts`

작업:

1. `/api/sessions/:id/audio` WebSocket upgrade를 처리한다.
2. `status.ready`를 송신한다.
3. `audio.chunk`를 수신해 내부 STT adapter로 전달한다.
4. 내부 STT adapter 결과를 `transcript.partial`, `transcript.final`로 송신한다.
5. 요약 주기마다 `summary.snapshot`을 송신한다.
6. 액션/결정 감지 결과를 각각 송신한다.
7. `session.pause`, `session.resume`, `session.stop`, `summary.request`를 처리한다.
8. `heartbeat.ping/pong`과 latency 계산을 구현한다.
9. WebSocket 지원이 현재 배포 런타임에서 불가능하면 즉시 차단하지 말고 별도 이슈로 분리한다. 이 경우 런타임 지원 방식은 확실한 정보 없음으로 표시하고 구현을 보류한다.

완료 기준:

- 프론트가 실제 WebSocket을 통해 chunk를 보내고 서버 이벤트로 UI를 갱신함
- mock mode에서도 같은 WebSocket 계약으로 동작함

### P1-1. 세션 설정 화면을 실제 API 기반으로 전환

작업 파일:

- `src/routes/index.tsx`
- `src/lib/meeting/store.ts`
- `src/lib/meeting/api/httpClient.ts`

작업:

1. 진입 시 `GET /api/health`를 호출한다.
2. API 상태 패널을 health 응답 기반으로 표시한다.
3. 시작 버튼 활성 조건에 health 상태를 포함한다.
4. `실시간 회의 시작` 클릭 시 `POST /api/sessions`를 호출한다.
5. 응답받은 `session.id`, `wsUrl`을 store에 저장한다.
6. `local-${Date.now()}` 세션 ID 생성을 제거한다.
7. 제목 입력 `maxLength`를 80으로 맞춘다.
8. 권한 거부 상태에서 설정 안내 모달 또는 안내 링크를 제공한다.

완료 기준:

- 백엔드 세션 생성 실패 시 사용자가 원인을 볼 수 있음
- API가 실패하면 시작 버튼이 정상적으로 비활성화됨

### P1-2. 실시간 화면을 실제 recorder/socket 기반으로 전환

작업 파일:

- `src/routes/session.$sessionId.tsx`
- `src/lib/meeting/store.ts`
- `src/lib/meeting/api/socketClient.ts`
- `src/lib/meeting/api/audioRecorder.ts`

작업:

1. 화면 진입 시 store에 세션이 없으면 `GET /api/sessions/:id`로 복구한다.
2. WebSocket 연결 후 `status.ready`를 기다린다.
3. `MediaRecorder`를 시작하고 `chunkIntervalMs`마다 `audio.chunk`를 보낸다.
4. `transcript.partial`은 같은 segment ID row를 교체한다.
5. `transcript.final`은 partial row를 확정 상태로 교체한다.
6. `summary.snapshot`, `action_item.detected`, `decision.detected`를 store에 반영한다.
7. pause/resume 버튼은 recorder pause/resume과 socket event를 모두 호출한다.
8. stop 버튼은 `session.stop`을 보내고 `session.completed`를 기다린 뒤 결과 화면으로 이동한다.
9. `setTimeout` 기반 최종 처리 이동을 제거한다.
10. `endedAt`을 store와 서버 결과에 반영한다.

완료 기준:

- 실제 마이크 입력에서 서버 이벤트가 UI에 반영됨
- 새로고침 후에도 세션 메타 조회로 복구 가능함

### P1-3. 재연결, 큐, 오류 상태 구현

작업 파일:

- `src/lib/meeting/api/socketClient.ts`
- `src/lib/meeting/store.ts`
- `src/routes/session.$sessionId.tsx`
- `src/components/meeting/StatusBadge.tsx`
- 새 파일: `src/components/meeting/ErrorDetailModal.tsx`

작업:

1. heartbeat 5초 timeout 감지.
2. timeout 시 `reconnecting` 상태로 변경.
3. audio chunk queue를 최대 10초까지 보관.
4. 1초, 2초, 4초 간격으로 최대 3회 재연결.
5. 성공 시 queue를 순차 전송하고 success toast 표시.
6. 실패 시 `failed` 상태로 변경하고 녹음 자동 중지.
7. queue가 10초를 넘으면 오래된 chunk를 drop하고 `AUDIO_BUFFER_OVERFLOW` 경고 표시.
8. `ErrorPayload`를 store에 저장하고 오류 상세 모달에서 `message`, `code`, `traceId`, retry 가능 여부를 표시한다.

완료 기준:

- 네트워크 단절 시 UI 상태, queue, retry, 실패 처리가 상세서와 일치함

### P1-4. 결과 화면을 서버 결과/export 기반으로 전환

작업 파일:

- `src/routes/session.$sessionId.result.tsx`
- `src/lib/meeting/api/httpClient.ts`
- `src/lib/meeting/export.ts`
- 새 파일: `src/components/meeting/ExportModal.tsx`

작업:

1. 결과 화면 진입 시 `GET /api/sessions/:id/result`를 호출한다.
2. store 데이터가 있어도 서버 결과를 authoritative source로 사용한다.
3. 결과 없음은 `emptyReason`과 final transcript 길이로 판단한다.
4. export 버튼 클릭 시 내보내기 모달을 연다.
5. 사용자가 형식과 포함 항목을 선택하게 한다.
6. `POST /api/sessions/:id/export` 호출 후 받은 content로 다운로드한다.
7. 실패 시 2회 retry 후 `EXPORT_FAILED` toast와 상세 오류를 표시한다.
8. 서버 export가 실패하고 retry 불가능하면 브라우저 로컬 export fallback 사용 여부를 명확히 결정한다.

완료 기준:

- 결과 화면 직접 URL 진입이 동작함
- export 실패가 성공으로 오인되지 않음

### P2-1. 설정 모달 실제 적용

작업 파일:

- `src/components/meeting/SettingsModal.tsx`
- `src/routes/session.$sessionId.tsx`
- `src/lib/meeting/api/audioRecorder.ts`
- `src/lib/meeting/api/socketClient.ts`

작업:

1. 입력 장치 변경 시 stream과 recorder를 재시작한다.
2. 언어 변경 시 다음 chunk부터 metadata에 반영하거나 서버에 settings event를 송신한다.
3. 요약 주기 변경 시 다음 summary cycle부터 적용한다.
4. chunk 간격 변경 시 recorder timeslice를 재시작한다.
5. 저신뢰도 표시 toggle을 실제 자막 표시와 필터에 반영한다.
6. 설정 저장 실패 시 이전 설정으로 rollback한다.

완료 기준:

- 설정 변경이 toast만 띄우고 끝나지 않음

### P2-2. 접근성 보강

작업 파일:

- `src/components/meeting/SettingsModal.tsx`
- `src/components/meeting/ConfirmModal.tsx`
- `src/components/meeting/AppShell.tsx`
- `src/routes/index.tsx`
- `src/routes/session.$sessionId.tsx`
- `src/routes/session.$sessionId.result.tsx`

작업:

1. Radix Dialog 또는 기존 UI dialog 기반으로 모달 focus trap을 적용한다.
2. 모달 닫힘 후 opener focus return을 구현한다.
3. icon-only 버튼은 tooltip과 `aria-label`을 모두 갖게 한다.
4. segmented control에 Arrow Left/Right, Space, Enter 조작을 추가한다.
5. 탭 구조에 `role="tablist"`, `role="tab"`, `aria-selected`, `aria-controls`를 적용한다.
6. final transcript만 screen reader에 polite로 알리도록 live region을 분리한다.
7. 오류 배너와 toast의 `role` 기준을 점검한다.

완료 기준:

- 키보드만으로 주요 흐름 완료 가능
- 모달 focus가 밖으로 새지 않음

### P2-3. 반응형 및 UI 세부 누락 보완

작업 파일:

- `src/styles.css`
- `src/routes/index.tsx`
- `src/routes/session.$sessionId.tsx`
- `src/routes/session.$sessionId.result.tsx`

작업:

1. 360, 390, 768, 1024, 1366, 1920 viewport에서 레이아웃을 검증한다.
2. 실시간 화면 mobile 컨트롤 바 높이와 리스트 하단 여백을 상세서 기준에 맞춘다.
3. 결과 화면 mobile 다운로드 UX를 sticky bottom 또는 명확한 하단 액션으로 조정한다.
4. 긴 회의 제목, 긴 speaker label, 긴 자막, 긴 action item 텍스트 overflow를 검증한다.
5. 카드 안 카드 중첩 여부를 점검한다.
6. status banner 최소 높이와 toast 위치를 상세서 기준으로 맞춘다.

완료 기준:

- 지정 viewport에서 가로 스크롤 없음
- 텍스트가 버튼/패널 밖으로 넘치지 않음

### P3-1. 테스트 추가

작업 파일:

- 새 파일: `src/lib/meeting/export.test.ts`
- 새 파일: `src/lib/meeting/api/contracts.test.ts`
- 새 파일: `src/lib/meeting/store.test.ts`
- 새 파일: `src/routes/*.test.tsx` 또는 컴포넌트 단위 테스트
- 새 파일: `tests/e2e/live-meeting.spec.ts`

작업:

1. export format 테스트를 추가한다.
2. segment upsert가 partial -> final 교체를 보장하는지 테스트한다.
3. title/language/chunkInterval validation 테스트를 추가한다.
4. socket event parse 테스트를 추가한다.
5. 권한 거부, 연결 실패, 결과 없음 UI 테스트를 추가한다.
6. Playwright로 최소 흐름을 테스트한다.
   - `/` 진입
   - mock mode에서 세션 생성
   - 실시간 화면 이동
   - 자막 수신
   - 종료
   - 결과 화면
   - 다운로드 버튼 상태 확인
7. 접근성 smoke test를 추가한다.

완료 기준:

- `npm test` 통과
- `npm run build` 통과
- `npm run lint` 통과

### P3-2. 문서화

작업 파일:

- 새 파일: `README.md`
- 새 파일: `docs/api-adapter-contract.md`
- 새 파일: `docs/local-development.md`
- 새 파일: `docs/testing.md`

작업:

1. 로컬 실행 방법을 문서화한다.
2. 환경 변수를 문서화한다.
3. HTTP/WebSocket 계약을 문서화한다.
4. mock mode와 real mode 차이를 문서화한다.
5. 내부 API 확정 시 교체해야 할 파일을 문서화한다.
6. `상세서.md`의 `10. API 어댑터 계약`과 문서 내용이 충돌하지 않게 유지한다.

완료 기준:

- 새 개발자가 문서만 보고 설치, 실행, 테스트, API 연결 위치를 찾을 수 있음

## 7. 권장 구현 순서 요약

1. 의존성 설치와 `test` 스크립트 복구
2. API 계약 타입과 HTTP/WebSocket client 작성
3. 백엔드 HTTP API adapter 작성
4. WebSocket audio adapter 작성
5. 세션 설정 화면을 API 기반으로 전환
6. 실시간 화면을 recorder/socket 기반으로 전환
7. 재연결, queue, 오류 상세 처리 구현
8. 결과 화면과 export를 서버 API 기반으로 전환
9. 설정 모달 실제 적용
10. 접근성, 반응형, UI 세부 기준 보완
11. 테스트 추가
12. README와 API 문서 작성

## 8. 작업 시작 전 확인 필요 항목

- 내부 AI API 실제 명세:
  - 인증 방식
  - STT streaming 방식
  - audio mimeType 허용 목록
  - partial/final transcript payload
  - summary/action/decision payload
  - timeout/retry 정책
- 배포 런타임:
  - WebSocket upgrade 지원 여부
  - 장시간 연결 제한
  - 서버 메모리 세션 저장 가능 여부
- 패키지 매니저:
  - 기존 `bun.lock` 유지 여부
  - `pnpm-lock.yaml`로 전환할지 여부

