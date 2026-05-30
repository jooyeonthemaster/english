# nara 튜터 모바일 학습 활동 유형 체계 — 최종 구현 스펙 (v2, 비평 반영 완료)

> 본 문서는 v1 종합 스펙에 적대적 비평(coverageCheck/gaps G1~G7/risks R1~R10)을 **전량 단일 값으로 확정**해 반영한 최종 구현 소스다. 모든 코드 경로·스키마·상류 데이터 필드는 실제 파일(`src/types/passage-analysis.ts`, `src/lib/passage-analysis-schema.ts`, `generate-activities.ts`, `exam-aligned-activities.ts`, `analysis-prompt.ts`, `prisma/schema.prisma`, `schemas.ts`)을 직접 읽어 재검증했다. v1 대비 변경점은 각 절 머리에 **[v2 변경]**으로 표시한다.

---

# 1. Overview

## 1.1 무엇을 만드는가
학생이 폰/태블릿에서 한 지문을 듀오링고처럼 **"한 화면 = 한 미션"** 으로 반복 학습해, 그 지문의 모든 출제 포인트(어휘/연어/어법/문장구조/담화흐름/주제/추론/패러프레이즈/암기/서술형 전환/직독직해)를 **재인→회상→생성** 위계로 완전 학습하게 한다.

**[v2 변경 — G3 해소]** "지문당 24~40개"라는 단일 목표를 폐기하고, **상류 데이터 가용성 등급(full / partial / minimal)별 하한·분포를 정량 보장**한다(§2.4). 무결성을 위해 폴백 쓰레기는 절대 만들지 않되, 개수는 **항상-가능 유형 + 같은 refKey의 난이도 변형(§6.3)을 "분량 보충 레버"로 명시 사용**해 데이터-빈약 지문에서도 하한을 채운다. 이 보충은 변형(난이도/단서 차등)이지 동일 카드 복제가 아니다.

## 1.2 4대 근본원인 → 해결 매핑 (코드 재검증)

| # | 근본원인 | 재검증된 증거 (실제 파일) | 본 스펙의 구조적 해결 |
|---|---|---|---|
| 1 | payload↔플레이어 계약 부재 | `exam-aligned-activities.ts:346` `paragraphs`, `:306` `markedExpressions`, `:284/303` `passageWithMarkers`를 한 `mastery_test`에 4종 혼재 적재. player `QuestionPrompt`는 `stem`/`targetSentence`/`prompt`만 렌더 → "풀 수 없는 카드" | §3 form별 discriminated-union payload + `ACTIVITY_FORM` 단일소스 + `activity-kit/` 공용 렌더러. mastery_test variant 정식 편입(G4) |
| 2 | 채점기 무결성 붕괴 | `activity-engine.ts:90-100` `isTextCorrect` 8자 substring OR 55% 토큰겹침; `:179` rebuild `join(" ")` | §4 `isTextCorrect` 폐기 → 정규화 완전일치/인덱스 시퀀스. SPAN 토큰정합 superRefine(G5) |
| 3 | 원문 가시성 단일정책 | `activity-player.tsx:106` `showPassage = mode!=="memorize"`; `page.tsx:60` 원문 전량 전달 | §5 `passagePolicy` 4단계 + 서버 `buildViewablePassage` + 힌트 감점 수치표 확정(R5) + `hintsAllowed=false` 완화(R10) |
| 4 | 저가치 생성 | `generate-activities.ts:382` `make ${item.word}`/`do ${item.word}` 영어메타 distractor; `:404` grammar 3개만; `rotate()` 결정셔플; grammar_binary 항상 정답0 | §7 영어메타 거부, seed Fisher-Yates, grammar_binary→grammar_judge, **syntaxAnalysis 게이팅 빌더 신설(G2)** |

## 1.3 추가 마이그레이션 불필요 (재검증됨)
v1과 동일. `prisma/schema.prisma`의 미사용 컬럼(`payloadSchemaVersion` default 1, `requiresAiGrade`, `payloadHash`, `TutorAttemptItem.aiGrade/aiGradeLogId/hintUsedCount/pasteCount/focusLossCount/clientFlags/overrideScore`, `TutorAiLog`, `TutorMastery`, `TutorReviewSchedule`, `TutorLearningEvent`, `TutorWeaknessSnapshot`, `TutorAssignment.hintsAllowed`(:3147 확인))을 배선만 한다 → DB 마이그레이션 없이 구현.

## 1.4 핵심 설계 결정 (v1 + 비평 확정)
1. **type ↔ form ↔ stage 3계층** 유지. type 추가 시 form만 지정하면 채점·계약 자동 동작.
2. **mode 7 + dimension 6 유지.** **[v2 확정 — G6]** 실제 `schemas.ts`에서 `mastery`는 **mode**에는 있으나 **dimension enum에는 없다**. mastery_test는 **흡수한 원 차원으로 coverageRefs.dimension을 기록**한다: BLANK_INFERENCE 기원→`interpret`, GRAMMAR_ERROR 기원→`grammar`, SENTENCE_ORDER 기원→`order`, CONTENT_MATCH/TOPIC→`interpret`. dimension enum은 **변경하지 않는다**(6종 유지). 이로써 `coverageRefs.min(1)`과 mastery_test가 충돌하지 않는다.
3. **passagePolicy 4단계 canonical**: `visible` / `assist` / `hidden_hintable` / `hidden_memorize`.
4. **AI 채점 최소화**: 자유서술 4종만 AI(`sentence_translate` / `structure_transform` / `grammar_correct`(hybrid) / `conditional_writing`). TAP_SPAN·철자·cloze·first_letter는 rule.
5. **死 유형 drop + merge**: `back_translation`/`dictogloss`/`transfer_mini_passage` drop, `grammar_binary`→`grammar_judge` merge. **[v2 확정 — R1/R7]** legacy 키 매핑표(§7 Phase 0)로 무중단.
6. **[v2 신규 — G2]** 상류 `syntaxAnalysis`(SyntaxItem)를 신규 유형의 정식 데이터 소스로 채택. 분석 파이프라인이 이미 emit하나 생성기가 한 번도 읽지 않던 데이터를 배선한다.
7. **[v2 확정 — gaps]** AI 동기/비동기, 힌트 수치, mastery variant, 에뮬레이터 채점, Phase 순서를 모두 단일 값으로 확정(아래 각 절).

## 1.5 상류 분석 보강 선행 작업 (Phase -1) **[v2 신규 — G2/G3]**
비평이 지적한 "데이터-빈약 인질" 구조를 근본 완화하려면 상류 분석이 신규 유형의 소스를 충실히 채워야 한다. 따라서 **활동 재설계 착수 전 선행 작업으로 분석 프롬프트를 보강**한다(`analysis-prompt.ts`):
- `syntaxAnalysis`: 현재 "0-3, 꼭 필요한 문장만"(:178)을 **"독해 난도 상위 문장 최대 5개에 대해 `chunkReading`(`/` 분절)·`patternType`·`keyPhrase`를 가능한 한 채운다"** 로 상향. chunk_reading/structure_role의 직접 소스.
- `structure.connectorAnalysis` / `blankSuitablePositions` / `orderClues`: connector_select·blank_infer·insertion_point의 소스이므로 "있으면 채운다" 수준에서 **"연결어 2개 이상, 빈칸 적합 위치 1개 이상 우선 시도"** 로 강화.
- `VocabItem.confusableWords` / `collocations`: vocab_confusable·vocab_collocation 소스. "혼동어 후보가 있으면 반드시 채운다."
- 단, 강화는 **권장이지 강제 생성이 아니다**(없으면 빈 배열 허용). 빈약해도 §2.4 등급별 하한이 무결성을 보장한다.

