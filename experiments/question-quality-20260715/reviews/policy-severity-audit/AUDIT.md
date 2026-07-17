# 전 유형 quality-policy severity fresh audit

## 판정

**BLOCK — 현행 notice/ship-first 분류는 V1~V5 불변식을 완전히 보존하지 않는다.**

현재 `SHIP_FIRST_WARNING_CODES` 31개와 `SALVAGE_RELAXABLE_CODES` 99개의 합집합은 102개다. 이를 현재 emitter까지 역추적해 전수 분류한 결과:

- **3개는 코드 전체를 즉시 완화 목록에서 제거**해야 한다.
- **10개는 한 코드가 fatal과 craft를 함께 표현**하므로 wholesale hardening이 아니라 코드 분리가 필요하다.
- **2개는 현재 emitter가 없는 stale policy entry**라 호환성 확인 뒤 정리 대상이다.
- 나머지 **87개는 그 코드가 발화했다는 사실만으로 V1~V5 실패를 확정하지 않으므로 craft/notice 유지**가 맞다.

핵심 문제는 “경고가 많다”가 아니다. **동일 코드가 서로 다른 결함 심각도를 합쳐 놓은 code-level conflation**이다. 이를 통째로 차단하면 정상 문항까지 재생성해 비용이 늘고, 그대로 완화하면 실제 F가 출하된다.

이 감사는 모델/API·브라우저·DB를 한 번도 호출하지 않은 zero-call 정적·결정론 감사다.

## 정책 표면과 25유형 coverage

현행 효과는 세 층이다.

1. `SHIP_FIRST_WARNING_CODES`: validator가 만든 `error`를 반환 직전 `warning`으로 바꾼다. 대체로 strict 재시도 자체를 건너뛰므로 가장 위험한 완화다. KILLER `IMPLIED_MEANING` 7개는 strict에서만 다시 error로 유지되지만 relaxed에서는 비차단이다.
2. `RELAXED_BLOCKING_QUALITY_CODES`: relaxed에서도 남겨야 할 error 목록이다. SHIP_FIRST 코드는 이 목록에서 사후 삭제된다.
3. `SALVAGE_RELAXABLE_CODES`: strict/relaxed에서 막혔어도 최종 구제 후보의 blocking code가 전부 이 집합이면 notice로 출하할 수 있다.

수량은 `SHIP_FIRST=31`, `SALVAGE=99`, 합집합 `102`, 양쪽 중복 `28`, SALVAGE이지만 이미 relaxed 비차단이라 행동상 중복인 코드 `3`이다.

| active type | 완화 코드 수 | 결과 |
|---|---:|---|
| `BLANK_INFERENCE` | 17 | 노출 있음; fatal escape 확인 |
| `GRAMMAR_ERROR` | 58 | 노출 있음; explanation/metadata conflation 확인 |
| `GRAMMAR_CORRECTION` | 3 | 세 코드는 craft 유지 가능 |
| `SENTENCE_ORDER` | 6 | 노출 있음; empty/label contamination escape 확인 |
| `TOPIC` | 1 | explicit language contract escape 확인 |
| `MAIN_IDEA` | 1 | 영어 option 설정일 때 같은 escape |
| `IMPLIED_MEANING` | 9 | explicit language contract escape 확인 |
| `SUMMARY_COMPLETE_MC` | 3 | direction/완성문 conflation 확인 |
| `IRRELEVANT` | 5 | 다섯 코드는 easy/giveaway craft; 별도 문법 hard gate 존재 |
| `GRAMMAR_CHOICE_COMBO`, `VOCAB_CHOICE`, `SENTENCE_INSERT`, `TITLE`, `REFERENCE`, `CONTENT_MATCH`, `CONDITIONAL_WRITING`, `SENTENCE_TRANSFORM`, `FILL_BLANK_KEY`, `SUMMARY_COMPLETE`, `SUMMARY_WRITING`, `WORD_ORDER`, `TOPIC_SENTENCE_WRITING`, `CONTEXT_MEANING`, `SYNONYM`, `ANTONYM` | 0 | 이 세 정책으로 인한 downgrade exposure 없음 |

