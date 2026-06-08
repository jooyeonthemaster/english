Critical finding: the **text route always calls `restoreM1Passage` unconditionally** (line 93) — it does NOT go through the `shouldRestore` gate at all. This is a synchronous, inline restoration that runs for EVERY text input. The DB-backend input's claim that "text path also needs outputMode" is correct, but the mechanism is entirely different from the file path — there's no `persist.ts`/`stage1.ts` gate here; restoration is hardcoded. This is a load-bearing correction I must surface in the spec.

I now have every fact verified directly from source. I have enough to write the definitive spec without further reads. Here is the consolidated, implementation-ready P7 spec.

---

# P7 "원문 vs AI복원" — 검증된 구현 스펙 (nara)

> 작성 전 6개 입력 파일 + 추가 4개 파일을 **직접 재확인**했다. 세 입력(UX/DB·백엔드/이해비평) 사이의 불일치와 누락을 코드로 검증해 아래에 반영했다. 추측 0. 줄번호는 실제 확인 위치.

> **검증 중 발견한 새 사실 3건 (세 입력 모두 놓침 — 스펙에 반영됨):**
> 1. **zod 커밋 스키마에 `extractionOutput: z.enum(["verbatim","restored"]).optional()` 이미 존재** (`zod-schemas.ts:206-207`). 즉 Passage 저장 시점 출력모드 필드는 신규 아님 — 커밋 경로는 이미 P7-ready.
> 2. **텍스트 경로(`/api/extraction/text`)는 `shouldRestore` 게이트를 안 탄다.** `route.ts:93`에서 `restoreM1Passage`를 **무조건 동기 호출**한다. persist.ts/stage1.ts 게이트와 **완전히 다른 코드 경로**다. UX/DB 입력은 "텍스트도 outputMode 추가"라 했지만 메커니즘이 다름 — 이 경로는 게이트 우회가 아니라 **호출 자체를 조건부로** 바꿔야 한다(§4-C).
> 3. **`deductCredits`의 CreditTransaction에는 `referenceId`가 안 찍힌다**(`credits.ts:104-114`). 멱등 사전스캔은 `metadata contains "idempotencyKey"` 문자열 매칭으로만 가능(`charge-credits.ts:48` 패턴). 따라서 환불 멱등(`refundCredits`가 `referenceId`로 dedup, `credits.ts:149-150`)과 차감 멱등은 **서로 다른 키 메커니즘**이다 — §5에서 분리 설계.

---

## 0. 결론 요약 (채택 결정)

| 결정 항목 | 채택 | 핵심 근거 (검증된 코드) |
|---|---|---|
| **outputMode 저장 위치** | `ExtractionJob.outputMode String?` additive 컬럼 ("기본 의도" 신호용). **진실의 소스는 Passage·Draft별** (`extractionOutput` / `restorationStatus`) | 혼합 잡(빈칸지문+깨끗한지문)이 일반적 → 잡 단일값은 거짓이 됨(이해비평 §5,6). 잡 컬럼은 의도/디폴트, 지문별이 진실. 같은 additive 블록에 inputType/triageConfidence 동일 패턴 존재(schema:2295-2304) |
| **토글 형태** | 2-옵션 **세그먼트 컨트롤** (라디오 의미론, 카드형 설명) | 원문이 기본·정상, 복원은 옵션 → 스위치의 on/off 비대칭이 위계 왜곡. 세그먼트는 둘을 동등칸으로 중립 제시(UX §2) |
| **과금 시점** | **리뷰에서 지문별 복원 실행 시 차감** (잡 시작 선차감 금지) | 추출 전엔 복원 대상 수 미정(`shouldRestore`는 OCR+분류 후 stage1.ts:96 결정). 선차감→환불분쟁(UX §4, 이해비평 §3) |
| **지문별 옵트인** | **채택, 1차 출시에 포함** | `restoreM1PassageBatch`가 이미 배열 입력(persist.ts:233-239) → 단건 호출 재활용 가능. **finalize 워커 재배포와 디커플**(독립 출시) |
| **1차 잡단위 토글 기본값** | `verbatim` (D2 확정) | verbatim = grounded 호출 0 → 비용 ~80% 절감(persist.ts:96 → restorationTargets=[]) |
| **헤더 카피** | 같은 PR에서 교체 필수 | 현재 "원문 형태로 복원합니다"(index.tsx:671)가 P7과 정반대 약속 — 출발부터 멘탈모델 오염(이해비평 §0) |

**핵심 설계 원리:** verbatim은 신기능이 아니다. **이미 존재하는 "복원 스킵" 경로**(persist.ts:303-312 `NO_RESTORATION_NEEDED`, restoredText=teacherText=displayedText)를 사용자가 의도적으로 켜는 것. 토글은 `shouldRestore` 게이트 위에 "사용자 의사"라는 최상위 AND 조건 하나를 얹을 뿐.

