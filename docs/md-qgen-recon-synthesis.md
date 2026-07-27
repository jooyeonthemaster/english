# md 레인 4유형 승차 — 최종 실행 스펙 (병렬 구현용)

**작성 기준일** 2026-07-26 / **브랜치** `20260722jooyeon` / **모든 근거는 실제 파일 열람으로 재검증함**
**금지사항** 커밋·푸시·배포 전면 금지. 배포는 `vercel --prod` 이며 건별 명시 승인 필요.

---

## 0. 재검증 결과 — 정찰 보고 6건 중 정정·확정된 사실

| # | 항목 | 재검증 결과 |
|---|---|---|
| V1 | `src/lib/md-qgen/` 배럴 index | **존재하지 않음.** 파일 3개(`prompts.ts` 496 / `parser.ts` 755 / `adapter.ts` 351)뿐. → 배럴 충돌 없음 |
| V2 | `src/lib/md-lab/parser.ts:1` · `prompts.ts:1` | `export * from "@/lib/md-qgen/parser"` / `.../prompts"` — **재수출 배럴이 존재**. md-lab 은 신형 유형을 소비하지 않으므로 **동결(FROZEN)** |
| V3 | `SHUFFLE_OPTION_TYPES` (`src/lib/question-diversity.ts:508-522`) | **GRAMMAR_CHOICE_COMBO 포함 확정**(`:521`). VOCAB_CHOICE·ANTONYM·SENTENCE_ORDER **미포함 확정** → order 보고 R2 우려는 해소 |
| V4 | md-stream `operationType` | `route.ts:532` `const operationType: OperationType = "QUESTION_GEN_SINGLE";` **하드코딩 확정**. fast 는 `route.ts:90-98` `getOperationType` 으로 `VOCAB_TYPES={CONTEXT_MEANING,SYNONYM,ANTONYM}` → `QUESTION_GEN_VOCAB`(1크레딧). **ANTONYM 이중청구 확정** |
| V5 | `adapter.ts` 공용 헬퍼 | `POINT_NAME(:28)`·`contextAround(:45)`·`parenLabel(:67)`·`digitOptionLabel(:75)` **전부 미export** → 신규 어댑터가 못 씀 |
| V6 | `parser.ts` 공용 헬퍼 | `escapeRegExp(:424)`·`wordBoundaryRegex(:428)`·`countWordBoundaryMatches(:433)`·`snapSpanNearAnchor(:476)`·`snapExpressionSpan(:601)` **전부 미export**. export 된 것은 `normalizeWs(:67)`·`INLINE_MARK_RE(:143)`·`locateMark(:439)`·`circledForMarkIndex(:664)`·`gateMd*`·`parseMd*`·`autoSnap*`·`segmentPassage` |
| V7 | `validateQuestionQuality` 슬롯 (`dispatcher.ts:760-784`) | `vocabChoiceMarkerCount` `vocabChoiceAnswerCount` `antonymPairCount` `stemLanguage` `optionLanguage` **전부 이미 존재**. SENTENCE_ORDER·COMBO 전용 인자는 없음(불필요) |
| V8 | `PASSTHROUGH_TYPES` (`question-postprocess/types.ts:67-`) | `"SENTENCE_ORDER"` **첫 항목으로 등재 확정** → 후처리 전무 |
| V9 | 후처리 디스패치 (`index.ts:90-137`) | `GRAMMAR_CHOICE_COMBO(:97)` `VOCAB_CHOICE(:103)` `ANTONYM(:124)` **등재 확정**, SENTENCE_ORDER 케이스 없음 |
| V10 | resolved 설정 키 (`dispatchers.ts`) | `vocabChoiceMarkerCount/AnswerCount/SynonymVariants(:235-237)` · `sentenceOrderPrefixVariationCount/PointFocus(:277-278)` · `antonymPairCount(:289)` · COMBO 는 `grammarPointFocus(:134)` 단독 — **전부 확정** |
| V11 | 교사포인트 준수 추출자 (`point-picker-config.ts:320-362`) | `GRAMMAR_CHOICE_COMBO→slots[].correctExpression` · `VOCAB_CHOICE→markedWords[].originalWord` · `ANTONYM→markedWords[].word` · `SENTENCE_ORDER→sentenceOrderComplies()` 전용함수 — **4유형 전부 존재 확정** |
| V12 | `preflightQuestionFeasibility` (`feasibility.ts:27-55`) | SENTENCE_ORDER 단독 활성 확정. `minSentences = MIN_PARAGRAPH_SENTENCES*3 = 6`, `minWords = 72` |
| V13 | 오류 매퍼 최종 fallthrough (`workbench-generation-errors.ts:91-104`) | 한국어 passthrough 가 `questionType === "IRRELEVANT"` 로 **하드 게이팅** 확정 → SENTENCE_ORDER preflight 한국어 진단이 `:104` 로 삼켜짐 **확정** |
| V14 | 검증 하네스 | `scripts/_test-md-multi-formats.ts`(0원 픽스처) · `scripts/_bench-md-multi-live.ts`(실콜 매트릭스) · `scripts/_repro-md-gate-failures.ts` **존재 확정**. 단위 테스트는 `npm run test:unit` = `node --test tests/unit` |
| V15 | `option-display.ts` 마커 변환 체인 (`:234-248`) | `formatInlineMarkersForSubtype` = 4단 중첩(SENTENCE_INSERT→IRRELEVANT→VOCAB_CHOICE→GRAMMAR_ERROR). **ANTONYM 분기 부재 확정** |

---

## 1. 아키텍처 결정

### 1-1. 결론 — **레인 디스크립터(Lane Descriptor) 패턴 + 유형별 4파일 전용 소유**

정본 3파일에 4유형을 밀어넣는 안은 **기각**한다. 근거:
- `prompts.ts` 496 + 4유형 프롬프트(각 180~250줄) ≈ 1,400줄 — 500줄 규칙 3배 초과
- `parser.ts` 755 + 4유형 파서/게이트(각 150~220줄) ≈ 1,500줄
- `route.ts` 1,170 + 11개 분기 확장 ≈ 1,800줄
- 무엇보다 **4명이 같은 3파일을 동시 편집** → 머지 충돌 확정

대신:

```
src/lib/md-qgen/
  prompts.ts     ← 정본. 【FROZEN】 (PRE-WORK 외 편집 금지)
  parser.ts      ← 정본. 【FROZEN except PRE-WORK】
  adapter.ts     ← 정본. 【FROZEN except PRE-WORK】
  lane-types.ts       ★ 신규 (오케스트레이터 소유) — MdLane 인터페이스 계약
  lane-registry.ts    ★ 신규 (오케스트레이터 소유) — typeId → lane 매핑
  prompts-vocab.ts  parser-vocab.ts  adapter-vocab.ts  lane-vocab.ts     ← VOCAB 에이전트 배타 소유
  prompts-combo.ts  parser-combo.ts  adapter-combo.ts  lane-combo.ts     ← COMBO 에이전트 배타 소유
  prompts-order.ts  parser-order.ts  adapter-order.ts  lane-order.ts     ← ORDER 에이전트 배타 소유
  prompts-antonym.ts parser-antonym.ts adapter-antonym.ts lane-antonym.ts ← ANTONYM 에이전트 배타 소유
```

**왜 유형당 4파일인가**: 3파일(prompt/parser/adapter)은 순수 lib, 4번째 `lane-*.ts` 는 그 셋을 묶어 route 가 소비하는 **단일 진입점**이다. 이 4번째 파일 덕분에 route.ts 는 유형이 늘어도 분기가 늘지 않는다(if-else 사슬 폭발 차단).

**정본 파일 무회귀 보장**: route.ts 의 기존 BLANK/GRAMMAR 분기는 **문자 하나도 바꾸지 않는다**. lane 이 없으면(`getMdLane(subType) === null`) 기존 코드가 그대로 실행된다. 실측 성능(빈칸 59s/27원·어법 50~65s, `prompts.ts:1-2`)이 붙어 있는 문자열은 전부 보존된다.

### 1-2. 공용 헬퍼 재사용 경로 — PRE-WORK-1 (오케스트레이터 단독, 팬아웃 **전에** 완료)

신규 4유형이 필요로 하는 헬퍼 중 **미export 인 것**을 export 로 승격한다. **코드 이동 없음, `export` 키워드 추가만** — 런타임/바이트 무변경.

**PRE-WORK-1a — `src/lib/md-qgen/parser.ts`** (5곳, 각 줄 앞에 `export ` 삽입)

| 줄 | 현재 | 변경 후 |
|---|---|---|
| 424 | `function escapeRegExp(s: string): string {` | `export function escapeRegExp(s: string): string {` |
| 428 | `function wordBoundaryRegex(expr: string): RegExp {` | `export function wordBoundaryRegex(expr: string): RegExp {` |
| 433 | `function countWordBoundaryMatches(passage: string, expr: string): number {` | `export function countWordBoundaryMatches(passage: string, expr: string): number {` |
| 476 | `function snapSpanNearAnchor(` | `export function snapSpanNearAnchor(` |
| 601 | `function snapExpressionSpan(passage: string, oe: string): string \| null {` | `export function snapExpressionSpan(passage: string, oe: string): string \| null {` |

**PRE-WORK-1b — `src/lib/md-qgen/adapter.ts`** (4곳)

| 줄 | 현재 | 변경 후 |
|---|---|---|
| 28 | `const POINT_NAME: Record<string, string> = {` | `export const POINT_NAME: Record<string, string> = {` |
| 45 | `function contextAround(` | `export function contextAround(` |
| 67 | `function parenLabel(label: string): string {` | `export function parenLabel(label: string): string {` |
| 75 | `function digitOptionLabel(label: string): string {` | `export function digitOptionLabel(label: string): string {` |

⚠️ **`src/lib/md-lab/parser.ts` 는 `export *` 재수출이므로 위 5개가 md-lab 표면에도 노출된다.** 신규 심볼 추가일 뿐 기존 심볼 변경이 아니므로 md-lab 컴파일 무영향(tsc 로 확인할 것).

**이미 export 되어 그대로 쓸 수 있는 것**: `normalizeWs`, `INLINE_MARK_RE`, `locateMark`, `circledForMarkIndex`, `gateMdQuestion`, `gateMdMultiBlank`, `segmentPassage`.

**절대 재사용 금지 목록** (유형별로 계약이 반대라서 그대로 쓰면 100% 사고):
- `autoSnapGrammarMarks` 의 v2 "미끼 원형 교정" 분기(`parser.ts:541-557`) → VOCAB SYNONYM_VARIANT 에 적용하면 비정답 원형이 전부 동의어로 덮어써짐
- `gateMdQuestion` 어법 분기의 `changed.length === answerCount`(`parser.ts:328`) → VOCAB 변형 모드에서 100% 반려
- `INLINE_MARK_RE`(`[A-J]` 대문자 전용) → VOCAB 소문자 라벨엔 매칭 안 됨. COMBO 는 `|` 2택이라 캡처 구조 자체가 다름

### 1-3. `MdAnyQuestion` 유니언 — **확장하지 않는다**

`parser.ts:57-63` 이 기록한 스펙 이탈(“`MdQuestion` 이분 유니언에 넣으면 `exam-sheet.tsx` / `question-editor.tsx` 내로우잉이 tsc 실측 컴파일 실패”)을 근거로, 신형 4유형은 **`MdAnyQuestion` 에도 넣지 않는다.**

대신 `MdLaneParsed.question: unknown` 으로 route 를 불투명하게 통과시키고, 각 lane 이 자기 타입으로 캐스팅해 소비한다. → `parser.ts:55/63` 두 줄 **무편집**. 이것이 4명 동시 편집에서 가장 위험한 충돌점을 아예 제거한다.

### 1-4. 공유 편집 지점(충돌 지점) 전수 — **병렬 편집 절대 금지, 오케스트레이터 일괄 처리**

