# Reviewer calibration v3 replacement 설계

상태: **DESIGN ONLY / UNISSUED / OFFLINE ZERO-COST**

## 결론

v2의 24개를 재배열하거나 판정을 바꿔 인증 세트로 만들지 않는다. v3는 새 문항으로 다시 작성한다. 작성자에게 목표 등급을 주지 않고, 각 후보를 독립 preflight와 2인 blind pilot에 통과시킨 뒤, 미리 고정한 순서에서 최종 판정 등급별 첫 두 문항만 채택하는 `first-to-fill` 규칙을 쓴다. 그러므로 `A/B/C/F = 2/2/2/2`는 진실을 바꾼 결과가 아니라 **결과 층화 calibration 표본**이다. 64개 후보 안에 셀이 채워지지 않으면 그 버전은 실패한다.

평가 단위도 바꾼다. 어법은 하나의 `pointFamily`나 정확히 같은 교정 문자열을 강요하지 않고, 관찰 가능한 문법성·오류 진단과 사전 봉인한 point-family/교정 동치 집합을 평가한다. 빈칸은 하나의 `primaryIntentAxis`를 추측시키지 않고, 모든 선지에 7축 관계 벡터를 기록하며 `decisiveAxes`와 `mechanismTags`를 집합으로 평가한다. 정답·fatal·craft는 별도 construct로 유지한다.

## 입력 경계와 v2에서 가져온 사실

이 설계는 다음 네 파일의 공개 또는 집계 정보만 사용했다.

- `evaluator-rubric-identifiability-v1/REPORT.md`
- `evaluator-rubric-identifiability-v1/rubric-v3-proposal.json`
- `reviewer-calibration-packet-v2/packet-public.json`
- `reviewer-calibration-packet-v2/private/issued/adjudicator-c/phase3/report.json`

허용 파일 안에 있더라도 author hypothesis 필드는 근거로 사용하지 않았다. trusted/pending gold, final-gold proposal 본문, 비공개 문항 표면, 비밀값은 읽지 않았다.

v2 최종 집계에서 어법과 빈칸은 각각 `A/B/C/F=2/2/2/2`였지만 nonfocus는 `C3/F5`라 composition이 부적격이었다. 세 평가자의 빈칸 선지 진단 일치도는 `0.880/0.685/0.735`인 반면 7축 존재 여부 점수는 모두 `1.0`이었다. nonfocus blind-solve 일치도는 `0.625/0.875/1.0`으로 흔들렸다. 이는 정답을 찾는 능력과 선지별 의도를 같은 자유서술 필드로 재면 안 된다는 근거다.

## 측정 대상

모든 anchor는 다음 네 층을 분리한다.

1. 답: 표시 답이 아니라 실제 response space의 허용 답 집합
2. fatal: 답 부재·복수 정답·비문·invalid site·해설 역전·동기화 실패 등 비보상 결함
3. craft: 의도성, 오답 매력도, 진단 분리, 난이도 정렬, 표면 자연스러움, 해설의 경제성과 진실성
4. focus 진단: 어법의 site별 진단 또는 빈칸의 option별 7축 관계

등급은 증거 기록 뒤 마지막에 준다. 작성자에게 목표 등급을 알려주지 않는다.

- `F`: fatal이 하나라도 있음
- `C`: fatal은 없지만 craft 차원 0 또는 중대한 수정 가능 결함이 있음
- `B`: 유효하고 모든 craft가 최소 기준을 충족함
- `A`: 모든 craft 차원이 2 이상, 셋 이상이 3이며 cheap giveaway와 불필요한 장황함이 없음

등급은 production prevalence 추정치가 아니다. calibration에서 결함 스펙트럼을 시험하기 위한 outcome-stratified 표본이다.

## 어법 관찰 규약

각 밑줄 site마다 다음을 반드시 기록한다.

- 표시 표현의 상태: `GRAMMATICAL`, `UNGRAMMATICAL`, `GENUINELY_CONTESTED`
- 문항 내 역할: `ANSWER_ERROR`, `VALID_DECOY`, `INVALID_SITE`
- 허용 가능한 `acceptedPointFamilies` 집합
- 의미와 문법을 함께 보존하는 `acceptedCorrectionEquivalenceSets`
- 교정이 source를 복구하는지
- 해설의 개별 문법 명제가 사실인지

문법성·오류 진단·source 복구·해설 명제는 비보상 필드다. point family는 복수 허용 집합이다. 교정은 문자열 exact-match가 아니라, 사전 봉인한 의미 동치 그룹 membership으로 채점한다. 발행 후 새 답을 동치 집합에 더할 수 없다. 실제로 타당한 교정이 누락되었다면 평가자 오답이 아니라 gold 결함이며 해당 anchor를 무효화한다.

