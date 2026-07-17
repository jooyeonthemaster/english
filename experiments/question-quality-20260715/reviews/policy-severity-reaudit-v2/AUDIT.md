# Fresh policy/severity re-audit v2 — BLOCK

## 결론

현재 소스 스냅샷의 최종 판정은 **BLOCK**이다.

- 이전 감사의 즉시 완화 제거·분리 요구 13건 중 **12건은 실제 emitter, 최종 severity, relaxed/salvage 정책까지 재검증되어 해소**됐다.
- 남은 1건인 `blank-paraphrase-correct-too-thin`의 의미 역할 보존 분리는 해소되지 않았다.
- BLANK_INFERENCE PARAPHRASE의 actor, polarity, condition, cause, scope를 각각 바꾼 **동일 단어 수 정상/결함 쌍 5개 중 의미 결함으로 차단된 것은 0개**다. 결함 정답 5개는 다른 오류조차 하나도 발화하지 않았다.
- 따라서 “정답 문구가 충분히 길다”는 사실과 “원 명제의 의미 역할을 보존한다”는 사실을 현행 정책이 구분하지 못한다. 단어 수는 의미 보존의 증명이 될 수 없다.
- 모델/API 후보 생성 0, 네트워크 0, DB 0, secrets read 0, 프로덕션/테스트 수정 0이다.

## 고정된 범위와 스냅샷

| 항목 | 결과 |
|---|---:|
| 활성 영어 유형 | 25 |
| 재구성한 영어 quality emitter code | 466 |
| raw error 가능 code | 417 |
| raw warning 가능 code | 66 |
| raw error/warning 양쪽 가능 code | 17 |
| SHIP_FIRST | 30 |
| RELAXED_BLOCKING | 288 |
| SALVAGE_RELAXABLE | 96 |
| 세 정책 합집합 | 321 |
| 영어 quality tree에 emitter가 없는 정책 code | 19 = KO 17 + stale 2 |
| 이전 안전성 지적 해소 | 12/13 |
| 의미 역할 결함 차단 | 0/5 |
| API 후보 | 0 |

스냅샷은 Git HEAD `467c6d107137a91088d3eba1620ba4036a63d709`의 dirty worktree이며, 감사 대상 소스 결합 SHA-256은 매니페스트에 고정돼 있다. dirty worktree의 다른 변경은 소유권을 건드리지 않았고 이 감사 디렉터리만 새로 만들었다.

## emitter/severity 전수 재구성 방법

`src/lib/question-quality/**/*.ts`를 TypeScript AST로 읽어 다음 두 경로를 합쳤다.

1. `add(rawSeverity, code, message)`의 두 번째 인수 안에 있는 모든 literal code와 첫 번째 인수의 `error`/`warning`을 수집했다. 삼항식으로 code를 선택하는 emitter도 AST 하위 literal을 모두 포함한다.
2. `finding.code`, `slotIssue.code`, `qIssue.code`처럼 helper 반환값을 전달하는 13개 영어 dynamic add site는 helper의 `{ code: "..." }` 반환 site와 연결했다. 이 호출들은 모두 raw `error`를 넘긴다.
3. `koIssue.code` 한 곳은 활성 영어 유형 범위 밖의 KO dispatcher로 명시 제외했다.
4. raw severity와 `SHIP_FIRST_WARNING_CODES` 적용 후 severity를 별도 필드로 보존했다. KILLER IMPLIED_MEANING 예외도 별도 표시했다.
5. 각 code에 `RELAXED_BLOCKING_QUALITY_CODES`, `SALVAGE_RELAXABLE_CODES` 가입 여부와 emission file/line을 붙였다.

전수 결과는 [emitted-code-inventory.json](./emitted-code-inventory.json)에 있다. 유형 scope는 이름이 있는 validator family에는 정확히 매핑했고, type dispatch 바깥의 공통 signature/options/KILLER gate는 안전하게 all-active 범위로 표기했다. 따라서 이는 **emit-capable source inventory**이며 466개 각각의 런타임 도달 가능성을 증명하는 동적 커버리지 보고서는 아니다.

## 이전 감사와의 대조

| 이전 지적 | 새 증거 | 판정 |
|---|---|---|
| `blank-paraphrase-subject-slot-mismatch` 완화 제거 | final `error`; relaxed blocking; salvage/SHIP 미가입 | PASS |
| `topic-option-language` 완화 제거 | 영어 계약 위반 final `error`; salvage 미가입 | PASS |
| `implied-meaning-option-language` 완화 제거 | 영어 계약 위반은 final `error`; 한국어 설정 control은 warning | PASS |
| `blank-explanation-step-numbering` 분리 | 서술 단계는 새 hard code, 정상 축약 선지 판정은 새 code 미발화 | PASS |
| `blank-paraphrase-answer-not-transformed` 분리 | 변환 정답의 잔존 노출은 새 hard residual code, 비노출 control 미발화 | PASS |
| `blank-paraphrase-correct-too-thin` 분리 | 의미 역할 hard code 부재; 5개 결함 모두 통과 | **BLOCK** |
| `grammar-keypoint-choice-mismatch` 분리 | ghost label은 새 hard code, metadata drift는 기존 salvage craft | PASS |
| `grammar-nonstandard-terminology` 분리 | `전사구`는 hard error, `통사적으로`는 salvage register | PASS |
| `sentence-order-given-too-long` 분리 | leaked `(A)`는 새 hard label-contamination code | PASS |
| `sentence-order-paragraph-too-short` 분리 | 빈/format-only 문단은 새 hard empty code, 짧은 완전문 control은 old craft만 | PASS |
| `sentence-order-paragraph-too-thin` 분리 | 위 empty guard 공유, nonempty thin control은 old craft만 | PASS |
| `summary-mc-awkward-collocation` 분리 | `equity to learning`은 새 hard code; 정상 nested NP는 hard code 미발화 | PASS |
| `summary-mc-direction-frame` 분리 | missing/competing task는 새 hard code; label 없는 정상 summary task는 warning | PASS |