---

# 2. 유형 체계 (Type System)

mode/dimension 유지. 인터랙션 6종: **TAP_SELECT**(보기 1택), **CHIP_ASSEMBLE**(칩 순서 조립), **DRAG_CONNECT**(연결/매칭), **TAP_SPAN**(원문 토큰/문장 탭), **TYPE_SHORT**(짧은 입력), **TYPE_LONG**(긴 입력). 위계 L1=재인 / L2=재인+변별 / L3=회상 / L4=생성.

## 2.1 전체 유형 표 (모든 유형 + 死/merge 포함)

**[v2 변경]** 마지막 두 열에 **상류 데이터 소스(필드)** 와 **결손 시 동작**을 명시(G2/G3 직접 해소). "결손 시 동작=skip"은 폴백 금지를, "always"는 데이터 없이도 항상 생성 가능을 뜻한다.

| type | mode | status | 학습목표(L) | 인터랙션 | 입력 | 채점 | 상류 소스 필드 | 결손 시 | 권장수 |
|---|---|---|---|---|---|---|---|---|---|
| `vocab_choice` | vocab | redesign | 문맥뜻(L1) | 4지 탭 | tap | rule | `vocabulary[].meaning`+동일지문 distractor | always | 3~4 |
| `contextual_meaning` | vocab | keep | 사전뜻vs문맥뜻(L2) | 4지 탭 | tap | rule | `vocabulary[].contextMeaning` | skip | 1~2 |
| `vocab_collocation`(←collocation_select) | vocab | redesign | 연어(L2) | 4지 탭(한국어 보기) | tap | rule | `vocabulary[].collocations` | skip | 0~2 |
| `vocab_confusable` | vocab | **new** | 혼동어(L2) | 4지 탭 | tap | rule | `vocabulary[].confusableWords` | skip | 0~1 |
| `vocab_synonym` | vocab | **new** | 동의어/반의어(L2) **[v2신규 G1]** | 4지 탭 | tap | rule | `vocabulary[].synonyms`/`antonyms` | skip | 0~2 |
| `vocab_form`(파생어) | vocab | **new** | 파생어 형태(L3) **[v2신규 G1]** | 칩 선택+짧은입력 | mixed | rule | `vocabulary[].derivatives` | skip | 0~1 |
| `vocab_match` | vocab | keep | 단어↔뜻(L1) | 좌-우 연결 | connect | rule | `vocabulary[]` (2개+) | always | 1 |
| `vocab_spell` | vocab | keep | 철자(L3) | OTP 글자칸(첫글자 프리필) | short | rule(완전일치) | `vocabulary[].word` | always | 2~3 |
| `chunk_reading` | interpret | **new** | 끊어읽기 의미단위(L2) **[v2 G2]** | 청크 칩 조립 | chip | rule(시퀀스) | **`syntaxAnalysis[].chunkReading`** (`/` 분절) | skip | 1~2 |
| `sentence_translate` | interpret | keep(+AI) | 직독직해(L3) | 한국어 Textarea | long | **ai** | `sentences[].english`+`korean` | always | 2~3 |
| `structure_role` | interpret | **new** | 구문유형(도치/가정법/분사)(L2) **[v2 G2]** | 4지 탭 | tap | rule | **`syntaxAnalysis[].patternType`**(+`keyPhrase` stem) | skip | 0~1 |
| `gist_select` | interpret | redesign | 주제/요지(L2) | 4지 탭 | tap | rule | `structure.mainIdea`+`keyPoints` | always | 1 |
| `title_select` | interpret | **new** | 제목(L2) | 4지 탭 | tap | rule | `structure.mainIdea`+`purpose` | skip | 0~1 |
| `paraphrase_mc` | interpret | keep | 패러프레이즈(L2) | 4지 탭(원문 인용) | tap | rule | `examDesign.paraphrasableSegments` | skip | 1~2 |
| `blank_infer` | interpret | **new** | 빈칸추론(L2) | 4지 탭 | tap | rule | `structure.blankSuitablePositions`+`examDesign` | skip | 1~2 |
| `sentence_order` | order | redesign(채점) | 담화 순서(L2) | 슬롯 배치 | chip | rule(시퀀스) | `sentences[]`(3~5)+`orderClues` | always(3문장+) | 1 |
| `insertion_point` | order | redesign | 삽입 위치(L2) | 슬롯 탭(인라인) | span | rule | `sentences[]`+`orderClues` | always(4문장+) | 1 |
| `irrelevant_sentence` | order | redesign | 무관문장(L3) | 본문 ①~⑤ 탭 | span | rule | `sentences[]`(4+)+`logicFlow` | skip(소스약함시) | 0~1 |
| `connector_select` | order | **new** | 연결어(L2) | 4지 탭 | tap | rule | `structure.connectorAnalysis` | skip | 0~1 |
| `sentence_rebuild` | memorize | redesign(채점) | 통문장 어순(L3) | 칩 조립/스왑 | chip | rule(시퀀스) | `sentences[].english` | always | 2 |
| `chunk_rebuild` | memorize | keep(채점) | 구문 어순(L3) | 칩 조립 | chip | rule(시퀀스) | `syntaxAnalysis[].chunkReading` 또는 `sentences` | always | 1~2 |
| `progressive_cloze` | memorize | redesign | 핵심표현 빈칸(L2→L3) | 칩 선택→짧은입력 | mixed | hybrid | `sentences[]`+`vocabulary`(핵심어) | always | 2~3 |
| `first_letter_recall` | memorize | redesign | 첫글자 통문장(L4) | 단어별 글자칸/칩 | short | rule | `sentences[].english` | always | 1~2 |
| `structure_transform` | transfer | keep(+AI) | 구문 전환 서술형(L4) | 원문+조건+Textarea | long | **ai** | `examDesign.structureTransformPoints` 또는 `grammar.transformations` | skip | 1 |
| `conditional_writing`(←transfer_mini_passage) | transfer | **new(merge)** | 조건 영작(L4) | 칩조립 또는 Textarea | mixed | hybrid | `examDesign.descriptiveConditions`+`summaryKeyPoints` | skip | 0~1 |
| `grammar_judge`(←grammar_binary) | grammar | **redesign(merge)** | 어법 옳/그름(L1) | 4지 탭 | tap | rule | `grammarPoints[]`+`commonMistake` | always(grammar有시) | 1~2 |
| `grammar_error_span`(←grammar_find) | grammar | redesign | 어법 오류 지점(L2) | 본문 칩 구간 탭 | span | rule(인덱스) | `grammarPoints[].textFragment`+`sentenceIndex` | skip(정합실패시 G5) | 1~2 |
| `grammar_correct` | grammar | keep(hybrid) | 어법 고치기(L3) | 칩 1개 교체+짧은입력 | mixed | hybrid | `grammarPoints[].textFragment`+`transformations` | skip | 1 |
| `mastery_test` | mastery | keep(계약 렌더) | 내신 변형 종합(L4) | variant 분기 | mixed | rule | exam 파이프라인(`examQuestionToTutorActivityDraft`) | (exam경로 전용) | 2~4 |
| ~~`back_translation`~~ | memorize | **drop(死)** | 한→영 통문장(타이핑 과부하) | — | — | — | — | — | — |
| ~~`dictogloss`~~ | memorize | **drop(死)** | 받아쓰기(오디오 미지원) | — | — | — | — | — | — |
| ~~`transfer_mini_passage`~~ | transfer | **drop→merge** | 미니지문 작문(과부하) | →`conditional_writing` | — | — | — | — | — |
| ~~`grammar_binary`~~ | grammar | **drop→merge** | 2지선다 항상 정답0 | →`grammar_judge` | — | — | — | — | — |

