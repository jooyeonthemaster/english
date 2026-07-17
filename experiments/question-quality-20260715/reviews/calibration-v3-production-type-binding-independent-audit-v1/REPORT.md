# Calibration v3 production type binding — independent hostile audit v1

상태: **FAIL_CLOSED**  
감사 대상: `design/reviewer-calibration-v3-production-type-binding-v1`  
별도 prior-v3 판정: **BLOCKED 유지** (`PRIOR_V3_LOGICAL_UNIVERSE_NOT_PRODUCTION_BOUND`)

## 결론

실제 production 경로와 25/2/23 universe, schema/filter/legacy drift, 23→8 family 전수 mapping, prior-v3의 9/14/14 mismatch는 독립 TypeScript AST와 집합 연산으로 재현됐다. 그러나 binding의 rotation 수식은 `mainOnlyEpochsToTouchAll23: 4`를 성립시키지 않는다. 작성자 verifier는 이 모순을 검출하는 대신 main-only 구간에서 명세와 다른 보폭 1 수식을 실행해 **154/154 PASS**를 만들었다.

따라서 두 판정은 다음처럼 분리한다.

| 판정 대상 | 판정 | 이유 |
|---|---|---|
| 현재 production binding artifact | **FAIL_CLOSED** | rotation 명세·coverage 주장·검증기가 서로 모순됨 |
| 기존 `reviewer-calibration-v3-replacement-v1` 단독 발행 | **BLOCKED** | production 23과 exact intersection 9, prior-only 14, production-only 14 |

## 발견 사항

### B-01 — main-only coverage 주장은 수학적으로 불가능하다 (BLOCKER)

binding은 family 크기 `n`에 대해 main index를 `(2 × (epoch - 1)) mod n`으로 고정한다. 보폭 2와 `n`의 최대공약수가 1이 아닌 family에서는 main orbit이 family 전체를 순회하지 않는다.

| Family | n | main이 실제로 방문하는 유형 | main이 영구히 방문하지 않는 유형 |
|---|---:|---|---|
| `NF-F4-GRAMMAR_FORM_DIAGNOSIS` | 2 | `GRAMMAR_CHOICE_COMBO` | `GRAMMAR_CORRECTION` |
| `NF-F5-LEXICAL_SEMANTICS` | 4 | `VOCAB_CHOICE`, `SYNONYM` | `CONTEXT_MEANING`, `ANTONYM` |
| `NF-F8-TARGETED_CONSTRUCTED_EXPRESSION` | 2 | `FILL_BLANK_KEY` | `TOPIC_SENTENCE_WRITING` |

나머지 크기 3 family는 세 epoch 안에 순회한다. 전체 main-only coverage는 4 epoch 후 19/23이며, 24 epoch까지 확장해도 주기가 반복되어 19/23이다. 따라서 `mainOnlyEpochsToTouchAll23: 4`, REPORT의 “main만 사용하면 네 epoch”, `issuance.thisBindingArtifactSemanticallyValid: true`는 동시에 참일 수 없다.

반면 main+holdout은 1 epoch에 16개, 2 epoch 누적 23개로 기록값이 맞다. 이 사실은 B-01을 상쇄하지 않는다. main 역할의 전 유형 회전을 주장하려면 수식을 바꾸거나 main-only claim을 제거해야 한다.

### M-01 — 작성자 verifier가 다른 수식을 대입해 거짓 PASS한다 (MAJOR)

작성자 verifier의 `selectedAt`은 명세대로 보폭 2를 사용한다. 하지만 `fourEpochMainCoverage`는 별도로 `family.rotationOrder[(epoch - 1) % family.rotationOrder.length]`를 사용한다. 즉 main-only 검증에서만 보폭 1로 바뀐다. 이 대입으로 23개가 나오며, 대상 verifier는 manifest 옵션을 포함해 154/154와 `PASS_WITH_DECLARED_PRIOR_DESIGN_BLOCKER`를 출력한다.

또한 verifier는 `mainIndexFormula`와 `holdoutIndexFormula` 필드를 한 번도 읽지 않는다. formula 문자열을 바꾸고 self-digest/manifest를 함께 갱신한 coherent mutation은 rotation 의미 검사를 통과할 수 있다.

### M-02 — Git dirty-state 결박 검사가 불완전하다 (MAJOR)

현재 binding에 기록된 source SHA-256, HEAD blob, dirty state, last-path commit 값 자체는 독립 재현과 모두 일치한다. 다만 작성자 verifier는 다음 metadata를 fail-closed로 검증하지 않는다.

- `cleanAtFreeze` 검사가 `if (source.headBlobSha1)` 안에 있어 untracked prior protocol은 검사하지 않는다.
- tracked source의 `headBlobSha1`을 `null`로 잘못 기록하면 HEAD blob과 dirty-state 검사가 함께 우회된다.
- `lastPathCommit`은 verifier에서 전혀 읽지 않는다.
- `git diff --quiet`는 완전한 porcelain dirty-state 판정이 아니다. 독립 감사는 `git status --porcelain=v1 --untracked-files=all -- <path>`를 사용했다.

현재 유일한 dirty tracked source는 `src/lib/question-ai-schemas-mc.ts`이며, worktree의 MC/essay registry key 집합은 HEAD와 동일했다. prior protocol은 untracked이고 binding의 `cleanAtFreeze: false`, `headBlobSha1: null`, `lastPathCommit: null`이 실제 상태와 일치했다.