세부 issue 객체와 정책 증거는 [results.json](./results.json)의 `priorAuditComparison`에 고정했다.

## BLANK_INFERENCE 의미 역할 적대 통제

모든 쌍은 같은 passage carrier, 같은 오답 구조, 같은 난이도, 같은 정답 위치를 쓰고 정상 정답과 결함 정답의 lexical token 수를 동일하게 맞췄다. “동일 token 수”는 길이 교란을 통제할 뿐, 의미 정답을 자동 판정하지 않는다. accept/block label은 원 명제 보존 여부에 대한 명시적 reference judgment다.

| 역할 | 정상/결함 token 수 | 결함 변이 | 결함 semantic error | 결함 전체 issue |
|---|---:|---|---:|---:|
| actor | 6 / 6 | local communities → central regulators | 0 | 0 |
| polarity | 5 / 5 | judgment necessary → unnecessary | 0 | 0 |
| condition | 9 / 9 | only when shared information → even when information is lacking | 0 | 0 |
| cause | 7 / 7 | transparency → trust를 trust → transparency로 역전 | 0 | 0 |
| scope | 9 / 9 | few/narrow → many/broad | 0 | 0 |

현행 이름 기반 후보는 `blank-killer-polarity-shortcut`과 `blank-paraphrase-polarity-loss`뿐이다. 전자는 오답의 극성 분포를 보는 shortcut gate이지 정답 명제 보존 gate가 아니다. 후자는 `resist the temptation to reduce`라는 좁은 문형의 양성 통제는 정확히 잡지만, 일반적인 “필요하다 → 불필요하다” polarity reversal control은 잡지 못했다.

또한 KILLER token proxy는 다음 두 정답 모두에 똑같이 `blank-paraphrase-correct-too-thin`을 발화했다.

- 의미를 압축한 `avoid oversimplification`
- 의미를 일반화해 잃은 `sound judgment`

이 code는 SHIP_FIRST로 warning 강등되고 relaxed blocking에서 제거되며 salvage에도 들어 있다. 더 근본적으로 두 입력을 구분하지 못하므로 이 code를 단순 승격하는 것도 해결책이 아니다.

## 남은 정책 부채

이전 감사의 stale 2건도 그대로다.

- `blank-paraphrase-killer-giveaway-distractors`: 정책에는 남아 있지만 활성 emitter는 `blank-killer-giveaway-distractors`다.
- `grammar-obvious-living-lived`: 정책에는 남아 있지만 영어 quality emitter가 없다.

이는 이번 BLOCK의 주원인은 아니지만 정책 집합과 실제 emitter의 불일치를 계속 만든다.

## 해제 조건

BLOCK을 해제하려면 token thinness와 독립된 정답 명제 보존 판정이 필요하다. 최소 actor, polarity, condition, cause, scope를 별도 차원으로 다루고, 이 디렉터리의 정상/결함 쌍에서 정상은 통과하고 결함은 hard-through-salvage로 막혀야 한다. 좁은 정규식의 개수나 정답 token 수만 늘리는 방식은 이 증거를 충족하지 않는다.

## 재현 및 무결성 검증

```powershell
npx tsx experiments/question-quality-20260715/reviews/policy-severity-reaudit-v2/build-reaudit.mts
npx tsx experiments/question-quality-20260715/reviews/policy-severity-reaudit-v2/verify-reaudit.mts
```

추가 회귀 확인도 통과했다.

- `npx tsc --noEmit --pretty false`: PASS
- 관련 6개 unit file: **67/67 PASS** (`blank-paraphrase-contract`, `blank-explanation-step-numbering`, `grammar-keypoint-core10`, `sentence-order-quality`, `summary-mc-direction-split`, `summary-mc-collocation-severity-split`)

[manifest.json](./manifest.json)은 감사 입력·스크립트·결과·보고서와 감사 대상 소스 파일별 SHA-256을 고정한다. verifier는 HEAD, 소스 결합 hash, 모든 artifact hash, 466-code inventory, 12/13 remediation, 0/5 semantic blocking, stale 2건, API 0을 다시 확인한다.

## 산출물

- [cases.json](./cases.json): 균형 의미 역할 쌍과 prior finding 목록
- [build-reaudit.mts](./build-reaudit.mts): AST inventory + 행동 재현 + 매니페스트 생성
- [emitted-code-inventory.json](./emitted-code-inventory.json): 466개 code/severity/policy/site/type scope
- [results.json](./results.json): 행동 통제와 prior audit 비교
- [verify-reaudit.mts](./verify-reaudit.mts): snapshot-bound 독립 검증기
- [manifest.json](./manifest.json): 소스·artifact 해시
