# 독해·어휘 MC(mc-reading) 클러스터 연구노트 (26-07-06)

## 착수 시점 상태 (postspine-baseline-20260706 실측)
- 생성률: 담당 유형 전부 100% (구제 사다리 포함).
- 저점 셀: CONTEXT_MEANING ST-K 58, ANTONYM ST-K 58·PREM-I/K 68, VOCAB_CHOICE ST-K 68,
  IRRELEVANT ST-I 68, SENTENCE_INSERT ST-K 62·ST-I 72, IMPLIED_MEANING PREM-I 68.
- ANTONYM 은 antonym-surface-form-mismatch(기존 게이트, RELAXED 밖)가 relaxed 강등
  출하되는 사례 실측 — 어제 백로그의 "과엄격(varied↔uniform 차단)" 검토 대상.
- 주의: ST 문항은 Claude 심사(가혹) — 플랜 간 비교 오염, 플랜 내 비교만 유효.

## 검증 대기 가설 (우선순위순)
- H1: 어휘 계열(CONTEXT_MEANING/ANTONYM/VOCAB_CHOICE) KILLER 저점의 공통 fatal 이
  "타깃 단어 선정(평이/비중심)"인지 "오답 함정"인지 베이스라인 jsonl 로 분류 → 1개 직격.
- H2: ANTONYM surface-form 게이트 과엄격 — 실측 발화 사례를 모아 (a) 진짜 결함율,
  (b) 오탐율 판정 후 게이트 조건 정밀화(품사·형태 정규화) 또는 유지 결정.
- H3: SENTENCE_INSERT KILLER 저점 — 갭 후보 문장 선택(문두/문미 회피, 결속 단서)
  절차화로 개선 가능성.

## 시도 기록

### [26-07-06 iter1] 진단 — 베이스라인 48레코드(12유형×4셀) llmFatal 전수 분류 (H1·H2 검증)
- 데이터: postspine-baseline-20260706 (jsonl 104행 중 담당 48행). MOOD 는 베이스라인에 없음.
- **fatal 분류 (총 ~34건, 저점 셀 중심)**:
  - **오답 함정 약함(사전 수준·skim 소거) ≈ 47%** — ANTONYM 4셀(전부), VOCAB_CHOICE ST-K,
    IRRELEVANT ST-I/K, REFERENCE ST-I/K, SENTENCE_ORDER ST-I/K, CONTENT_MATCH ST-K, TITLE ST-K.
  - **타깃 선정(평이·literal·비중심·외국어) ≈ 26%** — CONTEXT_MEANING 3셀(coloratus=라틴어 인용어!,
    exceed×2=투명 직역어), IMPLIED_MEANING 4셀(comparable role/exceeded all others=literal, 비중심 타깃).
  - **정답 유일성/내적 일관성 ≈ 24%** — SENTENCE_INSERT ST-I/K(마커 번호 혼선 + 주어진 문장이
    병렬 예시 나열 구간의 두 갭에 모두 적합 → 복수정답 시비), TITLE/MAIN_IDEA 정답 과잉주장.
  - 해설 부실은 fatal 0건(major 로만) — 1차 병목 아님.
- **H1 판정: 둘 다이나 무게는 "함정 설계"** — 어휘 트리오의 공통 심층 원인은 "문맥 독립(사전 수준)으로
  풀리는 타깃/함정": ANTONYM 은 4셀 중 3셀이 **동일한 true–real**(동의어를 오답 짝으로) + 디코이 쌍 전부
  사전 자명쌍(long-short/oldest-newest/same-different). VOCAB_CHOICE ST-K 는 comparable→marginal 극성 반전.
- **H2 판정(ANTONYM 게이트): 이번 베이스라인 발화 2건 = 오탐 2건(오탐율 100%)** — 둘 다 PREM-I 의
  `varied ↔ uniform` "past/participle form 불일치". varied 는 분사형용사(attributive)로 uniform(일반 형용사)과의
  짝은 실전 정합. 이 오탐이 strict 2회 거부 → relaxed 강등(localScore 55, quality-mode-relaxed critical)
  → PREM-I 68 의 직접 원인. 진짜 결함(동사 시제 불일치 exceeded↔lag 류)은 이번 런에서 발화 0.
  → 조치: -ed 분사형용사 화이트리스트 + 짝 단어가 동사형이 아닐 때만 통과시키는 정밀화(게이트 유지).