### M-03 — production authority chain 검사가 AST가 아니라 substring이다 (MAJOR)

대상 REPORT는 authority chain을 AST로 검증한다고 주장하지만, verifier의 세 핵심 검사는 `pageTypesSource.text.includes(...)`와 `panelSource.text.includes(...)`다. 인메모리 hostile mutation에서 실제 alias를 빈 배열로 바꾸고 원문을 주석에 남기면 작성자 substring predicate는 true인 반면 독립 AST predicate는 이를 거부했다. 현재 frozen source는 전체 SHA 검사로 보호되지만, source hash를 정상 갱신하는 다음 binding 작성 시 이 의미 검사가 fail-open이다.

## 독립 재현된 production 사실

### 실제 UI 경로

TypeScript AST로 다음 연결을 확인했다.

1. `src/lib/question-type-ui.ts#QUESTION_TYPE_GROUPS`: 그룹 크기 14 + 8 + 3, 총 25개
2. `generate-page-types.ts#EXAM_TYPE_GROUPS`: initializer가 정확히 `QUESTION_TYPE_GROUPS` identifier
3. `GenerationConfigPanel`: `passageSubject === "KOREAN"`이 아닐 때 conditional의 false branch가 `EXAM_TYPE_GROUPS`
4. `panelTypeGroups.flatMap` → `allTypeItems` → `group.items.map` 렌더 경로

focus는 `BLANK_INFERENCE`, `GRAMMAR_ERROR` 두 개이며, 이를 빼면 UI 순서를 보존한 nonfocus 23개다.

### schema/filter/legacy drift

| 추출 대상 | 개수 | UI 25와의 차이 |
|---|---:|---|
| `QUESTION_SCHEMAS` | 26 | 추가 `TOPIC_MAIN_IDEA` |
| AI MC + essay + vocab registry union | 26 | 추가 `TOPIC_MAIN_IDEA` |
| `TYPE_SUBTYPE_MAP` | 26 | 추가 `TOPIC_MAIN_IDEA` |
| legacy `QUESTION_SUBTYPES` | 24 | `GRAMMAR_CHOICE_COMBO` 누락, extra 없음 |

`QUESTION_TYPE_META`와 `TYPE_TAGLINES`는 `TOPIC_MAIN_IDEA`를 각각 레거시 문제·레거시 통합형으로 명시한다. 따라서 이 ID를 current calibration 23에서 제외하고 자동 alias rewrite를 금지한 분류는 타당하다. `GRAMMAR_CHOICE_COMBO`는 UI와 schema에 있으므로 legacy 상수의 누락일 뿐 canonical 제외 사유가 아니다.

### 23 → 8 mapping

8 family의 합은 23, unique도 23이며 canonical nonfocus set과 정확히 같다. focus ID와 `TOPIC_MAIN_IDEA` 주입은 0개다. structural exhaustiveness/uniqueness에는 결함이 없었다. B-01은 family 구성 자체가 아니라 그 family 위에 정의한 보폭 2와 main-only claim의 충돌이다.

### prior-v3 blocker

기존 protocol의 `nonfocusConstruct.families[].logicalTypes`를 직접 평탄화했다. 23개 unique이며 production 23과 exact intersection 9, prior-only 14, production-only 14다. 대상 binding에 기록된 양쪽 14개 목록도 정확했다. 이 blocker는 binding의 새 rotation 결함과 별개로 유지된다.

## Source·manifest 및 hostile mutation

대상 `MANIFEST.sha256`의 `REPORT.md`, `binding.json`, `verify.mjs` 세 hash는 모두 현재 bytes와 일치했다. binding에 기록된 11개 source의 SHA-256·HEAD blob·dirty state·last-path commit도 독립 검증과 일치했다.

인메모리 hostile suite는 다음 15개 시나리오를 모두 거부했다: canonical deletion, schema enum add/remove, alias misclassification, family duplicate, family omission, focus injection, legacy injection, rotation formula drift, source byte mutation, manifest hash mutation, dirty-state mutation, HEAD-blob null bypass, last-path-commit mutation, commented-alias semantic break. 원본 source와 대상 artifact는 수정하지 않았다.

## 필수 수정

1. rotation을 하나로 확정한다. main도 모든 유형을 돌아야 한다면 `main=(epoch-1) mod n`, `holdout=epoch mod n`처럼 family 크기와 항상 순회 가능한 수식을 쓰면 최대 4 epoch에 main 23개가 성립한다. 현재 보폭 2를 유지한다면 main-only all-23은 `null/impossible`로 기록하고 네 영구 holdout-only 유형을 명시해야 한다.
2. verifier의 모든 coverage 계산이 binding의 동일한 formula evaluator를 사용하게 하고, formula field 자체와 실제 orbit을 검증한다.
3. source metadata는 HEAD blob 유무와 무관하게 dirty state를 검사하고, `lastPathCommit`도 검증한다.
4. alias·panel consumer·render flow는 raw substring이 아닌 AST node 관계로 검증한다.
5. 새 artifact version과 manifest를 발행한 뒤 hostile mutation suite를 재실행한다. prior protocol 단독 blocker는 별도 해소 조건을 그대로 유지한다.

## 활동 제한

Network/API/model/DB/secret/trusted-gold/ledger 접근은 모두 0이다. `private/gold.private.json`을 읽거나 수정하지 않았고, production source 및 감사 대상 원본도 수정하지 않았다.
