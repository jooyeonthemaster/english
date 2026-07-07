# SALVAGE_RELAXABLE_CODES 과완화(too-loose) 적대 감사

- 대상: `src/app/api/ai/generate-questions-auto/_lib/run-question-generation-constants.ts:452` `SALVAGE_RELAXABLE_CODES`
- 판정 기준: **경고 부착 출하 시 "틀린 문항"(무정답/복수정답 시비/정답 노출/렌더 파손/발문 불성립/채점 불능)이 학생에게 갈 수 있는가?** 갈 수 있으면 F급(제거).
- 강등 소비처 2곳(둘 다 확인):
  - `run-question-generation.ts:641-651` — scarce 모드에서 error→비차단(경고 전환은 :653-658).
  - `run-question-generation-helpers.ts:105-108` — 거절 풀 재승인: blockingCodes 가 **전부** SALVAGE 셋이면 LLM 재검증 없이 notice 붙여 출하.

## 감사에서 드러난 구조적 사실 (판정 전제)

1. **SHIP_FIRST 이중 강등**: `src/lib/question-quality/core.ts:30-65`의 36개 코드는 `dispatcher.ts:823-829`에서 이미 전역(strict 포함) error→warning 강등된다. 이 코드들이 SALVAGE 셋에 들어 있어도 **아무 행동 변화가 없는 dead entry** 다(위험 0, 단 목록 오독 위험만 있음).
   - 예외: KILLER IMPLIED_MEANING 7코드는 `dispatcher.ts:832-852`로 error 유지되지만, constants 의 SHIP_FIRST 차감(`:356-358`)으로 RELAXED_BLOCKING 에서 빠져 relaxed 단계에서 이미 비차단 — salvage 와 무관(기존 동작).
2. **RELAXED_BLOCKING 미등록 코드**: `grammar-decoy-point-monotony`, `grammar-killer-thin-connector`, `grammar-category-mislabel` 은 RELAXED_BLOCKING 리터럴에 없어 relaxed 단계에서 이미 비차단 → salvage 등재는 no-op.
3. 따라서 **실제로 이번에 error→경고출하로 뒤집히는 코드**만이 위험 표면이다(아래 표의 "실강등" 표기).

---

## 1. F급 — SALVAGE 에서 제거해야 하는 코드

| 코드 | 검증기 | 판정 | 근거 |
|---|---|---|---|
| `blank-paraphrase-verb-form-slot-mismatch` | `validators/blank/paraphrase.ts:202` (`findBlankParaphraseSlotIssue`) | **제거(F)** | **정답 선지**의 문법 파손을 잡는 게이트. 빈칸 왼쪽이 `to` 로 끝나는데 정답이 동명사구로 시작 → 정답 삽입 시 비문. |
| `blank-paraphrase-clause-slot-mismatch` | `validators/blank/paraphrase.ts:214` | **제거(F)** | 동일 함수, 동일 방향 — 정형절 슬롯(문두)에 동명사구 **정답** → 정답 삽입 시 비문/단편문. |
| `negative-paraphrase-stacked-prepositions` | `validators/blank/inference-distractor.ts:108` (`findNegativeParaphraseSlotIssue`) | **제거(F)** | **정답 선지** 삽입 시 전치사 중복("achieved by + by ~ = by by") 비문. 같은 함수의 4형제(copula/verb-slot/modal-be/no-subject-double-negation)는 전부 F 잔류인데 이것만 강등 — 비일관. |
| `writing-answer-verbatim-copy` | `dispatcher.ts:1002-1020` (emit :1015) | **제거(F)** | 정답 노출. 발화 유형 SUMMARY_WRITING·TOPIC_SENTENCE_WRITING·WORD_ORDER·SUMMARY_COMPLETE 는 `passage-policy.ts:48-62` `INLINE_SOURCE_PASSAGE_SUBTYPES` — **원본 지문이 문항 안에 인라인 렌더**(WORD_ORDER 는 HIDEABLE 이지만 기본 ON, SUMMARY_WRITING 은 토글 불가 강제). 게이트 발화 = 정답 내용토큰 80%+ 가 그 보이는 지문에 **연속 verbatim run**. |
| `cond-writing-verbatim-answer` | `dispatcher.ts:1002-1020` (emit :1014) | **제거 권고(조건부 F)** | CONDITIONAL_WRITING 은 `passage-policy.ts:176-181` `ANSWER_BEARING_SOURCE_SUBTYPES` 라 **기본 지문 미동봉** → 기본 경로 노출 없음. 그러나 (a) `HIDEABLE_SOURCE_PASSAGE_SUBTYPES`(`:150-157`) 토글로 출제자가 지문 재동봉 시 정답 문장 그대로 노출, (b) `dispatcher.ts:962-967` 주석은 아직 "INLINE 노출" 전제로 작성돼 정책 드리프트 중, (c) 형제 코드 `writing-answer-verbatim-copy` 와 같은 결함 클래스. 일관성·안전 우선으로 제거 권고. |

