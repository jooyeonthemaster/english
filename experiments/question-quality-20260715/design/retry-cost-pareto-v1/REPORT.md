# 재시도·원가 containment 연구 보고서 v1

## 판정

현재 문제생성 비용 위험은 “재시도가 많다” 하나로 설명되지 않는다. 서로 의미가 다른 다섯 층이 중첩된다.

1. SDK physical retry: 전송 실패 복구
2. wrapper application replay: 구조화 호출·JSON 폴백·JSON 수리를 통째로 다시 실행
3. outer strict/relaxed/scarce/salvage: 품질·수율 복구
4. Premium 어법 answer/add-decoy/repair·hard-regeneration 사다리: 설계·공예 복구
5. Trigger crash replay: 프로세스 장애 복구

현재 ordinary wrapper 최장 호환 경로는 `3 application attempts × 3 explicit SDK invocations × 3 physical attempts = 27`이다. 이 결과가 outer pass 및 Trigger replay와 곱해진다. 반면 outer 교정 pass와 어법 사다리는 실제 품질 기회를 제공할 수 있으므로, transport/application 중복과 같은 근거로 바로 없애면 안 된다.

가장 보수적인 구조적 Pareto 후보는 다음과 같다.

- SDK retry를 1회만 남긴다(`S=2`).
- generic wrapper application retry는 0으로 둔다(`A=1`).
- 같은 application attempt 안의 structured repair, prompt-JSON fallback, continuation repair는 유지한다.
- outer strict/relaxed/scarce/salvage와 Premium 어법 3-cycle/soft-repair/parse-retry topology는 우선 그대로 둔다.
- Trigger task retry를 단순 제거하지 말고, 동일 assignment의 provider work가 durable idempotency와 enforcing budget을 넘어 두 번 실행되지 않게 한다.

이는 품질 채택안이 아니라 **먼저 검증할 최소 변화안**이다. 실제 기본값 변경은 `evidence-plan.md`의 분류 계측과 블라인드 held-out 비열등 검증 뒤에만 가능하다.

## 현재 count=1 정확 상한

아래는 한 engine execution의 adversarial ceiling이다. C/D/E는 각각 full-question candidate-capable / design-only / evaluation logical responses다. output USD는 로컬 가격 스냅샷의 all-active emergency completion rate만 곱한 출력 성분 진단이다. 입력 비용과 실제 총비용 상한은 아니다.

| 셀 | C | D | E | physical/engine | physical/Trigger×2 | output reservation/engine | output-only USD/engine |
|---|---:|---:|---:|---:|---:|---:|---:|
| STANDARD 빈칸 KILLER 단일빈칸 | 216 | 0 | 0 | 648 | 1,296 | 12,980,736 | $210.2879232 |
| PREMIUM 빈칸 | 54 | 0 | 0 | 162 | 324 | 3,466,368 | $112.3103232 |
| STANDARD 어법 확장설정 | 162 | 0 | 63 | 675 | 1,350 | 15,012,576 | $243.2037312 |
| STANDARD 어법 5-marker INTERMEDIATE | 126 | 0 | 45 | 513 | 1,026 | 11,444,256 | $185.3969472 |
| STANDARD 어법 KILLER→INTERMEDIATE rescue | 126 | 0 | 45 | 513 | 1,026 | 11,649,888 | $188.7281856 |
| PREMIUM 어법 사다리 대상 | 96 | 12 | 18 | 378 | 756 | 7,524,864 | $226.8787968 |
| PREMIUM 어법 사다리 비대상 | 72 | 0 | 18 | 270 | 540 | 6,228,864 | $184.8883968 |

물리 호출 수는 봉인 감사와 정확히 일치한다. 출력 reservation은 봉인 감사의 단일 보수 floor보다 소스의 lane별 maxOutputTokens를 더 세분해 계산했다. 예를 들어 Premium 빈칸은 원 생성 4,096과 부분수리 12,288을 구분하고, STANDARD 확장 어법은 원 생성 8,192와 부분수리 20,000을 구분했다. KILLER rescue 셀도 KILLER 12,000과 INTERMEDIATE rescue 8,192를 분리했다.

## 수식

`S = SDK retries + 1`, `A = wrapper application attempts`로 둔다.

