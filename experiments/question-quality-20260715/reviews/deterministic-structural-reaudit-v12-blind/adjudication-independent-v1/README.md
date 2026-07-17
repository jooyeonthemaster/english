# v12 독립 블록리스트 판정

## 결론

v12가 보고한 production false negative 51행·17코드를 현재 프로덕션 계약, 스키마, 후처리, relaxed 차단 정책에 맞춰 다시 판정했다.

- **A — 반드시 차단:** 15행, 5코드
- **B — 의도적 craft warning:** 0행, 0코드
- **C — 상류에서 이미 거부·수리되거나 다른 fatal gate로 중복 차단:** 36행, 12코드
- **D — 판단 보류:** 0행, 0코드

따라서 최소 remediation은 아래 5개 코드만 `RELAXED_BLOCKING_QUALITY_CODES`에 추가하는 것이다. 이 아티팩트는 판정만 수행하며 프로덕션 소스는 수정하지 않았다.

1. `generic-answer-count`
2. `generic-multi-answer-direction`
3. `sentence-insert-missing-given`
4. `sentence-order-dependent-fragment`
5. `sentence-order-paragraph-body-label`

이 5개는 별도 schema-conforming certificate에서 스키마와 후처리를 통과하고, 해당 issue를 실제 발생시키며, 현재 다른 relaxed blocker에 걸리지 않는 것을 재현했다. `multi-blank-duplicate-option`은 반대로 후처리 뒤 `duplicate-option-text`가 함께 발생해 이미 차단되는 중복 사례임을 재현했다.

## 17코드 판정

| 판정 | 코드 | 이유 |
|---|---|---|
| A | `generic-answer-count` | 요청한 정답 수와 실제 채점 라벨 수가 달라질 수 있음 |
| A | `generic-multi-answer-direction` | 복수 정답 키와 단일 선택 지시문이 충돌할 수 있음 |
| A | `sentence-order-paragraph-body-label` | 문단 본문 안의 순서 라벨이 학생 자료를 오염·누설함 |
| A | `sentence-order-dependent-fragment` | 독립 문단 블록이 종속절 파편으로 시작해 문항이 구조적으로 깨짐 |
| A | `sentence-insert-missing-given` | 삽입할 문장이 비어 있는데 후처리는 성공할 수 있어 문항이 풀 수 없게 됨 |
| C | `type-foreign-field` | Zod object 파싱에서 알 수 없는 타입 전용 필드가 제거됨 |
| C | `scrambled-near-answer-order` | 최종화 단계가 WORD_ORDER 칩을 결정론적으로 재배열함 |
| C | `summary-complete-missing-blank-answer` | SUMMARY_COMPLETE 스키마가 blank answer를 요구함 |
| C | `multi-blank-count` | 동적 스키마와 후처리가 개수를 강제함 |
| C | `multi-blank-label` | 스키마가 라벨을 제한하고 후처리가 원문 순서로 정규화함 |
| C | `multi-blank-missing-expression` | 후처리가 빈 originalExpression을 거부함 |
| C | `multi-blank-expression-not-in-passage` | 후처리가 원문에서 span을 찾지 못하면 거부함 |
| C | `multi-blank-missing-passage` | 후처리가 원문으로 passageWithBlank를 생성함 |
| C | `multi-blank-marker-count` | 후처리가 span마다 정확히 하나의 표준 marker를 생성함 |
| C | `multi-blank-option-values` | 동적 스키마와 후처리가 값 개수·비어 있지 않음을 강제함 |
| C | `multi-blank-duplicate-option` | 후처리된 동일 조합은 동일 option text가 되어 기존 `duplicate-option-text`로 차단됨 |
| C | `multi-blank-correct-option-mismatch` | SOURCE_EXACT은 후처리가 자동 수정하고, 현행 INTERMEDIATE는 PARAPHRASE 프로필임 |

`blank-target-list-like`는 17개 policy gap에 포함되지 않은 기존 B/craft warning이며 이번 최소 차단 목록에 넣지 않았다.

## controls 192개 전수 재검증