### 제거 판정 상세 시나리오

**`blank-paraphrase-verb-form-slot-mismatch`** — 지문: "...technology forces us to _____." (originalExpression = "rethink how we learn"). LLM 정답 선지: "developing a completely new perspective". salvage 출하 시 학생 표면: 정답을 넣으면 *"forces us to developing a completely new perspective"* — 비문. 문법을 아는 학생일수록 의도된 정답을 **문법으로 소거**한다 → 남는 선지 중 정답이 없음(무정답 시비) 또는 이의제기. 이 게이트는 오답 함정 매력도가 아니라 **정답 성립 자체**를 지키는 게이트다. 참고: 26-06 SHIP_FIRST 151코드 전수감사에서도 `subject-slot-mismatch` 만 B(취향)로 강등하고 이 두 코드는 **의도적으로 차단 유지**했다(`core.ts:19-28` 주석의 "정답 유효성/명료성을 해치는 인접 코드는 의도적으로 제외" 원칙).

**`blank-paraphrase-clause-slot-mismatch`** — 원문이 정형절("This requires us to ...")인 자리를 문두 빈칸으로 만들고 정답이 "Cultivating deep focus"류 동명사구면, 완성문이 주술 골격을 잃거나("Cultivating deep focus. Therefore ...") 의미 불성립 → 정답 삽입 결과가 깨진 문장. 위와 동일한 무정답 시비 경로.

**`negative-paraphrase-stacked-prepositions`** — 지문: "...social trust is sustained by _____." 정답 선지: "by refusing to exploit shared resources". 완성문 *"sustained by by refusing..."*. DOUBLE_NEGATIVE/PARAPHRASE 빈칸에서 정답이 표면 비문을 만들면 학생은 정답을 배제한다. 같은 함수에서 나오는 `negative-paraphrase-copula-slot-mismatch`(:101)·`verb-slot-mismatch`(:115)·`modal-be-negated-complement`(:122)·`no-subject-double-negation` 은 전부 RELAXED_BLOCKING 잔류(F)인데 stacked-prepositions 만 salvage 로 빠질 문법적 이유가 없다 — 다섯 코드 모두 "정답이 빈칸 문장에 문법적으로 안 맞음"이라는 동일 결함이다.

**`writing-answer-verbatim-copy`** — WORD_ORDER(배열 영작) 실측 시나리오(wave2 승격 근거 그대로, `constants.ts:21-25` 주석·runIndex 47/48): 문항 렌더에 원본 지문이 인라인으로 보이고, modelAnswer(= 칩으로 조립할 목표 문장)가 지문 문장 그대로다. 학생은 지문에서 해당 문장을 **눈으로 찾아 그대로 옮겨 적으면 만점** — 영작·어순 판단이 0이 되는 "본문 답 노출"(26-07-01 서술형 53문항 전수감사에서 확정된 결함 클래스). SUMMARY_WRITING 은 지문 인라인이 토글 불가 강제라 더 심하다. 이 코드는 baseline 실측에서 "경고만 받고 출하 → LLM 심사 fatal" 사고가 나서 차단으로 **승격**된 이력이 있고(주석 명기), salvage 강등은 그 사고를 최후 모드에서 그대로 재개방한다. 정답 유효성은 멀쩡하지만 **정답 노출** 축의 F급이다 — constants 파일 스스로 F급 정의에 "정답 노출(leak/visible/verbatim 잔존)"을 명시하고 있다(`:446-450`).

**`cond-writing-verbatim-answer`** — 기본 경로는 안전(지문 미동봉·한국어 [영작할 우리말]만 제공)이므로 하드 F는 아니다. 그러나 출제자가 지문 토글을 켜는 순간(합법 UI 경로) 위와 동일한 베껴쓰기 노출이 되고, 시험지 외 표면(예: 지문 상세의 문제 목록처럼 지문과 문항이 같이 보이는 화면)에서는 항상 나란히 노출된다. "경고 배지"는 이 노출을 막지 못한다. 형제 코드와 함께 제거를 권고하되, 팀이 "기본 미동봉이면 충분" 입장이면 유지 가능한 경계 코드로 기록한다.

