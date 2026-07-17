# 변경 전 계측·held-out 증거 계획

## 목적

재시도 층을 줄였을 때 비용·지연은 감소하더라도 정답 유일성, 미끼 공예, 해설 정확성, 생성 수율이 악화될 수 있다. 반대로 generic application replay가 실제로는 같은 deterministic 실패를 반복할 수도 있다. 이 두 가능성을 이분법으로 가정하지 않고 실패 종류와 문항 품질을 함께 측정한다.

## 1. 먼저 기존 실행을 분류한다

추가 모델 호출 없이 각 logical/physical 호출에 다음 필드를 남긴다. prompt 원문, passage 원문, 시크릿은 기록하지 않는다.

- assignment/job/run ID와 재시도 전 구간을 잇는 correlation ID
- cell: plan, subtype, difficulty, marker/answer/blank settings, quality lane
- stage: structured, prompt-json, continuation-repair, candidate-repair, ladder-answer, ladder-decoy, ladder-repair, solver
- logical attempt, application attempt, SDK physical attempt, Trigger task attempt
- 실패 분류: transient_transport / parse_schema / deterministic_provider_rejection / timeout_deadline / quality_gate / process_replay / unknown
- HTTP/provider error의 정규화된 code·retryable 판정(본문 제외)
- response 도착 여부, parse 결과, schema 결과, provider-visible question-object count
- 후보 관측/수용/반려와 반려 code; design/evaluation/candidate purpose
- model/provider/routing fingerprint, input/output/reasoning tokens, recorded cost, latency
- 동일 logical request/candidate의 keyed digest(원문 저장 없이 중복률 확인)

`unknown`을 임의로 transient로 합치지 않는다. SDK가 실제로 어떤 오류를 retry했는지 physical attempt 단위로 확인한다.

## 2. 분석 단위와 블라인드

- 기본 단위는 passage × cell이다. 동일 passage/settings를 arm 간 paired block으로 사용한다.
- 생성 순서는 block 안에서 무작위화하고, evaluator에는 arm/model/retry 횟수/비용을 숨긴다.
- grammar와 blank, STANDARD와 PREMIUM, BASIC/INTERMEDIATE/KILLER, passage 장르·길이·문법 후보 밀도를 층화한다.
- discovery passage와 confirmatory held-out passage를 분리한다. prompt나 gate를 본 뒤 confirmatory set을 교체하지 않는다.
- 동일 문항의 파생 후보는 독립 표본처럼 세지 않는다. passage cluster를 통계 단위로 반영한다.

## 3. 비교 arm

첫 confirmatory 비교는 quality topology를 고정한다.

- Control: SDK retry 2, application retries 2, 현 outer/ladder
- Arm A: SDK retry 1, application retries 0, 현 outer/ladder
- Arm B(조건부): SDK retry 1, parse/schema-only application retry 최대 1, 현 outer/ladder

Arm B는 telemetry에서 successful-response parse/schema 실패가 same-attempt repair 후에도 유의미하게 남을 때만 연다. ladder cycles/repair 또는 outer pass를 동시에 바꾸지 않는다.

다음 단계에서만 Premium grammar `parse attempts 2→1`, `cycles 3→2`, soft repair on/off를 한 변수씩 실험한다. outer strict/relaxed/scarce/salvage는 별도 실험으로 분리한다.

## 4. 평가 지표

### hard safety

- 정답 없음, 복수정답, 방어 가능한 정답, 비문, source mismatch
- 어법 밑줄/pointCode/교정/해설 불일치
- 빈칸 seam 문법 오류, 선지 등가·중복, 극성/범위 오류
- 해설의 사실·문법 오분석

### craft quality

- 정답의 명확성
- 각 오답 선지의 개별 의도와 오답 근거
- 난이도에 맞는 유혹도와 함정의 날카로움
- 표면 단서·길이 단서·노골적 오답 회피
- 지문 핵심 추론과의 결합도
- 해설의 정확성·간결성·선지별 대응

### operation/cost

- candidate/design/evaluation logical responses
- physical fetches, input/output/reasoning tokens, recorded USD
- p50/p95/p99 latency와 deadline exhaustion
- first-pass success, salvage/review-recommended/failure rate
- retry가 새 유효 후보를 만든 조건부 확률과 동일/근접 후보 중복률
- Trigger 재실행 시 이미 수행한 provider work의 중복률

## 5. 사전 판정 규칙

- hard-safety는 비용 절감으로 보상할 수 없다. 사전 등록한 비열등 margin을 넘으면 해당 arm을 중단한다.
- craft score와 KILLER “아름다움” 평가는 최소 2인 blind 독립평가와 adjudication을 사용한다.
- cost는 mean만 보지 않고 median, p95, adversarial bound를 함께 본다.
- 표본수는 baseline 결함률·paired variance와 최소 탐지효과/비열등 margin으로 사전에 power 계산한다. 임의의 작은 n을 “충분”이라고 선언하지 않는다.
- 0건 결함은 무결성 증명이 아니다. 독립 Bernoulli 근사에서도 0/n의 95% 상한은 대략 3/n이며, 실제 분석은 passage cluster를 반영한다.
- 여러 cell/지표/중간분석의 multiplicity와 stopping rule을 사전 등록한다.
- 전체 1,000-candidate 상한은 전역 ledger가 소유한다. 이 연구 번들은 0개를 사용했고, 향후 arm 배정은 power 계산·조기 중단·confirmatory reserve를 고정한 뒤에만 예약한다.

## 6. 변경 허용 증거

`ONE_TRANSIENT_SDK_RETRY` 기본값 변경에는 최소한 다음이 모두 필요하다.

1. SDK 1회가 실제 transient class 대부분을 회수한다는 physical-attempt telemetry
2. application replay가 추가로 회수한 성공을 transport와 parse/schema로 분해한 조건부 효과
3. Arm A의 hard-safety 비열등 및 craft-quality 비열등
4. cell별 physical/cost/latency 개선과 deadline/failure 악화 없음
5. unknown 실패율이 사전 상한 이하
6. rollback 가능한 config와 canary

outer pass·ladder cycles/repair 변경에는 위 조건에 더해 KILLER 어법/빈칸의 blind craft 점수와 오답 선지별 의도 평가가 필요하다.

