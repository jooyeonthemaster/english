# 어법 클러스터 연구노트 (26-07-06)

## 착수 시점 상태
- never-fail 사다리(척추) 배선 완료: strict×2 → (STANDARD KILLER: 레스큐) → 풀 재승인 → salvage 1회 → 실패.
- 스모크 1레코드 실측: STANDARD KILLER, 이전 실패 지문(cmr3blkyt...)에서 rescue 경로로 생성 성공(강등+검수권장). llmScore 58.
- 남은 문제: strict 경로 수율이 낮다 = 구제 의존율이 높다 = 평균 품질이 낮다.

## 검증 대기 가설 (우선순위순)
- H1: 생성 전에 selectUsableGrammarCandidates 로 "깊은(비-로컬) 오류 자리" 후보 목록을 뽑아 프롬프트에 명시하면(설계 우선), KILLER 의 obvious/shallow/thin 거절이 줄어 strict 1~2회 안에 통과한다.
- H2: 교정 재시도 피드백에 "이미 거절된 표면 + 이유"뿐 아니라 "이 지문에서 아직 안 쓴 유망 자리"를 넣으면 재시도 수율이 오른다.
- H3: KILLER 프롬프트의 금지 목록이 길수록(gemini) 오히려 위반이 늘 수 있다 — 금지 나열 대신 "해야 할 설계 절차" 중심으로 압축하면 수율 상승. (프롬프트 축약 실험)

## 시도 기록
(에이전트가 append)

### [26-07-06 ~13:10] 진단 — KILLER strict 전멸의 주범 수치화
데이터: salvage-smoke-grammar-20260706(7레코드, KILLER 4) + final-std/prem-20260705 어법 셀.
- 스모크 KILLER 4레코드 **전부 relaxedFallback=true**(strict-clean 0/4), llmScore 58/58/65/65 (평균 61.5).
- 4레코드 모두 **마지막 strict 거절 = grammar-killer-answer-point-repeated** (100%). 표본:
  · STD-K rec0: 정답(D,f) + 디코이(A "only",f) / rec1: 정답(D wait→waiting,k) + 디코이(E "to comprehend",k)
  · PREM-K rec4: 정답(B that→what,b) + 디코이(E "in which",b) / rec5: 정답(C,d) + 디코이(B "behaves",d)
- 코드 집계(스모크+0705 파이널): killer-answer-point-repeated ~6, shallow-participle-adjective-answer 6,
  weak-filler-decoys 4~6, killer-thin-answer 2, killer-generic-answer-point 2, obvious-noun-what-relative 2.
- 0705 PREM 어법 2셀은 생성 자체 실패(pre-spine): shallow-participle x3 + killer-thin x1 + generic-answer-point x1.

루트코즈(코드 확인):
1. grammar-point-catalog.ts buildGrammarPointGuidance 의 디코이 라인이 "코드 중복되면 중복된 대로
   정직하게 기재"를 무조건 허용 — KILLER 게이트(dispatcher.ts:1171~1189)는 정답 코드가 디코이에
   반복되면 하드 거절. 프롬프트가 게이트와 자기모순(정직 기재 ≠ 자리 선택 금지를 안 가르침).
2. candidate-blocks/grammar.ts buildGrammarSourceCandidateBlock 이 같은 코드 후보를 코드당 2개까지
   나열하고 KILLER 에선 tier=killer 후보 **둘 다** use=answer-preferred 로 표기 — rec4 의 b 후보쌍
   (that / in which)을 정답+디코이로 나란히 쓰도록 프롬프트가 유도.
3. "정답 먼저 → 디코이 코드 상이" 설계 순서 지시가 아예 없음(제약 나열만 ~40줄).

H1 확인: 후보 블록 자체는 이미 배선됨(buildGrammarErrorCandidateBlock→buildGrammarSourceCandidateBlock→
selectUsableGrammarCandidates, run-question-generation.ts:277 경유). H2(교정 피드백 확장)는 호스트가
run-question-generation-helpers.ts(수정 금지 파일)라 이번 캠페인에선 불가 → H1-b(설계 순서 주입)로 전환.

