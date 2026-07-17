# Phase-C campaign v4

상태: **설계 완료 / 실행 차단**. 이 디렉터리는 API 호출 권한을 만들지 않는다. 캠페인 사용량은 `0/1,000`이며 operational candidate slot은 0이다.

## 결론부터

현재 증거로는 사용자가 요구한 **현행 production-policy와 완전히 동일한 25유형 전 coverage**를 1,000 full-question candidate 상한 안에서 보장할 수 없다.

- 마지막 독립 callgraph 감사는 이미 `FAIL_BLOCKED`였고, 이후 `question-repair`와 PREMIUM 어법 사다리 소스가 다시 바뀌었다.
- 그 낡은 감사만 보수적으로 써도 25유형×2플랜의 assignment 하나씩에 대한 physical-call envelope는 `12,879`다. 각 stage의 candidate-capable 상한이 별도로 증명되지 않았으므로 전체 queue 선예약의 1,000 candidate admission 근거가 되지 못한다.
- retry를 임의로 1~3회에서 자르면 비용은 줄지만 추정대상은 더 이상 production policy가 아니다.

따라서 [campaign-v4.json](./campaign-v4.json)은 두 레지스트리를 분리한다.

1. `productionParityRegistry`: 현행 전체 정책을 그대로 보존한다. 전체 queue 선예약은 불가/미증명이고, 한 assignment씩 순차 admission하는 방식은 조건부 가능하지만 현재는 **BLOCKED / authorization 0**이다.
2. `reducedRegistry`: 정확히 한 candidate-capable HTTP 기회만 허용하는 **bounded single-shot core**. 이는 production yield가 아닌 별도 추정대상이며, 모든 hold가 닫힌 뒤에만 조건부 실행 가능하다.

두 registry는 같은 1,000 cap의 **상호배타적 대안**이다. 하나를 열고 남은 실제 용량을 다른 하나에 넘길 수 없다.

## Production parity의 두 admission regime

모든 assignment의 worst-case envelope를 첫 호출 전에 합산하는 `UPFRONT_ALL_ASSIGNMENTS`는 현재 불가/미증명이다. 하지만 ledger에는 더 좁은 순차 regime이 있다.

1. assignment 하나를 batch 하나에 담고 candidate/physical/USD 최악 envelope 전체를 예약한다.
2. assignment close 자체는 미사용 candidate envelope를 풀지 않는다.
3. call·parser·gate·clone·billing이 모두 terminal인 뒤 `finalizeBatch`가 `released_slots = allocated - actually used`로 기록한다.
4. phase/campaign committed 계산은 finalized release를 빼므로 다음 **고정 queue row**의 whole envelope를 예약할 수 있다.

따라서 fresh audit에서 개별 assignment envelope가 remaining cap 이하임을 증명하면, admitted row는 retry/repair/salvage를 자르지 않은 full production policy를 탈 수 있다. 단, 앞선 실제 사용량 때문에 다음 row admission 여부가 달라진다. 설계는 25유형×2플랜×3난도의 150행을 세 wave로 고정하고, 다음 row가 안 들어오면 그것과 이후 전부를 `budget_not_admitted` ITT 실패로 남긴다. 작은 envelope row를 건너뛰어 실행하거나 순서를 바꾸지 않는다. 같은 type-difficulty의 STANDARD/PREMIUM은 passage를 공유해 75 passage cluster(빈칸 3, 어법 3, 비focus committed DB 69)를 쓰는 제안이며, 수량은 맞아도 실제 type suitability·rights·source-binding audit 전에는 queue가 아니다.

이 regime은 production path fidelity를 일부 관측할 수 있지만 **25유형 coverage를 보장하지 않고**, admitted-only 품질률은 앞선 소비량에 조건화돼 편향된다. 150행 전체 ITT만 정직하며, 현재 source-current candidate envelope와 provider fresh PASS가 없어 여전히 실행 불가다. symbolic assignment queue hash는 `c8666fd6d745774aedc8976e4ebc2e9ae9e7a9587824f1f2608498f9e98e868e`다.

## 정확한 reduced 배분

| 구분 | candidate slots |
|---|---:|
| D1 전 25유형 CURRENT sentinel | 150 |
| D2 어법·빈칸 4-profile pilot | 160 |
| C0 동결 정책 robustness gate | 120 |
| C1 어법·빈칸 paired holdout | 368 |
| C2 전 25유형 release sentinel | 150 |
| C3 stochastic repeatability | 12 |
| 실행 가능 합계 | **960** |
| 영구 잠금·재배분 금지 | **40** |
| 사용자 hard cap | **1,000** |

집계는 다음과 같다.

- 유형: `BLANK_INFERENCE` 342, `GRAMMAR_ERROR` 342, 나머지 23유형 각 12.
- 플랜: STANDARD 480, PREMIUM 480.
- 난이도: BASIC 240, INTERMEDIATE 288, KILLER 432.
- 모든 assignment는 한 candidate slot이다. design/solver는 candidate slot 0이지만 physical call·token·USD에 포함한다.
- timeout, malformed JSON, parser failure, gate rejection, no-candidate도 slot을 반환하지 않는다.
- 어느 phase가 중단돼도 뒤의 slot은 다른 유형·arm·지문으로 top-up하지 않는다.

## 코퍼스가 실제로 허용하는 범위

원 v3 추정대상은 여전히 불가능하다.

- strict central-long blank: 59 vs 요구 queue 262.
- committed DB: 154 vs disjoint queue 요구 973.

Reduced registry는 추정대상을 공개적으로 바꿔서만 공급 산술이 맞는다.

