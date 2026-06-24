# 지문 세트(Long-Passage Set) 기능 — 세션 핸드오프 (2026-06-24)

> **이 문서의 목적**: 다음 작업 세션이 **Codex(다른 AI, Claude 메모리 이전 안 됨)** 에서 진행되므로,
> 이번 세션에서 한 작업·현재 상태·다음 작업·프로젝트 규칙을 **자기완결적으로** 정리해 둔다.
> Codex는 이 파일만 읽고 바로 이어서 작업할 수 있어야 한다.

---

## 0. 프로젝트 한 줄 요약
영신ai ERP — **Next.js 16 + Prisma + Supabase(Postgres) + Gemini/Claude** 영어학원 플랫폼.
"지문 세트"(과거명 "장문 세트") = 한 지문에 여러 문항을 묶어 출제하는 기능. 이번 세션은 그 기능의 **표시·편집·분리 UI 대수술 + 품질검증**을 했다.

---

## 1. 핵심 개념 / 아키텍처 (반드시 이해하고 시작)

### 1-1. 세트 생성은 "멤버당 별도 호출"
- `src/lib/question-sets/generate-set.ts` 의 `buildQuestionSet` 가 세트를 생성한다.
- **각 멤버(문항) = 기본 단일문항 엔진(`runQuestionGenerationWithEmptyRetry`)을 1번씩 따로 호출** (`generateOne`).
  - **단일 호출로 전부 생성 후 후처리하는 방식이 아니다.**
- 순서:
  1. **구조 멤버 우선(순차)** — 글의순서(SENTENCE_ORDER)처럼 지문을 블록으로 쪼개 "표시 베이스(displayedBase)"를 정의하는 유형이 있으면 먼저 단독 생성. ([generate-set.ts L280~](../src/lib/question-sets/generate-set.ts))
  2. **비구조 멤버 병렬 생성** — `Promise.all` 로 각 멤버를 각자 별도 호출, 표시 베이스에 대해. (read-core-2는 구조 멤버 없어 그냥 병렬)
  3. **후처리(생성 후)** — 각 멤버의 밑줄/마커(anchor)를 **공유 지문 1개(displayedBase)에 해소**하는 누설격리·마킹 재구성. ← "후처리"는 문항 생성이 아니라 **지문/밑줄 정리** 단계.
- **함의**: 멤버끼리 서로 모르고 독립 생성된다 → 같은 지문 큰그림을 물으면 의미 중첩 가능(soft overlap, 허용). 기본 엔진의 검증·후처리·누설게이트를 멤버마다 그대로 타므로 **단일문항 품질이 그대로 보존**된다.

### 1-2. 표시 모델: 공유 지문 1회 + anchors
- 세트는 `canonicalPassage`(원문) + `displayedPassageLayout`(표시 베이스) + 멤버별 `spans`(anchor=밑줄/마커 좌표)로 저장.
- 멤버는 **자체 지문을 굽지 않고**, 렌더 시 anchor를 공유 베이스에 재구성(`reconstruct.ts`)해서 밑줄을 그린다.
- `structuralMode`: `NONE`(요지/내용일치 등 무변형) / `SENTENCE_ORDER`(블록 분할) / `SENTENCE_INSERT`(주어진 문장).

### 1-3. 프리셋 레지스트리 (자유조합 X, 코드 검증된 조합만)
- `src/lib/question-sets/presets.ts` — `SET_PRESETS`. 1티어 5개:
  - `read-core-2` (**독해 핵심 2문항** = MAIN_IDEA 요지/주장 + CONTENT_MATCH 내용일치) ← **유일하게 출시 검증 완료·깨끗**
  - `read-comprehensive-3` (제목+지칭+내용일치), `vocab-meaning`(동의어+문맥의미), `summary-set`(요약MC+내용일치), `csat-43-45`(**글의순서**+지칭+내용일치 ← 미검증·버그①)
- `passageMeetsPreset` 로 지문 분량 게이트. `validateSetComposition`(leakage-gate)로 조합 유효성.

### 1-4. DB 표시 규칙
- 세트 멤버 = `Question.inSet=true` + `setId` → **일반 문제 목록(getWorkbenchQuestions)에서 제외**(buildWorkbenchQuestionWhere `where.inSet=false`).
- 세트는 `listQuestionSets`(academy-scoped)로 따로 조회 → 전용 세트 카드로 묶어 표시.

---

## 2. 이번 세션(06-23~24)에 한 작업 — 전부 **UI/표시/편집 계층**

> 생성 엔진 로직은 거의 안 건드림. 표시·편집·분리·정렬·정합성 위주.

