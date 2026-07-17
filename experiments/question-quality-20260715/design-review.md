# 문제 생성 품질 실험설계 독립 적대 검토

작성일: 2026-07-15 KST  
검토 범위: `PROTOCOL.md`, `RUBRIC.md`, `experiment-registry.json`, corpus public manifest/schedule/robustness queue, `research-note.md`  
제약: 새 문제 API 호출 없음, 프로덕션 코드 변경 없음

> **2026-07-15 실행 중지 정정:** 아래 `최대 998-slot` 표는 최초 설계의 기록으로만 보존한다. 이후 provider fetch-boundary 재현과 과거 PREMIUM 어법 계보 재분해에서 최종 산출물 수와 full-candidate attempt slot이 동일하지 않음이 확인됐다. 따라서 이 표로 phase를 열거나 `n=60/arm`을 보장해서는 안 된다. 각 phase를 고정 attempt-slot ITT로 다시 설계하고, 물리 호출·비용 lease와 후보 산출물 계보를 실제 provider 경계에서 검증하기 전까지 API 사용은 `0/1000`으로 동결한다.

## 1. 판정

프로토콜의 방향은 타당하지만, 현재 상태로는 첫 API 배치를 열면 안 된다. 특히 기존의 `120/280/300/180/120` 예산 구획은 어떤 비교가 몇 개의 **독립 passage block**을 가지는지, STANDARD/PREMIUM 효과를 각각 확증할 수 있는지, 탐색한 여러 가설 중 어떤 것을 어떤 오류율로 승격하는지가 정해져 있지 않다. 아래의 최대 998-slot 설계로 바꾸면 다음을 동시에 만족할 수 있다.

- 25유형 × 2플랜 × 3난이도를 dev와 최종 holdout에서 각각 한 번씩 전수 sentinel한다.
- 어법·빈칸은 프롬프트 밀도, 역할분리, 게이트 및 그 상호작용을 dev에서 탐색한다.
- KILLER 어법·빈칸은 우선 `n=60/arm/type`의 독립 passage block으로 확증하고, 필요 조건을 모두 채우면 `n=60/arm/type/plan`까지 확장한다.
- 한 지문에서 여러 arm·plan·type을 생성해도 표본 수를 늘린 것으로 세지 않고 passage를 군집 단위로 분석한다.
- 실패·timeout·parse 실패도 사전 소비한 attempt slot을 반환하지 않으며, 무조건 재생성이나 결과를 본 뒤의 top-up을 금지한다.

다만 이 배분표는 다음 세 가지 hard blocker가 해소된 뒤에만 실행할 수 있다.

1. corpus 120개 모두 `manualAudit.status=PENDING`이다. 두 명의 독립 수동 감사와 이견 adjudication 전에는 clean corpus로 부를 수 없다.
2. 현재 holdout 60개 중 KILLER 빈칸용 `central-span`은 39개, 어법용 `grammarSuitability != scarce`는 54개뿐이다. 10개는 prior generation 이력도 있다. 따라서 현 manifest만으로는 적합하고 미노출인 KILLER 지문 `n=60/type` 확증이 불가능하다.
3. registry에는 exact slot allocation, physical-call cap, USD cap, winner rule, 다중비교 절차가 아직 없다. 특히 answer-only·judge·repair 호출은 slot 밖이라는 이유로 무제한 호출할 수 있어서는 안 된다.

API 사용량은 이 세 항목과 canonical budget guard가 모두 닫힐 때까지 `0/1000`을 유지해야 한다.

## 2. 현재 corpus와 schedule에서 확인한 사실

- dev와 holdout schedule은 각각 정확히 150셀이고 25유형, STANDARD/PREMIUM, BASIC/INTERMEDIATE/KILLER를 모두 포함한다.
- 그러나 각 split의 고유 지문은 60개다. 30개 지문은 2회, 30개 지문은 3회 재사용된다. 따라서 150을 독립 표본 수로 쓰면 안 된다.
- dev는 blank `central-span` 36개, grammar non-scarce 55개다. holdout은 각각 39개와 54개다.
- holdout DB strict tier인 `reviewed + prior AI question 0 + prior Workbench job 0` 후보는 0개다. 현재 holdout의 DB 30개는 전부 unreviewed이고 그중 10개는 prior generation이 있다.
- 150셀 schedule의 `PREFERRED`는 휴리스틱 적합성일 뿐 문항 성립성이나 논리 무결성 인증이 아니다.

