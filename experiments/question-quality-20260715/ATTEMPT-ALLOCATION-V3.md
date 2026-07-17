# 1,000 full-candidate attempt 배분 v3 초안

상태: **FAIL / 비실행 초안**. `attempt-allocation-v3.draft.json`은 canonical registry가 아니며 API 호출 권한을 만들지 않는다. 현재 operational authorization은 `0`, 실제 사용량은 `0/1000`이다.

## 2026-07-15 적대 검수 정정

`990 + 10 = 1,000` 산술 자체는 맞지만, 이 표는 아직 실행 설계가 아니다.

1. 현행 STANDARD/PREMIUM 경로는 한 assignment에서 여러 full-candidate 물리 요청을 만들 수 있다. 초안의 assignment당 1/2/3 slot ceiling은 그 꼬리를 중간 차단하므로 **CURRENT production parity가 아니라 budget-truncated policy**가 된다.
2. 종전 A2의 `4 profile, 10 passage, passage당 2 profile, profile당 5회`는 BIBD가 아니다. `v=4, b=10, k=2, r=5`이면 `λ=r(k-1)/(v-1)=5/3`으로 정수가 아니며 profile pair를 균형 배정할 수 없다. 같은 80 assignment 안에서 **5 passage/type-plan × 모든 4 profile**의 complete-block screening으로 정정했다.
3. A3의 type별 60 paired passage는 표본 수를 정확히 센 것이지만, 그 자체가 충분한 검정력을 뜻하지 않는다. exact McNemar 민감도상 보통 크기의 10%p 개선은 검정력이 매우 낮다.
4. 비실행 10-slot 여백은 임의의 multi-output 초과를 수학적으로 막지 못한다. 요청당 단일 출력과 동시 in-flight 초과량을 네트워크 전에 유한하게 봉인해야 1,000 상한을 보장할 수 있다.
5. 고정 queue/hash, 수치 winner rule, multiplicity, MDE, physical-call cap, token ceiling, phase/campaign USD cap이 비어 있다. 이 값이 채워지고 독립 감사를 통과하기 전에는 어떤 phase도 열 수 없다.

## 단위와 실제 호출 그래프

한 candidate slot은 실제 provider HTTP 요청 직전 **full question 하나를 낼 수 있는 물리 기회**다. HTTP 실패·timeout·SDK retry·parse 실패·반려·full repair 뒤에도 반환하지 않는다. answer/site 설계와 독립 평가는 candidate slot 0이지만 physical call·token·USD에는 포함한다.

현재 코드와 zero-network provider probe에서 확인한 꼬리는 다음과 같다.

| 경로 | 확인된 물리 호출 확대 | 후보 slot 함의 |
|---|---|---|
| 공통 `generateQuestionObject` | 외부 재시도 기본 2회, 각 `generateObject`의 AI SDK 내부 재시도 기본 2회 | 평범한 한 논리 생성도 최대 9번의 후보-capable HTTP 기회를 가질 수 있고 JSON repair/fallback은 이를 더 늘린다 |
| STANDARD empty-result runner | 일반 유형 strict 최대 4회, KILLER 어법 4회, 단일 KILLER 빈칸 10회; 이후 rescue/relaxed/salvage 가능 | assignment ceiling 1~2는 현행 정책과 불일치 |
| PREMIUM 일반 경로 | 기본 strict 2회이고 각 회차에 공통 재시도와 candidate repair가 존재 | ceiling 2~3은 tail을 자름 |
| PREMIUM 어법 사다리 | `fireOnce` 하나가 SDK retry로 최대 3 HTTP, `callLadderModel`은 parse/reasoning 경로에서 최대 3 `fireOnce`; 초기+hard regen 2회, cycle별 repair와 legacy fallback 가능 | 한 add-decoys/repair stage만 최대 9 후보 기회이며 assignment ceiling 3으로 전체 사다리를 재현할 수 없음 |
| 어법 solver | 후보는 만들지 않지만 공통 재시도 경로를 타는 별도 evaluation 호출 | candidate slot 0이어도 physical-call/USD cap에는 반드시 포함 |

