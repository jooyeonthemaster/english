# 13 — 유형별 생성 노브 전수표 · 장문 세트 · 내신 서술형 채점 계약

> 정찰 산출. 전제는 [`00-contract.md`](00-contract.md) (재조사 금지). 규범은 [`../quality-constitution.md`](../quality-constitution.md).
> 모든 주장에 `file:line` 인용. 확인 못한 것은 **[미상]**.
> §1 의 기본값·클램프는 **추론이 아니라 실행 검증**이다 — `npx tsx` 로 `resolveQuestionTypeGenerationSettings` 를
> 26유형 × (빈 설정 / 과대입력 999 / 난이도 3종) 으로 돌린 실측치다(§1.6 로그).

---

## §0 30초 요약 — 저작 에이전트가 먼저 알아야 할 것

1. **노브는 프롬프트를 바꾸지, 파서를 바꾸지 않는다.** 단 하나 예외가 **개수 계약**이다 —
   `markerCount`/`slotCount`/`optionCount`/`blankCount`/`pairCount`/`answerCount` 는
   **게이트가 그 숫자로 세는** 값이라, 지정과 다른 개수를 쓰면 그 유닛은 전량 반려된다.
2. **노브 읽기 규약은 flat 우선 → nested[typeId] 폴백** 단 하나다(`shared.ts:88-102`).
   qbank 하네스는 `{ [typeId]: {...} }` 로 감싸 넘기든 평평하게 넘기든 같은 결과를 얻는다.
3. **UI 의 "장문 세트" 탭은 md-qgen 을 쓰지 않는다.** 코드에 박힌 프리셋 10개 중 하나를 골라
   `/api/workbench/ai-jobs/question-set` 에 POST 하고, 서버가 **구형 JSON 엔진**
   (`runQuestionGenerationWithEmptyRetry`)을 멤버당 1회 부른다(`generate-set.ts:442-470`).
   → **세트는 qbank 저작 대상이 아니다.** 우리가 만드는 것은 유닛(1지문×1유형×5~8문항)이지 세트가 아니다.
4. **내신 서술형 8종의 채점은 `acceptedAnswers` 집합 대조다.** 집합에 든 문자열이면
   **무조건 만점**이다(`grade.ts:50`) — 필터가 없다. 동의어를 한 개 넣는 순간 오답이 만점이 된다.
5. **`GRAMMAR_CHOICE_COMBO` 의 조합 축은 어법 하나뿐이다.** 어법+어휘 결합은 **코드상 불가능**하다(§5).

---

## §1 26유형 × 노브 전수표 (주 산출물)

### 1.1 노브 해석 규약 — 모든 숫자 노브의 공통 파이프

```
readNumericSetting(rawSettings, typeId, spec, resolved)      shared.ts:88-102
  1) rawSettings[spec.key] 또는 rawSettings[alias] 가 undefined 아니면 그 값
  2) 없으면 rawSettings[typeId][spec.key | alias]
  3) 둘 다 없으면 undefined
  → normalizeNumericSetting(value, spec, resolved)           shared.ts:65-75
       n = typeof value === "number" ? value : Number(value)
       max = typeof spec.max === "function" ? spec.max(resolved) : spec.max
       !Number.isFinite(n) → Math.min(spec.defaultValue, max)     ★ 기본값도 max 로 클램프된다
       else               → Math.min(max, Math.max(spec.min, Math.round(n)))
```

- **`Math.round`** 다 — `2.5 → 3`, `2.4 → 2`. 소수를 넣으면 조용히 반올림된다.
- **불리언 노브**는 `=== true` 일 때만 참이다(`shared.ts:104-115`). `"true"` 문자열은 **거짓**이다.
- **문자열/열거형 노브**는 유형마다 전용 리더가 있다(허용값 밖이면 fallback) —
  `readBlankInferenceGranularitySetting`(`blank-inference.ts:18-30`),
  `readContentMatchTypeSetting`(`content-match.ts:13-23`),
  `readSummaryWritingEnumSetting`(`summary-writing.ts:54-70`),
  `readEnumSetting`(`topic-sentence-writing.ts:68-86`).

### 1.2 전 유형 공통 노브 4종

| 키 | 타입 | 기본값 | 효과 | 출처 |
|---|---|---|---|---|
| `difficulty` | `"BASIC"\|"INTERMEDIATE"\|"KILLER"` | 전역 폴백(`"INTERMEDIATE"`) | 유형별 난이도 오버라이드. 값이 셋 밖이면 `"INTERMEDIATE"` 로 강등 | `shared.ts:172-184, 211-219` |
| `generationPlan` | `"STANDARD"\|"PREMIUM"` | `"STANDARD"` | 생성 플랜 오버라이드 | `shared.ts:221-229` |
| `stemLanguage` | `"ko"\|"en"` | 유형별(§1.5) | 발문 언어. `"ko"/"en"` 외 값은 유형 기본값으로 폴백 | `language.ts:92-97, 124-129` |
| `optionLanguage` | `"ko"\|"en"` | 유형별(§1.5) | **7유형에서만 유효** — 나머지는 저장값을 무시하고 구조 기본값을 쓴다 | `language.ts:64-79, 138-150` |

`optionLanguage` 가 실제로 먹는 7유형(`OPTION_LANGUAGE_FREE_TYPE_IDS`, `language.ts:64-72`):
`TOPIC` · `MAIN_IDEA` · `TOPIC_MAIN_IDEA` · `TITLE` · `IMPLIED_MEANING` · `CONTEXT_MEANING` · `CONTENT_MATCH`.
그 외 19유형은 `getQuestionLanguageToggleScope() === "stem"` 이라 UI 에 노출조차 안 되고,
`languageSettingsForType` 가 저장값 대신 구조 기본값을 반환한다(`language.ts:145-149`).

### 1.3 유형별 노브 전수표

> **resolved 키** = `resolveQuestionTypeGenerationSettings()` 산출물의 필드명.
> 레인의 `isEligible(resolved)`·`buildBasePrompt(ctx)`·`mdFormat(ctx)` 가 이걸 읽는다(`lane-types.ts` 계약).
> **클램프** = 실행 검증된 실측 범위.

#### (1) 수능/모의고사 객관식 계열 15종

> UI 그룹 `"수능/모의고사 객관식"` 은 **14개**만 노출한다(`question-type-ui.ts:308-327`) —
> `TOPIC_MAIN_IDEA` 는 기존 저장 문제 호환용이라 그룹에서 빠져 있다(`question-type-ui.ts:110-119`).
> 노브 축으로는 15종이고, 총계는 15 + 서술형 8 + 어휘 3 = **26유형**이다.