따라서 다음 두 종류의 holdout을 분리해야 한다.

- **General holdout 60**: 전 유형 sentinel과 렌더·채점 회귀용. 기존 schedule을 이중 수동 감사 후 사용할 수 있다. prior-use 완화는 구조 회귀 결과에 명시하고 품질률 확증에는 쓰지 않는다.
- **Focus holdout G60/B60**: KILLER 어법 60개와 KILLER 빈칸 60개의 유형별 적합 지문 panel. dev, general holdout, 7/15 dawn, 과거 실험 산출물과 hash-disjoint이고 prior question/job 0이며, 두 명의 독립 감사가 적합성을 확인해야 한다. 두 focus panel도 가능하면 서로 겹치지 않게 한다. 겹치면 유형별 분석만 하고 type을 합쳐 표본 수를 부풀리지 않는다.

dev에도 P2A/P2B에 필요한 유형별 적합 지문을 seed-preserving 방식으로 보충해야 한다. split이나 arm을 본 뒤 좋은 지문만 고르는 행위는 금지한다.

## 3. 최대 998-slot 단계별 배분

| Phase | split/목적 | 정확한 산식 | slot cap | 해석 범위 |
|---|---|---:|---:|---|
| P0-OFFLINE | 계측·replay·코퍼스 감사 | 모델 full-question 경계 진입 없음 | 0 | API 전제조건 |
| P1-DEV-ALL-CONTROL | 현행 전 유형 기준선 sentinel | 25유형 × 2플랜 × 3난이도 × 1 | 150 | 커버리지·결함 탐지, 품질률 추정 금지 |
| P2A-DEV-DENSITY | 어법/빈칸 제약 밀도 pilot | 2유형 × 4프로필 × 8 passage blocks | 64 | type별 `n=8/profile`, 탐색 전용 |
| P2B-DEV-FACTORIAL | 밀도 × 역할분리 × 게이트 | 2유형 × 8 factorial cells × 4 replicates | 64 | 탐색적 주효과·상호작용, 확증 금지 |
| P3-H-KILLER-MAIN | 동결 winner의 KILLER 주효과 | 2유형 × 60 passages × 2 arms | 240 | type별 `n=60/arm`, plan 평균 효과 |
| P4-H-KILLER-PLAN-X | 동일 60 passages의 반대 plan crossover | 2유형 × 60 passages × 2 arms | 240 | `n=60/arm/type/plan`, plan 상호작용 |
| P5-H-ALL-REGRESSION | 동결 winner 전 유형 최종 sentinel | 25유형 × 2플랜 × 3난이도 × 1 | 150 | 최종 커버리지·회귀, 품질률 추정 금지 |
| P6-ROUTE-FAST | 실제 fast route 통합 parity | 25유형 × 2플랜 × 1 | 50 | 인증·diversity·billing·persist·surface |
| P7-ROBUSTNESS | noisy/borderline 입력 fail-safe | 2유형 × 2플랜 × 5 | 20 | 올바른 차단/abstention, 품질률과 분리 |
| P8-REPAIR | gate-triggered 표적수리 탐색 | 2유형 × 2플랜 × 최대 5 | 20 | 조건부 repair 효용, 확증 금지 |
| **합계** |  |  | **998** | hard cap 1000 대비 2 미배정 |

P7에서 source preflight가 모델 경계 전에 차단하면 slot은 소비하지 않는다. P8도 사전 고정한 eligibility와 hash 순서에 해당하는 gate-failed 문항만 수리하며, eligible이 적다고 다른 문항을 채워 넣지 않는다. 미사용 slot은 다른 가설에 자동 전용하지 않는다.

### 기계 검산용 allocation manifest

