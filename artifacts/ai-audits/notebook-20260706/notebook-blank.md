# 빈칸 클러스터 연구노트 (26-07-06)

## 착수 시점 상태
- 26-07-05 대개편 반영됨: KILLER 단일빈칸 PARAPHRASE 강제(실측 확인), blankDesign 설계우선, 해설 4단 템플릿, killer candidate block 배선.
- never-fail 사다리로 blank-paraphrase-* craft 게이트 전부 salvage 강등 대상.
- 미검증: 세부설정(다중빈칸·부정 paraphrase·granularity)별 실패율/품질, BASIC 난이도, salvage 의존율.

## 검증 대기 가설 (우선순위순)
- H1: 다중빈칸(multi)·부정(negative) 설정 조합은 게이트가 빡빡해(slot-mismatch 계열) strict 수율이 낮다 → 실측 후 프롬프트 절차 보강.
- H2: KILLER PARAPHRASE 강제 후 오답(함정) 매력도가 병목 — killer-giveaway-distractors 발화율 측정 후 함정 설계 절차(정답과 같은 담화층위·반대 극성) 명시.
- H3: BASIC 셀은 과잉 게이트로 salvage 의존이 있을 수 있다 — 실측.

## 시도 기록
(에이전트가 append)

### [02:35] Iteration 1 — 커버리지 실측 (측정 전용, 코드 변경 = 하니스 env 추가만)
- 하니스에 `AUDIT_LOOP_SETTINGS_JSON` 추가 (scripts/audit-question-quality-loop.ts — per-type typeSettings 오버라이드, 미설정 시 기존 동작 동일, row 에 settingsOverride 기록). tsc 0.
- 런: `artifacts/ai-audits/loop-blank-iter1-20260706/*.jsonl` — 20런 (default 6 / multi2 4 / multi3 2 / dn 4 / para-int 2 / gran-word 1 / gran-clause 1), ATTEMPTS=2.
- **KPI**: 생성률 20/20 = 100% · strict-clean 19/20(95%, dn PREM INT만 1회 거부 후 성공) · salvage/notice 출하 0 · F급 출하 0. → G1/G2/G3 전부 그린. 병목은 순수 llmScore(craft).
- **커버리지 지도 (llmScore)**:
  | 변형 | ST | PREM |
  |---|---|---|
  | default BASIC (SOURCE_EXACT) | 62 | 75 |
  | default INT (SOURCE_EXACT) | 58 | 75 |
  | default KILLER (PARAPHRASE 강제) | 78 | 85 |
  | paraphraseAnswer=true INT | **83** | **96** |
  | doubleNegative=true INT/KILLER | 58/58 | **96/96** |
  | blankCount=2 INT/KILLER | 58/58 | 45/50 |
  | blankCount=3 KILLER | 58 | 65 |
  | granularity word/clause INT | 58/58 | – |
- ⚠️ 판정 비대칭: ST 문항은 Claude 심사(가혹, 58 군집), PREM 문항은 Gemini 심사. 플랜 간 비교는 오염, **모드 간 비교는 동일 심사자 내에서 유효** — 두 심사자 모두 paraphrase/DN ≫ SOURCE_EXACT ≫ multi 순위 일치.
- **H1 판정 (기각/수정)**: multi·DN 의 strict 수율은 문제 없음(전부 1~2 attempt 내 생성). 낮은 것은 품질 — multi 는 정답 조합이 verbatim-by-design 이라 심사자가 "copy-paste lookup" fatal (45~65, 최저 셀).
- **H2 판정 (채택)**: 함정 매력도가 전 셀 공통 병목 — 20런 중 fatal/major 에 distractor 약점 언급이 대부분. KILLER 78/85 fatal = "immediately/instantly 시간 거울 + 소재 이탈 짜깁기 오답". hasKillerBlankGiveawayCue 에 instantly/forever 등 부재 확인(gate 미발화). 추가 발견: KILLER 정답이 빈칸 문장 어절 1:1 동의어 치환(local restatement)이라 교차문장 종합이 불필요 ("wait a long time"→"endure a prolonged delay").
- **H3 판정 (기각)**: BASIC salvage 의존 없음 (strict clean, 62/75).
- **신규 발견 (SOURCE_EXACT 서사 모순)**: postprocess 가 정답 선지를 verbatim 으로 자동 고정(processors/blank-inference.ts:80)하는데 answerLogic/해설은 패러프레이즈 서사를 유지 → 심사 fatal "internally contradictory" (ST INT 58 의 주요 사유).
- 다음: iter2 = 함정 설계 절차 구조화(프롬프트+killer block+giveaway lexicon) — H2 직격.