**1차 출시 권장 범위 (단계적):**
- **Phase 1 (Next.js만, 워커 무관):** 리뷰 화면 지문별 "AI 복원 적용" 옵트인 + 단건 복원 API + 과금. **잡단위 토글 기본 verbatim이 아니어도** 이 기능만으로 D2의 "명시 선택+별도 과금"을 충족. 워커 재배포 불필요.
- **Phase 2 (워커 재배포 필요):** 잡단위 토글(업로드 패널) + finalize 게이트. 기본 verbatim으로 전환해 신규 잡의 비용을 ~80% 절감.

---

## 1. UX 최종

### 1-1. 토글 배치
- **위치:** 적응형 단일 전체폭 업로드 패널 하단, **"추출 시작" 버튼 바로 위** (버튼과 한 묶음).
- **근거:** 적응형은 `grid-cols-1` 단일 패널 + 우측 패널 없음 → 버튼 근처가 유일한 자연스러운 결정 지점. outputMode는 "이번 실행 비용을 바꾸는 결정"이라 시선이 마지막 머무는 시작 버튼 옆이어야 클릭 직전 인지. 헤더 배치는 기각(파일 올리고 스크롤하는 동안 잊음).

### 1-2. 토글 문구 (전문어 0, 강사 언어)

이해비평 §1의 결정적 지적 반영 — "복원/원문" 추상어는 강사가 "화질 복원"으로 오해. **강사가 매일 보는 것**으로 표현:

```
[●] 그대로 추출                  [ ] AI로 원문 복원
    스캔한 글자 그대로            빈칸 ____·섞인 순서를
    가져옵니다                   원래 지문으로 되살립니다
    OCR 비용만 (추가 무료)        지문당 ◈2 (추가)
```

- 라벨: "그대로 추출" / "AI로 원문 복원" — verbatim/restore/OCR 영어 노출 금지.
- 설명 1줄: "빈칸 ____·섞인 순서를 원래 지문으로 되살립니다" — `RESTORATION_REQUIRED_TYPES`(빈칸/순서/삽입/문법/어휘)를 강사 눈에 보이는 형태로 압축.
- **배지 (이해비평 §7-3 정직성 반영):** 원문 = `OCR 비용만 (추가 무료)` — **"무료"라고 단정 금지.** verbatim도 OCR은 `TEXT_EXTRACTION=3/페이지` 과금됨(create-job.ts:47). 복원 = `지문당 ◈2 (추가)`.
- **상시 미니 예시** (토글 옆, 이해비평 §1):
  ```
  예) The revolution ____ a turning point
      → marked  (복원 시 빈칸을 원문으로 채움)
  ```
  단 verbatim이 "나쁜 결과"로 보이지 않게 — 깨끗한 지문엔 verbatim이 정답.
- 선택 시 하단 캡션:
  - 그대로: "교재 그대로 추출합니다. 빈칸·순서 등 문제 변형도 그대로 보존됩니다."
  - 복원: "빈칸·순서·삽입 문제의 지문만 원래 글로 되살립니다. 깨끗한 지문은 그대로 둡니다. 추출 후 자료 관리에서 원문과 비교·교정할 수 있습니다."

### 1-3. mode("지문만") vs outputMode 혼동 차단 (이해비평 §0,2)

**근본 위험:** `mode=PASSAGE_ONLY`("지문만") ≈ `outputMode=verbatim`("원문 그대로") — 단어가 사실상 동의어. 차단책:
- 적응형에서 mode 칩은 이미 제거됨 → **현재 화면에 mode UI가 없으므로 물리적 혼동 자체가 없다.** outputMode 토글이 유일한 "방식" 컨트롤.
- 토글 위 마이크로 라벨은 **"출력 방식"** (mode가 쓸 "지문/추출 대상" 단어 회피).
- 추후 mode 칩 부활 시: "추출 대상"(mode) 섹션과 "출력 방식"(outputMode) 섹션을 **명시적 그룹 라벨로 분리**, 같은 줄에 두지 않음.
- **이어붙이기(crop merge, index.tsx:581)와도 분리:** "이어붙이기"는 업로드 단계 이미지 물리 결합 — "복원" 단어 절대 쓰지 않음. 단계 시각 분리: 업로드 패널(이어붙이기/크롭) → [추출 시작] → 리뷰 패널(복원 옵트인). 한 화면에 토글 3개 나란히 두지 않음.

### 1-4. 비용 미리보기 (토글-시작버튼 사이 1줄 동적 캡션)

