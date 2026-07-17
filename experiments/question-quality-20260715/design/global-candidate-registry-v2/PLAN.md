# 전역 1,000-candidate registry v2

상태: **사전 배정 설계 / 실행 권한 아님 / 현재 소비 0**

`full-question candidate`는 provider가 완성 문항 객체를 출력할 한 번의 기회다.
answer-only, solver, explanation-only 호출은 이 숫자와 별도로 model-call/token/USD
원장에 전부 기록한다. 후보 상한을 지켰다는 이유로 물리 호출과 비용 상한이
자동으로 증명되지는 않는다.

## 고정 배정

| 단계 | 목적 | full-question candidate 상한 |
|---|---|---:|
| C0 | Standard→Premium 2-call 연결성 | 2 |
| S1 | 어법·빈칸 4-profile 개발 screen | 180 |
| S2 | 선택 profile vs control, 독립 20-passage single-shot holdout | 480 |
| S3 | 23개 비집중 유형 4-cell sentinel | 92 |
| S4 | 선택 profile의 direct-core vs bounded production-route parity | 144 |
| S5 | 어법 CORE-10·빈칸 7축 고위험 stress grid | 102 |
| 합계 | 절대 registry 상한 | **1,000** |

이 표는 “1,000개를 반드시 소모한다”는 뜻이 아니다. 선행 gate가 실패하면 해당
단계는 열리지 않고 그 슬롯을 다른 유망해 보이는 실험으로 사후 재배정하지 않는다.
따라서 실패·무효·NO_ARM에서 멈추는 것이 무지성 top-up보다 우선한다.

## 단계별 식

### C0 — 2

한 지문, BLANK_INFERENCE INTERMEDIATE, B0 control에서 Standard 1회 뒤
Premium 1회다. 두 번째 호출은 첫 번째가 terminal success일 때만 열린다.
retry/repair/replacement/top-up은 0이다. 연결성·route·usage·schema 증거만
확인하며 품질 비교에는 쓰지 않는다.

### S1 — 180

- 어법: `4 profiles × 2 plans × 2 difficulties × 6 passages = 96`
- 빈칸 Standard: `4 × 2 × 6 = 48`
- 빈칸 Premium: `3 distinct profiles × 2 × 6 = 36`

모든 행은 direct production-core compiler를 거치는 one candidate / no retry
mechanism screen이다. 이는 production topology parity가 아니다. n=6 cluster의
craft 점수로 arm을 순위화하지 않고, 사전 고정된 safety·binding·cost gate와
우선순위로 최대 한 arm만 다음 단계에 보낸다.

### S2 — 480

유형별 `2 profiles(control, selected) × 2 plans × 3 difficulties × 20 unseen
passage clusters = 240`, 두 유형 합 480이다. 각 행은 one-candidate single-shot이다.
passage가 교차되므로 분석 단위는 후보 행이 아니라 passage cluster다.

S1에서 안전 arm이 없거나 control이 무너지면 해당 유형 240은 열리지 않는다.
S2는 prompt/schema mechanism의 확인 실험이며 production retry/ladder 효과를
주장하지 않는다. fatal-free 비열등성, A/B superiority, cost-per-A/B를 함께
보고 어느 하나라도 실패하면 현행을 유지한다.

### S3 — 92

집중 유형을 제외한 23개 각 `STANDARD_BASIC`, `STANDARD_KILLER`,
`PREMIUM_BASIC`, `PREMIUM_KILLER` 4행이다. 총 92. 결함 하나는 존재 증거지만
clean 4행은 유형 수준의 오류율·모델 우열·출하 안전성을 증명하지 않는다.

### S4 — 144

선택 profile만 대상으로 `2 types × 2 plans × 3 difficulties × 3 passages = 36`
paired cells를 만든다. 각 cell은 direct-core 1 candidate와 동일 입력의 실제
route 최대 3 candidates를 짝지어 총 `36 × (1+3) = 144`다.

이 단계는 다음이 먼저 구현·감사된 경우에만 열린다.

- 모든 실제 consumer가 공유하는 assignment candidate cap 3
- provider work durable idempotency와 crash replay 방지
- failed/unknown call의 후보·token·effective cost 귀속
- exact served model/route/price/deployment provenance

세 passage는 route integration에서 생기는 결함을 찾는 sentinel이지 작은 성능
차이의 통계 검정이 아니다.

### S5 — 102

- 어법: `10 CORE point families × 2 plans × 3 difficulties = 60`
- 빈칸: `7 proposition axes × 2 plans × 3 difficulties = 42`

각 행은 서로 다른 original source frame을 쓰는 one-candidate stress probe다.
목적은 평균점수를 올리는 것이 아니라 retained-object passive, clause analysis,
voice/participle, complement, parallelism과 actor/polarity/condition/causal/scope/
stance/time 축의 희귀 치명 결함을 노출하는 것이다. 셀 하나가 clean해도 그
오류군이 없다고 결론내리지 않는다.

## 비용과 실행 gate

- C0의 현 예시 상한은 약 $0.615지만 fresh endpoint price와 exact wire로 다시
  계산해야 한다.
- S1의 봉인 planning ceiling은 $99.1229184다.
- S2~S5는 exact body, fresh price, served-model attestation, physical-call envelope가
  모두 봉인되기 전까지 USD ceiling이 `null`이며 실행 불가다.
- 각 단계는 전체 queue의 worst-case candidate/physical/USD를 먼저 reserve한다.
  부분 실행 뒤 표본을 줄여 성공처럼 보고하지 않는다.
- Standard/Flash와 Premium/Pro 비용, latency, failure, parse, fatal-free, A/B를
  분리하고 ship-ready 1개당 총비용을 일차 경제 지표로 쓴다.

## 평가 gate

모든 문항은 저장 정답을 보기 전에 독립적으로 푼다. 정답 다중성, 비문,
source/surface/scoring 불일치, false explanation 중 하나라도 확정되면 F다.
A는 valid를 넘어 모든 visible element가 서로 다른 오개념을 겨냥하고,
KILLER의 정답은 명백하면서 네 오답이 passage-grounded near miss인 경우에만
부여한다. 평가자 codebook과 gold가 식별 가능성 검증을 통과하지 못하면 API
표본을 먼저 만들지 않는다.