<!-- ALLOCATION_JSON_BEGIN -->
```json
{
  "hardCap": 1000,
  "phases": {
    "P0-OFFLINE": 0,
    "P1-DEV-ALL-CONTROL": 150,
    "P2A-DEV-DENSITY": 64,
    "P2B-DEV-FACTORIAL": 64,
    "P3-H-KILLER-MAIN": 240,
    "P4-H-KILLER-PLAN-X": 240,
    "P5-H-ALL-REGRESSION": 150,
    "P6-ROUTE-FAST": 50,
    "P7-ROBUSTNESS": 20,
    "P8-REPAIR": 20
  },
  "totalAllocated": 998,
  "unallocated": 2
}
```
<!-- ALLOCATION_JSON_END -->

## 4. dev 탐색 설계

### P2A: 제약 밀도를 내용과 혼동하지 않는 4-arm pilot

각 유형에서 적합한 8개 passage block을 고정하고, 같은 지문·같은 plan·같은 난이도에서 아래 네 프로필을 모두 생성한다. 8개 지문 중 4개는 STANDARD, 4개는 PREMIUM으로 passage 수준에서 고정 배정한다.

1. `CURRENT`: 현 프로덕션 prompt/pipeline 그대로인 외부 benchmark
2. `MINIMAL`: 반드시 필요한 positive contract만 포함
3. `MODERATE`: MINIMAL에 구조 인증과 option-intent 산출물을 추가
4. `EXHAUSTIVE`: MODERATE에 사전 등록한 예외·금지 제약을 추가

MINIMAL ⊂ MODERATE ⊂ EXHAUSTIVE가 되도록 공유 문구·순서·schema·모델·게이트를 고정한다. `CURRENT`는 구조가 다르므로 density dose-response의 한 수준으로 해석하지 않고 benchmark로만 쓴다. 단순 token 수를 “제약 밀도”라고 부르지 말고 positive steps 수, negative constraints 수, schema 필드 수, prompt tokens를 함께 기록한다.

type별 각 프로필은 8개의 독립 passage block을 갖지만 plan별로는 4개뿐이다. 따라서 여기서 STANDARD/PREMIUM 차이를 주장할 수 없다. `n=8` 안전 pilot로만 사용하고, fatal 2건 이상인 type-profile은 즉시 폐기한다.

### P2B: 2×2×2 탐색 factorial

P2A에서 fatal-free인 밀도 중 사전 등록된 선택 규칙으로 고른 두 수준을 `D` 요인으로 쓰고, 다음 세 요인의 full factorial 8셀을 구성한다.

- `D`: 낮은 안전 밀도 / 높은 안전 밀도
- `R`: 현행 단일-stage 역할 / 설계 산출물과 최종 생성을 분리한 역할
- `G`: gate 관측만 / gate 판정 집행 후 reject

`R`은 우선 동일한 resolved plan model을 유지해 **stage separation 자체**를 검증해야 한다. Flash→Pro 또는 Pro→Flash처럼 model identity까지 바꾸면 role과 model 효과가 섞이므로 별도 policy-package 가설로 등록해야 한다. Gemini reasoning/thinking 설정도 factor가 아니면 모든 arm에서 동일하게 off로 고정한다.

각 유형에서 32개의 서로 다른 dev 지문을 4개의 matched octet으로 묶고, octet마다 8 factorial cell을 하나씩 무작위 배정한다. 각 cell은 4개의 독립 지문을 가지며 STANDARD/PREMIUM이 2/2가 되도록 고정 seed로 회전한다. 이 방식은 같은 4개 지문에서 8개 출력을 뽑아 독립성이 4밖에 되지 않는 설계보다 낫다. 그래도 cell당 `n=4`, factor-level `n=16`이므로 주효과와 상호작용은 승격 후보를 고르는 탐색치일 뿐이다.

P2B의 gate-on arm은 우선 reject까지로 끝내 gate 효과를 수리 효과와 분리한다. full-question 수리본은 새로운 candidate이므로 원본 slot에 숨기지 않고 P8의 별도 최대 20 slot을 소비한다. P8은 type×plan별 gate-failed pool에서 미리 고정한 hash 순서의 최대 5개만 한 번 수리한다. “수리가 잘 될 것 같은 결함”을 보고 고르면 안 된다.

### dev winner 고정

holdout으로 갈 policy는 type×plan별로 하나만 고정하고 prompt, schema, gate, repair eligibility, 모델 역할, reasoning mode, max token, retry graph의 digest를 잠근다. 다음 규칙이 registry에 수치로 들어가기 전에는 승자를 고르지 않는다.