---

## 2. 실강등이지만 craft 로 확인 — 유지

(= RELAXED_BLOCKING 에 있고 SHIP_FIRST 에 없어 scarce 에서 실제로 error→경고출하로 바뀌는 코드 중, "틀린 문항" 축에 걸리지 않음을 구현으로 확인한 것)

### 빈칸 추론

| 코드 | 검증기 | 판정 | 근거 |
|---|---|---|---|
| `blank-paraphrase-answer-not-transformed` | `blank/paraphrase.ts:58`, `blank/inference.ts:278` | 유지 | 정답==originalExpression verbatim. **원 표현은 빈칸으로 지문에서 제거**되어 학생에게 안 보임 — 정답 노출이 아니라 SOURCE_EXACT 급으로 쉬워질 뿐. 잔존 노출은 `blank-answer-residual-visible`·`multi-blank-answer-visible`(F 잔류)가 별도 차단. |
| `blank-paraphrase-answer-too-verbatim` | `blank/paraphrase.ts:64`, `blank/multi.ts:231` | 유지 | 위와 동일(근접 verbatim). 변형 깊이 취향. |
| `multi-blank-paraphrase-correct-source-exact` | `blank/multi.ts:221` | 유지 | 다중빈칸 PARAPHRASE 판 동일 결함 — 노출 게이트는 별도 F 잔류. |

### 어법 (신규 추가 7종 중 실강등 6종)

| 코드 | 검증기 | 판정 | 근거 |
|---|---|---|---|
| `grammar-underline-too-long` | `dispatcher.ts:2052` (HARD: >7단어/48자, `grammar/shared.ts:10-13`) | 유지(경계) | 밑줄이 절 전체 — 가독성/핀포인트 저하. 복수정답이 되려면 **디코이 절 안에 우연한 제2 오류**가 있어야 하는데 디코이는 무변형 원문 스팬(원문 문법성 전제)이고, 정답 스팬은 도입 오류 1개 유일성이 별도 게이트(`grammar-error-count`·`grammar-error-not-mutated` 등 F 잔류)로 지켜짐. 선택지는 "몇 번 밑줄이 틀렸나"라 채점 무결. 단 RELAXED 리터럴 주석(`constants.ts:116-119`)이 "정답성 해침"으로 분류했던 이력이 있어 경계 표기 — 검수 배지 필수. |
| `grammar-underline-punctuated-fragment` | `dispatcher.ts:2068` | 유지 | 다단어 스팬 내 구두점 — 미관/렌더 어색함, 정답 유일성 무관. |
| `grammar-error-explanation-surface-order` | `dispatcher.ts:2294` | 유지 | 해설이 교정형을 오류형보다 먼저 인용 — 해설 서술 순서 취향. |
| `grammar-explanation-range-shorthand` | `dispatcher.ts:2271` | 유지 | 해설의 "나머지 ②~⑤" 축약 표기. **정답 라벨을 포함하는 범위 누출**은 별도 코드 `grammar-explanation-answer-range-leak`(F 잔류)가 차단. 출하 시점 라벨은 고정이라 축약 자체는 참. |
| `grammar-nonstandard-terminology` | `dispatcher.ts:2154` | 유지 | '전사구' 등 비표준 용어 — 해설 용어 취향. |
| `grammar-agreement-explanation-too-thin` | `dispatcher.ts:2311` | 유지 | 원거리 수일치 해설의 깊이 부족 — 해설 완성도. |

### 어법 (scarce 승계분 — 26-07-04 scarce 분류를 그대로 승계, 스팟 재검증)

