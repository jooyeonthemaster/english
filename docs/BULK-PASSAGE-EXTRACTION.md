# 시험지 일괄 등록 (Bulk Passage Extraction)

2026-04 신규 구현, 2026-04-17 v2 리디자인 반영.

PDF 또는 이미지 여러 장을 업로드하면 페이지별로 Gemini 3 Flash를 호출해
블록(지문·문제·선지·해설·메타) 단위로 추출하고, 사용자가 검수한 뒤
선택한 **모드(M1~M4)** 에 맞춰 Passage / Question / Exam / PassageBundle 등
도메인 엔티티로 일괄 승급(commit)하는 기능.

---

## 0. 이번 v2에서 바뀐 것 (2026-04-17)

| 영역 | Before | After |
|------|--------|-------|
| 모드 | 암묵적 "지문만" 1종 | **M1/M2/M3/M4 4종 모드** (M3 disabled, 나머지 3종 활성) |
| 블록 구조 | `ExtractionResult` (지문 드래프트 1 row = 지문 1개) | `ExtractionItem` (블록 단위 n row) + 기존 `ExtractionResult` (legacy fallback) |
| 원본 메타 | 없음 (commit 시 파일명으로만 식별) | **`SourceMaterial`** — 시험지 원본 1부의 메타(시행년·회차·과목·학년·출제기관)를 별도 테이블로 분리 |
| 묶음 지문 | 미지원 | **`PassageBundle`** — `[32~34]` 같은 묶음 문제의 지문·문제·회차 집합을 저장 |
| Commit API | 단일 payload | **dual-shape**: legacy v1 (`commitJobRequestSchema`) + mode-aware v2 (`commitJobRequestSchemaV2`) |
| 리뷰 UI | 단일 탭(지문 리스트) | **3분할 블록 뷰** (BlockTreePanel + OriginalViewer + StructuredEditor), 모드별 탭 구조 |
| 재배포 | 수동 `trigger.dev deploy` | `npm run trigger:deploy` 편의 스크립트, 최신 배포 버전 `20260417.3` |
| 이음새 | Passage 라이브러리로만 복귀 | commit 응답에 `?passageIds=`, `?sourceMaterialId=` 쿼리로 다음 화면으로 핸드오프 |

---

## 0.1 3차 정리 변경점 (2026-04-18)

최종 검증 에이전트가 발견한 운영 이슈를 해소한 회차.

| 영역 | 변경 |
|------|------|
| `SourceMaterial.schoolName` | 학교별 내신용 `schoolName?` 컬럼 신규 (학년·출제기관과 구분). commit 응답 핸드오프에서 `?schoolName=`으로 필터링 가능. |
| 지문→시험/반 다이얼로그 재사용 | `passage-add-to-exam-dialog.tsx`, `passage-assign-to-class-dialog.tsx`를 `/passages` 리스트와 `/passages/[passageId]` 상세에서 공용화. import 완료 후 DoneStep에서도 재사용 가능한 구조. |
| Migration 파일화 | `add_extraction_pipeline_v2` 마이그레이션은 로컬 `prisma migrate dev`로 **기동 시점 파일 생성 필수**. 현재 repo에는 아직 커밋되지 않았으며, 배포 전에 `npm run db:migrate -- --name add_extraction_pipeline_v2` 실행 → 파일 커밋 필요. |
| Trigger.dev prod 재배포 | 2차 fix에서 `extraction-page.ts`, `extraction-finalize.ts`, `extraction-orchestrator.ts` 모두 수정됨. prod 워커 재배포 필요 (`mcp__trigger__deploy projectRef=proj_xlyxputqkbksyzuyraxl environment=prod`). |
| 임시 파일 정리 | bash 이스케이프 이슈로 생성된 `c:tmptsc-*.txt` 파일 2개 프로젝트 루트에서 제거. 향후 OS 임시 경로는 `/tmp/` (POSIX) 또는 `$TEMP` 환경변수로 사용하고, Windows 절대경로는 bash 리다이렉트에 넣지 말 것. |