### [03:05] Iteration 2 — 변경: 함정 설계 절차 구조화 + KILLER 로컬 재진술 금지 (가설 H2)
가설: 함정 매력도(소재 이탈 짜깁기·절대어 시간/극성 거울)와 KILLER 정답의 로컬 1:1 동의어 치환이 llmScore 병목 — 오답 절차를 구조화하면 KILLER/default 셀 점수가 오른다.
변경 (파일:라인):
- `src/lib/question-quality/validators/blank/paraphrase.ts:270` — hasKillerBlankGiveawayCue lexicon 확장(instantly/at once/right away/overnight/forever/permanently/utterly/totally/universally/invariably/unquestionably/undoubtedly/effortlessly/absolutely). 발화 임계(≥2) 유지. craft 게이트·salvage 등재 기존 그대로 → G1 무영향.
- `src/lib/question-quality/candidate-blocks/blank.ts:201,205-206` — killer block에 2c(교차문장 종합: 정답이 빈칸 문장 어절 1:1 동의어 치환 금지, 빈칸 밖 근거 2문장 종합 요구)·3c(소재 이탈 0개: 오답 전부 본문 개념 재활용)·3d(절대어 거울 금지) 추가.
- `src/lib/question-prompts-mc.ts:20-25` — 핵심 규칙 4를 "소재로 틀리게 만들지 말고 논리로 틀리게" 4원칙(본문 앵커링≥1개·verbatim 3단어 복사 금지 / 담화 층위·길이 통일 / 절대어 거울 금지 / 틀림 기제=논리)으로 재작성. 기존 "원문에 없는 표현" 문구가 오답을 본문에서 밀어내던 것을 교정. 자체 검증 2줄 추가(관련성·극성 스캔 소거 0개 / KILLER 로컬 재진술 재작성).
- `src/lib/question-type-generation-settings/dispatchers.ts:1200,1232` — multi/para 설정 블록 giveaway 단어 목록을 validator lexicon 과 동기화.
- 재현 테스트 신규 `tests/unit/blank-killer-giveaway-lexicon.test.mjs` — iter1 실측 오답 표면 5종 검출 + 정상 근접오답 3종 비검출(무회귀) + killer 게이트 발화. 3/3 pass. 기존 blank 계약 테스트 20/20 pass. tsc 0.
재실측: loop-blank-iter2-20260706 (default 6 + para-int 2 + multi2 4) 진행 중.

### [03:40] Iteration 2 — 재실측 결과·판정 (부분 채택)
- 12셀 비교 (iter1→iter2): 평균 68.6→69.8 (+1.2, 1런/셀 노이즈 지배). 생성률 12/12 유지·rejection 0·F급 0.
- 핵심 셀: **default PREM KILLER 85→96** (95-bar 진입, giveaway/소재이탈 fatal 소멸) · default ST INT 58→86 · multi2 PREM INT 45→62. 반대로 ST KILLER 78→72 · para-int ST 83→72 · multi2 ST INT 58→45 (동일 지문 반복 + 심사 노이즈).
- **질적 판정**: 오답 fatal 의 성격이 바뀜 — iter1 "소재 이탈 짜깁기·absolute 거울(instantly/forever)" → iter2 "과협소해서 소거 가능(too narrow)" 수준으로 완화. 오답 5개 전부 본문 앵커링된 KILLER 실물 확인. → 함정 구조화는 채택(유지).
- **신규 병목 발견 (iter3 대상)**: ST KILLER 72 의 진범은 오답이 아니라 **스팬 선택** — originalExpression 이 27단어 list-like 절(blank-paraphrase-target-too-wide + blank-target-list-like 경고 부착)인데도 그대로 출하됨. 원인 확인: **빈칸 craft 게이트 대부분이 SHIP-FIRST 전역 강등(core.ts:30 SHIP_FIRST_WARNING_CODES)이라 strict 에서도 warning** → 첫 후보가 무조건 출하, 교정 재시도가 한 번도 안 돎 (iter1~2 전 런 rej=0 의 정체). IMPLIED_MEANING 은 KILLER 한정 차단 예외(dispatcher.ts KILLER_IMPLIED_MEANING_BLOCKING_CODES)가 이미 있음 — 빈칸에는 없음. dispatcher 는 오케스트레이터 소유라 직접 수정 불가.
- 기각/보류: giveaway lexicon 에 swiftly 누락 실측(ST KILLER 오답 ① "swiftly established..." 미검출) → iter3 에서 추가.