- fatal이 하나라도 있는 profile은 탈락한다.
- `shipReadyITT`, `beautifulKillerITT`, cost-per-ship-ready의 Pareto 열위 profile은 탈락한다.
- 품질 상승과 비용 상승이 맞바뀌는 Pareto frontier가 남으면 사업상 허용 가능한 incremental cost/추가 ship-ready 1개의 상한을 **결과를 보기 전에** 정해야 한다. 이 값이 없으면 임의 가중합으로 승자를 만들지 말고 “승자 없음”으로 끝낸다.
- screening p-value로 확증을 주장하지 않는다. 탐색에서 선택한 동일 policy만 새 focus holdout에서 검증한다.

## 5. 동결 holdout 확증 설계

### P3: type별 60개의 독립 block

G60/B60 각각의 60개 적합 KILLER 지문에 대해 passage 수준에서 plan을 30 STANDARD/30 PREMIUM으로 층화 무작위 배정한다. 층화 변수는 origin, topic, length, discourse, suitability이며 arm 결과를 보기 전 seed를 고정한다. 각 지문에서 같은 plan으로 `CURRENT`와 동결 `WINNER`를 하나씩 생성하므로 type별 arm당 60개의 독립 passage block이 생긴다.

P3만으로 확증할 수 있는 것은 plan을 공변량으로 둔 **type별 평균 treatment effect**다. plan별 표본은 arm당 30이므로 STANDARD나 PREMIUM 각각의 확증 결과라고 부를 수 없다.

### P4: plan crossover

P3의 각 passage에서 배정되지 않았던 반대 plan으로 CURRENT와 WINNER를 한 번씩 더 생성한다. 그 결과 type×plan×arm마다 같은 60 passage가 존재한다. P4까지 완료해야 plan별 `n=60/arm`과 arm×plan difference-in-differences를 확증할 수 있다.

P3와 P4는 동일하게 잠근 policy의 사전 등록된 확증 단계다. P3 결과를 보고 prompt나 gate를 고친 뒤 P4를 “재검증”으로 쓰면 안 된다. P3에서 확인된 fatal 때문에 안전 중단할 수는 있지만, 이는 승격 실패이며 효능 조기 성공이 아니다. 실패한 winner를 고친 뒤 같은 G60/B60을 다시 쓰지 말고 새 미노출 panel과 새 다중검정 계획을 마련해야 한다.

### P5: 전 유형 회귀

general holdout schedule의 150셀을 동결 winner 코드로 한 번씩 실행한다. 이것은 전 유형×플랜×난이도의 parse/schema/render/scoring/explanation/safety 회귀를 찾는 sentinel이다. 셀당 1개이고 60 passage가 2~3회 반복되므로 “전 유형 품질 95%” 같은 비율 추정에 쓰지 않는다.

P3~P5의 생성 순서와 arm/plan 순서는 interleave하고 무작위화한다. 확증 policy와 분석 코드를 잠근 뒤에는 모든 holdout 출력을 생성할 때까지 사람이 품질 결과를 열지 않는 것이 원칙이다. 예외는 사전 등록된 safety stop과 budget breach뿐이다.

## 6. 관측 단위와 평가·통계

### 실패를 숨기지 않는 분모

다음 지표를 분리한다.

- `attemptYield = parsed candidates / consumed attempt slots`
- `shipReadyITT = ship-ready candidates / consumed attempt slots`
- `beautifulKillerITT = beautiful KILLER candidates / consumed attempt slots`
- `fatalIncidentITT = fatal parsed candidates / consumed attempt slots`
- `fatalFreeConditional = fatal-free / parsed candidates`

timeout·parse 실패·gate reject는 `shipReadyITT`와 `beautifulKillerITT`에서 실패다. parsed candidate가 없다는 이유로 분모에서 빼면 비싼 gate가 저품질 출력을 모두 버려 “품질률 100%”처럼 보이는 문제가 생긴다. 반대로 no-candidate를 문법 fatal 문항이라고 부르지는 말고 yield failure로 따로 기록한다.

각 passage의 CURRENT/WINNER, STANDARD/PREMIUM, 필요하면 두 유형 출력은 반복측정이다. 통계의 독립 단위는 output row가 아니라 passage cluster다.