| 코드군 | 검증기 | 판정 | 근거 |
|---|---|---|---|
| decoy 계열: `grammar-weak-filler-decoys`, `grammar-too-basic-decoys`, `grammar-shallow-checklist-decoys`, `grammar-shallow-depends-decoy`, `grammar-shallow-nearby-passive-decoy`, `grammar-shallow-than-decoy`, `grammar-demonstrative-that-way-decoy` | `dispatcher.ts:2012/2030/2104` 등 | 유지 | 전부 **비오류(디코이) 스팬**의 함정 가치 판정 — 정답 유일성 무관. |
| killer-thin 계열: `grammar-killer-thin-answer`, `-generic-answer-point`, `-answer-point-repeated`, `-thin-relative-animacy`, `-thin-concessive-as`, `-thin-missing-aux` | dispatcher.ts | 유지 | 난이도 라벨 대비 얕음 — 정답은 유일(도입 오류 무결성 게이트 F 잔류). |
| obvious/shallow 계열 24종 (`grammar-obvious-*`, `grammar-shallow-participle-adjective-answer`, `-local-participle-parallel`, `-despite-although-gerund`, `-because-despite-clause`) | dispatcher.ts | 유지 | "정답이 로컬로 뻔함" — 너무 쉬운 것이지 틀린 것이 아님. 복수정답 시비 계열(debatable/tense-only/perception/quantity)은 전부 SALVAGE 미등재 확인. |
| 해설 mislabel 계열: `grammar-noun-clause-pronoun-mislabel`, `-phrasal-verb-mislabel`, `-look-like-complement-mislabel`, `-seem-to-complement-mislabel`, `-seem-to-object-mislabel`, `-that-way-adverb-mislabel`, `-human-made-postmodifier-mislabel`, `-appear-adverb-mislabel`, `-afford-modal-mislabel`, `-vague-metadata-tag` | `dispatcher.ts:2123-2199` 등 | 유지 | 해설/메타데이터의 문법 용어 오칭 — 정답 키 불변. 오교육 리스크는 있으나 rubric 상 "틀린 문항" 아님, 검수 배지로 커버. |
| `grammar-keypoint-token-not-source-backed`, `grammar-keypoint-untested-token` | `dispatcher.ts:2212/2220` | 유지 | keyPoints/해설이 존재하지 않는·미출제 토큰 언급(환각 분석) — 해설 품질 결함, 정답 키 무관. |
| `grammar-marker-too-dense` (`dispatcher.ts:1112`), `grammar-basic-overloaded-design` (`:2204`), `grammar-explanation-too-long-hard` (`:2321`) | dispatcher.ts | 유지 | 레이아웃 밀도/BASIC 설계 과적/해설 길이 — 전형적 craft. |

### 비어법 기타

| 코드 | 검증기 | 판정 | 근거 |
|---|---|---|---|
| `combo-explanation-truncated` | `grammar/combo.ts:147` | 유지 | 해설 꼬리 잘림((C) 뒤 내용 0) — 학생 표면(지문 3슬롯+선지)은 무결, 해설만 불완전. 검수에서 보완 가능. |
| `irrelevant-source-first-sentence` | `irrelevant.ts:104` | 유지 | 지문 첫 문장이 번호 선지에 포함 — 형식 관행 위반. 정답(삽입문) 유일성·verbatim 게이트는 F 잔류. |
| `irrelevant-too-many-new-terms` | `irrelevant.ts:174` (KILLER 한정) | 유지(경계) | 삽입문 어휘 드리프트 — 드리프트가 클수록 정답이 **더 명백**해져 유일성은 강화됨(쉬운 문항화). 단 SHIP_FIRST 감사에서 "정답 유효성 인접"으로 강등 제외됐던 이력(`core.ts:26`) 있어 경계 표기. wave2 실측 fatal 은 품질(창작 티) 축. |
| `irrelevant-inserted-ungrammatical` | `irrelevant.ts:206` (KILLER 한정, 단일 정규식 `allow X to active`) | 유지(경계) | 삽입문(=정답 문장)이 비문이면 학생이 문법으로 정답을 찾음 — 취지 훼손이지만 정답·채점은 그대로(비문인 그 문장이 정답). 발화 폭이 정규식 1개로 극히 좁음. "영어 시험지에 비문 출하"라는 상품 결함이므로 검수 배지 필수. |
| `sentence-order-paragraph-too-short` / `-too-thin` | `sentence-order.ts:114/121` (+ `feasibility.ts:38/48`) | 유지 | 단락 2문장/24단어 미만 — 균형 취향. 정답 키 무결성은 `sentence-order-answer-key-mismatch`·`-paragraph-not-source-backed`(F 잔류)가 지킴. |
| `sentence-order-unscrambled-answer` | `sentence-order.ts:290` | 유지 | 정답이 (A)-(B)-(C) 그대로 — "정답 노출"이 아니라 관행 위반+난이도 붕괴. 학생은 여전히 응집성 판단을 해야 하고, 그 순열이 원문을 복원함은 answer-key-mismatch 게이트(F)가 보증 — 유일·유효·채점 가능. |
| `summary-mc-direction-frame` | `summary/mc.ts:40` | 유지 | 발문이 (A)/(B) 라벨을 열거하지 않음 — 형식 취향. 진짜 발문 불성립(요약문 누락/마커 개수/stem 미종결)은 `summary-mc-missing-summary`·`-blank-marker-count`·`-stem-unterminated`(전부 F 잔류)가 차단. |
| `topic-option-language` | `topic.ts:78` | 유지 | 선지 언어 스펙(영어 기대인데 한글 포함) 위반 — 풀이·채점 가능. 혼합 언어 선지의 어색함은 검수 배지로 커버. |
| `implied-meaning-absolute-giveaway-option` | `implied.ts:301` (KILLER 한정) | 유지 | **오답** 선지의 절대어 단서 — 소거 용이성(함정 매력도) 취향. |