### 배포 절차 (최종 권장 순서)

1. **DB migration**: 로컬에서 `npm run db:migrate -- --name add_extraction_pipeline_v2` 실행 → `prisma/migrations/<timestamp>_add_extraction_pipeline_v2/migration.sql` 생성 → 커밋.
2. **Prod DB 적용**: 배포 파이프라인(또는 수동)에서 `prisma migrate deploy`.
3. **Supabase 버킷**: `extraction-sources` 프라이빗 버킷 존재 확인, 없으면 `ensureExtractionBucket()` 1회 호출.
4. **Trigger.dev 재배포**: `npm run trigger:deploy` (또는 MCP `mcp__trigger__deploy` with `environment=prod`).
5. **Vercel/Next 빌드**: `next build` (TS 에러가 남아있으면 차단되므로 commit 전 `npx tsc --noEmit`로 사전 확인).
6. **스모크 테스트**: DIRECTOR 계정으로 M1/M2/M4 각 1회씩 import 완주.

---

## 1. 모드 시스템 (M1 ~ M4)

`src/lib/extraction/modes.ts`가 **단일 진실의 원천(SSOT)**.
UI 카드, OCR 프롬프트 변형, 세그멘테이션 대상, 리뷰 탭 구조, commit 라우팅이
전부 이 파일의 `MODES` 레코드를 읽는다.

### 1.1 각 모드 요약

| ID | 레이블 | 짧은 레이블 | 설명 | 생성 엔티티 | 상태 |
|----|--------|------------|------|------------|------|
| `PASSAGE_ONLY` | 지문만 | M1 | 본문만 뽑아 지문 라이브러리에 적재 | `Passage`, `PassageCollection`, (`SourceMaterial`) | 활성 |
| `QUESTION_SET` | 문제 세트 | M2 | 지문·문제·선지(+정답+해설)를 문제 은행에 등록 | M1의 엔티티 + `Question`, `QuestionExplanation` | 활성 |
| `EXPLANATION` | 해설 자료 | M3 | 해설지 디지털화 후 기존 문제에 매칭 | `QuestionExplanation` | **disabled — v2 준비 중** |
| `FULL_EXAM` | 시험지 통째 | M4 | 시험지 한 부를 통째로 + 자동 태깅 | M2의 엔티티 + `PassageBundle`, `Exam`, `ExamCollection` | 활성 |

### 1.2 모드 선택 UI 플로우

1. `/director/workbench/passages/import`에 진입하면 첫 화면이 **ModeSelectStep**.
2. 카드 4개(M1/M2/M4/M3 순, M3은 disabled badge).
3. "다음에도 이 모드로 시작" 체크박스 → `localStorage.nara-extraction-skip-mode-select = true`.
4. 다음 방문부터는 모드 카드를 건너뛰고 바로 업로드 스텝으로 진입 (`bulk-extract-client.tsx` 부팅 로직 참조).
5. 헤더 스테퍼가 활성 모드에 따라 **5단계 ↔ 4단계**로 자동 리사이즈.

---

## 2. 신규 엔티티 (Prisma 모델)

`prisma/schema.prisma` 기준.

### 2.1 `ExtractionItem` (라인 1874~)

블록 하나가 한 row. `ExtractionResult`(legacy)와 공존한다.

```
id               String   @id
jobId            String   → ExtractionJob.id
pageIndex        Int      // 0-based, OCR 원본 페이지
sourcePageIndex  Int?     // 실제 시험지 페이지 번호 (헤더에서 추출)
blockType        String   // PASSAGE_BODY | QUESTION_STEM | CHOICE | EXPLANATION | EXAM_META
content          String   // OCR 원문
structuredData   Json?    // 선지/정답/번호 등 블록별 구조화 데이터
status           String   // DRAFT | SAVED | SKIPPED
promotedTo       String?  // URN 문자열, e.g. "passage:abc", "question:xyz"
confidence       Float?
idempotencyKey   String   @unique  // 재커밋 안전성
```