- 이항 paired 결과: passage-stratified McNemar 또는 paired randomization test
- craft score·비용·지연: passage-block bootstrap
- P4 arm×plan: passage 내 difference-in-differences 또는 passage random intercept를 둔 모델
- 비용: plan별 raw cost, cost/attempt, cost/ship-ready, incremental cost/추가 ship-ready를 모두 보고
- latency: plan·stage별 p50/p95와 timeout을 별도 보고

`n=60/arm`은 최저 규칙이지 자동으로 충분한 power를 보장하지 않는다. 예상 discordant-pair 비율과 최소 검출효과를 과거 replay에서 추정해 simulation power를 registry에 추가해야 한다. fatal 0/60이어도 독립 Bernoulli 가정의 단측 95% 상한은 약 4.87%이므로 “모집단 오류율 0”을 증명한 것이 아니다.

### 다중비교와 계층적 판정

screening 결과는 전부 탐색으로 표시하고 유의성 홍보를 금지한다. holdout의 확증 family는 다음처럼 작게 고정한다.

1. 안전성 gate: type별 V2/V3/V4/V5 critical fatal이 1건이라도 있으면 그 policy는 승격하지 않는다. 관측 0건도 exact interval과 함께 보고한다.
2. 1차 효능: GRAMMAR와 BLANK의 `shipReadyITT` 두 가설에 Holm 보정한다.
3. 계층적 2차 효능: 해당 type의 안전성과 ship-ready가 통과한 경우에만 `beautifulKillerITT` 개선을 검정하고 두 type에 Holm 보정한다.
4. craft의 6개 하위축, difficulty, 장르, 길이, gate code별 효과는 탐색으로 남긴다.

비용과 지연은 품질 p-value로 상쇄하지 않고 Pareto 제약으로 취급한다. “fatal 한 건 대신 craft 평균 +3점” 같은 상쇄는 허용하지 않는다.

### 독립 평가

각 parsed candidate는 arm, plan, model, prompt, stored key, gate warning을 숨긴 채 두 평가자가 blind solve와 RUBRIC 전 필드를 독립 작성한다. 답·fatal·grade 이견은 제3 평가자가 adjudicate한다. raw agreement와 Gwet AC1(희귀 fatal에서 kappa 역설 방지), craft 점수의 평가자 일치도도 보고한다. 한 평가자가 같은 passage 변형을 연속으로 보지 않게 packet을 섞고 세션을 나눠 피로·기억 효과를 줄인다.

## 7. 중간중단과 재생성 금지

- P2A의 `n=8/type/profile`에서 fatal 2건 이상이면 해당 profile을 안전 중단한다.
- P2B와 P8은 efficacy 조기 성공을 선언하지 않는다. fatal 반복, physical-call cap, USD cap, provider anomaly에서만 중단한다.
- P3/P4는 효능을 중간 열람해 승자를 선언하지 않는다. 확정 fatal 1건이면 승격 실패로 안전 중단할 수 있다.
- 한 slot이 timeout/no-candidate가 되어도 같은 셀을 채우기 위한 평균 2회·5회 재생성을 하지 않는다. no-candidate 자체가 end-to-end policy 결과다.
- transport-level provider retry가 필요하면 사전 등록된 동일 candidate lineage 안의 physical call로 기록하되, retry 상한과 비용을 먼저 예약한다. full-question 출력이 새로 생기는 repair/regeneration은 새 candidate slot이다.
- 안전 중단으로 남은 slot은 다른 가설에 자동 재배정하지 않는다. 재배정하려면 아직 어떤 결과도 보지 않은 별도 family인지 확인하고 registry amendment와 새 manifest hash를 먼저 고정한다.

반복적인 interim efficacy 검정을 할 필요가 있다면 alpha-spending 경계를 사전에 넣어야 한다. 현재 설계의 기본값은 효능 중간검정 없음이다.

## 8. 비용·호출 상한

slot cap만으로는 비용을 통제할 수 없다. planner, judge, solver, repair, explanation call이 full-question slot 밖일 수 있기 때문이다. 각 phase/batch는 실행 전에 다음 세 상한을 모두 가져야 한다.