**[v2 변경 — G1 해소]** v1에서 누락됐던 동의어/반의어(`vocab_synonym`)·파생어(`vocab_form`)를 신규 어휘 유형으로 추가해 `VocabItem.synonyms/antonyms/derivatives`를 소비한다. 단 둘 다 결손 시 skip(폴백 금지).

## 2.2 form 매핑 갱신 **[v2 변경]**
신규 2종 반영: `vocab_synonym`→CHOICE, `vocab_form`→TEXT(variant=`derive`, gradeMode=`rule_exact`).

## 2.3 mastery_test variant 정식화 **[v2 신규 — G4 해소]**
mastery_test는 단일 type을 유지하되 **내부 variant를 강제**해 이질 payload를 정규화한다. ChoicePayload.variant에 **`order_paragraphs`를 추가**하고 `paragraphs` 필드를 union에 정식 편입(§3.2). exam-aligned 매핑을 superRefine으로 강제:
- GRAMMAR_ERROR 기원 → `variant=marked_passage` (`markers`/`markedPassage`), dimension=`grammar`
- SENTENCE_ORDER 기원 → `variant=order_paragraphs` (`paragraphs[]`), dimension=`order`
- BLANK_INFERENCE/CONTENT_MATCH/TOPIC 기원 → `variant=marked_passage` 또는 `plain`, dimension=`interpret`

→ "렌더 안 되는 드롭 필드 잔존"(근본원인1 잔재)을 제거.

## 2.4 데이터 가용성 등급별 보장 분포 **[v2 신규 — G3 해소]**

생성기는 분석 데이터로 **가용성 등급**을 먼저 판정한 뒤 등급별 하한을 보장한다. 판정 기준:
- **full**: `syntaxAnalysis.length≥3` AND `examDesign.structureTransformPoints≥2` AND `connectorAnalysis≥2` AND `paraphrasableSegments≥2`
- **partial**: 위 중 1~3개 충족
- **minimal**: 모두 결손(vocabulary/sentences/grammarPoints만 신뢰)

| 등급 | 총 하한 | 보장 분포(하한) | 보충 전략 |
|---|---|---|---|
| full | 28 | vocab 8 / interpret 6 / order 3 / memorize 5 / grammar 3 / transfer 1 / mastery 2 | 그대로 |
| partial | 20 | vocab 7 / interpret 3 / order 2 / memorize 5 / grammar 2 / mastery 1 | 결손 유형 자리를 **항상-가능 유형의 난이도 변형(§6.3)** 으로 채움 |
| minimal | 14 | vocab 6 / interpret(translate) 2 / memorize(rebuild/cloze/first_letter) 4 / grammar_judge 1 / order(sentence_order, 3문장+) 1 | 같은 refKey를 L1→L2→L3 변형으로 분량 보충 |

**항상-가능 유형 집합(소스 무관 보장)**: `vocab_choice`/`vocab_spell`/`vocab_match`/`sentence_translate`/`sentence_rebuild`/`chunk_rebuild`/`progressive_cloze`/`first_letter_recall`/`gist_select`/`grammar_judge`(grammarPoints 존재 시)/`sentence_order`(문장 3개 이상). minimal에서도 이 집합으로 하한 14를 충족한다. **개수를 채우려 폴백 쓰레기를 만드는 것은 금지**되며, 보충은 오직 동일 refKey의 단서/형식 차등 변형으로만 한다.

## 2.5 차원 커버리지 결론
10개 명시 차원 전부 커버: 어휘(choice/contextual/collocation/confusable/synonym/form/match/spell) · 연어(collocation) · 어법(judge/error_span/correct) · 문장구조(chunk_reading/structure_role) · 담화(order/insertion/irrelevant/connector) · 주제(gist/title) · 추론(blank_infer/paraphrase/mastery) · 패러프레이즈(paraphrase) · 암기(rebuild×2/cloze/first_letter) · 서술형전환(transform/conditional/correct) · 직독직해(translate). **[v2]** G1(동의어/파생어)·G2(structure 소스)·G7(어법 transformations→transfer 흡수 외 grammar_correct가 직접 소비) 모두 해소.

---

# 3. payload↔플레이어 계약

## 3.1 단일소스 — `src/lib/tutor/activity-types.ts` (신설)

v1과 동일하되 **신규 2종 반영**:

```ts
export const TUTOR_ACTIVITY_TYPES = [
  // vocab
  "vocab_choice","contextual_meaning","vocab_collocation","vocab_confusable",
  "vocab_synonym","vocab_form","vocab_match","vocab_spell",
  // interpret
  "chunk_reading","sentence_translate","structure_role","gist_select","title_select","paraphrase_mc","blank_infer",
  // order
  "sentence_order","insertion_point","irrelevant_sentence","connector_select",
  // memorize
  "sentence_rebuild","chunk_rebuild","progressive_cloze","first_letter_recall",
  // transfer
  "structure_transform","conditional_writing",
  // grammar
  "grammar_judge","grammar_error_span","grammar_correct",
  // mastery
  "mastery_test",
] as const;
export type TutorActivityType = (typeof TUTOR_ACTIVITY_TYPES)[number];

export const ACTIVITY_FORM = {
  CHOICE: ["vocab_choice","contextual_meaning","vocab_collocation","vocab_confusable","vocab_synonym",
           "structure_role","gist_select","title_select","paraphrase_mc","blank_infer",
           "connector_select","grammar_judge","insertion_point","irrelevant_sentence","mastery_test"],
  CHIP:   ["chunk_reading","sentence_order","sentence_rebuild","chunk_rebuild"],
  MATCH:  ["vocab_match"],
  SPAN:   ["grammar_error_span"],
  TEXT:   ["sentence_translate","vocab_spell","vocab_form","progressive_cloze","first_letter_recall",
           "grammar_correct","structure_transform","conditional_writing"],
} as const;
export type ActivityForm = keyof typeof ACTIVITY_FORM;

// 빌드타임 exhaustive (form 누락 type → 컴파일 실패)
type _Exhaustive = Exclude<TutorActivityType,(typeof ACTIVITY_FORM)[ActivityForm][number]> extends never ? true : never;
const _assert: _Exhaustive = true;

const FORM_OF = new Map<TutorActivityType,ActivityForm>();
(Object.entries(ACTIVITY_FORM) as [ActivityForm, readonly TutorActivityType[]][])
  .forEach(([f,ts]) => ts.forEach(t => FORM_OF.set(t,f)));
export function formOf(type: string): ActivityForm | null { return FORM_OF.get(type as TutorActivityType) ?? null; }

export const AI_GRADED_TYPES = new Set<TutorActivityType>([
  "sentence_translate","structure_transform","grammar_correct","conditional_writing",
]);
export function requiresAiGrade(type: string) { return AI_GRADED_TYPES.has(type as TutorActivityType); }
export const RUBRIC_VERSION = 1;

// [v2 신규 — R1/R7] 死 4종 런타임 어댑터 (enum 밖이지만 legacy 변환용)
export const LEGACY_TYPE_ADAPTERS: Record<string, TutorActivityType> = {
  grammar_binary: "grammar_judge",
  transfer_mini_passage: "conditional_writing",
  back_translation: "sentence_translate",   // 한→영 死 → AI 직독직해 변형으로 흡수
  dictogloss: "sentence_rebuild",            // 받아쓰기 死 → 통문장 재배열로 흡수
};
```