### 2.2 `SourceMaterial` (라인 1938~)

시험지 **원본 1부**의 메타데이터. commit 시 `(academyId, contentHash)`로
dedupe 되므로 같은 시험지를 두 번 올려도 한 row만 생성.

```
id                String   @id
academyId         String
originalFileName  String?
originalFileUrl   String?
contentHash       String   // 지문/문제 텍스트의 SHA-256, dedupe 키
examYear          Int?     // 2024, 2025, ...
examRound         String?  // "6월", "9월", "수능", "1학기 중간" ...
subject           String?  // "영어", "국어", ...
grade             String?  // "고3", "중3", ...
publisher         String?  // EBS, 수능특강, 교육청, ...
schoolName        String?  // 학교별 내신의 경우
metaSource        String   // "AI_EXTRACTED" | "USER_EDITED" | "MANUAL"
```

### 2.3 `PassageBundle` (라인 1991~)

수능형 "32-34" 묶음 문제처럼 **지문 1 + 문제 N** 구조를 보존하기 위한 교차 엔티티.
M4 commit 경로에서만 생성된다.

```
id               String   @id
sourceMaterialId String   → SourceMaterial.id
passageId        String   → Passage.id
questionOrder    String   // "[32~34]" 같은 표기 그대로
firstQuestionNo  Int
lastQuestionNo   Int
```

---

## 3. 엔드투엔드 데이터 흐름

```
[Browser]                [Next.js API]          [Supabase Storage]   [Trigger.dev]      [Gemini 3 Flash]
   │                          │                       │                   │                   │
   │ (mode-select → localStorage)                     │                   │                   │
   │ pdfjs-dist 분할(30장)    │                       │                   │                   │
   │                          │                       │                   │                   │
   │ POST /jobs {mode} ──────▶│ 프리플라이트 체크     │                   │                   │
   │                          │ (balance ≥ pages × 3) │                   │                   │
   │                          │ ExtractionJob{mode}   │                   │                   │
   │                          │ + Page rows 생성      │                   │                   │
   │                          │ 서명 업로드 URL ──────▶                  │                   │
   │◀─────────────────────────┤                       │                   │                   │
   │ PUT × N (concurrency 4) ────────────────────────▶│                   │                   │
   │                                                                       │                   │
   │ POST /jobs/:id/start ───▶│ orchestrator trigger ──────────────────▶│                   │
   │                          │                       │                   │ batchTrigger(N)   │
   │                          │                       │                   │                   │
   │ SSE /stream ◀────────────┤ DB poll 2s            │                   │ ┌ conc=5 ┐        │
   │ page-update / item-new   │                       │  download ◀───────┤ │ OCR + mode      │
   │ job-update / done        │                       │                   │ │ prompt addon    │
   │                          │                       │                   │ │ ExtractionItems │
   │                          │                       │                   │ └─────────────────┘
   │                          │                       │                   │                   │
   │                          │                       │                   │ finalize:         │
   │                          │                       │                   │ - segmentation    │
   │                          │                       │                   │ - meta-parser     │
   │                          │                       │                   │ - SourceMaterial  │
   │ GET /jobs/:id → review   │                       │  signed URL       │                   │
   │                          │                       │                   │                   │
   │ POST /jobs/:id/commit ──▶│ commitJobRequestV2{mode} 라우팅           │                   │
   │                          │   M1: Passage + Collection                                    │
   │                          │   M2: + Question + Explanation                                │
   │                          │   M4: + PassageBundle + Exam + ExamCollection                 │
   │◀─── {passageIds, sourceMaterialId, examId, bundleIds} ──────────────│                   │
   │                                                                                           │
   │ → redirect: /passages?sourceMaterialId=... or /exams/:examId                              │
```

---

## 4. 최초 설정 (1회만)

### 4.1 환경변수

`.env.example`을 그대로 복사해 `.env` 또는 `.env.local`로 채워 넣는다.
필수 키 요약:

```env
# Core
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."
NEXTAUTH_SECRET="..."
NEXTAUTH_URL="..."
GOOGLE_GENERATIVE_AI_API_KEY="..."

# Bulk extraction — Supabase Storage (server-only, no NEXT_PUBLIC_ needed)
SUPABASE_URL="https://xxxxx.supabase.co"
SUPABASE_ANON_KEY="eyJhbG..."             # reserved for future browser flows
SUPABASE_SERVICE_ROLE_KEY="eyJhbG..."     # SECRET, admin on extraction-sources

# Bulk extraction — Trigger.dev
TRIGGER_SECRET_KEY="tr_dev_..."           # or tr_prod_... in prod
```

`trigger.config.ts`의 `project`는 `proj_xlyxputqkbksyzuyraxl`로 하드코딩돼
별도 환경변수가 필요 없다.

### 4.2 데이터베이스 마이그레이션

`ExtractionJob/Page/Result` + `ExtractionItem` + `SourceMaterial` +
`PassageBundle` 테이블을 모두 추가한다.

```bash
npm run db:migrate -- --name add_extraction_pipeline_v2
```

스크립트는 내부적으로 `prisma migrate dev` → Client 재생성까지 수행한다.
프로덕션 배포 시에는 `prisma migrate deploy`.

### 4.3 Supabase Storage 버킷

```
Name: extraction-sources
Public: off (private)
File size limit: 50 MB
Allowed MIME: application/pdf, image/jpeg, image/png, image/webp
```

자동 프로비저닝: `@/lib/supabase-storage`의 `ensureExtractionBucket()` 호출.

### 4.4 Trigger.dev 태스크 배포

로컬 개발:

```bash
npx trigger.dev@latest login
npm run trigger:dev     # 로컬 워커 + 핫 리로드
```

프로덕션 배포:

```bash
npm run trigger:deploy
```

최신 배포 버전: **`20260417.3`** (M1/M2/M4 모드 프롬프트 + SourceMaterial
finalize 로직 반영).

---

## 5. 파일 구조

```
prisma/schema.prisma
  - ExtractionJob / Page / Result        (v1)
  - ExtractionItem                        (v2 블록 단위)
  - SourceMaterial                        (v2 원본 메타)
  - PassageBundle                         (v2 묶음 지문)

trigger.config.ts                         # Trigger.dev v3 설정

src/lib/extraction/
├── constants.ts                # 페이지 수/크기 한도, 동시성, TTL
├── types.ts                    # 상태·에러 코드 + SSE 이벤트 타입
├── zod-schemas.ts              # v1/v2 request/response 스키마
├── modes.ts                    # ★ 4 모드 SSOT (카드/프롬프트/탭)
├── block-types.ts              # BlockType 상수/라벨/단축키
├── meta-parser.ts              # 시험지 헤더 → SourceMaterial meta
├── ocr-prompt.ts               # verbatim + mode prompt addon
├── error-classifier.ts         # Gemini 에러 → 코드/재시도 정책
├── segmentation.ts             # block → draft 변환, 모드별 relevant 필터
├── pdf-splitter.ts             # pdfjs-dist 래퍼
├── store.ts                    # Zustand 상태 스토어
└── api-utils.ts                # 세션/권한 헬퍼

src/lib/supabase-storage.ts     # 서비스롤 클라이언트, 서명 URL

src/hooks/
├── use-extraction-upload.ts    # 생성 → PUT 업로드 → start
└── use-extraction-stream.ts    # SSE 구독 + 자동 재연결

src/trigger/
├── extraction-page.ts          # 페이지 1장 = Gemini 1회
├── extraction-orchestrator.ts  # 전체 페이지 batchTrigger
├── extraction-finalize.ts      # 상태 집계 + 세그멘테이션 + SourceMaterial
├── extraction-reaper.ts        # 5분 cron — stuck lease 복구
└── extraction-daily-cleanup.ts # 일일 cron — Storage TTL

src/app/api/extraction/jobs/
├── route.ts                                # POST (생성, mode 필수), GET
└── [jobId]/
    ├── route.ts                            # GET (상세), DELETE
    ├── start/route.ts                      # POST
    ├── stream/route.ts                     # GET (SSE)
    ├── cancel/route.ts                     # POST
    ├── commit/route.ts                     # POST (v1 + v2 dual-shape)
    └── pages/[pageIndex]/retry/route.ts    # POST

src/app/(director)/director/workbench/passages/import/
├── page.tsx                                # 서버 컴포넌트
├── loading.tsx
└── _components/
    ├── bulk-extract-client.tsx             # phase 라우터 (mode-select 부팅)
    ├── mode-select-step.tsx                # ★ Step 1 (신규) — M1~M4 카드
    ├── upload-step.tsx                     # Step 2
    ├── processing-step.tsx                 # Step 3
    ├── review-step.tsx                     # Step 4 (3분할 블록 뷰)
    └── done-step.tsx                       # Step 5
```