### [26-07-06 ~13:15] iter1 가설 (H1-b: 정답-우선 설계 순서 + KILLER 코드 충돌 제거)
가설: KILLER strict 전멸의 1주범은 "정답 pointCode 의 디코이 반복"이며, 이는 (a) 설계 순서 부재,
(b) 프롬프트의 자기모순(중복 정직 기재 허용 vs 게이트 하드 거절), (c) 후보쌍 answer-preferred 중복
표기가 원인. 셋을 프롬프트 측에서 제거하면 게이트 완화 없이 strict 1~2회 통과율이 오른다.
변경(예정): ① 후보 블록에 KILLER 3-STEP 설계 순서(정답 먼저→X 기록→디코이는 X 금지→자기검증),
② 같은 코드 2번째 killer 후보 use=alternate-answer-only 강등, ③ 포인트 가이드의 중복 기재 라인을
KILLER 분기(자리 자체를 옮겨라)로 교체.

### [26-07-06 ~13:40] iter1 변경 구현 완료
- 변경 ①②: src/lib/question-quality/candidate-blocks/grammar.ts (buildGrammarSourceCandidateBlock,
  KILLER×judgment 한정 — INTERMEDIATE/BASIC/correction 출력 불변 확인).
- 변경 ③: src/lib/grammar-point-catalog.ts (buildGrammarPointGuidance, mode=judgment && 난이도 '상'
  분기만 신설 — 기존 라인은 다른 난이도에 그대로 유지).
- 검증: tsc --noEmit 0. 유닛 grammar-generation-quality 105/106 pass — 유일 실패
  "PREMIUM grammar generation skips slow partial repair calls"는 run-question-generation.ts(메인 소유,
  내 미수정 파일)의 소스 패턴 검사로 스파인 재작업이 원인인 **기존 실패**(정규식 500자 창 초과).
- 렌더 스모크: KILLER 블록에 design order 3줄 + alternate-answer-only 2건 렌더 확인.

### [26-07-06 ~13:57] iter1 실측 (artifacts/ai-audits/loop-grammar-iter1-20260706, KILLER×STD/PREM×2런)
지문 = 스모크와 동일한 2개 퇴화 지문(39번 문장삽입 · 41-42 장문 glass). 생성률 4/4 = 100% 유지.

| 셀·지문 | 전(스모크) | 후(iter1) |
|---|---|---|
| STD·39번 | relaxed, llm 58, 마지막거절 answer-point-repeated | **strict-clean**, attempts 2, llm 62 (거절은 기계적 error-not-mutated/not-backed 1회뿐) |
| STD·41-42 | relaxed, llm 58, answer-point-repeated | relaxed, attempts 4, llm 58 (거절: shallow-depends x2·noun-what x2·thin-connector·too-basic — **디코이 품질 계층 노출**) |
| PREM·39번 | relaxed, llm 65, answer-point-repeated | relaxed, attempts 3, **llm 96** (마지막거절 여전히 answer-point-repeated: 정답 b 'in which→which' + 디코이 b 'that') |
| PREM·41-42 | relaxed, llm 65, answer-point-repeated | relaxed, attempts 3, llm 68 (거절: tense-only·too-basic·weak-filler — 디코이 품질 계층) |

핵심 수치: strict-clean 0/4 → **1/4**. llm 평균 61.5 → **71.0**. answer-point-repeated 가 마지막 strict
차단인 레코드 4/4 → **1/4** (STANDARD 에서 완전 소멸, PREMIUM 1회 잔존). F급 코드 출하 0
(relaxed 출하물의 llmFatal 은 심사 의견 계층 — 정답무효/누출/렌더 아님).
판정: **채택**(방향 확증). 잔여 병목 2개로 재편 — ① PREMIUM 이 design order 를 읽고도 디코이
재배치를 안 함(스키마 밖 지시 무시) ② 퇴화 지문(41-42)에서 디코이가 장식 토큰(one/it's/thicker/
depends)으로 후퇴 — 금지 표면 목록을 무시.

