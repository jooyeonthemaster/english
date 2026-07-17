# 문제 생성 품질 연구 프로토콜 v0.2

작성 시작: 2026-07-15 KST  
대상 저장소: `D:\Desktop\2026project\nara`  
핵심 대상: 영어 문제 생성 전 유형, 특히 `GRAMMAR_ERROR`와 `BLANK_INFERENCE`  
모델 기준선: STANDARD=`google/gemini-3.5-flash`, PREMIUM=`google/gemini-3.1-pro-preview`

## 1. 연구 질문

1. 현행 프로덕션 경로가 문항 성립성, 해설 정확성, 선지 공예, 난이도, 비용을 유형별로 어느 수준까지 달성하는가?
2. 프롬프트 제약의 양이 아니라 어떤 제약·역할분리·게이트 집행 조합이 어떤 지문/유형/난이도에서 효과적인가?
3. 생성·비평·표적수리·재생성·결정론 후처리의 역할을 Flash와 Pro에 어떻게 배분해야 비용 대비 출하 가능률이 최대가 되는가?
4. KILLER 문항에서 각 오답이 독립적인 오개념을 겨냥하면서도 정답은 이견 없이 하나가 되는가?

## 2. 비교의 단위와 버전 고정

- 모든 결과에는 `gitCommit`, `qualityPolicyVersion`, `promptVariant`, `modelId`, `plan`, `type`, `difficulty`, `passageId`, `sourceHash`를 기록한다.
- `requestedPlan`, `effectivePlan`, `servedModel`, `reasoningMode`, feature-flag snapshot, route, Vercel/Trigger deployment 식별자를 분리해 기록하고 실행 전에 불일치 여부를 assert한다.
- DB의 생성 시각만으로 코드 버전을 단정하지 않는다. 배포 시각/모델 호출 로그가 없으면 `codeVersion=unknown`으로 둔다.
- 6월 문항과 7월 문항은 결과 비교용 역사 자료로만 사용한다. 현행 코드의 효과를 주장할 때는 같은 커밋, 같은 지문, 같은 난이도의 paired 생성만 사용한다.
- 동일 지문을 여러 arm에서 사용하되 arm 정보와 정답 키를 평가자에게 숨기고, 출력 순서를 무작위화한다.

## 3. 평가 절차

각 문항은 아래 순서로 평가한다.

1. **Blind solve**: 모델/플랜/정답/게이트 경고를 숨긴 상태에서 독립 평가자 2명이 직접 푼다.
2. **Validity audit**: 원지문과 변형 이력을 공개하고 단일정답, 문법, 원문 보존, 렌더 무결성을 확인한다.
3. **Craft audit**: 각 오답의 유혹 근거와 결정적 탈락 근거를 한 줄씩 작성한다. 설명할 수 없는 선지는 필러다.
4. **Explanation audit**: 해설이 실제 구조를 정확히 분석하는지, 정답·라벨·용어와 일치하는지, 중복 없이 간결한지 본다.
5. **Adjudication**: 두 평가자의 답/치명 판정이 다르면 제3의 fresh-eyes 평가자가 근거와 함께 확정한다.

단일정답, 문법/자연스러움, 해설 사실성, 정답·표시·채점 필드 동기화는 어떤 relaxed/scarce/salvage 정책에서도 완화하지 않는다. 난이도·오답 공예·표현 다듬기는 별도의 craft 정책과 비용 예산으로 다룬다.

작성자/생성 모델이 자기 결과의 최종 심사자가 되지 않는다. 자동 validator 통과는 사람형 독립 평가를 대체하지 않는다.

## 4. 통계 원칙

- passage를 블록으로 둔 paired 설계를 우선한다. 유형, 난이도, 장르, 길이, 출처 품질을 층화한다.
- 1차 지표는 `fatal-free`, `ship-ready`, `beautiful-killer`, `cost-per-ship-ready`, `latency p50/p95`다. 평균 점수 하나로 합치지 않고 Pareto 전선을 본다.
- 이항 비율은 Wilson 95% 구간, paired 성공/실패는 McNemar 또는 paired bootstrap, 연속 점수·비용은 passage-block bootstrap을 사용한다.
- `n < 30/arm`은 탐색 결과로만 쓴다. 주효과 확정은 원칙적으로 `n >= 60/arm` paired 표본과 독립 이중평가가 필요하다.
- 파일럿 `n=8`에서 치명 결함 2건 이상 또는 비용이 대조군의 2배인데 품질 이득이 없으면 조기 중단한다.
- 스크리닝 `n=20` 결과는 승격/기각에만 사용하고 최종 품질률로 홍보하지 않는다.
- 다중 비교는 사전 등록된 1차 가설과 탐색 가설을 분리한다. 탐색에서 찾은 규칙은 새 표본으로 재검증한다.
- 유효성보다 공예가 먼저 좋아졌다는 이유로 승격하지 않는다. 치명 결함 1건은 KILLER 공예 점수 여러 건으로 상쇄되지 않는다.