| ID | 파일:줄 | 성격 |
|---|---|---|
| PRE-1a | `src/lib/md-qgen/parser.ts` 424/428/433/476/601 | export 승격 |
| PRE-1b | `src/lib/md-qgen/adapter.ts` 28/45/67/75 | export 승격 |
| PRE-2 | `src/lib/md-qgen/lane-types.ts` **(신규)** | MdLane 계약 |
| PRE-3 | `src/lib/md-qgen/lane-registry.ts` **(신규)** | 레인 매핑 |
| S1 | `md-stream/route.ts:69` | import 추가 |
| S2 | `md-stream/route.ts:100` | `MD_STREAM_SUBTYPES` |
| S3 | `md-stream/route.ts:467` 직후 | `mdLane` 해석 |
| S4 | `md-stream/route.ts:477-489` | `mdEligible` |
| S5 | `md-stream/route.ts:532` | `operationType` ★ANTONYM 과금 |
| S6 | `md-stream/route.ts:600` 직후 | `laneCtx` 조립 |
| S7 | `md-stream/route.ts:649` 직후 | 다양성 표적 수집 |
| S8 | `md-stream/route.ts:683-701` | `buildPrompt` base |
| S9 | `md-stream/route.ts:702-763` | `extras` |
| S10 | `md-stream/route.ts:883-889` | 1차 parseAndGate |
| S11 | `md-stream/route.ts:892-894` | `retryEligible` |
| S12 | `md-stream/route.ts:917-923` | 재시도 parseAndGate |
| S13 | `md-stream/route.ts:949-952` · `1083-1086` | `mdFormat` |
| S14 | `md-stream/route.ts:971-995` | 어댑터 분기 |
| S15 | `md-stream/route.ts:1027-1034` | 검증 인자 |
| C1 | `use-generation-handlers.ts:241` | `MD_STREAM_TYPES` |
| X1 | `src/lib/question-quality/feasibility.ts:33` | SENTENCE_ORDER 하한 6→7 **(사용자 승인 필요)** |
| X2 | `src/lib/workbench-generation-errors.ts:91-102` | 한국어 passthrough 해제 **(사용자 승인 필요)** |
| — | `src/lib/md-lab/parser.ts` · `prompts.ts` | **【FROZEN】 편집 금지** |
| — | `src/lib/question-postprocess/**` | **【FROZEN】 편집 금지** — 승차의 전제가 "fast 와 동일 후처리 통과" |
| — | `src/lib/question-quality/validators/**` | **【FROZEN】 편집 금지** |
| — | `scripts/_test-md-multi-formats.ts` · `_bench-md-multi-live.ts` | **【FROZEN】** — 유형별 신규 스크립트를 각자 만들 것 |

---

## 2. PRE-WORK-2 / PRE-WORK-3 — 정확한 삽입 코드 스니펫 (오케스트레이터 전용)

### PRE-2. `src/lib/md-qgen/lane-types.ts` (신규 · 예상 70줄)

```ts
// ============================================================================
// md 레인 디스크립터 계약 (26-07-26 4유형 승차)
// 신형 유형은 이 인터페이스 하나만 구현하면 md-stream 라우트에 승차한다 —
// 라우트는 유형별 if-else 를 늘리지 않고, 정본(빈칸·어법) 분기는 바이트 무회귀다.
// 레이어 규칙: lib 은 app/_lib 을 import 하지 않는다(디스크립터도 순수 lib).
// ============================================================================
import type { OperationType } from "@/lib/credit-costs";
import type { MdDifficulty } from "./prompts";
import type { TeacherPointPayload } from
  "@/app/(director)/director/workbench/generate/generation-config-panel-parts/point-picker-config";

export interface MdLaneContext {
  /** 원문 지문(passage.content) */
  passage: string;
  /** md 3분기 난이도 */
  difficulty: MdDifficulty;
  /** 원본 난이도 문자열(어댑터·검증 전달용) */
  rawDifficulty: string;
  /** resolveQuestionTypeGenerationSettings 결과 */
  resolved: Record<string, unknown>;
  /** 원본 questionTypeSettings(언어 블록 빌더가 raw 를 요구) */
  rawTypeSettings: unknown;
  /** 클램프+지문축자 필터를 통과한 교사 지정 포인트 */
  teacherPoints: TeacherPointPayload[];
  variantIndex: number;
  variantCount: number;
}

export interface MdLaneParsed {
  /** 레인 고유 파싱 결과 — 라우트는 불투명하게 통과시킨다(MdAnyQuestion 확장 금지) */
  question: unknown;
  /** 비면 통과, 있으면 재생성(적격 시) 또는 실패·환불 */
  gateIssues: string[];
  /** 0원 자동 보정 기록(잡 result.mdCorrections) */
  corrections: string[];
}

export interface MdLaneAdaptResult {
  ok: boolean;
  error?: string;
  aiQuestion?: Record<string, unknown>;
}

export interface MdLane {
  readonly subType: string;
  /** 과금 유형 — ANTONYM 은 QUESTION_GEN_VOCAB(1크레딧), 그 외 QUESTION_GEN_SINGLE(2) */
  readonly operationType: OperationType;
  /** 게이트 반려 시 1회 재생성 허용 여부 */
  readonly retryEligible: boolean;
  /** 설정 범위 적격성 — 크레딧 차감 전에 호출된다(범위 밖은 fast 폴백) */
  isEligible(resolved: Record<string, unknown>): boolean;
  buildBasePrompt(ctx: MdLaneContext): string;
  /** 설정 모드 블록들 — 교사포인트·다양성·커스텀·피드백은 라우트가 뒤에 붙인다 */
  buildExtras(ctx: MdLaneContext): string[];
  /** 파싱 → 오토스냅 → 게이트 → 교사포인트 준수검사까지 레인이 전담 */
  parseAndGate(text: string, ctx: MdLaneContext): MdLaneParsed;
  adapt(parsed: MdLaneParsed, ctx: MdLaneContext): MdLaneAdaptResult;
  /** validateQuestionQuality 에 추가로 넘길 형식 실값 */
  qualityArgs(ctx: MdLaneContext): Record<string, unknown>;
  /** 잡 result.mdFormat 포렌식 메타 */
  mdFormat(ctx: MdLaneContext): Record<string, unknown>;
  /** 같은 지문 기존 문항의 structuredData 에서 회피 표적을 뽑는다 */
  diversityTargets(structuredData: Record<string, unknown>): string[];
}
```

### PRE-3. `src/lib/md-qgen/lane-registry.ts` (신규 · 예상 35줄)

```ts
// md 레인 디스크립터 레지스트리 — typeId → lane. 라우트의 유일한 신형 진입점.
import type { MdLane } from "./lane-types";
import { VOCAB_CHOICE_MD_LANE } from "./lane-vocab";
import { GRAMMAR_CHOICE_COMBO_MD_LANE } from "./lane-combo";
import { SENTENCE_ORDER_MD_LANE } from "./lane-order";
import { ANTONYM_MD_LANE } from "./lane-antonym";

const LANES: MdLane[] = [
  VOCAB_CHOICE_MD_LANE,
  GRAMMAR_CHOICE_COMBO_MD_LANE,
  SENTENCE_ORDER_MD_LANE,
  ANTONYM_MD_LANE,
];

const BY_TYPE = new Map<string, MdLane>(LANES.map((lane) => [lane.subType, lane]));

/** 신형 레인 유형이면 디스크립터, 정본(빈칸·어법)이면 null(라우트 기존 분기로) */
export function getMdLane(subType: string): MdLane | null {
  return BY_TYPE.get(subType) ?? null;
}

/** 라우트 MD_STREAM_SUBTYPES 조립용 */
export const MD_LANE_SUBTYPES: readonly string[] = LANES.map((l) => l.subType);
```

> **팬아웃 전략**: PRE-3 은 4개 lane 파일이 전부 있어야 컴파일된다. 오케스트레이터는 **팬아웃 시점에 4개 lane 파일의 스텁**(인터페이스만 만족하는 최소 구현)을 먼저 커밋하고 registry 를 세운 뒤 팬아웃하거나, **팬아웃 후 통합 시점**에 registry 를 작성한다. 후자 권장(스텁이 실수로 남는 위험 제거).

### S1~S15 — `md-stream/route.ts` 정확한 치환 스니펫

**S1 · `:69` 다음 줄에 추가**
```ts
import { getMdLane, MD_LANE_SUBTYPES } from "@/lib/md-qgen/lane-registry";
import type { MdLaneContext, MdLaneParsed } from "@/lib/md-qgen/lane-types";
```

**S2 · `:100` 전체 치환**
```ts
const MD_STREAM_SUBTYPES = new Set([
  "BLANK_INFERENCE",
  "GRAMMAR_ERROR",
  ...MD_LANE_SUBTYPES,
]);
```

**S3 · `:467`(grammarPointFocus 블록 끝) 직후 삽입**
```ts
  // ── 신형 4유형(26-07-26 승차) — 레인 디스크립터 위임 ───────────────────────
  // 빈칸·어법은 lane === null 이라 아래 기존 분기가 그대로 실행된다(바이트 무회귀).
  const mdLane = getMdLane(subType);
```

**S4 · `:477-483` 치환** (주석 `:468-476` 은 유지)
```ts
  const mdEligible = mdLane
    ? mdLane.isEligible(resolvedSettings as Record<string, unknown>)
    : (subType === "BLANK_INFERENCE" && blankCount >= 1 && blankCount <= 3) ||
      (subType === "GRAMMAR_ERROR" &&
        markerCount >= 5 &&
        markerCount <= 10 &&
        answerCount >= 1 &&
        answerCount <= markerCount);
```

**S5 · `:532` 치환** ★ANTONYM 이중청구 봉합
```ts
  // 과금 유형은 레인이 결정한다 — fast 와 동일 규칙(어휘 계열 1크레딧).
  // 하드코딩 유지 시 ANTONYM 이 1→2 로 이중 청구되고 클라 견적(1)과도 어긋난다.
  const operationType: OperationType = mdLane?.operationType ?? "QUESTION_GEN_SINGLE";
```

**S6 · `:600`(teacherPoints 선언 끝) 직후 삽입**
```ts
  const laneCtx: MdLaneContext | null = mdLane
    ? {
        passage: passage.content,
        difficulty: mdDifficulty,
        rawDifficulty: effectiveDifficulty,
        resolved: resolvedSettings as Record<string, unknown>,
        rawTypeSettings: config.questionTypeSettings ?? null,
        teacherPoints,
        variantIndex: config.variantIndex ?? 0,
        variantCount: config.variantCount ?? 1,
      }
    : null;
```

**S7 · `:649`(markedExpressions 블록 닫는 `}`) 직후, `} catch {` 앞에 삽입**
```ts
        if (mdLane) {
          for (const target of mdLane.diversityTargets(record)) {
            const s = target.trim();
            if (s) targets.push(s.slice(0, 90));
          }
        }
```

**S8 · `:683` `const base =` 를 치환** (기존 삼항 전체를 `:` 뒤로 밀어넣음)
```ts
    const base = laneCtx && mdLane
      ? mdLane.buildBasePrompt(laneCtx)
      : subType === "BLANK_INFERENCE"
        ? /* 기존 :685-696 그대로 */
        : /* 기존 :697-701 그대로 */;
```

**S9 · `:703` 주석 다음 `if (subType === "BLANK_INFERENCE" && blankCount >= 2) {` 앞에 삽입**
```ts
    if (laneCtx && mdLane) {
      extras.push(...mdLane.buildExtras(laneCtx));
    } else if (subType === "BLANK_INFERENCE" && blankCount >= 2) {
```
(→ 기존 `if` 를 `else if` 로 승격. 이후 체인 `:726 else if` / `:760 else if` 는 그대로)

**S10 · `:883-889` 치환**
```ts
          let parsedMd: MdLaneParsed =
            laneCtx && mdLane
              ? mdLane.parseAndGate(call.text, laneCtx)
              : parseAndGate(
                  subType,
                  call.text,
                  passage.content,
                  teacherPoints,
                  formatCounts,
                );
```