기존 5개 인라인 Set(`generate-activities.ts:7` `PLAYER_SUPPORTED_ACTIVITY_TYPES`, `activity-engine.ts:12/24`, `activity-player.tsx:39`, emulator`:76`)을 전부 삭제하고 여기서 import.

## 3.2 form별 discriminated union — `src/lib/tutor/activity-payload-schema.ts` (신설)

v1 스키마에 **mastery_test order_paragraphs variant + SPAN 토큰정합 refine + vocab_form 반영**을 추가.

```ts
const PassagePolicy = z.enum(["visible","assist","hidden_hintable","hidden_memorize"]);

const HintStage = z.object({
  stage: z.number().int().min(1),
  kind: z.enum(["first_letter","length","korean_gloss","context_window","structure","narrow_options"]),
  label: z.string(),
  cost: z.number().min(0).max(1),     // §5.3 수치표에서 주입
  reveal: z.unknown(),                // 단서만. 정답 문자열 금지
});

const Base = z.object({
  prompt: z.string().min(1),
  instruction: z.string().optional(),
  hint: z.string().optional(),
  passagePolicy: PassagePolicy.default("visible"),
  hintPenalty: z.number().min(0).max(1).default(0.2),
  hints: z.array(HintStage).optional(),
  refKey: z.string().optional(),
  recallStage: z.number().int().min(1).max(3).optional(),
  source: z.object({ sentenceIndex: z.number().int().min(0).optional(),
                     sentenceIndices: z.array(z.number().int().min(0)).optional() }).optional(),
  explanation: z.string().optional(),
});

// ── CHOICE ──  [v2 변경] variant에 order_paragraphs 추가, paragraphs 편입
const Option = z.union([z.string().min(1),
  z.object({ label: z.string().min(1), before: z.string().optional(), after: z.string().optional() })]);
const ChoicePayload = Base.extend({
  form: z.literal("CHOICE"),
  variant: z.enum(["plain","stem","insertion","marked_passage","order_paragraphs"]).default("plain"),
  stem: z.string().optional(),
  targetSentence: z.string().optional(),
  markedPassage: z.string().optional(),
  markers: z.array(z.object({ no: z.number().int(), text: z.string() })).optional(),
  paragraphs: z.array(z.object({ label: z.string(), text: z.string() })).optional(), // order_paragraphs
  options: z.array(Option).min(2).max(5),
  correctIndex: z.number().int().min(0),
  wrongOptionExplanations: z.array(z.string()).optional(),
}).superRefine((p, ctx) => {
  if (p.correctIndex >= p.options.length) ctx.addIssue({ code:"custom", message:"correctIndex out of range" });
  if (p.variant === "marked_passage" && !p.markers?.length) ctx.addIssue({ code:"custom", message:"marked_passage requires markers" });
  if (p.variant === "order_paragraphs" && (p.paragraphs?.length ?? 0) < 2) ctx.addIssue({ code:"custom", message:"order_paragraphs requires paragraphs[]" });
});

// ── CHIP (시퀀스 채점) ──
const ChipPayload = Base.extend({
  form: z.literal("CHIP"),
  variant: z.enum(["rebuild","order","chunk_reading"]),
  chips: z.array(z.object({ id: z.number().int().min(0), text: z.string().min(1) })).min(2).max(30),
  correctOrder: z.array(z.number().int().min(0)),
  answerText: z.string().optional(),
}).refine(p => p.correctOrder.length === p.chips.length
  && new Set(p.correctOrder).size === p.chips.length, "correctOrder must be a permutation of chip ids");

// ── MATCH ──
const MatchPayload = Base.extend({
  form: z.literal("MATCH"),
  pairs: z.array(z.object({ left: z.string().min(1), right: z.string().min(1) })).min(2).max(8),
});

// ── SPAN (TAP_SPAN) ──  [v2 변경 — G5 핵심] 토큰정합 superRefine 필수
const SpanPayload = Base.extend({
  form: z.literal("SPAN"),
  spanTokens: z.array(z.string().min(1)).min(2),
  correctSpan: z.tuple([z.number().int().min(0), z.number().int().min(0)]),
  textFragment: z.string().min(1),     // [v2] 정합 검증 기준(원본 오류 구간)
  variant: z.enum(["grammar_error"]).default("grammar_error"),
}).superRefine((p, ctx) => {
  const [s,e] = p.correctSpan;
  if (s > e || e >= p.spanTokens.length)
    ctx.addIssue({ code:"custom", message:"correctSpan out of range" });
  // 핵심: 선택 구간 토큰을 합쳐 정규화하면 textFragment 정규화와 일치해야 함
  const norm = (x:string) => x.toLowerCase().replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim();
  const joined = norm(p.spanTokens.slice(s, e+1).join(" "));
  if (joined !== norm(p.textFragment))
    ctx.addIssue({ code:"custom", message:`span/textFragment mismatch: "${joined}" != "${norm(p.textFragment)}"` });
});

// ── TEXT ──  [v2 변경] variant에 derive 추가
const TextPayload = Base.extend({
  form: z.literal("TEXT"),
  variant: z.enum(["translate","cloze","first_letter","spell","derive","correct","transform","conditional"]),
  inputMode: z.enum(["short","long"]).default("short"),
  firstLetter: z.string().optional(),
  length: z.number().int().min(1).optional(),
  firstLetterChips: z.array(z.string()).optional(),
  transformType: z.string().optional(),
  conditions: z.array(z.string()).optional(),   // ★렌더됨
  scaffold: z.string().optional(),
  gradeMode: z.enum(["rule_exact","ai","hybrid"]),
  acceptedAnswers: z.array(z.string()).optional(),
  modelAnswer: z.string().optional(),
  rubric: z.array(z.string()).optional(),
  sentenceWithError: z.string().optional(),     // [v2 — R3] grammar_correct 복붙판별 기준
});

export const TutorActivityPayloadSchema = z.discriminatedUnion("form",
  [ChoicePayload, ChipPayload, MatchPayload, SpanPayload, TextPayload]);
export type TutorActivityPayload = z.infer<typeof TutorActivityPayloadSchema>;
```