## 5. 지문 층화

- 장르: 논설/철학, 사회과학, 자연과학, 기술, 서사, 실용문
- 길이: 짧음/중간/김
- 구조: 인과, 대조·양보, 문제-해결, 정의-예시, 시간순, 비유·함축
- 문법 affordance: 관계사, 태·수여 구조, 분사, 수일치, 병렬, 준동사, 절 경계
- 입력 품질: 깨끗함, 구두점 오염, OCR 의심, 논리적 모순 의심
- 과거 연구 코퍼스와 실제 DB 지문을 섞되, 동일 지문 과적합 여부를 보기 위한 완전 미사용 holdout을 둔다.

## 6. 실험 요인

이 요인은 독립적인 이분법으로 간주하지 않고 상호작용을 본다.

- 프롬프트 제약 밀도: minimal / moderate / exhaustive
- 설계 방식: one-shot / answer-first / site-candidate-first / distractor-ledger / split answer-distractors
- 해설 시점: 동시 생성 / 문항 확정 후 별도 생성 / 결정론 템플릿+LLM 보완
- 게이트 집행: 관측만 / 표적수리 / 전체 재생성 / 후보 선택 / 난이도별 혼합
- 모델 역할: Flash-only / Pro-only / Flash→Pro repair / Pro answer→Flash distractors / Pro→Pro
- 빈칸 경계: 자유 선택 / 완전 constituent / suffix-free / slot contract
- 어법 정답 후보: 자유 선택 / positive allowlist / valency-risk exclusion / 구조 인증 메타데이터
- 비용 정책: 무조건 재생성 금지, confidence-triggered repair, 치명과 craft의 서로 다른 예산

## 7. API 예산

새로 생성하는 **full-question attempt slot**의 상한은 1,000개다. 이 상한은 실제 완성 후보 수보다 의도적으로 보수적이다. full-question 생성 경계에 들어가기 직전에 slot을 영구 소비하며, 이후 parse 실패·timeout·반려가 나도 반환하지 않는다. 따라서 완성 문항 후보가 1,000개를 넘을 수 없다. answer-only 설계 단계와 평가 콜은 slot 수에는 넣지 않지만, 모든 모델 콜·토큰·비용·지연은 별도로 센다.

- `attempt slots consumed`, `parsed candidates`, `accepted`, `rejected`, `no candidate`를 각각 보고한다. top-level run 수나 최종 저장 문항 수를 후보 수의 대용으로 쓰지 않는다.
- 각 parsed candidate는 고유 candidate ID, producing physical call ID, output index, normalized output hash와 연결한다. 같은 출력을 새 idempotency key로 중복 계상할 수 없다.
- batch마다 attempt-slot 상한뿐 아니라 physical provider-call 상한과 USD 상한을 사전 등록한다. 네트워크 전에 call lease와 보수적 최대비용을 원자적으로 예약하고, 성공·실패·timeout·결과 불명 모두 정산한다.
- 실제 비용이 예약을 초과하더라도 발생 사실의 기록을 거부하지 않는다. batch를 `breached`로 표시하고 이후 호출만 차단한다. 미확정 비용은 0원으로 쓰지 않고 `unknown` lease와 보수적 예약을 유지한 뒤 billing reconciliation event로 보정한다.
- dry-run을 기본으로 하고, canonical campaign store의 명시적 experiment/batch allocation, 열린 candidate slot, pre-call authorization 없이는 모델 경계에 진입할 수 없다. 임의의 새 ledger 파일을 지정해 전역 상한을 우회할 수 없어야 한다.