### [03:50] Iteration 3 — 변경: KILLER 전용 craft 게이트 strict 차단 복원 (신규 비 SHIP-FIRST 코드)
가설: KILLER 빈칸 craft 게이트(스팬 폭·thin·giveaway)가 SHIP-FIRST 로 무력화되어 첫 후보가 그대로 출하 — KILLER 한정 신규 error 코드를 emit 하면 strict 재시도가 스팬·오답을 교정하고, relaxed 폴백은 미등록 error 를 자동 warning 강등하므로(run-question-generation.ts:643 실코드 확인) never-fail(G1) 무손상.
변경 (파일:라인, 전부 blank 소유 파일):
- `src/lib/question-quality/validators/blank/paraphrase.ts:239` — findBlankParaphraseKillerIssue 반환 코드 개명: blank-paraphrase-killer-too-easy→**blank-killer-thin-span**, blank-paraphrase-killer-giveaway-distractors→**blank-killer-giveaway-distractors** (KILLER 에서만 실행되는 함수라 다른 난이도 무영향).
- `paraphrase.ts:120` — 스팬 폭 게이트(>12단어/90자)를 KILLER 일 때만 **blank-killer-span-too-wide** 로 emit (다른 난이도는 기존 blank-paraphrase-target-too-wide 유지, 무회귀).
- `paraphrase.ts` lexicon 에 swift(ly) 추가 (iter2 실측 미러 오답).
- 사다리 검증: 신규 코드는 SHIP_FIRST(경고 강등)·RELAXED_BLOCKING(relaxed 차단) 어디에도 없음 → strict=차단·relaxed=강등 출하. salvage 등재는 constants 가 오케스트레이터 소유라 불가하지만 relaxed 단계에서 이미 자동 강등되므로 사다리 통과 동등(노트 명시).
- 테스트: blank-killer-giveaway-lexicon.test.mjs 확장(전체 파이프라인에서 blank-killer-span-too-wide 가 error 로 생존 = SHIP-FIRST 비강등 증명) 4/4 pass · blank-paraphrase-contract.test.mjs 코드명 2건 갱신 후 전체 그린(21/21) · tsc 0.
재실측: loop-blank-iter3-20260706/killer.jsonl (KILLER ST/PREM × 2런) 진행 중 — 관찰 지표: attempts/rejection(차단 작동 여부), relaxedFallback 율, llmScore.