**[v2 신규 — G5 해소]** SpanPayload의 superRefine이 `spanTokens.slice(s,e+1).join(" ")` 정규화 == `textFragment` 정규화를 강제. 생성기는 **동일 토크나이저**(공백분할 + 구두점→공백 정규화)로 `spanTokens`와 `correctSpan`을 함께 계산하고, 정합 실패 시 `grammar_error_span` 생성을 skip(폴백 금지). 이로써 "결정적 채점이 오히려 항상 오답/정답" 위험을 빌드/생성 시점에 차단.

## 3.3 `adaptLegacyPayload` v1→v2 키 매핑 **[v2 신규 — R1/R7 해소]**

DB 읽기 시점(`page.tsx` student fetch / grade-router 진입) **1회**, v1 payload(form 필드 없음)를 v2 union으로 정규화하는 순수 함수. 死 4종은 `LEGACY_TYPE_ADAPTERS`로 type 치환 후 변환.

| v1 type / payload | v1 키 | v2 변환 |
|---|---|---|
| `grammar_binary` | `options`(2개), `correctIndex:0` | type→`grammar_judge`, form=CHOICE, variant=`plain`, options 그대로(2지선다 유지, 신규는 4지) |
| `transfer_mini_passage` | `prompt`, `conditions?` | type→`conditional_writing`, form=TEXT, variant=`conditional`, gradeMode=`hybrid` |
| `back_translation` | `targetSentence`/`prompt` | type→`sentence_translate`, form=TEXT, variant=`translate`, gradeMode=`ai` |
| `dictogloss` | `prompt`/`answerText` | type→`sentence_rebuild`, form=CHIP, variant=`rebuild`, chips=`answerText` 공백분할, correctOrder=`[0..n-1]` |
| 구식 `sentence_order` | `shuffled[]`/`paragraphs[]` | form=CHIP, variant=`order`, chips=문장, correctOrder=원순서 인덱스 |
| 구식 rebuild | `answerText`(join) | form=CHIP, chips=토큰화, correctOrder 시퀀스 |
| 구식 MC(다수) | `options`/`correctIndex` | form=CHOICE, variant=`plain` |
| 구식 vocab_match | `leftItems`/`rightItems`/`correctPairs` | form=MATCH, pairs=correctPairs 전개 |
| 구식 free-form | `answerText`/`acceptedAnswers` | form=TEXT, variant 매핑, gradeMode=`requiresAiGrade(type)?"ai":"rule_exact"` |

변환 불가(키 부족)일 때만 `UnsupportedActivity`. `LEGACY_TYPE_ADAPTERS`가 死 4종 + 현행 23종을 전부 커버함을 **Phase 0 단위테스트로 선행 검증**(§7).

## 3.4 `TutorActivityDraftSchema` 교체 (`schemas.ts`)

v1과 동일. `instructions` optional 제거, `payload` union, `payloadSchemaVersion: z.literal(2).default(2)`, `coverageRefs.min(1)` + form 일치 superRefine. **[v2]** mastery_test의 dimension은 §1.4-2 규칙대로 흡수 차원으로 기록(생성기 책임).

## 3.5 공용 렌더러 — `src/components/tutor/activity-kit/` (신설)

v1과 동일 구조. emulator(`tutor-program-emulator-client.tsx:671~1199`) 복붙 컴포넌트 전량 삭제, player/emulator 공통 import. **[v2 변경]** ChoiceStage가 `variant=order_paragraphs`(단락 카드 순서 표시)와 `marked_passage`(①~⑤)를 모두 처리. TextStage가 `variant=derive`(파생어 빈칸) 처리.

미렌더 필드 렌더 매핑(근본원인1 직접 해결)은 v1 표 유지 + **`paragraphs`→ChoiceStage `order_paragraphs` 단락카드**(더 이상 "options 폴백"이 아니라 정식 variant), **`spanTokens`+`correctSpan`→SpanStage 토큰 구간 탭**.

`toStudentPayload`(form-aware, `sanitize-activity.ts`)는 v1 표 유지 + **SPAN에서 `textFragment` 제거**(정답 구간 노출 방지, `spanTokens`만 전송), **CHOICE order_paragraphs에서 `paragraphs`는 셔플 순서로 전송 + `correctIndex` 제거**.

---

# 4. AI 채점 아키텍처 + rule 채점 강화

## 4.1 단일 라우터 — `src/lib/tutor/grading/grade-router.ts` (신설)
v1과 동일 시그니처. 라우팅: rule이면 동기 반환 / AI면 복붙게이트→hybrid rule 1차→캐시→Gemini.

**[v2 확정 — gaps AI UX 자기모순 해소]** 타임아웃 수치 단일화: **AI 채점 동기 await 상한 = 6초**(8s/1~3s 혼재 폐기). 6초 초과 시 `ai-fallback-rule`(degraded). Vercel `maxDuration` = 라우트에서 **30초** 명시. 동시 제출 폭주 방지를 위해 **학생당 동시 AI 채점 1건**(in-flight 락, 초과 시 큐잉 대기 메시지).

**[v2 확정 — 비동기 vs 동기 단일 결정]** 채점 모델은 **"하이브리드 즉답 + AI 후행"**:
- 제출 즉시 **rule로 판정 가능한 부분을 동기 반환**(복붙 게이트 0점, hybrid의 rule 1차 정답, 형식/조건 충족 체크리스트). 학생은 즉시 "제출됨 + 부분 피드백" 화면으로 진행.
- 순수 AI verdict(`sentence_translate`/`structure_transform`/`conditional_writing`의 의미 채점)는 **6초 동기 시도, 초과 시 비동기로 강등**: 카드에 "AI가 채점 중" 배지 표시 후 결과 push(`TutorLearningEvent` AI_GRADE_READY + 클라 폴링/리밸리데이트). 이로써 느린 네트워크에서도 듀오링고식 흐름이 끊기지 않는다.
- `optimistic 정답 표시 금지`(오답을 정답으로 보이게 하지 않음). 채점 전에는 중립 "제출됨" 상태만.

## 4.2 rule 채점 강화 — `grade-rule.ts` (근본원인 2)
v1과 동일. `isTextCorrect`(8자 substring·55% 겹침) **전면 폐기**. 

**[v2 확정 — R6 해소]** `grade-rule.ts`는 **클라이언트에서도 import 가능한 순수 함수**로 설계(React 서버 의존성 없음, ground payload는 디렉터 컨텍스트에서만 노출). 이로써 에뮬레이터가 mock 만점이 아니라 **실제 rule 채점을 재현**한다(§4.7).
- CHOICE: correctIndex 정확 비교.
- CHIP: 제출 `{order:number[]}` vs `correctOrder` 순서 그대로 비교, 부분점수=위치 일치/전체.
- MATCH: 정규화 완전일치 + 부분점수.
- SPAN: `{span:[s,e]}` vs `correctSpan` 인덱스 정확 비교(토큰정합은 §3.2 생성 시점에 이미 보장).
- TEXT rule_exact(spell/cloze/first_letter/derive): `normalize` 후 `acceptedAnswers` **완전일치만**.