즉 25개를 모두 확인했으며, 9개 유형은 정책 표면이 있고 16개는 합집합 코드가 한 개도 없다. “노출 없음”은 해당 유형의 전체 validator가 완전하다는 뜻이 아니라, **이번 세 정책이 그 유형의 error를 낮추지는 않는다**는 뜻이다.

## P0 — 코드 전체의 완화 제거

### 1. `blank-paraphrase-subject-slot-mismatch` — V3

- emitter: `validators/blank/paraphrase.ts`
- 현행: SHIP_FIRST + SALVAGE, `RELAXED_BLOCKING`에서는 삭제됨. strict 전에 warning이 된다.
- trigger는 task/challenge류 원문 명사구를 `_____ is not whether ... but how ...` 주어 슬롯에서 동명사 과정구로 바꾼 경우다.
- 결정론 재현 완성문: **“Balancing speed with fairness is not whether institutions should respond, but how …”**. 문법 외형만 문장일 뿐 주어와 whether/how 보어의 의미 관계가 깨진다. 정답을 넣은 완성문 자연성을 요구하는 V3 실패다.

권고: SHIP_FIRST와 SALVAGE 양쪽에서 제거하고 현재 relaxed literal을 실효화한다. false-block 위험은 낮다. 현재 trigger 자체가 정확히 정답 완성문의 결함을 본다.

### 2. `topic-option-language` — V5

- emitter: `validators/topic.ts`
- 현행: `optionLanguage=en`인데 한글이 있거나 Latin 문자가 없는 선지가 있을 때 **error**를 내지만 SALVAGE가 되살릴 수 있다.
- 이것은 취향이 아니라 교사가 선택한 학생 표면 언어 계약 위반이다.

권고: SALVAGE에서 제거한다. 한국어 설정 쪽은 별도 warning 코드(`topic-main-idea-option-language`)이므로 영어 설정 error를 harden해도 역방향 false block이 없다.

### 3. `implied-meaning-option-language` — V5

- emitter: `validators/implied.ts`
- 영어 설정에서 한글 선지를 발견하면 error, 한국어 설정에서 한글이 없으면 같은 코드명으로 warning을 낸다.
- SALVAGE 제거는 error 경로만 차단하고 이미 warning인 한국어 경로는 그대로 출하하므로 코드 분리 없이도 정책 수정이 안전하다.

권고: SALVAGE에서 제거한다. `implied-meaning-option-not-english`와 동일한 explicit language-contract 급으로 취급한다.

## P0/P1 — 반드시 split할 10개

### 4. `sentence-order-paragraph-too-short` + `sentence-order-paragraph-too-thin` — empty paragraph는 V1/V5

두 코드는 “정상 문장이지만 짧은 블록”과 **빈 문자열 블록**을 함께 잡는다. 빈 블록도 paragraphs 배열 길이는 3이라 `paragraph-count`를 통과한다. 더 심각하게 source reconstruction은 `!text`에서 조용히 `return`하므로 `paragraph-not-source-backed`도 발화하지 않는다. 최종 blocking code 두 개가 모두 SALVAGE라 빈 (A)/(B)/(C) 블록이 notice로 출하될 수 있다.

권고:

- `text === ""`를 먼저 잡는 `sentence-order-empty-paragraph`를 새로 만들고 relaxed/salvage 불변식으로 둔다.
- 매우 짧고 finite predicate가 없는 fragment는 별도 고정밀 `sentence-order-paragraph-fragment` 후보로 검증한다.
- 1문장·20단어처럼 짧지만 완전한 블록에는 기존 두 craft 코드와 notice를 유지한다.

### 5. `sentence-order-given-too-long` — label contamination은 V1/V5

이 한 코드는 (a) 2문장/상한 단어 수 초과와 (b) `givenSentence` 안에 `(A)/(B)/(C)`가 들어간 경우를 합친다. (a)는 균형 craft지만 (b)는 given/paragraph 경계를 깨뜨리고 라벨을 이중 노출한다. SHIP_FIRST가 둘을 모두 strict 전에 warning으로 바꾼다.

권고: label branch를 `sentence-order-given-contains-paragraph-label`로 분리해 blocking하고, 길이 branch만 기존 SHIP_FIRST에 남긴다.