**S11 · `:892-894` 치환**
```ts
          const retryEligible =
            mdLane
              ? mdLane.retryEligible
              : subType === "GRAMMAR_ERROR" ||
                (subType === "BLANK_INFERENCE" && blankCount >= 2);
```

**S12 · `:917-923` 치환**
```ts
            const retryParsed: MdLaneParsed =
              laneCtx && mdLane
                ? mdLane.parseAndGate(retryCall.text, laneCtx)
                : parseAndGate(
                    subType,
                    retryCall.text,
                    passage.content,
                    teacherPoints,
                    formatCounts,
                  );
```

**S13 · `:949-952` 치환** (같은 형태를 `:1083-1086` 에도)
```ts
                    mdFormat:
                      laneCtx && mdLane
                        ? mdLane.mdFormat(laneCtx)
                        : subType === "BLANK_INFERENCE"
                          ? { blankCount }
                          : { markerCount, answerCount },
```

**S14 · `:971-995` 치환**
```ts
          const legacyQuestion = parsedMd.question as MdAnyQuestion;
          const adapt =
            laneCtx && mdLane
              ? mdLane.adapt(parsedMd, laneCtx)
              : legacyQuestion.kind === "blank"
                ? adaptMdBlankToAiQuestion(
                    legacyQuestion,
                    passage.content,
                    effectiveDifficulty,
                    blankDoubleNegative
                      ? "DOUBLE_NEGATIVE"
                      : blankParaphrase
                        ? "PARAPHRASE"
                        : "SOURCE_EXACT",
                  )
                : legacyQuestion.kind === "multiBlank"
                  ? adaptMdMultiBlankToAiQuestion(
                      legacyQuestion,
                      passage.content,
                      effectiveDifficulty,
                      blankParaphrase ? "PARAPHRASE" : "SOURCE_EXACT",
                    )
                  : adaptMdGrammarToAiQuestion(
                      legacyQuestion,
                      passage.content,
                      effectiveDifficulty,
                    );
```
> `legacyQuestion` 캐스트는 lane 이 null 인 경로에서만 평가되도록 `adapt` 삼항 안쪽에 두는 편이 더 안전하다. 위 형태는 캐스트만 위로 뺀 것이라 런타임 부작용 없음(타입 단언은 no-op).

**S15 · `:1027-1034` 치환**
```ts
            ...(laneCtx && mdLane
              ? mdLane.qualityArgs(laneCtx)
              : subType === "GRAMMAR_ERROR"
                ? { grammarMarkerCount: markerCount, grammarAnswerCount: answerCount }
                : blankCount >= 2
                  ? {
                      blankInferenceBlankCount: blankCount,
                      blankInferenceParaphraseAnswer: blankParaphrase,
                    }
                  : {}),
```

**C1 · `use-generation-handlers.ts:241` 치환**
```ts
const MD_STREAM_TYPES = new Set([
  "BLANK_INFERENCE",
  "GRAMMAR_ERROR",
  // 26-07-26 승차 — 서버가 적격성 최종 권위(설정 범위 밖은 400 후 fast 폴백).
  "VOCAB_CHOICE",
  "GRAMMAR_CHOICE_COMBO",
  "SENTENCE_ORDER",
  "ANTONYM",
]);
```
`isMdStreamEligible`(`:257-274`) **무편집** — 세부 설정은 서버 권위라는 기존 설계 선언(`:239`) 그대로.

---

## 3. 유형별 구현 스펙 4건

모든 lane 은 공통으로 **`extras` 에 언어 블록을 반드시 포함한다** — md 레인의 확인된 기존 결함(§0 gold §7 말미, route.ts 전체에 `stemLanguage` 참조 0건) 봉합. 4유형 전부 `getQuestionLanguageToggleScope === "stem"` 이므로 발문 언어만 집행하면 된다.

```ts
// 각 lane-*.ts 의 buildExtras 공통 선두
import { buildQuestionLanguageSettingsPrompt } from "@/lib/question-type-generation-settings/language";
// ...
const lang = buildQuestionLanguageSettingsPrompt(ctx.subType, ctx.rawTypeSettings);
if (lang) extras.push(lang);
```
그리고 `qualityArgs` 에 `stemLanguage` / `optionLanguage` 실값을 함께 넘긴다(`dispatcher.ts:770-771` 슬롯 존재).

---

### 3-A. VOCAB_CHOICE (어휘 적절성) — 담당 에이전트 **[VOCAB]**

#### A-1. 소유 파일

| 파일 | 신규/수정 | 예상 줄 |
|---|---|---|
| `src/lib/md-qgen/prompts-vocab.ts` | 신규 | 250 |
| `src/lib/md-qgen/parser-vocab.ts` | 신규 | 230 |
| `src/lib/md-qgen/adapter-vocab.ts` | 신규 | 150 |
| `src/lib/md-qgen/lane-vocab.ts` | 신규 | 110 |
| `scripts/_test-md-vocab.ts` | 신규 | 250 (0원 픽스처) |
| `scripts/_bench-md-vocab-live.ts` | 신규 | 180 (실콜) |

#### A-2. 마크다운 출력 계약 — 프롬프트 "## 출력 형식" 블록 전문

```
## 출력 형식 (마크다운 — 이 형식 그대로, 다른 말 붙이지 마라)
밑줄지문:
<지문 "전체"를 한 글자도 바꾸지 말고 그대로 옮겨 적는다. 단, 밑줄 {N}곳만
 [[a:표시어]] ~ [[{lastLabel}:표시어]] 로 감싼다. 마커 밖의 모든 텍스트는
 원문과 완전히 동일해야 한다 — 문장 추가·삭제·재배열·구두점 변경 전부 금지.>

원형·판단축:
(a) <이 자리의 원문 단어(지문 축자)> | <판단축 코드 한 글자>
(b) <원문 단어> | <코드>
{... N줄 ...}
정답: {정답 라벨 표기 — K=1이면 "(c)", K>=2면 "(b), (e)" 처럼 ", " 로 병기}
고침(c): <그 자리의 원문 단어(정답 라벨마다 1줄, 원형과 완전히 같아야 한다)>
해설: <2~3문장. 그 자리가 요구하는 의미축과 표시어가 왜 그 축을 배반하는지. 합니다체>
오답:
(a) <이 자리 단어가 문맥상 왜 적절한지 1문장>
{... N-K개. K=N 이면 이 '오답:' 섹션 자체를 쓰지 마라 ...}
```
판단축 코드 닫힌 집합: `n`=지시대상·의미장 / `v`=동작 방향·극성 / `j`=정도·평가 극성 / `d`=논리 연결(인과·양보) / `c`=연어·공기제약.

**변형 모드(synonymVariants=true)일 때 `밑줄지문:` 설명문 치환**
```
 ... 단, 밑줄 {N}곳 전부를 [[a:표시어]] 형태로 감싸되, 표시어는 **{N}곳 모두**
 원문 단어와 다른 단어여야 한다. 비정답 {N-K}곳은 그 자리에 완벽히 들어맞는
 근접 동의어(품사·굴절·수·시제·연어 동일)로, 정답 {K}곳은 문맥상 틀린 단어로
 바꿔라. 비정답 동의어가 어떤 정답 자리의 원문 단어와 같으면 실격이다.
```

#### A-3. 프롬프트 골격 (정본 수사 번역)

```
① 롤: "너는 대한민국 수능 영어영역 어휘 문항을 20년 출제해 온 최정상 출제위원이다."
② 헤드라인(난이도 3분기):
   BASIC        "문맥을 한 문장 안에서 확인하면 판별되는 정확한 어휘 문항"
   INTERMEDIATE "앞뒤 두 문장의 논리 방향을 대조해야 드러나는 어휘 문항"
   KILLER       "밑줄 다섯(이상) 하나하나에 출제 의도가 박힌 아름다운 킬러 문항.
                 학생이 어느 자리에서 표면 매칭으로 뚫으려 할지 계산하고
                 그 머리 꼭대기에서 설계하라."
③ few-shot: 검증 통과 실물 1건 해부 — 표적 자리 / 왜 그 단어여야 하는가(의미축) /
   오용어가 왜 '고치고 싶어지는' 형태인가 / "이 설계가 아름다운 이유" 1문장.
   ※ "예시의 지문·표현을 복사하지는 마라" 병기. 비KILLER 는 few-shot 생략(어법 빌더 선례 prompts.ts:386-389).
④ 표적 설계: 밑줄 N곳을 지문 전역에 흩어라(한 문장에 2개 금지).
   각 자리의 원문 단어는 지문 전체에서 **단 한 번만 등장**해야 한다(위치 유일성).
   첫 문장 금지. 고유명사·숫자·기능어(관사·전치사 단독) 금지.
⑤ 오용 기제 분류학(닫힌 집합, 정답 K곳에 서로 다른 축을 배분):
   방향반전(increase↔decrease 류) / 의미장 이웃어(같은 장 다른 뜻) /
   정도·범위 이동(all↔some, always↔often) / 연어 위반(문법은 맞고 공기제약만 깨짐) /
   함축 극성(칭찬↔폄하). BASIC 만 반의어 1:1 교체 허용, INTERMEDIATE·KILLER 는 근접 오용 강제.
⑥ 마감: 즉사 오답 금지 — 비정답 N-K곳 중 최소 2곳은 상위권도 한 번은 의심하게 만들어라.
   오용어의 품사·굴절·수·시제는 원형과 동일하게(형태로 표나면 실격).
⑦ 자기검산(사고 안에서 수행, 출력 금지):
   - 밑줄지문에서 마커를 원형으로 되돌린 결과가 원문과 한 글자도 다르지 않은가
   - 각 원형이 지문에 정확히 1회 등장하는가
   - '고침(x):' 값이 '원형·판단축' 의 원형과 축자로 같은가
   - 오답 목록에 정답 라벨이 들어있지 않은가
   - 해설은 한국어만 썼는가(지문 표현 인용만 영어 허용)
⑧ 출력 형식 리터럴(위 A-2)
⑨ 지문 최후미: "## 지문\n{passage}"
```
**바이트 무회귀 패턴 적용**: `markerCount===5 && answerCount===1 && !synonymVariants` 를 "기본 경로"로 하고 그 문자열을 고정한다. 비표준은 `buildMdVocabVariantPrompt` 로 분기(`prompts.ts:416-421` 선례).
**라벨 앵커링 회피**: `정답:` 예시 라벨은 홀수 인덱스부터 뽑아 `(b), (d)` 형태로 보여준다(`prompts.ts:257-265` 선례).

#### A-4. 파서 시그니처 · 정규식

```ts
export interface MdVocabMark { label: string; original: string; shown: string; code: string; }
export interface MdVocabQuestion {
  kind: "vocab";
  markedPassage: string;
  marks: MdVocabMark[];
  answers: string[];                  // ["(b)","(e)"]
  fixes: Record<string, string>;      // "(b)" -> 원형
  explanation: string;
  wrong: MdOption[];
}
export function parseMdVocab(text: string): MdVocabQuestion;
export function autoSnapVocabMarks(q, passage): { question: MdVocabQuestion; corrections: string[] };
export function gateMdVocab(q, passage, o: { markerCount: number; answerCount: number; synonymVariants: boolean; teacherPoints?: TeacherPointPayload[] }): string[];
```

| 대상 | 정규식 |
|---|---|
| 인라인 마커 | `const INLINE_VOCAB_MARK_RE = /\[\[([a-j]):((?:(?!\]\]).)+)\]\]/g;` **matchAll 전용** |
| 밑줄지문 | `/^밑줄지문:\s*\n([\s\S]*?)(?=^원형·판단축:|^원형:)/m` |
| 원형 메타 | `/^\(([a-j])\)\s*(.+?)\s*\|\s*\(?\s*([a-z])\s*\)?(?:\s+[^|]*)?$/gm` (코드에 괄호·한글설명 드리프트 관용 — `parser.ts:186-189` 계승) |
| 정답 선행 런 | `/^\s*(\(([a-j])\)(?:\s*,\s*\([a-j]\))*)/` (`parser.ts:154-159` 계승 — `"정답: (c) — (d)는 적절"` 의 `(d)` 무시) |
| 고침 | `/^고침\(([a-j])\):\s*(.+)$/gm` + 구형 `/^고침:\s*(.+)$/m` 은 첫 정답 귀속 |
| 오답 절단 | `text.split(/^오답:\s*$/m)[1] ?? text.split(/^오답:/m)[1] ?? ""` |
| 오답 항목 | `/^\(([a-j])\)\s*(.+)$/gm` **+ 정답 라벨 필터** (`parser.ts:84-88` 계승) |

