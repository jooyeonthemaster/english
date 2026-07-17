# Reviewer calibration v3 production type binding v1

상태: **BINDING VALID / PRIOR v3 STANDALONE BLOCKED / OFFLINE ZERO-COST**

## 결론

현재 영어 문제 생성 화면의 정본은 `QUESTION_TYPE_GROUPS → EXAM_TYPE_GROUPS → GenerationConfigPanel(koPanel=false)`이다. 이 경로에는 정확히 25개 유형이 있다. 집중 평가 유형 `BLANK_INFERENCE`, `GRAMMAR_ERROR`를 제외하면 calibration v3의 canonical nonfocus universe는 정확히 23개다.

반면 구조화·AI 생성 schema와 문제은행 filter에는 26개가 있다. 추가 1개 `TOPIC_MAIN_IDEA`는 소스가 명시한 레거시 통합형이며 현재 신규 생성 picker에는 없다. `QUESTION_SUBTYPES` 상수는 24개이고, canonical 신규 유형 `GRAMMAR_CHOICE_COMBO`가 빠져 있다. 따라서 25·26·24라는 수는 서로 모순된 세 개의 정본이 아니라 각각 **신규 생성 UI**, **레거시 호환 schema/filter**, **낡은 상수**의 수다.

기존 `reviewer-calibration-v3-replacement-v1`의 논리 23유형은 실제 23유형과 exact ID가 9개만 겹친다. 기존 파일은 설계 당시부터 production binding 전 발행을 막고 있었으므로 수정하지 않았다. 앞으로 실행 packet이 이 binding과 manifest를 hash-bind하고 기존 `logicalTypes`를 사용하지 않을 때만 해당 BLOCKER가 해소된다.

## Source/Git 결박

검증기는 source 전체 SHA-256, Git HEAD blob, clean/modified 상태, AST에서 추출한 enum 집합을 함께 확인한다. 전체 상세치는 `binding.json#sources`에 있다.

| 역할 | 소스 | 현재 SHA-256 앞 12자리 | 상태 |
|---|---|---|---|
| 신규 생성 UI 정본 | `src/lib/question-type-ui.ts` | `19946584a591` | clean |
| picker alias | `.../generate/generate-page-types.ts` | `bef8c1a9c985` | clean |
| picker consumer | `.../generate/generation-config-panel.tsx` | `b20357b0d224` | clean |
| 구조화 schema | `src/lib/question-schemas.ts` | `6037aaad366f` | clean |
| AI schema MC/essay | `src/lib/question-ai-schemas-mc.ts` | `c538452b7810` | modified, registry unchanged |
| AI schema vocab | `src/lib/question-ai-schemas-vocab.ts` | `71f041c8f073` | clean |
| production schema dispatch | `src/app/api/ai/generate-question/route.ts` | `afadfaf79d51` | clean |
| 저장 문항 filter | `src/components/workbench/question-type-filter.tsx` | `adaf0585b8e3` | clean |
| legacy 상수 | `src/lib/constants.ts` | `a826ee6070a1` | clean |
| legacy 분류 근거 | `src/lib/question-ai-edit/type-edit-config.ts` | `c9ffea7b5a15` | clean |

동결 당시 repository HEAD는 `467c6d107137a91088d3eba1620ba4036a63d709`이다. `question-ai-schemas-mc.ts`의 worktree 변경은 research-aware response wrapper와 빈칸 해설 문구 변경이며 registry ID에는 변화가 없었다. 검증기는 그래도 현재 전체 bytes를 결박하므로 이후 어떤 변경도 새 검토 없이 통과하지 않는다.

## Canonical 25와 focus 제외 23

UI 순서는 다음과 같다.