### 6. `blank-paraphrase-answer-not-transformed` — 반복 source가 남으면 V5/C4 leak

PARAPHRASE 모드에서 정답이 `originalExpression`과 같으면 현재 코드는 error를 내지만 최종 SALVAGE가 가능하다. 동시에 단일 빈칸 residual-answer 검사는 코드상 `!isTransformedMode && !isAnswerParaphraseMode`에서만 실행되어 PARAPHRASE를 명시적으로 건너뛴다.

재현에서는 첫 occurrence만 빈칸 처리한 뒤 같은 `shared trust`가 `passageWithBlank` 뒤 문장에 그대로 남아 있고, 정답 선지도 `shared trust`다. 결과는 `blank-paraphrase-answer-not-transformed`만 발화하고 `blank-answer-residual-visible`은 발화하지 않는다. 학생 표면에 정답이 그대로 남는 leak이다.

권고: 기존 not-transformed 코드는 “유일 occurrence에서 변형 깊이가 0”인 craft 용도로 유지하되, PARAPHRASE에서도 **correct option exact text가 `passageWithBlank`에 남아 있으면** `blank-paraphrase-correct-residual-visible`로 blocking한다.

### 7. `summary-mc-direction-frame` — wrong/empty task는 V5, label 생략은 craft

현재 `directionNamesSummaryTask`는 `/summary/i.test(direction) || blankLabels.length > 0`이다. `blankLabels`는 기본값까지 있어 사실상 항상 참이므로, 코드가 요약문 과제인지 검증하지 않는다. 아래 두 문장이 동일 코드 하나를 낸다.

- 유효하지만 literal label만 생략: “다음 요약문의 두 빈칸에 들어갈 말로 가장 적절한 것은?”
- 완전히 다른 과제: “다음 글의 제목으로 가장 적절한 것은?”

빈 direction도 같은 코드 하나로 SALVAGE될 수 있다.

권고: `summary-mc-missing-direction`과 high-confidence competing-task `summary-mc-direction-task-mismatch`를 blocking으로 신설하고, 올바른 summary-completion cue가 있으나 `(A)/(B)`만 생략한 경우만 `direction-frame` warning으로 남긴다.

### 8. `blank-explanation-step-numbering` — 실제 V5와 false positive가 한 코드

원형숫자를 “① 먼저 … ② 이어서 …”처럼 설명 단계 번호로 쓰면 옵션 번호와 충돌해 V5를 깬다. 그러나 현 heuristic은 옵션 원문 head를 8자 인용하지 않는 원형숫자를 step으로 세므로, “①은 범위를 과장해 오답이다. ②는 인과를 뒤집어 오답이다.” 같은 정상적인 축약 선지 해설도 같은 error를 낸다.

권고: narrative discourse cue와 option-verdict cue를 분리한 `blank-explanation-narrative-circled-numbering`만 blocking한다. 단순히 현 코드를 SALVAGE에서 제거하면 정상 해설을 재생성해 비용을 낭비한다.

### 9. `grammar-keypoint-choice-mismatch` — wrong reference는 V4/V5, metadata drift는 아님

현 함수는 세 조건을 한 코드로 합친다.

- 존재하지 않는 밑줄 라벨 참조: 학생 해설 key가 실제 문항과 불일치하므로 V4/V5.
- 첫 keyPoint가 정답 라벨이 아님: 배열 순서 craft일 수 있다.
- keyPoint 문구가 `pointCode` 정규식과 불일치: keyPoint가 틀렸을 수도 있지만 **pointCode가 틀리고 학생 해설이 맞을 수도 있다.**

역사 예시 `experiments/grammar-quality-20260714/p1-premium/results.jsonl:10`은 `(D) Whether`에 pointCode `b`가 붙었지만 keyPoint는 정확히 “접속사 vs 전치사”라고 설명한다. 학생 표면이 맞고 내부 metadata가 틀린 사례다. 반면 존재하지 않는 `(F)`를 설명하는 keyPoint는 확정 V4/V5다.