#### A-5. 게이트 불변식 (재시도 유발)

| # | 검사 | 모드 |
|---|---|---|
| 1 | `marks.length === markerCount` — **불일치 시 즉시 return**(단독) | 공통 |
| 2 | **재구성 대조**: 마커를 `original` 로 되돌린 지문 `normalizeWs` 비교 === 지문 | 공통 ★핵심 |
| 3 | 각 마크의 `original`·`code` 존재 (`code` 는 닫힌집합 소속) | 공통 |
| 4 | `answers.length === answerCount`, 정답 라벨 ⊂ 마커 라벨 | 공통 |
| 5 | `fixes[label]` 존재 && `normalizeWs(fixes[l]) === normalizeWs(original(l))` | 공통 |
| 6 | 정답 라벨 전부 `normalizeWs(shown) !== normalizeWs(original)` | 공통 |
| 7 | 비정답 전부 `shown === original` | **SOURCE_EXACT 전용** |
| 8 | 비정답 전부 `shown !== original` | **SYNONYM_VARIANT 전용** |
| 9 | 비정답 `shown` 이 어떤 정답의 `original` 과 같으면 반려 | **SYNONYM_VARIANT 전용** |
| 10 | `countWordBoundaryMatches(passage, original) === 1` | 공통 |
| 11 | 라벨 순서 == 지문 등장순 `(a)(b)(c)…` | 공통 |
| 12 | `explanation` 비어있지 않음 | 공통 |
| 13 | `wrong.length === markerCount - answerCount` (K=N 이면 0 허용) | 공통 |
| 14 | 오답 목록에 정답 라벨 없음 | 공통 |
| 15 | 교사 지정 포인트: 각 포인트가 어떤 마크의 `original` 또는 `shown` 과 포함관계 | 공통 |

⚠️ **어법의 `changed.length === answerCount`(`parser.ts:328`)를 복사하지 마라.** 변형 모드에서 100% 반려된다.
⚠️ **`autoSnapGrammarMarks` 의 v2 미끼 원형 교정을 복사하지 마라.** SOURCE_EXACT 에서만 유효하다. 변형 모드에서는 비정답의 `original ≠ shown` 이 정상이다. `autoSnapVocabMarks` 는 **SOURCE_EXACT 모드에서만** 비정답의 `original ← shown` 교정을 수행한다.

#### A-6. 어댑터 출력 필드 표 → postProcessQuestion 경계

| 필드 | 어댑터 산출 | 후처리(`processVocabChoice`)가 하는 일 |
|---|---|---|
| `direction` | K≥2 `"...적절하지 않은 것을 모두 고르시오."` / K=1 `"...적절하지 않은 것은?"` | — |
| `markedWords[].label` | `"(a)"~"(j)"` 소문자 | `normalizeVocabKey` 정규화(`:21`) |
| `markedWords[].originalWord` | `mark.original` | 지문 위치탐색 키(`:172` 실패 시 전체실패) |
| `markedWords[].substituteWord` | `mark.shown` (**전 마커 필수**) | 표시어 확정(`:182`) |
| `markedWords[].isInappropriate` | `answers.has(label)` | 최소 1 true 요구(`:117`) |
| `markedWords[].betterWord` | 정답만 `fixes[label]` | `=== originalWord` 검사(`:198`) |
| `markedWords[].surroundingText` | **밑줄지문 인라인 위치**에서 `contextAround(clean, idx, len)` | `findWordInPassage` 정확도 직결(`:152`) |
| `options[]` | `{label: mark.label, text: mark.shown}` | **label 숫자 재부여 + text 강제 덮어쓰기**(`:303-316`) |
| `vocabDisplayMode` | `synonymVariants ? "SYNONYM_VARIANT" : "SOURCE_EXACT"` | 변형 모드 가드 스위치(`:88-89`) |
| `correctAnswer` / `correctAnswers` | `answers.join(", ")` / `answers` | **숫자 문자열 재부여**(`:322`) |
| `wrongOptionExplanations` | 배열 `[{label, explanation}]` | Record 정규화(`index.ts:167`) |
| `keyPoints` | **항상 `[]`** (`adapter.ts:116-117` 결정 계승) | — |
| `passageWithMarkers` | **만들지 않는다** | 후처리 전담(`:249,:299`) |

#### A-7. 설정 집행 표

| UI 설정 키 | 프롬프트 반영 | 게이트/후처리 강제 |
|---|---|---|
| `markerCount` 5~10 (기본5) | 라벨 슬라이스, 밑줄 개수 명시, 원형 스캐폴드 N줄 | 게이트 #1 정확값 · `qualityArgs.vocabChoiceMarkerCount` |
| `answerCount` 1~marker (기본1) | 정답 라인 형식(K=1 단일 / K≥2 `", "` 병기), 고침 K줄, K=N 이면 오답 섹션 생략 | 게이트 #4/#5/#13 · `qualityArgs.vocabChoiceAnswerCount` |
| `synonymVariants` (기본false) | `밑줄지문:` 설명문 치환 + 근접 동의어 절 | 게이트 #7↔#8 분기, #9 · 어댑터 `vocabDisplayMode` |
| `difficulty` | 헤드라인·표적설계·오용기제 3분기 | `qualityArgs` 미전달(라우트가 `requestedDifficulty` 로 이미 전달) |
| `stemLanguage` (기본ko) | `buildQuestionLanguageSettingsPrompt` 블록 | `qualityArgs.stemLanguage` |
| `teacherPoints` (max=markerCount) | `buildTeacherPointsPromptBlock`(라우트가 붙임) | 게이트 #15 |
| `pointFocus` | **없음** — resolved 에 `vocabChoicePointFocus` 키 부재(V10) | — |

#### A-8. 검증
1. `npx tsx scripts/_test-md-vocab.ts` — 0원 픽스처: 5·1 SOURCE_EXACT / 8·2 / 10·3 / 5·1 SYNONYM_VARIANT / 변형모드 정답누출 반려 / 재구성 불일치 반려 / 원형 2회 등장 반려. 각 케이스 **파서→스냅→게이트→어댑터→`postProcessQuestion`→`validateQuestionQuality`** 전 구간 통과 확인.
2. `npx tsx scripts/_bench-md-vocab-live.ts` — `_bench-md-multi-live.ts` 구조 복제, 실지문 1개 × {5·1, 8·2, 5·1변형} 각 1콜.
3. 기존 회귀: `node --test tests/unit/vocab-choice-contract.test.mjs tests/unit/vocab-choice-variant.test.mjs tests/unit/vocab-substitution-seam.test.mjs`

---

### 3-B. GRAMMAR_CHOICE_COMBO (네모 어법) — 담당 에이전트 **[COMBO]**

#### B-1. 소유 파일
`prompts-combo.ts`(230) / `parser-combo.ts`(210) / `adapter-combo.ts`(140) / `lane-combo.ts`(90) / `scripts/_test-md-combo.ts`(230) / `scripts/_bench-md-combo-live.ts`(170)

#### B-2. 마크다운 출력 계약

```
## 출력 형식 (마크다운 — 이 형식 그대로, 다른 말 붙이지 마라)
네모지문:
<지문 "전체"를 한 글자도 바꾸지 말고 그대로 옮겨 적는다. 단, 네모 3곳만
 [[A:올바른표현|틀린표현]] ~ [[C:올바른표현|틀린표현]] 로 감싼다.
 파이프 왼쪽이 반드시 원문 축자(어법상 옳은 표현), 오른쪽이 변형(틀린 표현)이다.
 마커 밖의 모든 텍스트는 원문과 완전히 동일해야 한다.>

원형·포인트:
(A) <올바른 표현(원문 축자)> | <틀린 표현> | <포인트코드 a~m 한 글자>
(B) <올바른 표현> | <틀린 표현> | <코드>
(C) <올바른 표현> | <틀린 표현> | <코드>

선지:
① <A값> …… <B값> …… <C값>
② <A값> …… <B값> …… <C값>
③ <A값> …… <B값> …… <C값>
④ <A값> …… <B값> …… <C값>
⑤ <A값> …… <B값> …… <C값>
정답: <①~⑤ 하나 — 세 네모 전부 올바른 표현인 유일한 조합>
해설: <(A)→(B)→(C) 순서로 각 네모의 올바른 표현이 왜 옳은지. 합니다체>
오답:
① <이 조합의 어느 네모에서 어떤 값이 왜 틀렸는지 1문장>
{... 정답 번호 제외 4개 ...}
```
**구분자 결정 근거**: 프로덕션 정본 joiner 는 `" - "`(`grammar-choice-combo.ts:22`)이나 후보에 하이픈(`well-being`, `non-finite`, en-dash)이 들어가면 분해가 깨진다. md 단계는 다중빈칸 계약 리터럴 ` …… `(`prompts.ts:198`·`parser.ts:117`)를 재사용하고, 어댑터가 `" - "` 로 재조립한다. 후처리가 어차피 `slotValues` 로 text 를 재조립하므로(`:295`) 안전.

#### B-3. 프롬프트 골격
- 롤/헤드라인/자기검산은 §3-A 와 동형.
- **few-shot 은 신규 수집 필요** — 콤보는 어법 프리미엄 사다리(`run-question-generation.ts:1194-1206`, `GRAMMAR_ERROR` 단독) 대상이 아니라 A등급 실물 코퍼스가 없다. `question-prompts-mc.ts:235-308` 의 검증된 서사(출제철학·슬롯선정·wrong 11종·약한 네모 금지·정동사 자리 금지·조합 규칙)를 md 공예 문체로 증류해 대체한다.
- 미끼 축: "틀린 표현이 왜 **고치고 싶어지는** 형태인가" — 세 네모의 오인 축을 서로 다르게. 관성 미끼(어느 지문에나 붙는 자리) 최대 1개.
- 조합 믹스 규칙: 1슬롯 오답 1~2 + 2슬롯 오답 1~3 + 3슬롯 오답 0~1, 각 슬롯 wrong 이 오답 선지에 최소 1회 등장, **1슬롯만 틀린 near-miss 최소 1개**(`question-prompts-mc.ts:276`).
- `buildGrammarPointGuidance({pointFocus:true})` 를 `buildExtras` 에서 **그대로 재사용**(`grammarPointFocus` resolved 키, V10 확정).

#### B-4. 파서

```ts
export interface MdComboSlot { label: string; correct: string; wrong: string; code: string; }
export interface MdComboQuestion {
  kind: "combo";
  markedPassage: string;
  slots: MdComboSlot[];
  options: { label: string; values: string[] }[];
  answer: string;
  explanation: string;
  wrong: MdOption[];
}
export const COMBO_MARK_RE = /\[\[([A-C]):((?:(?!\]\]|\|).)+)\|((?:(?!\]\]).)+)\]\]/g;
export function parseMdCombo(text: string): MdComboQuestion;
export function gateMdCombo(q, passage, o: { teacherPoints?: TeacherPointPayload[] }): string[];
```
| 대상 | 정규식 |
|---|---|
| 네모지문 | `/^네모지문:\s*\n([\s\S]*?)(?=^원형·포인트:)/m` |
| 메타 | `/^\(([A-C])\)\s*(.+?)\s*\|\s*(.+?)\s*\|\s*\(?\s*([a-m])\s*\)?(?:\s+[^|]*)?$/gm` |
| 선지 | `/^([①②③④⑤])\s*(.+)$/gm` → `.split(/\s*……\s*/)` |
| 정답/해설/오답 | `parseMdBlank`(`parser.ts:83,95,82`) 와 동일 정규식 |