| # | typeId | 노브 키 (별칭) | 타입 | 기본값 | 클램프 | resolved 키 | 효과 |
|---|---|---|---|---|---|---|---|
| 1 | `BLANK_INFERENCE` | `blankCount` | int | **1** | **1~3** | `blankInferenceBlankCount` | 1=단일 빈칸(정본 경로). 2~3=조합선지 변형 — 빈칸 라벨 `(A)(B)(C)` 고정, 선지 구분자 ` …… ` (`shared.ts:194`, `dispatchers.ts:1187`) |
| | | `doubleNegative` | bool | `false` | — | `blankInferenceDoubleNegative` | **`blankCount===1` 일 때만 참이 된다**(`dispatchers.ts:297-300`). 다중빈칸이면 강제 `false` |
| | | `paraphraseAnswer` | bool | `false` | — | `blankInferenceParaphraseAnswer` | 정답 선지를 비축자 패러프레이즈로. **DN 이 켜지면 강제 `false`**(`dispatchers.ts:323-324`) |
| | | `pointFocus` | bool | `false` | — | `blankPointFocus` | 정답 논리를 기출 716문항 검증 코어(인과·개념명명·재진술·대조전환)로 압축 |
| | | `blankGranularity` | `auto\|word\|phrase\|clause` | `"auto"` | 열거 밖 → `auto` | `blankInferenceGranularity` | `auto`=프롬프트 블록 미주입. word=단일 내용어, phrase=2~4단어, clause=주어+동사 5~10단어 (`blank-inference.ts:37-70`) |
| 2 | `GRAMMAR_ERROR` | `markerCount` (`errorCount`) | int | **5** | **5~10** | `grammarMarkerCount` | 밑줄 어법 판단 지점 수. 라벨 `(A)~(J)` (`grammar.ts:31`) |
| | | `answerCount` (`correctAnswerCount`) | int | **1** | **1~markerCount** | `grammarAnswerCount` | `isError=true` 개수. ≥2 면 발문이 '모두' 형이 되고 `correctAnswer` 가 `"(A), (C)"` 형 (`dispatchers.ts:601`) |
| | | `pointFocus` | bool | `false` (**UI 시드 `true`**) | — | `grammarPointFocus` | 고빈출 톱셋 압축. ⚠ `getDefault…()` 는 `true` 를 시드한다(`dispatchers.ts:503`) — 코드 기본과 UI 기본이 다르다 |
| 3 | `GRAMMAR_CHOICE_COMBO` | `pointFocus` | bool | `false` (**UI 시드 `true`**) | — | `grammarPointFocus` | **이 유형의 유일한 노브다**(`dispatchers.ts:121-136`). 개수 노브 없음 — 네모 3 / 선지 5 고정 |
| 4 | `VOCAB_CHOICE` | `markerCount` | int | **5** | **5~10** | `vocabChoiceMarkerCount` | 밑줄 어휘 수. 라벨 `(a)~(j)` 소문자 (`vocab.ts:19`) |
| | | `answerCount` (`correctAnswerCount`) | int | **1** | **1~markerCount** | `vocabChoiceAnswerCount` | `isInappropriate=true` 개수 |
| | | `synonymVariants` | bool | `false` | — | `vocabChoiceSynonymVariants` | 켜면 **비정답 밑줄도 원문 축자가 아니라 동의어로 표시**. `vocabDisplayMode="SYNONYM_VARIANT"` 강제 (`dispatchers.ts:646-660`) |
| 5 | `SENTENCE_ORDER` | `prefixVariationCount` | int | **0** | **0~3** | `sentenceOrderPrefixVariationCount` | (A)(B)(C) 중 앞에서 N개 문단의 **첫 문장만** 패러프레이즈. 라벨 순(A→B→C) 결정론 (`dispatchers.ts:703-711`) |
| | | `pointFocus` | bool | `false` | — | `sentenceOrderPointFocus` | 순서 응집장치 코어 압축 |
| 6 | `SENTENCE_INSERT` | `slotCount` (`optionCount`) | int | **5** | **5~8** | `sentenceInsertSlotCount` | 삽입 위치 마커 `①~⑧`. `markerAfterSentenceIndices` 가 정확히 N개 오름차순 (`dispatchers.ts:674-681`) |
| | | `paraphrasePrefix` | bool | `false` | — | `sentenceInsertParaphrasePrefix` | 주어진 문장의 **도입부만** 패러프레이즈. 응집 단서(대명사·연결어)의 기능은 보존 강제 |
| | | `pointFocus` | bool | `false` | — | `sentenceInsertPointFocus` | 기출 456문항 검증 코어(참조 해소·대조 전환) 압축 |
| 7 | `TOPIC` | `optionCount` | int | **5** | **4~8** | `genericOptionCount` | 자유 텍스트 선지 수. 라벨은 `"1"~"8"` (`dispatchers.ts:761`) |
| | | `answerCount` (`correctAnswerCount`) | int | **1** | **1~(optionCount−1)** | `genericAnswerCount` | ★ **오답이 최소 1개 남아야 하므로 상한이 optionCount−1** (`generic.ts:45-56`) |
| | | `answerPolarity` | `"NEGATIVE"` | undefined | `"NEGATIVE"` 외 → undefined | `answerPolarity` | 발문을 `다음 글의 주제로 가장 적절하지 않은 것은?` 로 **강제 오버라이드** (`dispatchers.ts:734-750`) |
| 8 | `MAIN_IDEA` | 〃 (`optionCount`/`answerCount`/`answerPolarity`) | 〃 | 〃 | 〃 | 〃 | 부정 극성 발문 `요지` |
| 9 | `TOPIC_MAIN_IDEA` | 〃 | 〃 | 〃 | 〃 | 〃 | 부정 극성 발문 `주제` |
| 10 | `TITLE` | 〃 | 〃 | 〃 | 〃 | 〃 | 부정 극성 발문 `제목` |
| 11 | `IMPLIED_MEANING` | `optionCount` / `answerCount` | int | 5 / 1 | 4~8 / 1~(oc−1) | `genericOptionCount` / `genericAnswerCount` | **극성 토글 대상 아님**(`shared.ts:43-48`) |
| 12 | `REFERENCE` | **없음** | — | — | — | — | 언어 토글만 (실행 검증: `{stemLanguage, optionLanguage}` 만 반환) |
| 13 | `CONTENT_MATCH` | `optionCount` | int | **5** | **5~12** | `contentMatchOptionCount` | 진술 선지 수 |
| | | `answerCount` (`correctAnswerCount`) | int | **1** | **1~optionCount** | `contentMatchAnswerCount` | ★ 여기만 상한이 `optionCount` 다 — **12개 전부 정답이 될 수 있다**(`shared.ts:142-148`) |
| | | `matchType` | `"일치"\|"불일치"` | **`"불일치"`** | 그 외 → `"불일치"` | `contentMatchType` | ⚠ **AUTO 가 없다.** `readContentMatchTypeSetting` 은 절대 `undefined` 를 반환하지 않아(`content-match.ts:13-23`), `dispatchers.ts:187` 의 `...(contentMatchType ? {} : {})` 는 **항상 참**이다 |
| 14 | `SUMMARY_COMPLETE_MC` | `blankCount` (`summaryBlankCount`) | int | **2** | **2~4** | `summaryCompleteMcBlankCount` | 요약문 빈칸 수(조합 선지) |
| 15 | `IRRELEVANT` | `slotCount` | int | **5** | **5~10** | `irrelevantSlotCount` | 번호 문장 수. 라벨 `①~⑩`(20 초과 시 확장 코드포인트, `irrelevant.ts:20-25`) |
| | | `pointFocus` | bool | `false` | — | `irrelevantPointFocus` | 무관성 유형 코어 압축 |

> ★ **지문 길이 하드 게이트 — `IRRELEVANT` 만 존재한다.** `validateIrrelevantAgainstPassage`
> (`irrelevant.ts:42-68`): 첫 문장을 선지에서 제외하므로 **원문 ≥ 5문장** 필수이고,
> `slotCount` N 을 쓰려면 원문 문장 ≥ N 이어야 한다. 미달이면 한국어 사유와 함께 `ok:false`.
> 나머지 25유형에는 코드 레벨 길이 게이트가 없다.

#### (2) 내신 서술형 8종

| # | typeId | 노브 키 (별칭) | 타입 | 기본값 | 클램프 | resolved 키 | 효과 |
|---|---|---|---|---|---|---|---|
| 16 | `CONDITIONAL_WRITING` | **없음** | — | — | — | — | 언어 토글만(실행 검증) |
| 17 | `SENTENCE_TRANSFORM` | **없음** | — | — | — | — | 〃 |
| 18 | `FILL_BLANK_KEY` | **없음** | — | — | — | — | 〃 |
| 19 | `SUMMARY_COMPLETE` | `blankCount` (`summaryBlankCount`) | int | **2** | **1~5** | `summaryCompleteBlankCount` | 단답 요약 빈칸 수. 라벨 `(A)(B)…` |
| 20 | `WORD_ORDER` | **없음** | — | — | — | — | 언어 토글만 |
| 21 | `GRAMMAR_CORRECTION` | `errorCount` (`answerCount`) | int | **1** | **1~5** | `grammarCorrectionErrorCount` | 밑줄 구간 수 = 오류 수(**전부 `isError=true`**, `dispatchers.ts:807, 813`) |
| | | `pointFocus` | bool | `false` | — | `grammarPointFocus` | 교정 포인트 톱셋 압축 |
| 22 | `SUMMARY_WRITING` | §1.4 참조 (18개 노브) | | | | | 난이도 프리셋 + 호환성 매트릭스 |
| 23 | `TOPIC_SENTENCE_WRITING` | §1.4 참조 (15개 노브) | | | | | 〃 |

#### (3) 어휘 3종

| # | typeId | 노브 키 | 타입 | 기본값 | 클램프 | resolved 키 | 효과 |
|---|---|---|---|---|---|---|---|
| 24 | `CONTEXT_MEANING` | `optionCount` / `answerCount` | int | 5 / 1 | 4~8 / 1~(oc−1) | `genericOptionCount` / `genericAnswerCount` | 극성 토글 없음 |
| 25 | `SYNONYM` | 〃 | 〃 | 〃 | 〃 | 〃 | 〃 |
| 26 | `ANTONYM` | `pairCount` (`optionCount`, `markerCount`) | int | **5** | **5~10** | `antonymPairCount` | 단어-반의어 쌍 수. 라벨 `(A)~(J)`. **정확히 1쌍만 `isIncorrectPair=true`** (`dispatchers.ts:724`) — answerCount 노브 없음 |

### 1.4 SUMMARY_WRITING · TOPIC_SENTENCE_WRITING — 프리셋 + 호환성 매트릭스

이 둘만 구조가 다르다. **난이도 프리셋이 기본값이고, 강사가 만진 키만 프리셋을 덮어쓴다.**
`getDefaultQuestionTypeGenerationSettings()` 가 이 둘의 세부옵션을 **의도적으로 비워 둔다**
(값을 박으면 프리셋을 shadow 해 난이도 차이가 배점만 달라지는 가짜 차별화가 되기 때문 — `dispatchers.ts:519-536`).

#### SUMMARY_WRITING 노브 (`types.ts:215-258` · `summary-writing.ts:167-322`)