---

## 3. Dead entry — 강등 효과 0 (이미 전역 warning 또는 relaxed 비차단)

행동 변화가 없으므로 위험은 없으나, "salvage 가 이 코드를 통제한다"는 오독을 낳는다. 정리(주석 표기 또는 제거)를 권장하되 필수는 아님.

- **SHIP_FIRST(`core.ts:30-65`, `dispatcher.ts:823-829`에서 전역 warning) 소속 31개**: `wrong-option-explanation-count`, `grammar-decoy-point-diversity`, `blank-killer-target-too-easy`, `blank-target-too-small`, `blank-awkward-correct-option`, `blank-awkward-option`, `blank-paraphrase-correct-too-thin`, `blank-paraphrase-difficulty-mismatch`, `blank-paraphrase-killer-giveaway-distractors`, `blank-paraphrase-killer-too-easy`, `blank-paraphrase-missing-answer-logic`, `blank-paraphrase-option-imbalance`, `blank-paraphrase-option-source-copy`, `blank-paraphrase-subject-slot-mismatch`, `blank-paraphrase-target-too-wide`, `blank-paraphrase-target-trailing-function`, `irrelevant-too-unrelated`, `irrelevant-obvious-counterclaim-cue`, `irrelevant-prescriptive-giveaway`, `sentence-order-given-too-long`, `sentence-order-given-too-long-relative`, `sentence-order-paragraph-imbalance`, `implied-meaning-missing-surface-meaning`, `implied-meaning-noncentral-target`, `implied-meaning-rhetorical-question-target`, `implied-meaning-single-word-target`, `implied-meaning-target-too-short`, `implied-meaning-thin-evidence-chain`, `implied-meaning-thin-reasoning-gap`, `summary-mc-awkward-collocation`, `summary-mc-missing-half-correct-traps`
- **RELAXED_BLOCKING 미등록 3개**: `grammar-decoy-point-monotony`, `grammar-killer-thin-connector`, `grammar-category-mislabel`

### 참고(범위 밖 발견 2건)

1. `blank-paraphrase-subject-slot-mismatch`(`blank/paraphrase.ts:189`)는 F로 지목한 두 slot-mismatch 와 **같은 함수의 같은 방향(정답 선지 슬롯 부적합)** 게이트인데 SHIP_FIRST 에서 이미 전역 warning 이다. salvage 목록 문제는 아니지만(이미 강등됨), 정답이 "task 주어 슬롯 + 동명사구"로 의미 불성립 문장을 만들 수 있어 SHIP_FIRST 재분류 검토 가치가 있다.
2. `dispatcher.ts:962-967` 주석은 CONDITIONAL_WRITING 을 "INLINE 노출" 유형으로 서술하지만 현행 `passage-policy.ts:176-181`은 기본 미동봉 — 주석-정책 드리프트.

---

## 4. 최종 제거 권고 목록 (복붙용)

```
"blank-paraphrase-verb-form-slot-mismatch",
"blank-paraphrase-clause-slot-mismatch",
"negative-paraphrase-stacked-prepositions",
"writing-answer-verbatim-copy",
"cond-writing-verbatim-answer",
```

- 확정 F(무정답/정답노출): 위 1~4번.
- 5번 `cond-writing-verbatim-answer` 은 조건부(기본 지문 미동봉이라 기본 경로 안전) — 그러나 지문 토글 재동봉 경로·형제 코드와의 일관성 때문에 제거 권고. 팀 판단으로 유지한다면 "지문 동봉 토글 ON 시 재차단" 같은 조건 게이트가 필요하다.