#### B-5. 게이트 불변식
1. 마커 정확히 3개, 라벨 `A,B,C`, **지문 등장순**, 중복 없음
2. **재구성 대조** — `correct` 로 되돌린 지문 === 지문 (`parser.ts:293-302` 등가) ★
3. `normalizeWs(correct) !== normalizeWs(wrong)` (후처리 `:131-138` 선반영)
4. 후보에 `/`, `[`, `]`, `|`, `……` 미포함 (후처리 `:139-147` + md 구분자 보호)
5. 슬롯 구간 비중첩 (후처리 `:182-194`)
6. `code ∈ a~m`, 3개 서로 다름 — **fast 는 warning 이나 md 는 error 승격**
7. 선지 5개, 각 `values.length === 3`, 빈 값 없음
8. 각 값이 해당 슬롯의 두 후보 중 하나와 정규화 일치 (후처리 하드실패 `:284-291` 선반영)
9. 전부-correct 조합이 **정확히 1개**, 그 라벨 === `정답:` 라벨 ★ (후처리 `:327-332` 는 경고만 내고 자동교정하므로 여기서 안 잡으면 오지정이 은폐된다)
10. 조합 중복 0
11. 각 슬롯 wrong 이 오답 선지에 1회 이상 + near-miss(1슬롯만 오답) ≥1
12. 오답해설 4개, 정답 라벨 미포함
13. **누설 검사** — 각 후보(및 직전 단어 연어)가 네모 밖 지문에 재등장하지 않음. `validators/grammar/combo.ts:262-301`(fast 의 4대 error `combo-candidate-visible-elsewhere`) 로직 이식 ★
14. 주격 관계대명사 직후 준동사 후보 금지 (`combo.ts:306-319`)
15. 교사 포인트: 각 포인트가 어떤 슬롯의 `correct` 와 포함관계 (`point-picker-config.ts:320-322` 계약)

#### B-6. 어댑터 → 후처리 경계

| 필드 | 어댑터 | 후처리(`processGrammarChoiceCombo`) |
|---|---|---|
| `direction` | `"(A), (B), (C)의 각 네모 안에서 어법에 맞는 표현으로 가장 적절한 것은?"` | — |
| `slots[].label` | `"(A)"~"(C)"` | **지문 등장순 재부여**(`:196-209`) + 해설 라벨 재매핑(`@@GLBL`, `:220-227`) |
| `slots[].correctExpression` / `wrongExpression` | 축자 | 위치탐색(`:150`)·단어경계 확장(`:75`) |
| `slots[].surroundingText` | 네모지문 인라인 위치 기반 `contextAround` | 위치탐색 보조 |
| `slots[].pointCode` | `POINT_NAME[code] ? code : "a"` | — |
| `options[].label` | **`digitOptionLabel(①) → "1"`** ★ | 재부여(`:294`) |
| `options[].text` | `values.join(" - ")` | 재조립(`:296`) |
| `options[].slotValues` | `values` (3개) | 라벨 재부여에 맞춰 **재배열**(`:276`) |
| `correctAnswer` | `digitOptionLabel(answer)` | 유일 조합으로 재계산(`:319-326`) |
| `passageWithMarkers` | **만들지 않는다** | `(A) [좌 / 우]` 결정형 생성 + 해시 좌우 배치(`:50-55, :230-242`) ★ |
| `keyPoints` | `[]` | — |

#### B-7. 설정 집행 표
| 설정 | 프롬프트 | 게이트/후처리 |
|---|---|---|
| **개수 노브 없음** — 3슬롯·5선지 하드코딩 (`question-ai-schemas-mc.ts:435,450`, `grammar-choice-combo.ts:19-22`, `combo.ts:149,334`) | 리터럴 고정 | 게이트 #1/#7 |
| `pointFocus` (기본true) | `buildGrammarPointGuidance({pointFocus})` | — |
| `difficulty` | 헤드라인·표적·미끼 3분기, KILLER 는 `question-prompts-mc.ts:281` 3조건 병합 | `requestedDifficulty` |
| `stemLanguage` | 언어 블록 | `qualityArgs.stemLanguage` |
| `optionLanguage` | **토글 미노출**(`language.ts:14-15`) — 프롬프트 언급 금지 | — |
| `teacherPoints` (max 3) | 공유 블록 | 게이트 #15 |

`isEligible` = **항상 true** (설정 노브 없음). `retryEligible` = **true**.
`qualityArgs` = `{ stemLanguage, optionLanguage }` 만 (dispatcher 는 COMBO 에 `requestedDifficulty` 외 인자 불요, `dispatcher.ts:1158-1160`).

#### B-8. 검증
1. `npx tsx scripts/_test-md-combo.ts` — 정상 1건 + 각 게이트 불변식 반려 케이스 15건.
2. **셔플 상호작용 필수 검증**: COMBO 는 `SHUFFLE_OPTION_TYPES` 멤버(V3 확정). 픽스처에서 `shuffleQuestionOptionsForDiversity(pp.data, "GRAMMAR_CHOICE_COMBO")` 를 태운 뒤 **`options[i].slotValues` 가 `options[i].text` 와 여전히 동행하고 `correctAnswer` 가 정답 조합을 가리키는지** 단정할 것. 어긋나면 즉시 보고(라우트 `:1014` → `:1018` 순서 문제).
3. `npx tsx scripts/_bench-md-combo-live.ts` — 실지문 2개 × 각 1콜, 타임아웃(현행 증상 B)이 사라졌는지 초 단위 기록.
4. 회귀: `node --test tests/unit/grammar-choice-combo-contract.test.mjs`

---

### 3-C. SENTENCE_ORDER (글의 순서) — 담당 에이전트 **[ORDER]**

#### C-1. 소유 파일
`prompts-order.ts`(240) / `parser-order.ts`(240) / `adapter-order.ts`(130) / `lane-order.ts`(100) / `scripts/_test-md-order.ts`(260) / `scripts/_bench-md-order-live.ts`(170)

**⚠️ 이 유형만 후처리가 없다** (`PASSTHROUGH_TYPES` V8 확정). 어댑터가 **완제품**을 내야 한다.

#### C-2. 마크다운 출력 계약

```
## 출력 형식 (마크다운 — 이 형식 그대로, 다른 말 붙이지 마라)
주어진글: <지문 맨 앞 1~2문장을 한 글자도 바꾸지 말고 그대로. 개행 없이 한 줄.>
단락(A): <원문의 연속 구간을 그대로. 2문장 이상. 개행 없이 한 줄.>
단락(B): <원문의 연속 구간을 그대로. 2문장 이상. 개행 없이 한 줄.>
단락(C): <원문의 연속 구간을 그대로. 2문장 이상. 개행 없이 한 줄.>
① (A)-(B)-(C)
② (A)-(C)-(B)
③ (B)-(A)-(C)
④ (B)-(C)-(A)
⑤ (C)-(A)-(B)
정답: <①~⑤ 하나>
해설: <2~3문장. 각 이음매에서 어떤 응집장치(시간 순서·대용어·대조 전환)가
       순서를 확정하는지 지목. 합니다체>
오답:
① <이 순열이 어느 이음매에서 왜 깨지는지 1문장>
{... 정답 번호 제외 4개 ...}
```
**중요 계약 3가지**
- `주어진글:` + `단락(A)(B)(C)` 를 **원문 위치순으로 이어붙이면 지문 앞부분과 정합**해야 한다(무손실 분할).
- `단락(X):` 라벨은 지문 등장순이 아니라 **제시 순서**다. 정답 순열이 등장순을 복원한다.
- 선지 5개는 6개 순열 중 5개. **`(A)-(B)-(C)` 는 정답이 될 수 없다**(`validators/sentence-order.ts:963`).

#### C-3. 프롬프트 골격
- 롤/헤드라인/자기검산 동형.
- **공짜 소거 금지** (실측 fatal 직대응, `question-prompts-mc.ts:363-365`): 어떤 단락의 첫 문장이 미해소 대용어·연결사(`However/Therefore/Thus/Instead/This/These/Such/It/They`)로 시작하면 **그 단락을 맨 앞에 두는 순열을 선지에 넣지 마라**. 또는 절단 위치를 조정해 각 단락 첫 문장을 자립화하라.
- **정답 유일성 2단서 수렴**(`:366`): 정답 순서는 서로 다른 응집단서 최소 2개(대명사 사슬 + 어휘 사슬 / 일반→구체 + 시간순서)가 수렴해야 한다. 오답은 표면 응집 훑기로는 통과하되 내용 논리로만 걸러지게.
- **분량 균형**: 세 단락 단어수 max/min ≤ 1.9, 주어진글/세단락평균 ≤ 1.3 (`validators/sentence-order.ts:14,17`).
- `buildSentenceOrderPointGuidance` (`sentence-order-point-catalog.ts:152`) 를 `sentenceOrderPointFocus` 시 `buildExtras` 로 주입. 코어 3종(temporal_sequence 42.9% / anaphora_reference 24% / contrast_reversal 15.5%, 누적 82.4%).
- **단락은 반드시 한 줄로** 명시(개행 유혹이 큰 유형).

#### C-4. 파서

```ts
export interface MdOrderQuestion {
  kind: "sentenceOrder";
  given: string;
  paragraphs: { label: string; text: string }[];   // label = "(A)"|"(B)"|"(C)"
  options: { label: string; text: string; order: string[] }[];
  answer: string;
  explanation: string;
  wrong: MdOption[];
}
export function parseMdSentenceOrder(text: string): MdOrderQuestion;
export function autoSnapOrderParagraphs(q, passage): { question; corrections: string[] };
export function gateMdSentenceOrder(q, passage, o: { teacherPoints?: TeacherPointPayload[] }): string[];
```
| 대상 | 정규식 |
|---|---|
| 주어진글 | `/^주어진글:\s*(.+)$/m` |
| 단락 | `/^단락\(([A-C])\):\s*(.+)$/gm` (다중빈칸 `parser.ts:106` 패턴 계승) |
| 단락 관용 흡수 | 위 매칭 실패 시 `/^단락\(([A-C])\):\s*([\s\S]*?)(?=^단락\([A-C]\):|^[①②③④⑤]|^정답:)/gm` 로 폴백(개행 드리프트) |
| 선지 | `/^([①②③④⑤])\s*(.+)$/gm` → `[...text.matchAll(/[（(]\s*([ABC])\s*[）)]/g)]` (로컬 복제 — `validators` 재사용 금지, 레이어 분리) |
| 정답/해설/오답 | `parseMdBlank` 동일 |

`snapExpressionSpan`(PRE-1a 로 export) 로 단락 선/후행 공백·구두점 드리프트 스냅.

#### C-5. 게이트 불변식
1. `paragraphs.length === 3`, 라벨이 **리터럴 문자열** `"(A)"`,`"(B)"`,`"(C)"`
2. `given` 비어있지 않음, 1~2문장, ≤70단어
3. `given` 에 `(A)`/`(B)`/`(C)` 라벨 미포함
4. 단락 본문 선두에 순서표식(`1.`/`②`/`(2)`) 없음, 본문 내 `(A)` 재등장 없음
5. 각 단락 ≥2문장, ≥24단어
6. **원문 축자 분할**: `foldForSourceMatch`(alnum+공백만, `validators/sentence-order.ts:678-682` 로직을 parser-order.ts 에 **복제**) 후 각 단락이 접힌 지문의 substring ★
7. **비중첩 + 무손실**: 세 단락 span 을 원문 위치순 정렬 시 인접 갭 0토큰, 중첩 0
8. **`given` 축자**: `prefixVariationCount === 0` 이므로 md 레인은 given 도 축자 강제(구형은 대조 안 함 — **md 의 품질 도약**)
9. `given` span 이 세 단락 span 전부보다 앞
10. **정답 결정론 도출 대조** ★: span 위치로 정답 순열을 서버가 계산하고 모델의 `정답:` 라벨과 대조. 불일치 → 반려. (구형은 스키마 신뢰 — md 만 가능한 도약)
11. 선지 5개, 각 순열 유효(A/B/C 각 1회), 순열 중복 없음
12. 정답 순열 ≠ `(A)-(B)-(C)`
13. 분량 균형 max/min ≤ 1.9, given/avg ≤ 1.3
14. 오답해설 4개, 정답 라벨 미포함
15. 교사 포인트: `sentenceOrderComplies` 등가 — 지정 문장이 given 과 겹치거나 어떤 단락의 startsWith/endsWith (`point-picker-config.ts:346-362`)
16. (warning→실측 후 승격) 단락 첫 문장이 미해소 대용어로 시작하면 그 라벨-first 순열이 선지에 없어야 함