추출 직전엔 정확한 지문 수 N을 **모른다**(OCR·triage 후 결정). 과대 약속 금지:
- **그대로 선택:** `이 추출 추가비용 없음 · OCR {업로드장수}장 (페이지 과금 별도)`
- **복원 선택 (N 미정):** `AI 복원 · 지문당 ◈2 (대상 지문 수는 추출 후 확정)`
- **복원 + `estimatedPassageCount` 사용가능(텍스트 등):** `AI 복원 · 약 {N}지문 예상 → 최대 ◈{2N}` — "약/예상/최대" 부착.
- **안전장치:** 차감은 항상 **실제 복원 실행 시점**(per-passage). 추출 시작 선차감 금지.
- 시작 버튼 카피도 변화: `추출 시작` ↔ `복원하여 추출 시작`.

### 1-5. 리뷰 화면 영향

| 케이스 | 리뷰 화면 |
|---|---|
| **verbatim 지문** (restoredText=teacherText=rawText) | 원문↔복원 비교 UI 무의미 → `passage-compare`/`restoration-changes-panel` **숨김**, 단일 원문 편집뷰만. 헤더 칩 `원문 그대로`(slate). ★ 이해비평 §7-6: 비교패널이 동일 텍스트 2개를 보여주면 "고장났나" 오해 — 반드시 숨김 |
| **restored 지문** | 기존 2단 비교 + `restoration-changes-panel` + teacherText 교정. 헤더 칩 `AI 복원됨`(blue-600) |
| **verbatim인데 빈칸 감지** (이해비평 §4-A) | 지문 카드에 `이 지문은 복원이 필요해 보입니다` 배너 + "AI 복원 적용 ◈2" 버튼 **권장 강조**(blue 채움). `metadata.questionTypes`에 `RESTORATION_REQUIRED_TYPES` 있을 때만 |
| **pure passage** (문제 변형 없는 깨끗한 지문) | 복원 버튼 **숨김** — 복원할 게 없는데 ◈2 유도는 신뢰 훼손(`isPurePassage` 신호, stage1.ts:81) |

### 1-6. ASCII 와이어프레임

**업로드 패널 (그대로 선택):**
```
┌──────────────────────────────────────────────────────────────┐
│  자료 추출                                          [잔액 ◈ 1,240] │
│   ┌──────────────────────────────────────────────────────┐   │
│   │   [드래그하여 파일 추가]  또는  [파일 선택]              │   │
│   │   ┌────┐ ┌────┐ ┌────┐   업로드된 3장                    │   │
│   │   │ p1 │ │ p2 │ │ p3 │                                  │   │
│   └──────────────────────────────────────────────────────┘   │
│                                                                │
│   출력 방식                                                     │
│   ┌──────────────────────────┬──────────────────────────┐    │
│   │ ●  그대로 추출            │ ○  AI로 원문 복원        │    │
│   │    스캔한 글자 그대로      │    빈칸 ____·섞인 순서를   │    │
│   │    가져옵니다             │    원래 지문으로 되살립니다 │    │
│   │    [OCR 비용만·추가 무료] │    [지문당 ◈2 (추가)]     │    │
│   └──────────────────────────┴──────────────────────────┘    │
│   └ 교재 그대로 추출합니다. 문제 변형도 그대로 보존됩니다.       │
│   예) The revolution ____ a turning point → marked            │
│   ┌────────────────────────────────────────────────────┐     │
│   │  이 추출 추가비용 없음 · OCR 3장 (페이지 과금 별도)     │     │
│   └────────────────────────────────────────────────────┘     │
│                          [  추출 시작  ]                        │
└──────────────────────────────────────────────────────────────┘
```

**자료 관리 — verbatim 카드 + 옵트인:**
```
┌──────────────────────────────────────────────────────────────┐
│  자료 관리  ·  잡 #a1b2  ·  지문 4건                            │
│  ┌─ 지문 1 ───────────────────────[ 원문 그대로 ]────────────┐│
│  │  ▸ 빈칸 추론 (29번)                  [ AI 복원 적용 ◈2 ]   ││ ← REQUIRED 타입 감지 → blue 강조
│  │  ⚠ 이 지문은 복원이 필요해 보입니다 (빈칸 ____ 감지)        ││
│  │  The industrial revolution _____ a turning point in ...    ││
│  │  [ 단일 편집뷰 · 비교 패널 없음 ]            [ 확정 → 저장 ]││
│  └────────────────────────────────────────────────────────────┘│
│  ┌─ 지문 2 ───────────────────────[ 원문 그대로 ]────────────┐│
│  │  ▸ 일반 독해 (안내문)                  (복원 버튼 없음)     ││ ← pure passage → 숨김
│  │  Welcome to the city library. Opening hours are ...        ││
│  └────────────────────────────────────────────────────────────┘│
│  ─────────────────────────────────────────────────────────── │
│  복원 권장 지문 1건            [ 권장 1건 모두 복원 ◈2 ]        │
└──────────────────────────────────────────────────────────────┘
```

