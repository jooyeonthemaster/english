# 40만 문항 저장 스키마 (정찰 확정본)

> 출처: 정찰 에이전트 `storage`. **코드 직독 + tsx 실행 검증**(structuredData 3종은 실제 파이프라인을
> 돌려 뽑은 실물이다). 모든 주장에 `file:line` 인용이 붙어 있다.
> 전제: [`00-contract.md`](00-contract.md) 의 확정 사실은 재조사하지 않았다.
>
> **한 줄 결론**: `questions` 는 **전 행이 `academyId` NOT NULL** 인 테넌트 테이블이고 플랫폼 공용 슬롯이
> 없다. 40만 문항을 "공용"으로 쌓으려면 **새 플랫폼 테이블**(`ExamPassageWebtoonAsset` 선례)을 surgical
> SQL 로 만들고, 학원 지문함으로는 **복제 적재**해야 한다. 그리고 코퍼스 id ↔ DB Passage 의 대응은
> **`Passage.tags` JSON 안의 `kice:<id>` 문자열 하나뿐**이다 — 컬럼도 인덱스도 없다.

---

## 0. TL;DR — 이 문서가 확정한 6가지

| # | 확정 |
|---|---|
| 1 | `Question` 25필드 · 인덱스 12개. **`academyId` 는 nullable 이 아니다**(`schema.prisma:959`) |
| 2 | `structuredData` = `postProcessQuestion` 산출 + `_typeId`/`_typeLabel`/`_generationPlan`/`difficulty` + 셔플 + `tags`. 실물 3종 채록(§2) |
| 3 | 현재 `.final.jsonl` 은 **`_typeId`·`_typeLabel`·`_generationPlan`·`tags` 4개가 비어 있다** → 그대로 적재하면 카드 렌더·AI 편집이 레거시 폴백을 탄다(§3) |
| 4 | `questions` 에는 **멱등 적재용 자연키가 없다**. `createMany skipDuplicates` 는 유니크가 있어야 동작한다 → surgical SQL 로 `@@unique([academyId, qbankKey])` 신설 필요(§4) |
| 5 | `passages.json` id ↔ DB `Passage` **대응 테이블 없음**. 유일한 끈은 `Passage.tags` 의 `kice:<id>` 리터럴(`exam-passages.ts:203`)이며, **학원마다 별개 Passage 행이 생긴다**(§5) |
| 6 | 플랫폼 공용 선례는 **`ExamPassageWebtoonAsset`**(academyId 없음 + `examPassageId` 유니크 + 별도 학원별 해금 원장). 이 형상이 40만 문항에 그대로 이식 가능(§6) |

---

## 1. `Question` 모델 전 필드 — `prisma/schema.prisma:957-1028`

테이블명 `questions`(`:1027`). Provider = PostgreSQL/Supabase(`:10-13`) → `Json?` 는 **`jsonb`**.

### 1.1 필드 전수 (25개)

| 필드 | 타입 | 필수 | 기본값 | 의미 | 근거 |
|---|---|:--:|---|---|---|
| `id` | String | ✔ | `cuid()` | PK | `:958` |
| `academyId` | String | **✔ (NOT NULL)** | — | **테넌트 소유자.** FK → `academies.id` | `:959`, `:1004` |
| `passageId` | String? | ✖ | null | 원 지문. FK → `passages.id`. **null 허용** = 지문 없는 문항 가능 | `:960`, `:1005` |
| `type` | String | ✔ | — | `"MULTIPLE_CHOICE"｜"SHORT_ANSWER"｜"ESSAY"｜"FILL_BLANK"｜"ORDERING"｜"VOCAB"` (enum 아님, 자유 문자열) | `:961` |
| `subType` | String? | ✖ | null | md-qgen 유형 id (`BLANK_INFERENCE` 등) | `:962` |
| `questionText` | String `@db.Text` | ✔ | — | 학생 표면 발문+지문 직렬화. **`buildGeneratedQuestionText` 가 생성** | `:963` |
| `structuredData` | Json? (`jsonb`) | ✖ | null | 유형별 렌더 정본. **여기가 진짜 문항이다** | `:964` |
| `questionImage` | String? | ✖ | null | 이미지 URL (md-qgen 미사용) | `:965` |
| `options` | String? `@db.Text` | ✖ | null | **JSON 문자열**(`jsonb` 아님) `[{label,text},…]` | `:966` |
| `correctAnswer` | String `@db.Text` | ✔ | — | 정답 문자열. 서술형은 모범답안 사본 | `:967` |
| `points` | Int | ✔ | `1` | 배점. **영어는 항상 1** | `:968` |
| `difficulty` | String | ✔ | `"INTERMEDIATE"` | `BASIC｜INTERMEDIATE｜KILLER` | `:969` |
| `tags` | String? `@db.Text` | ✖ | null | **JSON 배열 문자열** | `:970` |
| `learningCategory` | String? | ✖ | null | `VOCAB｜INTERPRETATION｜GRAMMAR｜COMPREHENSION`. **md-qgen 경로는 안 채운다** | `:971` |
| `aiGenerated` | Boolean | ✔ | `false` | md-qgen 은 항상 `true` | `:972` |
| `approved` | Boolean | ✔ | `false` | 교사 검토 상태 | `:973` |
| `starred` | Boolean | ✔ | `false` | 교사 별표 | `:974` |
| `sourceMaterialId` | String? | ✖ | null | 추출 계보. FK → `source_materials` | `:977`, `:1006` |
| `bundleId` | String? | ✖ | null | FK → `passage_bundles` | `:978`, `:1007` |
| `sourceExtractionItemId` | String? **`@unique`** | ✖ | null | **전역 유니크.** FK 없음 — §4 함정 | `:979` |
| `questionNumber` | Int? | ✖ | null | 원 시험지 인쇄 번호 | `:980` |
| `setId` | String? | ✖ | null | 장문 세트 비정규화 컬럼 | `:983` |
| `inSet` | Boolean | ✔ | `false` | 세트 소속 플래그 | `:984` |
| `similarQuestionGenJobId` | String? | ✖ | null | 동형 생성 잡 귀속(FK 미설정, 인덱스만) | `:988` |
| `customTypeId` | String? | ✖ | null | 커스텀 유형 귀속(FK 미설정, 인덱스만) | `:992` |
| `createdAt` / `updatedAt` | DateTime | ✔ | `now()` / `@updatedAt` | | `:994-995` |
| `deletedAt` | DateTime? | ✖ | null | **소프트 삭제.** 전 정상 읽기 경로가 `deletedAt:null` 로 거른다 | `:1000` |
| `deletedById` | String? | ✖ | null | 삭제 수행 staff.id (FK 미설정) | `:1001` |

### 1.2 관계 (`:1003-1013`)

`academy`(필수) · `passage`(선택) · `sourceMaterial`(선택) · `bundle`(선택) · `setItem`(1:1) ·
`explanation`(1:1 `QuestionExplanation`) · `examLinks[]` · `wrongLogs[]` · `aiConversations[]` ·
`collectionItems[]`.