---

## 6. Commit API — v1 vs v2

### 6.1 v1 (legacy passthrough)

```
POST /api/extraction/jobs/:id/commit
Content-Type: application/json

{
  "collectionName": "...",
  "results": [ { "passageOrder", "title", "content", "sourcePageIndex" } ]
}
```

- 스키마: `commitJobRequestSchema`
- DRAFT `ExtractionResult`를 `Passage` + `PassageCollection`로 승급.
- 기존 고객 통합(예: legacy 업로더)이 깨지지 않도록 유지.

### 6.2 v2 (mode-aware)

```
POST /api/extraction/jobs/:id/commit
Content-Type: application/json

{
  "mode": "PASSAGE_ONLY" | "QUESTION_SET" | "FULL_EXAM",
  "sourceMaterial": { examYear?, examRound?, subject?, ... },
  "passages": [ ... ],              // M1/M2/M4 공통
  "questions": [ ... ],             // M2/M4
  "bundles":   [ ... ],             // M4
  "exam":      { ... }              // M4
}
```

- 스키마: `commitJobRequestSchemaV2`, 구별 discriminant는 `mode`.
- 전체 승급이 **단일 Prisma 트랜잭션** (timeout 상향) 내에서 실행 → 부분 쓰기 없음.
- 응답:
  ```
  {
    "createdPassageIds": [...],
    "createdQuestionIds": [...],
    "createdBundleIds": [...],
    "createdExamId": null | "...",
    "sourceMaterialId": "...",
    "collectionId": "..."
  }
  ```
- **재-commit 안전**: `ExtractionItem.promotedTo`가 채워진 row는 기존 Passage/Question을 재사용하고, stale PassageBundle은 먼저 삭제 후 재생성.
- **SourceMaterial dedupe**: `(academyId, contentHash)` 유니크 인덱스로 중복 업로드 시 기존 row 재사용.

### 6.3 응답 → 다음 화면 핸드오프

commit 성공 후 DoneStep은 모드별로 다른 "이음새(handoff) 링크"를 제공한다.

| 모드 | 이동 대상 | URL |
|------|----------|-----|
| M1 | 지문 라이브러리, 이번 업로드 필터 | `/director/workbench/passages?passageIds=<콤마>` |
| M1 | 원본 시험지 상세 | `/director/workbench/materials?sourceMaterialId=<id>` |
| M2 | 문제 은행 | `/director/workbench/questions?questionIds=<콤마>` |
| M4 | Exam 편집기 | `/director/workbench/exams/<createdExamId>` |

---

## 7. 3중 멱등성 방어선 (변경 없음)

| 계층 | 메커니즘 | 방어 대상 |
|------|---------|----------|
| 1. Trigger.dev | `idempotencyKey: ${jobId}:${pageIndex}` | 동일 key 이중 디스패치 |
| 2. DB 조건부 UPDATE | `ExtractionPage.idempotencyKey UNIQUE` + `leaseExpiresAt` 기반 조건부 PROCESSING | 동시 워커 2개가 같은 페이지 claim |
| 3. 크레딧 중복 방지 | `ExtractionPage.creditTxId` NOT NULL 체크 | 재시도 시 2중 차감 |