1. **세트 = 한 장의 카드** (`src/components/workbench/question-set-card.tsx`)
   - 멤버별 2장 분리 폐기 → 공유 지문 1회 + 멤버 전부를 한 카드에.
   - **일반 문제관리 카드(`QuestionBankCard`)의 디자인 언어로 통일**: 접힘 기본 + 헤더 "지문 N ▾" 토글 + 파란 동그라미 보기 배지 + `CollapsedPreview`·`ExplanationSection` **부품 재사용**(멤버 렌더 동일) + 동일 푸터(검수완료/수정하기/상세) + 미승인 빨강 보더 + `flex h-full`.
   - question-card.tsx 헬퍼 export(DIFFICULTY_CONFIG·formatOption·parseCorrectAnswerLabels·normalizeAnswerLabel·SUBTYPE_LABELS·ReviewStatusStamp).
2. **전용 공용 섹션** (`src/components/workbench/question-set-section.tsx`)
   - 생성결과·문제관리 양쪽 공용. listQuestionSets로 세트 조회. 모달/편집/분리 핸들러 보유.
3. **상세 모달** (`src/components/workbench/question-bank-client/set-detail-dialog.tsx`)
   - 일반 상세 모달(`QuestionDetailDialog`) 셸 복제(백드롭 + max-w-[1680px] + 2열: 왼쪽 공유 지문 InteractivePassageView / 오른쪽 멤버를 QuestionBankCard embedded).
   - **멤버 토글 "1번/2번"** (전체 탭 없이 멤버만, 기본 1번) — 보고 싶은 문항만.
4. **수정하기 = 진짜 편집 모달** (상세 모달 아님)
   - 푸터 "수정하기" → `EditQuestionDialog`(일반 편집 워크스페이스 `QuestionEditWorkspace`)가 뜸. **상단에 1번/2번 토글**(EditQuestionDialog에 `topBar` prop 신설)로 어느 멤버를 편집할지 전환.
   - 멤버 검수완료/검수취소 = `approveWorkbenchQuestion`/`unapproveWorkbenchQuestion`.
5. **분리(split) = 복제 방식** (`splitQuestionSetMember` in `src/actions/question-sets.ts`)
   - ⚠️ **세트에서 빼내는 게 아니라**, 그 문항의 **복제본을 단독 문항(inSet=false·setId=null)으로 1개 추가**. 원본 세트는 그대로. 지문·해설·정답 복제, `sourceExtractionItemId`(@unique)만 제외.
   - UI: "분리 중" 파란 로딩 카드(`WorkbenchLoadingCard`, 생성중과 동일) + 최소 0.7초 표시 + 완료 시 복제본 **파란 글로우 + 1페이지 리셋 + 그 카드로 스크롤**(`handleSplitCreated`) + 토스트.
6. **세트+일반 카드 한 그리드 통합 + createdAt 최신순 인터리브**
   - flat 뷰: 세트 카드와 일반 카드를 **같은 DragSelect 그리드**에서 `createdAt` 최신순으로 섞어 렌더(종류 불문 통합 정렬). QuestionSetSection `inline`+`normalItems`+`showSets` prop. 세트는 1페이지에서만 끼움.
   - grouped(지문별) 뷰는 세트 섹션을 위에 따로 두는 것 유지.
7. **세트 생성 후 자동 갱신** — 세트는 큐 done을 안 올려서 안 떴던 버그 → `onSetCreated`→`setRefreshNonce`→embedded 세트섹션 refreshKey 신설.
8. **품질 검수(필살기 적대검수, 13세트/26문항)** — 결과: **read-core-2(독해 핵심 2문항 8세트) = 확정 결함 0건, 깨끗.** 확정 결함 5건은 **전부 구 장문세트 데이터(06-03·06-15 생성, SENTENCE_ORDER/지칭 섞임)** 에서만 — 즉 **이번 세션이 안 건드린 옛 데이터**. (글의순서 보기에 원문 없는 가공텍스트 = 버그①). audit 데이터: `scripts/_gen_audit_out/set-quality-data.json`.

### 미커밋 상태 ⚠️
- 커밋된 것: **`f95e03a`** "[FEAT]: 지문 세트 프리셋 기반 재작성 + 전용 세트 카드(일반 카드 통일)" (세트 기능 베이스, 푸시 안 함).
- **그 이후 이번 세션의 대부분(카드 통일 후속·상세모달·수정모달·분리복제·인터리브·자동갱신)은 미커밋.** 다음 세션은 먼저 `git status`로 확인.
- 브랜치: `jay/grammar-quantity-tense-20260623`.

---

## 3. ⭐다음 세션의 핵심 작업 (사용자 지정)