8개 certification anchor는 point-family 집합 5종 이상, 복수 family 허용 anchor 2개 이상, 복수 correction-equivalence anchor 2개 이상, invalid-site 1개 이상을 포함한다. genuinely contested는 최대 1개다. contested 사례가 많아져 측정력이 낮아지는 것을 막기 위한 상한이다.

## 빈칸 관찰 규약

모든 선지는 다음 7축을 빠짐없이 기록한다.

1. `actorOrTarget`
2. `polarity`
3. `conditionOrModality`
4. `causalRelationAndDirection`
5. `scopeOrQuantifier`
6. `stance`
7. `temporalRelation`

각 축의 관계는 `PRESERVED`, `REVERSED`, `NARROWED`, `BROADENED`, `OMITTED`, `UNSUPPORTED_ADDITION`, `SHIFTED`, `NOT_APPLICABLE` 중 하나다. 각 오답에는 1~2개의 `decisiveAxes`와 복수 허용 `mechanismTags`를 둔다. 세 축 이상이 동시에 결정적이라면 한 함정을 측정하는 문항이 아니므로 `IRREDUCIBLE_COMPOUND`로 후보를 기각한다.

정답은 모든 mandatory axis를 보존해야 한다. 각 오답은 적어도 한 decisive axis에서 결정적으로 어긋나야 한다. slot 문법성, 유일 정답, 정답의 mandatory-axis 보존은 비보상 필드다. primary intent 단일 라벨은 쓰지 않는다.

8개 certification anchor 전체에서 일곱 축이 각각 최소 한 번 decisive axis로 나타나야 한다. 복수 decisive-axis 오답은 8개 이상, mechanism tag는 8종 이상, killer anchor 중 lexical giveaway가 없는 사례는 2개 이상이어야 한다.

## Nonfocus 23유형을 8 anchor로 대표하는 방법

8문항으로 23유형 각각의 정확도를 주장하는 것은 불가능하다. 따라서 23개 production type을 먼저 정확히 동결하고, 다음 8개 construct family에 일대일로 귀속한다. 설계 파일의 이름은 논리적 역할이다. 실제 작성 전 production enum 23개와의 전수 binding이 필요하며, 누락·중복이 하나라도 있으면 발행을 차단한다.

| 8개 family | 포함하는 논리 유형 | 수 |
|---|---|---:|
| 전역 의미 선택 | 목적, 주장, 요지, 주제, 제목 | 5 |
| 국소 근거 선택 | 내용 일치, 내용 불일치, 추론 | 3 |
| 자료·실용문 | 도표, 실용 정보 | 2 |
| 정서·어휘 | 심경, 문맥 어휘, 동의어 | 3 |
| 담화 구조 | 무관문, 순서, 문장 삽입 | 3 |
| 압축·변환 | 요약 완성, 문장 변환 | 2 |
| 언어 형식 구성 | 복합 어법 선택, 문법 교정, 어순 배열 | 3 |
| 개방·복합 응답 | 단답 구성, 복합 문항 | 2 |

한 certification epoch에는 family마다 한 유형을 뽑아 nonfocus 8개를 만든다. family 안에서는 rotation ledger상 가장 오래 나오지 않은 production type을 먼저 선택하고, 동률은 사전 고정 SHA-256 순서로 푼다. main과 holdout이 서로 다른 대표를 사용하면 family당 epoch당 최대 두 유형을 다룬다. 따라서 논리상 최대 3 epoch에 23유형을 한 번씩 접할 수 있지만, 실제 production enum binding 전에는 이 수치를 인증 주장으로 쓰지 않는다.

단일 epoch의 certificate 범위는 **family-level reviewer qualification**이다. 23개 전체 유형을 검증했다고 표기하려면 모든 bound production type이 main 또는 fresh holdout에 최소 한 번 등장하고 각자의 answer/fatal gate를 통과해야 한다.

## 후보 확보와 outcome-stratified composition

grammar, blank, nonfocus 각각 초기 후보 16개를 만든다. 후보 ID와 SHA-256 정렬 순서를 blind 결과를 열기 전에 고정한다. 각 후보는 다음 순서를 모두 거친다.

1. 목표 등급이 없는 construct/risk brief로 독립 원문 작성
2. 스키마·저작권·PII·response-space·렌더링 preflight
3. 작성자의 진단을 보지 않는 독립 domain preflight
4. 서로의 답을 보지 않는 blind solver 2인의 답과 focus 진단
5. 다수결이 아닌 근거 adjudication
6. 답 집합, fatal·craft 증거, 어법 동치 집합, 빈칸 벡터를 봉인
7. 미리 고정한 순서에서 grade cell별 첫 두 개를 채택