1. `BLANK_INFERENCE` — focus
2. `GRAMMAR_ERROR` — focus
3. `GRAMMAR_CHOICE_COMBO`
4. `VOCAB_CHOICE`
5. `SENTENCE_ORDER`
6. `SENTENCE_INSERT`
7. `TOPIC`
8. `MAIN_IDEA`
9. `TITLE`
10. `IMPLIED_MEANING`
11. `REFERENCE`
12. `CONTENT_MATCH`
13. `SUMMARY_COMPLETE_MC`
14. `IRRELEVANT`
15. `CONDITIONAL_WRITING`
16. `SENTENCE_TRANSFORM`
17. `FILL_BLANK_KEY`
18. `SUMMARY_COMPLETE`
19. `SUMMARY_WRITING`
20. `WORD_ORDER`
21. `TOPIC_SENTENCE_WRITING`
22. `GRAMMAR_CORRECTION`
23. `CONTEXT_MEANING`
24. `SYNONYM`
25. `ANTONYM`

3~25가 누락·중복 없는 canonical nonfocus 23개다. `GRAMMAR_CHOICE_COMBO`와 `GRAMMAR_CORRECTION`은 문법 관련 유형이지만 이번 focus 정의는 오직 `GRAMMAR_ERROR`와 `BLANK_INFERENCE`이므로 nonfocus family에 남는다.

## 23 → 8 construct family 전수 mapping

| Family | Rotation order | 수 |
|---|---|---:|
| `NF-F1-GLOBAL_MEANING_SELECTION` | `TOPIC → MAIN_IDEA → TITLE` | 3 |
| `NF-F2-LOCAL_INFERENCE_AND_REFERENCE` | `IMPLIED_MEANING → REFERENCE → CONTENT_MATCH` | 3 |
| `NF-F3-DISCOURSE_STRUCTURE` | `SENTENCE_ORDER → SENTENCE_INSERT → IRRELEVANT` | 3 |
| `NF-F4-GRAMMAR_FORM_DIAGNOSIS` | `GRAMMAR_CHOICE_COMBO → GRAMMAR_CORRECTION` | 2 |
| `NF-F5-LEXICAL_SEMANTICS` | `VOCAB_CHOICE → CONTEXT_MEANING → SYNONYM → ANTONYM` | 4 |
| `NF-F6-SUMMARY_AND_COMPRESSION` | `SUMMARY_COMPLETE_MC → SUMMARY_COMPLETE → SUMMARY_WRITING` | 3 |
| `NF-F7-CONTROLLED_REWRITE_AND_ORDER` | `CONDITIONAL_WRITING → SENTENCE_TRANSFORM → WORD_ORDER` | 3 |
| `NF-F8-TARGETED_CONSTRUCTED_EXPRESSION` | `FILL_BLANK_KEY → TOPIC_SENTENCE_WRITING` | 2 |

합계는 23이고 focus·legacy ID는 0개다. family는 평가 construct 공유를 위한 표집 층이지 type 동치 선언이 아니다.

## Rotation과 coverage

epoch는 1부터 시작한다. family 크기를 `n`이라 할 때:

- main index: `(2 × (epoch - 1)) mod n`
- holdout index: `(2 × (epoch - 1) + 1) mod n`

각 epoch의 main과 holdout은 family마다 서로 다른 유형을 쓴다. 한 epoch에는 main 8 + holdout 8의 서로 다른 16유형만 나온다. 따라서 **단일 epoch all-type claim은 금지**다.

두 epoch의 main+holdout을 합치면 23개를 최소 한 번씩 접한다. main만 사용하면 네 epoch가 필요하다. 후보가 preflight·pilot에서 실패해도 rotation을 전진시키지 않고 같은 type으로 새 후보를 발행한다. 결과를 본 뒤 어려운 type을 건너뛰거나 순서를 바꾸는 행위는 금지한다. taxonomy pilot 문항은 coverage에 포함하지 않는다.

23유형 전체 평가를 주장하려면 append-only coverage ledger에서 각 canonical ID가 fresh main 또는 activation holdout으로 실제 통과한 기록이 있어야 한다. family-level 전이만으로는 충분하지 않다.

## Alias·deprecated·display-only 처리

### `TOPIC_MAIN_IDEA`

- 구조화 schema: 있음
- AI schema: 있음
- 저장 문항 filter: 있음
- 신규 생성 UI: 없음
- calibration canonical 23: 제외
- 상태: `LEGACY_SCHEMA_AND_FILTER_COMPATIBILITY_ONLY`