#### C-6. 어댑터 출력 (완제품 — 후처리 없음)

| 필드 | 값 | 소비처 |
|---|---|---|
| `direction` | `"주어진 글 다음에 이어질 글의 순서로 가장 적절한 것은?"` | 렌더러 `question-type-renderers.tsx:242` |
| `givenSentence` | `q.given` | `GivenSentenceBox` |
| `paragraphs[]` | `{label: "(A)", text}` × 3 — **리터럴 라벨 필수** | 렌더러 `:257` 원문 그대로 출력 |
| `options[]` | `{label: digitOptionLabel(①)="1", text: "(A)-(C)-(B)"}` × 5 ★ | `OptionList` |
| `correctAnswer` | `digitOptionLabel(answer)` | 채점 `answer-spec.ts` SIMPLE_SINGLE_CHOICE |
| `wrongOptionExplanations` | 배열 → 후처리 공통 정규화가 Record 로 | |
| `explanation` / `keyPoints: []` / `tags: []` / `difficulty` | | |
| `passageWith*` 계열 | **만들지 않는다** (`passage-policy` embedded 아님, 지문 필드 없는 유형) | |

**⚠️ questionText 역파싱 계약**: DOCX 는 `sentenceOrderSegmentsFromQuestionText(questionText)` 로 문자열을 역파싱한다(`export-docx/.../question.ts:464-504`). `buildGeneratedQuestionText`(`question-generation-persistence.ts:102-117`)가 `[주어진 문장] {given}` + `(A) {text}` 개행 join 을 만드는 것이 계약이므로, **어댑터 필드명이 정확히 `givenSentence`·`paragraphs`여야** 한다.

#### C-7. 설정 집행 표
| 설정 | 프롬프트 | 게이트/적격성 |
|---|---|---|
| `prefixVariationCount` 0~3 (기본0) | **Phase 1: 0 만 지원** | `isEligible` = `count === 0`. ≥1 → `MD_STREAM_INELIGIBLE` → fast(현행 유지, 아래 §4-C 참조) |
| `pointFocus` (UI 미노출 좀비) | `buildSentenceOrderPointGuidance` | — |
| `difficulty` | 헤드라인·응집단서 밀도 3분기 | `requestedDifficulty` |
| `stemLanguage` | 언어 블록 | `qualityArgs.stemLanguage` |
| `teacherPoints` (unit=sentence, max 3) | 공유 블록 | 게이트 #15 |
| **preflight** | — | 라우트 `:520` 가 이미 호출(과금 전). md 승차해도 그대로 작동 |

`retryEligible` = **true** (축자 분할 게이트가 빡세 1차 반려율이 있을 것). `qualityArgs` = `{ stemLanguage, optionLanguage }`.

#### C-8. 검증
1. `npx tsx scripts/_test-md-order.ts` — 정상 1건 + 게이트 16종 반려 케이스 + **DOCX 역파싱 왕복 테스트**(`buildGeneratedQuestionText` → `sentenceOrderSegmentsFromQuestionText` 결과가 원 `paragraphs` 와 일치).
2. `npx tsx scripts/_bench-md-order-live.ts` — 실지문(7문장 이상) × 2건.
3. 회귀: `node --test tests/unit/sentence-order-quality.test.mjs tests/unit/w2d-sentence-order-coverage-placement.test.mjs`

---

### 3-D. ANTONYM (반의어) — 담당 에이전트 **[ANTONYM-GEN]**
### + 라벨 표시 수정 — 담당 에이전트 **[ANTONYM-UI]** (파일 겹침 없음, 완전 병렬)

#### D-1. 소유 파일

**[ANTONYM-GEN]** `prompts-antonym.ts`(220) / `parser-antonym.ts`(200) / `adapter-antonym.ts`(140) / `lane-antonym.ts`(90) / `scripts/_test-md-antonym.ts`(230) / `scripts/_bench-md-antonym-live.ts`(170)

**[ANTONYM-UI]** (§4-A 참조) `option-display.ts` / `question-type-renderers.tsx` / `render-model.ts` / `marker-render-scheme.ts` / `exam-inline.tsx`(주석만)

#### D-2. 마크다운 출력 계약

```
## 출력 형식 (마크다운 — 이 형식 그대로, 다른 말 붙이지 마라)
밑줄지문:
<지문 "전체"를 한 글자도 바꾸지 말고 그대로 옮겨 적는다. 단, 대상 단어 {N}곳만
 [[A:단어]] ~ [[{lastLabel}:단어]] 로 감싼다. 마커 안 단어는 원문 축자 그대로다
 — 굴절형·대소문자까지 원문과 완전히 같아야 한다(변형 절대 금지).
 마커 밖의 모든 텍스트도 원문과 완전히 동일해야 한다.>

짝:
(A) <원문 단어> - <선지에 표시할 짝 단어> | <O 또는 X> | <X 인 줄만: 실제 문맥 반의어>
(B) <원문 단어> - <짝 단어> | <O>
{... N줄. X 는 정확히 1줄 ...}
정답: <(A)~ 중 X 표시한 그 라벨 하나>
해설: <2문장. 그 단어의 지문 속 의미축과 짝 단어가 왜 그 축의 반대가 아닌지. 합니다체>
오답:
(A) <이 쌍이 지문 문맥에서 왜 정확한 반의 관계인지 1문장>
{... 정답 라벨 제외 N-1개 ...}
```

#### D-3. 프롬프트 골격
- 롤/헤드라인/자기검산 동형. `question-prompts-vocab.ts:51-78` 의 서사(표적 선정·오축 다의어 함정·근접 뉘앙스 함정)는 이미 md 급 품질이므로 **그대로 이식**.
- **후보 가드레일 필수 주입**: `buildAntonymCandidateBlock`(`candidate-blocks/antonym.ts:117-147`, `ANTONYM_SAFE_LEXICON` 47엔트리)을 `buildExtras` 에서 append. 안 실으면 금지 쌍(force↔restrain 류)이 재출현한다. lib→lib 이므로 레이어 규칙 위반 없음.
- **오류쌍 설계**: 반의가 아니라 (i) 같은 의미장 이웃어를 반의로 위장, (ii) 다의어의 **다른 뜻**의 반의어(지문 문맥의 뜻이 아닌 것), (iii) 정도만 다른 유의어. 표면 반의 사전에 실릴 법한 쌍은 금지.

#### D-4. 파서
```ts
export interface MdAntonymPair {
  label: string; word: string; antonym: string;
  isIncorrect: boolean; correctAntonym?: string;
}
export interface MdAntonymQuestion {
  kind: "antonym"; markedPassage: string; pairs: MdAntonymPair[];
  answer: string; explanation: string; wrong: MdOption[];
}
export const INLINE_ANTONYM_MARK_RE = /\[\[([A-J]):((?:(?!\]\]).)+)\]\]/g;
export function parseMdAntonym(text: string): MdAntonymQuestion;
export function autoSnapAntonymPairs(q, passage): { question; corrections: string[] };
export function gateMdAntonym(q, passage, o: { pairCount: number; teacherPoints?: TeacherPointPayload[] }): string[];
```
| 대상 | 정규식 |
|---|---|
| 밑줄지문 | `/^밑줄지문:\s*\n([\s\S]*?)(?=^짝:)/m` |
| 짝 | `/^\(([A-J])\)\s*(.+?)\s*-\s*(.+?)\s*\|\s*([OXox])\s*(?:\|\s*(.+?)\s*)?$/gm` |
| 정답 선행 런 | `/^\s*\(([A-J])\)/` (단일 정답 고정) |
| 오답/해설 | `parseMdBlank` 동일 + 정답 라벨 필터 |

`INLINE_MARK_RE` 를 `parser.ts` 에서 그대로 import 해도 되지만(둘 다 `[A-J]`), **전역 정규식 lastIndex 공유 위험**이 있으므로 로컬 상수를 별도 선언한다(matchAll 전용이라도 안전 우선).

#### D-5. 게이트 불변식
1. `pairs.length === pairCount` — 즉시 return
2. **재구성 대조** — 마커 내용으로 되돌린 지문 === 지문 ★
3. **변형 0**: 각 마커 내용 === `pairs[i].word` 축자 동일 (어법의 `changed === answerCount` 의 **반대 계약**)
4. 라벨 순서 == 지문 등장순 `(A)(B)(C)…`
5. `pairs.filter(isIncorrect).length === 1` (`processors/antonym.ts:109` 정합)
6. `정답:` 라벨 === `isIncorrect` 라벨 (`:190-199` 정합)
7. `isIncorrect` 쌍만 `correctAntonym` 보유 (없으면 반려 / 비오류쌍이 가지면 반려 — `validators/antonym.ts:226-256`)
8. `word !== antonym`, `word !== correctAntonym` (`:208`,`:230`)
9. `countWordBoundaryMatches(passage, word) === 1`
10. `explanation` 비어있지 않음
11. `wrong.length === pairCount - 1`, 정답 라벨 미포함
12. **표면형 정합**: `findAntonymSurfaceFormIssue`(`validators/antonym.ts:262-311`) 로직을 게이트로 **승격 이식** — md 는 검증기 결과를 차단하지 않으므로(라우트 `:1018`) 여기서 안 잡으면 결함이 출하된다 ★
13. 교사 포인트: 각 포인트가 어떤 쌍의 `word` 와 포함관계 (`point-picker-config.ts:337-339`)

**오토스냅**: `snapSpanNearAnchor` 는 다단어 구 전용(`parser.ts:489` `words.length < 2` 포기)이라 단일 토큰인 반의어에 부적합. 대신 **`짝:` 의 `word` 가 마커 내용과 다르면 마커 내용을 진실원으로 채택**(위치가 지문에 이미 확정) — `autoSnapGrammarMarks` v2 분기(`:541-557`)와 동일 사상.

#### D-6. 어댑터 출력 → `processAntonym` 경계

| 필드 | 어댑터 | 후처리 |
|---|---|---|
| `direction` | `"다음 글의 밑줄 친 단어와 짝지어진 단어의 반의어 관계가 바르지 않은 것은?"` | — |
| `markedWords[].label` | **`"(A)"` 대문자 축 — 절대 ① 로 내지 마라** ★ | `canonicalAntonymLabel`(`:39-42`) |
| `markedWords[].word` | 마커 내용(원문 축자) | `findWordInPassage`(`:152`), 실패 시 전체실패 |
| `markedWords[].antonym` | 짝 단어 | 선지 텍스트 재생성 소스(`:202-205`) |
| `markedWords[].isIncorrectPair` | `O/X` | 정확히 1개 true 요구(`:109`) |
| `markedWords[].correctAntonym` | 오류쌍만 | 필수 검사(`:143`) |
| `markedWords[].surroundingText` | 밑줄지문 인라인 위치 `contextAround` | 위치탐색 |
| `correctAnswer` | **`String(incorrectIndex + 1)` 숫자 문자열** ★ | `answerIndices[0] === incorrectIndex` 검사(`:192`) → 재부여(`:211`) |
| `options[]` | **만들지 않아도 됨**. 낼 경우 `{label: String(i+1), text: "word - antonym"}` — **`(A) ` 접두 금지** ★ | 전량 재생성(`:202-205`) |
| `wrongOptionExplanations` | `{label: String(idx+1), explanation}` 배열 | Record 정규화 |
| `keyPoints: []` / `tags: []` / `difficulty` | | |
| `passageWithMarkers` | **만들지 않는다** | `__(A) word__` 생성(`:163-164`) |
| **빈칸 계열 필드** | **절대 금지** — `blanks`/`passageWithBlank`/`originalExpression` 을 흘리면 `type-foreign-field` error (`validators/misc.ts:32`) ★ | |