따라서 “같은 프로덕션 코드 함수를 호출했다”와 “프로덕션 정책을 끝까지 실행했다”를 구분한다. 고정 candidate ceiling을 유지한다면 추론 대상은 명시적으로 **capped policy**다. production parity를 주장하려면 실제 call graph를 보존하는 별도 설계와 그 최악 상한을 먼저 증명해야 한다.

## 산술 envelope

아래 숫자는 **계획 envelope일 뿐 실행 승인값이 아니다**. 모든 per-assignment ceiling은 현재 invalid placeholder다.

| Phase | 목적 | 논리 assignment | 계획 candidate slot | 추론 범위 |
|---|---|---:|---:|---|
| A1 | 현행 core 전 25유형×2플랜 KILLER sentinel | 50 | 100 | 결함 발견만; 품질률·parity 아님 |
| A2 | 어법·빈칸 4 profile complete-block 개발 screening | 80 | 200 | 승자 탐색만; 품질률 아님 |
| A3 | 어법·빈칸 CURRENT/WINNER 독립 holdout paired | 240 | 600 | 예정상 type별 60쌍; 검정력·다중성 미확정 |
| A4 | 동결 winner의 fast-route 전 25유형×2플랜 | 50 | 75 | route·저장·렌더·채점 smoke sentinel |
| A5 | 어법·빈칸 noisy/boundary robustness | 6 | 15 | 경계 사례 smoke만 |
| 안전 여백 | cardinality/overflow 사고 방어 | 0 | **10 비실행** | 재배분 금지; 단독으로 cap 보장 못 함 |
| 합계 |  | 426 | **990 계획 + 10 안전 = 1,000** | operational authorization 0 |

STANDARD placeholder ceiling은 A1/A4에서 1, A2/A3/A5에서 2다. PREMIUM은 A1/A2/A3/A5에서 3, A4에서 2다. 동일 plan의 CURRENT/WINNER에 대칭적으로 적용해도 production tail을 잘라내는 사실은 바뀌지 않는다. 이 ceiling으로 실행한다면 plan 간 raw yield를 같은 예산 조건으로 비교해서도 안 된다.

## A2: complete-block screening

각 focus type에 현행을 포함한 4개 profile을 freeze하고, profile마다 STANDARD/PREMIUM 구현의 prompt/schema/gate/ladder/policy hash를 함께 고정한다.

1. 현행 exhaustive 정책
2. compact positive design certificate
3. 명시적 site/slot contract + option-intent ledger
4. 역할 분리 또는 candidate-selection 정책

type×plan마다 독립 dev passage 5개를 두고, 같은 passage-plan block에 네 profile을 모두 실행한다. 총 assignment는 `2 type × 2 plan × 5 passage × 4 profile = 80`으로 종전과 같다. profile별 표본은 type-plan당 5, type당 10에 불과하므로 이는 스크리닝이지 확증이 아니다. block 안 실행 순서는 동결된 균형 순서로 섞어 시간·순서 편향을 줄인다.

WINNER의 단위도 실행 전에 선택해야 한다. 선택지는 (a) focus type마다 하나의 conceptual profile과 그 profile의 두 plan 구현을 함께 freeze하거나, (b) type×plan별 profile mapping 전체를 하나의 복합 정책으로 freeze하는 것이다. 후자는 선택 자유도가 커지므로 별도 multiplicity와 A3 pooled estimand 정의가 필요하다. 어느 쪽이든 결과를 본 뒤 좋은 조각을 합성하거나 같은 dev 지문에서 prompt를 고쳐 재평가하지 않는다.

아직 필요한 수치 규칙은 다음과 같다.