권고: `grammar-keypoint-nonexistent-label`만 즉시 blocking한다. pointCode disagreement는 실제 span 기반 pointCode 검증 결과와 결합하거나 metadata repair 대상으로 둔다. 현 코드를 통째로 harden하지 않는다. 과거 49개 results 재생에서 이 코드는 109회 관측되어 false block 비용 위험도 가장 크다(`offline/salvage-policy-replay-v3.json`, 교차 commit 기술통계).

### 10. `grammar-nonstandard-terminology` — term error는 V4, register는 craft

한 regex 집합이 다음을 함께 잡는다.

- `전사구`: `전치사구`/`전치사적 분사`를 잘못 부른 실제 용어 오류. `artifacts/ai-audits/grammar-quality-loop-1783006984037.jsonl:2`의 독립 judge도 이를 shaky/non-standard terminology로 지적했다.
- `통사적으로`, `계사`, `보문 명사`: 문맥에 따라 정확한 언어학 용어지만 학교 해설 register로는 과할 수 있다.

현 v0.2 rubric의 V4는 용어 오류를 금지하므로 첫 부류는 blocking이어야 한다. 두 번째 부류까지 harden하면 정확한 해설을 불필요하게 재생성한다.

권고: `grammar-terminology-error`와 `grammar-terminology-register`로 사전을 나눈다.

### 11. `summary-mc-awkward-collocation` — V3 검출과 문법적 false positive가 한 regex

정답을 넣은 완성 summary가 `equity to learning`이면 V3 실패다. 현 코드는 SHIP_FIRST라 이 결과도 strict 전에 warning이 된다. 그러나 첫 regex는 문법적인 **“a question of access to learning”**도 매치한다. 따라서 코드를 통째로 SHIP_FIRST에서 빼면 false block이 생긴다.

권고: head별 고정밀 패턴(`equity/equality/opportunity/responsibility + to + V-ing` 등)을 `summary-mc-correct-completion-ungrammatical`로 분리해 blocking하고, `question/matter/issue/problem of … to V-ing`처럼 NP 내부 `access to learning`을 오인할 수 있는 패턴은 warning 또는 parser/judge 확인으로 남긴다.

### 12. `blank-paraphrase-correct-too-thin` — 의미 손실은 V2, token count는 craft

현 trigger는 source content token이 4개 이상인데 correct option content token이 3개 미만인지 본다. 같은 코드는 다음 둘을 구분하지 못한다.

- `resist reducing complex evidence to simple rules` → `avoid oversimplification`: 압축됐지만 의미를 보존할 수 있다.
- 같은 source → `sound judgment`: actor/행위/부정 관계를 잃어 정답이 더는 source paraphrase가 아닐 수 있다.

후자는 정답 선지가 source 의미를 더는 보존하지 않아 V2지만 전자는 KILLER 공예/난도 문제다.

권고: count 기반 코드는 SHIP_FIRST craft로 유지하고, actor·polarity·condition·cause·scope 손실을 별도 `blank-paraphrase-semantic-role-loss`로 검증한다. 이 축은 단순 regex만으로 충분하지 않으면 blind semantic audit 대상으로 남겨야 한다.

## stale policy entry 2개

- `blank-paraphrase-killer-giveaway-distractors`: 현재 validator는 `blank-killer-giveaway-distractors`를 emit한다. 옛 문자열은 SHIP_FIRST/SALVAGE에만 남아 있어 행동 효과가 없다.
- `grammar-obvious-living-lived`: 현재 validator emitter는 없고 constants와 repair-feedback switch에만 남아 있다.

둘 다 fatal escape는 아니지만 정책 목록이 실제 validator 표면을 정확히 나타낸다는 가정을 깨뜨린다. 역사 데이터 compatibility가 필요 없다면 제거하고, 필요하면 legacy-only 주석과 만료 조건을 둔다.

## KEEP_CRAFT 87개를 유지한 이유

전체 목록과 emitter는 `INVENTORY.json`에 있다. 주요 계열 판단은 다음과 같다.

