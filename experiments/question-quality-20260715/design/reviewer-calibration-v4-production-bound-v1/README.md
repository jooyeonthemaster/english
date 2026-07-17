# Reviewer Calibration v4 — production-bound packet

**DESIGN / UNISSUED / OFFLINE**

이 디렉터리는 실제 문항·정답·gold·평가자 제출을 담는 실행 결과가 아니라, 실행 전에 봉인하는 캘리브레이션 계약이다. 현재 상태는 `ledger 0`이며 외부 네트워크, 모델, DB, 비밀키, trusted-gold 접근은 모두 0이다.

## 정정된 규범 계보

- 평가 방법론과 임계값은 `reviewer-calibration-v3-replacement-v1`에 exact-bind한다.
- 프로덕션 25개 UI 유형, 그중 비집중 23개 유형, 8개 family, 회전식은 오직 `reviewer-calibration-v3-production-type-binding-v2`에 exact-bind한다.
- binding v1은 선언식과 검증식이 달라 실행 불가다. v4에는 v1 실행 경로가 없다.
- 정정식은 main `((epoch - 1) mod n)`, holdout `((epoch - 1 + ceil(n / 2)) mod n)`이다. 식, 물질화된 행, 접촉 커버리지를 같은 `selectedAt` 함수로 검증한다.
- 단일 epoch의 main+holdout 접촉은 16/23이다. 2개 epoch의 main+holdout 또는 4개 epoch의 main-only가 23개를 접촉하지만, 접촉은 인증이 아니다.

## 사전 커밋된 표본과 빈 슬롯

- taxonomy pilot 12: GRAMMAR 4, BLANK 4, NONFOCUS 4. 본 인증 커버리지에는 산입하지 않는다.
- main 24: 각 블록 8개, 블록별 A/B/C/F를 각각 2개로 구성한다.
- fresh holdout 24: 각 블록 8개, 블록별 fatal 4·nonfatal 4이며 pilot/main/과거 holdout과 분리한다.
- 목표 anchor slot은 총 60개다. 후보 슬롯은 9개 stage/block stream마다 64개, 총 576개이며 아직 모두 비어 있다.
- 작성 brief에는 목표 grade/fatal, 정답, 평가자 신원, composition cell을 넣지 않는다. 결과를 본 뒤 재분류·증거 수정·후보 건너뛰기를 금지한다.

후보는 커밋된 ordinal 순서로만 연다. 필요한 조성과 family/type 제약을 처음 만족하는 가장 짧은 prefix를 고정하고, 그 안에서 사전식으로 가장 작은 후보 ordinal tuple을 선택한다. 64개까지 채우지 못하면 기준을 느슨하게 하지 않고 packet version을 실패시킨다.

## 정답 공간과 블라인드 평가

모든 후보는 독립 작성, schema/rights preflight, domain preflight, blind solver 2인, evidence adjudication, scorer seal을 통과해야 한다. 작성자·저장 정답·다수결 중 어느 것도 단독 권위가 아니다. surface를 고치면 기존 후보를 수정하지 않고 새 tail slot을 사용한다.

어법 구성형 scorer는 exact-text 정답 열거가 아니다. 발문 문법성, 진단, 허용 문법 포인트 family, 필수·금지 문법 특징, 보존할 의미 명제, 금지 의미 변화, 원문 복원 predicate, 해설 진실 predicate를 발행 전에 닫아 둔다. 새로운 표현도 이 폐쇄 제약을 모두 만족하면 통과할 수 있고, 발행 후 제약을 덧붙여 gold를 넓힐 수 없다.

빈칸 scorer는 봉인된 7축 proposition-vector다: actor/target, polarity, condition/modality, causal direction, scope/quantifier, stance, temporal relation. 각 선지는 문법 적합성, 지문 근거, 축별 관계, 결정축, 함정 mechanism, cheap giveaway를 기록한다. 진단 문구의 exact match나 단일 primary-intent를 강제하지 않는다.

## 접근 provenance

콘텐츠를 열기 전에 `pre-access` authorization event가 먼저 해시 봉인되어야 한다. 이후 receipt는 동일 resource hash와 capability token, `authorizedAt < openedAt <= closedAt`, 이전 event hash를 결속한다. 다른 평가자 제출, 작성자 가설, rejection history, adjudication draft는 phase-2에서 거부한다. 늦게 만든 장부로 과거 접근을 소급 정당화할 수 없다.

## 검증

```powershell
node experiments/question-quality-20260715/design/reviewer-calibration-v4-production-bound-v1/verify.mjs
node experiments/question-quality-20260715/design/reviewer-calibration-v4-production-bound-v1/verify.mjs --check-manifest
```

첫 명령은 upstream byte/hash, 프로덕션 유형, 회전 반례, 60/576 슬롯 digest, role 분리, scorer/schema, 빈 운영 상태, hostile mutation을 fail-closed로 검사한다. 두 번째 명령은 이 패킷 자체의 봉인까지 추가로 검사한다.