**cascade 주의**: `QuestionExplanation` 은 `onDelete: Cascade`(`:1044`), `QuestionSetItem` 도 Cascade(`:3596`),
`QuestionCollectionItem` 도 Cascade(`:1817`). `Question` 자신은 `academy`/`passage` 에 대해 cascade 없음.

### 1.3 인덱스 12개 (`:1015-1026`)

```
@@index([academyId])
@@index([passageId])
@@index([academyId, type, difficulty])
@@index([academyId, approved])
@@index([sourceMaterialId])
@@index([bundleId])
@@index([setId])
@@index([similarQuestionGenJobId])
@@index([customTypeId])
@@index([academyId, deletedAt, createdAt])
@@index([deletedAt])
@@index([deletedAt, createdAt])
```
\+ `id` PK, `sourceExtractionItemId` UNIQUE.

> ⚠ **40만 행 적재 시 이 12개 인덱스가 전부 갱신된다.** 대량 적재는 인덱스 DROP → COPY → 재생성이
> 정석이지만, 이 DB 는 프로덕션 공용이라 **DROP 금지**. 대신 배치 삽입 + 인덱스 유지로 간다(§4).
> `subType` 단독 인덱스는 **없다** — 유형별 조회는 `academyId` 인덱스를 타고 필터링한다.

### 1.4 `QuestionExplanation` — `prisma/schema.prisma:1031-1047`

| 필드 | 타입 | 필수 | 의미 | 근거 |
|---|---|:--:|---|---|
| `id` | String | ✔ | PK cuid | `:1032` |
| `questionId` | String **`@unique`** | ✔ | 1문항 = 1해설 | `:1033` |
| `content` | String `@db.Text` | ✔ | 정답 해설 본문 | `:1034` |
| `keyPoints` | String? `@db.Text` | ✖ | **JSON 배열 문자열** | `:1035` |
| `wrongOptionExplanations` | String? `@db.Text` | ✖ | **JSON 문자열** `{"1":"…"}` 또는 배열 | `:1036` |
| `relatedGrammar` | String? `@db.Text` | ✖ | md-qgen 미사용 | `:1037` |
| `difficulty` | String? | ✖ | md-qgen 미사용 | `:1038` |
| `aiGenerated` | Boolean | ✔ (`false`) | md-qgen 은 `true` | `:1039` |
| `approved` | Boolean | ✔ (`false`) | | `:1040` |
| `createdAt`/`updatedAt` | DateTime | ✔ | | `:1041-1042` |

인덱스: `questionId` UNIQUE 뿐(`@@map("question_explanations")` `:1046`). 별도 `@@index` 없음.

### 1.5 `Passage` — `prisma/schema.prisma:644-714`

테이블 `passages`. 필수는 `id`·`academyId`·`title`·`content` 넷뿐(`:645-649`).
나머지 전부 nullable/기본값: `schoolId` `source` `grade` `semester` `unit` `publisher` `difficulty`
`tags`(JSON 문자열) `order`(0) `subject` `sourceMaterialId` `sourceExtractionItemId`(**@unique**)
`contentHash` `sourcePageIndex`(Int[] `[]`) `extractionOutput` `reviewedAt` `reviewedById`.

인덱스 5개(`:708-712`): `[academyId]` `[schoolId]` `[academyId,grade,semester]` `[sourceMaterialId]` `[contentHash]`.

- `subject` 는 **surgical ALTER 로 추가된 컬럼**임이 주석에 명시돼 있다(`:659-662`) —
  `ALTER TABLE passages ADD COLUMN IF NOT EXISTS subject TEXT;` / *migrate deploy·db push 금지*.
- `contentHash` = `sha1(content.replace(/\s+/g," ").trim())` (`src/lib/extraction/promote-m1-drafts.ts:73-76`).
  **단, 기출 지문 등록 경로는 contentHash 를 채우지 않는다**(`src/actions/workbench/exam-passages.ts:206-217` — 미설정 = null).

---

## 2. `structuredData` 에 실제로 들어가는 키 (실물 채록)

### 2.1 생성 규칙 — `question-generation-persistence.ts:208-273`

```ts
const plan = normalizeQuestionGenerationPlan(q._generationPlan ?? generationPlan);   // :209-211
const tags = mergeQuestionGenerationPlanTag(readQuestionTags(q.tags), plan);         // :212
const enriched = { ...q, _generationPlan: plan, tags };                              // :213
…
structuredData: toPrismaJson(enriched)                                               // :256
```
`toPrismaJson` = `JSON.parse(JSON.stringify(value))` (`:23-26`) → **`undefined` 값 키는 전부 사라진다**
(후처리가 `passageWithMarkers: undefined` 같은 삭제 마커를 쓰므로 이게 계약이다 —
`src/lib/question-postprocess/processors/grammar-correction.ts:164-169`).

`q` 는 라우트에서 이렇게 조립된다 — `md-stream/route.ts:1093-1132`:
```
postProcessQuestion 산출
  + _typeId / _typeLabel / _generationPlan / difficulty        (:1095-1098)
  → shuffleQuestionOptionsForDiversity(mapped, subType)        (:1100-1103)
  → { ...finalQuestion, _generationPlan, tags }                (:1128-1132)
```

### 2.2 실물 ① `TITLE` (PASSTHROUGH·객관식) — **확정 산출물 원본**

출처: `qbank/out/2027/2027_06_5095396-q23/TITLE.final.jsonl` 1행 (감독 직접 견본, 게이트 전건 통과).
키 8개. 지문 복사 필드가 **없다**(PASSTHROUGH — `question-postprocess/types.ts:68-82`).

```json
{
  "direction": "다음 글의 제목으로 가장 적절한 것은?",
  "options": [
    { "label": "1", "text": "Why Body Size Decides Between Instinct and Learning" },
    { "label": "2", "text": "Quicker Reflexes Make Small Animals More Adaptable" },
    { "label": "3", "text": "The Energy Cost of Searching for Food and Mates" },
    { "label": "4", "text": "Learning by Trial and Error Beats Preprogrammed Behavior" },
    { "label": "5", "text": "Long-Distance Travel as a Driver of Animal Intelligence" }
  ],
  "correctAnswer": "1",
  "wrongOptionExplanations": {
    "2": "방향반대 — …",
    "3": "도입부함정 — …",
    "4": "관계왜곡 — 가장 매력적인 오답입니다. …",
    "5": "근거없음 — …"
  },
  "explanation": "이 글은 몸 크기가 반사 속도와 수명이라는 …",
  "keyPoints": [],
  "tags": [],
  "difficulty": "KILLER"
}
```
- **선지 라벨이 `"1"~"5"`** (원문자 아님) — 어댑터의 `digitOptionLabel` 축(`adapter.ts:74-78`).
- `wrongOptionExplanations` 가 **Record** 로 정규화돼 있다(`question-postprocess/index.ts:164-167`).
- `keyPoints` 는 **의도적으로 빈 배열** — 합성 금지 결정(`adapter.ts:114-117`, `:319-323`).
- ⚠ `_typeId`/`_typeLabel`/`_generationPlan` **없음** — §3 참조.