- 새 no-answer/multiple-answer/factual-explanation fatal의 탈락 기준
- ship-ready/beautiful/slot-yield의 lexicographic 순서와 최소 차이
- cost·latency noninferiority/Pareto threshold
- 네 profile 비교의 multiplicity family
- conceptual type winner인지 type×plan winner map인지에 대한 단위
- 동률 또는 inconclusive일 때 CURRENT 유지/STOP 규칙

이 값이 비어 있는 현재 `WINNER`는 정의되지 않았다.

## A3: 표본 수, ITT, 검정력

어법 G60과 빈칸 B60은 서로 다른 certified holdout panel이다. 각 type의 60 passage를 STANDARD 30/PREMIUM 30으로 층화하고, 같은 passage-plan에서 CURRENT와 WINNER를 모두 실행한다. 각 type-plan의 30쌍은 CURRENT-first 15, WINNER-first 15로 동결해 인접 실행한다.

- type별 정책 assignment 수는 CURRENT 60, WINNER 60이고 **paired unit은 60 passage**다.
- plan-specific paired unit은 30 passage라 탐색 결과다.
- provider timeout, parse 실패, candidate ceiling 소진, policy `no_output`은 ITT의 ship-ready/beautiful 실패다.
- corpus 누락, provenance 불명, 미완료 blind review는 outcome으로 억지 코딩하지 않는다. phase 전체가 불완전한 것이며 새 passage로 top-up하지 않는다.
- `ship_ready_per_assignment`, `beautiful_per_assignment`, `fatal_shipment_per_assignment`의 정확한 파생 규칙을 RUBRIC hash와 함께 freeze한다. 출력 조건부 fatal-free는 보조 지표이며 no-output 정책의 이득처럼 쓰지 않는다.
- 동일 passage의 paired binary 결과에는 exact McNemar, 비용·지연에는 passage-block bootstrap을 쓰되, 1차 estimand·검정 방향·alpha·family를 먼저 고정한다.

dependency-free 재현 코드는 `reviews/attempt-allocation-v3-audit/power-sensitivity.mjs`다. 두-sided exact McNemar의 80% power에 필요한 순개선폭은 다음과 같다.

| paired n | discordant q | α=.05 MDE | α=.025 MDE |
|---:|---:|---:|---:|
| 60 | 20% | 16.2%p | 17.2%p |
| 60 | 30% | 20.1%p | 21.7%p |
| 60 | 40% | 23.5%p | 25.3%p |
| 30 | 30% | 27.4%p | 29.3%p |
| 30 | 40% | 32.1%p | 34.1%p |

순개선 10%p의 exact power는 n=60, α=.05에서도 q=20/30/40%일 때 각각 30.8/22.1/16.9%뿐이다. α=.025이면 22.4/14.2/11.0%다. 따라서 `n=60`은 큰 효과를 확인하는 설계이지 미세 개선을 안정적으로 검출하는 설계가 아니다.

WINNER에서 fatal 0/60을 관측해도 one-sided exact 95% 상한은 4.9%다. 실제 fatal률 1%를 한 건 이상 발견할 확률은 45.3%, 2%는 70.2%, 5%는 95.4%다. “관측 0건”은 출하 gate로 쓸 수 있지만 모집단 fatal 0의 증명은 아니다.

## A1/A4 coverage의 한계

A1과 A4는 활성 25유형을 각 plan에서 한 번씩 건드리는 smoke/sentinel다. 전 유형 품질률, type별 효과, 3난이도 coverage를 주장하지 않는다.

A4의 50 type-plan cell을 세 난이도에 정확히 같은 수로 나눌 수 없으므로 `17/17/16`의 near-balanced schedule을 freeze한다. 한 type에는 plan 두 개뿐이라 세 난이도를 모두 덮을 수도 없다. 저장·렌더·채점 오류를 찾는 데는 쓸 수 있지만 “route parity가 입증됐다”는 결론에는 쓸 수 없다. 특히 placeholder candidate ceiling이 fast route의 retry/repair를 자르면 그 실행은 production route smoke이지 production-policy parity가 아니다.