등급별 여분 후보는 삭제하지 않고 rejection ledger에 남긴다. 부족한 셀은 목표 등급이 아니라 새 construct/risk brief로 후보를 추가하고, 기존 pool 꼬리 뒤에 붙인다. surface·답·해설·진단의 어떤 수정도 새 candidate ID로 다시 시작한다. block당 64개를 adjudicate해도 `2/2/2/2`가 되지 않으면 해당 버전은 실패한다.

이 절차는 등급을 억지로 맞추지 않으면서도 calibration에 필요한 스펙트럼을 확보한다. 대신 결과 분포는 selection-conditioned이므로 production 품질 통계로 재사용하지 않는다.

## 역할 분리와 누출 차단

작성자, 두 preflight, 두 blind pilot solver, 두 anchor adjudicator와 필요 시 tiebreaker, 세 certification rater를 역할로 분리한다. 작성자는 자신의 문항을 preflight·pilot·adjudication·certification할 수 없다. pilot solver와 certification rater도 겹치지 않는다.

blind packet에서는 저장 답, 작성자 해설, 작성자 가설, 목표 등급, 타 평가자 답, accepted sets, relation vectors, rejection 이력을 제거한다. submission은 item surface hash, packet hash, codebook hash, reveal hash, rater pseudonym, phase 번호에 묶는다. 누출이 확인되면 해당 rater만 교체하지 않고 열린 packet 전체를 격리한다.

발행 전 다음을 각각 SHA-256으로 봉인한다.

- surface bundle
- answer/fatal/craft truth bundle
- grammar accepted-family/correction bundle
- blank relation-vector/decisive-set bundle
- candidate-order/rejection ledger
- production-type binding/rotation ledger
- codebook와 모든 threshold

## 12-anchor taxonomy pilot

main과 holdout에 쓰지 않을 새 12개를 grammar 4, blank 4, nonfocus 4로 구성한다. 세 rater가 독립적으로 풀고 진단한다. pilot item의 accepted set도 발행 전에 봉인한다.

평가자별 통과 기준은 다음과 같다.

- blind answer exact: 11/12 이상
- fatal exact: 11/12 이상, fatal sensitivity 3/3
- grade QWK: 0.80 이상
- grammar 비보상 필드: 0.95 이상
- accepted point-family membership: 0.90 이상
- blank 7축 cell exact: 0.90 이상
- decisiveAxes 평균 Jaccard: 0.80 이상
- mechanismTags 평균 Jaccard: 0.75 이상
- focus 필드 완성도: 1.0

그룹 기준은 pairwise answer/fatal 0.90, 최저 pairwise grade QWK 0.75다. 같은 새로운 라벨을 둘 이상의 rater가 냈다면 자동 정답 처리하지 않고 gold-defect review로 보낸다.

pilot 실패 시 aggregate disagreement만으로 codebook 정의를 명료화하거나 겹친 taxonomy를 분리할 수 있다. 이미 발행한 item truth나 accepted set을 바꿀 수 없다. fresh 12개로 한 번 더 시행하며, 두 번째도 실패하면 main certification을 차단한다.

## 24-anchor certification

taxonomy codebook을 동결한 뒤 fresh 24개를 `grammar 8 + blank 8 + nonfocus 8`로 발행한다. 각 block의 adjudicated composition은 `A/B/C/F=2/2/2/2`, fatal은 2개다. 세 rater가 다음 세 phase를 거친다.

1. surface만 보고 답을 풀어 제출·봉인
2. 저장 답과 해설을 authority가 아닌 evidence로 열고 focus 진단 제출·봉인
3. 모든 phase-2 제출 뒤에만 evidence adjudication

평가자별 주요 통과 기준은 다음과 같다.

- 답 23/24, 각 block 7/8 이상
- fatal 23/24, sensitivity 6/6, specificity 17/18 이상, 각 block fatal 2/2
- grade QWK 0.80, 각 block 0.65, exact grade 20/24 이상
- focus 필드 누락 0
- grammar 비보상 필드 100%, family 및 correction membership 각각 7/8 이상
- blank 정답 mandatory axis 100%, relation cell 0.95, decisiveAxes Jaccard 0.85, mechanismTags Jaccard 0.80
- craft 차원 평균 절대오차 0.5 이하, 오차 2 이상 0건

그룹 수준에서 fatal Gwet AC1 0.85, 최저 pairwise grade QWK 0.70, answer/fatal pairwise agreement 0.90 이상을 요구한다. individual threshold를 통과한 rater만 provisional certificate 대상이다. packet-level 결함은 전원을 차단한다.