| 키 | 타입/허용값 | BASIC | INTERMEDIATE | KILLER |
|---|---|---|---|---|
| `glossEnabled` | bool | `true` | `true` | `false` |
| `glossLooseness` | `literal\|natural\|gist\|partial` | `literal` | `natural` | `natural` |
| `wordBankEnabled` | bool | `true` | `true` | `true` |
| `wordBankUsage` | `useAll\|usePartial\|freeCount` | `useAll` | `usePartial` | `usePartial` |
| `boxDistractors` | int **0~4** | 0 | 1 | 2 |
| `wordBankFidelity` | `verbatim\|inflected\|mixed` | `verbatim` | `verbatim` | `inflected` |
| `wordBankOrder` | `random\|alphabetical\|scrambleStrong` | `random` | `scrambleStrong` | `scrambleStrong` |
| `wordBankChunking` | `word\|chunk\|mixed` | `chunk` | `word` | `word` |
| `blankCount` (`summaryBlankCount`) | int **1~3** | 1 | 2 | 2 |
| `blankAssignment` | `separate\|shared` | `separate` | `separate` | `shared` |
| `targetWordsMode` | `exact\|approx\|hidden` | `approx` | `approx` | `hidden` |
| `targetWordsPerBlank` | int **3~17** | 4 | 7 | 7 |
| `clueMode` | `none\|firstLetter\|firstLetterDashes\|skeleton\|wordCount\|koreanChunk` | `none` | `none` | `none` |
| `connectorFrame` | `full\|partial\|bare` | `full` | `partial` | `partial` |
| `summarySourceMode` | `paraphrase\|inference` | `paraphrase` | `paraphrase` | `inference` |
| `sourceSentenceParaphrase` | bool | `false` | `false` | `true` |
| `scoringGranularity` | `exact\|keyword\|rubric` | `keyword` | `keyword` | `rubric` |

**호환성 매트릭스 F(강제) 규칙** — `summary-writing.ts:282-300`:
1. `!wordBankEnabled` → `wordBankUsage="useAll"`, `boxDistractors=0`
2. `wordBankUsage !== "usePartial"` → `boxDistractors=0`
3. `wordBankEnabled && useAll && targetWordsMode==="exact"` → `approx` 로 강등(이중 누설 방지)
4. `KILLER && glossEnabled && glossLooseness==="literal"` → `natural` 로 강등

> ### ⚠ 실측 결함 — SUMMARY_WRITING 의 숫자 프리셋 3개가 **죽어 있다**
> `blankCount`·`boxDistractors`·`targetWordsPerBlank` 는 `readNumericSetting` 을 **무조건** 호출한다
> (`summary-writing.ts:217-221, 234-238, 276-280`). 미설정이면 spec 기본값(1 / 0 / 7)을 돌려주므로
> **프리셋 값에 도달하지 못한다.** 실행 검증:
> ```
> BASIC/INTERMEDIATE/KILLER 전부 → summaryWritingBlankCount=1, DistractorCount=0, TargetWords=7
> (프리셋 선언값은 1/2/2 · 0/1/2 · 4/7/7)
> ```
> `TOPIC_SENTENCE_WRITING` 은 같은 함정을 `hasNumericSetting()` 가드로 이미 고쳤다
> (`topic-sentence-writing.ts:110-118, 237-243, 275-288`) — SUMMARY_WRITING 만 미수정이다.
> **저작 시 함의**: SUMMARY_WRITING 은 난이도만 바꿔서는 빈칸 수·미끼 수가 변하지 않는다.
> 원하는 값을 **명시 키로 넣어라**.

#### TOPIC_SENTENCE_WRITING 노브 (`types.ts:265-296` · `topic-sentence-writing.ts:189-315`)

| 키 (별칭) | 타입/허용값 | BASIC | INTERMEDIATE | KILLER |
|---|---|---|---|---|
| `mode` | `scrambled\|cloze` | `scrambled` | `scrambled` | `cloze` |
| `topicForm` | `sentence\|nounPhrase` | `nounPhrase` | `sentence` | `sentence` |
| `hintEnabled` | bool | `true` | `true` | `false` |
| `hintLooseness` | `literal\|natural\|gist` | `literal` | `natural` | `natural` |
| `chunking` | `word\|chunk\|mixed` | `chunk` | `word` | `word` |
| `distractors` (`boxDistractors`, `distractorCount`) | int **0~3** | 0 | **1** | **2** |
| `fidelity` | `verbatim\|inflected\|mixed` | `verbatim` | `verbatim` | `inflected` |
| `scrambleOrder` | `random\|scrambleStrong` | `random` | `scrambleStrong` | `scrambleStrong` |
| `blankCount` | int **1~2** | 1 | 1 | **2** |
| `blankAssignment` | `separate\|shared` | `separate` | `separate` | `separate` |
| `clueMode` | `none\|firstLetter\|wordCount` | `none` | `none` | `none` |
| `sourceMode` | `explicit\|paraphrase\|inference` | `explicit` | `paraphrase` | `inference` |
| `sourceSentenceParaphrase` | bool | `false` | `false` | `true` |
| `scoringGranularity` | `exact\|keyword\|rubric` | `keyword` | `keyword` | `rubric` |

**F 규칙** — `topic-sentence-writing.ts:290-296`:
1. `mode==="cloze" && topicForm==="nounPhrase"` → `blankCount=1` 강제
2. `!(cloze && blankCount>=2)` → `blankAssignment="separate"` 고정

#### 발문은 **결정론 합성**이다 — 모델이 쓰지 않는다

두 유형 모두 `direction` 을 코드가 만들고 프롬프트가 `direction must be EXACTLY: "…"` 로 못 박는다
(`dispatchers.ts:877`). 합성기는 `buildSummaryWritingDirection`(`summary-writing.ts:342-395`)와
`buildTopicSentenceWritingDirection`(`topic-sentence-writing.ts:333-360`). 배점은 난이도로 결정:
BASIC `[2점]` / INTERMEDIATE `[3점]` / KILLER `[4점]`(`summary-writing.ts:330-334`, `topic-sentence-writing.ts:323-327`).

실측 산출 예:
```
INTERMEDIATE SW  : 다음 글의 요약문 빈칸 (A)에 들어갈 말을 [해석]을 참고하여 [보기]에서 필요한 단어만 골라 빈칸을 약 7단어로 영작하시오. [3점]
KILLER SW        : 다음 글의 요약문 빈칸 (A)에 들어갈 말을 [보기]에서 필요한 단어만 골라 (필요시 어형을 바꿔) 영작하시오. [4점]
BASIC TSW        : 다음 글의 주제가 되도록 [주제 힌트]를 참고하여 주어진 단어를 모두 한 번씩 사용하여 올바른 순서로 배열하시오. [2점]
KILLER TSW       : 다음 글의 주제문 빈칸 (A), (B)에 들어갈 말을 [보기]에서 필요한 단어만 골라 (필요시 어형을 바꿔) 영작하시오. (쓰지 않는 단어가 포함됨) [4점]
```

### 1.5 유형별 언어 기본값 (`language.ts:8-44`)

`optionLanguage="en"` 이 기본인 14유형: `BLANK_INFERENCE` `VOCAB_CHOICE` `SENTENCE_ORDER` `TOPIC` `TITLE`
`IMPLIED_MEANING` `CONTENT_MATCH` `SUMMARY_COMPLETE_MC` `SUMMARY_COMPLETE` `SUMMARY_WRITING`
`TOPIC_SENTENCE_WRITING` `CONTEXT_MEANING` `SYNONYM` `ANTONYM`.
나머지는 `ko`. `stemLanguage` 는 **전 유형 `ko`** 가 기본이다.

### 1.6 실행 검증 로그 (발췌 — `npx tsx`, 리포 루트)

빈 설정 `{}` + 전역 `INTERMEDIATE`:
```
BLANK_INFERENCE   blankCount=1 DN=false paraphrase=false pointFocus=false granularity=auto
GRAMMAR_ERROR     markerCount=5 answerCount=1 pointFocus=false
GRAMMAR_CHOICE_COMBO  pointFocus=false                       ← 개수 노브 0개
VOCAB_CHOICE      markerCount=5 answerCount=1 synonymVariants=false
SENTENCE_ORDER    prefixVariationCount=0 pointFocus=false
SENTENCE_INSERT   slotCount=5 paraphrasePrefix=false pointFocus=false
CONTENT_MATCH     optionCount=5 answerCount=1 matchType="불일치"   ← AUTO 아님
IRRELEVANT        slotCount=5 pointFocus=false
SUMMARY_COMPLETE  blankCount=2      SUMMARY_COMPLETE_MC blankCount=2
GRAMMAR_CORRECTION errorCount=1 pointFocus=false      ANTONYM pairCount=5
REFERENCE / CONDITIONAL_WRITING / SENTENCE_TRANSFORM / FILL_BLANK_KEY / WORD_ORDER → 언어 2키만
TOPIC·MAIN_IDEA·TOPIC_MAIN_IDEA·TITLE·IMPLIED_MEANING·CONTEXT_MEANING·SYNONYM → optionCount=5 answerCount=1
```
과대 입력 `999` 클램프:
```
GRAMMAR_ERROR   {markerCount:999,answerCount:999} → 10 / 10
VOCAB_CHOICE    {markerCount:0,answerCount:999}   →  5 /  5      ← min 클램프 후 answerCount 상한이 5
CONTENT_MATCH   {optionCount:999,answerCount:999} → 12 / 12      ← 전부 정답 허용
TITLE           {optionCount:999,answerCount:999} →  8 /  7      ← oc−1 상한
TITLE           {optionCount:4,  answerCount:999} →  4 /  3
IRRELEVANT 999→10 · SENTENCE_INSERT 999→8 · SENTENCE_ORDER 999→3 · ANTONYM 999→10
BLANK_INFERENCE 999→3, DN 강제 false / blankCount=1 이면 DN=true & paraphrase 강제 false
SUMMARY_COMPLETE 999→5 · SUMMARY_COMPLETE_MC 999→4 · GRAMMAR_CORRECTION 999→5
SUMMARY_WRITING {999,999,999} → blank 3 / distractor 4 / targetWords 17
TOPIC_SENTENCE_WRITING {999,999} → blank 2 / distractor 3
```