#### D-7. 설정 집행 표
| 설정 | 프롬프트 | 게이트/적격성 |
|---|---|---|
| `pairCount` 5~10 (기본5) | 라벨 슬라이스, 짝 스캐폴드 N줄, 오답 N-1개 | `isEligible` = `5<=n<=10` · 게이트 #1 · `qualityArgs.antonymPairCount` ★ (후처리는 5~10 범위만 보고 실값 미검사 — 게이트가 유일 방벽) |
| **정답 개수 고정 1** | 리터럴 | 게이트 #5 |
| `difficulty` | 함정 유형 3분기 | `requestedDifficulty` |
| `stemLanguage` | 언어 블록 | `qualityArgs.stemLanguage` |
| `teacherPoints` (max=pairCount) | 공유 블록 | 게이트 #13 |
| **과금** | — | `lane.operationType = "QUESTION_GEN_VOCAB"` ★★ (S5) |

`retryEligible` = **true**. `diversityTargets` = `markedWords[].word`.

#### D-8. 검증
1. `npx tsx scripts/_test-md-antonym.ts` — 정상 5쌍/8쌍/10쌍 + 게이트 13종 반려 + **어댑터→`processAntonym` 왕복 형상 단정**(`passageWithMarkers` 가 `__(A) word__` 로 나오고 `correctAnswer` 가 숫자인지).
2. **과금 회귀 단정**: `lane.operationType === "QUESTION_GEN_VOCAB"` 및 `CREDIT_COSTS[operationType] === 1` 을 픽스처에서 assert.
3. `npx tsx scripts/_bench-md-antonym-live.ts`
4. 회귀: `node --test tests/unit/antonym-contract.test.mjs tests/unit/antonym-surface-form.test.mjs`

---

## 4. 장애 즉시 수정 항목 (md 승차와 독립 · 병렬 가능)

### 4-A. 【증상 D】반의어 ① 라벨 — 담당 **[ANTONYM-UI]**

**원칙: 저장 축 `(A)` 불변, 표시 시점만 변환** — `GRAMMAR_ERROR` 선례 그대로(`question-type-renderers.tsx:130` 주석, `primitives.tsx:312` 주석).

**하위호환 근거**: 저장 축을 ① 로 바꾸면 `validators/antonym.ts:93`(`/^\(([A-Ja-j])\)\s*(.+)$/`, 원형숫자 미지원)과 `question-sets/anchor-extraction.ts:183-196` 이 **기존 DB 문항에서 즉시 깨진다.** 절대 금지.

| # | 파일:줄 | 조치 | 커버 범위 |
|---|---|---|---|
| **P1** | `src/components/exams/paper-builder/option-display.ts:125-142` 를 복제해 `formatAntonymPassageMarkers(text, subType)` 신설 + `:234-248` `formatInlineMarkersForSubtype` 체인에 5번째 래퍼로 추가 | `if (subType !== "ANTONYM") return text;` 후 `__(A) w__` → `__① w__` | **A4 시험지 · DOCX(`build-question.ts:79`, `build-builder-document/question.ts:54`) · HWPX(`render/fragment.ts:430/466/470`, `render/question.ts:325`) · 태블릿 응시면(`exam-inline.tsx:33`) · 페이지네이션 계측 — 한 방에 전부** |
| **P2** | `src/components/workbench/question-type-renderers.tsx:815` | `renderPassageFormatted(q.passageWithMarkers)` → `renderPassageFormatted(formatInlineMarkersForSubtype(q.passageWithMarkers, "ANTONYM"))` (import 는 `:62` 에 이미 존재) | 문제관리 카드 지문 |
| **P3** | `src/components/exams/paper-builder/render-model.ts:502-505` | `` `(${VERIFY_LABELS[ordinal]}) ${it.word} - ${it.antonym}` `` → `` `${it.word} - ${it.antonym}` `` (**라벨 참조 제거** — 선지 라벨은 `:791`/`a4-paper-page.tsx:1316 optionDisplayLabel` 이 이미 ① 을 그린다. 중복 제거가 수능 표기에 맞다) | 카드·시험지·DOCX·HWPX 선지 텍스트 |
| **P4** | `question-type-renderers.tsx:827` | `{mw.label}` → `{grammarMarkerDisplayLabel(mw.label)}` (`:166` 동형) | 카드 분석 블록 |
| **P5** | `question-type-renderers.tsx:811` 상단 | `circleGrammarLabelMentions(q.explanation)` / `circleGrammarWrongOptionExplanations(...)` 적용(`:132-142` 동형) | 해설 프로즈 속 `(A)` |
| **P6** | `marker-render-scheme.ts:66-68` | `passageMarker: "alpha-paren"` → `"circled-num"`, `optionList: "circled-num"`, 주석 갱신 | **동작 무변경**(글리프를 읽는 코드 없음 — `serializeNormalizedMarkedPassage:592-606` 가 하드코딩). 정책 테이블 동기화 목적 |
| **P7** | `src/app/t/[token]/taking-parts/exam-inline.tsx:14-15` | 주석 정정("ANTONYM 은 convert set 밖" → 이제 안) | 문서 |

**P1+P2+P3 만으로 사용자가 본 두 증상이 전 표면에서 사라진다.**
**절대 금지**: `processors/antonym.ts:97,163-164`(저장) · `validators/antonym.ts:93`(파싱).

### 4-B. 【증상 A】어휘 느림 — 승차 전 완화책 (1줄, **A/B 없이 배포 금지**)

`src/lib/question-generation-prompt-contract.ts:173-176` `CONTRACT_TYPE_SECTIONS` 에 한 줄 추가:
```ts
  VOCAB_CHOICE: buildContractTypeSectionBody("VOCAB_CHOICE"),
```
→ 생성 콜 입력에서 **24,940자(계약의 82.4%)** 소멸. 빈칸 동일 조치 실측 효과 `-36.2%`(research-note.md:1458).
⚠️ `research-note.md:1457` 이 "우연한 generic 도움 제거" 리스크를 명시했다. **품질 A/B 없이 프로덕션 반영 금지** — md 승차가 근본 해결이므로 이 완화책은 **선택 사항**으로 남기고 사용자 판단에 맡긴다.

### 4-C. 【증상 B】네모어법 타임아웃 — 승차 전 완화책

md 승차가 근본 해결(단일 콜·0원 게이트·검수리 없음). 승차 전 완화 후보 2개 — **둘 다 fast 레인 성능 특성을 바꾸므로 사용자 승인 필요**:
1. `dispatchers.ts:363-441` 토큰 바닥 분기에 `GRAMMAR_CHOICE_COMBO` 를 추가(GRAMMAR_ERROR 는 20,000). 절단으로 인한 재시도 소진을 줄인다.
2. `run-question-generation.ts:2189-2195` 의 콤보 attempts 6회를 낮춰 첫 시도에 예산을 몰아준다.
→ **권고: 둘 다 하지 말고 md 승차를 기다린다.** 완화책이 실패 계통을 바꾸면 승차 후 A/B 기준선이 오염된다.

### 4-D. 【증상 C】순서 오류 — 진단 삼킴 봉합 (**사용자 승인 필요 · X1/X2**)

**X2 (권고 · 최소 침습)** — `src/lib/workbench-generation-errors.ts:91-102` 의 한국어 passthrough 게이트를 확장:
```ts
  const KOREAN_PASSTHROUGH_TYPES = new Set(["IRRELEVANT", "SENTENCE_ORDER"]);
  if (
    questionType && KOREAN_PASSTHROUGH_TYPES.has(questionType) &&
    hasKoreanUserMessage && ( ... 기존 키워드 ... || strippedRaw.includes("문장") )
  ) return strippedRaw;
```
→ `"글의 순서 유형은 ... 최소 6문장 이상이 필요합니다. 현재 지문은 4문장입니다."` 라는 **정확한 진단**이 사용자에게 도달한다. 이것이 증상 C 의 실질 해결이다.

**X1 (검토 · off-by-one)** — `feasibility.ts:33` `minSentences = SENTENCE_ORDER_MIN_PARAGRAPH_SENTENCES * 3` (=6). 실질 하한은 **given 1 + 3×2 = 7**. 6문장 지문은 preflight 를 통과한 뒤 `sentence-order-missing-given` 또는 `sentence-order-paragraph-too-short`(둘 다 `RELAXED_BLOCKING_QUALITY_CODES` 등재)로 **100% 게이트사**한다.
→ `* 3` 을 `* 3 + 1` 로 바꾸면 6문장 지문이 크레딧 차감 전에 명확한 사유로 거부된다. **fast 레인 동작 변경이므로 사용자 승인 필수.** 승인 없으면 md 승차 후에도 6문장 지문은 md 게이트에서 죽는다(단, md 는 환불되고 사유가 잡 result 에 남는다).

**X3 (보고 · 확정 결함)** — `prefixVariationCount >= 1` 은 **설계상 100% 반드시 실패**한다:
프롬프트가 첫 문장 패러프레이즈를 지시(`dispatchers.ts:696-711`) → 게이트가 단락 전체의 원문 substring 존재를 요구(`validators/sentence-order.ts:694-703`) → `sentence-order-paragraph-not-source-backed` → `RELAXED_BLOCKING_QUALITY_CODES`(`run-question-generation-constants.ts:369`) 전 레인 차단.
→ **UI 에서 이 노브의 최대값을 0으로 클램프하거나 컨트롤을 숨길 것을 권고**(`type-numeric-detail.tsx:1532-1566`). 사용자 결정 사항. Phase 2 에서 md 2단 출력(축자본 + 변형본)으로 정공법 해결.

---

## 5. 통합·검증 순서

### 5-1. 단계

| 단계 | 주체 | 명령 / 산출 |
|---|---|---|
| **0. PRE-WORK** | 오케스트레이터 | PRE-1a/1b(export 승격) + PRE-2(`lane-types.ts`). `npx tsc --noEmit` 통과 확인 후 팬아웃 |
| **1. 팬아웃** | VOCAB / COMBO / ORDER / ANTONYM-GEN / ANTONYM-UI **5명 동시** | 각자 배타 소유 파일만 생성·편집. **route.ts · use-generation-handlers.ts · parser.ts · adapter.ts · prompts.ts 절대 금지** |
| **2. 유형별 자체 검증** | 각 에이전트 | `npx tsc --noEmit` / `npx eslint <자기파일들>` / `npx tsx scripts/_test-md-<type>.ts` **전부 PASS 필수** |
| **3. 통합** | 오케스트레이터 | PRE-3(`lane-registry.ts`) + S1~S15 + C1 일괄 적용 |
| **4. 타입체크** | 오케스트레이터 | `npx tsc --noEmit` |
| **5. 린트** | 오케스트레이터 | `npm run lint` |
| **6. 단위 테스트** | 오케스트레이터 | `npm run test:unit` |
| **7. 0원 픽스처 전수** | 오케스트레이터 | `npx tsx scripts/_test-md-multi-formats.ts` (**정본 무회귀**) + 신규 4개 |
| **8. 실콜 벤치** | 오케스트레이터 | `npx tsx scripts/_bench-md-multi-live.ts` (정본 무회귀) + `_bench-md-<type>-live.ts` × 4 |
| **9. 로컬 UI 검증** | 오케스트레이터 | `npm run dev` → 워크벤치 생성 화면에서 4유형 각 1회 실생성. 스트리밍 패널 표시 / 크레딧 차감액(ANTONYM=1) / 카드 렌더 / 시험지 미리보기 확인 |
| **10. 보고** | 오케스트레이터 | 사용자에게 결과 보고 후 **"테스트해 주세요"**. **커밋·푸시·배포 금지** |