### 2.3 실물 ② `BLANK_INFERENCE` (정본·지문 변형) — tsx 실행 채록

지문 `2027_06_5095396-q20`. `gateIssues []` · `adapt ok` · `post ok` 확인. 키 12개.

```json
{
  "direction": "다음 빈칸에 들어갈 말로 가장 적절한 것을 고르시오.",
  "originalExpression": "raise participants' awareness of how these activities enhance their physical performance",
  "blankAnswerMode": "PARAPHRASE",
  "surroundingText": "in physical activities. Instructors must raise participants' awareness of how these activities enhance their physical performance. For example, an instructor could",
  "options": [
    { "label": "①", "text": "make learners conscious of the reasons a drill improves their bodies" },
    { "label": "②", "text": "let learners copy the movements of more experienced participants" },
    { "label": "③", "text": "measure how quickly learners finish each prescribed exercise" },
    { "label": "④", "text": "shorten the warm-up so that learners can train for longer" },
    { "label": "⑤", "text": "separate mental training from physical training entirely" }
  ],
  "correctAnswer": "①",
  "wrongOptionExplanations": { "②": "…", "③": "…", "④": "…", "⑤": "…" },
  "explanation": "이 글은 …",
  "keyPoints": [],
  "tags": [],
  "difficulty": "KILLER",
  "passageWithBlank": "Instructors of physical activities often focus more on … Instructors must _____. For example, an instructor could explicitly explain how warming up before exercising improves their performances. …"
}
```
- **선지 라벨이 `①~⑤` 원문자다** — TITLE 과 축이 다르다. 정본 어댑터는 `o.label` 을 그대로 통과시킨다
  (`adapter.ts:131`). 라벨 축은 **유형마다 다르다**(00-contract §7 의 실증).
- `passageWithBlank` 는 **후처리가 추가**(`adapter.ts:91` 주석, 실측 확인) — 지문 전문 사본이 들어간다.
- `blankAnswerMode` 는 `PARAPHRASE｜SOURCE_EXACT｜DOUBLE_NEGATIVE`(`adapter.ts:99`).

### 2.4 실물 ③ `GRAMMAR_ERROR` (정본·마커형) — tsx 실행 채록

키 11개. `markedExpressions[]` 가 정답의 진실원(`adapter.ts:238-242`).

```json
{
  "direction": "다음 글의 밑줄 친 부분 중, 어법상 틀린 것은?",
  "markedExpressions": [
    { "label": "(A)", "expression": "who study",       "isError": false, "errorExpression": "who study",       "surroundingText": "The researchers who study urban wildlife have discovered that many", "pointCode": "b" },
    { "label": "(B)", "expression": "have discovered", "isError": false, "errorExpression": "have discovered", "surroundingText": "…", "pointCode": "d" },
    { "label": "(C)", "expression": "to open",         "isError": true,  "errorExpression": "opening", "correction": "to open", "surroundingText": "…", "pointCode": "k" },
    { "label": "(D)", "expression": "were designed",   "isError": false, "errorExpression": "were designed",   "surroundingText": "…", "pointCode": "e" },
    { "label": "(E)", "expression": "watch",           "isError": false, "errorExpression": "watch",           "surroundingText": "…", "pointCode": "a" }
  ],
  "correctAnswers": ["(C)"],
  "correctAnswer": "(C)",
  "options": [ { "label": "(A)", "text": "who study" }, … { "label": "(E)", "text": "watch" } ],
  "wrongOptionExplanations": { "(A)": "…", "(B)": "…", "(D)": "…", "(E)": "…" },
  "explanation": "learn 은 to부정사를 목적어로 취하므로 …",
  "keyPoints": [], "tags": [], "difficulty": "INTERMEDIATE",
  "passageWithMarkers": "The researchers __(A) who study__ urban wildlife __(B) have discovered__ … have learned __(C) opening__ containers that __(D) were designed__ … Young animals __(E) watch__ their mothers closely …"
}
```
- `expression` = **원형**(옳은 형태), `errorExpression` = **학생이 보는 형태**. 정답 마커만 둘이 다르다.
- `options[].label` 이 `(A)~(E)` — 어댑터는 `circledForMarkIndex` 로 `①~⑩` 를 넣지만(`adapter.ts:338-343`),
  **후처리가 지문 등장순으로 라벨을 재부여**해 `(A)~(E)` 로 바뀐다(실측). **어댑터 출력 ≠ 저장 형상**.
- `passageWithMarkers` 는 `__(A) 표현__` 형식(`question-postprocess/index.ts:9`의 렌더 계약).

### 2.5 파생 컬럼 계산식 — `question-generation-persistence.ts:249-272`

| 컬럼 | 계산식 | 근거 |
|---|---|---|
| `type` | `Array.isArray(q.options) ? "MULTIPLE_CHOICE" : "SHORT_ANSWER"` | `:253` |
| `subType` | `q._typeId ?? q.subType ?? null` | `:242-247` |
| `questionText` | `buildGeneratedQuestionText(q)` | `:255`, 본체 `:46-162` |
| `structuredData` | `toPrismaJson(enriched)` | `:256` |
| `options` | `Array.isArray(q.options) ? JSON.stringify(q.options) : null` | `:257` |
| `correctAnswer` | `q.correctAnswer ?? q.modelAnswer ?? ""` | `:258-263` |
| `points` | `resolveGeneratedQuestionPoints(q, subType)` → **영어는 항상 1**(KO 만 분기) | `:264`, `:173-180` |
| `difficulty` | `typeof q.difficulty === "string" ? q.difficulty : "INTERMEDIATE"` | `:265-266` |
| `tags` | `JSON.stringify(mergeQuestionGenerationPlanTag(readQuestionTags(q.tags), plan))` | `:267` |
| `aiGenerated` | `true` 고정 | `:268` |
| `approved` | `false` 고정 | `:269` |
| `explanation` | `q.explanation` 이 **비지 않은 문자열일 때만** 중첩 create | `:219-240`, `:270` |