### 1.7 노브 함정 6개

1. **`getDefaultQuestionTypeGenerationSettings()` ≠ resolve 기본값.** 전자는 UI 시드용이고
   `GRAMMAR_ERROR.pointFocus`·`GRAMMAR_CHOICE_COMBO.pointFocus` 를 `true` 로 박는다(`dispatchers.ts:503, 508`).
   빈 설정으로 resolve 하면 둘 다 `false` 다. **어느 쪽을 재현할지 의도적으로 골라라.**
2. **`answerCount` 상한이 유형마다 다르다.** generic 계열 `oc−1`, CONTENT_MATCH `oc`, 어법/어휘 `markerCount`.
3. **`readNumericSetting` 은 별칭을 먼저 훑는다.** `markerCount` 없이 `errorCount` 만 넣으면
   GRAMMAR_ERROR 는 그것을 **markerCount 로** 읽는다(`grammar.ts:34-39`). GRAMMAR_CORRECTION 은 반대로
   `errorCount` 가 정본이고 `answerCount` 가 별칭이다(`grammar.ts:49-55`). **같은 키가 유형에 따라 다른 뜻이다.**
4. **`CONTENT_MATCH.matchType` 은 명시하지 않아도 `"불일치"` 로 프롬프트에 실린다.** "AUTO" 를 기대하면 틀린다.
5. **`ANTONYM.pairCount` 는 `optionCount`·`markerCount` 를 별칭으로 먹는다**(`antonym.ts:13-19`) —
   다른 유형의 설정 객체를 그대로 재사용하면 조용히 값이 옮겨붙는다.
6. **레인 `isEligible` 이 노브로 유형을 차단할 수 있다.** `GRAMMAR_CHOICE_COMBO` 는 슬롯 수 관련 키
   (`comboSlotCount`/`slotCount`/`boxCount`/`markerCount`/`grammarChoiceComboSlotCount`)에 3 이외의
   값이 있으면 `false` 를 반환해 md 레인에서 **하차**한다(`lane-combo.ts:44-50, 87-95`).

---

## §2 UI "장문 세트" 탭이 실제로 만드는 것

### 2.1 진입 — 모드 세그먼트

`generation-config-panel.tsx:832-874` 가 세그먼트 두 개를 그린다:
`{mode:"manual", label:"유형 지정"}` 과, **플래그가 켜졌을 때만** `{mode:"set", label:"장문 세트"}`.
게이트는 `FEATURE_FLAGS.ENABLE_LONG_PASSAGE_SETS` 이고 **기본값 `true`** 다
(`feature-flags.ts:89-92`, env `NEXT_PUBLIC_ENABLE_LONG_PASSAGE_SETS`).
국어 패널(`koPanel`)은 플래그 무관하게 `"세트 생성"` 이라는 **별도 파이프라인**을 쓴다
(`use-korean-set-generation.ts:96` — 영어 장문 세트 파이프라인을 타지 않는다).

`set` 모드가 켜지면 `renderSetBuilderSection`(`type-numeric-detail.tsx:2009-2073`)이
`SetBuilderPanel`(`components/workbench/set-builder-panel.tsx:107`)을 렌더한다.
`passageId` 는 **'내 지문'에서 체크한 첫 지문 1개**다(`type-numeric-detail.tsx:2042-2048`) —
워크스페이스에 올린 지문은 사용되지 않고, 워크스페이스 생성 자체가 차단된다
(`use-workspace-generation.ts:360-363`).

### 2.2 강사가 고르는 것 = **자유 조합이 아니라 코드에 박힌 프리셋**

`SetBuilderPanel:280` 이 `SET_PRESETS.filter(p => p.tier === 1)` 만 노출한다 → **10개**.
강사가 조작 가능한 축은 셋뿐이다:
- **프리셋별 세트 수 스테퍼**(`presetCounts`, `SetBuilderPanel:213-221`)
- **세트 전체 난이도 1개**(`BASIC|INTERMEDIATE|KILLER`, `:348-371`)
- **멤버별 오버라이드**(`memberOverrides[]` — 난이도·플랜·typeSettings, `:523-588`) →
  `SetMemberSettingsEditor` 가 §1 의 유형별 노브 UI 를 그대로 재사용한다.

**유형 조합 자체는 강사가 못 바꾼다.** `preset.members` 가 유형과 순서를 고정한다.

### 2.3 프리셋 레지스트리 10개 (`presets.ts:67-225`)

| id | 라벨 | structuralMode | 멤버(=출제 순서) | minSentences / minWords | 멤버 typeSettings |
|---|---|---|---|---|---|
| `read-core-2` | 독해 핵심 2문항 | `NONE` | MAIN_IDEA · CONTENT_MATCH | 4 / 90 | — |
| `read-comprehensive-3` | 독해 종합 3문항 | `NONE` | TITLE · REFERENCE · CONTENT_MATCH | 5 / 110 | — |
| `vocab-meaning` | 어휘·의미 세트 | `NONE` | SYNONYM · CONTEXT_MEANING | 4 / 90 | — |
| `summary-set` | 요약 독해 3문항 | `NONE` | SUMMARY_COMPLETE_MC · TITLE · CONTENT_MATCH | 5 / 120 | — |
| `csat-43-45` | 수능 43~45형 | **`SENTENCE_ORDER`** | SENTENCE_ORDER · REFERENCE · CONTENT_MATCH | **7 / 150** | SO: `{pointFocus:true}` |
| `sentence-insert-3` | 문장 삽입 3문항 | **`SENTENCE_INSERT`** | SENTENCE_INSERT · REFERENCE · CONTENT_MATCH | **7 / 150** | SI: `{pointFocus:true}` |
| `structure-killer-3` | 구조 독해 고난도 | **`SENTENCE_INSERT`** | SENTENCE_INSERT(KILLER) · TITLE · MAIN_IDEA | **7 / 150** | SI: `{pointFocus:true}` |
| `blank-reading-3` | 빈칸 추론 3문항 | `NONE` | BLANK_INFERENCE(KILLER) · MAIN_IDEA · CONTENT_MATCH | 5 / 120 | BI: `{pointFocus:true, paraphraseAnswer:true}` |
| `grammar-judgment-3` | 어법 판단 3문항 | `NONE` | GRAMMAR_ERROR · REFERENCE · CONTENT_MATCH | 5 / 120 | GE: `{pointFocus:true}` |
| `grammar-correction-3` | 어법 수정 3문항 | `NONE` | GRAMMAR_CORRECTION · MAIN_IDEA · CONTENT_MATCH | 5 / 120 | GC: `{pointFocus:true}` |

`passageMeetsPreset`(`presets.ts:257-272`)이 문장 수·단어 수 **둘 다** 충족을 요구한다.
문장 분할은 `splitIntoSentences`, 단어 수는 `trim().split(/\s+/).length`(`presets.ts:238-246`).
`availablePresetsForPassage`(`:275-283`)가 UI 메뉴 필터다.
⚠ 파일 주석이 명시하듯 **"장문 강제가 아니다"** — 이름만 장문이고 90단어짜리 지문에도 4개 프리셋이 열린다(`presets.ts:10-12`).

### 2.4 생성 경로 (코드)

```
SetBuilderPanel.handleGenerate                       set-builder-panel.tsx:286-341
  └ for (presetKey, count) of positivePresetEntries    // 프리셋별 count 회 반복
      └ POST /api/workbench/ai-jobs/question-set       :309-321
          body = { passageId, presetId, difficulty, generationPlan, customPrompt?, memberOverrides[] }

route.ts (api/workbench/ai-jobs/question-set)
  :48   FEATURE_FLAGS.ENABLE_LONG_PASSAGE_SETS 아니면 403
  :67   resolvePreset(presetId)                       // 미등록이면 400
  :81   passageMeetsPreset(passage.content, preset)   // 미달이면 400 (한국어 사유)
  :92   baseCreditCost = Σ 멤버 단가(VOCAB 3종은 QUESTION_GEN_VOCAB)
  :101  creditCost = baseCreditCost × QUESTION_SET_SAFETY_MAX_ATTEMPTS(=2)   presets.ts:30
  :103  WorkbenchAiJob 생성 (mode:"SET", config.members[] 스냅샷)
  :158  generateQuestionSet(...)
  :169  미사용 시도분 환불

generateQuestionSet                                   generate-set.ts:877-938
  → buildQuestionSet (최대 2회 시도)                   :733-770
      → buildQuestionSetOnce                          :555-723
          1) 구조 멤버 먼저 생성 → 표시 베이스 확정     :585-601
          2) 어법 우선 멤버(GRAMMAR_ERROR/CORRECTION) 순차 생성 + 앵커 예약  :612-637
          3) 나머지 비구조 멤버를 Promise.all 병렬 생성 :640-661
          4) 멤버별 앵커 추출 → 표시 베이스에 해소       :668-706
          5) scanSetForLeakage → OK | DEGRADED         :709-711
  → persistQuestionSet (단일 트랜잭션)                 :803-870
```