```text
ordinary wrapper logical responses = 3A
ordinary wrapper physical fetches = 3AS
W(m,A,S) = AS × [m + 32,000 + min(32,000, max(m,24,000))]
```

현재 `A=3, S=3`이므로 wrapper 하나가 27 physical이다. `SDK retry=1, application retry=0`이면 `A=1, S=2`, 즉 6 physical이다. 외부 quality pass 수를 건드리지 않고 wrapper 배수만 77.78% 줄어든다.

Premium 어법 사다리는 cycle `C`, cycle당 soft repair `R∈{0,1}`, stage당 parse attempts `P`, SDK physical multiplier `S`에 대해 다음과 같다.

```text
design logical = C × P
candidate logical = C × (1+R) × P
physical = C × (2+R) × P × S
```

현재 `C=3, R=1, P=2, S=3`이라 한 ladder run은 54 physical이다. wrapper application retry는 이 사다리에 적용되지 않는다.

## 2,952개 조합

`scenario-matrix.json`은 다음 축을 전수 조합했다.

- SDK retries: 0/1/2
- wrapper application attempts: 1/2/3
- Trigger provider-work executions: 1/2
- 각 셀 strict passes: 1 또는 현재값
- 소스에 존재하는 relaxed/scarce/salvage lane의 모든 on/off subset
- Premium 어법 ladder cycles: 1/2/3
- Premium 어법 soft repair: cycle당 0/1
- Premium 어법 stage parse attempts: 1/2

현재 소스로 도달 가능한 행에는 `CURRENT_SOURCE_*`를 표시했다. 나머지는 소스 변경을 가정한 산술 행이고 품질 효과를 주장하지 않는다.

## 이름 붙은 구조 비교

아래 aggregate는 서로 배타적인 7개 셀의 sensitivity 값을 단순 합산한 것으로, 실제 트래픽 가중 평균이 아니다.

| 프로필 | 7-cell physical/Trigger chain | output reservation | output-only USD | 해석 |
|---|---:|---:|---:|---|
| CURRENT_SOURCE_CEILING | 6,318 | 136,615,104 | $2,703.388608 | 현재 adversarial ceiling 합 |
| ONE_TRANSIENT_SDK_RETRY | 1,500 | 31,510,912 | $638.077824 | outer/ladder craft 유지, SDK 1회·app replay 0 |
| ONE_SDK_PLUS_ONE_PARSE_APPLICATION_ATTEMPT | 2,856 | 61,293,824 | $1,220.168448 | parse-only 추가 replay가 실증될 때만 |
| ONE_APPLICATION_RETRY_ONLY | 1,428 | 30,646,912 | $610.084224 | 동일 전송 의미가 아닌 비교군 |
| DURABLY_DEDUPED_TRIGGER | 750 | 15,755,456 | $319.038912 | provider work T=1; durable 전제 필수 |
| LADDER_SINGLE_PARSE_ATTEMPT | 1,428 | 30,646,912 | $610.084224 | Premium 어법 held-out 전용 |
| LADDER_TWO_CYCLES_SINGLE_PARSE | 1,404 | 30,358,912 | $600.753024 | craft topology 변경, held-out 전용 |
| CURRENT_STRICT_ONLY | 1,080 | 21,957,888 | $437.674752 | fallback 제거 민감도, 채택안 아님 |
| ONE_STRICT_ONLY | 300 | 5,868,800 | $136.0530432 | 산술 하한, 채택안 아님 |

`ONE_TRANSIENT_SDK_RETRY`는 이 7-cell sensitivity 합에서 current 대비 physical 76.26%, output-only USD 76.40%를 줄인다. Premium 어법 사다리 대상만 보면 physical 감소는 65.08%다. 그러나 이 수치는 최악경로 산술 차이이며 평균 절감이나 품질 비열등을 뜻하지 않는다.

## 실패 종류별 올바른 층