**복원 후 2단 비교 전환:**
```
│  ┌─ 지문 1 ─────────────────────────[ AI 복원됨 ]───────────┐│
│  │  ▸ 빈칸 추론 (29번)            변경 3곳 · 출처 검증됨        ││
│  │  ┌── 원문 ──────────────┐ ┌── AI 복원 ───────────────┐    ││
│  │  │ ... _____ a turning  │ │ ... marked a turning      │    ││
│  │  │ point in ...         │ │ point in ... (밑줄=변경)   │    ││
│  │  └──────────────────────┘ └───────────────────────────┘    ││
│  │  [ 복원본을 교정본으로 사용 ]              [ 확정 → 저장 ]  ││
│  └────────────────────────────────────────────────────────────┘│
```

---

## 2. 데이터 모델 / 마이그레이션 (DB 충돌 0)

### 2-1. ExtractionJob.outputMode (additive, 기본 의도 신호)

`schema.prisma:2304`(estimatedPassageCount 직후, 같은 "Adaptive intake (additive)" 블록):
```prisma
  /// (P7-D2) 추출 산출물 모드(잡 단위 "기본 의도"). "verbatim"(원문 그대로) | "restored"(AI 복원).
  /// 진실의 소스는 지문별 — Passage.extractionOutput / Draft.restorationStatus.
  /// null = 미전달(비적응 off 흐름) → finalize는 기존 자동복원 휴리스틱 유지.
  outputMode String?
```

### 2-2. ExtractionM1PassageDraft.restorationCreditTxId (additive, 멱등·환불 보관)

`schema.prisma:2691`(deletedById 부근, 모델 내부):
```prisma
  /// (P7-D2) AI 복원 차감 CreditTransaction.id. null=미과금. 환불 후 null로 복원.
  /// (ExtractionPage.creditTxId 패턴과 동일 — schema:2395)
  restorationCreditTxId String?
```

### 2-3. drift-safe ADD COLUMN (raw DDL, migrate 히스토리 미기록)

이 DB는 migrate 히스토리 드리프트가 있어 `prisma migrate dev`는 reset 위험. raw DDL을 `db execute`로 직접 적용 + schema.prisma는 컬럼만 추가해 `prisma generate`로 클라이언트만 갱신:

```sql
-- prisma/migrations/manual/2026xxxx_p7_outputmode.sql
-- @@map 확인됨: ExtractionJob → "extraction_jobs", Draft → "extraction_m1_passage_drafts"
ALTER TABLE "extraction_jobs" ADD COLUMN IF NOT EXISTS "outputMode" TEXT;
ALTER TABLE "extraction_m1_passage_drafts" ADD COLUMN IF NOT EXISTS "restorationCreditTxId" TEXT;
```

적용:
```
npx prisma db execute --file prisma/migrations/manual/2026xxxx_p7_outputmode.sql --schema prisma/schema.prisma
npx prisma generate
```

**기존 무영향 근거 (DB 충돌 0):**
- 두 컬럼 모두 `nullable·default 없음` → Postgres에서 메타데이터만 변경, 테이블 rewrite/락 없음.
- `IF NOT EXISTS` → 재실행 멱등.
- 신규 enum/타입/제약 0개. 기존 unique·creditTxId 패턴 재사용.
- migrate 히스토리 미기록 → 현 드리프트 운영방식 유지, 드리프트 확대 0.
- **테이블명은 `@@map` 실측 확인:** `extraction_jobs`(schema:2344), `extraction_m1_passage_drafts`(schema:2705). 모델명이 아닌 매핑명을 써야 함 — DB·백엔드 입력의 `"ExtractionJob"`은 틀림(이 스펙에서 교정).

---

## 3. 배선 변경점 (file별, Phase 2 = 잡단위 토글)

### 3-1. zod (`zod-schemas.ts:41`)
`createJobRequestSchema`의 `mode` 라인 아래:
```ts
  mode: extractionModeSchema.default("PASSAGE_ONLY"),
  outputMode: z.enum(["verbatim", "restored"]).optional(), // P7-D2: 미전달=기존 자동복원
```
`createTextExtractionRequestSchema`(line 66-70)에도:
```ts
  outputMode: z.enum(["verbatim", "restored"]).optional(),
```
optional → off 클라가 안 보내도 통과. **충돌 0.**

### 3-2. create-job (`create-job.ts:82`)
`mode: parsed.mode,` 아래:
```ts
          mode: parsed.mode,
          outputMode: parsed.outputMode ?? null,
```

### 3-3. 업로드 훅 (`use-extraction-upload.ts:74-80, 93-110`)
opts 타입 + body 양쪽:
```ts
    async (opts: {
      slots: ClientPageSlot[];
      sourceType: "PDF" | "IMAGES";
      originalFileName: string | null;
      mode: ExtractionMode;
      outputMode?: "verbatim" | "restored";   // 추가
    }): Promise<string | null> => {
      const { slots, sourceType, originalFileName, mode, outputMode } = opts; // 추가
      ...
          body: JSON.stringify({
            sourceType,
            mode,
            outputMode,                          // undefined면 직렬화 시 키 생략
            totalPages: slots.length,
            ...
```