## 4.3 Gemini Flash AI 채점 — `ai-grade.ts` (신설)
**반드시 `getTutorModel()`(Gemini Flash). Claude 금지.** v1 `AiGradeResultSchema` 유지(verdict/scorePct/copiedFromSource/matched·missedConditions/feedbackKo/evidence). system: "JSON only, never reveal full model answer, verbatim copy→copiedFromSource=true, scorePct=0". 로깅: `TutorAiLog`(kind="activity_grade", crossBorderFlag=true), `aiGradeLogId`→`TutorAttemptItem`. **트랜잭션 밖** 호출.

## 4.4 원문 복붙 0점 게이트
v1 유지. **[v2 확정 — R3 해소]** `grammar_correct`(1단어 교정이 원문과 거의 동일할 수 있음)는 `payload.sentenceWithError`(오류 포함 원문) 대비 **diff 토큰 수 임계**로 판별: 학생 답안이 `sentenceWithError`와 동일/차이 0 토큰이면 "고치지 않았습니다" 0점; 정답이 1~2 토큰 교정인 정상 케이스는 통과. `sentence_translate`(한국어)는 복붙 게이트 미적용(AI 음차 판정 위임).

## 4.5 캐시 (신규 테이블 없이)
v1 유지. `gradeCacheKey = sha256({payloadHash, answer:normalize(submitted), rubricVersion})` → `TutorAttemptItem.aiGrade` JSON에 저장. degraded(`ai-fallback-rule`)는 캐시 제외(다음 시도 시 AI 재호출).

## 4.6 `submitTutorActivityAction` 변경 (`tutor.ts`)
- `:891` `gradeTutorActivity(...)` → `await gradeTutorActivityResponse(activity, response, ctx)`.
- `:935` upsert에 `aiGrade`/`aiGradeLogId`/`hintUsedCount`/`pasteCount`/`clientFlags` 기록.
- `:424`/`:622`/`program-generation.ts:478` 하드코딩 3곳 → `requiresAiGrade(draft.type)` + `payloadSchemaVersion: 2`.

## 4.7 에뮬레이터 채점 통합 **[v2 신규 — R6 해소]**
디렉터 에뮬레이터는 렌더(activity-kit) 공유 + 채점을 **하이브리드**로 통합:
- **rule 유형**: 클라이언트에서 `grade-rule` 순수 함수 직접 호출(서버 왕복·LLM 비용 0)로 **학생과 동일한 결정적 채점 재현**. "항상 만점" mock 폐기.
- **AI 유형**: LLM 미호출. 대신 "AI 채점 대상" 배지 + `modelAnswer`/`rubric`/`conditions` 대비표를 디렉터에게 표시(ground payload는 디렉터 컨텍스트라 허용). 이로써 R2 비용 위험과 충돌하지 않으면서 "미리보기 통과/학생 풀이불가" 회귀를 차단.

---

# 5. 원문 가시성·힌트 모델 (근본원인 3, 사용자 결정 1)

## 5.1 passagePolicy 4단계 (canonical)
v1 표 유지(`visible`/`assist`/`hidden_hintable`/`hidden_memorize`). `src/lib/tutor/visibility.ts`에 type×policy SSOT + `resolvePassagePolicy` fallback.

## 5.2 서버 측 원문 누출 차단
v1 유지. `page.tsx:60` 원문 전량 전달 폐기 → `buildViewablePassage(policy, passage, payload)` 가공본만 전달. `passageWithoutTarget`은 생성 시점 계산해 payload 저장.

## 5.3 단계적 힌트 + 결정적 감점 수치표 **[v2 확정 — R5 해소]**

`visibility.ts`에 **kind별 cost 단일 수치표를 SSOT로 확정 기재**(여러 영역의 제안을 하나로 통일):

| kind | cost | 비고 |
|---|---|---|
| `length` | 0.15 | 글자/단어 수만 |
| `structure` | 0.20 | S/V/O 골격 |
| `korean_gloss` | 0.20 | 한국어 뜻 단서 |
| `context_window` | 0.25 | 전후 문맥 일부 |
| `narrow_options` | 0.30 | 보기 2개 제거 |
| `first_letter` | 0.40 | 첫글자(가장 강한 단서) |

**누적 상한 = 0.50**(`penalty = min(0.5, Σcost)`). 서버 재계산:
```ts
const usedCost = sum(hintsUsed.map(s => hints.find(h=>h.stage===s)?.cost ?? 0));
const penalty = Math.min(0.5, usedCost);
scoreEarned = Math.round(baseScore * (1 - penalty));
```
`TutorAttemptItem.hintUsedCount` 기록, `TutorLearningEvent` HINT_USED. reveal에 **정답 문자열 절대 금지**(단서만). UI: blue 계열 + 전문 도구형 아이콘(오렌지/Sparkles/이모지 금지).

**[v2 확정 — R10 해소] `hintsAllowed=false` 풀이불가 처리**: `TutorAssignment.hintsAllowed=false`(schema:3147 확인)인데 type이 `hidden_hintable`이면 `resolvePassagePolicy`가 **자동으로 `assist`로 완화**(원문 가공본을 접힌 상태로 무료 제공) — "풀 수 없는 카드"를 정책으로 재생산하지 않는다. 단 `hidden_memorize`(암기)는 완화하지 않음(암기 목적상 노출이 자기모순). 완화 시 `clientFlags={hintWaivedToAssist:true}` 기록.

**[v2 확정 — mastery_test 힌트]** mastery_test의 "힌트=원문 전체 노출"을 폐기하고 **문장 수준 부분 노출로 단계화**(stage별 1문장씩, kind=`context_window`, cost 0.25, 누적 상한 0.5 동일 적용). 전체 노출 단일 고정 감점은 미사용.

## 5.4 점수 게이밍 방지
v1 유지. 모범답안/해설 노출 시 해당 activity attempt 점수 lock(`clientFlags={scoreLocked,revealedAnswerAt}`), 재시도는 `practiceOnly`로 강등(scoreEarned 미갱신, LearningEvent만 append). AI 자유서술은 첫 제출만 점수화.

---

# 6. 반복 숙달 모델

## 6.1 refKey 정규화
v1 유지. `coverageRefs`(sentenceIndex/dimension)→`${scope}:${ident}`(예 `order:sentence:3`, `vocab:rely on`, `grammar:subj-verb-agr`, `interpret:gist`). 생성기가 `payload.refKey` 저장, 없으면 submit 시 derive.

## 6.2 제출 시 숙달·스케줄 갱신 — `src/lib/tutor/mastery.ts` (신설)
v1 유지. `TutorMastery` upsert(attempts/correct/masteryLevel 0~3), `TutorReviewSchedule` SM-2(정답→interval×ease/ease+0.1, 오답→lapses++/interval 리셋/ease−0.2/즉시 큐).