**`type` 이 `SHORT_ANSWER` 가 되는 8유형** (어댑터가 `options` 키를 아예 만들지 않는다):
`CONDITIONAL_WRITING`(`adapter-conditional-writing.ts:14`) · `SENTENCE_TRANSFORM`(`:13`) ·
`WORD_ORDER`(`adapter-word-order.ts:14`) · `SUMMARY_WRITING`(`:15`) ·
`TOPIC_SENTENCE_WRITING`(`:9`) · `SUMMARY_COMPLETE`(`:16`) · `FILL_BLANK_KEY`(`:12`) ·
`GRAMMAR_CORRECTION`(`adapter-grammar-correction.ts:24` + 후처리도 options 미생성
`processors/grammar-correction.ts:154-170`).
→ **나머지 18유형은 `MULTIPLE_CHOICE`.** (단 `ANTONYM`·`IRRELEVANT`·`SENTENCE_INSERT` 는
어댑터가 options 를 만들지 않고 **후처리가 전량 재생성**하므로 최종 판정은 `MULTIPLE_CHOICE`다 —
`adapter-antonym.ts:9`, `adapter-irrelevant.ts:10-12`, `adapter-sentence-insert.ts:10-12`, 실측 확인.)

> **판정 시점 규칙: `type` 은 어댑터 산출이 아니라 `postProcessQuestion` **이후** 객체로 판정하라.**

### 2.6 `explanation` 중첩 create 규칙 (`:219-240`)

```
content                 = q.explanation                       (문자열, trim 후 비면 explanation 행 자체 미생성)
keyPoints               = null | 문자열 그대로 | JSON.stringify(비문자열)
wrongOptionExplanations = null | 문자열 그대로 | JSON.stringify(비문자열)
aiGenerated             = true
```
→ **`wrongOptionExplanations` 는 `structuredData` 안(객체)과 `question_explanations` 컬럼(JSON 문자열)에
2중 저장된다.** 둘이 갈라지면 렌더 표면마다 다른 해설이 뜬다.

---

## 3. JSONL → DB 무손실 적재를 위해 **미리 채워둬야 하는 필드 전수**

### 3.1 ★ 현재 `.final.jsonl` 의 결손 4건 (실측)

`qbank/harness/finalize.ts:236-292` 가 만드는 `FinalQuestion.structuredData` 는
`qgen-core.ts:286-288` 의 `postProcessQuestion` **직후 산출**이다. 라우트가 그 뒤에 하는 일을 **하지 않는다**:

| 결손 | 프로덕션이 하는 일 | 안 하면 생기는 일 |
|---|---|---|
| `_typeId` | `route.ts:1095` | `structuredData._typeId` 부재 → AI 문항 편집이 **레거시 폴백**으로 flat 컬럼 합성(`question-ai-edit.ts:93-129`), 직접 수정 시 구조화 렌더 상실(`workbench/questions.ts:802-805`) |
| `_typeLabel` | `route.ts:1096` (`TYPE_LABELS[subType]`, `generate-questions-auto/_lib/constants.ts:3-29`) | UI 유형 배지 공백 |
| `_generationPlan` | `route.ts:1097` / save 가 `:209-211` 에서 재확정 | save 가 인자 `generationPlan` 으로 채우므로 **적재 함수에 넘기면 무손실** |
| `tags` | save `:212`, `:267` | 빈 배열이면 `["일반 생성"]` 만 남고 **기출 출처(`kice:`)가 통째로 소실** |

`.final.jsonl` 실물로 확인: 최상위 키 = `qid, passage, type, difficulty, tier, point, craft, settings,
markdown, structuredData, hidden, quotes, gate, review, provenance` (`finalize.ts:154-170`),
`structuredData` 키 = `direction, options, correctAnswer, wrongOptionExplanations, explanation,
keyPoints, tags, difficulty` — **`_typeId` 없음 확인.**

### 3.2 ★ 셔플 결손 — 무손실이 아니라 **의도적으로 하지 말아야 한다**

`shuffleQuestionOptionsForDiversity` 는 11유형에만 적용되고(`question-diversity.ts:508-522`:
`TOPIC MAIN_IDEA TOPIC_MAIN_IDEA TITLE CONTENT_MATCH BLANK_INFERENCE IMPLIED_MEANING
CONTEXT_MEANING SYNONYM SUMMARY_COMPLETE_MC GRAMMAR_CHOICE_COMBO`),
내부가 **`Math.random()` 기반 Fisher-Yates** 다(`:524-531`).

→ **적재 시 셔플을 태우면 안 된다**. 이유 3가지:
1. **비결정적** — 재적재가 멱등이 아니게 된다(같은 JSONL 이 매번 다른 정답 위치를 만든다).
2. qbank 은 유닛 내 **정답 위치 배분을 설계로 통제**한다(품질헌법 §7 표층 형식 축). 랜덤 셔플이 그걸 지운다.
3. 해설이 `①` 같은 원문자로 선지를 지칭하면 재매핑이 돌지만, 지칭이 평숫자면 셔플이 **조용히 포기**한다
   (`:590-594`) — 유형별로 적용/미적용이 갈려 산출이 불균일해진다.

**결정 권고**: 셔플은 **finalize 단계에서 시드 PRNG 로 1회 수행해 JSONL 에 굳힌다**(재현 가능),
적재기는 절대 셔플하지 않는다.

### 3.3 무손실 적재를 위한 JSONL 레코드 스키마 (권고 확정본)

`saveGeneratedQuestionsForJob` 을 그대로 재사용할 수 있게 하는 최소·완전 집합이다.
**`q` 하나만 있으면 나머지는 전부 결정론적으로 파생된다.**

```jsonc
{
  // ── ① 적재 키 (DB 밖 원장) ──────────────────────────────────────
  "qid":            "2027_06_5095396-q23:TITLE:1",   // finalize.ts:237 형식
  "examPassageId":  "2027_06_5095396-q23",           // 코퍼스 id — §5 링크 키
  "subType":        "TITLE",
  "itemIndex":      1,
  "unitHash":       "sha1(md 유닛 본문)",             // 재저작 감지용(권고 신설)

  // ── ② saveGeneratedQuestionsForJob 이 그대로 먹는 객체 ────────────
  "q": {
    // postProcessQuestion 산출 전부 (유형별 키 — §2)
    "direction": "...", "options": [...], "correctAnswer": "...",
    "wrongOptionExplanations": {...}, "explanation": "...",
    "keyPoints": [], "difficulty": "KILLER",
    // ★ 반드시 미리 박아야 하는 4개
    "_typeId":        "TITLE",
    "_typeLabel":     "제목 추론",              // TYPE_LABELS[subType]
    "_generationPlan":"STANDARD",              // normalizeQuestionGenerationPlan 통과값
    "tags": ["kice:2027_06_5095396-q23", "qbank", "수능기출", "2027", "6월", "제목"]
  },

  // ── ③ 적재 파라미터 (호출 인자) ──────────────────────────────────
  "generationPlan": "STANDARD",
  "points":         1,                          // 영어 고정. q.points 를 넣지 말 것(KO 분기 오작동)
  "approved":       false,                      // save 가 false 고정 — 승인은 별도 UPDATE
  "learningCategory": null                      // save 미설정. 필요하면 적재 후 UPDATE

  // ── ④ 감사 메타 (DB 미적재, 원장 보존) ───────────────────────────
  , "provenance": { "authoredAt": "...", "gatedAt": "...", "finalizedAt": "...",
                    "harnessVersion": "qbank-harness/1.0", "reviewed": true },
  "review": { "grade": "A", "blindSolve": {...}, "decoy": {...}, "findings": [] },
  "point": "…", "craft": "…", "settings": {}, "tier": "S",
  "markdown": "…원본 md…",                       // 재생성 가능성 보존 — 이것만 있으면 전부 복원된다
  "hidden": { "asset": "...", "spans": [...], "resolved": true }
}
```

