# v12 최소 수정 독립 재감사

## 결론

**PASS** — 봉인된 v12 원본과 `adjudication-independent-v1`을 입력으로 삼아 최소 수정 이후의 프로덕션 경로를 독립 재실행했다.

- A: 15행·5코드 모두 `RELAXED_BLOCKING_QUALITY_CODES`에 존재한다.
- A: 5코드 모두 `SALVAGE_RELAXABLE_CODES`와 `SHIP_FIRST_WARNING_CODES`에는 없다.
- A: 코드별 프로덕션 스키마·후처리·validator 격리 인증에서 대상 코드가 실제 발생하고, 대상 코드 자체만 relaxed blocker가 되었다.
- C: 36행·12코드 모두 스키마 제거/거부, 결정론 후처리, 또는 기존 `duplicate-option-text` blocker로 흡수되는 인증을 다시 통과했다.
- B와 D: 각각 0행·0코드다.
- 수정 범위: v12 주석 앵커 안에는 판정된 A 5코드만 정확히 들어 있고, 판정된 C 12코드는 relaxed blocklist에 추가되지 않았다.

따라서 이번 판정 대상 17코드 안에서 과소 수정과 과잉 수정은 모두 발견되지 않았다. 저장소의 다른 동시 작업은 별도 범위이며, 이 감사는 v12 앵커와 판정된 17코드에 대해 정확성을 증명한다.

## 재검증 범위

### A — 스키마 적합 fatal 인증

각 코드에 대해 실제 프로덕션 응답 스키마를 통과시키고 `postProcessQuestion`을 실행한 뒤 최종 품질 validator를 호출했다.

1. `generic-answer-count`
2. `generic-multi-answer-direction`
3. `sentence-insert-missing-given`
4. `sentence-order-dependent-fragment`
5. `sentence-order-paragraph-body-label`

각 코드의 봉인된 세 lexical variant를 동일 코드 인증에 연결해 A 15행 전부를 확인했다. 다섯 인증 모두 `blockingCodes=[targetCode]`이고 다른 relaxed blocker는 0개다.

### C — 상류·중복 인증

아래 12코드에 대해 프로덕션 스키마 제거/거부, 후처리 거부/정규화, 또는 기존 fatal gate를 재실행했다.

- `type-foreign-field`
- `scrambled-near-answer-order`
- `summary-complete-missing-blank-answer`
- `multi-blank-count`
- `multi-blank-label`
- `multi-blank-missing-expression`
- `multi-blank-expression-not-in-passage`
- `multi-blank-missing-passage`
- `multi-blank-marker-count`
- `multi-blank-option-values`
- `multi-blank-duplicate-option`
- `multi-blank-correct-option-mismatch`

`multi-blank-duplicate-option` 인증은 불필요한 다른 blocker가 섞이지 않도록 격리했으며 최종 차단 코드는 정확히 `duplicate-option-text` 하나다. 각 코드의 봉인된 세 variant를 인증에 연결해 C 36행 전부를 확인했다.

## 봉인과 재현

`audit.json`은 입력 파일 SHA-256, 관련 프로덕션 소스 17개의 SHA-256/바이트 수, A/C 행별 결과와 코드별 인증 증거를 저장한다. `manifest.json`은 감사 묶음 6개 파일을 해시로 봉인한다. `verify.mjs`는 입력·소스·manifest를 확인하고 인증 전체를 다시 실행해 `audit.json`과 byte-for-byte 동일한지 검사한다.

저장소 루트에서 실행한다.

```powershell
npx tsx experiments/question-quality-20260715/reviews/deterministic-structural-v12-remediation-independent-v1/run-audit.mts --check
node experiments/question-quality-20260715/reviews/deterministic-structural-v12-remediation-independent-v1/verify.mjs
npx tsc -p experiments/question-quality-20260715/reviews/deterministic-structural-v12-remediation-independent-v1/tsconfig.json --noEmit --pretty false
```

API 호출, 네트워크 접근, DB 접근은 모두 0이며 이 감사 과정에서 프로덕션 소스를 수정하지 않았다.