소스 설명은 이를 레거시 문제/레거시 통합형으로 명시한다. 역사 데이터는 원래 ID를 보존한다. 의미에 따라 `TOPIC` 또는 `MAIN_IDEA`일 수 있으므로 자동 alias rewrite는 금지한다. 필요하면 별도의 legacy supplemental audit에서만 다루며, canonical 23의 coverage cell을 채우지 못한다.

### `GRAMMAR_CHOICE_COMBO`

- 신규 생성 UI: 있음
- 구조화·AI schema: 있음
- 저장 문항 filter: 있음
- legacy `QUESTION_SUBTYPES`: 없음
- 상태: `CANONICAL_UI_AND_SCHEMA_LEGACY_CONSTANT_MISSING`

상수의 누락은 deprecation이 아니라 drift다. calibration 23에서 제외하면 안 된다.

그 외 canonical 25에는 alias 또는 deprecated ID가 없다. filter의 `CUSTOM`, `CUSTOM_LAYOUT` label은 `TYPE_SUBTYPE_MAP`의 English generation type가 아니므로 26개 schema/filter 비교에 포함하지 않는다.

## 기존 v3 설계 mismatch BLOCKER

기존 논리 23개와 실제 canonical 23개의 exact 교집합은 9개다.

- 기존에만 있던 논리 ID 14개: `PURPOSE`, `CLAIM`, `GIST`, `CONTENT_MISMATCH`, `INFERENCE`, `CHART`, `PRACTICAL_INFO`, `MOOD`, `VOCABULARY_CONTEXT`, `IRRELEVANT_SENTENCE`, `SENTENCE_INSERTION`, `SUMMARY_COMPLETION`, `SHORT_ANSWER`, `MULTI_ITEM_COMPOSITE`
- production에만 있는 canonical ID 14개: `VOCAB_CHOICE`, `SENTENCE_INSERT`, `MAIN_IDEA`, `IMPLIED_MEANING`, `REFERENCE`, `SUMMARY_COMPLETE_MC`, `IRRELEVANT`, `CONDITIONAL_WRITING`, `FILL_BLANK_KEY`, `SUMMARY_COMPLETE`, `SUMMARY_WRITING`, `TOPIC_SENTENCE_WRITING`, `CONTEXT_MEANING`, `ANTONYM`

유사해 보이는 이름도 자동 동일시하지 않는다. 예를 들어 `SENTENCE_INSERTION`과 `SENTENCE_INSERT`, `SUMMARY_COMPLETION`과 두 종류의 실제 summary type은 exact production binding이 아니다.

BLOCKER 코드는 `PRIOR_V3_LOGICAL_UNIVERSE_NOT_PRODUCTION_BOUND`다. 새 실행 packet이 이 artifact·manifest hash를 결박하고 여기의 `canonicalUniverse`와 `families`를 사용하기 전까지 기존 protocol 단독 발행은 금지된다. 기존 artifact를 사후 수정하지 않아 audit trail을 보존했다.

## Fail-closed 검증

`verify.mjs`는 다음을 AST와 전체 파일 hash로 동시에 검증한다.

- UI 25, focus 2, nonfocus 23의 exact 순서·집합
- 구조화 schema 26과 AI schema 26의 exact 일치
- schema/filter 추가 ID가 오직 `TOPIC_MAIN_IDEA`인지
- legacy 상수의 유일한 누락이 `GRAMMAR_CHOICE_COMBO`인지
- 23개가 8 family에 정확히 한 번씩 매핑됐는지
- focus와 legacy ID가 family에 0개인지
- 1 epoch 16개, 2 epoch combined 23개, main-only 4 epoch 23개인지
- 기존 논리 universe와의 9/14/14 mismatch 및 BLOCKER가 보존됐는지
- Git/source/manifest가 동결값과 일치하는지

새 유형, alias 상태, UI/schema set difference, source byte, rotation 중 하나라도 바뀌면 `FAIL_CLOSED`로 종료한다.

## 활동 및 비용

이 작업의 network/API/model/DB/secret/trusted-gold 접근은 모두 0이다. provider 비용과 1,000개 API candidate budget 소비도 0이다.
