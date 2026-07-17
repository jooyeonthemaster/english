# 나중에 적용할 최소 변경 제안서

이 문서는 후속 구현안이다. 이 번들에서는 프로덕션 소스를 수정하지 않았다.

## Gate 0: telemetry만 먼저

`question-generation-llm`, Premium grammar ladder, assignment fetch boundary에 `evidence-plan.md`의 분류 필드를 추가한다. raw prompt/passage/response와 Authorization은 기록하지 않는다. SDK retry가 실제로 어떤 오류에서 실행됐는지 physical attempt가 보이지 않으면 application replay와의 중복을 판단할 수 없다.

## Gate 1: transport 한 층

첫 canary의 최소 변화는 다음 두 default뿐이다.

- `QUESTION_GENERATION_SDK_MAX_RETRIES`: 2 → 1
- `GEMINI_QUESTION_MAX_RETRIES` fallback default: 2 → 0

hard cap 2는 rollback/비교를 위해 당장 제거하지 않아도 된다. 배포 환경 override가 source default를 되돌리지 않는지 startup attestation이 필요하다.

`question-generation-llm.ts`의 같은-attempt 구조화 복구는 유지한다.

- Premium `experimental_repairText`
- deterministic structured rejection의 prompt-JSON fallback
- invalid/truncated prompt-JSON의 continuation repair

분류된 nonretryable/deterministic schema rejection은 다음 application attempt에서 structured call을 다시 실행하지 않는다. transport error는 SDK layer만 담당한다.

## Gate 2: parse-only application replay는 증거가 있을 때만

successful response 이후 parse/schema 실패가 same-attempt repair 뒤에도 사전 기준보다 높을 때만 `PARSE_ONLY_MAX_REPLAY=1`을 별도 정책으로 연다.

- transport/429/5xx에는 적용하지 않는다.
- deterministic provider schema 거절에는 적용하지 않는다.
- quality-gate 반려에는 적용하지 않는다.
- deadline과 assignment budget을 공유한다.

단일 숫자 `maxRetries`가 모든 실패를 재실행하게 두지 말고, error class별 allowance를 분리한다.

## Gate 3: outer와 Premium grammar ladder는 우선 동결

첫 transport containment canary에서는 strict/relaxed/scarce/salvage 수와 ladder cycles/repair/parse attempts를 바꾸지 않는다. 이후 한 축씩 분리한 blind held-out 결과로만 다음을 검토한다.

- ladder parse attempts 2→1
- cycles 3→2
- soft repair per cycle 1→0
- strict floors와 relaxed/scarce/salvage generation lane

이들은 transport 중복이 아니라 후보 다양성·교정·공예 기회이므로 원가만으로 제거하지 않는다.

## Gate 4: Trigger 재실행은 제거 대신 durable dedupe

Trigger `maxAttempts=2`는 task 복구 수단으로 남길 수 있다. 대신 동일 job의 두 task attempt가 같은 provider work를 다시 시작하지 않도록 한다.

- job-wide durable lease/reservation을 Trigger run이 아니라 assignment/job ID에 묶는다.
- provider call/stage idempotency key와 완료 checkpoint를 저장한다.
- crash 후에는 완료 stage를 재사용하거나 안전하게 terminal 처리한다.
- 같은 job의 누적 physical/cost cap을 두 attempt가 공유한다.

`T=1` 프로필은 task invocation을 1로 만들라는 뜻이 아니라 **provider work를 한 번만 청구 가능하게 만들라**는 뜻이다.

## Gate 5: durable budget coverage를 별도 완성

기본 `OFF`에서 곧바로 ENFORCE로 바꾸지 않는다. fresh pricing, effective-model attestation, request-body cap, DB migration/worker 동시배포를 확인한 뒤 `AUDIT → SHADOW → CANARY_ENFORCE → ENFORCE` 순서로 간다.

Workbench FAST/Trigger 밖의 다음 shared-engine 소비자를 등록하거나, shared provider boundary가 scope 없는 production fetch를 거부하도록 이동한다.

- legacy auto generation
- direct generate-question
- tutor program generation
- similar-exam 두 경로
- question-set
- custom-type
- Korean-set

coverage가 끝나기 전에는 정책을 “전역”이라고 부르지 않는다.

## Gate 6: input·wire cardinality hard controls

Retry 설정과 별도로 다음을 추가한다.

1. provider boundary에서 모든 request body UTF-8 bytes 상한을 강제한다. passage뿐 아니라 schema-inline JSON과 raw-output continuation repair도 포함한다.
2. fresh price snapshot과 effective model/provider routing을 lease에 고정한다.
3. count=1 response schema의 `questions`에 maxItems=1을 넣고, 실제 provider JSON schema에 내려갔는지 snapshot test한다.
4. 2개 이상 반환을 trim만 하지 말고 `provider_cardinality_violation`으로 계측한다.

## 최소 테스트

- transient error: SDK physical 1회 재시도 후 성공, application replay 0
- parse/schema response: same-attempt repair 경로만 실행; 조건부 parse-only replay on/off
- deterministic masked 400/grammar-too-large: structured call 한 번 후 prompt-JSON, 다음 structured 반복 0
- quality rejection: SDK/application retry가 아니라 outer corrective pass만 증가
- ladder: cycles/repair topology 불변, SDK multiplier만 3→2
- Trigger crash: 두 task attempt지만 provider stage별 billable execution 1
- budget OFF/AUDIT/SHADOW/CANARY/ENFORCE와 uncovered consumer fail-closed
- count=1 schema maxItems 및 2-object violation
- input body cap, stale price, model mismatch의 fail-closed

## 롤아웃 중단 조건

hard-safety 증가, KILLER craft 비열등 실패, unknown error 급증, deadline/failure 악화, budget/telemetry 누락, model/routing attestation 불일치 중 하나라도 발생하면 canary를 중단하고 이전 defaults로 되돌린다.

