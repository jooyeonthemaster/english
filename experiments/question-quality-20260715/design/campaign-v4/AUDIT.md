# Adversarial audit — Phase-C campaign v4

감사 시각: 2026-07-15 KST  
외부 모델/API 호출: 0  
DB 호출·write: 0 / 0  
프로덕션 변경: 0  
캠페인 사용량: **0/1,000**

## 판정

| 질문 | 판정 |
|---|---|
| 현행 production policy로 25유형 전 coverage를 1,000 candidate cap 안에서 보장할 수 있는가? | **NO / 전체 queue 선예약 불가·미증명** |
| 한 assignment씩 terminal finalize 후 다음을 admission하는 production 순차 sentinel은 가능한가? | **구조상 조건부 가능 / 현재 envelope·provider 미감사로 BLOCKED** |
| 기존 59 strict blank + 154 committed DB가 원 v3 추정대상을 충족하는가? | **NO / 수학적 공급 부족** |
| 추정대상을 명시적으로 bounded single-shot core로 바꾸면 정확한 cap-safe 배분이 가능한가? | **YES, 960 executable + 40 permanently locked** |
| 그 reduced registry가 지금 API를 호출해도 되는가? | **NO / provider·source binding·profile·price hold 미종결** |
| 이 설계가 생산 품질률 또는 route parity를 추론하는가? | **NO** |

최종 판정은 `DESIGN_COMPLETE_EXECUTION_BLOCKED`다. 이 문서는 실행 허가가 아니라, 무엇이 현재 불가능하고 어떤 별도 추정대상만 조건부 실행 가능한지를 고정한다.

## 1. 사용한 고정 증거

- 활성 영어 UI 유형 25개와 기준선: `baseline-evidence.json`.
- v3 pinned input snapshot: `c21777c8dcab7f6b46ed15e429fcb7840607e90bcbdd7c02ec607a8db02beb13`.
- v4 semantic snapshot: `5346734a689d67aaa425daff3b17c3a7b910b741f25e7f8a2e1c79cfac0d01f6`.
- v4 DB extract: `aa692b32fa8aa381d682b7980e5530bb5ec2962e88dac1e50b3d88fc9dc0b86b`.
- v4 DB record set: `32649133ce7cf2f850bed598175922c527cb5f7eaebde97175eabba236a459d1`.
- v4 dependency manifest: `ddb235f236839f95bd8cd09fbfe624216ebb348ecdcc83a4d061ab68b507e0a8`.
- 마지막 독립 callgraph JSON: `6d4bc14eed634574b77bd27e33fd668d0450714a5535eed6ab2600ed2cd15066` — 판정 자체가 `FAIL_BLOCKED`이고 현재 source에는 stale이다.
- OpenRouter price artifact raw hash: `4b8c0cf36d3bca226e6ce824fa566ef96e496c384cb37256a987247332cc73e3`; 내부 snapshot hash `9e5557f0fa0c69105ade2668a1c84468b1ab8644b8adab167a8507cdb2a17869`. 2026-07-14 fetch이므로 실행 가격 증거로는 stale이다.

## 2. Finding F1 — production-identical의 전 coverage와 순차 admission을 구분해야 한다

마지막 독립 callgraph에서 활성 25유형에 STANDARD/PREMIUM assignment를 하나씩만 배치한 보수 physical envelope는 다음과 같다.

| plan | 25 assignment physical envelope |
|---|---:|
| STANDARD | 8,559 |
| PREMIUM | 4,320 |
| 합계 | **12,879** |

세 난이도를 그대로 반복하면 38,637이다. physical call과 candidate slot은 같은 단위가 아니므로 이 숫자만으로 실제 candidate가 12,879개라고 주장하지는 않는다. 문제는 현재 감사가 **각 stage 중 무엇이 candidate-capable인지에 대한 source-current 상한을 제공하지 않는다는 것**이다. 따라서 모든 assignment의 최악 envelope를 처음부터 합산하는 upfront regime으로는 전 coverage를 보장할 수 없다.

또한 audit 이후 PREMIUM 어법 사다리의 reasoning-on fallback이 제거되어 과거 `L=81`, PREMIUM 어법 `432`는 current 값이 아니다. `question-repair`도 drift했다. 낡은 숫자를 작게 보정해 실행 허가에 쓰는 대신, source closure를 다시 고정한 독립 callgraph를 요구한다.

그러나 ledger 소스는 다른 regime도 허용한다.

- 같은 open batch에서는 closed assignment도 `maxCandidateOutputs`를 committed로 계속 합산하며, assignment close audit은 `capacityReleasedForQueueTopUp=false`다. 즉 assignment 도중/직후 미사용 최악 용량으로 다른 row를 top-up할 수 없다.
- assignment 하나를 batch 하나에 두고 evidence·billing까지 terminal close한 뒤 `finalizeBatch`하면 `released_slots = allocated_slots - used`다.
- phase/campaign committed slot은 `SUM(allocated_slots - released_slots)`이고, finalized physical/USD capacity도 실제 call/cost로 축소된다. 따라서 다음 고정 assignment batch의 whole envelope를 순차 admission할 수 있다.