## Fresh activation holdout과 검정력

main 합격만으로 certificate를 활성화하지 않는다. pilot·main·과거 holdout과 원문, 8-word window, topic, scenario entity tuple, author, template fingerprint가 겹치지 않는 fresh 24개를 사용한다. block별 8개이며 fatal 4개씩, 전체 fatal/nonfatal은 12/12로 sensitivity를 의도적으로 stress한다. 이 holdout은 평가자당 한 번만 연다.

holdout 기준은 답 23/24, fatal 23/24, fatal sensitivity 12/12, specificity 11/12, grade QWK 0.80, focus 완성도와 grammar 비보상 필드 및 blank mandatory-axis 100%, blank relation cell 0.95다. 실패 시 certificate를 활성화하지 않는다. aggregate error class만 remediation에 쓰고, 재시험은 전부 새 holdout으로 한다.

검정력은 과장하지 않는다.

| 표본 | 실제 오류율 | 하나 이상 오류를 볼 확률 |
|---|---:|---:|
| main 24 | 5% | 70.80% |
| main 24 | 10% | 92.02% |
| main+holdout 48 | 5% | 91.47% |
| main+holdout 48 | 10% | 99.36% |
| block별 main+holdout 16 | 10% | 81.47% |
| fatal anchor 18 | miss 10% | 84.99% |
| fatal anchor 18 | miss 15% | 94.64% |
| fatal anchor 18 | miss 20% | 98.20% |

이 수치는 독립·동일 오류확률 가정의 `1-(1-p)^n`이다. 실제 문항 오류는 군집될 수 있으므로 lower-bound 인증이 아니다. 24 main은 23유형별 정확도를 추정할 힘이 없고, rolling fresh audit가 필수다.

## disagreement와 adjudication

불일치는 다음 중 하나로 분류한다.

- `RATER_ERROR`
- `GOLD_EQUIVALENCE_OMISSION`
- `TAXONOMY_AMBIGUITY`
- `ITEM_AMBIGUITY`
- `BINDING_OR_HASH_ERROR`

다수결, 저장 답, 작성자 해설은 authority가 아니다. canonical response와 passage/stem/response-space의 근거를 먼저 기록하고 counterevidence를 함께 남긴다. 두 adjudicator의 근거 판정이 충돌할 때만 fresh tiebreaker를 사용한다. 원본 제출과 폐기된 판정도 append-only로 보존한다.

발행 후 valid response가 accepted set에서 빠진 것이 확인되면 rater에게 오답을 줄 수 없다. 해당 anchor는 scoring에서 무효이며 packet composition과 power를 다시 계산한다. 대체 문항을 이미 열린 packet에 끼워 넣지 않고 새 버전을 발행한다.

## 실패 규약

다음은 fail closed다.

- hash/binding 불일치
- 역할 분리 위반
- author hypothesis 또는 다른 rater 답 누출
- accepted set/관계 벡터 미봉인
- 64 후보 뒤에도 composition 미완성
- 발행 뒤 item/codebook/threshold 변경
- pilot/main/holdout/production 평가 표본 간 중복
- taxonomy pilot 2회 실패

packet-level 실패면 어떤 reviewer도 인증하지 않는다. individual rater 실패면 그 rater만 불합격이지만, 동일 문항 재시험은 금지한다. 발행 후 threshold를 낮추거나, rejected candidate를 삭제하거나, 나중에 결과를 보고 production type family를 바꾸는 행위도 금지한다.

## 실행 전 차단 조건

이 산출물은 설계이며 문항이나 gold를 만들지 않았다. 실제 v3 authoring 전에 다음이 별도 검증되어야 한다.

1. production의 정확한 23 type enum을 logical family 8개에 전수 binding
2. 역할 pseudonym과 incompatibility 검증
3. private authoring·sealing·reveal 도구 구현
4. JSON Schema validator 및 semantic invariant validator 연결
5. v2/private, S1, production 평가 표본과 disjointness 기준선 동결
6. candidate/rejection/rotation append-only ledger 생성

하나라도 빠지면 `DESIGN_ONLY_UNISSUED` 상태를 바꾸지 않는다.

## 비용 및 외부 활동

이 설계 작성과 검증의 network, provider, model, API candidate, DB, secret read, trusted-gold read/write는 모두 0이다. 사람 또는 독립 agent의 offline 작성·평가 effort만 필요하며 provider 비용은 0 USD다. 이 calibration 후보는 production 질문 생성 API 1,000개 예산을 소모하지 않는다.
