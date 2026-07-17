# Campaign v6 connectivity pilot v3

이 패키지는 `OCVP-B01`의 동일한 production exact-wire 입력을 Standard 1회, Premium 1회 순서로만 검증하기 위한 **2-call 연결성 파일럿**의 독립적인 v3 실행 경계다. 두 행으로 품질·안정성·모델 우열을 판단하지 않는다.

현재는 오프라인 author freeze다. `protocol-v3.json`의 `liveExecutionAuthorized`, `hostileAuditPassed`, `dispatchCommandPresent`가 모두 `false`이며 실제 dispatch 명령도 없다. 검증·빌드·테스트는 외부 네트워크, OpenRouter/provider/model, 운영 DB, 실제 credential, API 후보, 전역 ledger 예약을 전혀 사용하지 않는다.

## v2에서 제거한 경계 결함

- production runner는 테스트 permit, 테스트 환경변수, injected transport, delegate factory, offline 실행 함수를 export하지 않는다. 네트워크 경로는 module-private direct `fetch` 한 곳뿐이다.
- 오프라인 응답·상태 전이 테스트는 `test-support.ts`의 순수 함수에만 존재하며 production runner나 live child가 이를 import하지 않는다.
- `live-closure-v3.json`은 네 개 live entrypoint에서 TypeScript AST로 정적 import/export, literal dynamic import, literal require를 끝까지 추적한다. 실행 중 읽는 protocol/exact-wire/global ledger도 분류해 bytes와 SHA-256을 고정한다. 최소 파일 수 검사는 사용하지 않으며 exact sorted set/hash 동등성만 허용한다.

## 고정 실행 계약

- Standard `google/gemini-3.5-flash` → Premium `google/gemini-3.1-pro-preview`, 동시성 1.
- 배정당 후보·physical fetch·completion 각 1, 전체 각 2.
- retry, repair, fallback, replacement, top-up은 모두 0.
- 실패·timeout·unknown-after-send는 terminal이며 재실행하지 않는다.
- production compiler의 strict JSON schema wire, `google-vertex/global` only, fallback 금지, reasoning off를 그대로 봉인한다.
- 최종 성공은 단일 choice/단일 semantic question parser 증거, final usage/cost, requested/canonical served model, exact provider route가 모두 있어야 한다.
- 전역 `budget-ledger.json`에 2를 먼저 atomic reserve하고 private durable journal에도 2를 예약한다. author freeze에서는 ledger를 읽고 hash precondition만 봉인하며 값은 변경하지 않는다.

## 가격 스냅샷과 credential 경계

`capture-price-snapshot.mts`는 향후 별도 승인 뒤 사용할 public metadata 수집기다. `/api/v1/models`와 두 모델의 `/endpoints`를 읽어 canonical slug, 정확히 하나의 active `google-vertex/global`, 전체 active endpoint/override 가격, charge dimensions, supported parameters, self content hash를 strict schema v3로 저장한다. author freeze나 verifier는 이 수집기를 실행하지 않는다.

`operator-wrapper.mts`는 향후 승인 버전을 위한 dormant wrapper다. 세 authorization 값이 모두 true인 새 버전에서만 `.env.local`을 line stream으로 읽고 `OPENROUTER_API_KEY` assignment 하나만 보존한다. 값·길이·hash를 출력하거나 저장하지 않으며 child에는 OS 최소 변수와 그 키 하나만 전달한다. 현재 CLI entrypoint는 무조건 차단된다.

## 오프라인 재현

저장된 author freeze를 검증한다.

```powershell
npx tsx experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v3/build-offline.mts --check
npx tsx experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v3/verify.mts
```

의도적인 변경 후 새 author freeze를 쓸 때만 실행한다.

```powershell
npx tsx experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v3/build-offline.mts --write
npx tsx experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v3/verify.mts
```

실제 가격 스냅샷 수집과 2-call dispatch는 이 버전에 승인되지 않았고 실행 명령도 제공하지 않는다. 별도 독립 감사와 새 authorization version이 선행되어야 한다.
