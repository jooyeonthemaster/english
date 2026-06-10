# 코드 구조 가이드

> 영신ai ERP(Next.js + Prisma + LLM 생성 파이프라인) 코드 분리·구조화 규칙.
> v2.0 — 실제 코드베이스 관행에 맞게 전면 개정. 예시는 전부 이 레포의 실제 코드.

---

## 0. 제1원칙

**함께 바뀌는 것끼리 묶고, 따로 바뀌는 것끼리 나눈다.**

줄 수는 분리의 *신호*이지 *이유*가 아니다. 분리의 이유는 항상 "이 파일에 서로 다른
책임이 섞여 있는가"이다. 줄 수 규칙(1장)과 충돌하면 이 원칙이 우선한다.

---

## 1. 파일 크기 기준 (계층별 차등)

| 계층 | 검토 시작 | 분리 권장 | 비고 |
|---|---|---|---|
| UI 컴포넌트 (`.tsx`) | 500줄 | 700줄 | JSX는 길수록 급격히 나빠짐. 한 파일에 컴포넌트 3개 이상이면 줄 수와 무관하게 분리 |
| API `route.ts` | 100줄 | 150줄 | 검증·서비스 로직을 옆 파일로 분리 (3장) |
| 도메인 lib (`src/lib/**`) | 800줄 | 책임 단위로 판단 | 책임이 하나면 1,000줄+도 허용. 단 `// ── 섹션 ──` 주석으로 내부 구획 필수 |

- **허용되는 대형 lib의 예**: `question-quality.ts` — 수십 개 검증 함수가 한 도메인(문항
  품질)에 응집. 쪼개면 검증 흐름 추적이 오히려 어려워진다. 이런 파일은 섹션 주석과
  일관된 함수 명명(`validate<Type>Question`)으로 내부 질서를 유지한다.
- **분리해야 하는 대형 UI의 예**: `custom-type-generate-panel.tsx`(1,400줄) — 메인 패널 +
  설정 패널 + 유형 블록 + 스테퍼 + 토글 5개 컴포넌트 동거. 컴포넌트별 파일 분리 대상.

## 2. 분리 방법 (기능 단위 우선)

분리할 때는 **기능/도메인 단위**로 자른다. 문법 종류별 분리(types.ts, constants.ts,
utils/)는 선택 가능한 *메뉴*이지 의무가 아니다.

- 타입은 그것을 쓰는 함수 옆에 두는 것이 기본. 여러 파일이 공유할 때만 `types.ts`로 승격.
- 상수도 동일 — 한 곳에서만 쓰면 그 파일에 둔다.
- **좋은 분리 예**: `similar-exam-generation/question-analysis/` — schema / prompt /
  analyzer / matching / model / completeness / errors 가 각각 독립적으로 변경되는 단위.
- 컴포넌트 폴더 분리가 필요해지면:

```
component-name/
├── index.tsx          # 진입점 (re-export 유지로 기존 import 경로 보존)
├── types.ts           # 공유 타입만
├── sub-section.tsx    # 독립 UI 섹션
└── use-something.ts   # 훅
```

## 3. API 라우트 패턴

route.ts는 얇게: 인증 → 입력 검증 → 서비스 호출 → 응답. 로직이 자라면 라우트 폴더 안에
파일을 추가한다.

**이 레포의 모범 사례** — `api/similar-exams/question-generation-jobs/`:

```
question-generation-jobs/
├── request-schema.ts        # zod 요청 스키마
├── registration-service.ts  # 등록 로직
├── listing-service.ts       # 조회 로직
└── route.ts                 # 75줄
```

여러 라우트가 공유하는 로직은 라우트 폴더가 아니라 `src/lib/<도메인>/`에 둔다.

## 4. 명명 규칙

**모든 파일·폴더는 kebab-case.** (`question-quality.ts`, `custom-type-generate-panel.tsx`,
`use-question-editor.ts`) — 컴포넌트도 PascalCase 파일명을 쓰지 않는다. 코드 내 심볼은
일반 TS 관례(컴포넌트·타입 PascalCase, 함수·변수 camelCase, 상수 UPPER_SNAKE).

- 훅 파일: `use-` 접두사 (`use-passage-blocks.ts`)
- Next.js 예약 파일(`route.ts`, `page.tsx`, `layout.tsx`)은 그대로.

## 5. Import 순서

React/Next → 외부 라이브러리 → 내부 절대경로(`@/lib`, `@/components`, `@/actions`) →
상대경로. 세부 순서는 사람이 지키는 규칙이 아니라 **eslint(`import/order`)로 자동화할
대상**이다. 도입 전까지는 위 4단 순서만 지킨다.

## 6. 미사용 코드 정책

- import되지 않는 파일, 주석 처리된 코드 블록, deprecated 코드 → **삭제** (Git 히스토리가 보존한다).
- **예외 (삭제 금지)**:
  - Next.js 예약 파일 — `route.ts`/`page.tsx`는 원래 아무도 import하지 않는다.
  - **레거시 데이터 호환 분기** — DB에 저장된 구버전 데이터(JSON spec, 구 필드명)를 읽기
    위한 코드는 grep으로 죽은 코드처럼 보인다. 반드시 `// 레거시 호환: ...` 주석으로
    이유를 남기고, 데이터 부재가 확인되면 그때 삭제한다.
    (예: 커스텀 유형의 `BUILTIN_OVERRIDE` 티어 분기, vocab-choice의 legacy 필드 복구)
  - `scripts/tmp-*` 스크래치 — 커밋하지 않는 것으로 관리.