### 문제의식 (사용자 원문 취지)
- 지금 적용한 세트(read-core-2: 요지/내용일치)는 **지문을 변형하지 않아** 지장 없음 — 모든 멤버가 같은 원문을 읽음.
- 그러나 앞으로 **순서(SENTENCE_ORDER)·빈칸(blank)·어법(grammar 변형)** 이 세트에 들어가면, 이들은 **표시 지문을 변형**한다:
  - 빈칸: 지문에 `___` 가 뚫림.
  - 어법: 지문에 일부러 어법 오류를 심음(또는 네모 선택지).
  - 순서: 지문이 블록으로 쪼개져 섞임.
- 한 세트에 **변형 멤버 + 비변형 멤버**(또는 변형끼리)가 섞이면 **표시 지문 하나가 양쪽을 동시에 만족 못 함 → 모순**:
  - 예: 빈칸 멤버는 빈칸 뚫린 지문이 필요한데, 내용일치 멤버는 완전한 지문이 필요. 공유 지문 1개로 둘 다 못 함.
  - 예: 어법 멤버가 오류를 심으면, 같은 지문을 읽는 다른 멤버 입장에선 그게 "틀린 문장"이 됨.

### 목표 (사용자 요구)
> **각 문항의 논리를 해치지 않으면서, 출제 포인트를 정확하게 잡아서 활용할 수 있는 "장치"가 무조건 있어야 한다.**

이 장치가 만족해야 할 3가지:
1. **논리 보존**: 한 멤버의 지문 변형이 다른 멤버의 풀이 논리를 깨뜨리지 않게.
2. **출제 포인트 정확 포착**: 각 멤버가 무엇을(어떤 지점을) 묻는지 정확히 잡아 활용.
3. **변형 유형의 세트 결합 허용**: 빈칸/어법/순서를 세트로 안전하게 묶을 수 있게.

### 관련 기존 인프라 (다음 세션에서 코드로 검증할 것)
- 세트 표시 모델: `structuralMode` + `displayedBase` + 멤버별 `spans`(anchor). **현재 anchor는 "밑줄/마커"만 병합** — **텍스트 변형(빈칸·어법오류·블록섞기)은 한 베이스에 병합 불가.**
- 출제 포인트 카탈로그(이미 존재): `src/lib/question-sets/blank-point-catalog.ts`, `sentence-insert-point-catalog.ts`. 어법은 GRAMMAR_CORRECTION focus 계열(`buildGrammarPointGuidance` 등). `buildBlankPointGuidance`(엔진 런타임 미사용=배선 필요로 메모됨).
- 조합 게이트: `validateSetComposition`(leakage-gate) — 이미 일부 무효 조합 차단.
- 메모리/문서 참고: `docs/POINTFOCUS-DEDUP-EXPANSION-SCOPE.md`(출제포인트·중복방지 로드맵), `docs/BLANK-EXTRACTION-HANDOFF.md`, `docs/SENTENCE-INSERT-EXTRACTION-HANDOFF.md`.

### 검토할 접근 방향 (다음 세션이 평가·결정)
1. **멤버별 독립 표시 지문 허용**: "공유 지문 1회" 설계를 변형 멤버에 한해 깨고, 각 변형 멤버가 **자기만의 표시 지문 버전**(빈칸판/어법오류판/블록섞기판)을 갖게. 세트는 SOURCE 지문만 공유, 표시/출력은 멤버마다 자기 지문 인라인. (가장 모순 없는 방향이나, "지문 1회" 시각 통일을 일부 포기)
2. **조합 제약 강화**: leakage-gate에서 **변형 유형 + 충돌 멤버**를 아예 금지(호환 조합만 프리셋 허용).
3. **출제 포인트 조율로 충돌 회피**: 점 카탈로그로 멤버들이 **서로 다른 지점**을 묻게 + 변형 지점을 다른 멤버 논리에 영향 없는 곳으로 격리.
4. (보조) 멤버 독립 생성을 **조율 생성/사후 충돌 검출**로 보강 — 현재는 멤버끼리 서로 모르고 생성됨.

→ **다음 세션은 코드(generate-set.ts, reconstruct, leakage-gate, point catalogs, 엔진 빈칸/어법 경로)를 먼저 정독**한 뒤, 위 방향을 평가해 "장치"를 설계·구현. read-core-2(무변형)는 그대로 두고 변형 유형부터.

---

## 4. 프로젝트 규칙/컨벤션 (Codex가 지켜야 할 것)

### Git
- **author = jay `<jayitis27@gmail.com>`** (repo local config). 계정은 jooyeon과 공유.
- 브랜치: `jay/<영역>-YYYYMMDD` (날짜 표기). 현재 `jay/grammar-quantity-tense-20260623`.
- **절대 `main` 에 push 금지.** commit/push는 **사용자가 명시 요청할 때만** (자동 금지).
- 커밋 메시지: 한글 + `[FEAT]/[CHORE]/[FIX]` 류 + 날짜. (jooyeon이 최종검토·배포; 우리는 별도 브랜치까지만.)