## 고정 queue, phase 순서, drift

실행 순서는 아래와 같고 앞 단계의 gate가 닫히면 뒤 단계는 열지 않는다.

1. corpus v3·provider/parser 계측·cardinality·provenance·price/token/call/USD cap 감사
2. A1 current sentinel
3. A2 complete-block screening
4. 수치 규칙으로 WINNER freeze 또는 STOP
5. A5 사전등록 경계 smoke; 결함으로 policy를 바꾸면 같은 A3를 열지 않고 새 dev/amendment로 돌아감
6. A3 독립 holdout paired confirmation
7. winner 구현·commit/deployment freeze
8. A4 isolated fast-route smoke

각 phase는 실행 전에 corpus row, source hash, stratum, 전체 순서, block 내 policy/profile 순서까지 하나의 immutable queue hash로 고정한다. 결과를 본 뒤 실패 cell·늦은 queue row·특정 arm을 교체하거나 top-up하지 않는다. A2, A3, A5와 과거 실험은 exact/near-duplicate cluster가 분리되어야 한다.

requested/effective/served model, 실제 provider, model revision/alias, feature flag를 pair마다 기록한다. A3는 pair를 인접 실행하고 AB/BA 순서를 균형화한다. served model/provider drift나 alias 교체가 발생하면 그 phase를 안전중단하고 **불완전/비확증**으로 남긴다. 새 모델에서 남은 cell만 이어 붙이지 않는다.

## 비용·물리 call gate

candidate slot만으로 비용을 통제할 수 없다. answer-only, solver, JSON repair, 평가 호출은 candidate 0이어도 유료다. 각 phase를 열기 전에 아래를 모두 숫자로 freeze한다.

- model/stage별 input·output token ceiling과 retry policy
- candidate/design/evaluation별 physical provider-call cap
- endpoint price snapshot hash와 보수적 pre-network reservation식
- batch, phase, campaign USD cap
- latency/deadline cap과 unknown billing reconciliation 규칙

가격 또는 token ceiling이 불명인 모델은 호출하지 않는다. 실제 비용이 예약을 넘으면 기록은 보존하되 phase를 breached로 닫고 새 호출을 차단한다.

## 10-slot 안전 여백

계획 phase 합은 990이고 10개는 어떤 phase에도 속하지 않으며 실행·재배분할 수 없다. 그러나 이는 다음이 먼저 보장될 때만 실제 안전 여백이다.

1. 각 experiment 요청 스키마가 네트워크 전에 full-question 출력 cardinality를 정확히 1로 제한한다.
2. provider boundary가 SDK retry를 포함한 모든 물리 HTTP 전에 slot을 원자 예약한다.
3. 동시에 in-flight인 요청의 최대 초과 출력 수가 10 이하임을 구조적으로 증명한다. 더 강하게는 초과 출력 자체를 불가능하게 한다.
4. canonical registry가 executable phase 합을 990 이하로 고정하고 safety phase 생성·재배분을 거부한다.

현재 harness audit의 B1~B7과 provider wiring 미구현 때문에 이 증명이 없다. 따라서 10-slot 표기는 **cap 보장 근거가 아니라 보류 조건**이다.

## 실행을 막는 값

- 실제 call graph와 양립하는 candidate ceiling 또는 명시적 capped-policy 재정의
- profile별 prompt/schema/gate/ladder/policy hash와 수치 winner rule
- v3 corpus row/split/stratum/order hash와 phase 간 leakage 검사
- requested/effective/served model·provider assertion과 drift rule
- token, physical-call, batch/phase/campaign USD cap
- A3 primary estimand, exact test 방향, alpha, multiplicity, MDE, inconclusive rule
- trusted provider/parser cardinality·hash·cost boundary와 route 우회 차단 fresh audit PASS

이 값이 하나라도 비어 있으면 canonical registry를 초기화하거나 phase를 `operational`로 바꿀 수 없다.