Reaper(5분 cron)가 만료된 lease를 PENDING으로 되돌려 재디스패치하지만,
창구 2와 3 덕분에 Gemini 호출 자체는 여전히 1회만 발생.

---

## 8. 크레딧 과금 (변경 없음)

- 단가: `CREDIT_COSTS.TEXT_EXTRACTION = 3`
- 시점: **페이지 시작 시점에 차감**, 실패 시 환불
- 잡 생성 시 `balance >= totalPages × 3` 프리체크만 수행
- 재시도 시 `creditTxId`가 있으면 skip → **페이지당 최대 1회 과금**

---

## 9. 제약값 (src/lib/extraction/constants.ts)

| 상수 | 값 | 의미 |
|------|----|----|
| `MAX_PAGES_PER_JOB` | 30 | 한 작업당 페이지 상한 |
| `MAX_PDF_BYTES` | 50 MB | 업로드 PDF 크기 상한 |
| `MAX_INPUT_IMAGE_BYTES` | 5 MB | 페이지 이미지 상한 (업로드 전 클라에서 리사이즈) |
| `GEMINI_CONCURRENCY_LIMIT` | 5 | 전역 동시 Gemini 호출 수 |
| `PAGE_LEASE_DURATION_MS` | 5 min | Stuck worker 복구 타이머 |
| `MAX_PAGE_ATTEMPTS` | 3 | 페이지당 재시도 횟수 |
| `PDF_RENDER_SCALE` | 2.0 | pdfjs 렌더 스케일 (~200 DPI) |
| `SSE_MAX_SESSION_MS` | 4 min | Vercel 스트리밍 한도 고려 |
| `ORIGINAL_PDF_RETENTION_DAYS` | 7 | 원본 PDF 보관 |
| `PAGE_IMAGE_RETENTION_DAYS` | 30 | 페이지 이미지 보관 |
| `EXTRACTED_TEXT_RETENTION_DAYS` | 90 | 추출 텍스트 보관 |
| `MIN_COMMIT_PASSAGE_LENGTH` | (파일 참조) | commit 시 너무 짧은 지문 폐기 기준 |

---

## 10. 수동 테스트 가이드

### 10.1 기본 사이트 플로우 (M2 예시)

1. `/login` → DIRECTOR 계정 로그인.
2. 좌측 사이드바 → "지문 관리" → **"시험지 일괄 등록 (NEW)"** 클릭.
3. URL: `/director/workbench/passages/import`.
4. Step 1: **모드 선택** → "문제 세트 (M2)" 카드 클릭.
5. Step 2: 수능 모의고사 PDF(5~10페이지) 드래그 앤 드롭.
   - 분할 진행률 상승 → 페이지 썸네일 그리드 표시.
6. "추출 시작" 버튼 → Step 3.
7. 페이지 카드 상태 `대기 → 처리 중 → 성공` 실시간 전환 확인.
8. Step 4 (**리뷰**) 진입 시 3분할:
   - 좌: BlockTreePanel (페이지별 블록 트리)
   - 중: OriginalViewer (원본 이미지/PDF)
   - 우: StructuredEditor (선택 블록 편집)
9. 블록 타입 변경, 병합/분할, SKIP/UNSKIP을 수행.
10. SourceMaterial 메타 (년도/회차/과목) 확인 → 필요시 편집.
11. "저장" → Step 5.
12. DoneStep 링크로 문제 은행 이동 → 실제 Question 생성 확인.

### 10.2 실패 시나리오