**★ 세트는 md-qgen 을 타지 않는다.** `generateOne`(`generate-set.ts:442-470`)이 부르는 것은
`runQuestionGenerationWithEmptyRetry` 이고, 이 파일에는 `getMdLane` 참조가 **0건**이다(grep 확인).
즉 UI 장문 세트 = 구형 JSON 스키마 엔진 경로다. **qbank 의 md 계약과 무관하다.**

**안전 재시도**: 1차가 DEGRADED 면 충돌·앵커 요약을 프롬프트로 주입해 1회 더 생성한다
(`generate-set.ts:196-235` 재시도 프롬프트 · `:743-767` 루프). 최대 2회(`presets.ts:30`).

---

## §3 한 지문에 여러 문항을 묶는 세트의 표현 방식

### 3.1 저장 스키마 — 지문은 **한 번만** 저장된다

```prisma
model QuestionSet {                                   prisma/schema.prisma:3552-3581
  structuralMode         String  @default("NONE")     // NONE | SENTENCE_ORDER | SENTENCE_INSERT
  canonicalPassage       String  @db.Text             // 정렬된 원본 — 학생에게 절대 안 보임
  displayedPassageLayout String  @db.Text             // JSON LayoutDescriptor — 학생이 보는 베이스
  layoutFingerprint      String                       // sha256(layout) — 앵커 해소 게이트
  itemCount              Int
  setLabel               String?                      // preset.label 이 그대로 들어간다
  basePassageId          String?
  status                 String  @default("OK")       // OK | DEGRADED
  subject                String?                      // null=ENGLISH, "KOREAN"
}
model QuestionSetItem {                               prisma/schema.prisma:3585-3601
  setId, questionId @unique
  orderInSet   Int      // 0-indexed, 삭제 후 sparse 허용
  isStructural Boolean
  spans        Json?    // Array<Anchor> — 권위 있는 앵커 저장소
  @@unique([setId, orderInSet])
}
```
멤버 `Question` 행에는 `inSet=true`, `setId` 가 붙어 일반 목록에서 숨겨진다(`generate-set.ts:846-848`).

### 3.2 누설 차단의 핵심 — **멤버는 지문 사본을 갖지 않는다**

`prepareSetMember`(`persistence.ts:55-88`):
- **구조 멤버**(글의 순서·문장 삽입): 표시 베이스를 스스로 정의하므로 자기 레이아웃 필드를 유지, `_spans:[]`.
- **비구조 멤버**: `passageWithBlank` / `passageWithMarkers` / `passageWithUnderline` / `passageWithNumbers`
  **4필드를 questionText 와 structuredData 양쪽에서 제거**(`persistence.ts:18-23, 30-36`)하고,
  그 자리에 재유도 가능한 **앵커**를 `structuredData._spans` + `QuestionSetItem.spans` 에 넣는다.

### 3.3 앵커(Anchor) — 절대 오프셋이 아니다

```ts
interface Anchor {                                    question-sets/types.ts:44-67
  kind: SpanKind;            // BLANK | MARKER | UNDERLINE | NUMBER | CIRCLED_LETTER | BLOCK | SENTENCE
  label?: string;            // "(A)" | "②" | "ⓐ"
  spanText: string;          // 베이스에서 찾을 문자열
  passageForm?: string;      // 표시할 문자열이 원문과 다를 때(어법 오류형·어휘 치환어)
  surroundingText?: string;  // ≥30자 창 — BLANK/UNDERLINE/MARKER 는 필수
  findStrategy?: expression | word | wordStrict | wordOrExpression | grammar;
  fallbackText?: string;
  occurrenceIndex?: number;  // 반복 토큰의 n번째 매치
  blockIndex?: number;       // SENTENCE_ORDER 전용
}
```
렌더 시 `reconstructPassageView(base, anchors)`(`reconstruct.ts:94-133`)가 **한 장의 병합 지문**을 만든다.
출력 리터럴(기존 렌더러·익스포터가 파싱하는 것과 동일 계약, `reconstruct.ts:9-13, 113-119`):
```
BLANK     → _____                (BLANK 상수)
MARKER    → __(A) expr__
UNDERLINE → __word__
```

### 3.4 문항 번호는 세트가 아니라 **시험지가** 매긴다

`setLabel` 은 `preset.label`(예: `"수능 43~45형"`)이 그대로 저장될 뿐이다(`generate-set.ts:823`).
실제 인쇄되는 묶음 헤더는 시험지 조판기가 `PaperItem.orderNum` 으로 계산한다:

```ts
function setPromptForItems(items) {                   paper-item-utils.tsx:196-206
  const orderNums = items.filter(i => i.blockType==="question" && i.orderNum>0).map(i=>i.orderNum);
  const first = Math.min(...orderNums), last = Math.max(...orderNums);
  const range = first === last ? `[${first}]` : `[${first}~${last}]`;
  return `${range} 다음 글을 읽고, 물음에 답하시오.`;
}
```
공유 지문은 그룹 첫머리에서 **1회만** 출력된다(`paper-item-utils.tsx:376-392`),
병합 지문은 `mergedSetPassageForItems`(`:160-193`)가 만든다:

```ts
export function buildQuestionSetMergedPassage(set) {   question-sets/render.ts:18-24
  const base = set.layout?.fullPassage ?? set.canonicalPassage;      // :12-17
  const anchors = set.members.flatMap(m => Array.isArray(m.spans) ? m.spans : []);
  return reconstructPassageView(base, anchors).text || base;
}
```
즉 **전 멤버의 앵커를 한 배열로 합쳐 베이스 1장에 올린다** — 세트가 "지문 1 + 문항 N" 인 이유가 이것이다.

### 3.5 세트 로딩 (`actions/question-sets.ts:110-136`)

`getQuestionSet(setId)` → `items` 를 `orderInSet asc` 로 정렬, 휴지통(`deletedAt`) 멤버 제외.
`QuestionSetForRender.members[]` 의 각 원소가
`{itemId, questionId, orderInSet, isStructural, typeId, difficulty, questionText, options, correctAnswer, structuredData, spans, approved, explanation}`.

---

## §4 내신 서술형 8종 + 각각의 채점 계약

### 4.1 8종 목록 — 진실원은 UI 그룹 정의다

`question-type-ui.ts:328-340` (`QUESTION_TYPE_GROUPS` 의 `"내신 서술형"` 그룹):

| # | typeId | 라벨 | requiredFields (`question-type-ui.ts`) | md 레인 |
|---|---|---|---|---|
| 1 | `CONDITIONAL_WRITING` | 조건부 영작 | `referenceSentence` · `conditions` · `modelAnswer` | 등록됨 (`lane-registry.ts:69`) |
| 2 | `SENTENCE_TRANSFORM` | 문장 전환 | `originalSentence` · `conditions` · `modelAnswer` | 〃 `:70` |
| 3 | `FILL_BLANK_KEY` | 핵심 표현 빈칸 | `sentenceWithBlank` · `answer` · `correctAnswer` | 〃 `:71` |
| 4 | `SUMMARY_COMPLETE` | 요약문 완성 | `summaryWithBlanks` · `blanks` · `correctAnswer` | 〃 `:72` |
| 5 | `SUMMARY_WRITING` | 요약문 영작 | `summaryWithBlanks` · `blanks` · `modelAnswer` | 〃 `:73` |
| 6 | `WORD_ORDER` | 배열 영작 | `scrambledWords` · `contextHint` · `modelAnswer` | 〃 `:74` |
| 7 | `TOPIC_SENTENCE_WRITING` | 주제문 영작 | `mode` · `modelAnswer` | 〃 `:75` |
| 8 | `GRAMMAR_CORRECTION` | 문법 오류 수정 | `underlinedSegments` · `passageWithUnderline` · `correctedPart` | 〃 `:67` |

> ⚠ `GRAMMAR_CORRECTION` 은 UI 상 "내신 서술형" 이지만 `lane-registry.ts` 에서는 **"어휘" 블록**에 등록돼 있다
> (`:35, :67`) — 분류 축이 파일마다 다르니 파일명·주석으로 추론하지 마라.

### 4.2 채점 파이프 (AI 0콜, 결정론)

```
buildAnswerSpec(question)   exam-scoring/answer-spec.ts:257-383   // 절대 throw 안 함
   → AnswerSpec { inputKind, textMode, fields[], partialCredit, points }
gradeAnswer(spec, input)    exam-scoring/grade.ts:68-148
```

`inputKind` 는 `MANUAL_ONLY | SINGLE_CHOICE | MULTI_CHOICE | TEXT_SINGLE | TEXT_MULTI`.
서답형은 `textSpec()`(`answer-spec.ts:174-193`)이 만든다: `fields.length===1` → `TEXT_SINGLE`,
2 이상 → `TEXT_MULTI` + `partialCredit:true`.