### 3-4. 클라 (`index.tsx:432-437, 472-481`)
store에 `outputMode: "verbatim" | "restored"` 상태 추가(기본 `"verbatim"`). 토글 UI는 §1-2 세그먼트:
```ts
// startExtraction
await startUpload({ slots: reindexed, sourceType: uploadSourceType,
  originalFileName: sourceName, mode: "PASSAGE_ONLY", outputMode });
// startTextExtraction body
body: JSON.stringify({ mode: "PASSAGE_ONLY", outputMode, title: ..., text: ... }),
```

### 3-5. 헤더 카피 (`index.tsx:671`) — 필수 동반 수정
```
description="PDF·이미지·텍스트를 등록해 지문을 추출합니다. 빈칸·순서 문제는 선택적으로 AI 복원할 수 있습니다."
```

### 3-6. UI 컴포넌트
`UploadPanel`에 세그먼트 토글 + 비용 캡션 컴포넌트 신규(`onStart` 위, index.tsx:733 근처). slate-700/blue-600, Sparkles·주황 금지(메모리 규칙).

---

## 4. finalize 복원 게이트 (Phase 2, 워커 재배포 필요)

### 4-A. outputMode 전파 (4계층, 누락 0 — 검증된 시그니처)

| 계층 | 파일:줄 | 변경 |
|---|---|---|
| 1 | `extraction-finalize.ts:97-106` | findUnique가 전 컬럼 로드(:54) → `finalizeStructured({...})`에 `outputMode: job.outputMode` 추가 |
| 2 | `orchestrator.ts:16-31` `StructuredFinalizeInput` | `outputMode: string \| null` 필드 + `:168` `runPassageOnlyClusterLoop({...})`에 `outputMode: input.outputMode` |
| 3 | `passage-only.ts:29-48` params | `outputMode: string \| null` 추가 + `:113` `persistM1PassageDrafts({...})`에 `outputMode: params.outputMode` |
| 4 | `persist.ts:17-48` `PersistM1PassageDraftsInput` | `outputMode?: string \| null` 추가 |

타입 필수 필드(`string|null`)로 두면 컴파일러가 1·2·3 누락을 잡음(4만 `?`). **클러스터 다중:** passage-only.ts:113은 클러스터별 persist 호출 — params 1개라 모든 클러스터에 동일 전달(자동 일관, 이해비평 §5 무관 확인됨).

### 4-B. verbatim 강제 게이트 (`persist.ts:96`)
```ts
const verbatimMode = input.outputMode === "verbatim";
const restorationTargets = verbatimMode ? [] : stage1.filter((s) => s.shouldRestore);
```
효과: verbatim → restorationTargets=[] → `persist.ts:228 if (restorationTargets.length > 0)` false → `restoreM1PassageBatch` 미호출 → **Google Search 0콜** → 비용 ~80% 제거.

### 4-B2. PENDING 고아 차단 (`persist.ts:303-305`) — 이해비평 §6 회귀 반영
verbatim일 때 PENDING이 찍히면 복원이 영영 안 와 영구 고아. `buildInitialDraftRows`에 verbatim 전파:
```ts
const pendingStatus: M1RestorationStatus =
  verbatimMode ? "NO_RESTORATION_NEEDED" : s.shouldRestore ? "PENDING" : "NO_RESTORATION_NEEDED";
```
- M1RestorationStatus 값 실측: `PENDING/RESTORED/NO_RESTORATION_NEEDED/...`(m1-restoration.ts:1-4). **신규 enum값 0** → promote/UI 분기 무영향.
- displayedText 로직(persist.ts:306-312) 무변경: verbatim은 typeSkipBody가 안 만들어지므로 결국 `rawText`(=원문). D2 정합.
- stage1.ts **무변경**: shouldRestore 계산은 그대로, verbatim이 filter 결과를 버림. 게이트 우선순위 `verbatim > 휴리스틱`.

### 4-C. ★ 텍스트 경로는 별도 처리 (세 입력 모두 놓친 경로)
`/api/extraction/text/route.ts:93`은 **`restoreM1Passage`를 무조건 동기 호출**한다 — persist/stage1 게이트를 안 탄다. 여기는 게이트 우회가 아니라 호출 자체를 조건부로:
```ts
const restoration = parsed.outputMode === "verbatim"
  ? { restoredText: parsed.text, teacherText: parsed.text, status: "NO_RESTORATION_NEEDED" as const,
      changes: [], sourceMatches: [], warnings: [], confidence: null, metadata: null }
  : await restoreM1Passage({ academyId: staff.academyId, rawText: parsed.text, questions: [] });
```
이 경로는 **Next.js 라우트(워커 아님)** → Phase 1로 같이 출시 가능. (이 라우트는 동기 라우트라 재배포=Vercel만.)