---

## 7. 도메인 규칙 (이 프로젝트 고유 — 위반 시 실제 버그가 났던 것들)

### 7.1 문제 유형 파라미터는 "세트"로 움직인다

빌트인 유형에 수치 파라미터(보기 수·정답 수·빈칸 수 등)를 추가/변경할 때는 다음이
**한 변경 단위**다. 하나라도 빠지면 생성물이 zod 파싱 실패 또는 품질 게이트 reject로
조용히 전멸한다:

1. 설정 함수 (`question-type-generation-settings.ts`: 상수·read·resolve·프롬프트 블록·토큰 플로어)
2. 동적 zod 스키마 (`question-ai-schemas-*.ts`의 `buildAi*Schema` + `getAiResponseSchema` 분기)
   — **`wrongOptionExplanations`는 기본 4개 고정이므로 보기/정답 수가 변하면 반드시
   `buildAiWrongOptionExplanationsSchema(보기수-정답수)`로 재생성**
3. 후처리 (`question-postprocess/processors/*`) — 개수 하드코딩 제거
4. 품질 게이트 (`question-quality.ts`) — 기대 개수 파라미터화 (`getExpectedOptionCount` 포함)
5. 엔진 배선 (`run-question-generation.ts`의 resolve→스키마→게이트 전달)
6. UI 스테퍼 + (라벨 공간이 늘면) 렌더링 정규식((a)~(e)→(a)~(j) 류)
7. 동형 연동 시: 분석 프롬프트의 **"Supported flexible counts" 목록**(`question-analysis/prompt.ts`)
   — 여기 없는 개수는 분석기가 빌트인 매칭을 포기하므로 매핑이 영원히 발동하지 않는다.

### 7.2 공유/격리 경계

- **공유 코드**(기본 생성 엔진, 공유 워크벤치 컴포넌트)는 여러 작업자·여러 기능이 의존한다.
  수정 전에 호출처를 확인하고, 다른 작업자 영역(분석리포트·지문등록·태스크큐 등)과 겹치면
  먼저 조율한다.
- **신규 기능은 격리 폴더**로 시작한다 (예: `src/lib/custom-question-types/**` 3폴더 세트).
  공유 코드는 import만 하고, 공유 컴포넌트에 기능을 붙일 때는 **optional prop/slot**으로
  비파괴 확장한다 (예: `QuestionCard`의 `detailExtra`).
- 기본 경로의 동작은 바꾸지 않고 분기로 확장한다 (예: 빈칸 추론 다중 빈칸 — `blankCount >= 2`
  일 때만 별도 스키마/후처리/게이트로 분기, 단일 빈칸 경로는 무수정).

### 7.3 LLM 구조화 출력 견고화

- Google 구조화 출력은 enum은 강제하지만 **숫자 min/max·문자열 길이·배열 제약은 강제하지
  않는다**. 분석·추출 스키마의 제약 leaf에는 `.catch(폴백)`을 달아 값 하나가 어긋나도
  전체 파싱이 죽지 않게 한다. (생성 스키마는 반대로 `.length()` 강제가 retry를 유도하므로 catch 금지.)
- 후처리는 LLM 출력을 신뢰하지 않는다: 라벨 정규화(NFKC·장식 제거), 위치 기반 재정렬,
  정답-본문 일치 검증을 후처리 계층에서 결정형으로 보장한다.

### 7.4 서버/클라이언트 경계

- 도메인 로직·LLM 호출·Prisma는 `src/lib/**` (서버 전용). 클라이언트 컴포넌트에서 직접
  import 금지 — API 라우트나 서버 액션을 거친다.
- 인-프로세스 백그라운드 워커(잡 러너)는 원자 클레임(`updateMany` where status)·재진입
  가드·stale 복구 패턴을 따른다 (예: `question-job-runner.ts`).

---

## 8. 체크리스트

### 새 코드 작성 시
- [ ] 책임이 하나인가? (줄 수보다 먼저)
- [ ] 계층별 크기 기준(1장) 안인가?
- [ ] 신규 기능이면 격리 폴더인가? 공유 코드는 import만 하는가?

### 유형 파라미터 변경 시 (7.1)
- [ ] 설정·스키마·후처리·게이트·배선·UI 전부 갱신했는가?
- [ ] `wrongOptionExplanations` 개수를 재생성했는가?
- [ ] 동형 분석 프롬프트의 flexible counts 목록을 갱신했는가?
- [ ] 기존 기본 경로(기본 개수)가 바이트 단위로 동일하게 동작하는가?

### 코드 리뷰 시
- [ ] 미사용 import/변수/파일이 있는가? (eslint)
- [ ] 주석 처리된 코드 블록이 있는가?
- [ ] 레거시 호환 분기에 이유 주석이 있는가?
- [ ] tsc/eslint 0 에러인가?

---

## 9. 버전 히스토리

| 날짜 | 버전 | 변경 내용 |
|------|------|----------|
| 2026-01-22 | 1.0 | 초기 문서 (타 프로젝트 기반) |
| 2026-06-10 | 2.0 | 전면 개정: 계층별 크기 기준, kebab-case 통일, 기능 단위 분리 원칙, 미사용 코드 예외, 도메인 규칙(파라미터 4종 세트·공유/격리 경계·LLM 견고화·서버/클라 경계) 추가. 타 프로젝트 예시(3D/Canvas, 이미지 생성) 제거 |