v12의 `192/192 globally valid` 주장은 독립 재검증에서 성립하지 않았다.

| 독립 판정 | 수 | 의미 |
|---|---:|---|
| `CONFIRMED_GLOBALLY_VALID` | 117 | 원문·정답·구조·해설에서 추가 결함을 발견하지 않음 |
| `INVALID_SEMANTIC_KEY` | 6 | 1번만 맞다는 해설 및 지문과 달리 2번까지 정답 처리됨 |
| `INVALID_EXPLANATION_GRAMMAR` | 12 | `The plural antecedent reports requires ...`라는 결함 있는 설명을 반복 사용함 |
| `SOURCE_UNVERIFIABLE` | 15 | SUMMARY_COMPLETE control에 원문 passage가 없어 요약·정답의 원문 근거를 검증할 수 없음 |
| `VALID_UNIT_BUT_PRODUCTION_PROFILE_MISMATCH` | 42 | SOURCE_EXACT 단위 control로는 정합하지만, INTERMEDIATE를 PARAPHRASE로 강제하는 현행 최종화 경로와 다름 |

마지막 42개를 “문항 자체가 틀렸다”고 해석하면 안 된다. 단위 검사 fixture로는 유효하지만 “현행 프로덕션과 완전히 같은 control”이라는 주장에는 사용할 수 없다는 판정이다.

## 특별 계약 재검증

- WORD_ORDER control 15개 모두 chip multiset으로 model answer를 정확히 복원할 수 있다.
- 15개 모두 정답 복원 순서의 inversion이 4개이고 정방향 인접 chip이 0개여서 이미 풀린 배열이 아니다.
- 15개 모두 원문과 겹치는 연속 run의 최댓값이 0단어다. 따라서 6-token source copy는 0건이다.
- SENTENCE_ORDER control 42개, 문단 블록 126개를 모두 검사했다.
- 모든 블록은 2문장 이상이며 26~27단어로 24단어 하한을 충족한다.
- 모든 블록이 원문에 존재하고, 정답 순서로 `givenSentence + paragraphs`를 이어 붙이면 원문과 정확히 일치한다.
- 정답이 화면 배열 `(A)-(B)-(C)`인 control은 0건이다.

## 비용 해석

제안한 5개 추가는 이미 계산되는 validator issue의 relaxed 차단 여부만 바꾸므로 모델 호출이나 토큰 비용을 직접 추가하지 않는다. 다만 실제 발생 시 재생성률을 높일 수 있으므로, 배포 전 최근 production 표본에서 5코드의 발생률을 측정해 재시도 비용 상한을 별도로 계산해야 한다. 이번 정적 판정은 그 발생률을 추정하지 않는다.

## 재현

저장소 루트에서 실행한다.

```powershell
node experiments/question-quality-20260715/reviews/deterministic-structural-reaudit-v12-blind/adjudication-independent-v1/build-adjudication.mjs --write
node experiments/question-quality-20260715/reviews/deterministic-structural-reaudit-v12-blind/adjudication-independent-v1/finalize-manifest.mjs
node experiments/question-quality-20260715/reviews/deterministic-structural-reaudit-v12-blind/adjudication-independent-v1/verify.mjs
npx tsx experiments/question-quality-20260715/reviews/deterministic-structural-reaudit-v12-blind/adjudication-independent-v1/production-certificates.mts
npx tsc -p experiments/question-quality-20260715/reviews/deterministic-structural-reaudit-v12-blind/adjudication-independent-v1/tsconfig.json --noEmit --pretty false
```

`adjudication.json`에는 51개 FN 행, 192개 control 행, WORD_ORDER/SENTENCE_ORDER 개별 측정값, 프로덕션 certificate 결과, 검토한 프로덕션 파일의 SHA-256 closure가 들어 있다. `verify.mjs`는 sealed parent input, 현재 소스 closure, 전체 행 수·분류, 특수 계약, certificate 재실행, artifact manifest와 secret-like 문자열 부재를 다시 확인한다.

API, 네트워크, DB는 사용하지 않았고 프로덕션 소스는 수정하지 않았다.