**[v2 확정 — R8 해소] SM-2 시간 단위**: 4주 단기 내신 일정에 맞춰 **시간 단위(`intervalHours`)로 압축**. 초기 간격 6h→24h→72h→168h(7일) 단계. `dueAt = now + intervalHours`. 일 단위는 단기 코스에 과도하게 느려 채택하지 않는다.

## 6.3 재인→회상→생성 난이도 사다리 (분량 보충 레버)
v1 4단 위계 유지(L0 recognition / L1 cued recall / L2 recall / L3 free recall). **[v2 강화 — G3 연계]** §2.4의 보충 전략은 이 사다리를 사용: 같은 refKey를 L1→L2→L3 변형(progressive_cloze: 칩→첫글자input→무단서 / first_letter_recall: 첫글자칩→첫글자+길이→한국어힌트만 / vocab: 4지→매칭→철자)으로 생성해 데이터-빈약 지문의 분량을 무결성 손상 없이 채운다. 런타임은 현재 masteryLevel에 맞는 변형을 우선 노출.

## 6.4 오답 우선 복습 큐
v1 유지. `review/page.tsx`를 복습 큐로 재설계(`TutorReviewSchedule.status=DUE`/`dueAt<=now` dueAt 오름차순 → 미숙달 level<3 카드 현재 level 형식 1장). `TutorWeaknessSnapshot` 6축 최저 차원 가중. **amber 헤더→blue 교체**(메모리 규칙).

---

# 7. 구현 순서 (buildSequence)

**[v2 핵심 변경 — gaps buildSequence 의존성 역전 해소]** 각 Phase 말미에 **"v1 기존 데이터로 회귀 없이 동작"을 acceptance gate로 명시**. Phase 1~3은 반드시 `adaptLegacyPayload` 경유로 v1을 v2 형태로 정규화한 뒤 렌더·채점한다. **Phase 간 부분 배포(player만 먼저 등)는 금지**하거나 feature flag로 v1/v2 동시 지원. 또한 상류 분석 보강(Phase -1)을 선행.

## Phase -1 — 상류 분석 보강 (선행) **[v2 신규]**
- **goal**: 신규 유형 소스(syntaxAnalysis/connectorAnalysis/blankSuitablePositions/confusableWords)를 충실히 채워 G3 인질 구조 완화.
- `analysis-prompt.ts`: syntaxAnalysis 상한·충실도 상향(§1.5), connector/blank/paraphrase 우선 시도 지시. **강제 아님**(빈 배열 허용).
- **gate**: 기존 분석 호출이 회귀 없이 동작, 신규 지시로 syntaxAnalysis 채움률 상승 확인.

## Phase 0 — 단일소스·계약·legacy 어댑터 (drift 차단 선행)
- `activity-types.ts` 신설(§3.1): 死 4종 제거·신규 6종(synonym/form 포함)·`ACTIVITY_FORM`·exhaustive `_assert`·`AI_GRADED_TYPES`·`LEGACY_TYPE_ADAPTERS`.
- `activity-payload-schema.ts` 신설(§3.2): union + SPAN 토큰정합 refine + order_paragraphs + **`adaptLegacyPayload`(§3.3)**.
- `schemas.ts`: type/draft schema 교체.
- `visibility.ts` 신설: policy/HintStage·**힌트 cost 수치표(§5.3)**·`resolvePassagePolicy`(hintsAllowed=false 완화 포함)·`buildViewablePassage`.
- **gate(단위테스트 선행)**: `adaptLegacyPayload`가 **死 4종 + 현행 23종 전부**를 v2 union으로 변환·safeParse 통과함을 테스트로 검증. 미통과 시 다음 Phase 진입 금지.

## Phase 1 — rule 채점 무결성 복구 (근본원인 2)
- `grading/grade-rule.ts` 신설(§4.2): `isTextCorrect` 폐기, 완전일치/시퀀스/인덱스/매칭, **클라 import 가능한 순수 함수**.
- `activity-engine.ts`: `gradeTutorActivity` rule-only 강등, 인라인 Set 제거.
- `activity-player.tsx:175-183` `buildResponse`: CHIP→`{order}`, SPAN→`{span}`.
- **gate**: v1 활동을 `adaptLegacyPayload`로 정규화 후 grade-rule이 정상 채점(회귀 없음). 베끼기/아무순서 통과가 0건.

## Phase 2 — AI 채점 경로 (사용자 결정 2)
- `grading/{grade-config,grade-router,ai-grade,schemas}.ts` 신설(§4.1·4.3·4.4·4.5): 6초 타임아웃·하이브리드 즉답+AI후행·복붙게이트·캐시.
- `tutor.ts`: `:891` 라우터, `:935` aiGrade 기록, `:424/:622` 상수화; `program-generation.ts:478` 동일.
- **gate**: AI 유형이 v1 어댑터 경유로도 채점됨. 6초 초과 시 비동기 강등 동작. Vercel maxDuration 30s 설정.

## Phase 3 — 공용 렌더러 + 계약 채움 (근본원인 1)
- `components/tutor/activity-kit/**` 신설(§3.5): PassageStrip(4분기)/MarkedPassage/ActivityRenderer/stages(5)/FeedbackPanel/use-activity-answer.
- `activity-player.tsx`: 인라인 Set·복붙 컴포넌트 제거→kit import.
- emulator `:671-1199` 포크 삭제→kit import + **grade-rule 실제 채점(§4.7)**.
- `sanitize-activity.ts`: `toStudentPayload` form-aware(SPAN textFragment 제거 등).
- `page.tsx`: `buildViewablePassage`만 전달 + **fetch 시점 `adaptLegacyPayload` 정규화**.
- **gate**: v1 데이터가 전부 UnsupportedActivity로 떨어지지 않음(어댑터 커버 확인). 신규 변형(order_paragraphs/marked_passage/SPAN/조건칩/OTP) 렌더.

## Phase 4 — 생성기 재설계 (근본원인 4 + G2/G3)
- `generate-activities.ts`: 死 미생성, grammar_binary→grammar_judge(4지), `rotate()`→payloadHash seed Fisher-Yates, **영어메타 distractor(`make ${word}` 등 :382) 제거**, optional 게이팅(결손 skip), `validateGroundedDrafts`를 `TutorActivityDraftSchema.safeParse` 기반 재작성, passagePolicy/hints/refKey/passageWithoutTarget 주입.
  - **[v2 신규] syntaxAnalysis 게이팅 빌더**: `chunk_reading`(←`syntaxAnalysis[].chunkReading` `/` 분절을 칩+correctOrder), `structure_role`(←`patternType`+`keyPhrase` stem). 필드 결손 시 생성 목록에서 제외.
  - **[v2 신규] 어휘 신규 빌더**: `vocab_synonym`(←synonyms/antonyms), `vocab_form`(←derivatives), `vocab_confusable`(←confusableWords). 결손 skip.
  - **[v2 신규] SPAN 토큰정합 빌더**: `grammar_error_span`을 동일 토크나이저로 spanTokens/correctSpan 동시 계산, §3.2 refine 통과 못하면 skip.
  - **[v2 신규] 가용성 등급 판정 + 등급별 하한 보장 + 난이도 변형 보충**(§2.4).