### 4-D. 비적응(off) 무영향
- zod `optional()` → off 클라 미전송 → create-job `?? null` → DB NULL.
- 게이트: `=== "verbatim"`만 강제. NULL/undefined/"restored"는 기존 `stage1.filter(s=>s.shouldRestore)` 100% 보존. **회귀 0.**

---

## 5. 크레딧 모델

### 5-A. 과금 시점 = 리뷰에서 지문별 복원 실행 시 (D2 정합)
- **verbatim 잡(기본):** finalize 복원 0, 과금 0. 리뷰에서 지문별 "AI 복원" 클릭 → 그 지문 1건 grounded + `PASSAGE_RESTORATION` 차감.
- **restored 잡:** finalize 자동복원되지만 **차감은 finalize(워커)에서 하지 않는다.** 이유 — 워커 차감은 사용자 피드백 불가 + 멱등키가 페이지 과금과 충돌 위험. **차감은 항상 워커 밖 단일 지점(리뷰/단건 복원 API)으로 통일.** restored 잡은 finalize가 무과금 복원 → 리뷰 진입 시 RESTORED 드래프트에 대해 단건 API와 동일 차감 경로로 정산.

### 5-B. 멱등성 (검증된 패턴 정확히 분리)
**차감 멱등**(이중과금 방지) — `charge-credits.ts:43-52` 패턴 재사용(`metadata contains` 스캔):
1. draft에 `restorationCreditTxId` 있으면 재사용(대부분 재시도).
2. 없으면 `CreditTransaction`에서 `operationType="PASSAGE_RESTORATION" AND metadata contains "idempotencyKey":"restore:${draftId}"` 사전 스캔.
3. 둘 다 없을 때만 `deductCredits(academyId, "PASSAGE_RESTORATION", staffId, { draftId, jobId, idempotencyKey: \`restore:${draftId}\` }, costOverride)`.
4. 성공 후 `restorationCreditTxId = r.transactionId` 기록.

> ⚠ **검증된 주의:** `deductCredits`는 CreditTransaction에 `referenceId`를 안 찍는다(credits.ts:104-114). 따라서 차감 멱등은 **반드시 metadata 문자열 스캔**으로(referenceId 스캔 불가). 환불 멱등은 별개(아래).

### 5-C. 환불 (`credits.ts:127`)
복원이 FAILED거나 결과가 raw와 동일(NO_RESTORATION_NEEDED 다운그레이드)면:
```ts
await refundCredits(academyId, "PASSAGE_RESTORATION", draft.restorationCreditTxId, reason, costOverride);
// 이후 draft.restorationCreditTxId = null 로 되돌려 재시도 허용
```
- `refundCredits`는 `referenceId`(원 트랜잭션 id)로 dedup(credits.ts:149-150) → 이중환불 자동 차단. **단 이 referenceId는 refundCredits가 환불 row 생성 시 찍는 것**(차감 row의 referenceId가 아님) → 차감/환불 멱등 키가 서로 독립.

### 5-D. 길이 티어 (credit-costs.ts:26 주석 "base; +length tier via costOverride")
복원 직전 길이로 `costOverride` 계산(예: `>=800자 → 3`). UI엔 "지문당 ◈2~"처럼 **범위 또는 사전계산 확정값** 표시 — "2"라 했다가 더 빠지면 클레임(이해비평 §3).

### 5-E. 기존 무과금과의 정합 (이해비평 §3 역풍 방어)
- **현재 복원이 무과금이던 이유는 자동·강제였기 때문**(credit-costs.ts:26 `PASSAGE_RESTORATION` 정의만, 미사용). P7은 복원을 "명시 선택"으로 전환 → 차감 정당성 확보.
- **verbatim 기본이므로 기존 사용자 기본 비용은 오히려 감소**(복원 안 하면 grounded 0). 역풍 최소화 카피: 토글에 "지금까지 자동이던 복원을 이제 필요할 때만 선택" 톤.

---

## 6. 리뷰 화면 지문별 "AI 복원 적용" 옵트인 (1차 포함)

### 6-A. 노출 조건 (다크패턴 회피, 이해비평 §4·5)
- **권장 강조(blue 채움):** draft `metadata.questionTypes`에 `RESTORATION_REQUIRED_TYPES` 감지 시. → ⚠ **전제: verbatim 잡도 분류(questionType)는 항상 계산해 metadata에 남겨야 함.** 현재 type-skip 경로만 questionTypes 기록(persist.ts:330) — verbatim에서 분류 스킵하면 이 안전망 소실(이해비평 §4-A, 놓치기 쉬움). **buildInitialDraftRows의 pendingMetadata에 verbatim일 때도 `questionTypes: s.questionTypes` 항상 기록하도록 보강.**
- **숨김:** pure passage(`isPurePassage`, stage1.ts:81) — 복원할 게 없는데 ◈2 유도는 신뢰 훼손.
- **칩 대체:** 이미 RESTORED면 버튼 대신 `AI 복원됨` 칩.