### 5-2. 명령어 정본
```bash
npx tsc --noEmit
npm run lint
npm run test:unit                       # node --test tests/unit
npx tsx scripts/_test-md-multi-formats.ts     # 정본 무회귀 (수정 금지 파일)
npx tsx scripts/_test-md-vocab.ts
npx tsx scripts/_test-md-combo.ts
npx tsx scripts/_test-md-order.ts
npx tsx scripts/_test-md-antonym.ts
npx tsx scripts/_bench-md-multi-live.ts       # 정본 실콜 무회귀
npx tsx scripts/_bench-md-vocab-live.ts       # (이하 실콜 — 과금 발생, 사용자 승인 후)
```

### 5-3. 게이트 조건 (하나라도 실패 시 통합 중단)
- `npx tsc --noEmit` 오류 0
- `npm run lint` 오류 0 (경고는 신규 코드에 한해 0)
- `scripts/_test-md-multi-formats.ts` 결과가 **PRE-WORK 이전과 동일**(정본 무회귀 증명)
- `md-stream/route.ts` 의 BLANK/GRAMMAR 실행 경로가 `git diff` 상 **논리 변경 없음**(삼항 조건 앞단 추가만)

### 5-4. 사용자 규칙 준수
- **커밋·푸시·배포 절대 금지.** 작업 후 `git status` / `git diff` 를 제시하고 커밋 여부는 사용자에게 묻는다.
- 배포는 **반드시 `vercel --prod`** (`git push` ≠ 배포). 건별 명시 승인 필요. 커밋+푸시+배포 자동 체이닝 금지.
- 파일 400줄 경고 / 500줄 초과 금지 — 신규 파일 전부 이 규칙 안에서 설계됨.

---

## 6. 위험 등록부 — 회귀 위험 Top 10

| # | 위험 | 근거 | 방어책 |
|---|---|---|---|
| **R1** | **ANTONYM 크레딧 이중청구(1→2)** — md-stream `operationType` 하드코딩(`route.ts:532`). 클라 견적은 1(`use-workspace-generation.ts:147-149`)이라 사용자 표면에서 즉시 어긋난다 | V4 확정 | S5 필수 적용. `_test-md-antonym.ts` 에서 `lane.operationType === "QUESTION_GEN_VOCAB"` assert. 통합 후 로컬 실생성으로 잔액 차감 -1 확인 |
| **R2** | **VOCAB SYNONYM_VARIANT 게이트 오이식** — 어법의 `changed.length === answerCount`(`parser.ts:328`) 또는 `autoSnapGrammarMarks` v2 미끼 교정(`:541-557`)을 복사하면 변형 모드 100% 반려 또는 **원문과 다른 지문 저장** | vocab 보고 §6-A1/A2 | 게이트 #7↔#8 모드 분기 명시. 오토스냅은 SOURCE_EXACT 전용. `_test-md-vocab.ts` 에 변형 모드 정상 케이스 필수 |
| **R3** | **`MdAnyQuestion` 유니언 확장 → md-lab tsc 파손** — `exam-sheet.tsx`(`question.marks`) / `question-editor.tsx` 내로우잉이 실측 컴파일 실패 | `parser.ts:57-63` 인코드 기록 | **유니언 확장 금지**를 계약으로 못박음(§1-3). `MdLaneParsed.question: unknown` 으로 우회. `md-lab/parser.ts` FROZEN |
| **R4** | **라벨 축 4중 혼선** — VOCAB `(a)` 소문자 / ANTONYM `(A)` 대문자 / COMBO 슬롯 `(A)`+선지 `"1"` / ORDER 단락 `"(A)"`+선지 `"1"`. 어댑터에서 `circledForMarkIndex` 를 무심코 복사하면 `wrongOptionExplanations` 키가 통째로 어긋난다 | `adapter.ts:71-78` 주석 · shared 보고 §0 | 유형별 어댑터 필드표(§3-A6/B6/C6/D6)를 계약으로. 각 픽스처에서 저장 형상 필드별 assert |
| **R5** | **ANTONYM 라벨 축 변경 유혹** — 저장 `markedWords[].label` 을 ① 로 바꾸면 `validators/antonym.ts:93` · `anchor-extraction.ts:191` 이 **기존 DB 문항에서** 전량 실패 | antonym 보고 §2-B | 저장 축 `(A)` 불변을 명문화(§4-A). [ANTONYM-GEN] 과 [ANTONYM-UI] 를 **파일 겹침 0** 으로 분리해 상호 오염 차단 |
| **R6** | **SENTENCE_ORDER 후처리 부재 인지 실패** — `PASSTHROUGH_TYPES` 이므로 "후처리가 해주겠지"가 통하지 않는다. `paragraphs[].label` 이 `"(A)"` 리터럴이 아니면 `validators/sentence-order.ts:151` 이 반려, DOCX 역파싱(`question.ts:465`)은 **화면은 멀쩡한데 인쇄물만 깨진다**(늦게 발견) | V8 확정 | 어댑터 완제품 계약(§3-C6). `_test-md-order.ts` 에 **questionText 역파싱 왕복 테스트** 필수 |
| **R7** | **COMBO 셔플 × 검증 순서** — COMBO 는 `SHUFFLE_OPTION_TYPES` 멤버(V3). 라우트는 셔플(`:1014`) **뒤에** 검증(`:1018`) 한다. 셔플이 `slotValues` 를 옵션과 함께 옮기지 않거나 `correctAnswer` 를 재동기하지 않으면 정답 이탈 | `question-diversity.ts:519-521` 주석은 "안전"이라 주장하나 md 경로 미검증 | `_test-md-combo.ts` 에서 셔플 후 `slotValues`↔`text` 동행 + `correctAnswer` 정합을 명시 단정. 실패 시 즉시 보고(코드 수정 아님) |
| **R8** | **품질 검증기 무차단으로 인한 품질 하락** — md 레인은 `validateQuestionQuality` 결과를 `qualityIssues` 로 **기록만** 한다(`route.ts:1088-1090`). fast 는 `RELAXED_BLOCKING_QUALITY_CODES` 로 실차단(`run-question-generation.ts:1141`). 4유형 모두 검수·수리 게이트(`review-repair-gate.ts:41-42`)도 상실 | V7 · shared 보고 §2-A | 각 유형이 **가장 치명적인 fast 검증 로직을 md 게이트로 승격**: VOCAB=substitution-seam 관찰(#10 위치유일성) / COMBO=누설검사(#13) / ORDER=축자분할·정답도출(#6,#10) / ANTONYM=표면형정합(#12). 벤치에서 `qualityIssues` 를 전량 로깅해 실측 후 추가 승격 판단 |
| **R9** | **다양성 표적 단절** — 라우트 수집기(`:619-649`)는 `originalExpression`/`blanks`/`markedExpressions` 만 안다. `diversityTargets` 미구현 시 같은 지문에서 같은 자리가 반복 출제된다 | `route.ts:619-649` | `MdLane.diversityTargets` 를 필수 메서드로 강제(§PRE-2). VOCAB=`markedWords[].originalWord` / COMBO=`slots[].correctExpression` / ORDER=`paragraphs[].text` 앞 40자 / ANTONYM=`markedWords[].word` |
| **R10** | **시간 예산 초과** — ORDER·COMBO 는 출력이 크다(`run-question-generation.ts:186-191`: high 사고 1콜 170s+ 실측). md 는 `max_tokens 14_000`·`effort:"high"` 고정(`route.ts:185-187`), 콜당 상한 240s, 총 예산 270s, 재생성 1회. 재생성까지 가면 예산 초과 가능 | `route.ts:842-846, 877, 898, 912` | 벤치에서 유형별 콜 소요를 초 단위 기록. 240s 초과 사례 발생 시 해당 유형의 `retryEligible` 을 false 로 낮추는 것을 사용자에게 제안(코드 상수 변경은 승인 후) |

**추가 관찰 위험 (Top 10 외, 방어책만 기록)**
- R11 `preflightQuestionFeasibility` 는 md 레인에서도 과금 전 작동(`route.ts:520`) — SENTENCE_ORDER 짧은 지문은 정상 거부. X2 미적용 시 사유가 여전히 삼켜진다.
- R12 md 레인은 `stemLanguage` 를 전혀 집행하지 않았다(기존 결함). 4유형 lane 이 언어 블록을 넣으면 **빈칸·어법만 여전히 구멍**으로 남는다 — 별도 과제로 사용자에게 보고.
- R13 `emit` 실패는 조용히 무시되고 생성·저장은 계속된다(`route.ts:783-791`). 신규 유형도 이 규약을 바꾸지 말 것.
- R14 AI 문항 편집 왕복 — `derive-type-settings.ts:78-84` 가 `markedWords.length` 로 `vocabChoiceMarkerCount`/`antonymPairCount` 를 역산한다. 게이트가 설정 실값을 강제하므로(#1) 자동 해소되지만, 벤치에서 배열 길이 == 설정값 assert 로 이중 확인.

---

## 7. 오너십 매트릭스 (병렬 안전성 증명)

| 파일 | VOCAB | COMBO | ORDER | ANT-GEN | ANT-UI | 오케스트레이터 |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| `md-qgen/{prompts,parser,adapter}-vocab.ts` `lane-vocab.ts` | **W** | | | | | |
| `md-qgen/{prompts,parser,adapter}-combo.ts` `lane-combo.ts` | | **W** | | | | |
| `md-qgen/{prompts,parser,adapter}-order.ts` `lane-order.ts` | | | **W** | | | |
| `md-qgen/{prompts,parser,adapter}-antonym.ts` `lane-antonym.ts` | | | | **W** | | |
| `scripts/_test-md-{vocab,combo,order,antonym}.ts` `_bench-*` | **W** | **W** | **W** | **W** | | |
| `md-qgen/parser.ts` `adapter.ts` | R | R | R | R | | **W**(PRE-1) |
| `md-qgen/prompts.ts` | R | R | R | R | | — |
| `md-qgen/lane-types.ts` `lane-registry.ts` | R | R | R | R | | **W** |
| `md-stream/route.ts` | | | | | | **W**(S1-S15) |
| `use-generation-handlers.ts` | | | | | | **W**(C1) |
| `paper-builder/option-display.ts` `render-model.ts` `marker-render-scheme.ts` | | | | | **W** | |
| `workbench/question-type-renderers.tsx` | | | | | **W** | |
| `t/[token]/taking-parts/exam-inline.tsx` | | | | | **W**(주석) | |
| `question-quality/feasibility.ts` `workbench-generation-errors.ts` | | | | | | **W**(X1/X2, 승인 후) |
| `question-postprocess/**` `question-quality/validators/**` `md-lab/**` | R | R | R | R | R | **FROZEN** |

**W=쓰기 배타 / R=읽기만.** 어떤 두 에이전트도 같은 파일에 W 를 갖지 않는다 → 머지 충돌 0.

---

## 8. 사용자 결정 대기 항목 (구현 전 확인 필요)

1. **X1** — `feasibility.ts` SENTENCE_ORDER 최소 문장 6→7 (fast 레인 동작 변경). 승인?
2. **X2** — `workbench-generation-errors.ts` 한국어 진단 passthrough 에 SENTENCE_ORDER 추가. 승인? (증상 C 의 실질 해결)
3. **X3** — `prefixVariationCount` 는 현재 1 이상이면 100% 실패 확정. Phase 1 에서 UI 최대값 0 클램프(또는 컨트롤 숨김)? 아니면 그대로 두고 Phase 2 의 md 2단 출력(축자본+변형본)까지 방치?
4. **4-B** — VOCAB `CONTRACT_TYPE_SECTIONS` 1줄 완화책을 md 승차 전에 넣을지(A/B 없이 프롬프트 바이트가 바뀜). 권고: **넣지 않음**.
5. **4-C** — COMBO fast 레인 완화책(토큰 바닥/attempts). 권고: **넣지 않음**.
6. **실콜 벤치 예산** — 유형별 2~3콜 × 4유형 ≈ 10콜. OpenRouter 실지출 발생. 승인?