### 코드 구조
- kebab-case 파일명. 계층별 크기 차등(UI 컴포넌트 ~500줄, lib는 책임 단위). 미사용 코드 정리.
- 도메인 규칙: 파라미터 4종 세트, 공유 컴포넌트는 import만(격리), LLM 호출 견고화(`.catch`/폴백).
- **신규 유형 추가 시 기존 엔진과 동일 구조**(스키마·프롬프트·게이트·후처리·설정·UI·렌더 전 지점 동일 등록).

### 검증 방식 (문제생성 계열 기본 루프)
- 수정 → **DB 지문으로 직접 생성(tsx 하네스, UI 조건 재현, DB 무저장)** → **전수 품질 검증(결정형 + 적대검수 + 베이스라인 비교, 수정 부분만 보지 말 것)** → 재수정. 최대 3사이클·2연속 무개선 시 중단.
- 품질 적대검수는 정답시비·누설·보기품질·언어 차원으로. 양방향 가드(적대 검수 + 보수 종합으로 거짓양성 필터).

### UI/소통
- 사용자에게 유형명은 **UI 한글 라벨**로(요지/주장·내용 일치·글의 순서·지칭 추론·동의어·문맥 속 의미…), 내부코드(MAIN_IDEA 등) 금지. 매핑 `src/lib/question-type-ui.ts`.
- 설명은 **용어·약어 풀어서 쉽게**(ON/OFF·grounding 등 정의 없이 던지지 말 것).
- 확인/질문은 **팝업 모달 금지**(AskUserQuestion/ExitPlanMode 금지) — **항상 채팅 텍스트**로.
- 사용자가 명시 요청하지 않으면 코드 수정 X, 필요하면 먼저 채팅으로 물어봄.

### dev 서버
- dev 서버는 **사용자가 직접 띄움**(제안/실행 금지). 종료도 명시 요청 시만.

### tsc gotcha (중요)
- **tsc 전 `.tsbuildinfo` 캐시 삭제 필수**(stale 결과 줌): `find . -maxdepth 3 -name "*.tsbuildinfo" -not -path "*/node_modules/*" -delete`.
- **baseline = 67 errors**(growth/referral/webtoon 도메인의 Prisma stale, 무관). 67 유지 = 클린. eslint도 기존 warning 다수 = baseline.

---

## 5. 주요 파일 인덱스 (세트 기능)
- 생성: `src/lib/question-sets/generate-set.ts`, `presets.ts`, `leakage-gate.ts`, `reconstruct.ts`, `types.ts`, `blank-point-catalog.ts`, `sentence-insert-point-catalog.ts`
- 라우트/액션: `src/app/api/workbench/ai-jobs/question-set/route.ts`, `src/actions/question-sets.ts`(listQuestionSets·splitQuestionSetMember·approve/deleteQuestionSet·getQuestionSet)
- 표시/편집 컴포넌트: `src/components/workbench/question-set-card.tsx`, `question-set-section.tsx`, `question-bank-client/set-detail-dialog.tsx`, `question-bank-client/edit-question-dialog.tsx`(topBar prop), `question-bank-client/use-question-editor.ts`
- 호스트: `src/app/(director)/director/workbench/generate/embedded-question-bank.tsx`(메인 하단 목록·인터리브·glow/scroll·setRefreshKey), `generate-page-client.tsx`(setRefreshNonce·onSetCreated), `workspace/use-workspace-generation.ts`(세트 생성 POST·onSetCreated)
- 일반 카드/모달(통일 기준): `src/components/workbench/question-bank-card.tsx`, `question-card.tsx`, `question-bank-client/question-detail-dialog.tsx`, `workbench-loading-card.tsx`(생성중/분리중 카드)

---

## 6. 현재 상태 요약 (다음 세션 출발점)
- ✅ read-core-2(요지+내용일치) 세트: 생성·표시·편집·분리·정렬·품질 전부 OK.
- ✅ UI: 세트=한 장 카드(일반 카드 통일), 상세모달(멤버 토글), 수정=편집모달(멤버 토글), 분리=복제(글로우+스크롤), 통합 최신순 정렬.
- ⏳ 변형 유형(순서·빈칸·어법)의 세트 결합 = **다음 세션 핵심 작업**(§3).
- ⏳ csat-43-45(글의순서) 프리셋 = 미검증·버그①(보기 가공). vocab-meaning/summary-set/read-comprehensive-3 = 미개별검증.
- 🧹 구 장문세트 데이터(06-03·06-15, null라벨 5세트) = 품질결함 있음, 정리(삭제) 또는 무시 — 이번 작업과 무관.
- ⚠️ 미커밋 다수(§2 끝). 커밋은 사용자 명시 시만.