| 분리 population | 가용 | 선택 | 용도 |
|---|---:|---:|---|
| strict central-long blank | 59 | **59** | dev 10 / holdout 46 / robustness 3 |
| focus grammar KILLER pool | 599 | 71 | dev 10 / holdout 46 / robustness 15 |
| committed DB eligible | 154 | 23 | 비focus 전유형 sentinel 전용 |
| long local/no-pivot blank | 43 | 6 | 별도 robustness estimand |
| short 120–149 blank | 300 | 6 | 별도 robustness estimand |

strict blank 59개를 전부 쓰므로 reserve가 0이다. 실제 source binding 전에 한 개라도 독립 human corpus audit에서 탈락하면 이 reduced registry도 실행 불가다. alternative blank 12개는 strict blank 결과와 절대 합치지 않는다.

## Pilot → confirmatory

D2는 네 profile을 같은 passage-plan complete block으로 비교한다. profile 구현은 D1 전에 모두 hash-freeze해야 하며 결과를 본 뒤 좋은 조각을 합성할 수 없다. 어법과 빈칸은 각각 하나의 conceptual profile을 고르고, 두 plan에 동일하게 적용한다. plan별 winner 선택은 금지한다.

사전 규칙상 challenger가 CURRENT보다 fatal이 많거나, 한 plan의 ship-ready가 10%p 초과 하락하거나, 비용비가 1.25를 넘거나, p95 지연비가 1.35를 넘으면 탈락한다. 최소 `beautiful-ITT +2`, `ship-ready-ITT +2` 성공이 없으면 STOP한다. STOP 후 confirmatory 650 slots는 영구 미사용이다.

C1의 독립 단위는 assignment 184개/type가 아니라 **46개 passage cluster/type**다. 각 passage에 CURRENT/SELECTED×STANDARD/PREMIUM 네 관측이 있고, CURRENT-first/SELECTED-first는 type-plan마다 23/23이다. 같은 passage를 92개의 독립 표본으로 세지 않는다.

## 평가와 통계

- Primary safety: focus type별 `shipReadyItt` risk difference의 비열등성, margin `-0.05`.
- Primary craft: focus type별 `beautifulItt` 우월성. 승격에는 통계 통과와 point improvement `>=0.10`이 모두 필요하다.
- Fatal gate: C0+C1 SELECTED의 deterministic false acceptance 0건. 0건이어도 exact one-sided 95% 상한을 반드시 보고한다.
- Cost gate: actual USD/attempt 비율 one-sided 95% 상한 `<=1.25`; p95 latency ratio `<=1.35`.
- Passage-cluster bootstrap 100,000회, 고정 seed. safety 두 유형은 Holm one-sided family alpha .025, 통과 뒤 craft 두 유형도 Holm .025, 비용도 별도 Holm .025.
- 나머지 secondary endpoint는 type 안에서 BH FDR .10. 전유형 sentinel에는 p-value를 붙이지 않는다.

두 독립 평가자는 key·policy·plan·model·phase를 보지 않고 먼저 답과 유효 답안 집합을 봉인한다. 이후 key와 해설을 보고 V4/V5·공예를 평가한다. 모든 답/등급/V 불일치, fatal false acceptance, concordant 20% 고정 표본은 제3 평가자가 판정한다. fatal Gwet AC1 `<0.70` 또는 ordinal Krippendorff alpha `<0.67`이면 C1 전수 제3평가 없이는 확증으로 부르지 않는다.

## 비용 envelope

Reduced registry도 값싼 캠페인이 아니다. 현재 **오래된** OpenRouter 가격 snapshot과 제안 token cap으로 계산한 보수 상한은 다음과 같다.

- candidate calls 960, design 382, solver 342, 합계 physical calls 1,684.
- input token cap 107,776,000; output token cap 13,748,416.
- stale-price raw envelope `$602.2698624`; 증명되지 않은 10% 여유를 붙인 산식은 `$662.50`, phase별 cent 올림을 합친 임시 campaign cap은 `$662.52`.

이는 예상비용이 아니라 최악 reservation envelope다. 가격은 operational registry seal 직전 15분 이내 재수집해야 하고, provider allow-list의 최고가·추가 fee·BYOK·할인·server overhead까지 증명해야 한다. 별도의 provider-side hard spend ceiling도 필수다. D1/D2 실측 projected mean이 STANDARD `$0.10/attempt`, PREMIUM `$0.25/attempt`를 넘으면 남은 phase를 실행하지 않는다.

## 실행 전 절대 hold

다음이 모두 PASS가 되기 전에는 canonical registry를 만들지 않는다.

1. provider/controller/parser/recovery/pricing/bypass/close의 fresh independent PASS.
2. 현재 source closure에 대한 새 callgraph와 candidate-capable stage envelope.
3. 960 symbolic rows를 실제 private source ID에 결합한 queue hash와 독립 corpus audit.
4. 네 profile, prompt/schema/gate/solver/parser/rubric의 immutable hash.
5. 15분 이내 price recapture, overhead 증명, provider-side spend cap.
6. requested/effective/served model·provider·reasoning-off·deployment hash 일치.

## 검증

```powershell
node experiments/question-quality-20260715/design/campaign-v4/verify.mjs
```

검증기는 960개 symbolic slot을 메모리에서 펼쳐 25유형/플랜/난이도/phase/코퍼스 산술, 23/23 order balance, call/token/USD 산식, upstream pricing file hash와 symbolic queue hash를 재계산한다. PASS는 **설계 불변식만** 뜻하며 실행 승인이 아니다.