### 6-B. 단건 복원 흐름 (워커 디커플)
1. `use-draft-actions`에 `restoreDraft(draftId)` 액션 신규.
2. 신규 API `POST /api/extraction/m1-passages/[draftId]/restore` (Next 라우트):
   - 멱등 사전스캔(§5-B) → 통과 시 `restoreM1PassageBatch`를 **1건 배열**로 호출(persist.ts:233 구조 재활용) → `deductCredits`(§5-B) → draft `restorationStatus="RESTORED"`, `restoredText` 갱신, `restorationCreditTxId` 기록.
   - 실패 → 환불(§5-C).
3. 카드 단일뷰 → 2단 비교뷰 in-place 전환, `restoration-changes-panel` 등장.
4. 일괄: "권장 {k}건 모두 복원 ◈{2k}" — `RESTORATION_REQUIRED_TYPES` 감지 지문만 카운트, 선택분만 batch.

**디커플 근거:** 이 경로는 finalize 워커를 안 건드린다(별도 Next API + 클라 액션) → **워커 재배포와 독립 → Phase 1 단독 출시 가능.**

---

## 7. 단계 구현 순서 + 회귀/검증 체크리스트

### 7-A. 배포 순서 (DB 먼저 — 검증된 read/write 순서)
```
① DB: db execute로 ALTER 2건 (컬럼 없는 상태에서 신코드 read/write 시 에러 → 반드시 선행)
② prisma generate 포함 빌드
③ Next.js(Vercel) 배포  ← Phase 1 전부 + 텍스트경로 게이트(§4-C)
④ Trigger.dev 배포      ← Phase 2 (finalize 게이트 §4-A/B/B2)
```
- **smoat.co.kr은 협업자 Vercel CLI 직접 배포(깃 비연동)** → 배포 조율 필수(메모리 `project_deploy_smoat_cli`).
- **프로덕션 워커 버전 ≠ 깃 가능** → Phase 2 출시 전 워커 버전 일치 확인 필수(이해비평 §7-1). 안 그러면 토글이 "먹통"(verbatim 골라도 자동복원).

### 7-B. Phase 분리 (출시 단위)
- **Phase 1 (Next.js만, 워커 무관):** §3 zod/create-job/upload훅/클라/헤더카피 + §4-C 텍스트경로 + §6 리뷰 옵트인 + 단건 복원 API + §5 과금. → **D2 "명시 선택+별도 과금" 충족.**
- **Phase 2 (워커 재배포):** §4-A/B/B2 finalize 게이트 → 신규 잡 비용 ~80% 절감.

### 7-C. 회귀 포인트 (검증된 엣지)
1. **verbatim 영구 PENDING 고아** → §4-B2 buildInitialDraftRows까지 verbatim 전파 필수.
2. **restored인데 차감 누락** → §5-A 워커 밖 단일 차감지점으로 통일.
3. **outputMode 4계층 전파 누락** → 1·2·3 계층 타입 필수 필드로 컴파일러 강제.
4. **이중과금** → §5-B restorationCreditTxId + metadata 스캔(referenceId 아님).
5. **promote PENDING-중-confirm 레이스**(이해비평 §6, promote/route.ts:116-117): restorationStatus=PENDING인데 confirm하면 `"verbatim"`으로 박힘. → 리뷰 confirm 버튼은 **draft에 PENDING 복원이 진행중이면 비활성/대기 표시**. (선택 토글이 이 레이스를 흔하게 함.)
6. **재추출 중복 Passage**(이해비평 §6): verbatim 커밋 후 "역시 복원" 재시도 시 deleteMany는 DRAFT만 지움(persist.ts:75-77) → COMMITTED Passage는 잔존 + contentHash 다름(복원으로 텍스트 변경)→dedup 실패. **재복원 동선의 dedup 정책 별도 결정 필요**(1차 범위 밖이면 "재추출 대신 리뷰 단건 복원 권장" UX로 우회).
7. **pure passage에 복원 버튼 노출** → isPurePassage 숨김(§6-A).

### 7-D. 검증 체크리스트 (Please test this)
- [ ] staging DB에서 ALTER 2건 `db execute` → `prisma generate` 정합.
- [ ] outputMode 4계층 전파 타입체크로 누락 0.
- [ ] **verbatim 잡: PENDING 고아 0** (모든 draft NO_RESTORATION_NEEDED), grounded 호출 0 로그 확인.
- [ ] **restored 잡: 차감 멱등** — 같은 draft 2회 복원 요청 시 단 1회 차감(metadata 스캔 동작).
- [ ] 복원 FAILED 시 환불 발생 + restorationCreditTxId null 복귀 + 재시도 가능.
- [ ] verbatim 리뷰에서 비교패널 숨김, restored에서 등장.
- [ ] 텍스트 경로(§4-C): outputMode=verbatim이면 restoreM1Passage 미호출.
- [ ] promote PENDING-중 confirm 차단 동작.

