# 평가척도 식별 가능성 감사 v1

상태: **설계 제안 / 현 calibration v2 gold 아님 / 모델·API 후보 0**

## 관측된 신호

Calibration v2의 두 독립 평가자는 정답 21/24, fatal flag 23/24,
등급 20/24(QWK 0.88034)에 합의했다. 집중 유형만 보면 어법과 빈칸의
정답은 각각 8/8, fatal flag도 각각 8/8 일치했다. 그러나 세부 진단
record 전체 exact는 어법 0/8, 빈칸 0/8이었다.

세부 필드에서는 어법 grammaticality/diagnosis가 24/40, point family가
11/40, correction exact가 8/40이었다. 반면 correction이 source를
복구하는지는 40/40, 해설 정확성은 36/40이었다. 빈칸은 slot grammar
40/40, answer의 7개 의미축 보존 56/56에 합의했지만 option grounding은
29/40, primary intent axis는 10/40, divergent-axis exact set은 2/40,
single decisive flaw는 20/40이었다.

이는 두 현상을 함께 보여 준다.

1. 정답·fatal·source 복구처럼 관찰 가능한 construct에는 강한 합의가 있다.
2. 하나의 문법 현상이나 오답이 여러 taxonomy에 걸릴 수 있는데도 단일
   label을 강제한 필드는 식별 가능성이 낮다.

따라서 낮은 세부 합의를 모두 평가자 무능으로 처리하거나, 반대로 taxonomy
문제라는 이유로 정답·fatal 불일치를 용서해서는 안 된다. 객관 construct와
설계 해석 construct를 분리해야 한다.

## 어법 v3 제안

필수 객관 필드는 그대로 높은 문턱을 둔다.

- 표시 표현의 문법성: grammatical / ungrammatical / genuinely contested
- 문제상 역할: answer error / valid decoy / invalid site
- 최소 한 개의 교정이 문법·원문 의미를 복구하는지
- 해설의 개별 문법 명제가 사실인지
- 정답 집합이 유일한지

반면 `pointFamily`는 단일 정답 대신 `acceptedPointFamilies` 집합과 계층을
쓴다. 예컨대 수동 분사 오류는 `PARTICIPLE_VOICE`와
`ACTIVE_PASSIVE_VOICE`가 동시에 설명 가능한 경우가 있다. 교정도 문자열
exact가 아니라 정규화된 복수 교정안 또는 기능적 동치 판정으로 채점한다.
핵심은 정확히 같은 용어를 골랐는지가 아니라, 잘못된 위치와 지배 규칙,
복구 결과를 맞혔는지다.

## 빈칸 v3 제안

`primaryIntentAxis` 하나를 평가자가 추측하게 하지 않는다. 생성자의 설계
의도와 학생 표면에서 관찰되는 의미 차이는 별도 필드다.

- proposition axis 7개 각각에 대해 관계를 기록한다:
  `PRESERVED`, `REVERSED`, `NARROWED`, `BROADENED`, `OMITTED`,
  `UNSUPPORTED_ADDITION`, `SHIFTED`, `NOT_APPLICABLE`.
- `decisiveAxes`는 1~2개의 집합으로 허용한다. 둘 이상이면 반드시 왜 한
  결함으로 환원되지 않는지 기록한다.
- `mechanismTags`는 `scope_shift`, `causal_reversal`, `half_truth` 등의
  다중 집합이다. 단일 primary tag를 gold로 강제하지 않는다.
- 정답은 모든 mandatory axis를 보존해야 하고, 각 오답은 최소 한 축에서
  결정적으로 어긋나야 한다.
- KILLER 공예 평가는 오답별 overlap ratio, 정답과의 lexical/structural
  평행성, cheap giveaway, 서로 다른 교육적 의도를 별도 측정한다.

이 구조에서는 “정답은 분명하지만 오답의 주된 함정 이름을 무엇이라 부를지”
갈리는 경우를 fatal로 오인하지 않으면서, polarity·actor·condition이 실제로
뒤집혔는지는 엄격하게 판정할 수 있다.

## 인증 설계 v3

1. 먼저 12개 anchor pilot을 세 평가자가 독립 코딩한다.
2. answer/fatal/grade와 각 객관 필드의 합의도를 따로 계산한다.
3. 단일 label의 alpha가 낮고 accepted-set으로 높아지는 필드는 codebook을
   수정한 뒤에만 본 교정팩을 발행한다.
4. 새 24개 본 교정팩은 작성자 예상 분포가 아니라 독립 adjudication 결과로
   composition eligibility를 판정한다.
5. answer와 fatal은 현행 수준의 높은 비보상 문턱을 유지한다. taxonomy
   필드는 accepted-set 또는 관계 벡터를 쓴 뒤 경험적으로 문턱을 고정한다.
6. 교정팩에서 외운 label이 아니라 새 supplemental held-out에서 같은
   construct를 재현해야 최종 인증한다.

## 채택 경계

이 제안은 calibration v2의 진실을 바꾸지 않는다. 현재 중재자는 v2 계약에
따라 그대로 최종 판정하고, composition이 깨지면 억지로 등급을 맞추지 않고
새 v3 packet을 만든다. 본 제안은 그 v3를 설계할 때의 사전 등록된 근거다.