**필드 1개 판정** — `judgeTextField`(`grade.ts:41-60`):
```
student = normalizeText(입력)
if (student === "")                        → WRONG
if (field.answers.some(a => normalizeText(a) === student)) → CORRECT   ★ 집합 대조, 필터 없음
if (mode !== "LEMMA")                      → WRONG
lemmas 없음                                → NEEDS_REVIEW
lemmas 전부 토큰에 있음                     → NEEDS_REVIEW  (사람 확인)
else                                       → WRONG
```
한 필드라도 `NEEDS_REVIEW` 면 **문항 전체**가 `NEEDS_REVIEW`(`grade.ts:120`).
부분점수는 `points × correctCount / fields.length` 를 `round2` (`grade.ts:136-139`).

**`normalizeText` 가 흡수하는 것 전부**(`normalize.ts:84-96`) — 이 밖은 전부 오답이다:
NFC 합성 · 폭 0 문자(U+200B~200D, FEFF) 제거 · 스마트따옴표 → ASCII · 다중공백 → 1칸 + trim ·
**문말** 구두점 `[.,!?;:]+$` 제거 · 소문자화. **철자·어순·내부 구두점은 보존한다.**

### 4.3 8종 채점 계약 표

| typeId | inputKind | textMode | 답 필드 키 | 허용 정답 집합의 출처 | md 어댑터가 만드는 필드 |
|---|---|---|---|---|---|
| `CONDITIONAL_WRITING` | **`MANUAL_ONLY`** | — | — | **없음 — 기계 채점 불가**(`answer-spec.ts:250, 271-273`) | `modelAnswer` · `correctAnswer=modelAnswer` · `conditions[]` · `scoringCriteria[]` (`adapter-conditional-writing.ts:55-60`) |
| `SENTENCE_TRANSFORM` | **`MANUAL_ONLY`** | — | — | 〃 (`FREE_WRITING` 집합) | `modelAnswer` · `correctAnswer=modelAnswer` (`adapter-sentence-transform.ts:58-64`). ⚠ **`acceptedAnswers` 를 만들지 마라**(`:17-21`) |
| `FILL_BLANK_KEY` | `TEXT_SINGLE` | **`EXACT`** | `"answer"` | `mergeAnswerSet(data.answer ‖ correctAnswer, data.acceptedAnswers)` (`answer-spec.ts:292-301`) | `answer` · `acceptedAnswers` — **어댑터가 결정론으로 파생**, 모델에게 받지 않는다(`adapter-fill-blank-key.ts:17-26`) |
| `SUMMARY_COMPLETE` | `TEXT_MULTI`(blank≥2) | **`EXACT`** | `blanks[].label` (`"(A)"…`) | `fieldsFromBlanks`: `answer` + `blanks[].acceptedAnswers` + `blanks[].acceptableVariants` (`answer-spec.ts:195-220, 303-305`) | `blanks[{label, answer, acceptedAnswers}]` — `acceptedAnswers[0]` 은 **항상 answer 자신**(`adapter-summary-complete.ts:46-58, 80`) |
| `SUMMARY_WRITING` | `TEXT_*` 또는 `MANUAL_ONLY` | **§4.3a 분기표** | `blanks[].label` | 〃 + `requiredLemmas` | `scoringMode` = `exact→"EXACT"` / `keyword→"LEMMA"` / `rubric→"LLM_RUBRIC"` (`adapter-summary-writing.ts:43-50`) |
| `WORD_ORDER` | `TEXT_SINGLE` | **`EXACT`** | `"answer"` | `mergeAnswerSet(modelAnswer ‖ correctAnswer, data.acceptedAnswers)` (`answer-spec.ts:331-341`) | `acceptedAnswers[0]=modelAnswer`, 나머지는 **"제시 칩으로 조립 가능한 등가 어순"만** (`adapter-word-order.ts:71-81`) |
| `TOPIC_SENTENCE_WRITING` | `TEXT_*` | **`VARIANTS`** | cloze → `blanks[].label` / scrambled → `"answer"` | blanks 있으면 blanks, 없으면 `[modelAnswer, ...acceptableVariants]` (`answer-spec.ts:316-329`) | `blanks[].acceptableVariants` · `acceptableVariants` · `correctAnswer=modelAnswer`. **`requiredLemmas` 를 만들지 않는다**(`adapter-topic-sentence-writing.ts:18`) |
| `GRAMMAR_CORRECTION` | `TEXT_*` | **`EXACT`** | `"seg-1"`, `"seg-2"`… | 세그먼트별 `mergeAnswerSet(correctedPart, seg.acceptedAnswers)`. `isError===false` 세그먼트는 **필드에서 제외**. 세그먼트가 0개면 `correctedParts[]` 로 폴백 (`answer-spec.ts:343-373`) | `underlinedSegments[{label, errorPart, correctedPart, acceptedAnswers?}]` (`adapter-grammar-correction.ts:121-124`) |

`mergeAnswerSet`(`answer-spec.ts:78-86`): `[primary, ...acceptedAnswers, ...variants]` 를 **원문 그대로** dedupe.
정규화 dedupe 를 하지 않는 이유는 원문 소실 방지.

#### 4.3a SUMMARY_WRITING 채점 분기 (`answer-spec.ts:307-314`)

| `scoringGranularity` (노브) | `scoringMode` (저장 필드) | 최종 채점 |
|---|---|---|
| `exact` | `"EXACT"` | `inputKind=TEXT_*`, **`textMode="VARIANTS"`** ← ⚠ `"EXACT"` 가 아니다. `answer-spec.ts:313` 은 `scoringMode==="LEMMA"` 일 때만 LEMMA 를 주고 나머지는 전부 VARIANTS 로 접는다 |
| `keyword` (BASIC/INTERMEDIATE 프리셋 기본) | `"LEMMA"` | `textMode="LEMMA"` — 허용 집합 불일치 시 `requiredLemmas` 전부 포함이면 **`NEEDS_REVIEW`**(자동 정답 아님, `grade.ts:54-59`) |
| `rubric` (KILLER 프리셋 기본) | `"LLM_RUBRIC"` | **`MANUAL_ONLY`** — 자동 채점 전면 포기 |

`textMode` 가 `EXACT`/`VARIANTS` 이면 `judgeTextField` 의 동작은 **완전히 동일하다**
(`grade.ts:50-52` — 둘 다 집합 대조 후 불일치면 즉시 WRONG). 이름만 다르다.

### 4.4 ★ acceptedAnswers 는 **무필터 만점 집합**이다 — 최대 위험

`grade.ts:50` 은 집합의 어느 원소와든 `normalizeText` 후 같으면 즉시 `CORRECT` 다.
**의미 검증이 없다.** 그래서 코드가 이 집합의 생산을 **모델에게서 빼앗아** 왔다:

- `FILL_BLANK_KEY`: 허용답 계약이 **표기 변형만**(축약형·대소문자·아포스트로피)이라
  `deriveOrthographicVariants`(`adapter-fill-blank-key.ts:97-119`)가 34쌍 축약표에서
  **양방향·최대 4개**를 결정론 생성한다. 동의어·패러프레이즈·관계사 치환(in which↔where)은 금지
  (`adapter-fill-blank-key.ts:17-22`). 파서 스냅은 표기 변형이 아닌 허용답을 **폐기**한다
  (`parser-fill-blank-key.ts:405-418`).
- `WORD_ORDER`: 칩 멀티셋이 같은 **등가 어순만** 허용답이다(`adapter-word-order.ts:71-73`).
- `SUMMARY_COMPLETE`: `acceptedAnswers[0]` 에 answer 자신을 강제 삽입, 나머지는 게이트 통과분만
  (`adapter-summary-complete.ts:23-25, 47-58`).

> **qbank 저작 규칙**: `허용답:` 줄에 동의어를 쓰면 그 문항은 오답을 만점 처리한다.
> 표기 변형(축약·대소문자)은 애초에 `normalizeText` 또는 어댑터가 처리하므로 **쓸 이유도 없다.**

### 4.5 8종의 md 머리표 리터럴 (참조)

| typeId | 인식되는 머리표 (정본 / 별칭) |
|---|---|
| `CONDITIONAL_WRITING` | `우리말:`(`영작할 우리말`) · `조건:`(`작성 조건`, 번호 허용) · **`모범답안:`** · `채점기준:` · `해설:` · (별칭)`정답:` — `parser-conditional-writing.ts:61-68` |
| `SENTENCE_TRANSFORM` | `원문장:`/`원래 문장:`/`대상 문장:`/`전환 대상:`/`원문:` · `전환조건:`/`작성조건:`/`조건:` · **`모범답안:`** · `채점기준:` · `해설:` · (별칭)`정답:`/`답안:`/`답:` — `parser-sentence-transform.ts:172-179` |
| `FILL_BLANK_KEY` | `빈칸문장:` · `허용답:` · `정답:` · `해설:` — `parser-fill-blank-key.ts:140-147` |
| `SUMMARY_COMPLETE` | `요약문:` · **`정답(A):`** · `허용답(A):`/`허용정답(A):`/`동치(A):` · `해설:` — `parser-summary-complete.ts:121-127` |
| `SUMMARY_WRITING` | `요약문` `해석` `보기` `미끼` **`정답`**(라벨) `동치`(라벨) `핵심어`(라벨) `모범답안` `채점기준` `해설` `오답` — `parser-summary-writing.ts:106-118`. 라벨 뒤 **콜론 필수**(`:148-161`) |
| `WORD_ORDER` | **`모범답안:`** · `정답:` · `칩:`/`배열단어:`/`제시단어:` · `미끼:` · `(문맥)힌트:` · `허용답(안):` · `해설:` · `채점기준:` — `parser-word-order.ts:66-73` |
| `TOPIC_SENTENCE_WRITING` | `방식` `주제문` `주제` `칩` `보기` `미끼` `힌트` `허용답` `채점기준` `해설` `모범답안` **`정답(A)`** `동치(A)` — `parser-topic-sentence-writing.ts:98` |
| `GRAMMAR_CORRECTION` | `밑줄지문:` · **`고침(A):`** · `허용답(A):` · `해설:` (+ `정답`/`오답` 은 **경계로만** 인식, 계약 아님) — `parser-grammar-correction.ts:97-116` |