---

## 8. 강사 이해를 위한 최종 문구 모음 (톤 규칙 준수: slate/blue, 주황·Sparkles 금지)

| 위치 | 문구 |
|---|---|
| 헤더 설명(교체) | PDF·이미지·텍스트를 등록해 지문을 추출합니다. 빈칸·순서 문제는 선택적으로 AI 복원할 수 있습니다. |
| 토글 마이크로 라벨 | 출력 방식 |
| 옵션 A 라벨 | 그대로 추출 |
| 옵션 A 설명 | 스캔한 글자 그대로 가져옵니다 |
| 옵션 A 배지 | OCR 비용만 (추가 무료) |
| 옵션 B 라벨 | AI로 원문 복원 |
| 옵션 B 설명 | 빈칸 ____·섞인 순서를 원래 지문으로 되살립니다 |
| 옵션 B 배지 | 지문당 ◈2 (추가) |
| 캡션(A) | 교재 그대로 추출합니다. 빈칸·순서 등 문제 변형도 그대로 보존됩니다. |
| 캡션(B) | 빈칸·순서·삽입 문제의 지문만 원래 글로 되살립니다. 깨끗한 지문은 그대로 둡니다. 추출 후 자료 관리에서 원문과 비교·교정할 수 있습니다. |
| 비용 미리보기(A) | 이 추출 추가비용 없음 · OCR {N}장 (페이지 과금 별도) |
| 비용 미리보기(B) | AI 복원 · 지문당 ◈2 (대상 지문 수는 추출 후 확정) |
| 시작 버튼(A/B) | 추출 시작 / 복원하여 추출 시작 |
| 리뷰 칩(verbatim) | 원문 그대로 |
| 리뷰 칩(restored) | AI 복원됨 |
| 복원 권유 배너 | 이 지문은 복원이 필요해 보입니다 (빈칸 ____ 감지) |
| 옵트인 버튼 | AI 복원 적용 ◈2 |
| 일괄 옵트인 | 권장 {k}건 모두 복원 ◈{2k} |
| 확인 모달 | 이 지문을 AI로 복원합니다. ◈2가 차감됩니다. [취소] [복원] |
| 미니 예시 | 예) The revolution ____ a turning point → marked (복원 시 빈칸을 원문으로 채움) |

---

### 관련 파일 (전부 절대경로, 줄번호 실측)
- DB: `c:\Users\jooye\Desktop\2026project\nara\prisma\schema.prisma` (ExtractionJob 2276/`@@map "extraction_jobs"` 2344, M1PassageDraft 2667/`@@map "extraction_m1_passage_drafts"` 2705)
- zod: `c:\Users\jooye\Desktop\2026project\nara\src\lib\extraction\zod-schemas.ts:41,66-70` (커밋 schema의 extractionOutput는 206-207에 **이미 존재**)
- create-job: `c:\Users\jooye\Desktop\2026project\nara\src\app\api\extraction\jobs\_lib\create-job.ts:47(pre-flight),82`
- 업로드 훅: `c:\Users\jooye\Desktop\2026project\nara\src\hooks\use-extraction-upload.ts:74-80,93-110`
- 클라: `c:\Users\jooye\Desktop\2026project\nara\src\app\(director)\director\workbench\passages\import\_components\bulk-extract-client\index.tsx:432-437,460-499,671`
- 텍스트 라우트(★별도 경로): `c:\Users\jooye\Desktop\2026project\nara\src\app\api\extraction\text\route.ts:93`(무조건 restoreM1Passage)
- finalize 체인: `extraction-finalize.ts:54,97` → `structured\orchestrator.ts:16-31,168` → `structured\passage-only.ts:29-48,113` → `m1-drafts\persist.ts:17-48,96,228,303-312`
- 게이트 입력: `m1-drafts\stage1.ts:70-98,81(isPurePassage)`, `m1-drafts\constants.ts(RESTORATION_REQUIRED_TYPES)`
- promote(무변경, 정합 확인): `src\app\api\extraction\m1-passages\promote\route.ts:116-117`
- 크레딧: `src\lib\credit-costs.ts:26(PASSAGE_RESTORATION 활성화)`, `src\lib\credits.ts:65-71(deductCredits, referenceId 미기록),127-150(refundCredits referenceId dedup)`
- 멱등 패턴 모델: `src\trigger\_lib\extraction-page\charge-credits.ts:43-52(metadata contains 스캔)`
- enum: `src\lib\extraction\m1-restoration.ts:1-4(M1RestorationStatus 값)`