### [04:55] Iteration 3 — 재실측 결과·판정 (부분 채택 + thin-span 원복)
- 4런 완료 (ST/PREM KILLER × 2지문, loop-blank-iter3-20260706). 생성률 4/4=100% · F급 0.
- **① 차단 작동 실증**: 3/4 런에서 strict rejection 발생 — 총 6건 (blank-killer-thin-span×5, blank-killer-giveaway-distractors×1). attempts 1→3. blank-killer-span-too-wide 는 미발화(iter2 프롬프트 효과로 스팬이 전부 컴팩트해짐 — 39번 지문 27단어→10단어).
- **② relaxedFallback 2/4** (PREM 2런 전부, 원인 100% thin-span) — notice 부착 출하. G3 기준(셀 relaxed율>50%) 위반 셀 발생.
- **③ llmScore**: PREM KILLER **95/96 (fatal 0)** — iter1 85·전일 최종스윕 78 대비 대폭 상승 유지(G4 무회귀 확인). ST KILLER 78/58 — 동일지문(39번) 비교 iter1 78→iter3 78 무회귀, 58은 신규 지문(41-42 장문)의 스팬 "위치"(담화 역할) 선택 미스 + Claude 심사 가혹(fatal="transitional remark, not controlling claim" — 게이트가 만든 후퇴 아님, 후보블록 thesis 랭킹의 장문 한계).
- **④ 결정적 발견 → thin-span 차단 원복**: PREM 2런에서 thin-span 게이트가 strict 를 소진시켰는데, relaxed 로 출하된 "4~8단어 컴팩트 스팬 + 문단 종합 정답" 문항을 심사자가 95/96(fatal 0, "answer neatly captures the logical flow of the entire paragraph")으로 극찬 — **단어수 미달은 결함이 아니라 오탐**. KILLER 아름다움의 실제 축은 스팬 길이가 아니라 정답의 교차문장 종합성(iter2 킬러블록 2c). → findBlankParaphraseKillerIssue 의 thin 분기를 기존 SHIP-FIRST 코드(blank-paraphrase-killer-too-easy, warning 출하)로 원복. giveaway/span-too-wide 차단은 유지(각각 iter1~2 실측 병목 직격).
- 원복 후 검증: blank 테스트 3파일 24/24 pass · tsc 0.
- 코디네이터 확인 반영: slot-mismatch 3종(verb-form/clause/stacked-prepositions)은 F급 원복됨(타 소유), 신규 KILLER 코드 2종은 strict 차단·relaxed 강등으로 의도대로 — 유지.

## 종료 요약 (26-07-06)
- **최종 상태**: 생성률 100%(전 28런) · F급 출하 0 · salvage(scarce) 출하 0 · relaxed 출하 2건(iter3 thin-span 실험분, 원복으로 재발 조건 제거).
- **채택 변경**: ① 하니스 AUDIT_LOOP_SETTINGS_JSON(추가 전용, 기본동작 동일) ② 함정 4원칙 프롬프트 재작성(question-prompts-mc.ts:20 — "원문에 없는 표현" 규칙이 오답을 본문 밖으로 밀던 것 교정) ③ 킬러 후보블록 2c(교차문장 종합)·3c(소재 이탈 0)·3d(절대어 거울 금지) ④ giveaway lexicon +15어(instantly/forever/swiftly 등) ⑤ KILLER 전용 strict 차단 코드 2종(blank-killer-giveaway-distractors·blank-killer-span-too-wide) ⑥ multi/para 설정블록 단어목록 동기화 ⑦ 재현테스트 blank-killer-giveaway-lexicon.test.mjs(4 tests).
- **기각/원복**: thin-span strict 차단(오탐 실측) · H1(multi/DN strict 수율 문제없음) · H3(BASIC salvage 의존 없음).
- **남은 가설 (미착수, 우선순위순)**:
  1. SOURCE_EXACT 서사 모순 — postprocess 가 정답을 verbatim 고정(processors/blank-inference.ts:80)하는데 해설·answerLogic 은 패러프레이즈 서사 유지 → 심사 fatal "internally contradictory". 프롬프트(SOURCE_EXACT 해설 규칙) + warning 게이트로 교정 가능. INT/BASIC(58~86) 최대 병목.
  2. multi-blank 정답 verbatim-by-design — 전 셀 최저(45~65). KILLER multi 패러프레이즈 강제는 run-question-generation(오케스트레이터 소유) 필요.
  3. KILLER 스팬 위치(담화 역할) — 장문에서 scoreThesisSentence 가 transitional 문장을 상위 랭크(ST run2 58 fatal). 후보블록 장문 보정 여지.
  4. ST(Gemini) KILLER 상한 78 — 동일 심사자 내 PREM 95+ 대비, 모델 역량 병목 가능성.
  5. 하니스 관찰: 판정 비대칭(ST 문항=Claude 심사(가혹, 58 군집)·PREM 문항=Gemini 심사) — 플랜 간 점수 비교 금지, 동일 심사자 내 모드 비교만 유효.