- `exam-aligned-activities.ts`: mastery_test를 variant(`marked_passage`/`order_paragraphs`)로 정규화(§2.3), dimension을 흡수 차원으로 기록(§1.4-2), GRAMMAR_ERROR→grammar_judge.
- **gate**: 생성 결과가 등급별 하한 충족, 폴백 쓰레기 0건, validate 드롭율 정상.

## Phase 5 — 원문 가시성·힌트·게이밍 (근본원인 3)
- 힌트 감점(수치표)·practiceOnly·hintsAllowed=false 완화 배선.
- `tutor.ts`: hintsUsed/revealedAnswer 수신, hintUsedCount/clientFlags 기록, scoreLock.

## Phase 6 — 반복 숙달
- `mastery.ts` 신설: refKey 정규화·masteryLevel·**SM-2 시간 단위(§6.2)**.
- `tutor.ts`: submit 후처리 `updateMasteryAndSchedule`.
- `review/page.tsx`: 복습 큐 + amber→blue.

## Phase 7 — 마이그레이션·정리
- v1/v2 공존(`adaptLegacyPayload`). **[v2 신규] 기배포 프로그램 재생성 배치 스크립트**(死 4종·v1 payload를 v2로 일괄 재생성 또는 어댑터 영구 잔존 결정)를 산출물로 포함. 재생성 완료 후에만 어댑터 제거 검토.
- UI 가드(오렌지/이모지/Sparkles 0건) 점검.

---

# 8. Open Risks (잔여 — 비평 미결은 모두 §1~7에서 단일 값 확정됨)

비평이 차단으로 지목한 **G2(syntaxAnalysis 소스)·G5(SPAN 토큰정합)** 는 §1.5/§2.1/§3.2/Phase 4에서 해소. 미결 결정(AI UX·힌트 수치·mastery variant·legacy 매핑·Phase 의존성·에뮬레이터)은 §4.1/§4.7/§5.3/§3.3/§7에서 단일 값 확정. **아래는 구현 착수를 막지 않는 잔여 운영 리스크**다.

- **R1(잔여) — 기배포 재생성 비용**: `adaptLegacyPayload`로 무중단은 보장되나, 어댑터를 영구 잔존시킬지 일괄 재생성할지는 기배포 프로그램 수·Gemini 재생성 비용에 따라 운영 판단(Phase 7 배치 스크립트 제공).
- **R2(잔여) — AI 채점 비용 모니터링**: 하이브리드 즉답+6초 후 비동기 강등으로 UX는 확정. 지문당 자유서술 3~5개 × 학생 수의 Gemini 호출 총량·캐시 히트율은 배포 후 모니터링 대상.
- **R4(잔여) — 토크나이저 통일**: SPAN 정합 refine은 공백분할+구두점정규화 기준. 향후 형태소/축약형(it's 등) 처리 정교화 시 동일 토크나이저를 생성기·refine·grade-rule 3곳에서 단일 모듈로 공유 유지(드리프트 방지).
- **R7(잔여) — 드래그 라이브러리**: CHIP 슬롯 재배열은 **1차 탭 기반 슬롯 배치 + 인접 스왑**으로 시작(의존성 추가 없음). 드래그(dnd-kit 등)는 사용성 검증 후 후속.
- **R9(잔여) — vocab_match 연결선 성능**: SVG 좌표 재계산 비용 이슈 시 번호 배지 매칭(선 없이) 폴백. 태블릿 2열 레이아웃에서 우선 검증.
- **R11(신규 잔여) — 가용성 등급 임계 튜닝**: §2.4 등급 판정 임계(syntax≥3 등)와 등급별 하한 수치는 초기값. 실제 분석 데이터 분포로 보정 필요(분량 vs 무결성 균형).

---

## 검증된 핵심 파일 경로 (구현 시작점)
- **신설**: `c:\Users\jooye\Desktop\2026project\nara\src\lib\tutor\activity-types.ts` / `activity-payload-schema.ts` / `visibility.ts` / `mastery.ts` / `grading\{grade-config,grade-router,grade-rule,ai-grade,schemas}.ts` / `src\components\tutor\activity-kit\**`
- **수정**: `src\lib\tutor\schemas.ts`(:10,:36,:48,:51) · `generate-activities.ts`(:7,:377-383,:404,:443) · `exam-aligned-activities.ts`(:46,:284,:303,:306,:346) · `activity-engine.ts`(:12,:24,:90-100,:179) · `sanitize-activity.ts` · `program-generation.ts`(:478) · `src\actions\tutor.ts`(:424,:622,:891,:935) · `activity-player.tsx`(:39,:106,:175,:666) · `tutor-program-emulator-client.tsx`(:76,:689,:671-1199) · `...activity\[activityId]\page.tsx`(:58,:60) · `...review\page.tsx`(amber→blue)
- **[v2 신규] 선행 수정**: `src\app\api\ai\passage-analysis\[passageId]\_lib\analysis-prompt.ts`(:79,:92,:157-178 — syntaxAnalysis/connector/blank 충실도 상향)

## v1 대비 핵심 변경 요약 (비평 반영 추적)
- **G1**: `vocab_synonym`/`vocab_form` 신규 추가(synonyms/antonyms/derivatives 소비).
- **G2**: `syntaxAnalysis`(SyntaxItem.chunkReading/patternType/keyPhrase)를 chunk_reading/structure_role 정식 소스로 배선(생성기가 한 번도 안 읽던 데이터). 소스 매핑표(§2.1)·Phase 4 게이팅 빌더 명시.
- **G3**: 데이터 가용성 등급(full/partial/minimal)별 하한·분포·난이도변형 보충(§2.4) + 상류 분석 보강 선행(Phase -1).
- **G4**: mastery_test `order_paragraphs` variant 정식 편입 + `paragraphs` union 편입(드롭 필드 제거).
- **G5**: SpanPayload superRefine으로 spanTokens/correctSpan/textFragment 정합 강제, 실패 시 skip.
- **G6**: mastery는 mode-only, coverageRefs.dimension은 흡수 차원(interpret/grammar/order)으로 기록(enum 불변).
- **G7**: grammar_correct가 `transformations`를 직접 소비(transfer 흡수 외 어법 차원 직접 커버).
- **R1/R7(legacy)**: `LEGACY_TYPE_ADAPTERS` + `adaptLegacyPayload` 키 매핑표 + Phase 0 단위테스트 gate.
- **R3**: grammar_correct 복붙 판별을 `sentenceWithError` diff 토큰 임계로.
- **R5**: 힌트 kind별 cost 수치표 + 누적 상한 0.5 확정.
- **R6**: 에뮬레이터 = rule 실제 채점(클라 import) + AI는 배지/대비표(LLM 미호출).
- **R8**: SM-2 시간 단위(6h→24h→72h→168h).
- **R10**: hintsAllowed=false + hidden_hintable → assist 자동 완화.
- **AI UX**: 6초 동기 시도→비동기 강등, 하이브리드 즉답+AI후행, Vercel maxDuration 30s, 학생당 동시 1건.
- **buildSequence**: Phase -1 선행 + 각 Phase acceptance gate(v1 회귀 없음) + 부분 배포 금지.