1. `attemptSlotCap`: 위 표의 영구 소비 상한
2. `physicalCallCap`: policy별 최악 호출 그래프와 retry 상한의 합
3. `usdCap`: model별 max input/output tokens × 실행 시점 공식 단가를 모든 허용 call에 적용한 보수적 예약

STANDARD와 PREMIUM, generator/planner/gate/repair/evaluator를 각각 분리한다. 실패·timeout·unknown billing도 0원으로 쓰지 않는다. `cost/ship-ready`의 분모가 0이면 `∞`로 기록한다. 평가 call이 slot에 포함되지 않더라도 physical call과 USD cap에는 반드시 들어간다.

P2A/P2B에서는 matched CURRENT 대비 비용이 2배를 넘는 순간을 기록하되, “품질 이득이 없어 보임” 같은 임의 판정으로 선택하지 않는다. 중단 규칙을 쓰려면 예를 들어 shipReadyITT·craft·cost의 어느 수치 조합을 지배로 볼지 registry에 먼저 정해야 한다. 현재 문서에는 사업상 willingness-to-pay가 없으므로, 비용 상승과 품질 상승이 교환되는 arm을 임의 가중합으로 승격할 수 없다.

## 9. route parity와 robustness의 해석

P6은 격리 research academy의 실제 fast route로 25유형×2플랜을 한 번씩 통과시킨다. 같은 type의 두 plan은 같은 passage와 difficulty를 쓰되 호출 순서를 무작위화하고 실제 최근 40문항 diversity context, requested/effective plan, served model, billing, persistence, workbench/paper/tablet/scoring answer parity를 기록한다. 셀당 1개이므로 plan 품질 비교가 아니라 통합 결함 탐지다. Trigger 결과와 합치지 않는다.

P7은 robustness queue 20개를 type×plan 네 셀에 5개씩 고정 배정한다. 명백한 corruption은 source preflight에서 0-call 차단되는 것이 성공이다. preflight를 통과한 borderline 입력만 최대 20 full-question slots 안에서 실행한다. clean benchmark의 품질률과 합치지 않고, unsafe generation·올바른 abstention·false block을 별도로 보고한다.

## 10. registry에 추가해야 할 실행 전 체크리스트

- 위 9개 phase의 exact allocation과 합계 998, 미배정 2
- 각 phase의 corpus manifest hash, randomization seed, passage 적합성·수동 감사 상태
- 각 policy의 prompt/schema/gate/model-role/reasoning/retry digest
- focus G60/B60의 prior-use 0 및 모든 기존 split과 hash-disjoint 증명
- P2A nested constraint 목록과 density 계측값
- P2B factorial cell table과 plan-balanced assignment
- dev winner 선택 규칙 및 business cost trade-off 상한
- holdout의 두 1차 가설, Holm 절차, 계층적 beautiful 가설
- passage-cluster 분석 코드 hash와 no-candidate ITT 처리
- phase별 physical-call cap 및 USD cap
- P2/P3 safety stop, P8 repair eligibility/hash order
- holdout open 이후 prompt·gate 수정 금지와 실패 시 holdout 재사용 금지

## 11. 최종 적대적 결론

이 설계도 998개를 모두 쓰면 자동으로 “아름다운 문제”를 증명하지 않는다. P1/P5/P6은 넓은 커버리지의 sentinel이고, 품질률 추정 표본이 아니다. 실제 확증 주장은 KILLER 어법·빈칸의 동결 winner에 한정된다. BASIC/INTERMEDIATE나 나머지 23유형에 대해 품질률을 주장하려면 별도 독립 표본이 필요하다.

가장 위험한 오류는 다음 네 가지다.

1. 150 outputs를 150 독립 표본으로 세는 것
2. P3의 plan별 30개를 STANDARD/PREMIUM 각각의 확증으로 부르는 것
3. parse 실패와 gate reject를 분모에서 빼 품질률을 부풀리는 것
4. dev에서 수십 가설을 본 뒤 같은 holdout을 반복 사용하면서 p-value 하나를 승자로 제시하는 것

현재 corpus를 그대로 쓰는 것보다 focus panel을 먼저 보강하는 편이 API slot과 비용을 아낀다. 위 blocker가 닫히지 않은 상태에서는 첫 호출을 미루는 것이 연구 지연이 아니라 잘못된 결론과 1000-slot 낭비를 막는 필수 단계다.