`WORD_ORDER` 의 칩 경계는 `모범답안:` 줄 **안의 ` / ` 청크 마커**다 — 칩을 따로 받지 않는다
(`parser-word-order.ts:8-11`). `SUMMARY_WRITING`·cloze `TOPIC_SENTENCE_WRITING` 의 `모범답안` 은
**받지 않고 치환으로 파생**한다(`adapter-summary-writing.ts:80-82`, `parser-topic-sentence-writing.ts:9-11, 282`).

---

## §5 `GRAMMAR_CHOICE_COMBO` 가 지원하는 조합 축

### 5.1 결론 — 조합 축은 **어법 하나**다. 어법+어휘는 불가능하다.

| 축 | 지원? | 근거 |
|---|---|---|
| 네모 개수 | **3 고정** | `COMBO_MD_SLOT_COUNT = 3`(`prompts-combo.ts:35`). `clampComboMdSlotCount` 는 3 이외의 값을 **전부 3으로 되돌린다**(`prompts-combo.ts:244-246`). 라벨 축은 `COMBO_LABEL_KEYS="ABC"`(`parser-combo.ts:34`) |
| 선지 개수 | **5 고정** | `COMBO_MD_OPTION_COUNT = 5`(`prompts-combo.ts:36`), 라벨 `①②③④⑤`(`parser-combo.ts:35`) |
| 네모당 후보 | **정확히 2** | 게이트 #3: `candidates.length !== 2` 면 반려(`gate-combo.ts:344-346`) |
| 어법 포인트 | **13종 중 3개 선택** | `POINT_NAME` a~m(`adapter.ts:28-42`). 게이트가 코드 `^[a-m]$` 강제 + **3개 서로 달라야 함**(`gate-combo.ts:202-204, 370-373`) |
| 어휘(의미) 판단 결합 | **✗ 불가** | 슬롯 스키마에 어휘 축이 없다: `{label, correct, wrong, code}` 뿐이고 `code` 는 어법 코드 닫힌집합(`parser-combo.ts:37-46`). 어댑터가 `POINT_NAME[code]` 밖이면 `"a"`(정동사·준동사)로 **강등**한다(`adapter-combo.ts:84`) |
| 개수 노브 | **✗ 없음** | `dispatchers.ts:121-136` 이 반환하는 것은 `grammarPointFocus` 단독. 실행 검증에서도 그 한 키뿐 |

**13개 어법 포인트 코드**(`adapter.ts:28-42`):
`a` 정동사·준동사 / `b` 관계사 / `c` 분사 / `d` 수일치 / `e` 능·수동태 / `f` 형용사·부사 /
`g` 대명사 / `h` 목적격보어 / `i` 병렬 / `j` 가정법 / `k` 부정사·동명사 / `l` 전치사·접속사 / `m` 비교구문.

→ **조합의 자유도는 "13종에서 서로 다른 3종을 고르는 것" 이 전부다.**
어휘 적절성을 섞고 싶다면 별도 유형(`VOCAB_CHOICE`)으로 만들어야 하며, 코드상 결합 경로가 없다.

### 5.2 md 형식 리터럴 (`parser-combo.ts:123-184`)

```
네모지문:
<지문 — 네모 자리는 [[A:올바른표현|틀린표현]] 형식>
원형·포인트:
(A) 올바른표현 | 틀린표현 | c
(B) …
(C) …
선지:
① valueA …… valueB …… valueC
… (5개)
정답: ③
해설: …
오답:
① …
```
- 인라인 마커: `/\[\[([A-C]):((?:(?!\]\]).)+)\]\]/g` (`parser-combo.ts:28`). **파이프 분해는 파서가 나중에** 한다.
- 값 구분자 리터럴 ` …… `, 파싱 관용 `/\s*(?:…+|\.{3,})\s*/` (`prompts-combo.ts:39`, `parser-combo.ts:31`).
- 메타 줄 정규식: `/^[([]?([A-Ca-c])[)\].]?\s*(.+?)\s*\|\s*(.+?)\s*\|\s*\(?\s*([a-mA-M])\s*\)?(?:\s+[^|]*)?$/gm` (`:133-134`).
- 섹션 머리표는 `원형·포인트:` 가 정본, `원형:` 이 별칭(`:128-130`).

### 5.3 게이트 18항목 (`gate-combo.ts:309-434`) — 저작 시 반드시 만족

`#1` 네모 마커 3개 · `#2` 라벨 지문 등장순 `(A)(B)(C)` · `#3` 후보 정확히 2 ·
`#4` 마커와 메타 축자 일치 · **`#5` 지문 재구성 대조**(마커를 올바른 표현으로 되돌리면 `normalizeWs` 동일) ·
`#6` 두 후보 동일 금지 · `#7` 후보에 `/ [ ] | …` 금지 · `#8` 포인트코드 `[a-m]` ·
`#9` **시제 단독 토글 금지**(`isDisputableTenseToggle`) + **수량 토글 3분기**(`collectQuantityAnswerIssues`) +
**지각·사역동사 보어 토글 금지** · `#10` 포인트코드 3개 서로 다름 ·
`#11` **누설 3분기**(단일 후보 잔존 / 직전 단어 연어 잔존 / that·what 패턴 잔존) ·
`#12` 주격 관계대명사 직후 준동사 후보 금지 · `#12b` 보문 that 오라벨 금지 ·
`#13` 선지 5개 `①~⑤` · `#14` 값 3개·후보 중 하나 · `#15` 조합 중복 금지 ·
`#16` **전부-올바른 조합 정확히 1개** + 정답 라벨 일치 · `#17` near-miss(한 네모만 틀림) 최소 1개 +
각 틀린 후보가 오답 선지에 최소 1회 등장 · `#18` 해설 절단 금지 + 해설에 `정답:` 줄 혼입 금지 +
**오답해설 라벨 집합 = 정답 제외 전 선지**(중복·빈 본문 금지).

---

## §6 장문(250단어+) 지문으로 만들 수 있는 내신형 조합 문항 — 실현 가능 목록

### 6.1 먼저: 세트 조합을 지배하는 규칙 두 층

**층 1 — `validateSetComposition`(사전 게이트, 유형만 보고 판정)** `leakage-gate.ts:76-136`
1. 멤버 ≥ 1
2. 구조 변형 유형(`SENTENCE_ORDER`/`SENTENCE_INSERT`/`IRRELEVANT`)은 **세트당 1개**
3. `IRRELEVANT` 는 **단독 출제만** (외래 문장을 주입하므로 다른 멤버를 호스팅 불가)
4. `structuralMode !== "NONE"` 이면 그 유형이 멤버에 있어야 하고, `"NONE"` 인데 순서/삽입이 있으면 오류
5. ★ **`SpanKind` 가 `BLANK` 또는 `MARKER` 인 유형은 다른 문항과 묶을 수 없다(단독 출제)** —
   빈칸(`BLANK_INFERENCE`·`FILL_BLANK_KEY`)과 마커(`GRAMMAR_ERROR`·`GRAMMAR_CORRECTION`·`VOCAB_CHOICE`·`ANTONYM`)

**층 2 — `scanSetForLeakage`(사후 스캔, 해소된 문자 범위로 판정)** `leakage-gate.ts:193-262`
- `kindsLeak(a,b)`(`:28-38`): `BLANK`/`MARKER` 가 한쪽이면 **무조건 누설**. 한쪽이 `UNDERLINE` 이면 안전.
  둘 다 구조 마크면 누설(한 베이스에 두 레이아웃 불가).
- 판정 축 2개: **문자 범위 겹침** + **같은 문장 안에 있음**. 둘 중 하나면 `ERROR` → 세트 `DEGRADED`.
- `UNDERLINE`+`UNDERLINE` 은 **겹칠 때만** 오류(같은 문장은 허용) — 43~45 케이스가 이래서 성립한다.

### 6.2 ★ 결정적 실측 — 층 1은 **연결되어 있지 않다**

`validateSetComposition` / `validatePresetDefinition` 의 호출자는 `presets.ts` 자기 자신뿐이다
(repo 전수 grep: `src/lib/question-sets/presets.ts:294` 외 **0건**). 런타임 경로
(`route.ts` → `generateQuestionSet` → `buildQuestionSetOnce`)는 층 2(`scanSetForLeakage`)만 부른다
(`generate-set.ts:709`).