### 3.4 채워두지 **않아도** 무손실인 필드 (save 가 결정론 파생)

`type` · `questionText` · `options`(문자열화) · `correctAnswer` · `structuredData` · `tags`(문자열화) ·
`aiGenerated` · `approved` — 전부 `question-generation-persistence.ts:249-272` 가 `q` 로부터 만든다.
**JSONL 에 미리 넣어봐야 무시되거나 이중 진실원이 된다. 넣지 마라.**

### 3.5 save 가 **절대 채우지 않는** 컬럼 (필요하면 별도 UPDATE)

`questionImage` · `learningCategory` · `starred` · `sourceMaterialId` · `bundleId` ·
`sourceExtractionItemId` · `questionNumber` · `setId` · `inSet` · `similarQuestionGenJobId` ·
`customTypeId` · `deletedAt` · `deletedById`
→ 전부 null/false 로 들어간다. 장문(153지문) 을 세트로 묶으려면 `QuestionSet`/`QuestionSetItem` 을
**별도 트랜잭션으로** 만들어야 한다(`schema.prisma:3552-3601`).

### 3.6 실측 바이트 (tsx 로 `buildGeneratedQuestionText` 를 실제 호출해 계측)

| 유형 | dbType | questionText | options | structuredData | explanation | wrongOptExpl | **행 합계** |
|---|---|---:|---:|---:|---:|---:|---:|
| `TITLE`(확정 산출물 실물) | MC | 51 | 380 | 2,193 | 529 | 1,008 | **4,161** |
| `TITLE` 6문항 평균 | MC | — | — | — | — | — | **3,898** |
| `BLANK_INFERENCE` | MC | 930 | 436 | 2,739 | 478 | 301 | **4,884** |
| `SENTENCE_INSERT` | MC | 1,124 | 136 | 2,605 | 365 | 422 | **4,652** |
| `GRAMMAR_ERROR` | MC | 606 | 180 | 2,498 | 101 | 220 | **3,605** |

→ **문항당 약 4~5 KB.** `unit-plan.json` 의 목표 **603,106 문항** 기준
**약 2.6~3.0 GB**(TOAST 압축 전, 인덱스 제외). Supabase 용량 계획에 반드시 반영할 것.
`.final.jsonl` 은 문항당 평균 5,269 B(TITLE 실측) → **전량 약 3.2 GB**, `/qbank/out/` 은
git 제외돼 있다(`.gitignore:177-180`).

---

## 4. 멱등 적재 선례와 surgical SQL 규약

### 4.1 ★ `questions` 에는 멱등 적재용 자연키가 없다

`createMany({ skipDuplicates: true })` 는 **유니크 제약이 있어야만** 중복을 건너뛴다.
`questions` 의 유니크는 `id`(cuid, 매번 새로 생성)와 `sourceExtractionItemId` 둘뿐이다.
→ **현 상태로 `createMany skipDuplicates` 를 쓰면 재실행 때 40만 행이 통째로 중복 삽입된다.**

### 4.2 리포의 멱등 선례 3종 (전부 유니크 전제)

| 선례 | 유니크 | 방식 | 근거 |
|---|---|---|---|
| 폴더 담기 | `@@unique([collectionId, questionId])` (`schema.prisma:1819`) | `createMany skipDuplicates` + **삽입 전 기존 조회로 실제 삽입분 계산**("skipDuplicates 는 어떤 행이 스킵됐는지 알려주지 않는다") | `src/actions/workbench/collections-question.ts:226`, `:247-253` |
| 시험지 문항 | `examQuestion` 유니크 | `createMany skipDuplicates` | `src/actions/exams/questions.ts:54-61` |
| M1 draft 재커밋 | `@@unique([jobId, passageOrder])` | `createMany skipDuplicates` = **더블파이어 안전망** | `src/trigger/_lib/extraction-finalize/m1-drafts/persist.ts:141-151` |

### 4.3 ★ 가장 정확한 선례 — `createOrReuseQuestion` (전역 유니크의 함정 포함)

`src/app/api/extraction/jobs/[jobId]/commit/_lib/create-or-reuse-question.ts:70-125`

```
1) 유니크 키가 있으면 findFirst({academyId, key}) → 있으면 reuse(또는 overwrite)
2) 없으면 create
3) P2002(유니크 위반) 캐치 → 같은 학원 winner 재조회 → reuse
4) winner 가 없으면 = 다른 학원이 그 키를 쥐고 있다 → 403 ERR_CROSS_TENANT
```

> ### ⚠ 여기서 배울 결정적 교훈
> `Question.sourceExtractionItemId` 는 **`@unique`(전역)** 이다(`schema.prisma:979`). 그래서
> "같은 원천을 두 학원이 쓰면 나중 학원이 막힌다"는 크로스테넌트 사고가 **이미 코드에 명문화돼 있다**
> (`:116-122`). **40만 문항 키를 전역 유니크로 만들면 정확히 같은 사고가 4,537배로 재현된다.**
> 반드시 **`UNIQUE(academyId, qbankKey)` 복합 유니크**로 만들어라.

### 4.4 권고 DDL (surgical SQL)

```sql
-- prisma/migrations-manual/2026xxxx_qbank_question_key.sql
-- 적용: npx prisma db execute --file <this> --schema prisma/schema.prisma
-- ⚠ prisma migrate deploy / db push 금지 (마이그레이션 드리프트)
ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "qbankKey" TEXT;

-- 학원 내 유일. NULL 은 Postgres 유니크에서 중복 허용 → 기존 행 무영향.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "questions_academyId_qbankKey_key"
  ON "questions"("academyId", "qbankKey")
  WHERE "qbankKey" IS NOT NULL;

-- 유형·기출 지문 단위 조회(40만 행 필터)를 위한 보조 인덱스
CREATE INDEX CONCURRENTLY IF NOT EXISTS "questions_academyId_subType_idx"
  ON "questions"("academyId", "subType") WHERE "deletedAt" IS NULL;
```
`qbankKey` 값 = `FinalQuestion.qid` 그대로(`<examPassageId>:<subType>:<itemIndex>`, `finalize.ts:237`).
`CONCURRENTLY` 는 트랜잭션 밖에서 실행해야 하며 `prisma db execute` 는 파일을 트랜잭션으로 감싸지
않으므로 그대로 쓸 수 있다 — **다만 프로덕션 실행 전 staging 검증 필수** (`docs/_p7-restore-choice-spec.md:385`).