- **프롬프트 절차화 현황**: CONTEXT_MEANING·VOCAB_CHOICE·SENTENCE_ORDER·SENTENCE_INSERT·IRRELEVANT·
  IMPLIED_MEANING 은 26-07-05 캠페인 절차화가 이미 존재(단 mc-prompts 최종수정 02:27 vs 런 종료 02:59 —
  일부 레코드는 구프롬프트로 생성됐을 가능성, 전후 비교는 iter3 재실측으로만 판정). **ANTONYM 만 절차화
  전무**(타깃 선정 기준·오답쌍 설계 절차 없음) — 최저점(58)이면서 유일하게 미절차화 → iter2 제1타깃.
- IMPLIED_MEANING 의 noncentral-target 거부 6건·absolute-giveaway 3건은 **게이트 정탐**(심사도 동일 지적)
  — 게이트가 아니라 생성기가 literal 타깃을 반복 선택하는 것이 문제(프롬프트에 literal 금지 명문화 필요).

### [26-07-06 iter2] 변경 — 공통 병목 "사전 수준 타깃/함정" 직격 + ANTONYM 게이트 정밀화
**추가 발견(스모킹건)**: ANTONYM true–real 반복의 진범은 모델이 아니라 **결정론 candidate block**
(candidate-blocks/antonym.ts). ANTONYM_SAFE_LEXICON 에 `true→suggestedWrongPair:"real"` 이 있고
블록 지시가 "suggestedWrongPair 가 있으면 자작 금지" + KILLER 지시가 "오답쌍=근접 동의어로" —
생성기는 지시를 **준수**해서 매번 true–real 을 출하했다. 프롬프트만 고치면 못 잡는 구조였음.
- 변경 1 (게이트 정밀화, H2): `src/lib/question-quality/validators/antonym.ts:283-299` —
  past/participle 검사에서 -ed 측이 분사형용사 화이트리스트(`ADJECTIVAL_PARTICIPLES`, :330,
  varied/limited/detached 등 54어)에 있으면 통과. 동사 굴절 불일치(exceeded↔lag, forces↔restrain,
  growing↔shrink)는 기존대로 차단 — **게이트 삭제 아님, 오탐 경로만 정밀화**.
  재현 테스트: `tests/unit/antonym-surface-form.test.mjs` (오탐 3케이스 통과 + 정탐 4케이스 유지) 그린.
- 변경 2 (ANTONYM 함정 설계 근본수정): `src/lib/question-quality/candidate-blocks/antonym.ts:117-145` —
  (a) Context-sense rule 신설(:126): 렉시콘은 최빈 의미 기준이므로 지문 의미가 다르면(common="공유된")
  그 correctAntonym 을 옳은 쌍으로 출하 금지 — 대신 그 불일치가 오답쌍(오축 함정) 재료.
  (b) INT/KILLER 오답쌍 설계 지시 교체(:129-137): 투명 동의어(true-real 류)·초등 기초어 정답 금지,
  1순위=오축 다의어 함정, 2순위=근접 뉘앙스 함정. 디코이 4쌍도 초등 사전쌍 최대 1개로 제한.
  (c) BASIC 은 기존 지시(suggestedWrongPair 사용) 유지 — 기존 유닛 계약 불변(antonym-contract 4/4 그린).
- 변경 3 (ANTONYM 프롬프트 절차화): `src/lib/question-prompts-vocab.ts:51-76` — 타깃 선정(기초어 5칸
  나열 금지, INT+ 문맥 의존어 최소 2개)·오답쌍 설계(난이도별)·자체 검증 4항 신설. 분사형용사 짝 허용
  명문화(:70). 게이트/블록/프롬프트 삼위 일치.
- 변경 4 (CONTEXT_MEANING): `src/lib/question-prompts-vocab.ts:13-16` — 외국어 인용어(coloratus)·
  고유명사·용어-언급(mention) 밑줄 절대 금지 + 선정 절차(후보 2~3개 나열→직역 즉답 검사→탈락) 신설.