**그 결과 shipped 프리셋 10개 중 3개가 자기 검증기를 통과하지 못한다.** 실행 검증:
```
$ npx tsx  (SET_PRESETS 전량 → validatePresetDefinition)
ok   read-core-2 / read-comprehensive-3 / vocab-meaning / summary-set
ok   csat-43-45 / sentence-insert-3 / structure-killer-3
FAIL blank-reading-3      빈칸·어법·어휘 유형은 지문 표시를 독점하므로 다른 문항과 묶을 수 없습니다(단독 출제): BLANK_INFERENCE
FAIL grammar-judgment-3   … : GRAMMAR_ERROR
FAIL grammar-correction-3 … : GRAMMAR_CORRECTION
```
**왜 런타임에서는 통과하는가**: 함께 묶인 `MAIN_IDEA`/`CONTENT_MATCH`/`REFERENCE` 중
앞의 둘은 `TYPE_TO_SPANKIND` 가 `null` 이라 **앵커를 0개 생성**한다(`types.ts:140-151`).
스팬이 없으면 겹침도 동일 문장도 성립하지 않으므로 층 2는 아무 충돌도 못 본다.
`REFERENCE` 는 `UNDERLINE` 이라 `MARKER` 와 만나면 층 2가 잡지만, **다른 문장이면 통과**한다.

> **판단**: 층 1은 "설계 의도", 층 2가 "실제 집행"이다. 문서화·계획은 **층 2 기준**으로 하되,
> 층 1이 금지한 조합은 **설계상 위험 조합**으로 표시하라. 이 불일치는 [미상] 이 아니라 실측 결함이다.

### 6.3 장문 지문(250단어+)에서 **코드가 지원하는** 조합

250단어 지문은 모든 프리셋의 `minWords`(최대 150)와 `minSentences`(최대 7)를 넉넉히 넘긴다
→ **tier 1 프리셋 10개 전부가 UI 메뉴에 열린다**(`presets.ts:275-283`).

| # | 조합 | 프리셋 | 층 1 | 층 2(런타임) | 판정 |
|---|---|---|---|---|---|
| 1 | 요지/주장 + 내용일치 | `read-core-2` | ✅ | ✅ 앵커 0개 | **완전 지원** |
| 2 | 제목 + 지칭 + 내용일치 | `read-comprehensive-3` | ✅ | ✅ UNDERLINE 1개뿐 | **완전 지원** |
| 3 | 동의어 + 문맥 속 의미 | `vocab-meaning` | ✅ | ⚠ UNDERLINE×2 — **다른 단어**여야 하고 겹치면 ERROR(`leakage-gate.ts:216-226`) | **지원(주의)** |
| 4 | 요약문완성(MC) + 제목 + 내용일치 | `summary-set` | ✅ | ✅ | **완전 지원** |
| 5 | 글의 순서 + 지칭 + 내용일치 | `csat-43-45` | ✅ | ✅ BLOCK+UNDERLINE 은 `kindsLeak=false` | **완전 지원(정통 43~45)** |
| 6 | 문장 삽입 + 지칭 + 내용일치 | `sentence-insert-3` | ✅ | ✅ NUMBER+UNDERLINE 안전 | **완전 지원** |
| 7 | 문장 삽입(KILLER) + 제목 + 요지 | `structure-killer-3` | ✅ | ✅ | **완전 지원** |
| 8 | **빈칸 추론(KILLER) + 요지 + 내용일치** | `blank-reading-3` | ❌ | ✅(앵커 0) | **런타임 동작 / 설계상 금지 조합** |
| 9 | **어법 판단 + 지칭 + 내용일치** | `grammar-judgment-3` | ❌ | ⚠ MARKER+UNDERLINE — **다른 문장**이면 통과, 같은 문장이면 ERROR | **런타임 동작 / 설계상 금지 조합** |
| 10 | **어법 수정 + 요지 + 내용일치** | `grammar-correction-3` | ❌ | ✅(앵커 0) | **런타임 동작 / 설계상 금지 조합** |

`generate-set.ts:164-167, 608-637` 은 이 위험을 알고 **어법 유형(`GRAMMAR_ERROR`/`GRAMMAR_CORRECTION`)을
먼저 순차 생성해 앵커를 "예약"** 하고, 나머지 멤버 프롬프트에 그 좌표를 금지 구역으로 주입한다
(`buildReservedAnchorPrompt`, `:270-300`). 즉 8~10번은 **완화 장치가 붙은 위반**이다.

### 6.4 코드가 **지원하지 않는** 조합 (전부 실측 근거)

| 조합 | 왜 불가능한가 |
|---|---|
| **임의 유형 자유 조합** | UI 는 프리셋만 노출한다(`set-builder-panel.tsx:280`). 라우트는 `resolvePreset` 실패 시 400(`route.ts:67-70`). **자유 조합 API 가 없다.** |
| **무관한 문장(`IRRELEVANT`) 을 포함한 세트** | 층 1 규칙 3 (`leakage-gate.ts:96-98`) + 프리셋 레지스트리에 `IRRELEVANT` 멤버가 **하나도 없다**. `STRUCTURAL_TYPES` 주석 `"solo-only"`(`types.ts:157`) |
| **글의 순서 + 문장 삽입 동시** | 층 1 규칙 2 + `LayoutDescriptor.type` 이 단일 값(`types.ts:93-107`). 표시 베이스는 하나뿐이다 |
| **네모 어법(`GRAMMAR_CHOICE_COMBO`) 세트 멤버** | `TYPE_TO_SPANKIND` 에 **엔트리 자체가 없다**(`types.ts:121-151`) → `spanKindOf` 가 `null` 반환, `extractAnchors` 대상 아님. 프리셋에도 없다. **세트로 못 낸다** |
| **서술형 8종 대부분의 세트 멤버화** | `TYPE_TO_SPANKIND` 에 `SUMMARY_COMPLETE`/`CONDITIONAL_WRITING`/`SENTENCE_TRANSFORM`/`WORD_ORDER`/`TOPIC_SENTENCE_WRITING` 는 `null` 로 **등록만** 돼 있고(`types.ts:145-150`) 어느 프리셋에도 멤버로 없다. `SUMMARY_WRITING` 은 아예 미등록. → **현재 세트로 출제 불가** |
| **빈칸/어법/어휘 2개 이상 한 세트** | 층 1 규칙 5 + 층 2 `EXCLUSIVE_KINDS`(`leakage-gate.ts:26-38`)가 무조건 누설 판정 |
| **세트 멤버 수 4 이상** | 코드 상한은 없으나 **프리셋 최대가 3문항**이다(`presets.ts:67-225`). 4문항 프리셋을 추가하지 않는 한 불가 |
| **세트를 md-qgen 으로 생성** | `generate-set.ts:442-470` 이 구형 JSON 엔진 고정. md 레인 진입점 없음 |

### 6.5 qbank 프로젝트에 대한 함의

1. **우리 40만 문항은 세트가 아니다.** 유닛 = 1지문 × 1유형 × 5~8문항이고, md 레인 계약만 지키면 된다.
   §2~§3 의 세트 배관은 **우리 산출물이 나중에 시험지에 얹힐 때** 만나는 축이다(§3.4 번호 규칙).
2. **250단어 지문의 진짜 이점은 세트가 아니라 노브 상한이다.** 장문이면
   `IRRELEVANT.slotCount` 10, `SENTENCE_INSERT.slotCount` 8, `CONTENT_MATCH.optionCount` 12,
   `GRAMMAR_ERROR/VOCAB_CHOICE.markerCount` 10 을 **실제로 채울 수 있다.**
   짧은 지문에서는 `validateIrrelevantAgainstPassage`(`irrelevant.ts:42-68`)가 물리적으로 막는다.
3. **내신형 조합의 실현 경로는 두 갈래다.**
   (a) **세트로**: §6.3 의 10개 프리셋 — 유형 조합은 고정, 멤버별 노브만 조정 가능.
   (b) **유닛으로**: 한 지문에 서로 다른 유형의 유닛을 여러 개 만들고 시험지에서 나란히 배치.
   (b) 는 코드 제약이 0이고 우리 파이프라인 그대로다. **누설 책임이 우리에게 온다**는 점만 다르다 —
   같은 지문의 빈칸 유닛과 어법 유닛을 한 시험지에 붙이면 층 1이 금지한 바로 그 상황이 재현된다.

---

## §7 미확인 항목

- `SET_PRESETS` 의 `tier: 2`(숨김 후보) 프리셋 — 레지스트리에 **현재 0건**(전부 `tier:1`). 향후 추가 시 UI 필터가 걸러낸다
- KO(국어) 세트 파이프라인(`use-korean-set-generation.ts`) — 영어 장문 세트와 완전 분기, 본 정찰 범위 밖 **[미상]**
- `SummaryWritingGenerationSettings` 의 `wordBankOrder`/`wordBankChunking`/`connectorFrame`/
  `summarySourceMode`/`sourceSentenceParaphrase` 가 UI 에 노출되는지 — `type-numeric-detail.tsx:199-478`
  에서 확인된 노출 노브는 blankCount·gloss·wordBank(2)·usage·distractors·fidelity·clueMode·
  targetWordsMode·targetWordsPerBlank·blankAssignment 로, 나머지는 **UI 미노출로 보이나 전수 확인 안 함** **[미상]**