### 4.5 surgical SQL 규약 (리포 확정 관례 — `prisma migrate` 금지)

| 규약 | 근거 |
|---|---|
| **신규 테이블·컬럼은 `prisma db execute` 만.** `migrate`/`db push` 금지 | `docs/study-os-spec.md:245`, `docs/worksheet-study-spec.md:338-342` |
| **`prisma migrate deploy` 금지** — dev DB 가 기록 마이그레이션보다 앞서 실패한다 | `docs/printable-coupon-plan-smoat.md:334-338` |
| **`prisma migrate dev` 는 reset 위험** — raw DDL 을 `db execute` 로, `schema.prisma` 는 컬럼만 추가 후 `prisma generate` 로 클라이언트만 갱신 | `docs/_p7-restore-choice-spec.md:177-188` |
| 인덱스 추가도 `db execute`, `migrate deploy` 금지 | `IMPROVEMENT_AUDIT.md:167` |
| SQL 파일 위치·형식: `prisma/migrations-manual/YYYYMMDD_<name>.sql`, **따옴표 camelCase + `IF NOT EXISTS` + 인덱스 포함** | `docs/worksheet-study-spec.md:390-392`, 실물 21개 파일 |
| 또는 `scripts/sql/<name>.sql` (KO 계열 관례) | `schema.prisma:1796` |
| 스키마 주석에 ALTER 문을 **박아 둔다**(다음 사람이 재현 가능하게) | `schema.prisma:659-662`, `:1794-1798`, `:3565-3568` |
| **관계는 FK 없이 soft-ref** 로 두는 것이 하우스 스타일 | `docs/worksheet-study-spec.md:338-339` |

`package.json` 에 `db:migrate = prisma migrate dev` 스크립트가 **존재하지만 이 프로젝트에서는 쓰지 않는다.**

### 4.6 적재 실행 형태 권고

`saveGeneratedQuestionsForJob` 은 **문항마다 `tx.question.create` 를 도는 루프**다(`:275-283`).
40만 건에 그대로 쓰면 40만 라운드트립 + 단일 트랜잭션 타임아웃이다.

- 기존 함수를 **재사용하되 청크**: 유닛(5~8문항) 단위 호출, 학원 1곳 기준 약 11만 트랜잭션.
- 또는 `createManyAndReturn`(리포 선례: `src/actions/study-assignments/mutations.ts:231`,
  `src/actions/exam-report/students.ts:51`) 으로 `questions` 를 배치 삽입한 뒤,
  반환 id 로 `questionExplanation.createMany` 를 2차 배치.
  이 경우 `type`/`questionText`/`options`/`tags` 계산식(§2.5)을 **적재기가 직접 복제해야 하며,
  복제하는 순간 계약이 두 벌이 된다** — 정확도 우선이면 기존 함수 재사용을 권한다.
- `skipPassageEligibilityCheck: true` 를 반드시 넘겨라(`:187`, `:197-205`). 안 넘기면 문항마다
  `passage.findFirst` 가 한 번 더 돈다.
- 트랜잭션 타임아웃 상수: `QUESTION_PERSISTENCE_TRANSACTION_TIMEOUT_MS`(`:282`,
  `src/lib/concurrency-config.ts`).

---

## 5. `passages.json` id ↔ DB `Passage` 대응 — **대응 테이블은 없다**

### 5.1 확정 사실

- 코퍼스는 **정적 JSON 이며 DB 에 미러가 없다.** `src/lib/exam-passages/corpus.ts:8-9` 가
  `passages.json`(4,537건) + `facets.json` 을 모듈 스코프에 적재하고, `BY_ID` Map 으로만 조회한다(`:29`, `:115-126`).
  `import "server-only"`(`:1`) — 서버 전용.
- `passages.json` 레코드 = `{ id, examId, year, exam, form, board, era, qNumbers[], type, typeGroup,
  answer, reconstructionKind, confidence, hasDeliberateError, wordCount, text, grade }`
  (`src/lib/exam-passages/types.ts:9-43`, 실측 일치).
- **DB `Passage` 에는 `examPassageId` 컬럼이 없다**(`schema.prisma:644-682` 전수 확인).
- 유일한 대응 수단은 **`Passage.tags` JSON 배열 안의 `kice:<코퍼스id>` 문자열**:
  `src/actions/workbench/exam-passages.ts:27`(`KICE_TAG_PREFIX = "kice:"`), `:198-204`(태그 생성),
  `:92-111`(멱등 판정 — `tags: { contains: "kice:" }` LIKE 스캔 후 JSON 파싱).
- 부차 흔적: `ExtractionM1PassageDraft.metadata.examPassageId`(`exam-passages.ts:233-243`, `Json` 컬럼).

### 5.2 ★ 결정적 함의 — **지문 행은 학원마다 별개다**

`importExamPassages` 는 호출한 스태프의 `academyId` 로 **새 `Passage` 를 만든다**(`:206-217`).
같은 기출 지문을 10개 학원이 불러오면 **`passages` 에 10행**이 생기고 id 는 전부 다르다.
→ **"코퍼스 id → Passage.id" 는 함수가 아니라 `(academyId, 코퍼스id) → Passage.id` 관계다.**

또한 이 경로는 `contentHash` 를 **채우지 않는다**(`:206-217` 미설정) → 본문 해시로 역추적하는
우회로도 현재는 막혀 있다.

### 5.3 40만 문항을 지문에 연결하려면 — 설계 제안 3안

#### A안 (최소 변경·권고) — 학원 지문함 복제 + tags 조회
1. 적재 대상 학원에 대해 `importExamPassages(examPassageIds)` 를 먼저 돌려
   4,474개 지문을 그 학원 지문함에 만든다(이미 검증된 경로, 멱등 — `:20`, `:92-121`).
2. 그 학원의 `passages` 에서 `tags` 를 전수 읽어 `Map<코퍼스id, Passage.id>` 를 메모리에 구축.
   (`:92-111` 과 동일한 파싱. 4,537행 스캔이라 1회 비용 무시 가능.)
3. 그 맵으로 40만 문항의 `passageId` 를 채워 적재.

- **장점**: DDL 0건. 기존 렌더·시험지·학습지 경로가 전부 그대로 동작.
- **단점**: 학원마다 4,474 Passage + 40만 Question 복제 → 학원 1곳당 **약 3 GB**.
  다학원 확산이 곧 용량 폭발. 그리고 §5.2의 LIKE 스캔은 인덱스를 타지 않는다.

#### B안 (권고 — 링크 컬럼 신설) — 조회를 O(1) 로
```sql
ALTER TABLE "passages" ADD COLUMN IF NOT EXISTS "examPassageId" TEXT;
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "passages_academyId_examPassageId_key"
  ON "passages"("academyId", "examPassageId") WHERE "examPassageId" IS NOT NULL;
```
+ `schema.prisma` 에 컬럼만 추가하고 `prisma generate`(`docs/_p7-restore-choice-spec.md:177-188` 관례).
+ 백필: 기존 `kice:` 태그를 파싱해 1회 UPDATE.
+ `importExamPassages` 에 한 줄 추가(태그는 **유지** — 기존 멱등 로직 무회귀).