- `grammar-obvious-*`, `grammar-shallow-*`, `grammar-killer-thin-*`, decoy/marker density: 의도적으로 틀리게 제시한 정답 site가 너무 뻔하거나 decoy가 약하다는 신호다. source→displayed 최소대립, 정답 수, 논쟁적 변형은 별도 blocking gate가 지킨다는 전제에서 C1/C3/C5이지 자동 V 실패는 아니다.
- grammar underline 길이·구두점, explanation 길이·표면 언급 순서·agreement 깊이·vague tag: 가독성/C6 문제다. 정확성 위반을 그 코드 하나가 증명하지 않는다. 실제로 `x/w3-pro-fewshot-hardgate/results.jsonl:13`의 `grammar-agreement-explanation-too-thin` 문항은 해설이 유도부사 there와 실제 복수 주어 `the people`을 정확히 설명했다. lexicon 기반 false positive라 wholesale hardening하면 안 된다.
- blank target 크기·폭·list-like, option 길이 불균형, 너무 쉬운 KILLER, source-copy wrong option: seam 문법·정답 누출·polarity loss와 분리된 난도/함정 craft다.
- implied target 크기/중심성/추론 metadata: 그 코드만으로 실제 정답 유일성이나 해설 오류를 확정할 수 없다. direct-answer leak·source mismatch는 별도 blocking이다.
- irrelevant topic drift/노골적 cue: 정답을 너무 쉽게 만들지만 위치/key desync나 비문은 별도 blocking이다.
- sentence-order balance/unscrambled answer: shortcut과 변별력 문제다. 단 empty/label contamination만 위와 같이 분리해야 한다.
- summary half-correct trap 부재: C2/C3 결함이지 정답 pair 무결성 실패는 아니다.

## 비용을 고려한 적용 순서

1. **무비용 정책 수정:** `blank-paraphrase-subject-slot-mismatch`, `topic-option-language`, `implied-meaning-option-language`의 완화 제거.
2. **고정밀 deterministic split:** empty paragraph, given label contamination, residual answer leak, missing/competing summary direction, nonexistent keyPoint label. 이들은 추가 모델 호출 없이 판정 가능하다.
3. **부분 수리 우선:** option language, keyPoint label, terminology, direction은 가능하면 해당 필드만 repair하고 전체 재생성하지 않는다.
4. **semantic split은 judge/holdout으로 검증:** blank role loss와 summary collocation은 false-block 대조군을 포함해 precision을 먼저 재고 harden한다.

코드 전체를 일괄 harden하거나 평균 재생성을 늘리는 안은 권고하지 않는다. 특히 `grammar-keypoint-choice-mismatch`처럼 역사 발화가 많은 conflated code를 통째로 막으면 원가가 크게 뛸 수 있다.

## 재현·무결성

- 실행: `npx tsx experiments/question-quality-20260715/reviews/policy-severity-audit/policy-severity-audit.mts --write`
- lint: `npx eslint experiments/question-quality-20260715/reviews/policy-severity-audit/policy-severity-audit.mts`
- 결과: 102/102 명시 분류, 25/25 유형 coverage, assertions PASS, ESLint PASS
- `INVENTORY.json` SHA-256 / inventory hash: `89baf2d3ea4fd6804d9d2e822fb24e03987df467f2e4584a6e2f3a08940e8b8a`
- 감사 대상 policy+validator source hash: `2809867fc9ca1aafe412ac452146a91e785bfd4a3fb8c9f6ccd8dc73a6060c29`
- 기준 Git HEAD: `467c6d107137a91088d3eba1620ba4036a63d709`

`INVENTORY.json`은 각 코드의 SHIP_FIRST/RELAXED/SALVAGE membership, 실효 동작, type scope, emitter 파일, 판정과 권고를 기계 판독 가능하게 담는다. source hash는 dirty worktree의 실제 감사 대상 텍스트를 포함하므로 HEAD만으로 현재 상태를 오인하지 않는다.

## 한계

- 역사 results는 여러 commit에서 생성되어 발화 빈도·사례 증거로만 썼고 인과 효과로 해석하지 않았다.
- 이 감사는 severity policy의 **결정론적 escape**를 찾는 범위다. 의미상 복수정답·오답 매력도·실제 `beautiful` 비율은 예정된 blind 생성 실험을 대체하지 않는다.
- regex counterexample은 wholesale hardening이 안전하지 않음을 증명하지만, 새 split regex의 최종 precision은 clean/defect holdout에서 별도로 측정해야 한다.