이 순차 방식은 새 source-current envelope에서 **개별 assignment**가 remaining cap 이하이면 full production policy row를 실행할 가능성을 만든다. 하지만 앞선 실제 candidate 소비량이 다음 row admission을 결정한다. 이를 결과에 따른 좋은 row 선택으로 바꾸지 않기 위해 150행(25유형×2플랜×3난도)을 세 wave로 고정하고, 다음 row가 들어오지 않으면 그 row와 이후 전부를 `budget_not_admitted` ITT failure로 처리해야 한다. skip·reorder·작은 envelope 우선·다른 지문 top-up은 금지다. 같은 type-difficulty의 두 plan을 한 passage에 묶으면 필요한 unique cluster는 blank 3, grammar 3, nonfocus committed DB 69로 수량상 가용 범위 안이지만, type suitability·rights·private source binding은 별도 감사가 필요하다.

따라서 admitted row에는 production path fidelity가 있지만 전 25유형 coverage는 보장되지 않는다. admitted-only 품질률은 앞선 사용량에 조건화되어 선택편향이 있으므로 보고 금지다. 전체 150 ITT에서는 unadmitted를 ship-ready=0으로 센다. symbolic assignment queue hash는 `c8666fd6d745774aedc8976e4ebc2e9ae9e7a9587824f1f2608498f9e98e868e`다.

retry·repair·salvage를 자른 reduced 정책은 이와 다른 추정대상이다. 두 registry는 같은 cap의 상호배타적 대안이며, 어느 한쪽의 관측 미사용량을 다른 쪽으로 넘기지 않는다. 현재는 fresh candidate envelope와 provider integration PASS가 없으므로 둘 다 authorization 0이다.

## 3. Finding F2 — 원 코퍼스 추정대상은 공급 부족이다

| 원 target | 가용 | 원 요구 | gap |
|---|---:|---:|---:|
| strict central-long blank | 59 | 262 | 203 |
| committed DB disjoint queues | 154 | 973 | 819 |

59개를 262개로, 154개를 973개로 부르는 통계 방법은 없다. alternative blank, DRAFT extraction, customer-upload exam을 섞으면 모집단이 바뀐다. 이 감사는 해당 strata를 분리하고 원 v3 certification을 `INFEASIBLE`로 유지했다.

## 4. Finding F3 — reduced registry는 추정대상을 공개적으로 바꾼 경우에만 공급 산술이 맞다

Reduced registry는 `one candidate-capable physical call, maxRetries=0, full repair/fallback=0`인 bounded single-shot core다. 공급은 다음처럼 쓴다.

- strict blank 59 전부: dev 10 + holdout 46 + strict robustness 3.
- focus grammar pool 599 중 71: dev 10 + holdout 46 + robustness 15.
- committed DB 154 중 23: 비focus 23유형 sentinel 전용.
- 별도 blank strata: long-local/no-pivot 6, short 120–149 6. strict 결과와 pooling 금지.

따라서 reduced design은 **supply-feasible**이지만 original estimand를 보존하지 않는다. strict blank reserve가 0이므로 source binding 전 human audit에서 하나라도 탈락하면 registry 전체를 재설계해야 한다. 결과를 본 뒤 대체하는 것은 금지다.

## 5. Finding F4 — 960+40 산술은 정확하고 모든 유형을 실제로 건드린다

Verifier가 펼치는 symbolic queue는 960행이다.

| 축 | 배분 |
|---|---|
| 유형 | blank 342, grammar 342, 나머지 23유형 각 12 |
| plan | STANDARD 480, PREMIUM 480 |
| 난이도 | BASIC 240, INTERMEDIATE 288, KILLER 432 |
| phase | D1 150, D2 160, C0 120, C1 368, C2 150, C3 12 |
| cap | executable 960 + locked 40 = 1,000 |

40 slots는 비상 top-up pool이 아니다. ID만 고정된 비실행 영역이며 영구 재배분 금지다. API 실패·timeout·no-candidate·parser failure·human rejection도 executed slot을 반환하지 않는다.

모든 25유형은 D1과 C2에서 plan×difficulty 여섯 cell을 각각 받으므로 총 12 slots/type다. 그러나 같은 dedicated passage를 반복 사용한 sentinel이므로 nonfocus 유형별 품질률이나 population 평균을 계산할 수 없다.

Symbolic queue hash는 `dd8f951b93f3687ed27980bc28433d52775064b1cda1986a24b53891e689787d`다. 이는 실제 passage ID binding hash가 아니다. private source binding과 독립 감사가 없으므로 현재 operational queue는 존재하지 않는다.

## 6. Finding F5 — pilot adaptation은 고정할 수 있지만 표본은 작다