- **장점**: 대응이 컬럼·인덱스가 되어 조인 가능. tags 파싱 의존 제거.
- **단점**: 프로덕션 DDL 2건 + 코드 1곳 수정.

#### C안 (플랫폼 공용) — §6 과 한 몸. 지문도 플랫폼 테이블로
`exam_passage_questions`(신설, academyId 없음) 가 `examPassageId` 를 **직접** 들고,
`Passage` 를 아예 참조하지 않는다. 코퍼스가 이미 본문의 진실원이므로 지문 행이 불필요하다.
- **장점**: 용량 1벌. 학원 수와 무관.
- **단점**: 기존 렌더/시험지/학습지 경로가 전부 `Question.passage` 조인을 전제한다 →
  **소비 표면 신설이 필요**하다(범위가 커진다). [미상] 정확한 소비 표면 수는 렌더 정찰(`12-*`) 소관.

> **정찰 권고**: **B안으로 링크를 만들고, 1차 적재는 A안(단일 학원)으로 간다.**
> 다학원 판매 국면에 진입할 때 C안(§6)으로 승격한다. B안은 C안의 전제조건이기도 하다.

### 5.4 `problems.json` — 구조와 판정

- **형상**: 배열이 아니라 **지문 id 를 키로 하는 객체**. 3,584 키(= 전부 `passages.json` id 의 부분집합, 교차검증 완료).
  `passages.json` 4,537건 중 **953건은 대응 엔트리가 없다.**
- **엔트리 스키마(3,584건 전부 동일)**: `{ examId, rawProblems[], answerKey, sourcePdf }`
  - `rawProblems[]` 항목: `{ qNum, kind, stem, choices[], point }`(3,288건) +
    변종 `markers`(313) / `bracketChoices`(126) / `letterMarkers`(25).
  - `answerKey`: `{ "20": 3 }` 형태.
- **앱이 읽지 않는다.** `corpus.ts` 는 `passages.json`·`facets.json` 만 import 한다(`:8-9`).
  `@/data/exam-passages/problems.json` 을 import 하는 소스 파일 **0건**(전수 grep).
  국어(`exam-passages-korean`)와 수능완성(`suneung-wanseong`)만 배선돼 있다.
- **품질**: `qbank/JOURNAL.md:166-169` 가 이미 기각했다 — PDF 추출 노이즈로 stem 과 choices 가
  **서로 다른 문항의 것**인 표본이 있다. 저작 입력으로 쓰지 마라.
- 실측 확인(표본 `2027_06_5095396-q20`): 5번 선지 끝에 듣기평가 안내문
  `"이제 듣기 문제가 끝났습니다. 18번부터는 …"` 이 그대로 붙어 있다 → **노이즈 실증.**

---

## 6. `academyId` 스코프 — 소유권과 공용화 설계

### 6.1 확정: `Question` 은 예외 없이 학원 소유다

- `academyId String` **NOT NULL** + FK(`schema.prisma:959`, `:1004`), `Academy.questions Question[]`(`:51`).
- 전 읽기 경로가 `academyId` 로 잠긴다 — 표본:
  `src/actions/workbench/question-cards.ts:69`(`where: { …, academyId: staff.academyId, deletedAt: null }`),
  `src/actions/workbench/questions.ts:144`·`:168`·`:192`(삭제/복원/영구삭제 전부 소유 확인 선행),
  `src/actions/admin/content.ts:139`(관리자조차 `academyId` 인자 필수).
- `saveGeneratedQuestionsForJob` 은 `academyId` 를 **필수 인자**로 받고(`:183`),
  기본 경로에서 `passage` 의 소유까지 검증한다(`:197-205`).
- → **"플랫폼 공용 문항"이라는 개념이 `questions` 테이블에는 존재하지 않는다.**

### 6.2 ★ 리포에 이미 있는 플랫폼 공용 선례 2종

| 모델 | academyId | 키 | 성격 | 근거 |
|---|:--:|---|---|---|
| **`ExamPassageWebtoonAsset`** | **없음** | `@@unique([examPassageId, language, style])` | *"Platform-owned, pre-generated … for static 수능·모평 기출 passages"* — 승인(`status='APPROVED'`) 전까지 잠김 | `schema.prisma:3971-4007`, `prisma/migrations-manual/20260708_exam_passage_webtoon_assets.sql` |
| `ExamPassageWebtoonPurchase` | 있음 | `@@unique([academyId, examPassageId, language, style])` | **학원별 해금 원장**(크레딧 거래 1:1) | `schema.prisma:4011-4028` |
| `SuneungPassage` / `SuneungQuestion` | **없음** | — | 플랫폼 학습 문제. **단 `structuredData` 컬럼이 없다** → md-qgen 형상 수용 불가 | `schema.prisma:1962-1981`, `:2141-2165` |

> **`ExamPassageWebtoonAsset` + `…Purchase` 2테이블 패턴이 정답 형상이다.**
> "플랫폼이 코퍼스 id 로 자산을 1벌 보유 + 학원은 해금 원장으로 접근" — 40만 문항에 그대로 이식된다.

### 6.3 공용으로 쌓으려면 — 무엇을 어떻게

#### 0단계 (선결 결정): **누구 소유인가**
- 40만 문항은 **플랫폼(운영사) 저작물**이다(Opus 5 에이전트 저작, 학원 크레딧 미소모).
  특정 학원의 `academyId` 로 쌓으면 그 학원이 편집·삭제·소프트삭제할 수 있고(`questions.ts:144-215`),
  **다른 학원은 영원히 못 본다.**