| 시나리오 | 기대 동작 |
|----------|----------|
| 31페이지 PDF | 분할 단계 "최대 30페이지" 에러, 제출 비활성화 |
| 51MB PDF | `FILE_TOO_LARGE` 에러 |
| 크레딧 잔액 < 필요량 | 402 응답 + 결제 유도 UI |
| 처리 중 Gemini 429 | 자동 backoff 재시도, `시도 2/3` 표시 |
| 3회 재시도 후 DEAD | 카드에 "다시 시도" 버튼 → 같은 크레딧 재사용 |
| commit 시 Zod 실패 | toast에 첫 이슈(`label` + `description`), 해당 블록 자동 포커스 |
| 같은 시험지 재업로드 | SourceMaterial은 dedupe, `ExtractionItem.promotedTo`로 Passage도 재사용 |
| M4 → M2 재commit | stale PassageBundle 먼저 제거 후 M2로 재승급 |
| 브라우저 탭 닫았다 재접속 | 작업 목록에서 Job 클릭 → 현재 상태 hydrate |
| SSE 4분 초과 | 자동 재연결, 이벤트 손실 없음 |

### 10.3 DB 레벨 검증

처리 완료 후 아래 쿼리로 멱등성 실측:

```sql
-- 페이지당 정확히 1회 차감되었는지
SELECT
  p."jobId",
  COUNT(*) AS page_count,
  COUNT(DISTINCT p."creditTxId") AS credit_tx_count,
  SUM(CASE WHEN p.status = 'SUCCESS' THEN 1 ELSE 0 END) AS successes
FROM extraction_pages p
WHERE p."jobId" = '<<jobId>>'
GROUP BY p."jobId";

-- Job 카운터가 실제와 일치하는지
SELECT j.id, j."totalPages", j."successPages", j."failedPages", j."pendingPages", j.mode
FROM extraction_jobs j
WHERE j.id = '<<jobId>>';

-- SourceMaterial dedupe 확인 (같은 contentHash는 1 row)
SELECT "academyId", "contentHash", COUNT(*) FROM source_materials
GROUP BY "academyId", "contentHash" HAVING COUNT(*) > 1;
```

---

## 11. 알려진 제한 / 향후 과제

- **M3 (해설 자료) 비활성**: 기존 Question 매칭 알고리즘(문항번호·정답키 조합)이 v2에서는 아직 미구현. UI 카드는 노출되지만 선택 불가.
- **세그멘테이션**: 현재 regex + 블록타입 기반. 복잡한 국어·영어 지문에서 60~80% 정확도, HITL 교정 전제.
- **주석(PassageNote) 자동 생성 안 함**: 저장된 Passage에 주석을 붙이려면 기존 `/passages/[passageId]` 편집 페이지로 이동. 추후 통합 고려.
- **Mobile / tablet 레이아웃**: Step 4의 3분할은 1280px 이상 최적. 태블릿 세로 화면은 향후 개선.
- **한자·수식**: 프롬프트에 보존 규칙을 명시했으나, 복잡한 LaTeX 수식은 전용 수학 OCR을 별도로 붙이는 것이 정확.
- **NEXT_PUBLIC_SUPABASE_URL 의존 금지**: 업로드 URL은 모두 서버에서 서명해 배포한다. 브라우저에서 Supabase 클라이언트를 직접 만들지 않는 것이 보안 원칙.

---

## 12. 빌드 품질 게이트 (Next 16)

- **TypeScript**: `next build`가 자동 실행. `typescript.ignoreBuildErrors`를 건드리지 않으므로 TS 에러는 배포를 막는다. 본 파이프라인 신규 코드는 항상 TS 0 에러로 유지한다.
- **ESLint**: Next 16부터 `next build`가 더 이상 ESLint를 내장 실행하지 않는다. `npm run lint`를 CI / pre-commit hook에서 별도 실행해 품질을 강제한다. 기존 레거시 코드의 `@ts-nocheck`/`any` 이슈는 본 파이프라인 범위 밖이며 담당자 트랙에서 별도 관리.
- **범위별 린트 실행 예시**:
  ```bash
  npx eslint \
    "src/lib/extraction" \
    "src/trigger" \
    "src/app/api/extraction" \
    "src/app/(director)/director/workbench/passages/import" \
    "src/hooks/use-extraction-upload.ts" \
    "src/hooks/use-extraction-stream.ts" \
    "src/lib/supabase-storage.ts"
  ```