D2는 focus type별 profile당 20 passage-plan 관측이다. 네 profile 비교는 screening이지 p-value 기반 확증이 아니다. 결과를 본 뒤 prompt를 합성하지 못하도록 모든 profile 구현을 D1 전에 고정하고, 유형별 하나의 conceptual profile을 두 plan에 함께 적용한다.

정해진 threshold를 못 넘거나 CURRENT가 이기면 STOP한다. confirmatory slot을 다른 실험으로 바꾸지 않는다. 이 규칙은 cap-safe하지만, n=20 winner selection의 불확실성과 winner's curse는 C1에서 독립적으로 검증해야 한다.

C1은 focus type당 184 assignment이지만 독립 passage cluster는 46개다. 92 policy pairs를 독립 n으로 세면 안 된다. 46 clusters는 큰 효과만 확인하는 설계다. 작거나 중간인 개선은 inconclusive일 가능성이 크며, inconclusive를 equivalence 또는 성공으로 부를 수 없다.

## 7. Finding F6 — endpoint와 multiplicity는 사전 고정됐지만 “오류 0”을 증명하지 않는다

Primary family는 다음 순서다.

1. grammar/blank ship-ready ITT noninferiority, margin -5%p, Holm one-sided family alpha .025.
2. 둘 다 통과할 때만 grammar/blank beautiful ITT superiority, Holm one-sided family alpha .025; promotion은 point improvement +10%p도 요구.
3. cost ratio upper one-sided 95% bound <=1.25와 p95 latency ratio <=1.35, 비용 family Holm .025.
4. SELECTED fatal false acceptance 관측 0건.

0 fatal은 모집단 risk 0이 아니다. cluster-aware uncertainty와 exact descriptive upper bound를 함께 보고한다. 어떤 secondary endpoint도 primary failure를 구제하지 못한다.

## 8. Finding F7 — 독립 평가와 신뢰도 실패 경로가 명시됐다

두 평가자는 stored key와 generator identity 없이 먼저 독립 답·대안 답·V1–V3를 봉인한다. 이후 key와 해설로 V4–V5·C1–C6·등급을 평가한다. 제3자는 모든 answer/V/grade disagreement, fatal false acceptance, concordant 20% seed-fixed 표본을 판정한다.

희귀 fatal에서 kappa만 쓰는 prevalence paradox를 피하기 위해 Gwet AC1·raw/positive/negative agreement를 같이 보고한다. grade는 ordinal Krippendorff alpha와 weighted kappa, craft는 absolute-agreement ICC를 쓴다. fatal AC1 <.70 또는 ordinal alpha <.67이면 C1 전체 제3평가 없이는 confirmatory label을 붙이지 않는다.

## 9. Finding F8 — 비용 상한은 크고, 현재 숫자는 실행 승인이 아니다

Reduced policy의 exact provisional operation count는 candidate 960 + design 382 + solver 342 = physical 1,684다. 제안 hard token cap은 physical call당 input 64k, candidate output 12k, design 4k, solver 2,048이다.

Stale snapshot 최고 endpoint rate로 계산하면 raw token envelope는 `$602.2698624`다. 10%를 임의로 더한 산식은 `$662.50`이고, phase별 cent 올림을 합친 임시 campaign cap은 `$662.52`다. 이것은 overhead가 충분하다는 증명이 아니다. 특히 input 64k도 prompt census의 61,784 **문자** 하한에서 온 제안값이지 tokenizer proof가 아니다.

따라서 실행 전 다음이 필요하다.

- sealed request 전수 tokenization과 64k pre-network rejection;
- 15분 이내 endpoint/price recapture;
- allow-listed provider 최고가, fee, server overhead, discount/BYOK 정책 증명;
- local lease와 별도의 provider-side hard spend ceiling;
- phase별 billing reconciliation 후에만 다음 phase admission.

D1/D2 projected actual mean이 STANDARD `$0.10/attempt`, PREMIUM `$0.25/attempt`를 넘으면 남은 slots를 태우고 중단한다. 표본을 줄여 싼 부분만 이어가지 않는다.

## 10. 남은 BLOCKER

1. provider/controller/parser/recovery/pricing/bypass/controller-close fresh audit PASS.
2. current source-closed callgraph와 stage별 candidate-capable envelope.
3. 실제 source binding 960행과 private/public queue hashes, rights/provenance human audit.
4. 네 profile 및 prompt/schema/gate/solver/parser/rubric hashes.
5. current price proof와 provider-side spend cap.
6. requested/effective/served model·provider·reasoning-off·deployment 일치.

하나라도 없으면 operational registry creation은 금지다.

## 재현

실행:

```powershell
node experiments/question-quality-20260715/design/campaign-v4/verify.mjs
```

예상 판정:

```text
PASS_DESIGN_INVARIANTS_ONLY_EXECUTION_REMAINS_BLOCKED
```

검증기의 PASS는 JSON 산술·symbolic queue·가격 산식의 내부 일관성만 뜻한다. API readiness PASS가 아니다.