- 변경 5 (VOCAB_CHOICE): `src/lib/question-prompts-mc.ts:316` — INT/KILLER 사전 반의어·극성 반전
  교체를 soft("최후의 수단")→**hard 금지**로 승격 + 자체 검증 3항(:320-323) 신설(관용구 내부 토큰
  디코이 금지 포함 — keeping 실측 대응).
- 변경 6 (SENTENCE_INSERT): `src/lib/question-prompts-mc.ts:405` — 규칙 3-1 신설: 병렬 예시 나열
  구간에서 "예시 전체를 아우르는 일반화 문장"은 어느 예시 앞에도 들어가 복수정답 → 폐기·재선정.
  제출 전 각 오답 갭 실제 대입 검사 의무화 (ST-K 62 fatal 직접 대응).
- 변경 7 (IMPLIED_MEANING): `src/lib/question-prompts-mc.ts:512` — 금지 대상에 "literal 사실 서술"
  추가 + 리트머스(표면 의미와 함축 의미를 각각 1문장으로 적어 같으면 탈락). noncentral 거부 루프 감소 목적.
- 변경 8 (IRRELEVANT): `src/lib/question-prompts-mc.ts:654` — **프롬프트 내부 모순 해소**: 규칙 5가
  However 로 시작하라고 권하고 규칙 7이 역접 금지하던 것을, 규칙 5에서 However/Yet/In contrast 시작
  금지로 통일(This/Such/Indeed 만 권장) + 최종 점검에 첫 단어 역접 검사 추가 (ST-I 68 fatal 직접 대응).
- tsc: 내 변경 파일 에러 0 (전체 1건은 타 에이전트 진행 중 파일 feature-margin.ts — 소유권 밖, 기록만).
- 유닛: antonym-contract 4/4·antonym-surface-form 3/3·vocab/insert/order/implied 계열 46/46 그린.

### [26-07-06 iter3] 재실측 판정 — 수정 6유형 × ST/PREM × KILLER (12셀, runs=1 attempts=2)
아티팩트: artifacts/ai-audits/loop-mcreading-iter3-20260706(.summary.json). 생성률 **12/12 = 100% 유지**.
플랜 내 전후(KILLER, 동일 지문 풀):

| 유형:플랜 | base→iter3 | 판정 |
|---|---|---|
| ANTONYM:ST | 58→**72** | ✅ true–real 소멸. 오답쌍=common–rare **오축 함정**(correctAntonym=distinct), true–false 는 디코이로 강등 — 설계 그대로 준수. 잔여 fatal=(D)common/(E)same 근접 중복(자체검증 4항 미준수 1건) |
| ANTONYM:PREM | 68→**98** | ✅✅ fatal 0. 오답쌍=common–rare(correctAntonym=separate). **varied–uniform 이 strict 1attempt 출하** — 게이트 오탐 소멸의 라이브 증거(전엔 이 쌍이 strict 2회 거부→relaxed 강등) |
| CONTEXT_MEANING:ST | 58→**78** | ✅ 외국어 타깃(coloratus) 소멸. 잔여 fatal=선지1·2 razor-thin(함정이 과약→과강으로 이동) |
| CONTEXT_MEANING:PREM | 75→75 | ➖ 'in keeping with' 투명 관용구 선택 — 선정 절차(직역 즉답 검사) 미준수, 무효과 |
| VOCAB_CHOICE:ST | 68→72 | ▲ 극성 반전(comparable→marginal)은 소멸했으나 대체가 여전히 반의어성(diversify→shun) + 인접 절 즉답 |
| VOCAB_CHOICE:PREM | 96→**98** | ✅ 유지+ |
| IMPLIED_MEANING:ST | 72→72 | ➖ noncentral 거부 4회→relaxed 재발. 리트머스 무효과 |
| IMPLIED_MEANING:PREM | 78→78 | ➖ 동일 literal 타깃('played a comparable role') 재선택. 리트머스 무효과 |
| SENTENCE_INSERT:ST | 62→58 | ▼(-4) fatal 이 baseline 과 **동일 실패 모드**(마커 번호 혼선+병렬 예시 다중 갭) — 신규 결함 0, 변경이 악화시킨 게 아니라 무효과+심사 노이즈. 규칙 3-1 미준수 |
| SENTENCE_INSERT:PREM | 96→96 | ✅ 무회귀 |
| IRRELEVANT:ST | 72→72 | ➖ 잔여 fatal="무관문이 원문 verbatim 아님" — **심사 루브릭이 유형 설계(무관문=창작 삽입문)를 오해**한 오탐성 지적. However-fatal 은 소멸 |
| IRRELEVANT:PREM | 97→88 | ▼(-9) major 1건: 무관문이 'however'로 시작 — 내 변경 8이 금지한 것을 미준수(fatal 아님). 원복하면 However **권장** 규칙으로 돌아가 더 나쁨 → 유지 |