| 실패 | 맞는 복구 후보 | 겹치면 안 되는 것 |
|---|---|---|
| 일시적 transport/429/5xx | SDK retry 한 층 | 같은 이벤트를 generic app replay로 다시 증폭 |
| 응답 후 JSON parse/schema 실패 | same-attempt structured repair·prompt JSON·continuation repair; 필요 시 분류된 parse-only 1회 | transport 실패로 뭉뚱그리기 |
| 반복 가능한 provider schema 거절 | 즉시 compatible prompt-JSON 경로 | 다음 app attempt에서 동일 structured call 재실행 |
| 정답 모호성·미끼 약함·solver mismatch | corrective outer pass, targeted repair, grammar ladder | SDK retry로 품질 결함이 고쳐진다고 가정 |
| worker crash/terminal write 실패 | durable idempotency + job-wide enforcing budget | 새 품질 재생성 기회로 취급 |

## 구조적 Pareto 후보와 보류안

1. **우선 검증 후보:** SDK retry 1, generic application retry 0, outer/ladder 그대로. transport 한 층을 보존하고 wrapper 전체 재실행을 제거한다.
2. **조건부 후보:** SDK retry 1 + parse/schema로 분류된 application replay 최대 1. successful response 이후 same-attempt repair 실패율이 사전 기준을 넘을 때만 연다.
3. **운영 후보:** Trigger task retry는 유지할 수 있으나 provider work는 durable lease/idempotency/budget으로 T=1이어야 한다.
4. **실험 전용:** ladder parse attempt 2→1, cycles 3→2, soft repair 제거, outer lane 제거. 모두 미끼 공예·정답명확성·수율을 바꿀 수 있으므로 원가만 보고 채택할 수 없다.

## 별도 통제 1: durable budget

현재 assignment budget 기본 mode는 `OFF`이고, AUDIT/SHADOW도 hard enforcement가 아니다. Workbench FAST/Trigger는 wrapper 안이지만 shared engine의 legacy auto, direct route, tutor, similar-exam, question-set, custom-type, Korean-set 소비자는 보편적으로 덮이지 않는다.

따라서 retry 기본값과 별개로 다음이 필요하다.

- 모든 provider fetch가 동일 assignment scope를 요구하도록 shared boundary에서 fail closed 할 수 있어야 한다.
- Trigger attempts가 같은 job-wide physical/cost lease를 공유해야 한다.
- `AUDIT → SHADOW → CANARY_ENFORCE → ENFORCE` 전환 전 fresh price, model attestation, input cap, DB/worker 동시 배포를 검증해야 한다.
- uncovered consumer를 먼저 목록화·등록하지 않은 채 “전역 hard cap”이라고 부르면 안 된다.

## 별도 통제 2: provider-visible questions[] cardinality

현재 ordinary response schema의 `questions` array에 max가 없다. 엔진이 parsing 뒤 count=1로 slice해도 provider는 한 wire response에 여러 문항 객체를 출력할 수 있다. logical response 수와 실제 생성 문항 객체 수는 동일하지 않다.

별도 변경으로 다음을 검증해야 한다.

- count=1 schema에 `maxItems: 1`이 실제 provider JSON schema까지 내려가는지 검사한다.
- 0개 또는 2개 이상을 downstream trim하지 말고 계약 위반으로 계측한다.
- `providerVisibleQuestionObjects`, `parsedQuestionObjects`, `acceptedQuestionObjects`를 서로 다른 telemetry로 남긴다.

## 비용 한계

이 보고서의 달러 값은 출력 성분의 보수적 reservation일 뿐이다. 다음이 없어서 ship-ready total USD ceiling은 계산 불가다.

- 최종 passage/prompt/repair payload의 source-enforced bytes 또는 tokens 상한
- 15분 이내 fresh endpoint price snapshot
- 배포 실효 모델 및 provider routing attestation
- 모든 consumer를 포함하는 enforcing durable budget

입력 상한을 나중에 도입하더라도 continuation repair prompt가 이전 raw output을 포함하므로, “지문 길이” 하나가 아니라 **provider wire request body별 상한**을 경계에서 강제해야 한다.

## 연구 무결성

이 번들은 호출 0, 후보 0인 정적 연구다. 품질 개선·악화를 관찰하지 않았고, 비용 산술만으로 어떤 품질 topology도 제거하라고 결론내리지 않는다. 다음 결정은 `evidence-plan.md`의 prospective, blinded, held-out 결과가 필요하다.