#### 1안 — **플랫폼 테이블 신설 (권고)**
```sql
-- prisma/migrations-manual/2026xxxx_exam_passage_questions.sql
CREATE TABLE IF NOT EXISTS "exam_passage_questions" (
  "id"              TEXT PRIMARY KEY,
  "examPassageId"   TEXT NOT NULL,          -- 코퍼스 id (FK 없음 — soft-ref 하우스 스타일)
  "subType"         TEXT NOT NULL,
  "itemIndex"       INTEGER NOT NULL,
  "type"            TEXT NOT NULL,          -- MULTIPLE_CHOICE | SHORT_ANSWER
  "questionText"    TEXT NOT NULL,
  "structuredData"  JSONB,
  "options"         TEXT,                   -- JSON 문자열 (questions 와 동일 형상 유지)
  "correctAnswer"   TEXT NOT NULL,
  "points"          INTEGER NOT NULL DEFAULT 1,
  "difficulty"      TEXT NOT NULL DEFAULT 'INTERMEDIATE',
  "tags"            TEXT,                   -- JSON 배열 문자열
  "explanation"     TEXT,
  "keyPoints"       TEXT,
  "wrongOptionExplanations" TEXT,
  "point"           TEXT,                   -- 출제 포인트(다각화 추적)
  "grade"           TEXT, "year" INTEGER, "typeGroup" TEXT,   -- 코퍼스 메타 비정규화(필터용)
  "reviewGrade"     TEXT,                   -- A|B|C
  "status"          TEXT NOT NULL DEFAULT 'DRAFT',  -- DRAFT|APPROVED (웹툰 선례)
  "harnessVersion"  TEXT,
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS "exam_passage_questions_key"
  ON "exam_passage_questions"("examPassageId","subType","itemIndex");
CREATE INDEX IF NOT EXISTS "exam_passage_questions_examPassageId_idx" ON "exam_passage_questions"("examPassageId");
CREATE INDEX IF NOT EXISTS "exam_passage_questions_subType_idx"       ON "exam_passage_questions"("subType");
CREATE INDEX IF NOT EXISTS "exam_passage_questions_status_idx"        ON "exam_passage_questions"("status");
CREATE INDEX IF NOT EXISTS "exam_passage_questions_year_grade_idx"    ON "exam_passage_questions"("year","grade");
```
- **적재 = `createMany({ skipDuplicates: true })` 가 그대로 동작한다**(유니크가 있으므로). 완전 멱등.
- 학원이 "내 문제함에 담기"를 누르면 → 그 학원의 `Passage` 를 `importExamPassages` 로 확보하고,
  `exam_passage_questions` 행을 `questions` 행으로 **복사**한다(`ExamPassageWebtoonPurchase` 대응 원장 선택).
  이 복사 시점에만 `saveGeneratedQuestionsForJob` 계산식(§2.5)을 재사용하면 두 벌 계약을 피할 수 있다.
- **장점**: 저장 1벌(3 GB), 학원 수 무관, 승인 게이팅·과금 훅이 웹툰 선례 그대로.
- **단점**: 소비 표면(카드·시험지·학습지) 신설·분기 필요. 범위 큼.

#### 2안 — **플랫폼 계정 학원 + 복제 배포 (즉시 실행 가능)**
`academies` 에 `slug='__platform_qbank'`(+ 유니크 `code` CHAR(4) `:30`) 행을 1개 만들고
그 `academyId` 로 40만 문항을 쌓는다. 학원 배포는 행 복제.
- **장점**: DDL 0건(§4.4의 `qbankKey` 만 추가). 전 소비 표면이 **즉시** 동작한다.
- **단점**: 배포 학원 수 × 3 GB. 그리고 플랫폼 계정이 실 학원 목록·통계·과금 집계에 섞인다
  (`admin/dashboard.ts:145-148`, `admin/stats.ts:29` 는 academyId 필터 없이 전역 count 를 낸다 → **오염**).
  섞이지 않게 하려면 `Academy.status` 에 새 값을 도입하고 집계 쿼리를 손봐야 한다.

#### 3안 — 하이브리드 (**최종 권고**)
1. **지금**: 1안의 `exam_passage_questions` 를 **정본 저장소**로 만들고 적재한다(멱등·1벌·과금 무관).
   `.final.jsonl` → 이 테이블로 가는 로더는 순수 배치라 오늘 바로 짤 수 있다.
2. **표면**: 학원 소비는 §6.3-1안의 **복사 경로**(`exam_passage_questions` → `questions`) 하나만
   신설한다. 이 복사기가 §2.5 계산식의 유일한 재구현 지점이 되게 묶는다.
3. **과금**: `ExamPassageWebtoonPurchase` 를 그대로 본떠 `exam_passage_question_unlocks` 를 둔다
   (`@@unique([academyId, examPassageId, subType])`).

### 6.4 학원 스코프에서 반드시 지켜야 할 것 (적재기 체크리스트)

- [ ] `academyId` 는 **인자로 명시**한다. 세션에서 끌어오지 마라(배치는 세션이 없다).
- [ ] `skipPassageEligibilityCheck: true` 를 넘기되, **적재 전에 `passageId` 가 그 학원 소유인지 직접 검증**하라
      (플래그가 검증을 끄기 때문이다 — `question-generation-persistence.ts:187`, `:197-205`).
- [ ] 크로스테넌트 유니크를 만들지 마라(§4.3). 반드시 `(academyId, key)` 복합.
- [ ] `deletedAt` 은 건드리지 마라. 소프트 삭제가 유일한 삭제 경로다(`schema.prisma:997-1001`).
- [ ] `approved: false` 로 들어간다(`:269`). 40만 문항을 승인 상태로 넣고 싶으면
      적재 후 별도 `updateMany` — 하지만 **검수 통과분만** 승인해야 한다(품질헌법 §8).

---

## 7. 남은 미상 / 후속 정찰이 확인할 것

| # | 항목 | 상태 |
|---|---|---|
| 1 | 프로덕션 `questions` 실제 행수·현재 DB 용량·Supabase 플랜 한도 | **[미상]** — 프로덕션 DB 미접근 |
| 2 | 프로덕션 `questions` 테이블에 schema.prisma 에 없는 컬럼이 있는지(드리프트) | **[미상]** — `db execute` 관례상 있을 수 있다. 적재 전 `\d questions` 실측 필수 |
| 3 | 등록 학원 수(2안 용량 계산의 계수) | **[미상]** |
| 4 | `Question.structuredData` 를 소비하는 렌더 표면 전수 | 렌더 정찰(`12-*`) 소관 — 본 문서는 저장까지만 |
| 5 | 장문(153지문·`-q41-42`) 을 `QuestionSet` 으로 묶을지 | 미결. `QuestionSet` 도 `academyId` 필수(`schema.prisma:3555`) |
| 6 | 셔플 시드화(§3.2)를 finalize 에 넣을지 | 감독 결정 필요 |

---

## 부록 A. 검증 방법 (재현 절차)

`structuredData` 실물 3종은 다음으로 채록했다(임시 스크립트는 조사 후 삭제).

```
qbank/harness/canon.ts     getCanonLane("BLANK_INFERENCE"|"GRAMMAR_ERROR")
src/lib/md-qgen/lane-sentence-insert.ts  SENTENCE_INSERT_MD_LANE
  → lane.parseAndGate(md, ctx)        // gateIssues [] 확인
  → lane.adapt(parsed, ctx)           // ok 확인
  → postProcessQuestion(subType, passage, aiQuestion)   // success 확인
  → JSON.stringify(pp.data)
```
- BLANK 픽스처 지문 = 코퍼스 실물 `2027_06_5095396-q20`.
- SENTENCE_INSERT 픽스처 = `qbank/work/_probe-SENTENCE_INSERT.ts` 재사용.
- GRAMMAR 픽스처 = `scripts/_test-md-multi-formats.ts:206-383` 리포 픽스처 재현.
- 바이트 계측은 `buildGeneratedQuestionText` 를 **실제로 호출**해 얻었다(추정치 아님).