집계: STANDARD 65.0→**70.7**(+5.7) · PREMIUM 85.0→**88.8**(+3.8) · 12셀 중 상승 5·동률 5·하락 2.
- **KPI**: 생성률 100% 유지 ✓ / F급(정답무효·누출·렌더) 신규 발생 0 ✓(잔여 fatal 은 전부 baseline 과 동일 모드거나 craft 계열) / ANTONYM true–real 반복 소멸 ✓ / antonym-surface-form-mismatch 발화 0 ✓ / relaxed 강등: ANTONYM PREM 소멸, IMPLIED 2셀 잔존.
- **후퇴 2셀 판별**: 둘 다 fatal 신규 발생 없음·실패 모드 baseline 동일 → 1런 노이즈+지시 미준수로 판정, 구조적 후퇴 아님. 원복 없음(원복 시 However 권장 모순·병렬 갭 무방비로 회귀).

### 종료 요약 (채택/기각/남은 가설)
- **채택**: 변경 1(게이트 정밀화)·변경 2(candidate block 오축 함정 설계)·변경 3(ANTONYM 프롬프트) — ANTONYM +14/+30 으로 실측 입증. 변경 4(CONTEXT_MEANING 외국어 금지) — ST +20. 변경 5(VOCAB_CHOICE hard 금지) — +4/+2 소폭. 변경 8(IRRELEVANT However 모순 해소) — ST fatal 소멸.
- **무효과(유지하되 효과 없음으로 기록)**: 변경 6(SENTENCE_INSERT 3-1)·변경 7(IMPLIED literal 리트머스) — 프롬프트 지시만으로는 미준수 재발. 해 없음이므로 유지.
- **H1 판정**: 함정 설계(47%)>타깃 선정(26%)>유일성(24%). 최다 병목이던 ANTONYM 함정 설계는 프롬프트가 아니라 **결정론 candidate block 이 진범**이었음 — "모델 미준수"로 보이는 결함도 먼저 결정론 주입물을 의심할 것(교훈).
- **H2 판정(종결)**: surface-form 게이트 이번 베이스라인 오탐율 100%(발화 2/2 전부 varied↔uniform 오탐) → 분사형용사 화이트리스트 정밀화로 해소, 정탐 경로(동사 굴절)는 유닛으로 고정. 게이트 유지·삭제 없음.
- **H3(잔존)**: SENTENCE_INSERT 다중 갭 복수정답은 프롬프트로 안 잡힘 → **결정론 검증기**(병렬 나열 구간에서 주어진 문장의 단서가 예시 계열 전체에 걸리는지 검출) 신설이 다음 수. validators/ 소유권 내 작업 가능.
- **신규 가설 H4**: IMPLIED_MEANING 은 이 지문에 은유·압축 표현이 사실상 없어(유일 후보 'constructed a chromatic universe'도 비중심) **지문 적합성 문제** — passage feasibility 게이트가 근본 해법. feasibility 는 공용 파일이라 오케스트레이터 소관으로 이관 제안.
- **신규 가설 H5**: 하니스 심사 루브릭이 IRRELEVANT 무관문에 "원문 verbatim"을 요구하며 유형 설계(창작 삽입문이 정답)와 충돌 — 심사 프롬프트의 유형 인지 보정 필요(하니스 공용, 오케스트레이터 소관).
- tsc 최종 0 (feature-margin 은 타 세션이 수정 완료). 커밋 없음.