### [26-07-06 ~14:00] iter2 가설 (H1-c: errorDesign 스키마 계획 단계에 코드 계획 강제)
가설: 프롬프트 지시(STEP 2)는 생성 순서 밖이라 PREMIUM 이 무시할 수 있지만, errorDesign 필드
(26-07-04 대개편에서 검증된 "필드 순서=생성 순서" 계획 장치)에 "정답 pointCode X + 디코이 4개
코드 전부 ≠X + 장식/금지 표면 아님"을 쓰게 하면 계획 시점에 충돌이 제거된다(스키마 안 지시라
무시 불가). 디코이 장식 후퇴도 같은 계획 단계에서 self-check 시킨다.
변경(예정): question-ai-schemas-mc.ts 의 grammarErrorDesignField describe(어법 전용 필드) ⑤ 확장 +
⑥ 신설. 후보 블록 STEP 3에 금지 표면 확인 (v) 추가.

### [26-07-06 ~14:35] iter2 실측 (artifacts/ai-audits/loop-grammar-iter2-20260706)
변경 구현: grammarErrorDesignField describe ⑤(정답 코드 X + 디코이 코드 전부 ≠X + 3코드/최대2회)
⑥(금지표면·장식토큰 확인) — question-ai-schemas-mc.ts:150 (어법 전용 필드만). STEP 3에 (v) 금지표면
자기검증 추가 — candidate-blocks/grammar.ts. tsc 0 · 유닛 105/106(기존실패 1 동일).

| 셀·지문 | iter1 | iter2 |
|---|---|---|
| STD·39번 | strict-clean, llm 62 | strict-clean, att 2, llm 58 (코드 a,g,f,c,b 완전 분산) |
| STD·41-42 | relaxed, llm 58 | relaxed, att 4, llm 58 (weak-filler x3 — 구조적 결핍) |
| PREM·39번 | relaxed(answer-point-repeated), llm 96 | **strict-clean**, att 2, **llm 96, fatal 0** (정답 i 'to produce→producing', 코드 g,b,i,c,d) |
| PREM·41-42 | relaxed, llm 68 | relaxed, att 3, **llm 83, fatal 0** (정답 d, 코드 5개 전부 상이) |

핵심 수치(대 스모크 베이스라인): 생성률 4/4 유지 · strict-clean 0/4→1/4(iter1)→**2/4** ·
llm 평균 61.5→71.0→**73.75** · answer-point-repeated 마지막 차단 4/4→1/4→**0/4 (박멸)** ·
F급 출하 0 · 출하물 pointCode 분산 4/4 문항 모두 5코드 완전 상이(스키마 계획 강제 효과 확증).
판정: **채택**. 잔여 relaxed 2건은 전부 41-42 glass 지문 = 정제 후보가 마커 수 미달인 구조적
결핍 지문(grammar-scarce 마커 대상) — 프롬프트로 strict-clean 불가능한 케이스, rescue 출하가 설계
의도(G3). 남은 개선 여지 = STD 정답 깊이(llm 58: 심사평 "정답이 기계적/로컬" — 'in which' 딥
사이트를 디코이로 두고 'depending' 로컬 플립을 정답으로 선택).

### [26-07-06 ~14:40] iter3 가설 (H1-d: 후보 목록 톱다운 정답 선택 강제)
가설: 후보 목록은 이미 killer-tier 우선 정렬돼 있는데 Gemini 가 목록 하위의 쉬운 변형(분사 로컬
플립)을 정답으로 고른다. STEP 1에 "목록을 위에서부터 걸어 내려가 반증 검사를 통과하는 첫
tier=killer 후보를 정답으로 쓰라(더 높은 killer 후보가 남아 있으면 얕은 자리로 후퇴 금지)"를
명시하면 STD 정답 깊이(llmScore)가 오른다. PREMIUM 은 이미 동작(96)이라 무회귀 예상.