> **실행 보류 정정(2026-07-15, O28):** 아래 998 배분은 최초 설계 기록으로만 보존한다. 각 숫자가 final output 수와 physical full-candidate attempt slot 수를 동시에 뜻하도록 작성되어 단위가 모순된다. registry에는 아직 어떤 phase도 열지 않았으며, mock transport 계측과 micro-pilot으로 slot-per-final 분포를 얻은 뒤 attempt-slot ITT 기준의 대체 배분표를 새 hash로 고정한다. 아래 표를 실행 예산으로 사용하면 안 된다.

- P0-OFFLINE — 계측·replay·코퍼스 감사: **0**
- P1-DEV-ALL-CONTROL — 25유형×2플랜×3난이도 현행 sentinel: **150**
- P2A-DEV-DENSITY — 어법/빈칸×4 제약 프로필×8 passage block: **64**
- P2B-DEV-FACTORIAL — 어법/빈칸×2×2×2 factorial×4 독립 반복: **64**
- P3-H-KILLER-MAIN — 유형별 60지문에서 CURRENT/WINNER paired 확증: **240**
- P4-H-KILLER-PLAN-X — 같은 60지문의 반대 plan crossover: **240**
- P5-H-ALL-REGRESSION — 25유형×2플랜×3난이도 동결 winner sentinel: **150**
- P6-ROUTE-FAST — 실제 fast route 25유형×2플랜: **50**
- P7-ROBUSTNESS — noisy/borderline 어법·빈칸×2플랜×5: **20**
- P8-REPAIR — 사전 고정된 gate-failed pool의 표적수리 최대 5/type/plan: **20**

합계는 **998/1,000**, 미배정은 2다. 미배정 2와 safety stop으로 남은 slot은 결과를 본 뒤 임의의 재생성·새 가설·top-up에 전용하지 않는다. 변경이 필요하면 아직 결과를 열지 않은 독립 family인지 확인하고 registry amendment와 새 manifest hash를 먼저 고정한다.

P1/P5/P6은 셀당 1개인 결함 탐지 sentinel이며 품질률 표본이 아니다. P3만 끝나면 type별 평균효과는 `n=60/arm`이지만 plan별은 `n=30/arm`이다. STANDARD/PREMIUM 각각의 확증은 policy를 바꾸지 않은 채 P4 crossover까지 끝내 `n=60/arm/type/plan`을 확보한 경우에만 주장한다.

P3/P4 실행 전에는 general holdout과 별도로 KILLER 어법 적합 G60, central-span 빈칸 적합 B60을 확보한다. 두 panel은 dev/general holdout/7·15 표본/과거 실험과 content-hash 및 near-duplicate cluster가 분리되고 prior question/job이 0이어야 하며, 두 독립 평가자와 제3 adjudication을 통과해야 한다. 현 코퍼스는 이 조건을 만족하지 않으므로 아직 실행 불가다.

각 배치는 실행 전에 최악의 재시도 수만큼 예산을 예약한다. 예약 후 1,000을 넘으면 실행을 거부한다. 미사용 예약분만 반환한다. 비용은 raw cost와 `총비용 / ship-ready 수`를 모두 보고한다.

## 8. 프로덕션 동일성의 두 층

1. **Core-parity 탐색**: 고정·층화 코퍼스에서 shared generation core, 실제 prompt/schema/postprocess/gate/model router를 사용한다. 인증·credit·DB persistence는 우회하되 그 차이를 manifest에 남긴다.
2. **Route-parity 확인**: 격리된 research academy와 실제 fast route를 사용해 최근 40문항 diversity, variant steering, deadline, billing, persistence, 렌더/채점 표면까지 검증한다.

Trigger route는 primary fast route와 diversity/deadline/count semantics가 달라 별도 cohort다. core-parity와 route-parity, fast와 Trigger를 같은 품질률로 합치지 않는다.

## 9. 종료 기준

- 전 유형이 최소 sentinel 생성·렌더·구조 게이트를 통과한다.
- 어법·빈칸의 확증 표본에서 치명 결함 0, 단일정답 블라인드 합의, 해설 사실 오류 0을 달성한다.
- KILLER는 `RUBRIC.md`의 beautiful 조건을 충족하고, 공예 개선이 대조군 대비 독립 평가에서 재현된다.
- STANDARD/PREMIUM 각각 비용·지연·재시도 분포와 cost-per-ship-ready가 수용 가능하다.
- fresh-eyes 감사에서 critical/major가 0이고, 타입체크·테스트·lint·프로덕션 동일 하니스가 통과한다.
- 남은 불확실성은 확정 사실과 분리해 기록한다.