### [26-07-06 ~15:15] iter3 실측 (artifacts/ai-audits/loop-grammar-iter3-20260706)
변경: candidate-blocks/grammar.ts STEP 1 재작성(톱다운 워크 + 반증 검사 통과 첫 killer 후보 =
정답, 얕은 자리 후퇴 금지). tsc 0 · 유닛 105/106(기존실패 1 동일).

| 셀·지문 | iter2 | iter3 |
|---|---|---|
| STD·39번 | strict-clean, att 2, llm 58 | **strict-clean, att 1(거절 0), llm 72** — 정답이 딥 사이트 'in which→which'(b)로 이동(가설 적중) |
| STD·41-42 | relaxed, llm 58 | relaxed, att 3, llm 58 (불변 — 구조적 결핍) |
| PREM·39번 | strict-clean, llm 96 | relaxed, att 3, llm 78, fatal 0 (단일런 후퇴 — 감시 항목) |
| PREM·41-42 | relaxed, llm 83 | **strict-clean, att 2, llm 98, fatal 0** — 결핍 지문 최초 strict 통과(정답 'are→is' d 장거리 수일치) |

집계: 생성률 4/4 · strict-clean 2/4 유지 · llm 평균 73.75→**76.5** · F급 출하 0 ·
answer-point-repeated 0 유지. STD 39 는 사상 첫 **1회 시도 무거절 strict 통과**.
판정: **채택**(집계 상승 + STD 정답 깊이 가설 적중). 단 PREM 39 의 96→78 단일런 하락은 톱다운
강제가 Claude 의 자체 좋은 판단(iter2 병렬 i 정답)을 제약했을 가능성 vs 런 분산 — 1런 증거라
판별 불가, 감시 항목으로 남김(후속: STEP 1 을 권고형 "self-found strictly-deeper site 허용"으로
완화하는 A/B 후보).

## 최종 요약 (3 iteration 완료)
궤적(동일 2개 퇴화 지문, KILLER×STD/PREM×2런): strict-clean 0/4 → 1/4 → 2/4 → 2/4 ·
llm 평균 61.5 → 71.0 → 73.75 → 76.5 · answer-point-repeated 마지막차단 4/4 → 1/4 → 0/4 → 0/4 ·
생성률 항상 4/4 · F급 출하 항상 0 · 출하물 pointCode 분산: iter2 이후 전 문항 5코드 상이.

채택 변경 (전부 어법 소유 파일):
1. candidate-blocks/grammar.ts — KILLER 3-STEP design order(STEP 1 톱다운 정답 선택, STEP 2 정답
   코드 X 디코이 금지, STEP 3 자기검증 5항목) + 같은 코드 2번째 killer 후보 use=alternate-answer-only.
2. grammar-point-catalog.ts — buildGrammarPointGuidance 디코이 라인 KILLER×judgment 분기(자리 선택
   단계에서 정답 코드 충돌 제거; 다른 난이도 불변).
3. question-ai-schemas-mc.ts — grammarErrorDesignField(어법 전용) ⑤ 코드 계획(X + 디코이 ≠X +
   3코드/≤2회) ⑥ 금지표면·장식토큰 확인. 스키마 구조 불변(설명만).

기각/보류:
- H2(교정 피드백에 미사용 유망 자리 주입): 호스트 buildCorrectiveRetryFeedback 이
  run-question-generation-helpers.ts(메인 소유·수정금지) — **오케스트레이터에 이관 제안**.
- H3(프롬프트 압축): 미착수. Gemini 가 결핍 지문에서 금지 표면 목록을 여전히 무시(iter2 STD 41-42
  에 sinking/uneven 디코이) — 과적재 신호는 실재. 다음 웨이브 후보.
- 41-42(glass) STD 셀: 정제 후보 < 마커 수인 구조적 결핍 — 프롬프트로 strict-clean 불가,
  rescue+notice 출하가 설계 의도(G3). 근본 해결은 후보 룰 확장(새 프레임 탐지) 또는 마커 수
  하향의 제품 결정.
- 유닛 기존실패 1건(PREMIUM repair guard 소스 패턴 테스트, run-question-generation.ts 대상)은
  스파인 재작업 산물 — 메인 확인 필요.
