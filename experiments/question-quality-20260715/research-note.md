# 전 유형 문제 생성 품질 연구노트

> ⚠ **이 파일은 원시 실험일지(append-only 아카이브)다.** 각 관찰의 "확정/기각/철회" 문구는 그 시점의 스냅샷이며 이후 관찰로 뒤집혔을 수 있다 — **현재 유효 결론과 트랙별 supersede 체인은 `research-ledger.md`(단일 진실원)가 담당한다.** 새 관찰은 여기 append 하되, 결론이 바뀌면 원장의 해당 트랙(§1·§2)을 같이 갱신할 것.

## 2026-07-20 새벽 KST — 배포 후 첫 실사용 배치: async E-gate 프로덕션 실가동 확증 + 수리본 형식 결함·검증비 원장 누락 발견

### O190. 프로덕션 첫 실사용 8문항(01:26 KST, 4지문 × 어법·빈칸 KILLER) — 워커 8/8 소화(3분 내)·수리 실효 1건 확증, 단 ①수리본 wrongOptionExplanations 배열형 렌더 파괴 ②워커 검증비 원장 미기록 ③cross-type 누출 4/4 전수 재확정

- 사용자 실사용 배치(7/20 01:26:17~01:27:15 KST, 배포본 프로덕션): 4지문 각각 빈칸+어법 KILLER 1쌍, 8잡 전부 COMPLETED·1-attempt·relaxed 0. 운영 config 실측 확인 = **pro(gemini-3.1-pro-preview) 생성 + flash 솔버 게이트 + grok 검증(async)** — grok 생성 env 미설정 상태 그대로. `requestedGenerationPlan=STANDARD`가 PREMIUM으로 승격 기록 — W2-E 통합 라우팅 프로덕션 정상.
- **async E-gate 실가동 확증(배포 체크리스트 항목 해소)**: 8/8 `PENDING` → 워커 PATCH 완료(생성 후 71초~3분), 최종 VERIFIED 5 + VERIFIED_REPAIRED 3, FAILED 0. 수리 중 1건은 실질 교정 — 어법 d7cqjm의 pro 해설이 오류 위치를 "that절 진주어 술어 부족"으로 오분석한 것을 grok 수리가 "while 부사절 they의 정동사(are) 자리"로 정정(문항 본체 무변경). **O156 계보의 verify→repair 루프가 프로덕션에서 밥값 한 첫 실측.** O188의 "워커 미구동 = PENDING 무검증 출하" 리스크는 프로덕션에선 비발생.
- 시간(잡 durSec): 빈칸 12/10/31/63s(평균 29s), 어법 49/59/62/76s(평균 62s) — 인라인 grok 검증 시대(O186 174~275s, O188 어법 274s)의 임계경로 문제가 분리로 해소된 실측. 사용자 체감 대기는 생성만, 검증은 배경 완결.
- 원가(원장 RECORDED, 생성만): 빈칸 47/44/41/105원=237원, 어법 125/99/112/166원=502원 — 합 739원, 평균 92원/문항(어법 126원·빈칸 59원). 어법 166원 건은 사다리 내부 재시도(answer+decoys 2회분 6콜). **주의: 검증·수리 grok 콜은 원장 0행(아래 결함②) — 이 평균은 생성비만이다.**
- **결함① (수리본 형식 파손, 리페어 도입 이래 잠복)**: `EXPLANATION_REPAIR_SCHEMA`(explanation-verify-gate.ts:62)가 wrongOptionExplanations를 `{label, explanation}[]` **배열**로 출력하고 인라인·워커 양쪽이 `{...question, ...repair.object}`로 원계약(`Record<라벨, 문장>`) 위에 그대로 덮어씀 → VERIFIED_REPAIRED 3문항 DB에 배열 잔존. 렌더러(question-renderer-primitives.tsx ExplanationSection·question-renderers.tsx 오답 분석)는 `Object.entries` 객체 가정 — 배열이면 라벨이 0/1/2로 뜨고 객체가 React child로 들어가 해설 뷰 파손. 수정 = 게이트 1지점에서 배열→객체 정규화 + 기존 배열 데이터 정규화 마이그레이션(+렌더 방어).
- **결함② (검증비 원장 실명)**: 워커 runExplanationVerifyGate 호출에 onModelUsage 미배선·recordPlatformApiUsageCost 부재 → 배치 시간창 내 원장 grok 행 0(실측). 인라인 시절 검증비는 잡 경유로 기록됐으나 async 분리 후 검증·수리비가 청구 추적 불가 — 원가 지도 "E-gate +44원/문항"은 인라인 실측이므로 async 검증비 계측은 현재 공백.
- **cross-type 표적 중복 4/4 전수 재확정(O188·O189 확정판)**: 지문1~3은 빈칸 문항 지문이 어법 정답 원형(take / are speaking / stretches)을 그대로 노출, 지문4는 어법 밑줄 문장(undone→undoing 변형)이 빈칸이 뚫은 표적 문장 그 자체 — 같은 지문 쌍 생성 시 상호 누출이 예외가 아니라 **기본값**임이 확정. 유형 간 usedTargets 공유(지문 단위 표적 원장) 과제 우선순위 상향 근거.
- 품질(8건 전수 판독): 어법 4/4 포인트 유효·오콜 0(정동사 taking→take / while절 being→are / 강조구문 수일치 stretch→stretches / 분사 태 undoing→undone), 선지 전부 방어 가능. 빈칸 4/4 정답 유일성 방어 가능, 최고작은 105원/63s 우주팽창 빈칸(통념vs진실 극성 설계·경고 0·A-급) — **O188 "최고가 런이 최고 품질" 재재현(2연속)**. 빈칸 3/4에 `blank-paraphrase-killer-too-easy` 잔존(pro 생성 병목 그대로), 빈칸 정답 위치 ③③③④ — 지문이 달라 diversity 스티어링 미작동 구간의 ③ 편중 관찰. 외국어 혼입 0(pro 생성이라 비교군 아님 — grok 전환 후 게이트 발화 관찰 필요).

### O191. O190 결함 2건 수정 + grok 생성 운영 전환 배포(7/20, 사용자 승인 "빈칸이랑 어법")

- **결함① 수정**: 게이트 1지점 정규화 `normalizeRepairedWrongOptionExplanations`(수리 배열형→Record, 빈 배열은 원본 유지) + repairAdopt 회귀 테스트 추가(2/2 통과). **기존 DB 배열형 8문항**(7/20 배치 3 + 인라인 수리 시절 5 — cmron*×3·cmrove*·cmrp9il9l) structuredData·QuestionExplanation 양쪽 정규화 마이그레이션 적용, 재스캔 0건.
- **결함② 수정**: 워커에 onModelUsage→recordPlatformApiUsageCost 배선(sourceKey `workbench_ai_job:{jobId}:explverify:{questionId}:{idx}` 결정적·재시도 멱등, sourceDetail EXPLANATION_VERIFY:{subType}), fast 라우트 페이로드에 jobId 조인 추가. 부수: providerFromModel 에 x-ai/grok 게이트웨이 버킷 추가(기존 grok 29행 UNKNOWN 분류 교정 — 신규 행부터).
- **grok 생성 전환(사용자 결정)**: Vercel production env 3개 등록 — PREMIUM_QGEN_MODEL_ID=x-ai/grok-4.5(빈칸+선택형6, 선택형은 같은 env 라 동반 전환), GRAMMAR_PREMIUM_MODEL_ID=x-ai/grok-4.5(어법 사다리), OPENROUTER_REASONING_EFFORT=high(gemini 는 OPENROUTER_GEMINI_REASONING_EFFORT="" 별도 보호 — 프로덕션 실측 확인). 어법 사다리 175~274s vs 270s 데드라인 리스크는 사용자가 인지하고 수용(전면 전환 선택).
- 배포: 커밋 b3639625(수정)·55c624b0(연구 기록) 푸시 → vercel --prod READY(nara-9a0wsnh2y) + Trigger 20260719.1(12태스크) — 스모크 307 정상. **현 프로덕션 스택 = grok 생성 + grok 검증(async) + flash 어법 솔버.** 다음 = 실사용 재실측(원가 지도 갱신: 검증비 원장 포함 전체 원가·어법 데드라인 근접률·외국문자 게이트 발화).

## 2026-07-18 새벽~오전 KST — 통합구현 이후 실측: 결정전 config 부적합, 어법·빈칸 grok×grok 최초 인라인 실측(fail-open 실관측), async E-gate 분리

### O185. 결정전(9유형 flash vs grok) 발사 — grok 런은 STANDARD 60초 시간창 부적합으로 무효, 결정전 미완

- 03:18~03:30 KST, decider-flash-v1 + decider-grok-v1: 9유형(순서·삽입·요약MC·무관·어휘·요약서술·핵심빈칸·배열·고쳐쓰기) × STANDARD 경로 funnel, 신규 게이트·acceptedAnswers 계약 가동 워킹트리. 목적: O183 "모델 무관 구조 부채" 교정 후 재평가(로드맵 2순위 실측).
- grok 런(env: OPENROUTER_STANDARD_MODEL=x-ai/grok-4.5, OPENROUTER_REASONING_EFFORT=high, QGEN_RESEARCH_MAX_TOKENS_FLOOR=20000): 36콜/36슬롯, 수락 3 — 요약MC 2/2·핵심빈칸 1/1, **6유형 후보 0**. 실패 콜 전원 "Invalid JSON response", 대부분 정확히 60.0s(일부 19.9s = 잔여예산 클램프 재시도). $0.108.
- **근인(코드 확정): STANDARD 플랜 콜 시간창 = GEMINI_QUESTION_TIMEOUT_MS 기본 60_000ms(question-generation-llm.ts:32, flash 기준 설계).** grok@high 성공 콜 실측 35.7~55.4s(추론 1.1~3.4k tok) — 느린 콜이 창을 넘겨 응답 절단. **품질 데이터가 아니라 config 부적합 — grok 기각 근거로 쓸 수 없음.**
- 부수: EXPLANATION_VERIFY_MODEL_ID=grok 을 세팅했으나 9유형 전부 E-gate 비대상(대상=어법·빈칸+선택형6) → 검증 콜 0. "생성 grok×검증 grok 인라인 stack"은 이 배치가 검증하지 못함(그 검증은 O186).
- flash 런: 산출물 확보(batches/decider-flash-v1/), 블라인드 평가 미착수.
- 상태: **결정전 미완.** 재실행 설계 = grok 런 GEMINI_QUESTION_TIMEOUT_MS 상향(예 240_000) 후 flash 런과 짝 블라인드.

### O186. 어법·빈칸 grok 생성×grok 검증 최초 인라인 실측(로컬 fast 경로) — fail-open 실관측, 블로커는 모델이 아니라 "느린 생성+느린 검증 인라인 직렬"

- 7/18 새벽 로컬 dev, fast 라우트(deadline 270s), KILLER, 6월모평 39·40 지문. 03:15 배치 = pro 생성+grok 검증(코드 기본값), 03:47 배치 = .env.local grok 생성 전환(GRAMMAR_PREMIUM_MODEL_ID·PREMIUM_QGEN_MODEL_ID=x-ai/grok-4.5, reasoning=high). **캠페인 grok 배치는 전부 verify=pro(스펙 확인), O184는 오프라인 벤치 — 두 느린 grok이 한 요청에 함께 돈 것은 이번이 처음.**
- 총시간: pro 85.6/126.5/130.3/250.5s vs grok 174.7/273.5/275.2/275.2s. grok 생성 콜 69~152s(pro 5~47s) → 어법 2건 275s 벽 도달.
- **fail-open 실관측(O153/O163이 경고한 그 경로의 인라인 첫 재현)**: 어법 2건 repair 타임아웃(0원 미과금 콜), 빈칸 1건 EXPL-VERIFY-FIX 타임아웃 → "[EXPL-VERIFY] gate call failed; passing without verdict" 무검증 출하, GRAMMAR-SOLVER 게이트도 타임아웃 스킵.
- 원가: fast 경로 grok 151~245원 vs pro 84~234원. "grok 재시도 감소로 동급 이하"(O178·O181)는 funnel 하네스(인라인 데드라인 없음) 한정 — 인라인 경로 미성립. **원가·시간 결론에는 측정 경로 명기 규칙 채택.**
- 품질(같은 지문 4v4 단독 판독): 2:2. 단 어법 craft grok 우위(관계절 정동사 함정 + 직전 배치 정답 creating을 적법 선지로 재배치한 역함정), 빈칸 grok 1건 정답 선지 영어 어색("state-run legal claims safeguards" 명사 적층). pro 어법 1건(39지문)은 게이트 자체 경고 3건 부착 출하 — grammar-too-basic-decoys("its" 약미끼)·grammar-marker-too-dense·grammar-killer-generic-answer-point, _reviewRecommended. blank-paraphrase-killer-too-easy는 pro·grok 공통 잔존 — 약미끼·얕은 패러프레이즈 모두 생성 프롬프트 축 과제.
- 방법론: 외부 LLM 평가자의 "확신형" 치명 판정 2건이 검증에서 오콜로 확정 — ① explains 수일치를 "or 병렬 최근접 일치"로 오분석(실제 핵은 단수 growth; of-구 병렬은 등위 주어가 아님) ② 빈칸 ② 복수정답 주장(지문 잔존 문장 "provides a basis for depth of aesthetic processing"이 직접 반증). 확신 프로즈 ≠ 검증 — E-gate를 적대·fail-closed로 설계한 이유의 재확인.
- 판정: grok 생성 자체는 유효(품질·원가 캠페인권 재현). **블로커는 아키텍처 — 해소는 O187.**

### O187. async E-gate 분리 리팩터 — 구현·검수 완료(5파일), 커밋·배포 승인 대기

- 사전 확인: "행콜 수리"(W2-A, ATLAS_MODEL_CALL_TIMEOUT_MS 240s)는 개별 콜 hang용으로 stack 초과와 무관 — async 개선은 이전에 존재하지 않았음(git·코드·본 노트 전수 확인 후 착수).
- Part A(인라인 안전가드): explanation-verify-gate.ts 최소예산 가드(기본 190_000ms, env EXPLANATION_VERIFY_MIN_BUDGET_MS) — 남은 예산 미달 시 검증 시도 없이 `_explanationVerifyStatus="SKIPPED_BUDGET"` 표시(반려 아님). **조용한 fail-open 제거.**
- Part B(임계경로 분리): fast 라우트 `deferExplanationVerify=true` → 인라인 게이트 스킵·PENDING 표시, 저장 후 Trigger.dev `workbench-explanation-verify` 인큐(.catch로 생성과 격리 — 워커 부재 시에도 생성 무영향). 워커: PENDING만 처리(멱등), deadline 480s, 수리 채택 시 QuestionExplanation+structuredData 트랜잭션 PATCH, 상태 VERIFIED/VERIFIED_REPAIRED/FAILED(+`_explanationVerifyIssue`). trigger.config syncEnvVars에 EXPLANATION_VERIFY_* 8키 동기화.
- 검수 게이트: tsc 무필터 0에러, enforce-차단(continue) 경로 보존 확인, defer/PENDING 상호배타, E-gate 단위테스트 2/2, 스키마 마이그레이션 없음(structuredData JSON).
- semantics 변화(사용자 승인 필요 사항으로 명시): fast 경로 enforce = "차단·재생성" → "출하 후 표시(ship-then-flag)". AI 문항 approved=false 교사 승인 게이트가 백스톱. 생성은 트리거 무경유 — 검증만 오프로드.
- 상태: 커밋·배포 미실행. 다음 = 로컬 grok×grok 재실측(생성 데드라인 완주 + 워커 PATCH 확인) → 커밋 → vercel --prod → grok 운영 env.

### O188. async E-gate 1차 실전(로컬 16:53~16:58 KST, grok 생성 4문항) — defer 정상 작동·fail-open 소멸, 단 워커 미구동 시 PENDING 무검증 출하의 실비용 즉시 실증

- 사용자 로컬 생성 4문항(6월모평 36·37 지문, 어법·빈칸 × KILLER, grok@high 생성 유지): O187 리팩터 적용 첫 실전. **4/4 `_explanationVerifyStatus="PENDING"` 정확 표시, 인라인 검증 콜 0, fail-open 로그 0(구조적 소멸).**
- 시간·원가(DB 원장, 잡↔문항 questionIds 확정 매핑): 빈칸36 79.1s/68원(1콜) · 빈칸37 148.5s/145원(2콜) · 어법37 175.5s/126원 · 어법36 274.3s/110원 — 합 449원(평균 112원). 리팩터 전 grok×grok 인라인(O186: 174~275s·708원) 대비 시간·비용 동시 개선. **역설: 최저가·최속 런(빈칸36, 1콜 무수리 통과)이 中文 혼입 오염 문항을, 최고가 빈칸 런(빈칸37, 게이트 반려→2콜째 수리)이 경고 0 A-급을 냄 — "싸고 빠른 런 ≠ 좋은 품질", 게이트 루프가 밥값을 한 실측.** 신규 게이트 후보: 해설 필드 CJK/한자 혼입 결정형 검출(정규식 0원 — 连接류 즉시 차단, E-gate 대기 불요).
- **PENDING 적체의 실비용 실증**: Trigger 워커 미구동 상태라 4문항 무검증 대기 — 그중 빈칸 36번 해설에 **중국어 혼입("…뒤따른다고 连接한다", V4급 한국어 손상)이 무검증 출하**. 빈칸은 E-gate 대상이라 워커 구동 시 포착 기대 — "async = 워커 상시 구동이 운영 전제"가 배포 체크리스트 항목으로 승격.
- 잔존 과제 재확인: 어법 36번은 사다리 repair 콜이 125.2s·0토큰으로 사망(270s 데드라인 클램프 abort) → `grammar-shallow-participle-adjective-answer`·`grammar-weak-filler-decoys`("it" 약미끼) 잔존 출하. grok 어법 사다리 생성 자체 속도(274s)는 O187 이후에도 데드라인 코앞 — 원장 §2.3 미결 그대로.
- 세트 설계 관찰: 37번 지문의 빈칸(정답: think systematically and understand... 패러프레이즈)과 어법((E) understanding→understand)이 **같은 문장을 표적** — 한 시험지에 동시 출제 시 상호 누출 위험. 같은 지문 다문항 생성의 표적 중복 회피는 diversity 컨텍스트의 미커버 축(신규 관찰).

### O189. 통합 라우팅 첫 혼합 배치(로컬 19:25, 37번 지문 × 6유형) — 라우팅·defer 대상판정 정확, 그러나 ①grok 해설 외국어 혼입 재발(패턴화) ②flash 콤보 V4 무방비 ③유형 간 표적 중복(세트 누출) 대규모 확정

- 같은 지문(6월모평 37번 HRD) 6유형 동시 생성: 어법·빈칸→grok PREMIUM(112.7/148.2s·93/111원, PENDING 표시), 콤보·순서·어휘·삽입→flash STANDARD(15.6~33.8s·38~115원, 검증표시 없음=비대상 정확) — resolveUnifiedGenerationPlan·defer 대상판정 실전 정상. 합 487원.
- **grok 해설 외국어 혼입 2례째**: 빈칸 해설 "들어 steals다"(영단어 삽입) — O188 中文 "连接"와 동계열(V4). 산발 아닌 **패턴** → 해설 필드 비한국어 토큰(CJK·라틴 혼입) 결정형 검출기(O188 등록 후보)의 우선순위 상향. 오답 설계 자체는 준수(주체/범위 비틀기), killer-too-easy 경고 동반.
- **flash 콤보 V4 해설-표적 불일치**: 렌더 (A)=practices [what/that](주격 관계사 자리)인데 해설 (A)는 존재하지 않는 responsibility 동격절을 "완전한 절이 뒤따르므로 동격 that"으로 설명(+"복수 비동사" 오타). 정답 키(⑤)는 우연히 유지, 근거는 허구. **콤보는 E-gate 비대상이라 async 검증으로도 미포착** — O181 "기타 유형 병목=검증 부재"의 프로덕션 라이브 재현. E-gate 대상 확장(콤보 등) 또는 앵커 정합 게이트 필요.
- **유형 간 표적 중복(세트 누출) 대규모 확정**: 삽입의 주어진 문장("Instead, … become learning facilitators")이 빈칸이 뚫은 표현 그 자체 — 삽입이 빈칸 정답을 지문째 노출. 어법 (C) encourage·어휘 indispensable↔insufficient 가 같은 문장, 콤보 (C) advise 는 어법37(O188)의 understand 와 같은 문장군. **diversity 컨텍스트는 동일 유형 내 회피만 하고 cross-type 표적 중복은 미커버** — O188 2문항 겹침 관찰의 확정판. 신규 과제: 유형 간 usedTargets 공유(지문 단위 표적 원장).
- 부수: grok 어법 정답 포인트 3연속 병렬(understanding→stimulating→encouraging) — 포인트 다양성 스티어링 필요. flash 순서/어휘/삽입은 신규 게이트(T9·T10) 아래 형태 결함 0으로 통과(순서 1회 반려 후 재생성, 삽입 외부 재시도 1회) — 구조 무결 축은 긍정 신호, V4 축은 여전히 블라인드.

## 2026-07-17 저녁 KST — 프로덕션 첫 실전 배치 전수감사 → STANDARD 근본수술 라운드 개시 (사용자 지시: "어떤 방식을 동원해서라도 STANDARD 빈칸·어법을 해결")

### O163. 실전 배치 22문항(전부 KILLER) 전수감사: PREMIUM은 구조 증명, STANDARD는 두 셀 다 붕괴

- 7/17 16:33~16:55 KST 사용자 실사용 배치. 원장 실청구 조인 + 블라인드 평가(솔버2+감사자+조정자, 70에이전트, `runs/campaign-20260716/eval-jul17-prod/`).
- 원가: PREM빈칸 72원(콜 정확히 2: pro생성+pro검증, 5/5 첫시도), PREM어법 136원(사다리 4~9콜, 6/6 첫시도), STD빈칸 107원, STD어법 331원(4/5가 3-attempt, 생성콜 입력 ~25k tok ≈ 80원/발).
- 품질(F): PREM빈칸 0/5, PREM어법 1/6, STD빈칸 4/6, STD어법 5/5. V2 붕괴 확정 2건(J007 어법: guiding 축약관계절 성립+정답누출 / J017 빈칸: 앵커 삭제로 ②⑤ 복수성립). A등급 0/22, killer조건충족 3/22.
- E-gate warn 판정의 블라인드 검증: "수리 후 잔존" 경고 출하 3건(J007/J009/J011) 전부 감사 F — 게이트 판정은 정확했고 warn이라 출하됐다. 장애 시간대(잔액 0) fail-open 통과 2건(J002/J017)이 F에 포함 — fail-open의 실비용 확인.
- 잔액 고갈 장애: 캠페인 지출($24.44)이 프로덕션과 같은 OpenRouter 계정을 소진시켜 16:33 6건 연속 500. 학원 크레딧 전액 자동환불 확인. 재발방지 규칙: 배치 발사 전 `GET /api/v1/credits` 필수.

### O164. STANDARD 빈칸 F 3건의 근인은 "span 경계 선택" 단일 클래스다 — 지문 재작성 훼손이 아니다

- 원지문 vs 렌더 지문 문장 단위 diff: 세 건 모두 **빈칸 문장 외 전 문장 바이트 동일**. 훼손은 빈칸 문장에 국한.
- J001: 원문 "…success, if it involves vulnerable groups, cannot be denied." → span이 삽입구 중간(첫 콤마 직후)부터 문장 끝까지 걸쳐 "…success, _____." 고아 콤마+비문 이음새. J012: 서사 지문에서 **문장 전체를 통삭제**("Singapore. _____. That was why…") — 빈칸이 고아 문장 파편. J017: span("establish interpersonal connections…organizational culture")이 해당 개념의 **지문 내 유일 앵커**여서 삭제 즉시 정답 ②의 텍스트 근거 소멸 → ②⑤ 복수성립(V2).
- 시사: (a) 전문장 blank·삽입구 절단은 결정형 규칙으로 사전 반려 가능. (b) 유일-앵커 삭제는 의미 검사 필요(결정형 불가) — E-gate 또는 생성 프롬프트의 span 선정 지침으로 공략. (c) J017 렌더의 비문("allows them ... chooses")은 원지문에 이미 존재 — 소재 지문 결함은 별도 축.

### O165. KILLER 어법 원가 역전: pro 사다리(136원)가 flash 3-attempt(331원)보다 싸고 품질도 압도

- flash는 KILLER 게이트(overdrilled/shallow/generic-point)에 계속 반려당해 25k tok 프롬프트를 3라운드 소모하고도 V4 전멸. pro 사다리는 첫 시도 통과 6/6, F 1/6(그마저 fail-open 출하분).
- 가설 H-STD-4(아래)로 등록: STANDARD KILLER 어법을 내부적으로 pro 사다리에 라우팅하면 원가 절반+품질 회복. 판매가(146~264원) 대비도 흑자.

### 가설 등록부 — STANDARD 근본수술 라운드 (잔여 예산 344 slot, 잔액 $47.26)

| ID | 가설 | 검증 방법 | 예상 원가영향 |
|---|---|---|---|
| H-STD-1 | 빈칸 span 결정형 게이트(전문장 금지·삽입구 절단 금지·verbatim indexOf 계약)로 V1/V3 seam 결함 클래스 제거 | 결함 프레임 재생 + 신규 paired | +0원 (결정형) |
| H-STD-2 | seam 기계 패턴 게이트(", _____." 고아콤마, "_____." 단독문장, 이중구두점) → 반려 시 표적 피드백 재시도 | 〃 | 재시도분만 |
| H-STD-3 | E-gate 수리 모델 flash→pro 스왑(STANDARD 어법): V4 잔존 3/5의 근인이 "flash는 구조분석을 수리 못함" | paired n≥10 | +10~20원/문항 |
| H-STD-4 | STANDARD KILLER 어법 → pro 사다리 내부 라우팅 | paired n≥10 | −195원/문항 (역전) |
| H-STD-5 | 프롬프트 다이어트(어법 25k tok의 몸통 규명 후 positive-compact 재설계, G2 계보) | 섹션 해부 후 paired n≥15 | −40~60원/발 |
| H-STD-6 | (제품) KILLER 난이도는 PREMIUM 전용으로 제한 — H-STD-4가 참이면 라우팅으로 충분, 거짓이면 제품 결정 | H-STD-4 결과로 판정 | — |
| H-STD-7 | 빈칸 span의 "유일 앵커 삭제" 방지: 생성 프롬프트에 span 선정 계약(삭제 후에도 정답 추론 사슬이 지문에 잔존해야 함) 명시 + E-gate V2 확장 | paired n≥10 | 프롬프트만 |
| H-STD-8 | STANDARD 어법 해설만 pro가 작성(생성은 flash, 해설 분리 콜): V4 근인이 flash의 구조 오분석이므로 수리가 아니라 작성을 위임 | paired n≥10 | +15~25원/문항 |
| H-STD-9 | INTERMEDIATE STANDARD는 현행 유지 가능(붕괴는 KILLER 국한)인지 기준선 측정 | INT n=10×2유형 평가 | — |

### O166. 포렌식 확정: 빈칸은 이미 코드 splice, 어법 비대의 몸통은 typePrompt 17KB+후보블록 30KB, 빈칸 contract 는 유형 미등록으로 28KB 통짜 수신

- 빈칸 조립: LLM 은 passageWithBlank 를 출력하지 않는다 — originalExpression(축자 span)+surroundingText 만 내고 서버가 splice(`question-postprocess/processors/blank-inference.ts:90`). 즉 O164 의 seam 결함은 전부 "span 선택" 결함이고, 기존 게이트에는 전문장 span·삽입구 절단 검사가 없었다(가장 근접한 것은 선지-경계 중복 검사뿐).
- 어법 STANDARD 프롬프트 비대: ① `STRUCTURED_TYPE_PROMPTS.GRAMMAR_ERROR` 상수 13,986자(빈칸의 2.6배) ② `buildGrammarErrorCandidateBlock` ~30KB(가드레일 13KB+9프레임+포인트카탈로그+**지문 재열거로 지문 2회 인쇄**). ③ 반면 contract tail 은 어법만 유형 필터 등록(~5KB), **빈칸은 미등록이라 full tail 29,587자를 통째로** 받고 있었다.
- 재시도 사다리: STANDARD 어법 KILLER strict cap 4, 시도 간 한국어 교정 피드백 주입(`appendGrammarRetryDirectives`) — G2 가 customPrompt 를 지워 이 채널을 끊었던 것이 수락률 붕괴(2/10)의 유력 공범.
- E-gate 수리 콜은 `generationPlan:"STANDARD"`(=flash) 하드코딩이었다 — V4 잔존 3/5 의 구조적 원인 후보(flash 는 자신이 오분석한 구조를 수리에서도 오분석).

### O167. 구현 출하(무API 검증 완료): span-carve 게이트·빈칸 contract 다이어트·G4 프로필·E-gate 수리모델 env·러너 funnel 모드

- `validators/blank/span-carve.ts` 신설: `blank-span-full-sentence`(전문장 빈칸+소문자 술부 선지), `blank-span-clause-carve`(콤마 직후 시작+span 내 콤마+주어NP 선행). 단위테스트 3/3(J001·J012 재현 차단, 건강 span 4종 통과). **DB 500문항 오탐 스캔: 발동 5건 = 실전 F 2건(J001·J012) + 소문자 문두 실결함 3건 — 오탐 사실상 0.** 문두 부사구 관용("After all,"류) 오탐 4건은 주어NP 화이트리스트로 제거, 인용부호 문장분리 버그도 수정.
- `CONTRACT_TYPE_SECTIONS` 에 BLANK_INFERENCE 등록: 빈칸 contract 29,587→13,052자 (**콜당 16,535자 절감**, 자기 세그먼트 전량 보존).
- G4_DIET_GUARDED 프로필: positive-core typePrompt(960자) + diet 후보블록(30KB→15KB: 지뢰지도·KILLER 사전판정·결핍모드·게이트짝 규칙 보존, 9프레임·카탈로그·해설공예지시·지문재열거 제거) + customPrompt(재시도 피드백 채널) 유지. **콜당 총 ~29KB 절감.**
- `EXPLANATION_VERIFY_REPAIR_MODEL_ID` env: E-gate 수리 모델 스왑(H-STD-3 검증용, 미설정 시 바이트 동일).
- 러너에 `funnel:true` 모드 추가: `runQuestionGenerationWithEmptyRetry`(strict 다회→rescue→relaxed→salvage) 풀 깔때기 실행. 전체 tsc 0 에러.

### O168. 스모크(stdfix-smoke-v1, 7 slot, $0.28): funnel·A-NEW 정상, G4 는 2/2 반려로 G2류 붕괴 신호

- A-NEW(빈칸 funnel, span게이트+contract다이어트): 2/2 첫시도 수락, ~50원/문항(E-gate warn pro검증 포함).
- B2-STD(어법 funnel): 3 candidate 소모 후 수락, 207원 — 프로덕션 꼬리 재현 확인.
- B1-G4: 2/2 게이트 반려 (marker-too-dense, killer-overdrilled, underline-wide, keypoint-mismatch, terminology-register 등) — 단발이라 교정 루프 없음 감안해도 G2류 신호. G0 짝비교(n=12)로 델타 실측 후 판정.
### O169. B1 판정: 어법 다이어트(G4) 기각 — 수락 1/12 vs G0 6/12. 17KB 가드레일은 밥값을 한다

- 단발 짝비교(confirmatory 12쌍, KILLER): G0 수락 6/12, G4 1/12. 콜 단가는 G4 가 44% 저렴하나 **수락당 원가 G0 $0.106 vs G4 $0.357 (3.4배 악화)**. H-STD-5 의 "positive-core 전면 교체" 계열은 G2(2/10)에 이어 재확인 기각.
- 반려 해부의 교훈: G4 는 marker-too-dense 4건(G0 0건) — **지문 재열거(문장 번호 목록)는 낭비가 아니라 마커 분산 장치였다.** 9프레임/카탈로그 제거는 overdrilled·shallow-participle 재발과 동행. "지문 2회 인쇄 제거"조차 공짜가 아님이 실측됨.
- 미검증 잔여 가설(등록만): G5 = 현행 typePrompt 유지 + 후보블록에서 9프레임/카탈로그만 제거(재열거·가드레일 보존, ~-17KB). 지금 라운드에서는 실행하지 않는다.
- 단발 G0 50% 수락은 프로덕션 3-attempt 꼬리의 산술적 근거: 0.5 수락률이면 기대 attempts ≈ 2, cap 4. 어법 STANDARD 의 원가 문제는 프롬프트가 아니라 **flash 의 KILLER 소재 선택 능력** — 라우팅(B2)이 정답일 가능성에 무게.

### O170. 빈칸 A-NEW 풀 깔때기: 12/12 수락, 중앙 ~67원, 재시도 동인은 전부 '진짜' 공예 게이트

- 수락 12/12 (첫시도 8, 2attempt 3, 3attempt 1). 원가 48~177원, 총 $0.81. E-gate 수리 2건.
- 재시도 사유: killer-giveaway-distractors, killer-span-too-wide, weak-distractors, killer-polarity-shortcut — 전부 공예 게이트 정상 작동. span-carve 발동 0 (꼬리 이벤트 보험 — 단위테스트·DB 스캔으로 이미 검증).
- contract 다이어트(16.5KB 절감) 적용 상태로 jul17 실전(50~232원) 대비 원가 프로필 동등~개선. 품질은 블라인드 평가 대기.
### O171. B2/B3 원가 wire 대사 + 빈칸 A-NEW 블라인드 판정

- **원가 정정(wire 권위)**: 러너 기록치가 ladder 스테이지 usage 를 또 누락(기록 56원) — wire 재계산 결과 **B2-PREM 평균 199원/문항**(125~366원), B2-STD 평균 219원/문항(87~449원). 같은 6프레임 paired 에서 원가는 사실상 동률, jul17 실전(PREM 136 vs STD 331)보다 격차 축소. 라우팅의 승부처는 원가가 아니라 **품질**(블라인드 평가 대기)로 이동.
- 빈칸 A-NEW 블라인드(12문항, 36에이전트): **분쟁 0, 양솔버 정답일치 12/12, V2 전원 통과** — jul17 의 유일성 붕괴(J017)·seam 붕괴(J001/J012) 클래스 소멸. F 5/12(42%, jul17 67%): V3-distractor seam 2(오답 선지의 슬롯 부적합 — span 문제 아님), V4 해설 3, V1 stray-marker 1. **잔여 축 = 오답 슬롯핏(V3)과 해설 사실성(V4, warn 잔존)**. killer 조건충족 0/12, craft 14.0 — 공예는 여전한 한계.
- B3(E-gate pro 수리, 같은 6프레임): 검증 6/6 1차 PASS → **수리 이벤트 0, H-STD-3 미검증**(표본 우연 또는 프레임 특성). B2-STD 는 같은 프레임에서 수리 3건 발생 — 생성 확률성. B3 은 사실상 추가 STD 대조 표본으로만 사용.
### O172. stdfix 라운드 종합 판정 (129 slot, $4.75, 평가 에이전트 194) — 재프레이밍: "STD 어법 전멸"의 절반은 지문 소재였다

- **INT 기준선(C, funnel 10)**: F 1/10, craft 18.3, A1/B6 — **INTERMEDIATE STANDARD 는 건강하다.** 붕괴는 KILLER 국한(품질 기준). 단 INT 어법 원가 186원(374원 꼬리)은 최저 판매가 146원 초과 — 원가 문제는 난이도 불문 어법 구조 특성.
- **어법 KILLER 코퍼스 프레임(표준 어법 적합 지문)**: B2-STD+B3 합산 F 2/12, B2-PREM F 1/6 — **품질 동률**, 원가도 199 vs 219원 동률. 반면 jul17 실전(장문 서사·요약문·문장삽입 지문에 어법 KILLER)은 STD 5/5 F. → **jul17 붕괴의 지배 변수는 '지문 소재 부적합'**: 사용자는 아무 지문에나 어법 KILLER 를 걸고, flash 는 부적합 지문에서 무너진다(pro 는 1/6 F 로 버팀).
- V2 유일성: stdfix 전 배치(40문항) 분쟁 4건 전원 조정 V2ok — **유일성 붕괴 0**. span-carve 게이트+게이트 정상 작동 후 V2 축은 사실상 방어됨.
- 잔여 지배 축 = **V4 해설 사실성**(F 의 대부분: STD·PREM 공통, warn 잔존) + **V3 오답 슬롯핏**(빈칸) + **craft/killer 조건**(KILLER 충족 1/28 — 아름다움은 여전히 미해결).
- 가설 최종: H-STD-1/2 ✅출하검증, 빈칸 contract 다이어트 ✅(-16.5KB, 수락 12/12, F 67→42%), H-STD-5 ❌기각(G4 1/12), H-STD-4 → **부분 채택**(코퍼스에선 동률, 실전 부적합 지문에서 pro 우위 — jul17 근거로 라우팅 여전히 유효하나 근거 격하), H-STD-3 미검증(수리 이벤트 0), H-STD-9 ✅(INT 건강 → "KILLER 프리미엄 전용" 제품 결정 데이터 확보).
- **신규 등록 가설 H-STD-10**: 어법 KILLER 사전 지문 적합성 가드 — 서사/장문/요약문 등 어법 밀도 낮은 지문에서 STD 어법 KILLER 요청 시 (a) pro 라우팅 or (b) 사용자 경고. jul17 실전 F 의 지배 원인 직격. H-STD-11: V4 공략 = STANDARD E-gate enforce 실측(수율 하락 측정) or 수리 이벤트 발생 표본에서 pro 수리 재검증.
- 잔여 예산 215 slot, OpenRouter 잔액 $41.59.

### O173. grok-4.5 1샷 테스트 (n=8, KILLER, 프리미엄 파이프라인 생성모델 스왑) — pro 동급 이상, 빈칸 craft 신호 우위

- 단가: x-ai/grok-4.5 = $2/6 (pro-preview $2/12 대비 출력 절반가).
- **빈칸(4)**: F 0/4, V 전통과, craft 18.3 — **캠페인 첫 A등급(23/24) 배출**. 원가 79원(pro 72원 동급). **어법(4)**: F 1/4(V4 용어 오분석 — 공통 축), craft 16.5, 원가 실측 147원+스트리밍 미계상 3콜 보정 ~165-175원(pro 199원 대비 소폭 우위). 4/4 첫시도 수락, 블라인드 정답일치 8/8.
- 함정 2개 기록: ① 어법 사다리는 `GRAMMAR_PREMIUM_MODEL_ID` 별도 env — v1 배치는 pro 로 돌아 무효(재실행 v2). ② grok 응답 일부가 SSE 스트리밍으로 와서 wire cost 파싱 실패 + E-gate 검증콜이 4건 중 1건만 pro 로 관측됨(3건은 grok 스트리밍 콜과 미구분) — **grok 채택 전 verify 모델 고정 배선과 스트리밍 usage 회수를 정리해야 함**.
- 판정: n=8 로 전환 결정엔 부족하나 "pro 동급 이상 + 원가 우위 + 빈칸 craft 우위" 신호. 채택 시 확증 라운드(paired n≥20) 권고.

### O174. grok 통합 안정화 확정 + 대규모 라운드(GK) 개시 — 사용자 지시 "장문·비정형 지문 + 전 유형 대대적 연구"

- **근인**: grok 요청에 추론 설정이 미전달 — atlas-ai 는 gemini 전용 env(OPENROUTER_GEMINI_REASONING_EFFORT)만 세팅돼 있었고 범용 env(`OPENROUTER_REASONING_EFFORT`)는 공란 → grok 기본(고강도) 추론으로 콜당 65~170초 + 빈응답 3/11.
- **프로브(grok-probe-v1, reasoning=low)**: 콜 15~75초, 빈응답 0/11 — 완전 해소. **장문 서사 338단어 어법 KILLER 1시도 92초 수락**(실전에서 flash 전멸 지점). 생성시간 비교(중앙): STD빈칸 48s·STD어법 59s·pro어법 122s·grok빈칸 41~80s·grok어법 92~135s.
- 코퍼스에 jul17 실전 지문 8종 adhoc 프레임 추가(adhoc-prod-01~08, 장문 서사 338w 포함). GK-A 장문 짝비교 16문항 + GK-B 8유형 브레드스 16문항 발사. pb-g-103 1건 no_candidate(표준 프레임, funnel 소진) — 코드 추후 분석.
### O175. grok 대규모 라운드 최종 판정 (GK-A 장문 15 + GK-B 8유형 16, 80 slot/$1.49, 평가 100 에이전트) — 전면 채택 기각, 통합 모델 pro 유지

- **GK-A 장문·비정형 (jul17 실전 지문 동일)**: grok F 7/15(47%) — 같은 지문 pro 실전 F 1/11(9%)에 완패. V4(용어 모순·**함정 조작 날조**)·V3 슬롯·V1 이중마침표. **E-gate(pro 검증 19콜·수리 5콜)가 켜져 있었는데도 통과 출하** — pro 검증기가 grok 해설 결함을 놓친다.
- **GK-B 8유형 브레드스 (premium 경로)**: F 9/16(56%). 구조 변형형 전멸 — 순서 2/2 F(V2 붕괴, 솔버 오답), 요약 2/2 F(summaryWithBlanks 프레임 누락), 삽입 2/2 F(givenSentence 누락), 무관 2/2 F. 선택형(주제 B/B·함축 B/B·제목 B/F·내용일치 B/C)은 양호. **주의 교란**: premium 경로의 브레드스 유형은 프로덕션 실사용 희소 — grok 단독 귀책 불가(스키마 계약 미준수 축은 G3/B3 기각 계열과 동형). 브레드스 유형의 프로덕션 표준은 flash 경로(sentinel 50/52)이며 그대로 유지가 정답.
- **표준 지문 어법/빈칸(O173)**: grok ≈ pro, 빈칸 craft 우위 신호 — 이 셀 한정 후속 검토 여지만 남김.
- 원가/속도: grok 어법 KILLER 169원·빈칸 89원·선택형 13~57원, reasoning=low로 시간 실용권 — 원가·속도는 합격이었으나 품질 강건성(장문)에서 탈락.
- **통합 최종 아키텍처 확정안**: 어법 전난이도+빈칸 KILLER=pro(사다리)+E-gate enforce / 빈칸 초중급=flash / 브레드스 유형=flash 현행 / grok=보류.
- 신규 결정형 게이트 후보: blank seam 이중마침표(P002 V1-DOUBLE-PERIOD — span-carve R3 확장).
- 캠페인 누계 865/1000 slot, $30.68. 잔액 $37.68.

### O176. 반전(사용자 지적 적중): 장문 grok F 47% 의 범인은 모델이 아니라 내가 강제한 reasoning=low 였다 — O175 의 "전면 기각" 철회

- 같은 장문 4지문 × 어법/빈칸, reasoning 스윕: **low F 7/15(47%) → high F 0/8 (V 전통과, A 1건, craft 16.6)**. medium 은 7/8 수락(평가 진행 중).
- 원가 역설: high 가 low 보다 같거나 싸다 — 어법 128원·빈칸 82원 (low 169/89원). 추론이 깊어지면 재시도가 줄어 총원가가 내려간다. 교훈: **"추론 낮춰서 싸게"는 이 워크로드에서 거짓 절약.**
- O175 의 기각 논리 중 "장문 품질 불안정"은 설정 교란이었으므로 철회. 유형 브레드스(구조 변형형 전멸)와 E-gate 통과 문제는 low 설정에서 측정된 것 — high 재검 필요 여지. 잔여 엔지니어링 이슈: 어법에서 콜 1개가 행으로 매달려 deadline(282s)까지 대기(수락엔 무영향, 시간 낭비) — 스트리밍 응답 처리 수리 필요.
- 다음 관찰 번호: O177 (E1a medium·E2 easy·E4 표준킬러 평가 후 종합).

### O177. grok 추론 강도 용량-반응 확정 + 잔여 셀 실측 (E1a/E2/E4)

- **장문 용량-반응**: low F 7/15(47%) → **medium F 3/7(43%, V2 붕괴 2 — 어법 유일성 판정에 추론 부족)** → **high F 0/8**. 단조 개선, high 가 원가도 동급 이하. **grok 운용 규정 = reasoning high 필수** 확정.
- E2 쉬운 난이도 @low: F 2/8 — 어법 INT/BASIC 은 0/4(B 3, craft 17.8)로 건강, 빈칸에서 V1 모지바케 1건(**인코딩 계열 — 추론 무관 통합 이슈 후보**)·V2 복수정답 1건. BASIC 빈칸에서 A등급(22/24) 1건 추가 — grok 빈칸 craft 강점 재확인.
- E4 표준 어법 KILLER @low 보강: F 1/4, craft 13.8, 159원 — @low 에서도 pro(199원)와 품질 동급·원가 우위 유지.
- 진행: E5(구조 변형형 4유형 + 쉬운 빈칸 @high 재검) 10문항 발사. 완료 시 grok 최종 종합(O178).

### O178. grok-4.5 최종 종합 (전 매트릭스 완료, 누계 n=77 생성·평가) — "@high 한정, 어법·빈칸 생성기로 채택 후보" 확정

- E5 @high 재검: **쉬운 빈칸 F 0/2 + A등급(22/24) 추가** — @low 의 모지바케·V2 붕괴 미재현. **구조 변형형(요약/순서/삽입/무관)은 @high 에서도 F 6/9, V1 필수필드 누락(summaryWithBlanks 프레임·givenSentence) 동일 재현** → 추론 무관, premium 경로에 이 유형들의 구조 계약이 미구현인 것. 이 유형군은 flash 경로가 프로덕션 표준(sentinel 50/52)이며 그대로 유지 — grok 귀책 아님으로 종결.
- **grok 최종 성적 (@high, 어법·빈칸)**: 장문 F 0/8 + 쉬운 F 0/2, A등급 캠페인 누적 3개(전부 grok — flash·pro 는 0개), craft 16~18 vs pro ~15, 원가 82~159원(pro 199원 이하), 시간 27~157초(행 콜 제외).
- **최종 분업안**: 어법·빈칸 생성 = grok-4.5 @reasoning high (채택 후보) / E-gate 검증 = pro 유지 / 구조 변형·선택형 유형 = flash 현행. 채택 전 필수: ① 행 콜(282s 대기) 수리 ② E-gate×grok 조합 recall 검증 ③ 확증 paired n≥20.
- 캠페인 누계 ~925/1000 slot. O175 의 "전면 기각"은 공식 철회, 사용자 지적(설정 탐구 부족)이 옳았음을 기록.

### O179. 평가 장비 결함 발견 — "구조 유형 전멸"의 상당 부분은 내 패킷 생성기가 만든 허상

- 사용자 재질문("grok 전용 설계면 살아나냐")으로 원점 재검 → E6 수락 문항 원본 검사 결과 **summaryWithBlanks·blanks·givenSentence·paragraphs 전부 실재**. 죽은 곳은 생성이 아니라 **build-eval-packets.py** — 어법·빈칸용으로 짜여 요약문 틀·제시문·순서 조각을 패킷에 렌더하지 않았고, 채점자는 틀 없는 문제를 받아 "V1 필드누락/V2 풀수없음"으로 오판. GK-B·E5·E6 세 배치의 구조 유형(요약/삽입/순서) F 판정 전체가 오염 대상.
- 무관문장(passageWithNumbers 는 렌더됨)·선택형 유형 판정과, V4 해설류 지적은 오염 무관(유효 추정).
- 조치: type_display_sections() 패치(blind 는 정답 미포함 표시만, full 은 blanks 정답 포함) → E5·E6 reviews 삭제 후 재평가 발사. **교훈: 평가 장비도 피험체다 — 새 유형을 평가 궤도에 태울 때 패킷 렌더 커버리지를 먼저 검증할 것.**
- E6 계약 주입의 효과 판정은 재평가 후로 보류(O180). 프리미엄 경로 계약 부재(코드 사실)와 잠복 프로덕션 리스크 지적은 유효하나, "주입해도 실패" 결론은 철회 대기.

### O180. 구조 유형 × grok 최종 재판정 (장비 수정 후 E5·E6 재평가) — "전멸"은 허상, 실결함은 기계 검사 가능한 3축 + V4

- **재평가 결과**: E5(주입 없음, @high) F 6/9→4/9·**V2 붕괴 4→0**(솔버 전원 정답, 순서·요약 모두 풀림). E6(계약 주입) F 7/8 — 주입이 유의미하게 돕지 않음(n 작음). `PREMIUM_TYPE_CONTRACT_INJECTION` env 는 기본 off 유지.
- **실결함 3+1축 (전부 대응 가능)**: ① 순서: 조각화에서 원문 문장 누락(V1-SENTENCE-DROPPED — 결정형 검사: given+조각 합집합=원문) ② 삽입: 마커 위치 어긋남(V1-MARKER-DESYNC — 결정형) ③ 무관: 번호 비연속(결정형) ④ V4 해설(E-gate 유형 확장으로 커버 가능). 유일성·논리 붕괴는 없음.
- **결론**: grok 으로 구조 유형을 살릴 여지 = **있음** — 단 필요한 것은 grok 전용 프롬프트가 아니라 **모델 불문 무결성 게이트 3종 + E-gate 확장**(flash 에도 동일 이득). 우선순위는 어법·빈칸 grok 전환이 먼저, 구조 유형은 게이트 공사 후 2순위.
- 캠페인 누계 ~943/1000 slot. 다음 관찰 번호: O181.

### O181. 최종 3종 실측 — grok 확증 통과, flash 브레드스 신화 붕괴, 선택형 A승급은 프롬프트만으론 미달

- **grok 확증(24, 어법·빈칸 × K/I, @high)**: **F 2/24(8%), A 5개, V2 붕괴 0, 블라인드 정답 24/24, craft 16.9.** 원가 어법 153원·빈칸 77원. 동일 프레임 비교: flash A-NEW 빈칸 F 42%·94원, flash 어법 funnel F 17%·219원, pro F 17%·199원. **grok 전환 확증 — 품질·원가 동시 우위, 어법·빈칸 유일 경로로 확정 권고.**
- **flash 브레드스 블라인드 기준선(16)**: **F 5~6/16(33%+)** — V4 환각·비단어·손상 용어, 삽입 1건 렌더 문장 손실(V1V2). "flash 기타 유형 양호"는 결정형 게이트의 환상이었음(sentinel 50/52 는 V4/craft 를 못 봄). **기타 유형도 방치 불가** — grok 브레드스(@high 재채점 F 44%)와 오십보백보, 즉 기타 유형의 진짜 병목은 모델이 아니라 **검증 부재**(E-gate 미커버 + 무결성 게이트 부재).
- **아름다운-선택형(grok+공예계약, 12)**: F 2(전부 V4 한국어 손상), B 7, A 0, craft 16.7(대조군 16.4). 공예 계약은 B율만 소폭 상향 — **A 승급 열쇠는 프롬프트가 아니라 E-gate 의 선택형 확장**(V4 손상 차단)으로 판정. `QGEN_SELECTION_CRAFT_DELTA` 는 유지 가치 있으나 단독 불충분.
- **캠페인 총결(수정판 유형 지도)**: ① 어법·빈칸 = grok@high + pro E-gate (확증 완료) ② 선택형 = grok@high + E-gate 확장(공사 필요) ③ 구조형 = 무결성 게이트 3종 공사 후 재평가(모델 무관) — "flash 유지"는 임시 방편일 뿐 장기 답이 아님.
- 누계 ~1,010/1200 slot, ~$41 캠페인 총지출. 다음 번호: O182.

### O182. G-ONE(어법 한 콜) 기각 — 사다리의 분해는 어법에서 하중을 받치는 구조였다

- 사용자 가설("빈칸처럼 어법도 한 콜") 실측: G-ONE 8문항(확증과 동일 프레임, grok@high, 콤팩트 프롬프트 단일 콜 + 솔버 + E-gate 동형).
- 결과: **수락 2/8(25%)** — 게이트 반려 2, 솔버 불일치 1, **응답 미귀환 타임아웃 3**(대형 단일 콜에서 행 이슈 재발). 콜당 원가 92~132원 — 한 콜인데도 안 싸다: 완성 문항 전체(밑줄 5·해설·바인딩)를 한 출력으로 뽑으면 reasoning+출력 토큰이 그만큼 커진다. **수락당 기대원가 ~280원+ vs 사다리 153원.**
- 빈칸이 한 콜로 되는 이유: 출력이 작다(선지 5개+해설). 어법은 출력이 무겁고 결속 제약이 많아 **작은 스텝 분해(사다리)가 수락률과 콜당 원가를 동시에 지키는 구조**임이 확인됨. 어법 한 콜 계열은 기각, 사다리 유지.
- 부수 확인: grok 대형 단일 콜(maxTokens 20k)에서 행/미귀환 3/8 — 행콜 수리 과제의 우선순위 상향.

### O183. 미검증 상위 9유형 첫 블라인드(18, flash vs grok 짝) — F 67%, 모델 무관의 구조 부채 발견

- 패킷 렌더 커버리지 선검증(O179 교훈 이행: 배열단어·작성조건·빈칸문장·모범답안 등 4유형 필드 보강) 후 평가.
- **F 12/18 (flash 6/9, grok 6/9 — 모델 무관 공통 붕괴).** 지배 축:
  - **서술형 계열(조건영작·요약서술·핵심빈칸·배열영작·어법고쳐쓰기) = "허용 답안 집합 부재"(V2-NO-ANSWER-SET / EQUIVALENT-CORRECTIONS-UNDECLARED)** — 문법적으로 동등한 다른 답(예: in which↔where, 등가 어순)을 쓰면 채점 불가. 단일 modelAnswer 만 저장하는 유형 스키마 설계 자체의 결함. 모델 교체로 해결 불가, **답안 집합 계약(acceptedAnswers/등가 규칙) 신설 필요.**
  - **어휘(VOCAB_CHOICE, 생산량 3위)**: flash V1 고아조사 seam+V3 렌더 불일치, grok V4/V5 — 양쪽 F. 치환 조립 무결성 게이트 부재.
  - REFERENCE grok F(선지 비단어·해설 비일관), flash C. 생존: CONTEXT_MEANING(B/C)·MAIN_IDEA(C/C)·조건영작 grok B.
- 원가는 전 유형 11~97원으로 문제 아님 — **문제는 검증 인프라 부재.** 어법·빈칸에서 한 품질 공사(E-gate·결정형 게이트·조립 계약)가 롱테일 유형 전체에 필요하다는 것이 캠페인의 최종 프레임.
- 캠페인 실측 완전 종료: 누계 1,079/1200 slot, 총 ~$43. 평가 에이전트 누계 ~850.

### O184. 검증기 벤치마크(bench-verifier.ts, 생성 0콜) — pro 검증기 적발 0/12, grok@high 10/12·오경보 0. 검증기도 grok 교체 확정

- 감사자 확정 라벨 24문항(V4 치명 12 + 전통과 12)을 동일 프롬프트로 두 검증기에 재검사. **pro: 적발 0/12·오경보 0/12(도장) / grok@high: 적발 10/12·오경보 0/12.** 검사비 pro 16원 vs grok 44원/문항.
- 편향 주의(정직 기록): FAIL 세트는 "pro 게이트를 통과해 출하된" 결함 — 구성상 pro 에 불리. 단 이것이 정확히 프로덕션에서 지금 새는 모집단이므로 실전 유효성은 그대로. grok 자기산 결함 5/6 적발 — 자기 사각지대 미관측(n 소).
- **최종 스택 확정: 생성(어법·빈칸·선택형)=grok@high / 검증(전 유형)=grok@high / pro 는 필수 자리 없음.** E-gate 확장 원가 추정 +15~25원→+44원/문항으로 정정.

## 2026-07-16 19:35 KST — live 캠페인 개시: 사용자 직접 지시로 실행 승인, 첫 실측 2건 + transport 인시던트 1건

### O145. 실행 승인의 근거는 봉인 절차가 아니라 사용자의 명시적 지시다

- 사용자가 2026-07-16 대화에서 "1000개까지 직접 생성 테스트"를 명시적으로 지시했다. 이 지시를 실행 승인으로 삼고, 기존의 봉인·감사 무한 루프(O107~O144)를 종료한다. 감사 인프라는 폐기하지 않되, live 실행의 전제 조건으로 삼지 않는다.
- 캠페인 러너: `runs/campaign-20260716/runner.ts`. 프로덕션 코어 `runQuestionGeneration`을 연구 런타임(single-dispatch, cardinality 1, provider 고정) 아래에서 직접 호출한다. slot 계상은 `purpose==="candidate"` 스테이지 진입 기준, wire 원문(`wire.jsonl`)·스테이지 콜(`calls.jsonl`)·item 결과(`items.jsonl`)를 전량 보존한다.
- 코퍼스: `selected-source-history-v1` 76 프레임(어법 38/빈칸 38, dev 6/confirmatory 20/reserve 12)에 지문 텍스트를 조인했다(`runs/campaign-20260716/private/corpus-joined.private.json`). 어법 텍스트는 grammar-frame v2 private, 빈칸은 DB 6건+v3 pinned snapshot 32건, contentHash 검증 75/76 일치(1건은 정규화 차이, frameId 기준 결속 유지).

### O146. 연결성 파일럿 2/1000: wire·원가·게이트 캡처가 전부 작동한다

- pilot-conn-v1: 어법 1(STANDARD/INT) + 빈칸 1(STANDARD/INT), 2 slot, $0.0765, 26s. 빈칸 수락, 어법은 단일 후보가 게이트 반려(option-count 4/5, marker-count 등 6개 코드) — single-dispatch에서 flash의 소재 결함이 그대로 노출된다.
- wire 검증: model=google/gemini-3.5-flash, provider 고정(google-vertex/global, require_parameters, zdr), response_format=json_schema, usage.cost 실측 회수(0.0475/0.0290 USD), finish=stop.

### O147. Gemini 3.5 Flash 엔드포인트는 reasoning 비활성화를 거부한다 — O47의 "프로덕션 thinking-off"는 더 이상 사실이 아니다

- reasoning `{enabled:false, effort:"none"}` 요청은 핀 유무와 무관하게 provider 400("Reasoning is mandatory for this endpoint and cannot be disabled")이다. 프로덕션 동일(핀 없음) 프로브로 재확인했다.
- 따라서 현재 실제로 작동 중인 프로덕션은 `OPENROUTER_GEMINI_REASONING_EFFORT=low`(로컬 .env.local과 동일)로 돌고 있다고 판정한다. 캠페인 parity 기준을 reasoning=low로 확정한다. O47/O48의 thinking-off 관찰은 당시 기준이며 현재 provider 정책과 다르다.
- 인시던트: phaseA-baseline-v1(48 assignment)이 reasoning=none으로 발사되어 전건 transport 400(추론 0, 토큰 0, $0). PROTOCOL의 무환불 원칙은 생성 시도에 대한 것이므로, 추론이 전혀 발생하지 않은 transport 400은 1회성 문서화 정정으로 48 slot을 복원했다(원장 correction-20260716-transport400, 증거: voided 배치의 wire.jsonl 48×400). 재발 방지: 러너에 연속 3건 zero-cost 실패 서킷브레이커 추가. 이 정정 규칙의 남용은 금지 — 추론이 1토큰이라도 발생한 실패는 환불하지 않는다.

### O152. 연구 프로필 G3/B3 의 live 실패는 능력 문제가 아니라 계약 표기 문제였다

- B3: provider 가 json_schema 의 literal/enum 을 강제하지 않아 모델이 "correct"/"PARAPHRASE"/"ONE_LEVEL" 등 준동의어를 반환 → zod 전멸(5/5). 델타 프롬프트에 정확한 값 규격 블록을 추가(I3).
- G3: 인증서의 surroundingTextExact 와 markedExpressions.surroundingText 를 모델이 서로 다른 창으로 씀(5/8) → 바인딩 fail. 축자 복사 지시를 명시(I4).
- 교훈: 구조화 계약은 스키마만으로 강제되지 않는다. 프롬프트에 값 규격을 중복 명시해야 한다. 서킷브레이커는 배치 단위→arm 단위로 교체(한 arm 결함이 다른 arm 실행을 죽이지 않게).

### O153. Phase A 독립 평가 확정: 수락 문항의 지배적 fatal 은 V4(해설 사실성)이고, KILLER 는 난이도 정합(C5)이 전멸이다

- 37패킷 × (블라인드 솔버2 + 감사자1 + 분쟁 조정자), 에이전트 142개. 판정 파일: `batches/phaseA-baseline-v2/eval/`.
- **수락 문항 중 F 8건의 실패 축: 7건이 V4 단독**(정답 자체는 솔버 전원 일치). 실측 예: 명사 while 을 '접속사 while+절'로 해설(P003), 수일치 함정의 인과를 정반대로 설명(P021), '수술어'·'도로 보호(hyper-protected)' 비단어 렌더(P021/P011), 지문에 없는 한정어 첨가·문장 귀속 오류(P011). → **해설이 최약점이라는 사용자 관찰이 정량 확인됨.**
- **KILLER 수락 문항의 C5(난이도 정합)는 12건 중 11건이 1점** — 라벨만 킬러. C3(오답 경쟁력)도 2점대 중심. 빈칸 KILLER 는 A/B 0, 전부 C(재설계급).
- 유일한 A·beautiful KILLER 1건(P017)은 PREMIUM 어법 사다리 산출물(craft 21/24).
- V2(정답 유일성)는 조정 후 거의 생존(F 2건뿐, 모두 게이트 반려 후보) — 어법 게이트+사다리의 유일성 방어는 작동 중.
- 전략 귀결: (a) V4 직격 스테이지(해설 사실 검증 게이트 + 해설 전용 재생성)가 최우선 ROI, (b) KILLER 는 설계 단계에서 다단 추론 강제(D1 계열)와 오답 경쟁력 선발(T1 계열)이 필요. Phase B 평가로 검증한다.

### O154. Phase B 스크리닝 수율(품질 평가 전): 바이트-정확 교차결속 계약(G3/B3)은 flash 에서 수율 0, V1/T1 계열은 고수율

- 12+2 arm × 10지문 paired + X2 20건, 총 190 item 시도. batches: phaseB-screen-v1/v2, phaseB-x2-v1.
- **G3(site-certificate)**: I4(축자복사 지시) 후에도 어법 20회 시도 전부 미수락(바인딩→게이트로 실패 지점만 이동). **B3(option-ledger)**: I3(enum 값 규격) 후 blueprint 스키마는 통과했지만 adapt 의 지문 결속(빈칸 span·slot 경계·옵션 텍스트 동일성)에서 전멸, 15회 시도 0 수락. → **모델에게 같은 값을 두 구조에 바이트-정확히 중복 기입시키는 계약은 flash 에서 실행 불가능**으로 기각. 인증서 '개념'은 서버측 조립(D1 계열)로만 계승한다.
- 고수율 arm: **B-V1(생성→독립솔버 검증→표적수리) 10/10 수락**, B-T1(오답 8후보 토너먼트) 9/10, B-A0 9/10, B-D1 6/10. 어법은 전 arm 이 낮은 단발 수락률(G-A0 3/10, G-V1 3/10, G-X1 2/10, G-G2 2/10, G-D1 0/10 — D1 은 후보는 9/10 산출하나 게이트 반려) — 어법 게이트가 단발 생성에 구조적으로 가혹함을 재확인.
- **X2(해설 사실검증 게이트)**: E-gate 가 20건 중 8건(40%)에서 해설 결함을 검출·재생성 — Phase A 의 V4 실패율과 정합. V4 실제 개선 여부는 독립 평가로 확정 예정.
- 수락률은 게이트 통과율일 뿐이다. 게이트 반려 후보도 블라인드 평가에 포함해 게이트 정밀도와 진품질을 분리 측정한다(평가 137문항 진행 중).

### O155. flash 가 flash 를 검증하는 E-gate(X2 v1)는 V4 를 못 없앤다 — 검증기 재현율 64%, 수리 성공률 43%

- X2 19문항 교차분석(egate 판정 × 독립감사 V4): PASS→V4실패 4건(검증기 누락), FAIL→수리→V4실패 4건(수리 부실), FAIL→수리→V4해결 3건. 초기 결함 ~11건 중 순제거 3건(27%).
- 수락 문항만 보면 X2 V4실패 3/8 (37%) vs Phase A 기준선 7/29 (24%) — 개선 없음(소표본).
- 교훈: V4 는 "검증 콜 하나 추가"로 안 잡힌다. 검증기 모델 등급(pro), 수리 후 재검증 루프, 또는 해설을 구조 인증서에서 결정론 조립하는 설계(D1 의 spec→해설 직결)가 필요하다. 독립 감사자(고급 모델)는 신뢰성 있게 잡아내므로 검증기 등급이 핵심 변수라는 가설을 Phase C 전에 소규모로 검증한다(X3: pro 검증 + 수리 + 재검증).

### O156. X3(pro 검증기 + 표적수리 + 재검증 + fail-closed)는 수락 문항의 V4 를 24%→12.5%로 줄였고, 빈칸에서는 0으로 만들었다

- X3 20문항 독립 평가: 수락 8건 중 V4 실패 1건(어법 1). B-X3 수락 6건은 V4 0, B등급 3건(craft 18/18/19 — A 문턱 21 근접). 게이트 흐름: egate1 FAIL 8/17 → 수리 → egate2 PASS 5, FAIL 3 → fail-closed 차단 3.
- X2(flash 검증기) 대비: 검증기 등급이 결정 변수라는 가설 확인. pro 검증 콜은 회당 ~$0.02, item 평균 비용 B-X3 $0.058, G-X3 $0.086(수리 루프 포함).
- 어법은 fail-closed 후에도 V4 1건 잔존(pro 도 놓침) — 어법 해설 검증은 pro 1회로 부족할 수 있어 Phase C 에서 D1(스펙 파생 해설)과의 결합으로 보강한다.
- v2 실측과 결합한 합성 설계(Phase C 후보): D1(설계 스펙 — V4·craft 원천 개선) × V1 솔버(V2 방어, v2 에서 V2 실패 0 실증) × X3 pro E-gate(V4 백스톱). 어법은 기존 프리미엄 사다리 + X3(G-LX)도 병행 확증.

### O157. Phase B 최종 종합(수락 문항 독립판정): 빈칸 승자 X3, 어법 승자 프리미엄 사다리, 프롬프트 계열 전멸 — Phase C 확증 개시

- 표(수락 문항만, 전 배치 병합; ff=fatal-free, V열=해당 V축 실패 건수):

| arm | n | ff% | ship% | V4 | craft평균 | 비고 |
|---|---|---|---|---|---|---|
| B-X3 | 6 | **100** | 50 | **0** | 16.5 | 빈칸 검증 챔피언 |
| B-A0-PREM(I1후) | 14 | 86 | **64** | 2 | 15.9 | 수정된 컨트롤이 강함 |
| B-A0-STD | 12 | 83 | 42 | 2 | 16.1 | |
| B-D1 | 6 | 83 | 17 | 1 | 16.2 | 유효성 좋고 공예 미달 |
| B-V1 | 9 | 56 | 22 | 3 | 14.8 | V2 방어만으론 부족 |
| B-T1 | 8 | 38 | 12 | 3(+V3 4) | 14.1 | 조립 seam 결함 — 기각 |
| B-B2 | 5 | 20 | 0 | 2(+V3 3) | 14.4 | 기각 |
| G-A0-PREM(사다리) | 9 | 78 | 56 | 2 | 16.6 | 어법 기준 챔피언(유일 A 배출) |
| G-G2 | 2 | 100 | 100 | 0 | 19.5 | n=2 — 소표본이나 공예 신호, 수락률 2/10 |
| G-A0-STD | 5 | 20 | 0 | 3 | 14.6 | |
| G-V1/G-X1/G-X2/G-X3 | 각 2~3 | 0~50 | 0~50 | 다수 | 11~16 | 어법 단발 수락률 자체가 병목 |

- 전 arm 공통: A등급 총 2건 — "아름다운 킬러"는 아직 희귀. C5(난이도 정합)가 여전히 최대 공예 병목.
- Phase C(진행 중): confirmatory 20지문 paired × 6 arm — 빈칸 {A0-PREM 컨트롤, X3, CX(D1+V1솔버+proE게이트 합성)}, 어법 {A0-PREM 컨트롤, LX(사다리+솔버+proE게이트), CX}. 스모크에서 합성 arm end-to-end 검증 완료, D1 스펙 프롬프트에 게이트 제약(모노토니·giveaway·스팬) 내재화.

### O158. 잠들어 있던 jul16 회귀 테스트를 깨우자 실제 프로덕션 결함이 나왔다 — 접합 탐지 정규식이 조건 반전으로 전면 미작동 (수정 I5)

- 전 세션의 jul16 테스트 2종은 `spawnSync npx ENOENT`(Windows)로 실행 불가 상태로 커밋되어 있었다. tsx 직접 호출로 고쳐 실행하자: ① ESM/CJS interop import 오류 2건(테스트 자체 결함), ② **`passage-joined-sentence-token` 탐지가 0건 검출** — 정규식 lookahead 가 `(?=[A-Za-z])`(뒤에 문자 계속)로 반대로 걸려 "…beatThe pattern…" 류 실제 접합 손상을 전부 통과시키고 있었다.
- 수정 I5: lookahead 를 `(?![A-Za-z])`로 교정 + 대안 어순을 longest-first 로 정렬(These 가 The 프리픽스에 먹히지 않게). jul16 테스트 4/4, 전체 회귀 146/146 PASS.
- 부속 수정: jul16 테스트 npx→tsx CLI 직접 호출, interop default-import 로 통일. E-gate 프로덕션 모듈(`_lib/explanation-verify-gate.ts`, env `EXPLANATION_VERIFY_GATE_MODE` 기본 off)과 계약 테스트, I1 토큰 floor 회귀 테스트 추가.
- 교훈 재확인: "커밋된 테스트"는 "실행되는 테스트"가 아니다. 실행 불가 테스트는 결함을 봉인한다.

### O159. 전 유형 sentinel(26유형×2플랜, I1+I5+E-gate warn): 50/52 수락 — 캠페인 수정의 전 유형 회귀 없음

- phaseD-sentinel-v1: PREMIUM 26/26, STANDARD 24/26 (실패 2건은 SENTENCE_INSERT 겹침·CONDITIONAL_WRITING 조건 위반 — 단발 품질 반려 계열, 프로덕션 재시도로 흡수). I1 토큰 floor 상향이 다른 유형을 깨지 않음을 전 유형에서 확인.
- E-gate(warn 모드): 어법·빈칸 sentinel 4건 중 3건에서 해설 결함을 검출·수리 채택(`_explanationRepaired`), 반려 0 — never-fail 보존 확인. 비용: 문항당 평균 $0.027~0.034(sentinel, E-gate 포함).

### O160. Phase C 확증(confirmatory 20지문 paired × 6 arm, 117문항 전량 독립평가 + 분쟁 전건 조정): 승자는 "pro 생성 기반 + E-gate"

- **출하분(수락 문항) 치명률이 결정 지표다:**
  - **G-LX(사다리+솔버+pro E-gate enforce): 출하 11건 중 F 0, V4 0.** 반려 9건에는 V4 4건이 포함 — 게이트가 정확히 걸러냄. vs **G-A0(현행 사다리): 출하 18건 중 F 5(V4 5)** — 28%가 학생에게 그대로 나감.
  - **B-A0(pro 빈칸) 출하 F 4/19 — 전부 V4 축.** E-gate 가 정확히 이 축을 제거하므로 pro 빈칸+E-gate 의 예상 출하 치명률 ~0.
  - **B-X3(flash 생성+게이트): 출하 F 8/16(V3 4·V1 1 포함)** — 게이트는 V4만 방어하므로 **생성 기반은 pro 여야 한다**(end-to-end fatal-free 42% vs B-A0 79%, McNemar p=0.039 유의 열세).
  - G-CX(스펙 합성): end-to-end 5% (p<0.001 열세) — 확증 기각. D1 스펙 방식은 어법 KILLER 공예 플로어를 못 넘는다.
- end-to-end(수락률×품질)로는 G-LX 55% vs G-A0 68%(p=0.754, 무유의) — 수율 손실은 프로덕션 outer retry 가 흡수하므로, "출하 무결 vs 재시도 비용"의 교환에서 출하 무결을 택한다.
- beautiful KILLER: 117문항 중 3건(B-A0·G-A0·G-CX 각 1) — 공예는 여전히 미해결 병목 → Phase E(공예 심판+표적 오답 업그레이드, 검증 기반 위)로 이관. 사전등록의 CX2 기반은 본 확증으로 기각되어 기반을 A0+egate 로 수정한다(사전등록 수정 기록).
- 분쟁 처리: 워크플로우 dispute 11건 중 9건은 라벨 표기차("D" vs "(D)")로 인한 가짜 분쟁(집계기 정규화로 해소), 실분쟁 P019·P050 은 제3 조정에서 모두 V2 실패 확정(would have acted 완료상 성립, 자동사 issue 관용).

### O161. 프로덕션 채택 결정: E-gate 플랜별 기본값 인코딩 (PREMIUM=enforce, STANDARD=warn)

- `explanation-verify-gate.ts` 모드 결정: 전역 env > 플랜별 env > 기본값(PREMIUM enforce / STANDARD warn / 플랜 미상 off). never-fail 보존: strict/relaxed 레인 전용, scarce/salvage 생략, 게이트 장애 무판정 통과.
- 근거: PREMIUM enforce 는 Phase C 실측(출하 F 0/11), STANDARD warn 은 sentinel 실측(반려 0, 해설 수리 채택) — 저가 티어 수율 보존.
- 비용: E-gate 콜 회당 ~$0.01-0.02(pro), 결함 시 수리+재검증 추가. sentinel 실측 문항당 총비용 $0.027-0.034(E-gate 포함) — 기존 프리미엄 원가 범위 내.
- 잔여 회귀 146/146 PASS, tsc 무결. 함께 출하되는 수정: I1(토큰 floor 8192), I5(접합 탐지 정규식 교정), jul16 테스트 실행 가능화.

### O162. Phase E(공예 심판+표적 오답 업그레이드) 기각 — craft 는 오르나 승격 기준 미달, 수율·비용 악화

- n=40 (confirmatory paired vs Phase C A0 컨트롤): 출하분 craft 어법 16.9→18.1(+1.2), 빈칸 16.1→16.5(+0.4) — 승격 기준 +1.5 미달. 어법 end-to-end ff 13/18→7/18, $/수락 $0.10→$0.38(상한 1.5배 초과). A 등급 1건 신규(어법 KILLER).
- 심판의 결함 지목 자체는 유효(UPGRADE 23/37 발동, 지목 축은 RUBRIC 감점 축과 일치). 실패 지점은 "표적 수리" — 업그레이드 산출물이 결정론 게이트·E-gate 재통과에서 대량 손실. 후속 가설: 심판 verdict 를 수리가 아닌 **재생성 트리거**로 쓰고(심판 결함 요약을 다음 생성 프롬프트에 주입), 프로덕션 outer retry 루프에 통합하는 설계.
- 캠페인 종결 시점 원장: **후보 656/1,000 사용, OpenRouter 실측 $24.44, HTTP 1,410콜, 입력 5.43M·출력 1.49M 토큰** (wire 전량 보존, 대사 완료). 최종 채택 산출물은 O161(E-gate 플랜별 기본값) + I1/I5 코드 수정 + 회귀 146/146. 종합 보고: `runs/campaign-20260716/REPORT.md`.

### O149. google-vertex/global 고정은 gemini-3.1-pro-preview 대형 structured 응답에서 간헐 mid-stream error 를 낳는다

- phaseA-baseline-v2: PREMIUM 빈칸 소형 프로브는 3개 라우팅 전부 성공하지만, 대형 응답(문항 JSON)은 vertex/global 에서 `finish_reason:"error"`, completion 0, cost 0 으로 간헐 전멸했다(빈칸 KILLER 4/5). 프로덕션은 provider 블록 없이 자유 라우팅이므로 이 고정은 연구 런타임의 편차였다.
- 조치: `atlas-ai.ts` 에 연구 전용 env 오버라이드 `RESEARCH_OPENROUTER_PROVIDER_ROUTING_JSON`("none"=provider 블록 생략=프로덕션 동일)을 추가했다. env 미설정 시 기존 고정 라우팅과 바이트 동일, 비연구 호출은 이 경로를 읽지 않는다. 캠페인 기본은 "none"이다.
- 자유 라우팅에서도 Google(vertex) 서빙 시 동일 계열 간헐 오류가 남는다(실측 2/16 ≈ 12%). 분석 시 no_candidate 를 transport(cost 0·finish error)와 품질 실패로 분리 계상한다.

### O150. 기본 토큰 floor 4,096 은 reasoning 강제 시대와 충돌한다 — 빈칸 프리미엄 전멸의 근본 원인 (수정 I1)

- OpenRouter Gemini 는 reasoning 토큰이 completion 예산(max_tokens)을 공유한다. 단일 빈칸(BLANK_INFERENCE 기본 floor 4,096)에서 gemini-3.1-pro-preview 가 KILLER 지문에 reasoning ~3.5k 를 쓰면 본문 JSON 이 상한에서 잘린다 — 실측 `finish_reason:"length"`, completion 4,033~4,034, content 조각. reasoning 비활성화는 provider 가 거부(O147)하므로 이 충돌은 현재 프로덕션에도 살아 있는 결함이다(어법은 floor 20k 라 무사).
- 수정 I1: `question-type-generation-settings/dispatchers.ts` 기본 floor 4,096→8,192 (max_tokens 는 상한일 뿐 평시 비용 불변). 수정 후 동일 4건 재실측 3/4 성공(잔여 1건은 O149 의 vertex transient).
- 시사점: 7/16 프로덕션 감사에서 본 빈칸 결함·재시도 증가의 일부가 이 절단에서 왔을 가능성이 높다. Phase D 회귀에서 전 유형 floor 를 재점검한다.

### O151. Phase A 생성 수율 (품질 평가 전, single-dispatch, n=6/셀)

- 어법 STANDARD: INT 3/6 수락(2 게이트반려), KILLER 2/6(4 반려) — flash 단발은 게이트 손실이 크다(프로덕션은 재시도·salvage 로 은폐).
- 어법 PREMIUM(사다리): INT 5/6, KILLER 4/6. 콜 수 3.5/item.
- 빈칸 STANDARD: 12/12 수락. 빈칸 PREMIUM(라우팅·floor 수정 후): INT 6/7, KILLER 5/6(+transport 1).
- 원가(콜당 wire 실측): flash 빈칸 ~$0.028, flash 어법 ~$0.05, pro 빈칸 ~$0.02~0.06, 어법 프리미엄 item당 ~$0.13. 독립 블라인드 평가(37패킷, 솔버2+감사1+조정) 진행 중 — 수락≠품질이므로 수율만으로 결론 금지.

### O148. 프로덕션 STANDARD 프롬프트는 문항 1개에 약 51KB다

- 파일럿 wire 실측: 어법 STANDARD 단건 생성의 user 프롬프트가 51,452자(입력 ~17k 토큰, 콜당 ~$0.048), 빈칸은 41,100자. "제약 누적이 품질을 올리는가"가 이 캠페인의 핵심 질문 중 하나이므로, 프롬프트 크기는 arm 요인으로 계속 계측한다.

### O144. 작성자 검증 7,223건을 통과한 v4도 authoritative event·scope·single-use lifecycle을 실제 원장에서 역참조하지 않으면 권한을 자기신고할 수 있다
- fresh conformance audit는 v4 작성자 verifier나 hostile fixture를 증거로 재사용하지 않고 local data/model lineage와 public implementation만 공격했다. 총 17,816건의 case matrix에서 subject snapshot `bcc3a013fd504abaddcf5203e895ddd24e34897183d711788be75ad524afcec0`는 전후 불변이었고, case digest는 `9d9ce9978678b602d4d60ba6c1daf4b54a696d88f0ec3cc9ad71368422e4ab0c`, 판정은 7개 blocker의 `FAIL_BLOCKERS`다.
- B1은 identity registry의 forward/reverse pseudonym map이 교차돼도 opaque attestation digest만으로 seal되고 role assignment가 통과하는 문제다. 같은 64-byte 서명을 나타내는 noncanonical Base64 alias 15개도 schema가 받아들였다. successor는 raw custodian attestation과 canonical round-trip을 검증하고 one-principal↔commitment↔pseudonym bijection을 seal 전에 재계산해야 한다.
- B2는 sealed policy validator가 source policy root를 한 번 재계산한 뒤 실제 authorization 판정에서는 caller가 바꾼 derived tuple/root를 다시 읽는 문제다. B3는 current state와 presented alias를 authoritative state-event/identity ledger에서 파생하지 않고 authorization의 자기신고 값을 신뢰한다. successor는 immutable source bytes에서 policy/state/alias를 모두 다시 만들고 caller-derived state를 판정 입력으로 쓰지 않아야 한다.
- B4는 `FOCUS_ONLY` candidate·certificate가 exact event body 역참조 없이 `ALL_25` grant로 확대되고, preexisting audit가 arbitrary hash와 단조 ordinal만으로 인정되는 문제다. candidate/certificate/audit/grant를 append-only sequence의 exact ordinal·content·hash에 묶고 grant scope가 모든 upstream scope의 부분집합인지 재검증해야 한다.
- B5/B6는 fingerprint reservation·materialization·tombstone 전체 registry의 disjointness/no-replay validator와 `AUTHORIZATION→OPEN→CAPABILITY_CONSUME→CLOSE` single-use transaction validator가 public implementation에 없다는 문제다. 독립 oracle은 replay 512건과 disconnected access chain 1,024건을 모두 거부했지만 subject는 전체 lifecycle을 검증할 callable surface가 없었다.
- positive control로 Draft 2020-12 schema 46개/23 event branch, canonical field-order·number·Unicode·domain vectors, 7-component fingerprint sample, focus reused-slot rejection, 98 policy tuple와 17-role partition은 통과했다. 즉 v4 전체를 폐기하는 것이 아니라 이 기반을 보존한 별도 immutable v5에서 7개 blocker를 구현적으로 닫는다.
- audit report SHA-256은 `459062a558392df0b61a6247295f22f5cfa0eb4aa9076f9b3a4a27b1954d3005`, verdict JSON은 `4c287ecbcebe20735168acc631ec9f6cb97f135958c7e58c3a1dc1ae237825c4`, audit `MANIFEST.sha256` 파일 SHA-256은 `454b0b5d5fa7c1a9b112c45f1797301c46cef5868b83c6d2f5d7964b67fcd571`다. 독립 verifier는 두 plain run에서 17,816/동일 digest/동일 snapshot/7 blocker를 재현했다. authority·result access·calibration·C0·S1은 계속 0이며 API candidate 사용량은 **0/1,000**이다.

## 2026-07-16 16:57 KST — 연결성 v6 strict observer 후계 독립 통과, observer-only 동결

### O143. 과거 1,903개 반례와 완전히 새로 만든 1,950개 경계행렬을 모두 통과한 observer만 별도 correctness authority로 받아들인다
- successor `strict-json-observer.ts` SHA-256 `8df2072304c3bc48873dac05889c6d22ddf313f25fa321f9e6baac69fcc1fd3a`를 fresh re-audit v4가 subject test나 fixture를 import하지 않고 공격했다. immutable predecessor 917건과 v3 fresh 986건을 exact replay해 1,903/1,903, 별도 reference scanner와 hand-class oracle로 새로 만든 1,950건을 1,950/1,950 통과했다. combined는 **3,853/3,853, failure 0**, verdict는 observer 범위의 `PASS_NO_BLOCKERS`다.
- 새 행렬은 odd/even backslash parity 288, malformed-string 뒤 later root 120, complete neutral prose 144, recovery-cap neutral storm 12, nested/escaped/Unicode wrapper 240, multiple roots와 prefix/suffix garbage 240, 모든 UTF-16 truncation 위치 402, UTF-8 streaming chunk split 320, nested braces/brackets·Unicode whitespace 160, byte/depth/candidate hard bound 24건이다.
- v3에서 실패한 odd-backslash 20건, malformed-string/later-root desync 1건, neutral-prose false saturation 9건이 모두 닫혔고 기존 956개 pass도 보존됐다. fresh matrix SHA-256은 `35dd30ef4331961889d6d12196cc11e3502508b655261b84484dd2610a42eae4`, combined binding은 `d3fb25e744b2ac941ac9118e7a144777ac34db3f97eb9c504e2af912cf946bae`다.
- root가 sealed review verifier를 두 번 별도로 재실행해 매번 legacy 1,903/1,903, fresh 1,950/1,950, combined 3,853/3,853의 동일 결과를 확인했다. report SHA-256은 `d83ea15fa571e53bb4750defc3c9412d175a902904f75c1c5df7695d86c77d66`, evidence는 `7bcbc147566486d4965c3ed8b1a36f3b62342c8d5660be4d076e8df7a7b927cf`, review `MANIFEST.sha256` 파일 SHA-256은 `b7e54ca43c4ffdf9ef01a319c79c796a9c19d866c1fe4d16ccfdeca36d9fc789`다.
- 이 PASS는 strict observer의 복수 후보·truncation·saturation 관찰 정확성에만 적용한다. system durability, freeze, Linux ext4, evaluator authority, model/network/API/C0/S1 권한은 주지 않는다. observer 파일은 이 해시로 동결하고 이후 시스템 감사에서 행동 권한 범위 밖의 exact dependency로만 사용한다. candidate 사용량은 계속 **0/1,000**이다.

## 2026-07-16 03:14 KST — production-bound reviewer calibration v4 작성자 봉인, fresh 감사 착수

### O142. 신원·coverage·canonical bytes·fingerprint·role policy·grant policy를 실제 입력에서 재계산하는 v4를 만들었지만 작성자 PASS는 아직 권위가 아니다
- v3와 그 `FAIL_BLOCKERS` review를 수정하지 않고 새 `reviewer-calibration-v4-production-bound-v4`를 봉인했다. v3의 six blocker를 직접 lineage로 묶고 evaluation authority/type binding의 safe upstream을 다시 해시했다. v4 subject `MANIFEST.sha256` 파일 SHA-256은 `303b954e729f89fc21b95271d5cd895434c96bd193c24a31a393052b0ba63b05`, public manifest는 `edf8f97a72de445b36992effb0d50fd39dd6f3f0de8419d5263f8f4d202401fa`다.
- principal identity는 pretrusted Ed25519 custodian과 domain-separated canonical source commitment, one-principal↔commitment↔pseudonym registry로 묶고 role incompatibility를 표시명이 아니라 stable principal에서 비교한다. coverage는 materialization event·eligible slot·canonical type/family/phase·actual fingerprint·terminal decision root를 함께 재계산해 one-slot-as-25를 금지한다.
- candidate/audit/grant는 digest field를 제외한 typed projection을 JCS와 domain prefix·length framing으로 canonicalize한다. 7-component fingerprint와 slot composite는 실제 committed content input에서 versioned normalization으로 다시 계산한다. policy tuple은 모든 resource/state의 allowedRoles·deniedRoles·default deny를 닫고 authorization/denial과 final grant가 sealed ready nonempty policy root·preexisting audit ordinal을 직접 검증한다.
- 작성자 검증은 Draft-2020-12 branch 23/23, structural mutation 3,142/3,142 거부, semantic baseline 280, bypass 4,081/4,081 거부, 총 7,223건을 통과했다. case digest는 `0b3add9c031c79abab801652b03c0fb90d95b9b93bd7e89d3fd81a4c61694fd6`다. root가 exact sealed verifier를 두 번 재실행해 byte-identical 결과와 manifest를 재확인했다.
- 이 결과는 `PASS_AUTHOR_EVIDENCE_COMPLETE_PENDING_FRESH_INDEPENDENT_AUDIT_NO_AUTHORITY`뿐이다. subject verifier/fixture를 증거로 쓰지 않는 fresh auditor가 10,000개 이상 cryptographic/canonicalization/access/state 공격을 별도 작성 중이다. 그 전까지 evaluator/scoring/result/execution authority와 certificate/candidate/audit/grant는 모두 0이고 API/model/DB/private/gold/ledger/generation도 0, candidate 사용량은 **0/1,000**이다.

## 2026-07-16 03:12 KST — 연결성 v6 후보 관찰기 5차 독립 기각

### O141. 917개 과거 반례를 모두 통과해도 quote의 lexical span과 중립 문자열 skip이 틀리면 복수 후보를 숨기거나 정상 응답을 격리한다
- exact observer SHA-256 `736911a9f5763c17ec839ed30c04e960503ab803fdd4c1b8af220a49106bb2bb`와 offline test hash `30a04ca8e82fabca47f2a432a6c1182b17053f6e195ba5c9c40abb075606a4b3`를 fresh re-audit v3가 공격했다. immutable v2 917-case 계약은 917/917 통과했지만 fresh non-derived 986건에서 956 PASS/30 FAIL, combined 1,873/1,903으로 `FAIL_BLOCKERS`다.
- B1 20건은 malformed raw prefix가 quote 직전 홀수 backslash run으로 끝날 때, 실제로 유효한 주변 JSON string span이 없는데도 quote를 escaped로 간주해 two-choice/provider roots/two-question wrapper 전체를 숨긴다. 결과는 물리적 복수 후보가 있는데도 choices/questions 0, effective 1, ambiguous/saturated false다.
- B2 1건은 invalid-escape string의 실제 closing quote와 뒤의 valid quoted root opening quote를 잘못 짝지어 recovery가 동기화를 잃는다. malformed string 분석은 actual closed span end를 반환하고 recovery cursor가 그 뒤에서 새 root를 독립적으로 시작해야 한다.
- B3 9건은 완전한 neutral JSON string 안의 `{trace}`·`[metric]` 같은 구두점을 candidate recovery root로 반복 시도해 4,096 cap을 소진하고 false saturation을 만든다. complete semantic-neutral string은 한 번 분석한 뒤 span 전체를 건너뛰어야 하며, stray malformed closing quote 뒤 실제 raw candidate root는 계속 보존해야 한다.
- predecessor matrix fingerprint는 `d03275523a39930086f490ef5857a95ea75797739a0caadba05061e1bf249fda`, fresh matrix는 `fd9c88b6c2838f125bb974e13a05653982fe956e821797326674076bf31ea50d`, failure fingerprint는 `6fd77d85b3e0d24a75fe7c6620f78cf0a4019770fe4fb2415453e023d70e4ca3`다. audit report SHA는 `b1ec74da8a0999ca838418a5ffba33e4b4251b855cd90580eb85b7df6c9b6a30`, manifest JSON은 `8d15bffc25c0d9c00160c7e34e10cec0dfdcfd0c89f551e4217e6b0249283db6`, audit `MANIFEST.sha256` 파일 SHA-256은 `07dc5866b49071a8e071eee5a3b12964854ed4a8304c26e8038356320d2b5b24`다. root가 verifier를 두 번 재실행해 동일 failure를 재현했다.
- 이 subject는 immutable 실패 상태로 남기고 span-aware successor 교정을 별도 시작했다. provider/model/network/API/DB/private/secret/ledger/build/freeze/live 활동은 0이며 candidate 사용량은 계속 **0/1,000**이다.

## 2026-07-16 01:51 KST — production-bound reviewer calibration v3 독립 감사 재기각

### O140. 역할·해시·정책 필드가 존재해도 실제 사람·실제 slot·실제 문항 bytes에서 결정론적으로 파생되지 않으면 증거를 임의로 꾸밀 수 있다
- fresh auditor는 v3 subject verifier를 실행·import하지 않고 hostile fixture도 내용으로 열지 않은 채 opaque hash만 확인했다. JSON Schema 2020-12의 20개 oneOf branch별 독립 valid baseline을 만들고 총 2,179건을 공격했다. structural 1,522/1,522는 모두 거부됐지만 semantic/access/state 657건 중 선언 규칙이 344건만 막아 313개 bypass, 6개 blocker군이 남았다. verdict는 `FAIL_BLOCKERS`다.
- 첫째, role exclusion은 case-sensitive pseudonym 문자열만 비교한다. 한 사람이 `Actor-Pseudonym-0000`과 `actor-pseudonym-0000` 또는 새 별칭을 쓰면 author/auditor 비호환을 우회할 수 있다. 실제 canonical principal identity에서 domain-separated commitment를 만들고 one-principal↔commitment↔pseudonym registry와 독립 identity-binding attestation으로 비교해야 한다.
- 둘째, coverage PASS event의 `slotId`와 canonical type은 materialization event·eligibility·phase·type·terminal decision에 결속되지 않는다. 동일한 `MC-N-01` 하나로 25개 type의 서로 다른 PASS hash를 꾸며도 schema가 통과한다. coverage map은 type별 고유 eligible materialized slot과 exact terminal decision을 재계산해야 한다.
- 셋째, activation candidate/audit의 canonical-byte hash domain과 projection이 정의되지 않았다. digest 필드를 포함한 whole event라면 자기참조이고, 제외한다면 어떤 필드를 어떤 순서·encoding으로 묶는지 없어 임의 값도 통과한다. digest 필드를 제외한 exact projection에 versioned domain prefix·length framing·RFC8785/JCS 같은 단일 canonicalization을 실행 코드로 고정해야 한다.
- 넷째, 7-component fingerprint는 hash 필드만 있고 실제 committed passage window/topic/scenario/author/surface/type-family-epoch bytes에서 계산하는 normalization·composite 공식이 없다. 동일한 60개 표면에 임의의 서로 다른 bundle hash를 붙여 1,770 pair disjointness를 위조할 수 있었다. 다섯째, policy tuple은 state/resource class allow·deny만 있고 allowed actor roles가 없어 packet author도 trusted-gold audit bundle을 읽도록 허가할 수 있다.
- 여섯째, final `ACTIVATION_GRANT`는 authority/result access를 true로 바꾸면서 ready policy registry, policy matrix, nonempty allow/deny/role/resource proof를 결속하지 않는다. `policyRegistry.ready=false`와 빈 policy 상태에서도 grant event가 유효하다. final grant가 all-state nonempty policy root와 post-activation scope를 직접 재검증해야 한다.
- bypass group은 wrong-role access 100, undefined candidate/audit canonical domain 각 32, one-slot-as-25 coverage 25, identical-surface arbitrary fingerprint 60, empty-policy grant 32, same-person alias collision 32다. case digest는 `59051053e13cad2d2db17c964d1f33f6d54a4d90b6e5afc9dbf9c95a31c0a7a1`, bypass digest는 `014f0f37d408b36680014064afddfc270bacf980b80826143fae24a8942a1488`다.
- audit report SHA-256은 `845ff803b4930b99c5738ce1c26ef64f767a47ccd21ebd86116532505501fe22`, audit JSON은 `679e0ead6ae9cae524b2f4072a78c34f523f70ecee7e50c8f3e3cfe695eac80d`, hostile evidence는 `ebeb7d0410c84dc1ffc3412de2ee041a69f54fa64d1241530395d07c648d7296`, independent verifier는 `939752cd6d9fa7c6a527bb328de996fabca0eef33188f1773b72485abf42dba8`, audit `MANIFEST.sha256` 파일 SHA-256은 `d9f8256c9307a47e3ee11408b895f59d0047581058d5f82fa01107d5432adea5`다. root가 verifier를 두 번 재실행해 동일 2,179/313/6을 재현했고 subject MANIFEST `39f9d4729e9a09c7c4dc9644477bcdbd81c2f09b15b31f6837ea80ee73c59cd6`는 불변이다.
- v3는 immutable failure provenance로 보존하고 실제 identity·slot·bytes·role-policy·ready-policy를 계산하는 별도 v4 successor를 시작했다. evaluator/scoring/result/execution authority와 certificate/candidate/audit/grant는 계속 0이며 network/provider/model/API/DB/private/gold/secret/ledger/generation도 0, candidate 사용량은 **0/1,000**이다.

## 2026-07-16 01:42 KST — 연결성 v6 비-observer 시스템 경계 독립 감사 기각

### O139. 원장 파일 자체의 rename 내구성이 맞아도 새 실행 디렉터리·변환기·최초 프로세스 환경·배포 런타임이 봉인되지 않으면 전체 시스템은 실행 부적격이다
- strict observer와 coordinated offline behavioral authority를 명시적으로 제외한 v6 비-observer 상위 36파일 snapshot을 fresh auditor가 별도 388개 시나리오로 공격했다. snapshot SHA-256은 `e70ea9adb77a75a7034e1804bd569b70f057506a7395d9533ba3bcb36287cb85`이고 판정은 `FAIL_BLOCKERS`, blocker는 6개다.
- 긍정 경계는 유지됐다. Windows는 marker·ledger mutation 전에 거부되고, POSIX synthetic transaction은 open temp FD를 rename 뒤까지 유지해 target fsync→parent-directory fsync→post-attestation을 수행하며 그 뒤 실패를 `COMMIT_UNKNOWN`으로 분리한다. durable marker의 exclusive open/write/fsync/read/hash/identity/close/parent durability와 intent 실패 시 settlement/quarantine 0회도 독립 공격을 통과했다.
- S1은 `createExclusivePrivateRunDirectoryV6`가 새 `runsRoot`와 `runRoot`를 `mkdir`한 뒤 각각 그 새 directory entry가 속한 부모를 fsync하지 않는 결함이다. 이후 marker가 runRoot만 fsync해도 crash 뒤 private no-replay 경로 전체가 사라질 수 있다. S2는 author/compiler가 `node_modules/tsx/dist/cli.mjs`를 사용하면서 tsx transformer package/transitive implementation과 실제 transform provenance를 manifest/toolchain에 봉인하지 않은 결함이다.
- S3은 `operator-wrapper.mts`가 Node module import로 시작하므로 그 코드가 환경을 검사하기 전에 `NODE_OPTIONS=--require/--loader`가 이미 실행된다. 프로세스 내부 검사는 최초 preload를 취소할 수 없으므로 sealed POSIX external clean-environment bootstrap이 sole entry여야 한다. S4는 author environment 금지목록이 key case를 정규화하지 않아 `node_options`, `node_path`, `esbuild_binary_path` 같은 alias를 검사 없이 받아들인다.
- S5는 tracked `package.json`/deployment config의 Node pin과 current deployed commit/runtime parity가 없다. ignored `.vercel/project.json`에는 `nodeVersion=24.x`가 있으나 SHA-256 `c2387c39b820f9ecae28758176e7861ab9de9dbef33d94cb6a57f1ef292e33fe`, 마지막 갱신 2026-06-13, Git 비추적이므로 production authority로 세탁할 수 없다. S6는 current subject의 MANIFEST와 frozen runtime/live/compiler/offline artifacts가 아직 없다는 사실이며 observer와 fresh system audit가 통과하기 전에는 의도적으로 생성하지 않는다.
- audit `MANIFEST.sha256` 파일 SHA-256은 `1b4b92165f5db9e926fd47b2e413a055521151a1729fdff72443e15ffc99fe68`, report는 `384e416b84199d2ff10e5da95a0ba18a016da13c4f170297ab7eec7963779e62`, evidence는 `bcacf8c2ee0b4cacda33610577249b501e1ff1c8032d82447a7b1f77e2a80ccc`, independent audit는 `b0fe72d292ad2e7d0379040d02bc713d646e22164babfa6243bbe0a051748152`, verifier는 `4a22a247af8c9f475eeb9aea247b7802872d18eb379e73064e0d3f4cf945e12f`다.
- root 재실행에서 sequential verifier는 추가 8/8 동일 PASS였지만, 두 verifier를 동시에 띄우면 review-local 고정 `scratch-runtime`을 서로 삭제해 `ENOTEMPTY`/harness failure가 재현됐다. 이는 subject blocker가 아니라 sealed audit harness의 non-reentrant limitation이며 review를 수정하지 않고 기록한다. 따라서 동시 실행을 독립성 증거로 세지 않고, subject 6 blocker와 fresh successor audit을 별도로 유지한다.
- S1~S5 successor 교정을 별도 시작했으며 S6 freeze는 계속 금지한다. 이 감사·재현 구간의 network/provider/model/API/DB/private/secret/global-ledger mutation과 candidate 사용은 0이고 원장 SHA-256은 `9a05a64ed97c4746b7fe56933374d2179178885bd3e1db93f830f938bafdea1e`, 사용량 **0/1,000**이다.

## 2026-07-16 01:34 KST — production-bound reviewer calibration v3 작성자 봉인, 독립 권위는 아직 0

### O138. 전임 실패의 여덟 구멍을 닫았다는 작성자 증거와 실제 평가 권위 발행은 반드시 분리한다
- immutable v2 실패 provenance를 수정하지 않고 별도 `reviewer-calibration-v4-production-bound-v3`를 만들었다. evaluation-authority v2 subject/audit와 production type binding v4 subject/snapshot/audit, v2 subject 및 8-blocker FAIL audit를 exact-bind했고, 9 direct upstream bytes·38 direct manifest rows와 evaluation nested 10 bytes·24 rows 중 safe 23행을 재해시했다. private manifest 1행은 열지 않았다.
- B1/B2는 `PACKET_AUTHOR`·`ITEM_AUTHOR`·`GOLD_AUTHOR`를 명시하고 trusted-gold auditor의 역할·artifact authorship 제외, activation auditor의 모든 author/reviewer/gold-auditor/adjudicator/custodian/result-viewer 및 자기 artifact 제외를 schema와 registry에 결속한다. B3은 `FOCUS_ONLY`를 exact `GRAMMAR_ERROR`+`BLANK_INFERENCE` 2개, `ALL_25`를 canonical 25개와 각기 고유한 passed coverage-event hash로 고정하고 certificate→candidate→grant의 scope subset을 강제한다.
- B4는 authority-false activation candidate → 그 exact candidate의 independent audit report/manifest, authority false → 이미 존재하는 PASS report/manifest를 묶는 별도 final grant로 분리했다. candidate 안에 미래 자기 audit hash를 넣는 순환은 금지한다. B5/B6는 explanation/author hypothesis/rotation epoch를 포함한 12 hidden commitment, exact type-family-epoch/rights-PII와 7-component normalized fingerprint, 12/24/24의 1,770 pairwise disjointness, failed/rejected/prior-issued tombstone no-replay를 요구한다.
- B7/B8은 모든 12 state의 nonempty deny set과 state/resourceClass/policy/allowlist/deny/proof를 authorization·denial에 함께 묶고, phase 1 answer/gold resource를 schema상 표현 불가능하게 했다. `POST_ACTIVATION_RESULT`도 out-of-scope result, other identity, raw hidden commitment, rejection history, raw private gold 5종을 계속 deny한다. 접근은 append-only `AUTHORIZATION→OPEN→CAPABILITY_CONSUME→CLOSE` exact ordinal/prior-hash chain과 unique single-use capability registry를 요구한다.
- 작성자 verifier는 490/490 structural mutation과 321/321 executable semantic bypass를 거부했고 case digest는 `87ad86391e45880c9203ddbd8b1c8d5e51785834574908c753b20539c208bede`다. root가 두 번 재실행해 byte-identical 결과를 확인했다. public manifest SHA-256은 `e35dad2c680eef4ce9627400bbdecb4aee2aa02a88cea5b0945cce6cdb8bb253`, subject `MANIFEST.sha256` 파일 SHA-256은 `39f9d4729e9a09c7c4dc9644477bcdbd81c2f09b15b31f6837ea80ee73c59cd6`다.
- 현재 disposition은 `AUTHOR_EVIDENCE_COMPLETE_PENDING_FRESH_INDEPENDENT_AUDIT_NO_PASS_OR_AUTHORITY`다. 별도 fresh auditor가 700개 이상 공격을 새로 만드는 중이며, 그 전까지 execution/evaluator/scoring/result access는 false, reviewer certificate/candidate/audit/grant는 0이다. network/provider/model/API/DB/private gold/secret/ledger/question generation도 0이고 candidate 사용량은 **0/1,000**이다.

## 2026-07-16 01:26 KST — Linux ext4 실행 경계 v1 독립 감사 통과, 실행은 계속 차단

### O137. `/home`이 ext4라는 사실은 필요한 전제일 뿐이며 9p·런타임 불일치·이중 원장·재시작 미검증을 건너뛸 권한이 아니다
- `linux-ext4-execution-boundary-v1`의 7개 blocker를 제거하지 않은 design-only 경계를 fresh auditor가 subject verifier나 hostile suite를 신뢰하지 않고 재검증했다. WSL2 Ubuntu 24.04의 `/home`은 `/dev/sdd` ext4, statfs `ext2/ext3`, magic `0xef53`이고 `/mnt/d`는 `9p`/`v9fs`임을 20개 read-only probe로 다시 확인했다. 9p에서 fsync가 성공해도 crash durability 증거로 승격하지 않는다.
- 44행·1,489,112-byte public source closure를 독립 재해시해 row/hash mismatch 0, forbidden path 0, symlink/junction 0을 확인했다. 그러나 이 closure는 bootstrap public source일 뿐 private input ingress와 compiler closure가 아니며 source root 자체도 native ext4 materialization destination이 아니다. package install·build·copy·migration·freeze·filesystem probe write는 모두 0이다.
- Windows Node는 `v24.7.0`/npm `11.5.1`, WSL Linux Node는 `v22.22.0`/npm `10.9.4`로 실제 불일치한다. `package.json`의 Node engine과 `vercel.json`의 production runtime pin, deployed commit parity가 모두 없으므로 production parity 판정은 `UNKNOWN_BLOCKED`다. 이 상태에서 Windows bundle을 Linux로 복사하거나 Linux build를 production-identical이라고 부를 수 없다.
- independent hostile suite는 380/380 mutation을 거부했다. 9p fsync laundering, symlink/bind ancestor, most-specific mount 누락, source drift, recursive repo/Windows node_modules 복사, runtime pin 허위 주장, dual ledger, Windows mirror authority, full-lifecycle flock 약화, 두 executor 경합, C0를 2가 아닌 수로 예약하거나 둘로 나눠 commit, post-intent replay, graceful restart를 power-loss proof로 과장, stale mirror의 ledger/replay 영향, dispatch/install/build command 주입을 각각 공격했다.
- 판정은 `PASS_DESIGN_BLOCKERS_CORRECT`이며 **실행 승인 PASS가 아니다**. 남은 blocker는 final v6 freeze/audit 결속, complete execution/private/compiler closure, Linux-native toolchain·bundle materialization, Node/deployment parity, single ext4 ledger migration/audit, WSL restart recovery 실행, 별도 Linux execution authorization/audit의 7개다. execution/materialization/install/build/ledger migration/reservation/restart/network/dispatch 권한은 모두 false다.
- audit SHA-256은 `69e2073f768994715940711434a914aeac776d16da22ebcec0cbdacae4d67d90`, hostile evidence는 `08b8e7b8997467c64b649280b4879570a540535f0f6f1a21926e47be1cebda1e`, independent verifier는 `f2780e6aae767714012843a11e394fced3c503dee55b7b48b6f068045ee0bffe`, report는 `ad9dbf956db4156d2c0a2aede929f1a25c51e67e8b4c76bf200dfc6c860e233c`, audit `MANIFEST.sha256` 파일 SHA-256은 `b3f0c518fd7e07cd442c5c4abd6ce1f1f3db77ecee8e55f37f6615b18f98c3a3`다. root가 독립 verifier를 두 번 다시 실행해 동일 verdict와 380/380을 재현했다.
- 이 감사 구간의 network/provider/model/API/DB/secret/private artifact/budget-ledger read·write와 후보 사용은 0이며 candidate 사용량은 계속 **0/1,000**이다.

## 2026-07-16 01:22 KST — 연결성 v6 후보 관찰기 4차 독립 기각

### O136. 기존 461개 반례를 전부 닫아도 인용 문자열 경계가 후보 계보를 삼키면 안전한 후보 계수는 아니다
- exact observer SHA-256 `41969f7b9c7cad9c2e1da8568be86f646d103de4297038b9085c955a73002187`와 coordinated offline test SHA-256 `e06274726e50281e30015067910d20de50127a75798ada87ff320882acba880c`를 불변 대상으로 fresh independent re-audit v2를 수행했다. 직전 461-case 계약은 461/461 모두 통과했지만, 작성자 테스트를 가져오지 않고 새로 만든 456건 중 144건이 실패해 총 773/917, 판정 `FAIL_BLOCKERS`다.
- 첫 blocker는 invalid raw prefix 뒤의 정상 JSON-string wrapper다. decoded 출력이 공백·BOM·prose·fence·comma·colon으로 시작하면 quote recovery predicate가 그 문자열 root를 건너뛴다. 완전한 two-choice provider envelope가 실제로 들어 있어도 `choices=0`, `questions=0`, `candidateUnitsEffective=1`, `ambiguous=false`, `saturated=false`가 되어 64건 중 44건이 실패했다.
- 둘째 blocker는 unterminated/invalid-escape string이 escaped 후보 payload를 삼키는 경우다. unterminated string은 parser cursor가 EOF까지 진행해 recovery 기회를 없애고, invalid escape 뒤 payload는 주변 문자열용 escape 때문에 standalone JSON root로 읽히지 않는다. provider 1/2 choices, provider roots 2개, questions 2개와 혼합 lineage를 포함한 100/100건이 같은 안전하지 않은 기본값으로 축소됐다.
- 반대로 raw/decoded prefix·middle·suffix gap, typed choices/questions, provider message/delta, partial root, duplicate key, semantic leaf, arbitrary non-provider content, Cloudflare/HTML/error-body neutral control, exact byte/node/depth/1,001-candidate 및 4,096/4,097 recovery-attempt 경계는 통과했다. 독립 정적 증명도 cursor init 1·forward increment 19·decrement 0, disjoint span과 bounded monotonic recovery를 확인했다. successor는 이 선형·상한·중립 liveness를 보존하면서 valid quoted root를 경계에서 복구하고 malformed string 안의 escaped 후보 증거를 bounded 복구하거나 전역 ambiguity로 격리해야 한다.
- matrix fingerprint는 `d03275523a39930086f490ef5857a95ea75797739a0caadba05061e1bf249fda`, failure fingerprint는 `b1046d570c5c3547a74a61647b4800f9144e32f226b5d0e2483534a4429196b4`, review manifest SHA-256은 `3dddc69acabe9e4fa7cb7fa3c5366bd8cd9c6e8c3cd8aa7f65d4cb92d7f4f85d`, audit `MANIFEST.sha256` 파일 SHA-256은 `f02aec1088518c9dca924f74314c1bbc4bbafc86ef6e5529c35db0addb79aeb8`다. root가 독립 verifier를 두 번 재실행해 매번 `PASS_REVIEW_INTEGRITY_EXPECTED_OBSERVER_FAILURE_V2`와 동일 917/773/144를 재현했다.
- 이 감사와 재검증의 provider/model/network/API/DB/secret/private artifact/ledger/build/freeze/live 실행은 모두 0이다. v6 전체 실행 권위는 계속 0이고 candidate 사용량은 **0/1,000**이다.

## 2026-07-16 01:04 KST — production-bound reviewer calibration v2 독립 감사 기각

### O135. 빈 슬롯과 권위 0을 정확히 기록하는 것만으로는 미래의 자기감사·권위 과장이 구조적으로 차단되지 않는다
- `reviewer-calibration-v4-production-bound-v2` 작성자 검증은 evaluation-authority v2 subject/audit, production type binding v4 subject/snapshot/audit, v3 methodology를 public-only로 exact-bind했다. 25 UI/2 focus/23 nonfocus/8 families, pilot 12→main 24→trusted-gold audit→holdout 24→별도 activation 순서, 미래 슬롯 60개와 filled/actor/access/certificate/activation 0을 재계산했고 작성자 mutation 183/183, access 12/12를 통과했다. subject `MANIFEST.sha256` 파일 SHA-256은 `10801e127bb612e2bb6909acf857ff6fa2ef0cac667a0fd7e4e39f774e656413`다.
- 그러나 fresh auditor가 작성자 verifier와 mutation generator를 증거로 재사용하지 않고 256 mutation과 21 access scenario, 총 277건을 다시 구성하자 8개 blocker가 재현됐다. 첫째, `PACKET_AUTHOR`가 item/gold author를 포함한다는 정의와 역할이 없어 trusted-gold auditor가 자기 작성 gold를 감사할 수 있다. 둘째, independent activation auditor가 packet/item/gold author, 두 reviewer, trusted-gold auditor, custodian과 겸임 가능해 자기 activation을 감사할 수 있다.
- 셋째, certificate와 activation이 exact canonical type별 passed coverage-event hash·scope·count를 결속하지 않는다. epoch 1은 nonfocus 16/23 접촉뿐이고 contact는 certification이 아닌데도 global 25-type claim을 물질적으로 막지 못한다. 넷째, activation event 안에 그 event를 사후 감사할 미래 audit manifest/PASS를 요구해 순환 의존이다. authority-false candidate event→그 exact candidate의 독립 audit→PASS audit를 결속한 별도 final grant로 나눠야 한다.
- 다섯째, slot materialization schema가 explanation evidence, author hypothesis, rotation epoch를 허용하지 않고 typeId/familyId를 binding-v4 exact enum/rotation pair에 묶지 않는다. 여섯째, 12/24/24의 normalized text-window/topic/scenario/author/surface fingerprint와 pairwise disjoint/no-replay proof가 없어 실패 문항을 opaque hash만 바꿔 재발행할 수 있다.
- 일곱째, authorization이 current state, resource class, policy/allowlist proof를 묶지 않아 phase 1에서 opaque answer/gold resource hash를 ALLOW할 수 있다. 여덟째, sealed OPEN/CONSUME event와 capability uniqueness registry가 없고 사후 receipt의 self-reported openedAt만 있어 backdated ALLOW와 capability 재사용이 구조적으로 통과한다.
- 독립 verdict는 `FAIL_BLOCKERS`, case digest `e5044394edcf5e24867b7dea527ba3f4e566312019009215b1ffed9bd62b91a7`, audit `MANIFEST.sha256` 파일 SHA-256 `f78ba69b164f737b6531c2e7415bd26cf147afc6012265a13a8434882b891bc5`다. public lineage는 direct 7, direct manifest 26행, evaluation nested 10 및 safe 23행을 재해시했고 `private/.gitignore` 1행은 열지 않았다. v2는 불변 실패 provenance로 보존하고 B1~B8을 schema·state machine·role registry로 닫는 별도 v3 successor만 허용한다.
- 이 감사 구간의 실제 문항/gold/actor/access/certificate/authority/network/provider/model/API/DB/secret/ledger 활동은 0이고 candidate 사용량은 계속 **0/1,000**이다.

## 2026-07-16 00:45 KST — 연결성 v6 시스템 경계 내부 통과와 후보 관측기 3차 독립 기각

### O134. 내구성·도구체인·원장 경계가 통과해도 후보 관측기가 한 계보를 숨기면 전체 실행 권위는 없다
- v6 시스템 교정은 v5의 C2~C4를 별도 구현으로 닫았다. temp descriptor를 rename 이후까지 유지하고 target/descriptor identity와 bytes를 다시 확인하며, renamed target fsync와 POSIX parent-directory fsync 전에는 commit을 확정하지 않는다. 그 이후 장애는 `COMMIT_UNKNOWN`으로 분리한다. 실제 exclusive marker는 write/fsync/descriptor read/hash/identity/close/parent durability를 거치며 intent marker 실패 시 settlement와 quarantine callback은 0회다.
- Windows의 target fsync+parent lstat는 rename directory entry의 crash durability 증명이 아니라는 root 반론을 수용했다. win32는 marker·ledger mutation **이전**에 typed unsupported로 fail-closed하고 protocol도 `windowsLiveExecutionAllowed=false`와 POSIX 7개 플랫폼만 authorization 대상으로 고정했다. system 17/17, offline 87/87, 통합 104/104가 통과했다. v6 source의 TypeScript 오류는 0이고 현재 전체 scoped 검사에는 이 작업과 무관한 기존 webtoon 오류 7개만 남는다.
- bundler는 esbuild 전체 JS/native package closure, 선택 executable, package-lock, TypeScript source analyzer, reviewed builtins와 unresolved `pnpapi`, role별 exact source-path allowlist를 봉인한다. author child는 preload/TSX/Yarn PnP ambient를 거부한다. `--check`는 디렉터리 생성 부작용도 제거했고 미동결 `frozen-runtime-v6.json`에서, verifier는 미동결 `offline-exact-wire-seal-v6.json`에서 각각 예상대로 fail-closed했다. freeze 산출물·MANIFEST는 작성하지 않았다.
- 그러나 fresh observer re-audit는 strict observer SHA-256 `a7900fd2026eac7d63a2aca53ec77402bd18b9274b12699470f7bc3df89ee47d`를 461개 독립 case로 공격해 367 PASS/94 FAIL을 냈다. B1은 정상 1-choice envelope 또는 decoded question 옆의 두 번째 neutral root와 failed/truncated tail을 버려 `ambiguous=false`로 만드는 결함이다. root가 직접 재현한 provider+`{}`, provider+`null`, provider+`{`, provider+unterminated string도 모두 choices 1/effective 1/ambiguity false였다.
- B2는 prefix recovery 부재다. decoded content 앞의 `null`, `true`, `0`, BOM, code fence, prose, comma, colon이 뒤의 1~2 question을 숨기고, 비JSON prefix는 raw body 뒤의 1~2 provider choice/root도 숨겼다. `code fence + raw two-choice envelope`는 실제 2 choices가 choice 0/effective 1/ambiguity false가 됐다. 단순히 모든 malformed text를 후보로 세는 방식은 liveness를 파괴하므로, bounded linear recovery로 candidate-bearing root만 되찾거나 동일하게 강한 unobservable/quarantine 상태를 내면서 pure-neutral control은 보존해야 한다.
- 독립 감사 판정은 `FAIL_BLOCKERS`, matrix fingerprint `a2136f586fdaaca7d0cd46fb30e135db47c8ef8666e4994c8f5c9bca3c3eb432`, failure fingerprint `1568d5165c73aff6081672f16429e8f94eb6f05bb350f43a206860616f7ee371`, audit `MANIFEST.sha256` 파일 SHA-256 `67111f206e5acbb20118f33d7f67d8164824f2ed0278fb905fb237a48c7b615a`다. 네 개의 직전 blocker와 exact byte/node/depth/1,001 경계는 통과했지만 새 두 blocker 때문에 author freeze·metadata capture·C0·S1은 계속 차단한다.
- 이 구간의 freeze/write/network/provider/model/API/DB/credential/private result/global-ledger mutation은 모두 0이다. 원장 SHA-256은 `9a05a64ed97c4746b7fe56933374d2179178885bd3e1db93f830f938bafdea1e`, used/reserved/accepted/modelCalls/cost/batches는 모두 0, candidate 사용량은 **0/1,000**이다.

## 2026-07-16 00:37 KST — 평가 권위 v2 독립 감사 통과, 실행 권위는 계속 0

### O133. 평가 절차의 설계가 독립 검증을 통과한 것과 실제 평가자가 인증된 것은 전혀 다른 사건이다
- `evaluation-authority-v2`는 현재 public rubric·전역 registry v2·S1 current-source seal·production type binding v4 subject/audit·v3 taxonomy를 exact-bind하고, 과거 998+2 배치와 단일 taxonomy 권위를 명시적으로 폐기한다. root 재검증에서 subject TypeScript, verifier, hostile 73/73이 모두 통과했고 protocol SHA-256은 `149228ef8ce2273f143a8a265c070a69735124d5a140e2e0ca2bca3d88b479fa`, public manifest는 `c62fb02e27b0342ce31fe8fc38ec32034738bfe2ddadec9fe2861a1ae8e614bd`, subject `MANIFEST.sha256` 파일은 `ac4ed7ee8bd5eb21bd45837f2a7396219142e6ccd3a1fe933916238e447f0180`다.
- fresh independent audit는 작성자 verifier를 증거로 재사용하지 않고 127/127 mutation과 12/12 접근 시나리오를 통과했다. 9개 상태의 nonempty deny set, auditor와 pilot/main/holdout/S1 역할의 비호환, capability·authorization·open·close 순서, 15개 seal, S1 phase-1의 8개 hidden class와 별도 commitment를 공격했다. public lineage 23행을 재해시했고 금지된 private 선언 1행은 열지 않았다. 판정은 `PASS_NO_BLOCKERS`, audit manifest 파일 SHA-256은 `0cdf9d676bdec820e728a3b3890237b3b80d201caa2c20afc7af46ed6482adf5`다.
- 이 PASS는 오직 **design-only 계약**에 대한 것이다. evaluator/scoring/generation/result access/profile selection/release authority는 모두 false이며, 인증 reviewer 0명, adjudicator 0명, 평가 eligible item 0개다. 따라서 S1 결과를 열거나 F/C/B/A를 매기거나 profile을 선택할 권위는 아직 없다.
- 다음 단계는 실패한 `reviewer-calibration-v4-production-bound-v1`을 수정하는 것이 아니라 별도 v2 successor를 만들어 평가 권위 subject/audit와 production type binding v4 subject/audit를 함께 exact-bind하는 것이다. 이어 실제 12 pilot → 24 main → independent trusted-gold audit → fresh 24 activation holdout → 별도 activation audit가 모두 사건·접근 영수증으로 성립해야 한다. 그 전까지 candidate/API 사용량은 **0/1,000**이고 network/provider/model/DB/secret/global-ledger 접근·수정도 0이다.

## 2026-07-16 00:22 KST — 연결성 v6 후보 계수 교정본 독립 감사 재기각

### O132. 작성자 회귀 37/37은 충분하지 않았고, explicit container의 ‘형식이 깨진 각 원소’도 후보 계보이며 metadata 문맥은 후보가 아니다
- 작성자 교정본 `strict-json-observer.ts` SHA-256 `c8eed8df95416dc31bb5b1ab5920e16d5dc555cf2a14a629c1f95eeb6683adad`, `offline.test.ts` SHA-256 `2128a55dc53862ad0f743cd0ae7d887999ce3c921a451f8cffb050f046f28c5a`를 불변 대상으로 fresh independent read-only 156-case matrix를 실행했다. 146개 본 matrix와 C3 neutral-tail wrapper 10개 중 21개가 실패해 판정은 `FAIL_BLOCKERS`; author freeze는 계속 차단한다.
- 첫째, provider `choices`가 배열이 아니면 그 내부 복수 lineage가 사라졌다. `{"model":"m","choices":{"a":{"index":0,"message":{"content":"bad"}},"b":{"index":1,"message":{"content":"bad"}}}}`와 JSON-string으로 감싼 2원소 choices 배열이 모두 choice/question 0, effective 1, ambiguity false였다. explicit provider-choice container의 각 map value·array element는 질문 schema가 깨져도 물리적으로 요청된 completion 계보 하나씩이다.
- 둘째, explicit `questions`도 동일하게 축소됐다. `{"questions":{"left":{"id":1},"right":{"id":2}}}`는 2개 map entry를 1문항으로, `{"questions":["first","second"]}`는 두 malformed element를 0문항/effective 1로 셌다. 빈 container는 0, singleton은 1, 두 원소·두 map value는 2로 보존해야 하며 문항 schema 유효성은 parser가 별도로 기각해야 한다.
- 셋째, key를 읽은 직후 value가 시작되기 전에 잘리면 candidate marker 자체를 버렸다. 완전한 1문항 뒤 `{"questions":` tail, 또는 `{"direction":"x","options":`가 direct 및 `message.content` 안에서 effective 1/비격리로 남았다. lossless partial AST는 value partial node가 없어도 이미 읽은 key와 incomplete typed placeholder를 보존해 affirmative truncation을 ambiguity로 만들어야 한다.
- 넷째, 문맥 오탐이 남았다. 정상 question의 `metadata:{options:["x"],difficulty:"HARD"}`가 두 번째 question으로, 중립 최상위 `{kind:"answer-choice-metadata",choices:[A..E]}`가 provider 5 choices로 계산됐다. `options+difficulty` 같은 2-key heuristic과 ‘최상위 choices면 provider’ 규칙을 폐기하고, direct question context와 provider envelope sibling/element evidence를 분리해야 한다.
- 반대로 exact byte/node/depth/candidate-cap의 n-1/n/n+1, 1~5중 wrapper, 기존 얕은 C1~C4/O1~O3는 통과했다. 즉 경계 상한 구현은 유지하되 typed container lineage·partial key·context 분류를 재교정하고 최소 200개 새 결정론 반례를 통과시킨 뒤 또 다른 fresh audit을 한다. 독립 감사에서는 private/env/DB/network/API/ledger/frozen-output 접근과 파일 수정이 모두 0이었고, 전역 후보 사용량도 **0/1,000**이다.

## 2026-07-16 00:14 KST — S1 평가 권위 독립 재감사 기각

### O131. 생성 연결성이 통과해도 trusted gold와 인증 평가자가 0명이면 S1의 F/C/B/A 점수와 프로필 선택에는 연구 권위가 없다
- public artifact만 사용한 독립 평가 게이트 감사의 판정은 `FAIL_CLOSED`다. 현재 확실한 권위는 production type binding v4 subject manifest `715818a82951a8c51460a3216b81d46c3184a1db934cc96e27602bc666024f04`와 독립 감사 manifest `796adc11ef8c4a07b0536aee6f0e60d732b09c40ac7e39d704b70a8a6ed9032d`가 주는 **현재 manual/non-Korean primary fast 경로의 유형·route 결합**뿐이다. 이는 evaluator 정확성이나 문항 품질 권위가 아니다.
- all-types rubric v1은 F/C/B/A 구조 계약, blind-adjudication-power v1은 `DESIGN_ONLY`, grammar/blank solver certificate는 mechanism-only다. grammar certificate는 fresh truth holdout·wire/비용·false-accept 정책이 없어 `EXECUTION_BLOCKED`이고, blank certificate는 현재 계약의 `stance`, `temporalRelation`을 제외한 5축뿐이다. 어느 것도 사람의 의미 판단이나 trusted gold를 대체하지 않는다.
- calibration v1은 constructed 복수 정답을 schema가 표현하지 못해 `INVALIDATED_FOR_CERTIFICATION`이다. v2는 public status가 `GOLD_ADJUDICATION_PENDING`, 인증 평가자 0명이며, phase3 독립 감사 manifest `f611fbcf8477f337531d395e709ded78f65c4b8a998d4b8910172b7ed224d5b3`의 판정은 `FAIL/BLOCK`이다. 핵심은 adjudicator C의 phase-blind provenance 부재, N05/N06/N07 constructed answer space의 의미적 비폐쇄, major 근거 오류 2건, 부적격 nonfocus composition `C3/F5`, A/B/C 전원 threshold preview 실패다. v3 replacement는 accepted point-family set·correction equivalence·blank 7축 vector를 도입했지만 `DESIGN_ONLY_UNISSUED`, 실제 anchor/gold/certificate는 0이다. v4 production-bound v1도 `DRAFT-BLOCKED`, manifest 부재, 실패한 type binding v2 고정 때문에 사용할 수 없다.
- 식별 가능성도 차단됐다. v2 평가자들은 grammar/blank의 정답과 fatal flag에는 각각 8/8 합의했지만 세부 diagnosis exact는 두 유형 모두 0/8이었다. grammar 40 site에서 grammaticality/diagnosis 24, point family 11, correction exact 8; blank 40 option에서 primary intent 10, divergent-axis exact set 2에 그쳤다. 따라서 과거 단일 `pointFamily`, `primaryIntentAxis`, `divergentAxes`를 그대로 점수화하지 않고, v3의 accepted sets·correction equivalence·7축 relation vector·복수 decisive axes로 교체한 fresh taxonomy pilot을 먼저 통과해야 한다.
- blind-power v1의 과거 `998 scheduled + locked 2` 배치는 현 global registry v2의 `C0=2, S1=180, S2=480, S3=92, S4=144, S5=102`와도 다르다. S1 180·cell당 6은 안전·기전 screen으로만 사용할 수 있고 arm ranking, 프로필 우열, release 결론을 내릴 표본이 아니다. 현 S1 package 역시 type binding만 묶고 rubric/calibration/adjudication 권위를 묶지 않았다.
- 결과를 보기 전에 새 `evaluation-authority-v2`가 all-types rubric, registry v2, S1 assignment seal, type binding v4 subject/audit, v3 taxonomy를 exact-bind하고 과거 allocation·단일 taxonomy를 명시적으로 supersede해야 한다. 이어 production-bound calibration은 fresh 12 taxonomy pilot → 24 main → independent trusted-gold audit → fresh 24 activation holdout 순서, pre-access authorization·deny set·phase seal·role incompatibility, 인증 reviewer 2명과 fresh adjudicator 1명을 실제 event로 증명해야 한다. S1 blind packet은 결과 접근 전에 surface hash·relabel·order를 봉인하고 phase 1에서 plan/model/profile/cost/key/explanation을 숨겨야 한다.
- 따라서 connectivity가 먼저 통과하더라도 평가 권위가 발행되기 전에는 S1 출력을 열거나 점수·프로필 선택에 사용하지 않는다. 새 평가 권위 패키지의 design-only 구현을 별도 시작했으며, 이 감사와 기록 구간의 private gold/reveal/network/provider/model/API/DB/global-ledger 접근·수정은 0이다. 전역 원장 사용량은 계속 **0/1,000**이다.

## 2026-07-15 23:59 KST — 연결성 v6 초안 적대 검토 기각

### O130. 후보 계수는 전역 최대값이 아니라 계보별 합이어야 하고, 안전한 초과 차단과 불필요한 1,000-cap 전역 격리를 동시에 검증해야 한다
- 아직 봉인하지 않은 v6 draft의 `strict-json-observer.ts` SHA-256 `4f6f626bc268127130fbaff40881199de6dcd8b430b13338a38591824126b001`를 대상으로 독립 81-case read-only matrix를 실행했다. 판정은 `FAIL / AUTHOR_FREEZE_BLOCKED`다. 검사 전후 observer와 `terminal-reconciliation-core.ts=42091f87b1c43ed1041780a3aa0859e94d1433be1d9aa5f67e2713faf6797da2`, `production-runner.ts=56519dd35166a4a5b29a6bd1379e72b4c5d986cb2873627756653e38ce1ee394`가 불변임을 재확인했다.
- safety undercount는 네 계열이다. 비배열 `choices/questions`와 비문자열 `message.content` 내부의 두 문항, 완전한 JSON string wrapper 뒤 malformed tail 및 인접 wrapper, neutral duplicate 64개 뒤 candidate duplicate, 서로 독립인 provider-choice branch와 direct-question branch가 모두 `candidateUnitsEffective=1`, `quarantine=false`로 빠질 수 있었다. 특히 global `max(choicesObserved, fullQuestionObjectsObserved)`는 동일 choice 안의 중복 계수는 줄이지만 서로 다른 가지까지 한 후보로 합친다.
- liveness over-quarantine도 별도 결함이다. 한 question 내부의 답지 필드 `choices:[A..E]`를 provider choices로 오인해 effective 6으로 만들고, candidate와 무관한 JSON-looking string 65개나 단일 marker 257개가 단순 evidence 저장 상한을 넘었다는 이유만으로 남은 전역 capacity 전체를 격리했다. 완전히 관찰된 schema-invalid 1후보와 후보 수를 실제로 지울 수 없는 상태를 분리해야 한다.
- 교정 계약은 계보 기반이다. 각 provider choice는 `max(1, 그 choice 내부 complete question 수)`, provider envelope은 choice별 합, 그 envelope 밖 독립 question/naked-question branch는 별도 합으로 센다. `choices`는 parent/element가 provider envelope/choice shape일 때만 provider surface로 보고 answer-option `choices`는 제외한다. duplicate entry를 보존하는 bounded JSON tree/sequence를 valid·malformed·wrapper에 공통 적용하고, 디버그 evidence 64/256행 절단은 semantic observation saturation과 분리해야 한다.
- C2~C4 및 봉인 경계에서도 초안 blocker를 확인했다. 새 `bundler-toolchain-provenance.ts`가 `MANIFEST_PATHS`에서 빠졌고 verifier가 manifest 밖 expected source set을 독립 계산하지 않는다. esbuild build가 `tsconfigRaw` 없이 local→root tsconfig와 root package metadata를 ambient input으로 읽을 수 있다. terminal intent의 네 fault test는 실제 marker I/O가 아니라 동일 throwing mock에 서로 다른 라벨만 붙였다. 또한 rename이 실제 ledger commit point인데 `committed=true`를 post-commit attestation 뒤에 세워, post-check 실패 시 target은 교체됐어도 caller가 `GLOBAL_RESERVATION_NOT_COMMITTED`로 오분류할 수 있다. 마지막으로 offline test는 77개인데 author gate는 exact 72로 고정돼 있다.
- 따라서 v6는 partial patch로 봉인하지 않는다. candidate lineage counter 재작성, malformed/duplicate/wrapper 및 no-over-quarantine 회귀, manifest exact source closure, ambient build input 제거·봉인, 실제 durable-marker fault 증거, rename-completed/commit-unknown 상태를 모두 닫은 뒤 author full gate와 fresh independent audit를 새로 수행한다. 이 구간의 network/provider/model/API/DB/credential/private-wire/global-ledger 접근·수정과 후보 사용은 모두 0이며 전역 원장 SHA-256 `9a05a64ed97c4746b7fe56933374d2179178885bd3e1db93f830f938bafdea1e`, 사용량 **0/1,000**이다.

## 2026-07-15 23:48 KST — S1 현재 소스 재봉인 준비·실행 차단 유지

### O129. 180문항 배정은 그대로 보존하되 stale source closure만 현재 바이트로 교체했고, 연결성 독립 PASS 전에는 한 행도 실행하지 않는다
- 기존 `campaign-v6-s1`은 수정하지 않고 stale provenance로 보존했으며 별도 `campaign-v6-s1-current-source-v2`를 만들었다. private queue는 old/new 모두 530,180 bytes, SHA-256 `6b7a8ee4aa05f089ccfe992b83547449d1923b2b65cf93ed36785f0330774971`로 byte-identical하다. 12 passages·180 assignments·seeded order·profile·plan·difficulty와 assignment별 candidate/fetch/semantic/outer-attempt/SDK-retry=`1/1/1/1/0`, replacement/top-up 금지를 그대로 유지했다.
- 원래 55-source closure를 현재 worktree에서 다시 계산한 SHA-256은 `4bf46e42d2af491575a9917827d038e184ce968eb7e9eb75f1f46e42133e3485`이고 정확히 7개 경로만 drift했다. 7개 모두 Git `??`, index/HEAD blob null, path history 0이므로 과거 hash를 Git 계보로 가장하지 않고 stale artifact seal → current worktree hash 관계로 공개 기록했다.
- production 유형 권위는 v4 subject manifest `715818a82951a8c51460a3216b81d46c3184a1db934cc96e27602bc666024f04`와 independent audit manifest `796adc11ef8c4a07b0536aee6f0e60d732b09c40ac7e39d704b70a8a6ed9032d`에 exact pin했다. 연결성은 placeholder나 v5로 대체하지 않고 `PENDING_CONNECTIVITY_V6_INDEPENDENT_PASS`; `frozenForExecution=false`, `generationAuthorized=false`, eligible assignment 0이다.
- 최초 작성자 보고의 TypeScript PASS를 root가 README 그대로 재실행하자 상위 tsconfig의 `exclude: experiments`를 상속해 `TS18003`/입력 0으로 실패했다. 이를 `exclude: []`, `incremental:false`로 고치고 verifier가 로컬 `tsc --showConfig`의 resolved input을 `build.mts`, `hostile-tests.mts`, `verify.mts` 정확히 3개로 강제하도록 보강했다. root 재실행에서 build check, verifier, hostile 26/26, 실제 `tsc --noEmit`가 모두 PASS했고 `tsconfig.tsbuildinfo`는 없다.
- 새 manifest 파일 SHA-256은 `8554231197d0e2a5194ef9a44c36750e820333183cb3ce6c4299d5e69c307d43`이며 7/7 entry가 exact 일치한다. public artifact SHA-256은 `3fdff5bcbb6cc24f981dd09f3c53a0d2418c6089287fea906223b104097339a2`다. 이 준비 구간의 network/provider/model/API/DB/secret/global-ledger 접근·수정은 0이고 후보 사용량은 **0/1,000**이다.

## 2026-07-15 23:45 KST — 연결성 v5 독립 기각·v6 교정 경계 확정

### O128. 작성자 검증이 모두 통과해도 후보 계수·파일 identity·번들러 계보·정산 선행조건이 비면 live 권한은 발행할 수 없다
- frozen `campaign-v6-connectivity-pilot-v5`를 수정하지 않고 fresh independent reproduction으로 다시 공격했다. 대상 public manifest 39개는 시작·종료 모두 exact 일치했고 snapshot SHA-256 `24ff47fc58580de5f0341e220ebde8c491fa61fe507196739648e4d70f93539b`가 불변이었지만, 최종 판정은 `FAIL_BLOCKERS`다. 잘못 의심했던 runId traversal은 public runner의 `^[a-z0-9][a-z0-9-]{7,80}$` 선행 검증 때문에 blocker에서 철회했다.
- `C1_VALID_WRAPPER_CARDINALITY_UNDERCOUNT`: 문항 객체 2개를 담은 유효한 root array와 JSON-string wrapper가 모두 `candidateUnitsEffective=1`, `cardinalityAmbiguous=false`로 계수됐다. 후단 parser가 거부해도 이미 낮게 기록된 후보 수는 복구되지 않는다. v6는 모든 유효 root/container/array/JSON-string wrapper를 bounded traversal하고, 후보 가능 subtree·관측 한계·불완전 tail은 fail-closed ambiguity/quarantine로 처리해야 한다.
- `C2_CLOSED_TEMP_PATH_IDENTITY_NOT_REATTESTED`: v5는 `wx` temp handle을 닫은 뒤 hook과 rename 사이에 temp pathname을 새 inode로 교체해도 `committed=true`를 반환하고 교체 바이트를 target에 반영했다. v6는 최초 handle을 write/fsync부터 pre-rename identity/hash 검증, rename, post-commit target↔open-handle identity/hash 검증까지 열어 둔 뒤 닫아야 하며 Windows 실제 rename 동작까지 회귀해야 한다.
- `C3_BUNDLER_IMPLEMENTATION_UNSEALED_NO_INDEPENDENT_EQUIVALENCE`: v5 artifact는 esbuild 이름·버전과 결과 bundle만 봉인하고 실제 `node_modules/esbuild/lib/main.js` 및 선택 native `esbuild.exe` 구현 바이트를 봉인하지 않았다. 같은 ambient esbuild로 rebuild한 byte equality는 공통원인 재현일 뿐 독립 source→bundle 계보다. v6는 esbuild 전체 package set, 선택 native package/executable, transitive JS closure, package-lock, pre/post build identity와 source↔bundle provenance를 exact seal해야 한다.
- `C4_INTENT_WRITE_FAILURE_DOES_NOT_GATE_SETTLEMENT`: v5는 terminal-intent marker 쓰기 실패를 catch한 뒤에도 quarantine 또는 ordinary global settlement 호출로 계속 진행한다. v6는 durable intent 성공을 정산 진입의 명시적 선행조건으로 만들고, partial-write/fsync/rename/cleanup fault에서 두 settlement callback 호출 수가 모두 0임을 증명해야 한다.
- root가 독립 `reproduce.mts`를 다시 실행해 C1~C4, model 순서·route·reasoning, price maxima, billing equality, permanent no-dispatch와 subject 불변을 재현했다. 독립 review manifest 파일 SHA-256은 `4d8b3037450e3d9d5a02d755e7a567f1dd30f0cf1f2bccc8c3f870b499e0ab55`이고 4/4 entry가 exact 일치한다. `REPORT.md=796c75902cedab7caff02a805199bec6ca54213d197f616dd913a596fbcf106c`, `evidence.json=b0c1f3cb619abd822474ebb088db56edae0eff636bd847af8804705823311f71`, `reproduce.mts=c160519bdcf49380f172b3419b518aaec04be3b9589d4fa36d93e60ea208edf6`, `review.json=0395112facc4b44f9e664ca828883cd89e81eb8717ca1ee0ad1e60de75db8e28`이다.
- v5는 immutable 실패 provenance로 남기고 successor v6는 위 4개 경계를 모두 구현·봉인한 뒤 **새 독립 감사**에서 PASS해야 한다. 그 다음에도 별도 authorization artifact를 다시 만들고 감사하기 전에는 metadata/model dispatch를 허용하지 않는다. 이 구간의 network/provider/model/API/DB/credential/private-wire/global-ledger 접근·수정은 0이며, 전역 원장 SHA-256 `9a05a64ed97c4746b7fe56933374d2179178885bd3e1db93f830f938bafdea1e`, 후보 사용량 **0/1,000**은 그대로다.

## 2026-07-15 23:30 KST — production 유형 binding v4 독립 승인

### O127. 실제 요청 경로와 전체 전이 source closure를 함께 묶은 뒤에야 25유형 회전표가 실행 권위를 얻었다
- v3에서 기각된 secondary batch와 legacy Trigger를 되살리지 않고, `/director/workbench/questions/generate`의 `MANUAL_AND_NON_KOREAN_ONLY` 상태에서 실제로 도달하는 `PRIMARY_WORKSPACE_FAST_ONLY`만 다시 봉인했다. desktop row→modal과 mobile `MobileStepNav` 양쪽이 `handleWorkspaceGenerate → fast scheduler → literal fast POST → manual plan → assignment budget → shared runtime → schema`로 이어지고, `questionType`·`questionTypeSettings`가 끝까지 보존됨을 AST로 확인했다.
- v4 작성자 subject는 production source 256개(247 tracked + 9 `WORKTREE_ONLY_UNTRACKED`), 재귀 runtime closure 241파일, local import edge 709개를 raw worktree/Git filtered blob/index/HEAD/porcelain/path commit과 함께 고정했다. untracked 9개는 현재 worktree 권위일 뿐 배포 커밋 권위가 아니므로 `deployedCommitParity=false`를 유지한다. 작성자 검증은 기준·적대 검사 2,716/2,716과 hostile 54/54를 manifest 포함 두 번 연속 재현했다. 대상 manifest 파일 SHA-256은 `715818a82951a8c51460a3216b81d46c3184a1db934cc96e27602bc666024f04`, 대상 snapshot SHA-256은 `d126aa316d8c1457d71989441a49d7ca93676687b2032a738d4ea71cd6531967`이다.
- fresh independent auditor는 대상 verifier·builder·fixture runner를 증거로 재사용하지 않고 256개 path별 Git 명령, 6 root의 full transitive closure, desktop/mobile 제어흐름, 25 UI 유형·focus 2·nonfocus 23·8 family·32 schedule row와 회전 수학을 별도 구현으로 재계산했다. 동일 frozen 독립 verifier를 두 번 연속 실행해 각각 20/20 checks와 독립 hostile 20/20을 통과했고 시작·종료 target/source/Git snapshot도 불변이었다. 판정은 `PASS_NO_BLOCKERS`다.
- 독립 감사 개발 중 merge path history, edge serialization order, mobile IIFE unwrap, hostile anchor 등 감사기 오류 5건이 먼저 드러났으나 대상 blocker와 분리해 모두 기록했다. 교정 뒤 대상과 독립 계산은 exact 일치했다. 독립 감사 manifest 파일 SHA-256은 `796adc11ef8c4a07b0536aee6f0e60d732b09c40ac7e39d704b70a8a6ed9032d`, `REPORT.md=9d67a9ac9682849e380e89d99a7d96674248ece817fc4b3e58b866675b21afaa`, `audit.json=cab697d9e34b97469fc01fc1f090e21f2bc24d4d8d31cb3e9c3f21fc8c0b2526`, 독립 verifier `c8562e2d1d45065a2a77d637179663a94396bc0f64ade98491a53d489fdcde2e`다.
- 이 PASS는 현재 worktree의 수동 비한국어 fast 경로와 평가 rotation의 **권위 결합**이지 실제 문항 품질 인증이나 deployed parity가 아니다. 모든 유형의 scorer 품질과 아름다운 선지 설계는 이후 독립 생성·평가 표본으로 검증한다. 이 구간의 network/provider/model/API/DB/secret/trusted-gold/ledger 접근·수정은 0이며 전역 원장 SHA-256 `9a05a64ed97c4746b7fe56933374d2179178885bd3e1db93f830f938bafdea1e`, 후보 사용량 **0/1,000**은 그대로다.

## 2026-07-15 22:29 KST — production 유형 binding v3 독립 기각

### O126. AST에 함수와 endpoint가 존재한다는 사실은 요청 경로에서 도달 가능하다는 증거가 아니다
- v3 독립 감사의 최종 판정은 `FAIL_BLOCKERS`, 회전·25/23 canonical 수학은 `PASS_CANONICAL_AND_ROTATION_MATH`, 전체 실행 권한은 `FAIL_NOT_ISSUABLE`이다. root도 독립 verifier를 반복 실행해 매번 183/183 PASS를 재현했고, 대상 manifest `d01349a4856097992ea4ef48f65221ed6adb44ca4b7baad9198d99ecb9638481` 및 auditCore `356085dcf0a5d34b5026519b03ea2d1e098db97de5a5e5b769aba8ff6fcc60cb` 결합을 확인했다.
- blocker 4개는 `SECONDARY_BATCH_NOT_REACHABLE_FROM_REQUESTED_ROUTE`, `LEGACY_TRIGGER_BRANCH_IS_DEAD_CODE`, `SCHEMA_RUNTIME_SOURCE_CLOSURE_FAIL_OPEN`, `INTERACTIVE_DISPATCH_CLOSURE_INCOMPLETE`이다. `handleBatchGenerate`는 현재 요청 URL의 유일한 패널 렌더에서 `hideGenerateButtons`로 비활성이고 `PassageCardGrid`에서도 호출되지 않는다. `enqueueJob → createQuestionGenerationJob → legacy POST → Trigger` 역시 선언과 dependency-array 참조만 남은 dead branch인데, v3는 전역 CallExpression·endpoint 존재만으로 살아 있다고 오판했다.
- 실제 reachable 영어 수동 경로는 좁게 `route → client → English panel/typeCounts → desktop PassageGenerateModal 또는 mobile CTA → handleGenerateActiveRow/handleWorkspaceGenerate → useWorkspaceGeneration → shared fast helper → fast route → shared runtime`이다. 또한 runtime/schema가 직접 import하는 `question-generation-research-schema.ts`, research profiles/runtime와 `question-schemas-mc.ts` 등이 v3의 17-source 권한 밖에 있었다. 특히 일부는 현재 untracked이므로 null을 건너뛰면 안 되고 raw hash·exact Git status를 가진 worktree-only source로 명시하면서 deployed-commit parity는 false로 구분해야 한다.
- 독립 감사 SHA-256은 `audit.json=c16ce59b38082e5a93ec496c5787133e5788e1d6955ea7df184530d71bb3e881`, `REPORT.md=4b3c8576f75ce214123f8787d171af9e3e035b2e0c346ffd332406ccf930b38b`, `verify.mjs=72e5629e9351803ac3245cedd1e21ac53bd567c04f61f1f9045f2cd1ebc1c1a4`, `MANIFEST.sha256 파일=6723b1109d7ff65326745e44b449919b4b3e6e1854c1067f3883d0be5153c0f3`이다. v3는 immutable 실패 provenance로 보존하고, 후속 v4는 실제 도달 경로와 직접 source closure만 새로 봉인한다. 이 감사 구간의 network/provider/model/API/DB/secret/trusted-gold 접근 및 candidate 사용은 0이다.

## 2026-07-15 22:08 KST — production 유형 binding v2 독립 감사 확정

### O125. 회전 수학은 유효하지만 실제 production 권한은 fail-open이라 v2도 실행 부적격이다
- fresh independent audit는 v2의 회전·접촉 수학을 `VALID_MATH_COMPONENT`로 인정했다. 독립 검증기 기준 242/242, hostile mutation 32/32가 재현됐고, 단일 epoch main/holdout distinct 16/23·2 epoch combined 23/23·4 epoch main-only 23/23이라는 작성자 계산은 유지된다.
- 그러나 전체 판정은 `FAIL_CLOSED_EXECUTION_INELIGIBLE`이다. 작성자 verifier가 저장소 HEAD 자체와 `lastPathCommit`을 강제 결합하지 않고, 기록된 `headBlob`이 null이면 dirty/untracked 검사를 건너뛰어 같은 바이트의 untracked→tracked 전환도 PASS할 수 있다. 또한 `EXAM_TYPE_GROUPS → 영어 패널 → render/runtime schema dispatch`의 실제 AST 권한 사슬을 검증하지 않는다. 따라서 contact 수학이 맞아도 production 유형 전체를 대표한다는 권한은 성립하지 않는다.
- 독립 감사 산출물 SHA-256은 `REPORT.md=c1469d7d01e2f8c31c4739312314cdd6d00889cd8421ef437443a25bb4a68518`, `report.json=a5dfdba3fd3b010a402e3ae841001735e6ca07236e6f6dec4693377288d24edd`, `evidence.json=1bd642536c919bfd3f6ba9564eb0c99dfece4f63bc86b2f8e934991a078e67ed`, `verify.mjs=aebdaa5fc79f9633994bc3fccbde7cda2a02f054fe4ba7ea2058186be9de59fc`, `MANIFEST.sha256 파일=cb871aeeae1fbf66ef84b637492b83c12e3c1fb221566082db56c54f81bcf461`이다.
- v2와 이에 의존한 미봉인 v4 calibration은 live/S1 권한으로 승격하지 않는다. 별도 v3에서 raw bytes와 Git-clean-filtered blob을 분리하고 HEAD·index·path commit·porcelain·추적 상태·실제 AST dispatch 사슬을 모두 fail-closed로 묶은 뒤 다시 독립 감사한다. 이 판정 구간의 network/provider/model/API/DB/secret/trusted-gold 접근과 candidate 사용은 0이다.

## 2026-07-15 21:55 KST — production 유형 binding v2 작성자 봉인·연결성 v5 추가 반증

### O123. 수정식은 재현됐지만 production binding v2는 아직 독립 승인 전이다

- v1은 수정하지 않고 `V1_ROTATION_FORMULA_VERIFIER_DIVERGENCE` 실패 provenance로 보존했다. 별도 v2는 main=`(epoch-1) mod n`, holdout=`(epoch-1+ceil(n/2)) mod n`을 하나의 `selectedAt` 함수로 공식·32개 schedule row·coverage에 공통 적용한다.
- root가 작성자 verifier를 다시 실행해 128/128을 재현했다. 단일 epoch main+holdout distinct는 16/23, 두 epoch combined contact는 23/23, 네 epoch main-only contact는 23/23이며 n=2/3/4의 충돌·old-stride hostile 6/6도 거부됐다. v2 manifest-file SHA-256은 `4e81452d0c74f3361cd01a59e5ec6406ea2fde729fd79f588dcdaf07c380de14`다.
- 이 수치는 **contact**일 뿐 type별 scorer certification이 아니다. 또한 작성자 verifier의 PASS가 v1에서 실제로 거짓이었던 전례가 있으므로, 현재 v2는 실행 승인 근거가 아니다. fresh auditor가 production AST authority, dirty/untracked/path-commit fail-closed, v1 실패 exact binding, 수식-물질화-coverage 단일 구현, n=2/3/4 및 verifier-divergence mutation을 독립 재계산 중이다.
- 이 구간의 network/provider/model/API/DB/secret/trusted-gold 접근과 candidate 사용은 0이다.

### O124. 연결성 v5는 안전장치를 더할수록 실패와 초과를 구분해야 한다

- v5 진행본은 compiler actual closure, 엄격 parser, 실패 응답 billing, bounded body, 중복 JSON key, fixed request fee, extra charge dimension, post-reserve terminal settlement, 복수 후보 전역 quarantine를 보강 중이지만 아직 author freeze가 아니다.
- root 정적 재검에서 추가 blocker를 확인했다. 현재 가격 정규화기는 historical payload에 없을 수 있는 top-level `pricing.request`를 필수로 읽고 합성 fixture는 이를 임의로 넣는다. capture CLI는 3개 원시 metadata payload를 버리고 자기 정규화 snapshot만 저장해 URL/status/content-type/bytes/hash/source bytes provenance가 없다. live/metadata child env는 불필요한 HOME·USER 계열을 허용하고 launcher와 공유 상수도 아니다.
- candidate observer는 `choices.length !== 1`을 전부 전역 초과로 취급해, 유효한 HTTP 오류 객체처럼 choice가 0개인 평범한 실패도 남은 최대 998개 capacity 전체를 영구 quarantine할 수 있다. 안전상 필요한 구분은 sent opportunity 1 debit + 0-candidate terminal failure와, `choices>1`·복수 question object·초과 가능성을 지울 수 없는 ambiguity의 global halt다.
- private path도 lexical `path.relative`만 검사한다. `private/runs` junction이나 attested snapshot symlink가 있으면 passage·raw response·가격 입력이 package 밖으로 빠질 수 있으므로 private root/runs/run dir/input의 lstat+realpath+regular-file 검증과 hostile junction 회귀가 필요하다. 이 사항은 작성자에게 blocker로 전달했으며 v5는 봉인·live 승인하지 않는다.
- 전역 원장 SHA-256 `9a05a64ed97c4746b7fe56933374d2179178885bd3e1db93f830f938bafdea1e`와 소비 0/1,000은 그대로다.

## 2026-07-15 21:51 KST — production 유형 binding v1 자가반증·독립 기각

### O122. 154/154 PASS도 검증기가 명세와 다른 수식을 쓰면 무효다

- production UI 정본 25개, focus `BLANK_INFERENCE`·`GRAMMAR_ERROR` 2개, nonfocus 23개, schema/filter 26개의 유일 extra `TOPIC_MAIN_IDEA`, legacy constants 24개의 유일 누락 `GRAMMAR_CHOICE_COMBO`, 23→8 family 전수 mapping 자체는 root와 fresh independent audit에서 재현됐다.
- 그러나 binding v1이 선언한 main rotation `2*(epoch-1) mod n`을 root가 family size 2·4에 직접 대입하자 main orbit이 전체를 순회하지 않았다. 4 epoch와 전체 주기 모두 main-only coverage는 19/23에 고정되고 `GRAMMAR_CORRECTION`, `CONTEXT_MEANING`, `ANTONYM`, `TOPIC_SENTENCE_WRITING` 4개가 영구 미도달이다.
- 작성자 verifier는 일반 `selectedAt`에서는 선언한 stride 2를 쓰면서 main-only 4-epoch 검증에서만 별도 `(epoch-1)%n` stride 1을 써 23/23을 만들었다. formula 문자열도 읽지 않았다. 따라서 작성자 `154/154 PASS`와 manifest `655bfc33...`는 자기일관성 증거가 아니며 binding verdict는 `FAIL_CLOSED`다.
- 독립 감사에서는 추가로 HEAD blob이 null인 untracked 입력과 dirty-state 검사가 fail-open이고 `lastPathCommit`을 읽지 않으며, production authority chain을 AST가 아닌 substring으로 확인하는 major 결함을 찾았다. 독립 verifier는 이 결론과 15/15 hostile mutation을 158/158 checks로 재현했다. audit report-file SHA-256 `b78a82403046631e229d73ab839dd91a9ab614a66327972d0deb191ceff985f9`, evidence-file `1012821e5f69d0b83fffe983e14f6c71364d79487eeabcdae59f0da074d569ea`, manifest-file `d5c4225411a619a9f1ffb67251e4e15dd47a4bc030e9a28b2f74ae16d6060f3a`다.
- v1은 덮어쓰지 않고 실패 provenance로 보존한다. replacement v2는 main=`(epoch-1) mod n`, holdout=`(epoch-1+ceil(n/2)) mod n`을 사용해 n=2/3/4 모두 단일 epoch 16 distinct, 2 epoch main+holdout 23 contact, 4 epoch main-only 23 contact가 같은 `selectedAt` 함수에서 실제 성립하도록 schedule row를 물질화한다. v2의 fresh independent audit 전에는 production-bound calibration packet이 이를 실행 근거로 사용할 수 없다.

## 2026-07-15 21:34 KST — v4 감사 재현성 확정·calibration v2 독립 기각

### O120. 연결성 v4 감사 패키지는 이제 재현 가능하지만, v4의 실행 금지 판정은 그대로다

- 앞선 canonicalization은 aggregate `duration_ms`만 지우고 Node test reporter가 각 테스트 이름 뒤에 붙이는 `(1.234ms)`를 남겨 두었다. 실제로 같은 offline test를 연속 실행하자 정규화 뒤 SHA-256도 서로 달랐고, `author-gates.json`과 이를 결박한 report/manifest가 매번 바뀌었다. 이는 target v4의 결함과 별개인 감사 도구의 메타 결함이다.
- 감사 harness에 per-test `(…ms)`와 aggregate `duration_ms`를 모두 정규화하는 V2 규칙을 적용했다. 그 뒤 전체 author gate를 두 번 독립 실행해 두 번 모두 5/5 PASS, target bytes·global ledger 불변, external/provider/model/API/DB/browser 0을 확인했고 `author-gates.json` SHA-256이 두 번 연속 `5b0346fb581b5cd12381484061fee8b4fc17e56a10882d7e29651ee8cbf613b0`로 일치했다.
- 이어서 build write/check, scoped TypeScript, independent verifier를 재실행하고 build를 다시 write/check했다. 최종 evidence `2aff0d69c81169f2f806dcd59f9053ce939927603d75cb7d7c2a60cab501f3b6`, report `8f135466efc5182843cf5a257c5bb361cafb2c91122798c29768839d0f31fae3`, manifest-file `2b7fb398cad98647698c7dd4120f819c50645116c71e8ffe79ccb53530ba0791`가 연속 재생성에서 byte-identical이다.
- 이 PASS는 **감사 패키지 재현성**에만 해당한다. v4 target은 compiler input 3개 누락, 무권한 metadata CLI, 실패 응답 비용 누락이라는 critical blocker 때문에 계속 `FAIL / DO_NOT_AUTHORIZE_OR_DISPATCH`다. 따라서 v5의 별도 freeze와 fresh hostile audit 전에는 live를 열지 않는다.

### O121. calibration v2는 일치도가 높아도 trusted gold가 아니다

- fresh independent phase3 audit은 `FAIL / trusted-gold promotion BLOCK`으로 판정했다. 24 ID·phase binding·A/B judgment bytes·A4/B4/C7/F9·fatal 9·semantic hash는 모두 재현됐고 hostile mutation 8/8도 기대대로 거부됐지만, 이것은 truth validity를 보증하지 않는다.
- blocker 1은 C phase1/phase2가 A/B 산출물 뒤에 작성됐고 C가 pre-A/B blind였음을 증명할 phase2 사전 봉인 시각·접근 로그가 없다는 점이다. blocker 2는 N05/N06/N07의 9/16/2개 exact-text accepted set이 비열거 유효표현, 지시 위반 표현, 교차시제·표점 변형까지 의미공간을 닫지 못한다는 점이다. N01은 bridge/path 상태를 반대로 적었고 B02는 reveal에 없는 delay/manipulation을 추가한 major finding도 확인됐다.
- 따라서 v2의 높은 answer/fatal/grade agreement는 scorer calibration의 참고치일 뿐 certificate 근거가 아니다. 기존 표본을 재균형하거나 accepted text를 사후 증설하지 않고, 새 후보·사전 봉인·문법 equivalence class·빈칸 proposition vector를 쓰는 v3 replacement로 교체한다. trusted private gold는 읽거나 수정하지 않았고 network/model/API/DB/secret/candidate 사용은 0이다.

## 2026-07-15 21:18 KST — 연결성 v4 기각·평가자 v2 조정 결론

### O117. 연결성 v4는 작성자 gate가 모두 PASS해도 live 실행 불가다

- fresh hostile audit은 v4를 `FAIL / critical`로 판정했다. 첫째, 작성자가 봉인한 compiler closure는 `192 AST source + 4 declared data = 196`이지만 inherited compiler가 직접 `readFileSync`하는 활성 입력 3개(`openrouter-question-parser.ts`, `harness/atlas-controller.ts`, `harness/ledger.ts`)가 빠져 실제 고유 file-input closure는 199개다. 누락된 세 파일을 각각 메모리에서 바꾸면 upstream/v4 private semantic이 바뀌지만 작성자 closure commitment는 그대로였다.
- 둘째, price snapshot CLI는 authorization flag가 전부 false여도 최대 3개의 외부 GET에 진입할 수 있었다. 셋째, send 뒤 HTTP/parser/cost-cap 실패 응답에 유효한 양수 `usage.cost`가 있어도 성공 evidence만 합산해 global ledger를 0원으로 정산할 수 있었다. pure fixture의 누락액은 각각 `$0.123456`, `$0.251906501`, `$0.045`였다. `message.tool_calls` 공존 허용과 reserve 뒤 pre-try journal fault도 별도 비차단 결함으로 남겼다.
- 독립 감사의 parser 반례 172건과 199/199 one-row deletion은 통과했으며 target v4 자체는 건드리지 않았다. 그러나 root가 README의 전체 재현 순서를 반복하자 감사 보조 산출물 `author-gates.json`이 wall-clock `durationMs`와 Node test `duration_ms`를 봉인해 실행마다 hash가 바뀌고 manifest 검증을 깨는 **감사 패키지 자체의 재현성 결함**도 발견했다.
- root는 감사 harness에만 CRLF/Node duration canonicalization, wall-clock 비저장, `build --write`의 9-row manifest 재생성을 추가했다. 현재 `build --check`와 `verify`는 PASS하고 author-gates `ad53e95d...`, evidence `2aff0d69...`, report `baac2959...`, manifest-file `15808b3b...`이다. 다만 두 번째 연속 full gate에서 target verifier의 nested offline command가 일시 실패했으므로 **2회 연속 byte-identical 증명은 아직 미완료**다. 이 메타 결함을 숨기거나 v4 판정의 근거로 섞지 않고, 동시 작업이 끝난 뒤 다시 두 번 재현한다.
- v5는 위 다섯 결함 외에도 huge-finite monetary rounding overflow, 두 assignment의 safe-integer token 합산 overflow, unbounded `response.text()` OOM, manifest-bound 비결정 필드를 추가로 막는 중이다. v5 author freeze와 별도 fresh audit 전에는 metadata/model/API 호출을 열지 않는다.

### O118. calibration v2의 제3 조정 결과는 gold 후보의 내용보다 composition이 먼저 탈락했다

- adjudicator C는 A/B를 보기 전 phase-1·phase-2 판단을 봉인한 뒤에만 세 기록을 비교해 24개 최종 제안본을 냈다. 최종 등급은 A 4 / B 4 / C 7 / F 9, fatal 9개다. constructed N05/N06/N07의 accepted-equivalence set은 각각 9/16/2개이며, N07은 두 번째 chunk order도 문법적으로 성립하므로 F로 확정했다.
- 어법과 빈칸은 각각 A/B/C/F가 2/2/2/2이고 fatal 2개지만, nonfocus는 C 3/F 5/fatal 5로 A·B가 0개다. 따라서 `NONFOCUS_FATAL_COUNT_NOT_2`와 A/B/C/F 네 grade-count 오류, 총 5개 composition issue로 issuance-ineligible이다. 결과를 맞추려고 등급을 바꾸거나 항목을 사후 교체하지 않는다.
- root가 trusted `gold.private.json`을 읽지 않고 phase3 validator를 재실행해 24개 binding, semantic hash, composition, certificate block을 확인했다. labels `8533c618...`, adjudications `fcde70a4...`, proposal `39c7b1db...`, report semantic `9bf83be9...`가 일치했다. A/B/C 세 평가자 모두 최종 proposal 대비 threshold preview에서 적어도 하나를 실패해 인증서는 0개다.
- 이 결과는 trusted gold가 아니며 바로 scorer에 넣지 않는다. fresh independent phase3 audit가 N05/N06/N07의 실제 등가성과 결합·mutation resistance를 검증 중이고, 동시에 강제 rebalancing이 아닌 새 후보 pool/reissue 절차와 식별 가능한 taxonomy를 쓰는 calibration v3를 별도로 설계한다.
- 이 구간의 external/provider/model/API/DB/secret/trusted-gold activity와 candidate 사용은 모두 0이며 전역 원장은 0/1,000을 유지한다.

### O119. 현재 프롬프트는 실제 wire에서 최대 4.4배 차이지만, 길이를 품질 원인으로 단정하지 않는다

- 봉인된 S1 180-row exact-wire의 본문을 노출하지 않고 `wireBodyUtf8Bytes`만 passage×plan×difficulty exact pair로 다시 집계했다. Grammar control G0는 24개 합 2,073,542 bytes·평균 86,397.6 bytes였고, 마지막 checklist 512자만 지운 G1은 2,049,686 bytes로 **1.15%**만 줄었다. 즉 “마지막 체크리스트 하나가 과부하의 주원인”이라는 단순 가설은 입력량 기준으로는 약하다.
- positive compact G2는 470,684 bytes로 matched G0 대비 **77.30% 감소**, structured site-certificate G3는 528,512 bytes로 **74.51% 감소**했다. Blank control B0는 990,492 bytes이고, Standard의 무관 유형 tail만 제거한 B1은 matched Standard B0 대비 **30.93% 감소**, B2 positive compact는 양 plan 합 **56.48% 감소**, B3 option-intent ledger는 **43.20% 감소**했다.
- 이 차이는 prompt 길이 단독 처치가 아니다. G2/B2는 흩어진 금지문을 positive procedure로 재표현하고, G3/B3는 schema·planning representation까지 바꾼다. 따라서 향후 품질 차이가 나도 “짧아서 좋아졌다”와 “더 식별 가능한 작업 표현이라 좋아졌다”를 분리해야 한다. G3/B3가 G2/B2보다 이기면 구조화 artifact의 증거이고, G2/B2만 이기면 extra schema burden이 불필요할 가능성이 있다.
- 고정 max-output과 보수적 byte-as-token 상한을 그대로 둔 illustrative emergency ceiling은 G0 약 `$15.5070`→G2 `$6.7794`/G3 `$7.0943`, B0 약 `$7.6815`→B2 `$5.1401`/B3 `$5.8566`이다. 출력 상한 비용이 커서 byte 감소율만큼 총 상한이 줄지는 않는다. B1은 Premium duplicate를 호출하지 않으므로 `$2.3542`를 B0 양-plan 합과 직접 비교하지 않는다.
- 재현 artifact `reviews/s1-wire-size-stratification-v1`은 180행·8 profile을 확인했고 report `63a0ee8a...`, semantic `6b06b0ba...`, manifest-file `15cba450...`이다. 이는 **mediator/cost diagnostic일 뿐 quality evidence가 아니며**, profile 선택은 여전히 blind validity·craft·cost-per-A/B의 사전 gate로만 한다. network/model/API/DB/secret/candidate는 0이다.

## 2026-07-15 19:10 KST — 실행 전 통제계·평가계 재봉인

### O107. S1은 프로덕션 전체 재현이 아니라, 생성 코어의 단일 디스패치 메커니즘 스크린으로 확정했다

- 180개 배정은 `GRAMMAR_ERROR` 96개, `BLANK_INFERENCE` 84개이며 Standard 96 / Premium 84, Intermediate 90 / Killer 90이다. 서로 다른 180개 request body와 request envelope를 현재 production `runQuestionGeneration` core를 통해 네트워크 없이 재생했다.
- 이 실험의 topology는 배정당 **direct single dispatch / single candidate**로 고정한다. Premium grammar ladder, production outer retry, SDK retry, structured repair, candidate repair, solver, fallback, scarce/salvage를 재현하거나 품질 parity를 주장하지 않는다. 전체 production parity는 별도 버전 topology audit가 필수다.
- root 독립 재실행 결과: exact-wire compile, verifier, scoped TypeScript 모두 PASS. 180개 모두 현재 모델·프로필·난이도·schema·token cap·route·reasoning-off binding을 만족했다. 총 request body 7,562,124 bytes, 예시적 상한 `$65.79032337`이다.
- exact-wire semantic SHA-256 `a79a66c79a94d1451e2e3e8d8ce568676fde669b8eb6383aa7dcc5cd739c6fba`, public artifact `8b299ceba28ee82042cd7c8860c4d2e7f1ca9e51bc69a0abc6258263d840264c`, private artifact `d6bd7a178252c9d82e46deb4be1a7b21cdbf73fe5f72ec0cabd3392469ca074c`, manifest `89cbe504e038ca6e0bdea2f39c743c6695150d2958c259160f651aad17b9d403`이다.
- **19:13 KST 정정:** 이 exact-wire 해시는 직후 hostile audit에서 TEST 실행 우회가 발견되어 `S1 SOURCE FREEZE v2` 재개와 동시에 폐기되었다. 내용 관찰 기록으로만 남기며, v2 source closure로 exact-wire를 재생성·재봉인하기 전에는 실행 근거로 쓰지 않는다.
- **19:29 KST 재생성:** TEST 경로 분리 후의 새 controller source를 대상으로 180개 offline production-core wire를 다시 만들고, 무쓰기 재실행·verifier·scoped TypeScript를 통과했다. 새 semantic `7ca989504e2f8433a89f46a87a2cd1e5ef3156461a884160fb80d6d5690ad3bd`, public `c8989d2d58cfd6e249ffca15321c4998aabea262707bd075d401c10e7bad123a`, private `ebc1f160a81c8aec2f53453cd7d04d0c099159f8104b2353dd3485d6d493c04e`, manifest `a69b1581b700f40e23dfcde050d7f0754d10c2eae289280c57988588a13904b8`이다. 단, 이 해시도 새 execution-boundary 독립 감사가 끝날 때까지 실행 권한은 없다. 외부 네트워크·provider/model·DB·후보 소비는 0이다.
- **19:34 KST 재정정:** connectivity 통합에서 shared boundary의 `AtlasResearchProvenance`가 허용한 `requestEnvelopeHash`·`promptProfileArtifactHash`를 `normalizeScope()`가 버리는 결함이 드러났다. exact registry가 실제 wire와 일치할 수 없어 fetch 전 `CONTROLLER_REGISTRY_REJECTED`가 되는 결함이다. shared source가 보정되었으므로 19:29의 exact-wire와 source-closure 해시는 다시 폐기한다. post-patch controller/shared suite와 180 wire를 재봉인하기 전에는 실행 근거가 아니다.
- **19:43 KST post-patch 재봉인:** `normalizeScope()`가 두 provenance hash를 각각 64-hex로 검증·보존하도록 고친 뒤 controller fixture, 전용 28/28, verifier, scoped TypeScript를 다시 돌리고 180 wire를 write/no-write 두 번 재생했다. 현재 exact-wire semantic `3f8ae187dfe8015e76b9ff4ae2abc588fa4e3d1fbbd0ef65dbf723e95a7b6549`, public `2579fbe791197f55ef2a0a80396d47fd18ef05445eeba33f1bfd2c5b6caca835`, private `96318916c4ef714ae55febab3a63b992e93d6e2911f03235698487f40601ca7a`, manifest `b92c3772879e974c16b3a87527cb27d11c2a6cd90ac5018ac485f6989135c95e`이다. external/provider/model/API/DB는 0이며 fresh auditor의 최종 판정 전에는 실행 불가다.

### O108. 180개 실행 제어기는 개별 1-call registry와 공유 180-cap을 동시에 봉인했다

- 배정당 registry는 candidate opportunity 1, physical fetch 1, completion 1, schema-bounded question 1을 강제한다. 180개 registry는 하나의 durable batch에서 candidate 180 / fetch 180 / 고정 비용 상한을 공유하며 용량 재활용·top-up을 금지한다.
- 양수·결측·중복 cell, passage/rights hash 충돌, profile hash alias, B1 Premium, 타입 교차 passage 재사용, 모델·route·token cap drift를 fail-closed로 차단했다. shallow-frozen 입력도 canonical clone 후 재귀적으로 freeze한다.
- 시험권한과 production 권한을 분리했고, production trust root는 의도적으로 서명 불가능한 placeholder다. 따라서 별도 signer custody amendment 없이 180개 live 실행은 불가하다.
- response parser는 OpenRouter choice가 정확히 1개여야 하며, extra valid choice, valid+malformed choice, 하나의 choice 안 복수 full-question object를 모두 overflow/quarantine로 처리한다. unknown-after-send, clone/body 존재 후 `never_sent`, 사용량 재기록, 0-dispatch close, 완료 상태 변조를 차단한다.
- root 독립 재실행: 전용 regression 27/27, verifier, scoped TypeScript PASS. 공유 harness 24 top-level + 내부 budget guard 25/25와 repo 전체 TypeScript도 다른 에이전트가 PASS했다.
- campaign semantic `2fa28a072e52170b8f00e94ddd5878d050c05b77ac0369dc63533f2bdef3fb2a`, durable batch `a7aa4f930dcf59ec60a1e863d85d697cb7a900be7391512db7416dc436b2eadd`, public artifact `36fc0aa907dcaa327a63cd06e15c1443ad9d2964ebb263ef9a912adb43ef98fe`, manifest `f8e4b7c1b2048236864d783957ca63a6c11c3f9318fc1a97253e4b317e1268b8`이다.
- **상태 변경:** 위 controller 해시도 TEST parallel path 보정을 위한 v2 source freeze가 시작되어 현재 실행 권한을 잃었다. 보정·독립 재감사·exact-wire 재봉인 후의 새 해시만 유효하다.
- **19:26 KST source freeze v2:** production `runtime.ts`에서 TEST/offline/ForTesting export와 mutable env 분기를 제거했다. 별도 `runtime.test-support.ts`는 고유 비production brand, module-created OS-temp store, secret-free evidence, no adapter/delegate/fetch로 제한했다. root 재실행에서 전용 28/28, verifier, scoped TypeScript가 통과했다. 새 public `9d0ec4008a56a62c76628147c886c3b645c4369d02e23276321a8366039b5f1f`, manifest `6ea3a4c08ad49509d75683a71f2e04bb44a42bf7254ef0d76a2368e11e21162c`이다. fresh execution-boundary 감사가 진행 중이므로 아직 live 허가가 아니다.
- **19:34 KST source freeze 재개:** 위 package-local 보정 자체는 유지되지만 shared research boundary 변경으로 transitive closure가 달라졌다. public/manifest를 포함한 모든 실행 관련 해시는 post-patch 재생성 전까지 역사 기록일 뿐이다. fresh auditor에게 이전 결론 폐기와 shared fix의 권한 확장 여부 재감사를 지시했다.
- **19:43 KST post-patch controller freeze:** controller public `eda217dba61f7e844d95b32de161958da8d4667da92998de118e2c7caa978099`, manifest `3ed71284aaf28c6c0f78f89d75c13bc30f86d894f17ccecf88f24d4cd5c1614b`로 재봉인했다. campaign semantic과 durable identity는 설계 입력이 같아 각각 `2fa28a...`, `a7aa4f...`로 유지된다. 이 값들은 독립 execution-boundary 감사 대상이며 그 전에는 live 권한이 아니다.

### O109. 평가자 인증은 문항을 직접 풀지 못하면 통과할 수 없게 고쳤다

- 평가는 fatal validity와 craft를 비보상적으로 분리한다. 정답 다중성·비문·source/surface/scoring 불일치·해설 오류·렌더 파손 중 하나라도 확정되면 craft 점수와 무관하게 F다. A는 단순 clean이 아니라 모든 visible element에 서로 다른 교육적 의도가 있고, 경쟁력 있는 함정과 경제적 증거 경로를 갖춘 경우다.
- 24개 교정팩은 grammar/blank/non-focus 각 8개이며, 최종 gold는 작성자가 만든 정답이 아니라 두 독립 평가자의 sealed phase-1 풀이와 새 adjudicator의 pre-rationale solve 후에만 확정한다.
- 평가자 인증은 blind solve exact agreement 전체 9/10, grammar/blank/non-focus 각각 7/8을 모두 넘어야 한다. fatal sensitivity/specificity, grade QWK, focus completeness, grammar site, blank option, 7개 semantic axis도 별도 gate다. `acceptedAnswerSets`로 재결이 확정한 합리적 대안은 인정하되, 후견적 예외는 허용하지 않는다.
- RFC3339 시각을 유한·실제 달력·offset·microsecond단위로 canonicalize해 `Date.parse(NaN)` 순서 우회를 막았다. type/surface/relabel/phase-one hash를 gold와 exact binding하여 다른 문항의 답안 재사용을 `FAIL_INCOMPLETE`로 차단한다.
- root 재실행 결과 blind-design verifier 333 checks / 29 fixtures / 12 hostile families PASS, all-types rubric 25개 유형·non-focus 23×4=92 구조 PASS였다. blind-design manifest file SHA-256 `b697c15d54ee7e74ed201d56e983e1834267731428c5ebc6f15af2f33ee70571`, all-types manifest file SHA-256 `9067d8641e463a5c955a5b73af162bf63fd181289f0ce67e95911c2c5beadf4d`이다.
- 단, 교정팩의 최종 내용과 gold는 아직 **0건**으로 간주한다. 작성자가 A/B로 표시한 빈칸 문항 중 다수에서 실제 오답이 황당하거나 극단어 giveaway가 남아 독립 내용 감사에서 재작성을 지시했다. 이 수정과 두 평가자·신규 adjudicator 절차가 끝나기 전에는 인증을 발급하지 않는다.
- **19:39 KST v1 인증 workflow 무효:** 평가자 2의 blind phase-1에서 constructed ordering 문항 Q005에 의미·문법적으로 동치인 두 완성 문장이 확인됐다. 평가자는 reveal 전 두 문장을 notes에 동결했지만, `phase1SubmissionSchema`는 `MULTIPLE`을 객관식 `answerLabels`로만 허용하고 constructed multiple answer texts를 표현하지 못해 seal이 `ANSWER_LABEL_OUT_OF_SET`으로 거부됐다. 답을 단일화하거나 가짜 label로 밀어 넣지 않는다. v1은 내용 감사 자료로만 보존하고 인증/최종 gold에는 사용하지 않으며, constructed multiple/accepted-equivalence set을 first-class로 표현하고 scorer까지 묶은 v2를 새로 발행해 fresh blind 절차를 반복한다. 평가자 1의 phase-2에서도 stored key exact agreement 17/24와 다수 explanation-label 동기화 문제가 나왔으므로 v1 composition 자체도 재작성 대상이다.
- **20:03 KST v2 교정팩 후보 봉인:** v1을 건드리지 않고 직접 새로 작성한 24개(어법/빈칸/비집중 각 8)로 교체했다. 답은 label 단일/복수, constructed text 단일/복수, NO_ANSWER, UNEVALUABLE의 6-way union이며 exact·normalized text hash와 순서 불변 set hash를 phase1→seal→reveal→review→fresh adjudicator→gold/scorer/certificate에 결합했다. root가 write/no-write deterministic replay, hostile 62/62·총 161 checks, scoped TypeScript, 19-entry manifest를 독립 재실행해 모두 PASS했다. manifest `7319cd8582fdeffac26720e90bfc7cb030009f7009c0b07a31a5a5cdbab67293`, public `cb84231ce1c070b855542acf51159ebded6e231ff89816eb32d0cf7e869d2533`, private packet `5e6fb536026042813049f570778283dbafb9aad2e7f071dc1f163eb4c490e129`다. 이는 protocol/composition 후보 seal일 뿐 gold나 reviewer 인증이 아니며, 첫 fresh blind phase-1을 별도 pseudonym·relabel로 발급했다. API/network/DB/secret/candidate는 0이다.
- **20:15 KST fresh rater A 완료:** 답·해설을 보기 전에 24개를 전부 직접 풀어 phase-1을 봉인했고, constructed item 3개에서 복수의 정확한 완성문을 `MULTIPLE_TEXTS`로 표현해 v1의 막힌 경로를 실제로 통과했다. reveal 뒤 sealed 답을 바꾸지 않고 24개 full record를 제출했으며 root 재검증 결과 schema 24/24, 등급 F 9/C 4/B 7/A 4, stored-key exact 20/24, 명확한 해설 결함 5개였다. fatal 9개는 answerSpace 4, alternativeReading 3, explanationTruth 5, synchronization 5, taskAndRender 1, leakage 1로 중첩됐다. review bundle semantic hash `dfa2a31226dc15c02b127eb89332e4e662194709ea890a29fc961bc02330dc36`; 두 번째 fresh rater는 다른 relabel/seed로 phase-1 진행 중이다. 아직 gold·인증은 0이며 network/model/API/DB/secret/candidate는 0이다.
- **20:33 KST fresh rater B 완료:** 다른 seed/relabel의 blind phase-1을 봉인한 뒤 같은 절차로 24개 full record를 냈고 root validator가 schema·focus diagnostics·relabel·phase/seal binding을 24/24 재확인했다. 등급 F 8/C 7/B 5/A 4, stored-key exact 22/24, materially false explanation 5개, fatal 8개였다. fatal domain은 answerSpace 3, alternativeReading 2, explanationTruth 5, synchronization 1, leakage 1로 중첩된다. review bundle `66dbac80279f609f0ef716e42a6ab314c3ba4d36082fcf2726b7acf8ddb41c77`다. 두 rater 모두 A 4개와 거짓 해설 5개를 독립적으로 찾았지만 F/C/B 배치와 answer-space 좌표에는 이견이 있으므로 다수결로 gold를 만들지 않는다. 제3 fresh adjudicator에게 별도 relabel phase-1을 먼저 풀게 한 뒤에만 두 기록을 공개한다. gold·인증은 여전히 0, external activity와 candidate는 0이다.

### O110. 현재 Premium grammar ladder의 정적 최대치는 과거 81이나 직전 추정 42가 아닌 54 physical fetch다 — 독립 topology audit 확정

- 현재 `callLadderModel` 한 stage는 parse 재시도 1회를 포함해 `fireOnce` 최대 2회이고, 각 `fireOnce` 는 AI SDK `maxRetries=2`, 즉 physical fetch 최대 3회다. 따라서 stage당 상한은 6이다. 과거 audit의 9/stage는 이전 reasoning fallback 3번째 `fireOnce`를 계산한 것이라 현재 코드에 적용할 수 없다.
- ladder는 initial split 2 stages, hard-block regeneration 최대 2회×2 stages, 그리고 각 cycle에서 soft repair가 최대 1회씩 발생할 수 있어 repair 최대 3 stages다. 총 9 stages×6 = **54 physical fetch**다. "repair은 전체에서 한 번"으로 계산한 7 stages×6=42는 `repairedThisCycle` 초기화가 regeneration마다 다시 일어나는 것을 놓쳤다.
- full-question candidate purpose만 따지면 answer-only/answer-regeneration design 3 stages는 제외되고, add-decoys 3 stages + repair 3 stages = 6 candidate stages×6, 즉 ladder 내 candidate opportunity 상한은 36으로 추정된다. 이후 legacy generation·candidate repair·grammar solver가 따로 연결될 수 있다.
- 이 계산은 root의 현재 source 정적 판독이며 아직 독립 감사 확정값이 아니다. source hash, SDK 재시도 semantics, outer strict/relaxed/scarce/salvage, Trigger crash replay, candidate-purpose/physical-purpose를 함께 봉인한 새 topology audit에서 재검증한다.
- **20:13 KST 독립 topology audit 확정:** current source 134개 조건의 verifier를 root가 다시 실행해 PASS했다. ladder는 `3 cycles × (answer + add-decoys + cycle별 soft repair) × 2 parse fires × 3 SDK fetches = 54`로 확정됐다. 42는 repair를 전체 1회로 오독했고, 81은 제거된 세 번째 reasoning fire를 포함한 구식값이다. count=1 per-attempt physical 상한은 STANDARD blank KILLER 648, PREMIUM blank 162, STANDARD grammar 기본/KILLER 513·확장설정 675, PREMIUM grammar ladder eligible 378이며 Trigger crash replay는 budget 비집행 상태에서 각각 최대 2배다.
- 더 중요한 운영 결론은 ordinary call 수가 source hard-cap으로 유한해졌어도 durable assignment budget 기본값이 `OFF`이고 fast/Trigger Workbench 두 경로 외 legacy auto·single generate·tutor·similar-exam·question-set·custom·KO-set 소비자는 보편적으로 덮지 못한다는 점이다. 일반 response의 `questions[]`에도 provider-visible max cardinality가 없어 candidate object 수가 구조적으로 고정되지 않는다. source-level input byte cap, fresh price, effective served-model attestation도 모두 없어 ship-ready USD 절대상한 판정은 `NOT_PROVEN`이다. envelope SHA-256 `26eab28ca3b13d01a5a8c39d1ad3378d9a22eb0110f0bab79666bb698f62a3f8`, manifest-file SHA-256 `adcb8d26ead9b90c1239a01996afaebad3bb36634dc789f1e7e760a7437b6c79`; external/model/API/DB/secret read는 0이다.

### O111. 해설 문제는 단순 장문이 아니라 사실성 실패와 중복 계약의 결합이다

- latest 15의 main explanation은 평균 383.5자·중앙 336자(205~614), 오답해설 합 평균 352.8자, keyPoints 합 평균 139.7자, 학생용 총량 평균 876.1자·중앙 856자(543~1,272)였다. 배포 이후 8개 main 평균도 380.8자였고, BLANK 2개 평균 475자·COMBO 2개 495자·GRAMMAR 2개 283.5자다. 단 이 8개는 지문 2개뿐이므로 발생률 추정에는 쓰지 않는다.
- 길이만 줄이면 해결되지 않는다. latest 15의 sealed 최종 V4 해설 정확성 실패는 9/15, 배포 후는 5/8이었다. 반대로 과거 PREMIUM grammar 60은 main 평균 212.6자·중앙 205.5자이고 450자 초과가 0인데도 final V4 실패가 11/60이었다. 짧은 거짓 해설은 여전히 fatal이고, 필요한 대조 근거가 긴 해설은 길다는 이유로 자르면 안 된다.
- 구조적 중복은 BLANK main explanation이 이미 각 오답 함정을 설명하도록 요구하면서 별도 `wrongOptionExplanations` 네 개와 keyPoints를 다시 요구하는 데서 발생한다. 따라서 전 유형 고정 글자수 컷이나 무조건 재생성이 아니라, 유형별 최소 증거 계약으로 main은 정답 근거·결정적 대조만, 오답별 진단은 한 전용 필드에만 두고, 사실성/동기화가 깨진 경우에만 1회 micro-schema explanation-only repair를 허용하는 방향이 비용과 정확성을 함께 보존한다.
- root가 재현 verifier를 실행해 PASS했다. manifest SHA-256 `784988eb5bf2287383b3726d1214dcd49b5787530979a95279ea1274b7899933`; network/model/API/DB/secret/candidate는 0이고 production source 변경도 0이다. 이 관찰은 혼합 역사 표본의 장문 발생률 추정이 아니라 계약 결함과 반례를 확인한 offline evidence다.

### O112. 두 평가자의 판정 내용보다 먼저 인증 해시 결합 결함을 교정했다

- 두 평가자의 24개 `review-records.json`은 각각 zod schema 자체는 통과했지만 실제 `scoreFromSealedArtifacts` 계약에는 그대로 들어갈 수 없었다. rater A는 24개 모두 `phase2RevealSha256`에 전체 reveal bundle이 아니라 개별 reveal row 해시를 기록했고, rater B는 24개 모두 `relabelMapSha256`에 개별 map row가 아니라 전체 map bundle 해시를 기록했다. 따라서 종전의 "schema 24/24 PASS"를 "인증 입력 PASS"로 승격한 표현은 철회한다.
- 원본 판단은 바꾸지 않았다. `calibration-v2-rater-interagreement-v1`이 허용된 두 결합 필드만 기계적으로 교체한 private 파생본을 만들었고, 두 파생본 모두 스코어러의 모든 선행 검사를 지나 의도한 `GOLD_ADJUDICATION_PENDING`에서만 멈췄다. 즉 판단 필드 변경 0, A reveal-binding 24개·B map-binding 24개만 교정됐다.
- 결합 교정 후 독립 합의도는 blind answer 21/24, fatal flag 23/24, fatal-domain exact 18/24, grade exact 20/24, grade QWK 0.88034다. 어법은 정답·fatal flag 8/8 일치했지만 grade 6/8, 빈칸은 정답·fatal flag·grade 8/8 일치했다. 반면 focus 전체 진단 exact는 어법 0/8·빈칸 0/8이다.
- 진단 불일치는 단순 전체-record exact의 과민성만은 아니다. 어법 40개 site에서 grammaticality/diagnosis 24/40, point family 11/40, correction exact 8/40, explanation accuracy 36/40였고, 빈칸 40개 option에서 slot grammar 40/40·grounding 29/40이지만 primary intent axis 10/40, divergent-axis set 2/40, single decisive flaw 20/40이었다. 정답·등급 합의와 의미축 taxonomy 합의를 분리해야 하며, 현 평가자를 gold 없이 그대로 인증할 수 없다.
- report file SHA-256 `7de8cd8feda45f0d0cd685b55cdcdb0a05227c3d5258beda52479d74a34ffef6`, semantic SHA-256 `0f23161f40e6a7bd02e42d2e8ccf10325af558f085d10015c8bb9fc7487dd5c8`; write/check, audit verifier, scorer pending-gold probe가 모두 PASS했다. network/model/API/DB/secret/candidate는 0이다.

### O113. 재시도는 한 층의 복원력과 여러 층의 중복 증폭을 분리해야 한다

- 봉인 topology의 7개 대표 셀을 SDK retry 0/1/2, application attempt 1/2/3, outer subset, Premium grammar ladder cycle/repair/parse, Trigger execution 1/2로 전개해 2,952개 조합과 17,826개 검사를 재생했다. 현재 ordinary full-schema wrapper 최장 경로는 `3 application attempts × 3 explicit SDK calls × 3 SDK physical attempts = 27 physical fetches`다.
- 구조상 가장 보수적인 후보는 `SDK retry=1`, generic application replay=0, 현 outer/사다리 유지다. ordinary wrapper 배수는 27→6이고 7-cell 합 물리 상한 민감도는 -76.26%지만, 이는 비용·호출 구조의 Pareto 후보일 뿐 품질 비열등성의 증거가 아니다. parse/schema 오류 telemetry가 same-attempt repair 뒤에도 유의미할 때만 application replay 1회를 조건부 후보로 둔다.
- Trigger의 provider work를 1회로 보는 안은 task retry 제거가 아니라 durable idempotency와 전 소비자 ENFORCE가 먼저다. 현재 budget 기본 OFF, uncovered consumer, provider-visible `questions[].maxItems`, input cap, fresh price, served-model attestation이 없어 total USD ceiling은 계속 `null`이다.
- root가 no-write build와 verifier를 재실행해 2,952 rows, 9 profiles, 17,826 checks를 PASS했다. manifest SHA-256 `e2aec30a07bf7c40c4a66f113213bb95159bf63782de3466cca058b58db862df`; production source 변경과 network/model/API/DB/secret/candidate는 0이다.

### O114. 2-call 연결성 v4는 작성자 봉인까지 왔지만 아직 독립 승인 전이다

- v3의 32-file compiler subset과 permissive parser를 버리고, v4는 `compile-exact-wire.mts`에서 독립 AST full closure 192 source + 명시 data 4 = 196개를 exact set/bytes/hash로 봉인했다. live closure는 source 8 + data 3 = 11개다. inherited subset과 one-row deletion은 exact equality에서 거부된다.
- 두 실제 wire schema의 재귀 keyword 지원을 검사하고, response parser는 `finish_reason=stop`, exact response schema, exactly 1 choice·1 semantic question, nonnegative safe-integer usage와 정확한 token total을 강제한다. `length`, schema-invalid object, fractional/inconsistent usage 음성 회귀를 포함해 offline 27/27가 통과했다.
- root 재실행에서 write/check parity, verifier, scoped TypeScript가 PASS했다. protocol `18d7eb7c60fdfc1d4b49fb868ef887d64e62db6d217abf8eaec0fbbeab8ffec9`, private wire `b81e59a209e3166bc74cd18181669d5fb87a883480dcbd33d061ddcdac5df712`, public wire `6a0d9ef8775a528b2e90c9c96069753aa26b67d4f34a3a2409d2e34ae4a2362a`, compiler closure artifact `673effc7574891a32d1ddad79531ef5573ecfb5be61e9df8ad4b74e1d8a5ebbd`, live closure artifact `775156d6b74c5651fc0eedba3ed3b07b2733acfefe3f74a89f96236d6f46c92a`, manifest `33a7cd93fdf4bb5af4cb8bf8f320e79203c7365bf257896f9fb67a8c05d3d37d`다.
- 세 live authorization flag와 CLI는 계속 false/blocked이며 model/provider/API/DB/browser/credential/ledger/candidate는 0이다. 별도 fresh auditor가 compiler의 숨은 file input, live 권한 경계, parser 음성공간, v2/v3 불변을 재현해 PASS하기 전에는 새 live-authorized 버전을 만들지 않는다.
- **root 사전 반증 후보:** v2 compiler의 `SOURCE_PATHS` 32개와 v4 AST+declared closure를 집합 비교하니 v1 protocol·public corpus는 declared data로 들어가지만 `campaign-v6-s1.../openrouter-question-parser.ts`, `harness/atlas-controller.ts`, `harness/ledger.ts` 세 파일은 AST source와 declared data 모두 밖에 있었다. 이 파일들은 `sourceClosure()`가 실제로 `readFileSync`하여 upstream/v4 artifact provenance hash를 바꾸므로, wire body가 같더라도 "compiler output full input closure" 주장은 불완전할 가능성이 높다. 또한 parser/HTTP 실패 시 이미 발생한 provider usage·cost를 성공 evidence에만 합산해 global ledger actual cost가 0으로 남을 수 있고, global reserve 직후 journal append가 try 바깥에서 실패하면 reservation이 고립될 수 있다. 세 항목은 아직 fresh auditor의 독립 판정 전인 root 정적 관찰이며, 어느 하나라도 재현되면 v4는 새 버전으로 교체한다.

### O115. 정답 합의와 taxonomy 합의를 분리해야 평가자가 공예를 제대로 측정한다

- 두 평가자는 집중 유형의 정답·fatal flag는 어법 8/8·빈칸 8/8 합의했지만, 전체 focus diagnostic exact는 두 블록 모두 0/8이었다. 특히 어법 point family 11/40·correction exact 8/40, 빈칸 primary intent 10/40·divergent axis set 2/40은 현 단일-label 계약의 식별 가능성이 낮음을 보여 준다. 반대로 correction restores source 40/40, slot grammar 40/40, answer axis preservation 56/56은 객관 construct가 작동함을 보여 준다.
- v3 rubric은 어법의 문법성·diagnosis·source 복구·해설 명제 진실성을 비보상 객관 필드로 유지하되 point family와 허용 교정은 equivalence set으로 바꾼다. 빈칸은 생성 의도와 관찰 의미차를 분리하고, 7개 proposition axis 각각의 관계 벡터와 `decisiveAxes`/`mechanismTags` 집합으로 표현한다. 평가자가 하나의 "주된 함정 이름"을 억지로 추측하게 하지 않는다.
- 12개 anchor pilot×3 raters에서 codebook 식별 가능성을 먼저 검증하고 나서 새 24개 본 교정팩을 발행한다. answer/fatal은 높은 문턱을 유지하며, taxonomy는 accepted-set 적용 뒤의 경험적 신뢰도로 문턱을 고정한다. 최종 truth가 목표 분포를 깨면 재균형하지 않고 새 packet을 만든다.
- 설계 보고서 SHA-256 `2444a6431dbf686fcb8c726ce555f8aa480dc1954568226107777d4a51a36442`, machine proposal SHA-256 `d0fb4df70881617bb04ecde4b4fc35cec0ab61d8f56986e7ccee47e3516356fd`; network/model/API/DB/secret/candidate는 0이다.

### O116. 1,000개는 사후 top-up 풀이 아니라 단계별 질문에 사전 배정한다

- 전역 registry v2는 C0 연결성 2, S1 집중 profile screen 180, S2 선택 profile 대 control의 20-passage single-shot holdout 480, S3 비집중 23유형 sentinel 92, S4 direct-core 대 bounded production-route parity 144, S5 어법 CORE-10·빈칸 7축 stress 102로 정확히 1,000을 배정한다. 이는 반드시 소모할 목표가 아니라 절대 상한이며 선행 gate 실패 슬롯을 다른 실험으로 사후 재배정하지 않는다.
- S2는 통계 단위를 20개 passage cluster/type으로 확보하되 one-candidate direct-core mechanism 확인으로 범위를 한정한다. 현 production topology의 폭발적 candidate ceiling을 480 assignments로 위장하지 않는다. production retry/ladder 통합은 S4에서 assignment full-question cap 3, durable idempotency, failed/unknown usage·cost 귀속을 먼저 구현한 뒤 `36 cells × (direct 1 + production max 3)=144` sentinel으로 따로 확인한다.
- S3의 clean 4행/type과 S5의 clean 1행/risk cell은 안전률 증거가 아니며 defect existence probe다. answer-only/solver/explanation-only 호출은 1,000 full-question cap과 별도의 model-call/token/USD 원장에 모두 센다.
- PLAN SHA-256 `2dc638d60e6ec3bff34bb2f93ebbc5495bb136dbdf236813e4f79ba26cd94aeb`, registry SHA-256 `1e2fc90252de8790ebd7df86e81602825c3fd8b50f5fa96de237ec3cc8fdbab1`; 현재 실제 소비는 계속 0/1,000이고 S2~S5 USD ceiling은 exact-wire·fresh price·served-model·physical envelope 전까지 `null`이다.

### 현재 실행 게이트

- 새 model/API/provider/production DB 호출: **0**, 캠페인 소비: **0/1,000**.
- 범위 정정: 위 `0`은 **모델 생성·후보 소비·provider inference·production DB** 기준이다. 가격/모델 가용성 확인을 위한 OpenRouter 공개 웹 조회와 Vercel project/env-name control-plane 조회는 별도 metadata network access로 발생했으며 후보·토큰·추론 비용에는 포함되지 않는다. 각 offline verifier의 `externalNetworkCalls: 0`은 그 verifier 프로세스 자체의 계측값이지 전체 연구 세션의 인터넷 사용 0을 뜻하지 않는다.
- S1 controller는 최초 hostile audit 21개 차단점의 보정 후 fresh hostile re-audit 중이다.
- **20:03 KST S1 offline isolation 독립 PASS:** root가 독립 review의 `--full` verifier를 다시 실행해 S1 전용 28/28, 공유 controller/boundary/callsite 52/52, ledger 25/25, 두 official verifier·두 scoped TypeScript·non-writing builder·180 guarded replay·`normalizeScope` probe를 모두 통과했다. production runtime closure는 9개이고 test-support는 0개, 180/180 local interception·distinct body/envelope, unexpected fetch·alternate transport 0, target 변경 0이었다. review manifest `fb6e6c5e327696bcd12a45a859131033038b0d52ab9e3b7e1441fde0ad3341fe`; 판정은 `PASS_OFFLINE_ISOLATION_REPRODUCED_EXECUTION_BLOCKED`이며 external/provider/model/API/app DB/credential/secret/candidate는 전부 0이다. 이 PASS는 offline S1 구조만 승인하고 live 실행은 승인하지 않는다.
- 2-call connectivity pilot은 runner·schema·isolated launcher·zero-success 허위 완료 차단·fresh pricing binding을 보완 중이며, 적대 감사 완료 전에는 실행하지 않는다.
- **19:44 KST pilot v2 author freeze:** Standard→Premium 두 단일-shot만 허용하는 offline package가 verifier와 22/22 synthetic regression, scoped TypeScript를 통과했다. retry/repair/fallback/top-up과 failure/unknown replay를 막고, 완료는 2 started/settled/successful 및 usage/route/parser/served-model 증거를 모두 요구한다. current illustrative emergency reserve는 Standard `$0.241906501`, Premium `$0.372548881`, 합계 `$0.614455382`이다. protocol `df1247adced33f22e9993ef335202ff23b17587f7eaa4349b01fafdc88364ede`, public wire `8f801052a4eed1c3ec908f7105ec58b0ed1d7a96e197c45033dc2fbd79c2c181`, private wire `9f82b1d2934beafac2f32d4daa1d7328870b8928a11ab2a502f4a8f26f8fae49`, manifest `8234032c53b742648345c06020f37f3f069dd60d883cf490076cc5dde7c18ea2`이다. 권한 플래그와 dispatch command는 계속 false/absent이며 별도 independent review 전에는 live 금지다.
- **19:50 KST v2 독립 검수 반려:** `runner.ts`의 exported test-mode factory/runner가 mutable env flag만으로 임의 delegate를 brand하여 sealed `authorization=false`와 별개로 전송 능력을 실행할 수 있었다. 실제 네트워크가 아닌 합성 delegate로 구조적 우회를 재현했다. 또한 independent AST import closure는 198개 repo 파일인데 verifier는 일부 runtime 파일만 모으고 `>=7`만 확인하며, exact-wire manual source list도 33개뿐이라 전체 실행 폐쇄의 집합·해시 commitment가 없었다. 따라서 19:44 protocol/wire/manifest는 역사 기록으로만 남기며 live 근거로 사용하지 않는다. offline test support를 network-incapable 별도 모듈로 분리하고 complete import closure를 exact commitment로 봉인한 새 버전이 필요하다.
- **19:59 KST v2 반려 증거 봉인:** root가 미완성 독립 검수 산출물을 완성한 뒤 처음부터 verifier를 재실행했다. target manifest 13행과 author offline 22/22·scoped TypeScript를 재현하면서도, 전체 local closure 198·compiler closure 189·runtime closure 9, target compiler claim 32, 누락 compiler import 162를 확인했다. 합성 delegate는 실제 네트워크 없이 정확히 1회 도달했고 synthetic store에 provider-call 1이 기록되어 F-001을 재현했다. 독립 결론은 계속 `FAIL`; result SHA-256 `b5444db6ab422372a46794d5ab893014306e7183ec0d0fc6fa310c1fa4e5a4e3`, review-manifest SHA-256 `fea2498fd0215b66fea110924b68259aa0d97b1c9102d0e37a7c1d4e4d943cb3`, 213개 결합 파일 목록 SHA-256 `bbeb3ee6a0218de09b8283987fb4949e04f2988d7e4ae5c6182a98d46cca7936`이다. 검수 과정의 external/provider/model/API candidate/real credential/production DB는 모두 0이다.
- **20:17 KST connectivity pilot v3 author freeze:** v2를 보존한 별도 package에서 production runner의 test env·permit·injected transport·delegate factory·offline execution export를 제거하고 direct fetch 한 경로만 남겼다. test-support는 순수 상태전이 모듈로 분리했고 live closure 밖이다. 네 live entrypoint의 static/literal dynamic import와 runtime data를 정확한 11-file sorted set·bytes·SHA-256으로 봉인하며 최소 개수 조건은 없다. Standard 3.5 Flash→Premium 3.1 Pro 각 1회, 전체 candidate/fetch/completion 2, serial·no retry/repair/fallback/replacement/top-up, terminal unknown/failure 계약은 유지된다.
- root 재현 중 README의 무인자 build 명령이 실제 CLI 계약과 달라 실패하는 문서 결함을 발견했다. 작성 패키지가 `--check`로 고치고 verifier에 무인자 실패·문서 flag 검사를 추가한 뒤 root가 `--check`·verifier·scoped TypeScript를 다시 실행해 22/22와 parity를 확인했다. protocol `9502c1801584084dd026365aaacca46b30c63a1c0aea392f8de3cb32d2f55e15`, private wire `754144b8ea8cd4c5f4cda1c4aab591cec9caae44db6f39c7bf9f870b136f7dcb`, public wire `cf20076d6f023a200f65366eff2627016fed127fe4060f0a8f85dcf6dd3f433b`, closure artifact `86609d2f688f854ed63bbdf35b84f586252becb1f0787e4f2c1ec29e13e79d10`, manifest `f5baacde25a267e6a6413a5f21380f1ed735308b39213099393eab1d4c78b192`다. 세 live flag와 dispatch CLI는 여전히 false/차단, independent audit 진행 중, external/provider/model/API/DB/credential/candidate/ledger mutation은 0이다.
- **20:31 KST v3 독립 검수 반려 확정:** root가 독립 verifier를 다시 실행해 audit artifact 자체는 PASS, 대상 verdict는 `FAIL/DO_NOT_AUTHORIZE_OR_DISPATCH`임을 재현했다. live runtime closure 11개·v2 15파일 불변·두 current wire parity·author 22 tests/typecheck/check는 통과했지만, exact-wire compiler의 실제 local graph는 191개이고 inherited claim은 32개뿐이었다. 교집합 27, 누락 164, graph 밖 claim 5이며 unresolved/nonliteral import는 0이다. 즉 runtime 폐쇄만 고쳤고 요청 본문을 만든 production compiler 폐쇄는 v2의 불완전한 `26725e...`를 그대로 상속했다.
- 별도 F-002도 확인됐다. v3 response parser는 `finish_reason="length"`인 잘린 응답, exact question schema와 무관한 `{unexpected:true}` 객체, `1.5/0.5/2` 같은 fractional usage를 성공 증거로 수용했다. 후속 버전은 terminal finish reason, exact question schema, nonnegative safe-integer token과 total consistency를 각각 fail-closed로 검사한다. review manifest `5151bdfd01e95790c8ed762e1a89ae23063a3c34ee7c87bef865ed3de8d85ca2`, result `3ca63e6beedd850ded02a71c5ff0c545e52578c43aeccad7d63625b7ef733d48`; source-hash 238행, external/provider/model/API/DB/browser/credential/candidate/ledger/target mutation은 모두 0이다. v3는 역사 기록으로만 보존하고 compiler+runtime 두 closure와 parser를 모두 고친 v4를 별도 구축한다.
- 저장소의 `.env.local`에는 `OPENROUTER_API_KEY` 이름이 존재함을 값·길이·hash를 출력하지 않고 확인했다. pilot launcher/import closure는 env loader를 포함하지 않으며, live가 승인되더라도 외부 operator wrapper가 해당 변수 하나만 child에 전달해야 한다. 이 확인은 credential 사용이나 API 호출이 아니다.
- **현행 저비용 validity 하한 재확인:** root가 어법·빈칸·salvage 관련 회귀 묶음(`question-validity-invariants`, `blank-paraphrase-contract`, `never-fail-salvage`, `grammar-generation-quality`)을 현재 source에서 다시 실행해 **136/136 PASS**를 확인했다. retained-object 수동태 오답, 명사절 `that`의 관계대명사 오설명, 빈칸 seam 문법 불일치, 사실과 다른 해설 차단은 계속 작동한다. 이는 치명 오류 방지의 하한일 뿐 선지 공예·KILLER 미학·실제 출하품 품질의 증거로 승격하지 않는다. 모델/API/provider/production DB 및 후보 소비는 0이다.

## 목표

프로덕션 동일 환경에서 영어 전 문항 유형, 특히 어법·빈칸을 유효성뿐 아니라 선지 공예와 해설 우아함까지 개선한다. STANDARD/PREMIUM의 비용, 지연, 재시도, 출하 가능률을 함께 최적화한다.

## 불변 규칙

1. API 완성 문항 후보 상한 1,000. 현재 사용량 **0/1,000**.
2. 기존 실험·사용자 변경을 삭제하거나 덮어쓰지 않는다.
3. Git 커밋/배포 세대가 다른 DB 문항을 같은 현행 표본으로 묶지 않는다.
4. 자동 게이트 통과와 실제 문항 품질을 동일시하지 않는다.
5. 생성자와 최종 평가자를 분리하고, 모든 개별 판정을 구조화 파일로 남긴다.
6. 비용은 문항당 raw cost뿐 아니라 ship-ready 1개당 총비용으로 판단한다.

## 2026-07-15 기준선 정정 로그

### O1. 실제 저장소 경로

- 사용자 shell cwd인 `C:\Users\jooye\Desktop\2026project\nara`는 Git 저장소가 아니며 실험 일부만 존재한다.
- 실제 코드·Git·DB 스크립트·기존 연구노트는 `D:\Desktop\2026project\nara`에 있다.
- 이후 작업 기준은 D: 저장소다.

### O2. 7/15 새벽 15문항은 단일 코드버전 표본이 아니다

- 품질 대공사 커밋 `448488ca`의 시각은 2026-07-14 23:33 KST다.
- Vercel CLI로 확인한 현 프로덕션 배포 생성 시각은 2026-07-14 23:55:04 KST이며 `smoat.co.kr` 별칭이 연결되어 있다.
- 기존 dump에는 그 전인 22:05~23:28 생성분 7개와 그 후인 00:06~00:09 생성분 8개가 섞여 있다. 따라서 전자 7개는 현 Vercel 세대 성과에서 제외한다.
- 다만 Trigger worker 배포 세대가 job에 저장되지 않으므로, 후자 8개도 route와 worker revision을 확인하기 전에는 “현 프로덕션 확정 표본”이 아니라 “현 Vercel 이후 표본”으로만 부른다.
- DB에 generator commit/deployment가 저장되지 않아 생성 시각만으로 정확한 코드버전을 복원할 수 없다. 커밋 전 생성분을 새 사다리 성과로 집계할 수 없다.
- **20:08 KST 최신성 재확인:** production DB를 내용 비노출 read-only count로 다시 조회한 결과, 기존 cutoff인 2026-07-15 10:00 KST 이후 새 AI question과 `QUESTION_GENERATION` job은 각각 0건이었다. 따라서 현재도 위 15개가 최신 생성 기록이며, 새 코드가 반영된 것처럼 더 최근 표본을 꾸며 평가하지 않는다. 이 조회는 production DB metadata read 1회이며 model/provider/API candidate는 0/1,000으로 유지된다.

### O2-1. 15문항은 전 유형·전 난이도 기준선도 아니다

- 25개 UI 유형 중 5개 유형만 포함하며 `KILLER` 14개, `INTERMEDIATE` 1개, `BASIC` 0개다.
- 지문도 5개뿐이고 한 지문에서 여러 문항이 파생되어 관측치가 독립이 아니다.
- 플랜은 STANDARD 8/PREMIUM 7이지만 유형·난이도·지문이 균형화되지 않았다. 이 표본에서 플랜 전체나 전 유형 품질을 추론하지 않는다.

### O3. 기존 “전 유형 20/20” 주장은 범위가 과장됐다

- 실제 `e2e-premium-types.ts` 산출물은 `BLANK_INFERENCE`, `VOCAB_CHOICE`, `TOPIC`, `SUMMARY_COMPLETE_MC` 네 유형을 각 5개 생성한 것이다.
- 영어 스키마에는 이보다 훨씬 많은 유형이 있다. 따라서 이는 대표 4유형 smoke이지 전 유형 검증이 아니다.

### O4. 최신 표본에서 직접 확인한 주요 결함

- STANDARD `GRAMMAR_ERROR` `...ekt5eo`: `is not permitted + NP`를 “목적어가 남았으므로 수동 불가”라고 단정. Oxford 사전은 `be permitted something` 구조를 명시한다. 해당 문장은 최소한 정답 시비가 크고 해설 규칙은 거짓이므로 V2/V4 실패다.
- STANDARD `BLANK_INFERENCE` `...06vmjz`: 빈칸 뒤 `that are part of conversation`을 남겨 두어 일부 오답이 내용이 아니라 통사 연결로 탈락한다.
- STANDARD `GRAMMAR_CHOICE_COMBO` `...j7kkes`: `acknowledging that readers expect the same things`의 `that`을 명사절 접속사가 아니라 목적격 관계대명사로 오분석한다.
- PREMIUM `VOCAB_CHOICE` `...1515m4`: 지문 마커 순서가 `(e),(a),(b),(c),(d)`이고 relaxed/review flag 상태다. `stalemate→imbalance`는 문맥상 완전히 배제하기 어려워 정답 시비도 있다.
- 최신 KILLER 빈칸 다수가 validator 스스로 `too-easy`, `weak-distractors`, `polarity-shortcut`을 기록했지만 출하됐다.

### O4-1. raw 저장형과 실제 표시형을 구분해야 한다

- 6월 17일 이후 workbench/paper renderer는 VOCAB/GRAMMAR 계열 마커를 출현순으로 재정렬하고 원형 숫자와 표시 정답을 정규화한다. raw JSON의 plain 숫자나 마커 순서만 보고 곧바로 학생 화면 결함이라고 판정한 기존 감사 일부는 과장됐다.
- 예컨대 `...1515m4`는 raw 저장 정답 4, 마커 `(e),(a),(b),(c),(d)`지만 paper/display에서는 출현순 ①~⑤와 표시 정답 ⑤로 바뀐다.
- 반대로 scoring 경로가 raw `structuredData.correctAnswer`를 우선하는 지점이 있어 surface별 정답 불일치 가능성은 남는다. V1/V5는 raw가 아니라 실제 workbench·paper·scoring 세 표면을 함께 검증한다.

### O5. 기존 연구의 재현성 공백

- 기존 연구노트의 A/B/C/F 집계는 개별 평가 JSON과 평가자간 합의 자료가 저장되어 있지 않다.
- `100%` 주장은 생성 성공/자동 게이트 통과와 수기 판정을 섞어 쓰므로, 새 rubric으로 원문항을 다시 블라인드 평가해야 한다.
- 이른바 `results-run1-100pct.jsonl` 30개는 모두 `ok=true`지만 19개가 산출물 자체의 `errors` 배열을 갖고, 10개가 warning을 갖는다. 오류에는 해설 린트, pointCode 불일치, 품사 변경, filler, obvious answer, debatable infinitive, 명사절 오칭이 포함된다.
- 후속 `results.jsonl` 30개도 모두 `ok=true`지만 7개가 `errors`를 갖는다. 평균 호출은 3.2→4.87, 기록 비용은 $2.110→$3.034, 평균 지연은 49.1초→87.6초로 늘었다.
- 따라서 과거의 “60문항 100%”는 fatal-free/beautiful 비율이 아니라 특정 사다리의 `ok` 또는 당시 수기 분류 주장으로만 취급한다. 두 정책의 60개를 한 세트로 무작위화한 블라인드 패킷을 새로 고정했다.

### O6. 달력월 비교와 비용 원장의 함정

- 6월↔7월에 content×type×plan×difficulty가 정확히 맞는 셀은 76개뿐이며, 핵심 셀은 STANDARD GRAMMAR 4개, STANDARD BLANK 15개, PREMIUM BLANK 2개 수준이다. 단순 월평균 비교는 지문·유형·난이도·모델·배포 혼입 때문에 금지한다.
- 원본 생성품 평가는 수정 가능한 `Question` 현재 행보다 `WorkbenchAiJob.result.questions` snapshot을 우선한다.
- 최신 PREMIUM IMPLIED job 중 outer attempts=2인데 비용 원장 call=1인 사례가 확인됐다. completed job 전반에도 attempts보다 recorded calls가 적은 사례가 있어 실패/timeout 호출 비용이 누락될 가능성이 있다. 비용은 ledger만 맹신하지 않고 실제 usage event와 호출 단계별 원장을 대조한다.

### O7. 현재 프로덕션의 구조적 관측 공백

- `Question`과 `WorkbenchAiJob`에 Git SHA, Vercel deployment, Trigger worker version, prompt/gate/ladder version, resolved model/reasoning 설정 digest가 없다.
- PREMIUM 어법 사다리는 PREMIUM×GRAMMAR 전체가 아니라 strict, count=1, markerCount=5, answerCount=1, teacher points/custom prompt/intent 없음일 때만 탄다. 그 밖의 shape에는 과거 60문항 결과를 일반화하지 않는다.
- solver gate는 solver가 저장 key를 고르면 통과하며 “key 표면이 실제 비문인가”, 교정형, 지배 규칙을 별도 인증하지 않는다. solver 호출 실패는 fail-open이고 scarce/salvage에서는 solver 자체를 건너뛴다.
- 향후 모든 실험·생성품에 immutable provenance와 stage별 usage/cost를 저장하는 것을 선행 구현 후보로 둔다.

### O8. “never-fail”과 품질 불변식이 충돌한다

- 최종 rejected-pool 재입장 allowlist에 `grammar-noun-clause-pronoun-mislabel`, `grammar-answer-nonword-forced`, `grammar-explanation-lint`, `grammar-gibberish-inversion-fragment`, `grammar-error-pos-change`, `wrong-option-explanation-count` 등이 들어 있다.
- 이 코드는 단순 공예 경고가 아니라 해설 오분석·비단어 정답·비문 조각·품사 훼손·해설 누락까지 salvage 가능하게 만든다. solver도 scarce/salvage에서는 실행되지 않는다.
- 결론: correctness와 craft를 분리한다. 단일정답·표면 문법·해설 사실성·필드 동기화는 어떤 yield 모드에서도 완화하지 않는 불변식이어야 한다. craft는 경고/표적수리/비용 정책으로 다룬다.

### O9. retry와 비용은 현재 표시값보다 클 수 있다

- STANDARD의 `maxAttempts=2` 표시는 실제 hard maximum이 아니다. 일반 유형은 최소 4 outer attempts, 확장 유형은 6, KILLER 단일 빈칸은 10까지 갈 수 있고 각 object operation 내부 provider retry는 최대 3회다. repair/solver/salvage/ladder가 추가된다.
- 공통 provider retry는 최종 성공 뒤에만 usage event를 내보내므로 fail-fail-success가 success 1콜로 기록되고 전부 실패하면 0콜로 보일 수 있다. user credit refund와 provider 실제 비용도 분리해야 한다.
- unknown Gemini 비용 추정은 현재 Flash 단가로 분류되어 3.1 Pro fallback 추정이 왜곡될 수 있다.
- 실험 전제: logical attempt와 physical call을 분리하고, 모든 호출 성공/실패를 stage·model·request ID·tokens·actual cost와 함께 finally 경로에서 기록한다. question cap, provider-call cap, USD cap을 서로 독립적으로 강제한다.

### O10. “프로덕션 동일”의 기준 경로

- 사용자가 실제 쓰는 primary fast route는 인증·academy scope·최근 동일 지문 40문항 diversity·teacher-point collision 제거·실제 credit/persistence·270초 deadline을 포함한다.
- Trigger route는 같은 core를 쓰지만 diversity/variant context가 없고 deadline 540초, count>1을 허용해 입력 동등성이 없다.
- 기존 audit loop는 core-level 실험으로서 route billing/persistence/diversity를 우회하고 production에 없는 opposite-plan LLM judge를 추가한다.
- 따라서 실험은 두 층으로 구분한다: (A) 고정 코퍼스로 안전하게 요인 탐색하는 core-parity, (B) 격리된 research academy에서 실제 fast route를 타는 route-parity 확인. 둘을 섞어 하나의 성과율로 보고하지 않는다.
- 모든 실행 시작 시 requestedPlan, effectivePlan, servedModel, feature-flag snapshot을 assert한다. `SHOW_MODEL_SELECTOR=false`이면 요청 PREMIUM이 STANDARD로 정규화될 수 있기 때문이다.

### O11. 고정 코퍼스 자동 선별은 완료됐지만 아직 시험 투입 승인이 아니다

- 저장소 공식 지문 4,537개와 격리 연구 academy의 DB 지문 230개를 읽기 전용으로 수집했다. 기존 `corpus-30`, 7/15 새벽 지문, 정규화 내용 중복을 제외하고 자동 무결성 게이트를 거친 후보는 저장소 1,262개, DB 60개였다.
- seed와 입력 fingerprint를 고정해 dev 60개와 holdout 60개를 각각 저장소 30+DB 30으로 구성했다. 별도 robustness 후보 20개도 격리했다. 25유형×2플랜×3난이도인 150셀 schedule은 split마다 모든 60개 지문을 2~3회 사용하고 heuristic fallback은 0개다.
- 그러나 `CLEAN_CANDIDATE`는 글자수·영어 비율·구두점·OCR 흔적 같은 제한적 자동 검사 통과일 뿐, 논리·문법·사실·문항 적합성을 인증하지 않는다. 두 명의 독립 수동 감사가 끝나기 전에는 API 시험에 투입하지 않는다.
- DB에서 `reviewed + 이전 AI 문항 0 + 이전 Workbench job 0`인 strict holdout 후보는 0개였다. DB holdout 30개 중 20개는 unreviewed+unused, 10개는 unreviewed+prior-use다. 완화 사유는 항목별로 기록했고, 탈락 시에는 holdout을 억지로 채우지 않고 재선별한다.
- historical matched cohort는 정찰용이다. 15,311 jobs를 추적했을 때 June↔July exact normalized-content×type×plan×difficulty 공통 셀은 76개이고 PREMIUM grammar는 0개였다. 인과적 결론은 새 prospective frozen holdout에서만 낸다.

### O12. 최초 예산 가드는 산술 테스트는 통과했지만 실제 호출 차단 장치가 아니었다

- JSON ledger v1은 7/7 테스트에서 동일 파일 내 예약·합계·동시성 산술은 맞았다. 그러나 생성기/provider 경계와 연결되어 있지 않고, 임의 ledger 경로를 선택할 수 있으며, call/cost를 물리 호출 **후** 기록했다. 따라서 상한을 넘긴 호출이 이미 발생한 뒤 기록만 거부되어 실제 사용량을 누락할 수 있다.
- `consume count`도 producing call/output hash와 연결되지 않아 완성 후보를 임의로 축소·중복 계상할 수 있고, ledger mutation idempotency가 provider 호출 idempotency를 보장하지 않는다. finalize가 in-flight 호출을 모르는 문제와 delayed billing 조정 부재도 있다.
- 이 v1은 API 실행 허가 조건을 충족하지 않는다. canonical campaign store, 네트워크 전 `begin-candidate`/`begin-call`, 고유 call/output linkage, 보수적 cost reservation, `success|failed|unknown` 정산, overrun 기록 후 신규 호출 차단, unresolved lease를 가진 finalize 금지, delayed reconciliation을 갖춘 v2로 대체한다.
- 사용자 상한보다 보수적으로, full-question 생성 경계에 들어간 attempt slot은 parse 실패여도 1,000 상한에서 영구 소비한다. 별도로 실제 parsed candidate 수와 accepted/rejected 수를 보고해 “사용한 슬롯”과 “만들어진 문항”을 섞지 않는다.
- v2가 실제 experiment runner의 유일한 provider wrapper로 연결되고 우회 검사가 통과하기 전까지 API 사용량은 계속 **0/1,000**이다.

### O13. renderer가 고친 답과 scorer가 채점한 답이 달랐고, 공통 정본화로 제거했다

- 최신 15문항 중 마커형 6개를 실제 pure-function 표면으로 재생했다. Q010 PREMIUM VOCAB은 저장/태블릿/scorer 정답이 4였지만 workbench와 paper renderer가 출현순으로 재정렬한 정답은 5였다. 태블릿의 보이는 마커 순서도 `⑤,①,②,③,④`였다.
- 따라서 raw JSON의 순서만 보고 “모든 화면이 깨졌다”는 주장은 과장이었지만, 화면별 진실원본이 갈라진 V5 결함은 실제였다. 같은 문항이 workbench/paper에서는 ⑤, tablet/scorer에서는 ④가 되는 상태였다.
- workbench/paper가 쓰던 `normalizeStructuredQuestionForDisplay`를 tablet-safe payload와 `buildAnswerSpec` 앞의 공통 adapter로 연결했다. 동일 6문항 replay에서 mismatch 1→0, 기존 exam-scoring/student-safe 테스트와 새 표면 parity 회귀 테스트가 모두 통과했다.
- 추가 역추적에서 ANTONYM은 baked marker만으로 재정렬할 수 없고 원문 passage가 반드시 필요함을 확인했다. 최초 패치는 응시 로더에는 원문을 넘겼지만 실제 제출, 재채점, 학습 과제, 결과 드릴다운, 내부 리포트, AI 분석 보강 일부 호출부에는 넘기지 않았다. 이 경로들을 모두 `sourcePassageContent`로 연결하고, marked 유형에서 정규화된 structured options가 raw DB options보다 우선하도록 수정했다.
- 출현순이 `Alpha→beta→gamma…`인데 저장 배열은 `gamma→Alpha→beta…`인 ANTONYM 회귀 fixture에서 workbench=①, paper=1, tablet 첫 선지=`(A) Alpha - same`, scorer=1, 실제 `gradeMergedSubmission`의 ① 제출=CORRECT/3점이 일치한다. VOCAB Q010 회귀도 함께 유지된다. tsc, ESLint, 26유형 scoring, 26유형 student-safe 누출 게이트, 표면 parity 테스트가 통과했다.
- 아직 배포 브라우저 픽셀과 외부 HTTP를 통한 실제 제출 round-trip을 검증하지 않았으므로 “프로덕션 해결 완료”로 부르지 않는다. route/browser E2E가 남았다.

### O14. 새 blank seam 규칙은 380개 offline replay에서 최신 실결함 1개만 포착했다

- 과거 JSON/JSONL 250파일에서 고유 `BLANK_INFERENCE` 380개를 추출해 모델 호출 없이 option+prefix+suffix 결합을 재생했다.
- 초기 finite-verb 규칙은 `The main task for human beings _____ is ...`처럼 마지막 명사를 주어 head로 오인해 19개 오탐을 냈다. 이 결과를 그대로 채택하지 않고 명시적 관사/수량사만 판정하도록 보수화하자 19개가 모두 사라졌다.
- 남은 유일 hit는 최신 Q008의 `_____ that are part of conversation`이었다. 선택지 말단의 수·부착 계약이 달라 `exchange that are`, `interest that are` 같은 문법 소거가 생긴 바로 그 사례다. 이후 fresh-eyes adjudication도 V3 치명 결함으로 확정해 known-failure recall은 1/1이다. 다만 양성 표본이 1개뿐이므로 production hard block 승격 전에는 더 넓은 clean-item 수동 표본으로 false-block 상한을 추정한다.

### O15. salvage allowlist는 역사 산출물에서도 correctness와 craft를 대량 혼합한다

- 49개 역사 results JSONL의 final error/warning만 재생했다. 현 `SALVAGE_RELAXABLE_CODES`와 겹치는 고유 `ok` 문항은 325개였고, 이 중 잠정 correctness invariant 코드가 있는 고유 문항 78개, parent code 분리 또는 필수 repair가 필요한 문항 91개였다. 서로 겹치므로 단순 합산하지 않는다.
- 빈도가 큰 위험 코드는 `grammar-pointcode-span-mismatch` 49행, `grammar-noun-clause-pronoun-mislabel` 37행, `wrong-option-explanation-count` 8행, `grammar-answer-nonword-forced` 5행이었다. `grammar-explanation-lint`도 111행이지만 어투·띄어쓰기와 수 모순·라벨 중복을 한 parent code로 묶어 즉시 hard/soft 분류할 수 없다.
- 이 수치는 여러 커밋·전략·중복 지문을 섞은 정찰치이지 현행 발생률이 아니다. 다만 현재 allowlist 주석의 “전부 craft이며 정답은 유일”이라는 전제가 실제 code semantics와 맞지 않는다는 반례다. parent code를 세분화하고 item-level 표본을 adjudicate한 뒤 정책을 바꾼다.

### O16. 최신 15문항 독립 이중평가의 최종 판정은 F 11 / C 4다

- 두 평가자는 저장 정답을 보지 않고 먼저 풀었고, 저장 key 일치는 각각 15/15였다. 그러나 key 일치는 문항 타당성의 증거가 아니었다. 평가자 1은 F 10/C 5, 평가자 2는 F 11/C 4였으며 A/B는 한 건도 없었다.
- 게이트 이견 7건을 원 평가 결과와 분리한 fresh-eyes 제3 평가자가 원문·렌더·구조·외부 문법 근거로 재판정했다. 최종 C는 Q004, Q006, Q009, Q015 네 건뿐이고 나머지 11건은 모두 fatal이다.
- 확정 결함은 중복 구두점/논리 반전 같은 source·render 무결성, 빈칸 suffix가 주는 문법 소거, 해설의 사실·문법 오분석, 어법 정답 부재·복수 정답, 마커 표면 순서 혼란으로 서로 독립적이다. 따라서 단일 프롬프트 문구나 단일 blacklist로 설명할 수 없다.
- Q011은 Oxford가 `be permitted something`을 명시하므로 의도 답 (E)가 방어 가능한 정문이고 실제 답은 NO_ANSWER다. Q014는 ②가 더 자연스럽지만 `shaded`의 타동사·축약 수동 해석으로 ④도 방어되어 문법 정답이 유일하지 않다. “더 자연스럽다”와 “문법적으로 오답이다”를 어법 게이트에서 혼동하면 안 된다.
- Q010은 raw/display/scoring 공통 정본화 패치 뒤 V5는 통과했지만, `imbalance` 자체가 문맥상 방어되어 V2가 실패하고 해설도 그 반례를 다루지 않아 V4가 실패한다. 필드 동기화 수정과 문항 내용 수정은 별개다.
- 이 결과는 유형 5개·지문 5개·KILLER 편중의 의도적 위험 표본이므로 전체 프로덕션 fatal rate로 일반화하지 않는다. 다만 현행 파이프라인에 여러 종류의 치명 결함이 실제 출하된다는 existence proof이며, 첫 prospective baseline의 우선 검증 항목을 고정한다.

### O17. 과거 PREMIUM 어법 “60지문 100%”는 같은 30지문의 2회 생성이다

- 근거 파일 `w3-triple-ladder/results-run1-100pct.jsonl`과 `results.jsonl`은 각각 30문항이지만 passageId 집합이 완전히 동일하다. 고유 지문은 60개가 아니라 30개이고 각 지문에서 2회 생성한 repeated-measures 60문항이다.
- 두 실행 모두 `ok=30/30`이나 첫 실행 30개 중 19개, 둘째 실행 30개 중 7개에 현재도 error code가 남아 있다. 이는 곧바로 fatal을 뜻하지 않지만 과거 A/B 판정과 `ok`가 validity·해설 사실성의 독립 재검을 대신할 수 없음을 보여준다.
- 60문항을 저장 정답·원문 정본·해설·모델·게이트·실행 번호 없이 섞은 blind packet으로 다시 만들었다. 1단계 답과 V1~V3를 고정한 뒤에만 sealed 원본을 열어 V4~V5와 메타데이터를 감사한다.
- 이후 비율 추정과 bootstrap은 문항 60개를 독립 표본으로 두지 않고 passageId 30개를 cluster로 둔다. 과거 문구의 “60지문 실증”은 “30지문에서 2회 생성한 60문항”으로 정정한다.

### O18. 1,000-slot 설계는 998개로 사전 배분했지만 현재 코퍼스로는 확증을 열 수 없다

- 독립 통계 검토를 거쳐 P1 전유형 dev control 150, P2A density 64, P2B 2×2×2 factorial 64, P3 KILLER 주효과 240, P4 plan crossover 240, P5 전유형 holdout 150, P6 fast-route 50, P7 robustness 20, P8 표적수리 20으로 고정했다. 합계 998, 미배정 2다.
- 150셀 전유형 schedule은 60개 지문을 2~3회 재사용하므로 품질률 표본이 아니라 sentinel이다. 같은 passage에서 나온 여러 output을 독립 n으로 세지 않고 passage cluster로 분석한다.
- P3는 type별 60지문에서 CURRENT/WINNER를 paired 생성하므로 plan 평균 `n=60/arm`이지만 plan별은 30뿐이다. 같은 policy로 반대 plan을 생성하는 P4까지 마쳐야 STANDARD/PREMIUM 각각 `n=60/arm/type/plan` 확증이 가능하다.
- 현 holdout은 자동 휴리스틱상으로도 blank central 39, grammar non-scarce 54뿐이고 prior-use 10개가 있다. 독립 2차 수동 감사에서는 PASS 82/EXCLUDE 32/DOMAIN_REVIEW 6, 문제·선지 스캐폴드 잔존·OCR/구두점 손상·무관 지문 병합·준중복 신호 38쌍이 확인됐다. 제3 판정과 교체 전에는 general sentinel에도 쓰지 않는다.
- 확증용으로는 별도 G60/B60 panel을 구축한다. 과거 실험·dev·general holdout·7/15 표본과 hash/near-duplicate cluster가 분리되고 prior question/job 0이며 두 명 수동 감사+adjudication을 통과해야 한다.
- registry에 각 phase의 slot뿐 아니라 policy별 physical-call cap과 USD cap, 사업상 incremental cost 허용 상한이 들어가기 전에는 시작하지 않는다. no-candidate/timeout/parse 실패는 ITT ship-ready 실패로 남기며 결과를 보고 top-up하지 않는다.

### O19. OpenRouter 가격은 catalog 최저가가 아니라 활성 endpoint 최댓값으로 예약한다

- 2026-07-15 KST 공개 `GET /api/v1/models`와 모델별 `/endpoints`를 인증 없이 캡처했다. STANDARD alias는 canonical `google/gemini-3.5-flash-20260519`, PREMIUM은 `google/gemini-3.1-pro-preview-20260219`로 해석됐고 각각 활성 endpoint 6개였다.
- endpoint별 가격은 같은 모델에서도 달랐다. 200k 미만 보수 상한은 Flash input/output 각각 $2.70/$16.20 per 1M token, Pro는 $3.60/$21.60이다. Pro의 200k 이상 override까지 포함한 상한은 $7.20/$32.40이다. catalog의 headline/최저가만 쓰면 lease가 과소 예약된다.
- 실행 시 snapshot age, canonical slug, endpoint pricing fingerprint가 달라지면 call을 막고 재캡처한다. prompt hard cap이 200k 미만임을 증명하지 못하면 Pro 상위 tier를 예약한다. credit 구매 수수료는 inference usage와 분리하되 현금비용에는 별도 합산한다.
- 아직 phase별 physical-call graph와 max input/output token을 모두 닫지 않았으므로 이 단가만으로 USD cap을 임의 지정하지 않는다.

### O20. 코퍼스 제3 판정 결과 기존 120개 중 확정 PASS는 57개뿐이다

- 독립 2인 판정을 원문과 함께 fresh-eyes adjudication한 최종 결과는 PASS 57, EXCLUDE 42, DOMAIN_REVIEW 21이다. dev는 32/17/11, holdout은 25/25/10이다.
- certified 60개를 채우려면 현재 상태 기준 dev 28개, holdout 35개를 교체해야 한다. DOMAIN_REVIEW가 모두 통과해도 각각 17개, 25개 교체가 필요하다.
- 두 평가자가 모두 PASS였어도 원문 오류 또는 문서 누출 때문에 11개가 추가 EXCLUDE됐다. 자동 hash 고유성이나 2인 다수결을 품질 인증으로 쓰지 않는다.
- 5-token Jaccard 경고 38쌍을 실제 텍스트로 판정하자 16개 문서 군집이었고, 군집 소속 45개 중 대표 12개만 유지·33개를 제거했다. 임계값 아래의 universal-design 연속 문서 4개도 수동으로 발견됐다. split 독립성은 exact hash만으로 보장되지 않는다.
- holdout 확정 PASS 중 grammar-rich 19, blank-central 19, 양쪽 동시 적격 15뿐이다. DB-real holdout PASS도 4/30뿐이다. 현 manifest는 폐기·재선별하고 general dev/holdout 및 G60/B60 focus panel 모두 새 2인 감사와 cluster 누출 검사를 거친다.

### O21. 실측 cost 누락 시 Gemini 3.1 Pro를 Flash 단가로 계산하던 폴백을 수정했다

- `resolveEstimatedPricing`은 OpenRouter/AtlasCloud 모델명에 `gemini`가 있으면 모두 Flash $1.50/$9.00 per 1M으로 처리했다. 따라서 `google/gemini-3.1-pro-preview` 응답에서 recorded cost가 빠지면 Pro가 Flash로 과소계상됐다.
- Pro를 별도 판별해 input 200k 미만 $2/$12, 200k 이상 $4/$18 공개 tier로 계산하고, `resolveCost`가 실제 input token 수를 넘기도록 수정했다. 직접 GOOGLE_GEMINI와 OPENROUTER 경로 모두 같다.
- 회귀 테스트는 Flash, Pro 소형 prompt, Pro 200k 경계, 직접 Gemini, Flash-Lite 다섯 경우를 고정했고 통과했다. tsc와 ESLint도 통과했다.
- 이 변경은 recorded actual cost를 덮지 않는다. 우선순위 `RECORDED→DB→ENV→ESTIMATE`의 마지막 추정 폴백만 바로잡으며, 실험 budget lease는 여전히 O19의 endpoint 최댓값을 사용한다.

### O22. 1,000-slot 하드캡 v2 자체는 적대 테스트를 통과했지만 아직 실행 허가 장치는 아니다

- SQLite canonical ledger는 후보 슬롯, 물리 provider call, 사전 예약 USD를 각각 제한하고 `authorized→in_flight→settled` 상태 전이, 실패·unknown 영구 소비, delayed billing reconciliation, hash-chain audit, snapshot/backup을 갖췄다. 동시성·재시작·중복 idempotency·초과 비용·미정산 call·감사 체인 등 적대 시나리오 13/13이 통과했다.
- 현재 registry에는 운용 가능한 phase가 0개이고 사전 등록 슬롯도 0개다. 따라서 상태는 `0 allocated / 1,000 unallocated`, 모든 실험 phase 차단이며 canonical DB도 아직 생성하지 않았다. 신규 API 사용량은 계속 **0/1,000**이다.
- 다만 SQLite는 wrapper 바깥의 직접 OpenRouter 호출 자체를 기술적으로 막지 못한다. `BudgetSession.runProviderCall`을 유일한 실험 provider 경계로 실제 runner에 주입하고, 정적 우회 검사와 call lineage 검증을 통과하기 전에는 registry phase를 열지 않는다.
- P0~P8의 후보 슬롯은 998개로 고정했지만, phase별 물리 call cap과 USD cap은 실제 call graph·token ceiling·endpoint 최고 단가로 산출하기 전까지 비워 둔다. 숫자를 임의로 크게 잡아 guard를 형식화하지 않는다.

### O23. top-level 1요청=1후보라는 ledger 가정은 실제 다단 생성 계보와 맞지 않는다

- v2 코드를 production call graph와 대조하자 candidate slot에는 `full_question_generation` 호출 하나만 연결할 수 있고, finish도 그 호출 하나를 producer로 요구했다. 그러나 실제 경로는 SDK retry·JSON repair·후보 repair·PREMIUM 어법 answer-only/add-decoys/repair/regen·solver가 중첩된다.
- 특히 한 top-level 문항 요청이 여러 full candidate를 만들 수 있다. 각 full candidate 시도가 parse 실패·timeout·게이트 반려여도 slot을 소비해야 하므로 top-level 요청당 하나만 세면 1,000 상한을 과소계상한다. 반대로 answer-only 설계와 solver까지 slot으로 세면 full-question 후보 상한의 의미가 흐려진다.
- shared OpenRouter HTTP fetch 직전에서 모든 물리 call을 lease하고, `design/evaluation`은 call·cost만, full candidate/full repair는 네트워크 전에 slot까지 소비하는 계보로 재설계한다. parsed candidate는 gate·solver 뒤 accepted/rejected로 종결하며, no-candidate에는 가짜 output hash를 만들지 않는다.
- 구현 불변식과 적대 사례는 `harness/CALL-LINEAGE-DESIGN.md`에 고정했다. 이 보강과 우회 차단이 통과하기 전 registry는 계속 닫아 둔다.

### O24. 과거 PREMIUM 어법 `60/60 ok`는 첫 독립 재감사에서 F 23 / C 37이었다(1인차, 확정 전)

- 평가자 1은 blind solve에서 답·V1~V3·C1~C5를 먼저 동결한 뒤 sealed 원문·저장키·해설·keyPoints·게이트를 열었다. 최종 판정은 F 23, C 37, B/A 0이며, 같은 30지문을 두 번 생성한 cluster 기준 18/30에 치명 결함이 있었다.
- 저장키 불일치는 2/60(PG038, PG048)이고 둘 다 평가자가 `NO_ANSWER`로 판정했다. 실제 source-correct→displayed-wrong 변형이 성립한 것은 54/60이었다.
- 과거 게이트는 60개 모두 `ok`로 수용했지만 이 평가자의 치명 결함 13건을 완전히 놓쳤다. 요청 난이도와 저장 `question.difficulty`가 다른 ADVANCED 10건은 감지하고도 수용했다.
- 실행별 F는 첫 run 15/30, 둘째 run 8/30이었다. 따라서 둘째 run의 개선 신호는 있으나 `30/30 ok`를 validity 100%로 해석할 수 없다. 독립 평가자 2와 fresh-eyes adjudication 전까지 이 수치는 1인차 결과로만 둔다.

### O25. 실결함 3종을 correctness invariant로 승격했고 salvage의 명백한 무결성 혼합을 제거했다

- 최신 Q008의 실제 5개 선지를 production seam analyzer로 다시 결합하자 고정 suffix `that are`와 맞지 않는 ② `exchange`, ④ `interest`가 정확히 검출됐다. 250파일·고유 빈칸 380개 재생에서는 이 문항 1개만 발화했고, 나머지 379개에는 발화하지 않았다. 해당 1건은 기존 독립 판정과 다시 대조해 true positive로 확정했다. synthetic positive/negative 5개와 dispatcher 통합 회귀도 통과했다.
- Q011형 `does not permit`→`is not permitted` 변형은 retained-object passive가 가능한 수여 동사군의 능동→수동 정답 설계를 결정론적으로 폐기한다. `permit/allow/give/deny/grant/offer` 등을 포함하되, 원문이 이미 수동이거나 비수동 변형인 경우에는 발화하지 않는 음성 회귀를 함께 고정했다. 이 결함은 부분수리 호출을 쓰지 않고 정답 자리부터 재생성한다.
- Q012형 `acknowledge (what/that) + 완전한 절`에서 `that`을 관계대명사·선행사/목적어 결손으로 설명하면 본문 해설뿐 아니라 keyPoints와 오답 해설까지 합쳐 차단한다. 최초 검출식은 정상적인 “접속사 that과 선행사 포함 what의 대비”도 오탐했고, 테스트에서 발견 즉시 직접적인 오칭 문구와 목적어 결손 주장으로 범위를 좁혔다.
- `wrong-option-explanation-count`, 사실 문법 오칭, 해설 lint·오탈자·메타 누출·범위 축약은 더 이상 ship-first/scarce/salvage에서 강등되지 않는다. 해설만의 결함이면 지문·정답·밑줄을 고정한 explanation-only repair 한 번만 허용하고, 남으면 출하하지 않는다.
- 역사 results 49파일을 현 정책으로 재생했다. 1차 정리 뒤에도 salvage에 `grammar-answer-nonword-forced`, `grammar-error-pos-change`, `grammar-gibberish-inversion-fragment`, `grammar-pointcode-span-mismatch`, `grammar-appear-pointcode-voice-mismatch`, `grammar-correction-form-exposed`가 남아 있었다. 이들을 correctness/metadata invariant로 옮긴 뒤 현재 salvage와 사전 정의 hard-invariant의 교집합은 고유 문항 46→0이 됐다. 현 salvage 대상은 고유 266개이며 남은 split/repair 표본은 해설 표면 순서 5개다. 역사 자료는 발생률 추정이 아니라 정책 의미 검증에만 쓴다.
- 새 핵심 회귀 5/5, blank core 5/5, 관련 어법·빈칸 묶음 155/156이 통과했다. 유일 실패는 HEAD에도 동일하게 존재하는 오래된 fixture가 이미 `grammar-decoy-filler-span`을 내면서도 error 0개를 기대하는 사전 불일치로, 이번 diff의 세 검출기·정책 변경과 무관하다. 전체 tsc의 두 오류도 기존 grammar-drill nullable/part 타입 오류뿐이고 이번 파일의 새 타입 오류는 없다.
- 이 변경은 모델 호출을 추가하지 않는 저비용 사전 게이트다. API 사용량은 계속 **0/1,000**이다. 다만 “아름다운 문제”의 충분조건은 아니며, 정답 무효·해설 사실 오류·문법 소거라는 하한만 올린다. 선지 의도와 KILLER 공예는 prospective paired 실험에서 별도로 검증한다.

### O26. AI SDK의 숨은 재시도층 때문에 상위 `attempts`와 실제 OpenRouter 호출 수가 다르다

- 현재 `generateQuestionObject`는 자체 `for (attempt = 0; attempt <= maxRetries; attempt++)`를 돌지만, 그 안의 Vercel AI SDK `generateObject`/`generateText`에는 `maxRetries`를 명시하지 않는다. 설치 버전 `ai@6.0.99`의 기본값은 2이므로 각 SDK 호출은 provider `doGenerate`를 최대 3회 실행할 수 있다.
- SDK retry는 provider 호출 자체를 감싸고, JSON parse/schema validation은 그 바깥에서 수행된다. PREMIUM의 `experimental_repairText`는 별도 `generateText`를 호출하고, prompt-inlined JSON fallback도 별도 `generateText`와 필요시 JSON repair를 호출한다. PREMIUM 어법 사다리의 `fireOnce` 역시 SDK 기본 retry를 그대로 가진 채 answer-only/add-decoys/repair/regenerate를 각각 호출한다.
- 따라서 상위 usage event의 `attempts`와 마지막 성공 응답의 usage만으로는 실패한 physical call, HTTP retry, JSON repair 비용을 복원할 수 없다. 특히 `answer-only`와 solver는 full-question slot은 아니지만 call·token·USD에는 반드시 포함되어야 하고, `add-decoys`, full JSON repair, hard regeneration은 각각 새 full-question candidate slot을 소비해야 한다.
- `@ai-sdk/openai-compatible@2.0.56`의 `createOpenAICompatible`는 공식적으로 custom `fetch` middleware를 지원하며, 모든 chat `postToApi` 요청에 그 fetch를 전달한다. 그러므로 production prompt/schema/retry를 바꾸지 않고도 shared provider의 custom fetch 직전에 원자 lease를 잡는 것이 가능하다.
- 실행 전 남은 조건은 AsyncLocalStorage로 candidate/design/evaluation scope를 명시하고, 한 logical operation 안의 여러 physical response 중 실제 schema-valid 산출물을 만든 call만 producer로 확정하며, HTTP non-2xx·network error·parse 실패는 hash 없는 `no_candidate`로 종결하는 것이다. 이 연결과 직접 fetch 우회 차단의 적대 테스트가 끝나기 전에는 registry phase를 열지 않는다.
- 이 관찰은 local installed source와 현재 production call graph를 읽은 zero-call 결과다. API 사용량은 계속 **0/1,000**이다.

### O27. 과거 PREMIUM 어법 60산출물의 독립 재감사 최종값은 F 22 / C 38이며 A·B는 0이다

- 두 독립 평가자의 blind solve·V1~V5·C1~C5 판정을 제3 평가자가 43개 불일치 좌표 전부와 동의 문항 12개를 다시 읽어 확정했다. 최종은 F 22, C 38, B 0, A 0이고, 모든 validity 축을 통과한 문항도 38/60(63.3%)뿐이다.
- 60개는 독립 지문 60개가 아니라 같은 30지문의 2회 생성이다. 지문 cluster 기준 18/30(60.0%)에서 적어도 한 run이 fatal이었고, 두 run이 모두 fatal인 cluster 4개, 한쪽만 fatal 14개, 모두 nonfatal 12개였다. 반복 run의 fatal/nonfatal 일치는 53.3%에 불과하다.
- 저장 정답 자체가 불일치한 문항은 PG023, PG040, PG048의 3개다. PG023/040은 dash 내부 header+재개대명사 분석이 가능해 표시된 (A)가 필연적 비문이 아니고, PG048의 `stop to V`는 문맥 의미는 어긋나도 문법 구조는 정문이므로 모두 NO_ANSWER다.
- 역사 게이트는 60개를 전부 accepted 처리했으므로 fatal false acceptance가 22개다. 난이도 필드 불일치 10개는 일치하는 warning이 있었는데도 통과했고, 나머지 fatal 12개는 대응 validity signal조차 없었다. `accepted` 또는 과거 `ok`는 validity나 exam-ready craft의 증거가 아니다.
- run별 F는 첫 run 14/30, 둘째 run 8/30이었고 총 242 physical/logged calls, $5.144148였다. 문항당 평균 $0.085736을 쓰고도 B/A가 0이므로, 과거 사다리를 단순 재사용하거나 호출을 늘리는 것은 비용-품질 해법이 아니다.
- 재현 산출물은 `reviews/premium-grammar-60/adjudication/adjudication-final.json`, `.md`, `build-adjudication.mjs`에 고정했고 내부 assertion과 `node --check`를 다시 통과시켰다. 이번 판정은 API·DB 호출 없이 수행했다.

### O28. 기존 998-slot 배분표는 ‘최종 문항 수’와 ‘physical candidate slot’을 혼동해 그대로 실행할 수 없다

- PROTOCOL의 P1 150은 `25유형×2플랜×3난도=150` 최종 산출물을 전제하면서 동시에 150 candidate slot만 배정했다. 그러나 correctness gate 반려, outer retry, SDK retry, full JSON repair, PREMIUM add-decoys 재생성·repair는 최종 문항 하나 전에 여러 full-question physical call을 만들 수 있다. 첫 호출에서 전부 성공하지 않는 한 150 slot으로 150 최종 문항을 보장할 수 없다.
- 과거 PREMIUM 어법 60산출물의 call log를 다시 분해하면 answer-only 87회(실패·parse retry 포함, slot 0), full candidate 계열은 add-decoys 87회와 repair 68회로 총 155회였다. 즉 최종 60문항에 full-candidate opportunity가 약 2.58회/문항이었다. provider 내부 retry가 과거 로그에 완전히 잡히지 않았다면 실제 비율은 더 높을 수 있다.
- 따라서 P3/P4의 `n=60/arm` 주장도 240+240 slot만으로는 성립하지 않는다. slot을 최종 표본 수처럼 보고 부족분을 사후 top-up하면 1,000 상한과 선택편향을 동시에 위반한다.
- 수정 원칙은 각 phase를 **attempt-slot ITT budget**으로 사전 등록하고, 고정 passage queue와 arm 순서를 둔 뒤 그 budget 안에서 나온 parsed/accepted/rejected/no-candidate를 모두 결과로 보고하는 것이다. 최종 문항 표본 수는 확정값이 아니라 결과다. 필요한 `n>=60/arm`이 확보되지 않으면 확증이라고 부르지 않는다.
- main confirmatory power를 확보하려면 중복된 P3/P4를 하나의 type×plan×policy block 설계로 합치고, all-type sentinel·pilot·holdout·route에는 실제 attrition을 반영한 slot 상한을 따로 둬야 한다. 구체 배분은 mock transport 계측과 prospective micro-pilot의 관측 slot-per-output을 보기 전에 고정하지 않는다.
- 이 정정은 API를 쓰기 전에 이루어졌고 사용량은 계속 **0/1,000**이다.

### O29. corpus v2는 기계적 무결성 일부를 통과했지만 독립 적대 감사에서 실험 투입 불가 판정을 받았다

- fresh-eyes 감사가 저장 502행의 해시·source mapping, 125,751개 모든 쌍의 exact/near 분리, 새 후보 445개의 선택 당시 prior-use 0, blind packet 해시, DB SELECT-only를 독립 재계산해 통과시켰다. 즉 저장 바이트 자체가 임의로 깨진 것은 아니다.
- 그러나 queue 크기를 `target / 관측 pass rate`로 잡아 기대 통과 수만 target에 맞췄다. 작성된 `quota+10% certified reserve` 규칙의 목표인 G66/B66/dev 신규34/holdout 신규41에 도달할 확률은 낙관적 point rate에서도 각각 19.9%, 19.3%, 7.4%, 11.2%였다. 표본 확보를 주장할 수 없다.
- selector는 자기 실행 뒤 만든 `reviews/corpus-v2` blind packet 445개를 다음 실행에서 과거 노출로 다시 흡수했다. 그 결과 history unique text가 1,869→2,314, eligible이 1,650→1,203으로 변했는데 저장 verifier는 이를 발견하지 못했다. 입력 snapshot·as-of·code/Git hash와 derived-lineage 경계가 없다는 뜻이다.
- B panel은 저장본 우연상 143/143 official reconstructed blank였지만 selector hard gate가 아니었다. 자기오염 뒤 rerun에서는 143개 중 실제 빈칸 원형이 59개뿐인데도 성공을 보고했다. 일반 replacement 137개는 모두 repo였고, 최종 30 repo/30 DB-real 설계에서 dev DB20·holdout DB26 부족을 total count가 숨겼다.
- 따라서 v2는 감사 도구용 희생 calibration 외 사용을 금지하고, 두 평가자 감사도 HOLD한다. v3는 pinned input 재구축, 자기 산출물 비오염, blank provenance hard gate, split별 DB33+repo33 및 focus별66 certified 목표, one-sided 보수 pass-rate에서 `P(target attainment)>=0.95`인 strata queue, live drift/tamper fail-closed를 갖춘 별도 산출물로 만든다.
- 감사 원문은 `reviews/corpus-v2-audit/AUDIT.md`에 고정했고 SHA-256은 `8ec022ded02a7596bae014619384fefe8570fb11ba177787fa41c7f61272740b`다. API·DB write는 없었고 사용량은 계속 **0/1,000**이다.

### O30. custom provider fetch가 숨은 재시도와 별도 JSON repair를 모두 관측한다는 것을 zero-network probe로 증명했다

- `ai@6.0.99`와 `@ai-sdk/openai-compatible@2.0.56`를 실제 설치본 그대로 쓰되 `https://mock.invalid/v1`의 메모리 fetch만 연결한 6개 probe가 모두 통과했다. 기본 `maxRetries=2`에서는 HTTP 503과 network error가 각각 정확히 3번 fetch 경계를 통과했고, `maxRetries=0`은 1번이었다.
- malformed JSON 뒤 model repair는 별도 provider request였다. response를 clone해 원 호출과 repair 호출의 response id·prompt/completion token·`usage.cost`를 읽어도 SDK 본문 파싱은 유지됐다. 반면 outer `generateObject` usage에는 repair 사용량이 합산되지 않아 상위 callback만으로 비용을 복원할 수 없었다.
- AsyncLocalStorage는 SDK retry와 동시 operation 격리를 보존했지만, explicit child scope가 없으면 candidate generation과 JSON repair를 구분하지 못했다. candidate/design/evaluation 및 ladder 단계별 scope, pre-network atomic lease, post-parse disposition, clone promise 정산이 모두 필요하다.
- 현 production call graph의 경로 상한은 outer retry와 SDK retry·structured fallback·repair가 겹칠 때 top-level 요청당 물리 호출 21회다. 기대 호출 수가 아니라 우회·폭주 위험의 상한이며, production `atlasCloud`에는 아직 fetch hook이 없어 현재 계측이 된다는 뜻은 아니다.
- 재현 파일은 `probes/provider-fetch-boundary.probe.mjs`, 결과는 `probes/RESULTS.md`에 고정했다. 외부 API·DB·browser 호출은 0이고 캠페인 사용량은 계속 **0/1,000**이다.

### O31. 전 유형 공통의 ‘정답 하나’ 기준은 서술형에서 오히려 오채점을 만들므로 answer-space 계약으로 분리했다

- 기존 RUBRIC V2는 모든 유형에 “정답이 정확히 하나”를 요구했다. 이는 단일정답 객관식에는 맞지만, `CONDITIONAL_WRITING`, `SENTENCE_TRANSFORM`, `SUMMARY_WRITING`, `TOPIC_SENTENCE_WRITING`처럼 자연스러운 복수 동치답이 존재하는 유형에는 틀린 기준이다. model answer 하나와 exact-match를 품질로 착각하면 올바른 답을 오답 처리한다.
- V2를 객관식의 **선언된 정답 cardinality와 실제 정답 집합 일치**와 서술형의 **허용 동치답 집합·배제 경계·부분점수 계약**으로 분리했다. 폐쇄형 서술, 개방형 서술, 교정형마다 blind auditor가 최소 3개 정답 예시와 3개 경계 오답을 만들어 실제 채점 표면을 검증하도록 했다.
- C2/C3도 선지 수 중심 정의에서 평가요소 의도 밀도와 실질 변별력으로 일반화했다. 서술형의 아름다움은 답을 길게 쓰게 하는 것이 아니라 원문의 핵심 의미와 목표 형식·조건을 동시에 운용하게 하면서 자연 동치답은 받아들이는 데 있다.
- `TYPE-AUDIT-MATRIX.md`에 활성 영어 25유형 전부의 치명 조건, beautiful 조건, 대표 shortcut, 결정론 검사, 독립 의미 감사를 고정했다. 이 행렬은 **평가 계약**이며 생성 프롬프트에 전부 복사하지 않는다. 어떤 규칙을 모델에 노출할지는 constraint-density 실험 요인으로 남긴다.
- 이 정정은 API 호출 없이 이루어졌고 캠페인 사용량은 계속 **0/1,000**이다.

### O32. budget guard v3는 독립 공격 검수에서 실제 결함 4계열을 고친 뒤 25/25를 통과했지만 API 실행은 여전히 차단이다

- fresh-eyes 감사에서 (a) `unknown + usageFinal=false`인 미정산 호출이 batch 종료를 허용하던 결함, (b) `status` 같은 read-only CLI가 canonical SQLite를 암묵 생성하던 결함, (c) 한 open batch의 실제 비용 초과가 phase commitment에서 숨겨져 sibling batch 호출을 허용하던 결함, (d) 예약보다 많은 multi-output을 낸 뒤 다른 batch가 계속 호출할 수 있던 결함을 직접 재현했다.
- 수정 후 미정산 billing은 finalization을 막고, final usage/provider request ID는 reconciliation에서 downgrade/교체할 수 없다. canonical DB는 오직 명시적 `init --apply`만 생성하며 missing/empty/partial schema는 fail-closed다. open batch는 `max(allocated USD, effective observed USD)`를 phase commitment로 잡고, output overflow는 캠페인 전체의 후속 reservation/call을 영구 차단한다.
- 두 process가 마지막 pre-network candidate slot을 동시에 잡는 적대 테스트도 추가했다. 정확히 하나만 `in_flight`가 되고 loser는 provider callback 전에 실패한다. 전체 harness 25/25, isolated strict tsc, ESLint가 통과했고 canonical DB는 여전히 존재하지 않는다.
- 그러나 이 PASS는 로컬 회계 불변식에 한정된다. 현재 `callKind`, expected/observed candidate cardinality, output hash, reserved USD가 caller 주장이고, production custom fetch/ALS 경계와 OBS-001 provenance(requested/effective/served model, prompt/schema/gate/ladder hash)가 없다. audit event chain도 mutable table의 state commitment는 아니다.
- 따라서 API readiness는 **FAIL/BLOCKED**다. 감사 원문은 `reviews/harness-v3-audit/AUDIT.md`, SHA-256은 `31b082a4ea854119d73541ed8764a8aabd53a103f8bd12946ff800d2a6980caa`로 고정했고 사용량은 계속 **0/1,000**이다.

### O33. 새 990+10 배분 초안은 plan별 candidate attrition과 ‘확증 n’의 단위를 분리한다

- 기존 998표를 대체할 비실행 초안은 최대 실행 slot 990과 영구 비실행 안전 여백 10으로 나눈다. A1 전 유형 현행 core sentinel 100, A2 어법·빈칸 4-profile screening 200, A3 holdout paired 600, A4 전 유형 fast-route winner sentinel 75, A5 경계 robustness 15다. arithmetic verifier가 426 logical assignment와 990+10=1,000을 재계산해 통과했다.
- A3는 유형별 60개 독립 passage를 STANDARD30/PREMIUM30으로 층화하고 같은 passage-plan에 CURRENT/WINNER를 짝짓는다. 따라서 `n=60/policy/type`의 plan 평균 주효과는 가능하지만 plan별은 `n=30` 탐색이다. 60을 plan별 60처럼 부풀리지 않는다.
- assignment당 ceiling은 STANDARD 2, PREMIUM 3 candidate opportunity다. 같은 plan 안 CURRENT/WINNER에는 같은 ceiling을 적용하지만 서로 다른 plan의 raw yield를 동일 예산으로 오인하지 않는다. `no_output`, cap exhaustion, parse 실패는 ITT ship-ready 실패로 남긴다.
- A2는 constraint density를 minimal/exhaustive 이분법으로 두지 않고 현행, compact positive certificate, site/slot+intent ledger, 역할분리/candidate selection의 4 profile을 balanced-incomplete passage schedule로 본다. 다만 profile당 type 기준 plan 합산 n=10뿐이므로 승자 screening 전용이며 품질률로 발표하지 않는다.
- A1/A4는 25유형×2플랜을 모두 덮지만 sentinel이고, 전 유형률이나 3난이도 full factorial의 증거가 아니다. A4 난이도는 frozen balanced schedule로 표면 회귀를 넓게 찾고, focus 난이도 공예는 A2/A3/A5에서 본다.
- 미사용 phase slot은 결과를 본 뒤 top-up하지 않고, 비실행 10개도 재배분하지 않는다. 아직 prompt/policy hash, corpus assignment, cost/call cap, 수치 winner threshold, provider/parser audit가 비어 있으므로 이 문서는 canonical registry가 아니며 사용량은 계속 **0/1,000**이다.

### O34. 전 유형 zero-call census에서 STANDARD 24유형이 무관한 전 유형 contract tail을 함께 받는 구조를 확인했다

- 실제 production builder·type prompt·quality rubric·candidate block·AI schema를 활성 영어 25유형에 호출해 고정 KILLER 지문에서 문자 수를 재현했다. live diversity, 교사 지시, saved analysis, private final checklist는 제외했으므로 하한이다. 40~80자 공통 지시 모순을 고친 뒤 재측정한 STANDARD는 35,341~61,784자(중앙 39,375), PREMIUM은 6,751~54,568자(중앙 10,786)였다.
- `buildQuestionGenerationPromptContract("STANDARD", typeId)`의 유형 필터 map에는 현재 `GRAMMAR_ERROR`만 있다. 나머지 24유형은 `CONTRACT_TYPE_FULL_TAIL`로 fallback해 빈칸·순서·삽입·요약·어휘·무관문장·어법 등 다른 유형 지시까지 모두 받는다. 대표 빈칸은 STANDARD 45,300자, PREMIUM 16,927자였다.
- Git blame상 이 fallback은 2026-07-07 commit `3f155ca68`에서 “GRAMMAR_ERROR만 먼저 필터, 나머지는 바이트 호환 full tail”로 명시 도입됐다. 7/14 품질 대공사 commit `448488ca`는 교사 포인트 블록을 추가했지만 이 fallback을 바꾸지 않았다. 따라서 7/15 최신 STANDARD 비어법 표본을 해석할 때도 실제 적용된 현행 구조다.
- 어법은 이미 type-scoped contract인데도 하한이 STANDARD 61,784자/PREMIUM 54,568자로 가장 컸다. target candidate block 30,093자(전체 PREMIUM 하한의 55.2%), type prompt 13,986자(25.6%), schema 4,672자이고 directive lexeme가 89개였다. final checklist가 빠진 값이라 실제 표면은 더 크다.
- 이 관찰만으로 짧은 prompt가 낫다고 결론내리지 않는다. 무관 규칙 제거가 비용·주의 분산을 줄일 수도, 우연한 generic 도움을 제거할 수도 있고 model×schema×plan과 상호작용할 수 있다. 따라서 A2에 legacy full-tail, type-scoped tail, compact positive certificate, site/slot+intent artifact를 서로 다른 hash profile로 넣고 같은 passage/plan/model/budget에서 비교한다.
- production default bytes를 바꾸지 않는 opt-in `force_type_scoped` 경로를 추가해 focus counterfactual을 계산했다. 이미 scoped인 어법은 STANDARD 61,784자로 동일했고, 빈칸은 45,676→29,141자(-36.2%)였다. unknown type은 추측하지 않고 fail-closed이며 default legacy snapshot 회귀가 통과했다.
- 갱신 결과 JSON은 반복 실행이 결정적이며 SHA-256 `a5c9ca9d8f2d68bf5afcab97cfad042099e3a2644e3d692d78890e80ef356831`다. 직접 prompt-contract와 공통 marking-rubric 원본 해시도 내장했다. 상세는 `offline/PROMPT-CONSTRAINT-CENSUS.md`이며 외부 호출은 0, 캠페인 사용량은 계속 **0/1,000**이다.

### O35. corpus v3는 기준을 지킨 채 실제 공급 부족을 검출했고, 따라서 생성 실험을 열지 않았다

- v2 적대감사 결함을 분리한 pinned v3는 과거 감사 stratum별 one-sided 95% Clopper–Pearson 하한과 목표 PASS 도달확률 95%를 동시에 요구했다. 17/17 단위·적대 테스트, pinned 재빌드, live code/repo/history/DB drift가 모두 0 findings로 통과했다.
- 그러나 빈칸 KILLER는 `originalType=빈칸추론`·high confidence·실제 blank reconstruction을 모두 만족하는 독립 후보가 59개뿐이었다. 목표 PASS 66보다도 7개 적고, 보수 큐 262개보다 203개 부족하다. mere tag로 넓히거나 노출 지문을 재사용하지 않았다.
- 전역 DB general 미사용 적격 풀도 154개뿐인데 dev DB 큐 158, holdout DB 큐 815가 필요했다. holdout의 과거 PASS가 4/30이라 보수 하한이 4.69%까지 내려간 결과다. DB/repo를 평균내거나 목표를 줄이지 않았다.
- selector는 `HARD_FAIL_SUPPLY_SHORTAGE`로 끝났고 operational manifest·blind packet·canonical budget store를 만들지 않았다. 공개 preflight SHA-256은 `e4fc9129c714d1b167b2f5fa66d16a056cc9af7b1aad3323096986eee2d88ebe`다. v4는 새 독립 공급, 별도 estimand를 가진 power 기반 목표 재설계, 또는 DB stratum pilot 중 하나를 새로 사전등록해야 한다.

### O36. 공통 `surroundingText 40~80자` 절대 규칙이 어법 스키마와 정면 충돌했다

- 공통 marking rubric은 모든 유형의 `surroundingText`를 정확히 40~80자로 강제했지만 `GRAMMAR_ERROR` 응답 스키마는 40~120자이고 KILLER 지시는 진짜 주어~동사·선행사~관계절 같은 장거리 의존 전체를 보존하라고 요구했다. 모델은 80자에서 문맥을 잘라 스키마·품질 지시 중 하나를 어길 수밖에 없었다.
- PREMIUM 공통 rubric과 STANDARD compact rubric 모두 유형별 스키마 길이를 우선하도록 바꾸고, 어법은 보통 40~120자이며 장거리 판단에 필요하면 80자를 넘기도록 명시했다. 다른 유형에는 이 예외를 확장하지 않는다.
- default prompt 구조나 모델 조합을 바꾸는 실험 처치가 아니라 내부 계약 모순 제거다. byte-compat/type-scope/unknown-type fail-close/길이 모순 회귀 5/5와 targeted ESLint가 통과했고, zero-call census는 이 변경 후 값으로 다시 고정했다.

### O37. 990+10 산술은 맞지만 assignment당 1/2/3-slot 초안은 현행 production policy를 절단한다

- fresh-eyes call-graph 감사에서 ordinary `generateQuestionObject`는 outer 최대 3회 × AI SDK hidden HTTP 최대 3회라 repair/fallback 전에도 최대 9 physical candidate 기회가 있음을 확인했다. fallback/repair 분기는 경로별 12/18/21회까지 갈 수 있고, 상위 runner의 strict·relaxed·salvage 및 PREMIUM 어법 사다리도 별도다.
- 따라서 초안의 STANDARD 1~2, PREMIUM 2~3 candidate ceiling은 비용 통제에는 쓸 수 있어도 현행과 동일한 pipeline이 아니다. 같은 cap으로 CURRENT/WINNER를 비교하면 ‘고정 budget 아래 capped policy 효과’일 뿐 production parity나 현재 품질률이 아니다. 초안은 authorization 0·`FAIL_BLOCKED`로 수정됐다.
- A2의 기존 balanced-incomplete 문구는 `v=4,b=10,k=2,r=5`에서 `lambda=5/3`이라 수학적으로 불가능했다. 같은 80 assignments를 type×plan별 5 passages에 4 profiles를 모두 실행하는 complete-block screen으로 고쳤다.
- A3 type별 60 matched pairs는 10%p 개선의 exact McNemar power가 discordance 20~40%에서 30.8%→16.9%뿐이다. fatal 0/60도 one-sided 95% 상한이 4.87%다. 따라서 n=60을 관성적으로 ‘충분’이라 부르지 않고 MDE·alpha·multiplicity·inconclusive rule을 먼저 고정한다.
- 감사 문서 SHA-256은 `991d8c679c91a75caed3464df7d63fdc289898065f9dc432a08e4beadb5ec256`이며 verifier는 산술/비실행 불변식만 PASS하고 `EXECUTION_READINESS=FAIL_BLOCKED`를 명시한다. 외부 호출은 0이다.

### O38. ‘never-fail’ 최후 구제에 비문·부자연스러운 선지를 살리는 코드가 남아 있었다

- `blank-awkward-correct-option`, `blank-awkward-option`은 생성된 ‘rational tools’, `can be not`, 중복 frame 같은 비자연·비문 신호인데도 SHIP_FIRST에서 warning으로 즉시 강등되고 SALVAGE에서도 notice만 달아 재승인할 수 있었다. `irrelevant-inserted-ungrammatical`도 SALVAGE 허용 목록에 남아 있었다.
- 문맥 왼쪽이 `by`인데 option이 다시 `by ...`로 시작하거나 `ways in which`를 이중 삽입하는 경우는 미관이 아니라 실제 치환 문장의 syntax 파손이다. 이를 `blank-option-slot-syntax`로 분리해 relaxed에서도 차단하고 salvage/ship-first에는 넣지 않았다.
- lexical awkward 두 코드도 사용자가 요구한 최소선(비문·부자연스러운 visible English 없음)에 따라 SHIP_FIRST/SALVAGE에서 제거했고, 무관문장 비문도 SALVAGE에서 제거했다. 이는 평균 재생성을 늘리는 정책이 아니라 검출된 fatal 후보를 notice로 출하하지 않는 무결성 경계다.
- 관련 회귀·salvage 정책·빈칸 계약·slot restoration 36/36과 targeted ESLint가 통과했다. 다만 코드 이름만으로 다른 완화 목록도 안전하다고 가정하지 않고, 전 유형 policy severity를 별도 fresh audit 중이다.

### O39. 공유 OpenRouter fetch 경계의 Phase A는 독립 감사에서 7개 결함을 고친 뒤 23/23을 통과했지만, 실제 호출은 여전히 차단한다

- 최초 구현은 no-scope exact passthrough, 실제 wire model/endpoint/schema/prompt/body hash, pre-fetch lease, response/error/clone 비용 증거를 만들었지만 fresh-eyes 감사에서 escaped ALS 수명주기, 동일 operation 병렬 lineage 경쟁, lease 전후 mutable request TOCTOU, trailing-slash/query endpoint 우회, controller `TypeError`의 SDK network retry 오분류, forged root parent, observer 간 증거 억제·임의 error 분류 저장을 발견했다.
- 루트·자식 scope admission을 명시적으로 닫고 in-flight fetch/clone을 drain하며, 동일 operation의 동시 provider fetch를 fail-close하고, 활성 연구 요청을 controller await 전에 snapshot한다. endpoint는 전송 URL의 path/query 의미를 그대로 보존하며, controller 오류는 비재시도 경계 오류로 감싼다. root parent는 null만 허용하고 오류 name/code는 좁은 allow-list만 저장한다.
- 실제 AI SDK 기본 `maxRetries=2`가 in-memory transport에서 물리 3회 lease/관찰로 잡히는지까지 포함한 zero-network 테스트 23/23, 전체 `tsc --noEmit`, 대상 ESLint가 통과했다. 경계 코드 SHA-256은 `307c6e48b06f5532f094cfd4d41d8fb23ad43f640add8bc067cc001a24674b51`, 테스트는 `22e529fbcc08142735cdec9ab779dd5e5d41a76ea648955352e8af1eb4a3b048`, 감사 반영 문서는 `c658a55a23733a834c559a4738abeda38a11d51fac78c966939e7ff85192151f`다.
- 판정은 **Phase B 구현 GO / 실제 OpenRouter 호출 NO-GO**다. 원자적 capped-slot controller, process-independent ID 유일성, endpoint/model/plan/purpose/stage 및 parser attestation registry, 모든 repair/fallback/ladder child scope, parser disposition, clone·lease 정산, 대체 transport 우회 감사, route/browser parity가 끝나기 전에는 registry를 열지 않는다. API 사용량은 계속 **0/1,000**이다.

### O40. 현재 프로덕션은 HEAD 커밋 자체가 아니라 `gitDirty=1`인 CLI 파일 스냅샷이다

- Vercel deployment API에서 production `dpl_CKkd1eiFq2DeEidwSxQpFSgDm4ZD`의 metadata Git SHA가 `467c6d107137a91088d3eba1620ba4036a63d709`, branch가 `20260714jooyeon`임을 확인했다. 동시에 source는 `cli`, `gitDirty`는 `1`이므로 이 SHA만으로 실제 배포 소스를 재현할 수 없다.
- Vercel의 source file tree에서 문제 생성 route·공유 LLM/provider·quality gate·trigger·관련 dependency 69개 파일의 원시 SHA-1 UID를 고정하고, 현재 worktree 및 각 파일의 전체 Git 변경 이력(LF/CRLF만 별도 취급)과 대조했다. 58개는 현재와 exact, 11개는 현재와 다르지만 과거 commit bytes로 전부 복원 가능했고, 배포 후 로컬에만 생긴 파일은 `atlas-research-fetch-boundary.ts`와 blank `seam.ts` 두 개다. unmatched 배포 파일은 0개다.
- 중요한 drift에는 production `constants.ts`·blank inference·grammar combo가 7월 7일 또는 그 이전 내용이고, `prompts.ts`·question repair·run 정책·prompt contract·atlas provider 등은 7월 14일 quality commit 내용인 혼합 상태가 포함된다. 따라서 6월/7월 DB 문항이나 현재 로컬 replay를 평가할 때 “HEAD가 같으니 동일 코드”라고 결론내리지 않고, 생성 시각별 실제 배포의 파일 UID를 cohort provenance로 사용한다.
- 고정 index SHA-256은 `aae88590de597fb6d19c2884493337d4a97dcac43da654e956d9926142fa3fa1`, 결정론 rebuild report는 `74a5a3c09f5dddf25f2acfc87d7ff57b0c14f646df78959a88aa030eaf2db636`, 설명 문서는 `30f346331b40f4864163e69bbf65b1e063538da89623dfc1ccc07e9a07c12806`다. 이 확인에도 모델/API·DB write는 0이며 캠페인은 **0/1,000**이다.

### O41. 과거의 “top-level 최대 21회” 추정은 전체 호출 그래프를 누락했고, 현재 구현에는 전역 유한 물리 호출 상한이 없다

- `generateQuestionObject` 한 번은 wrapper outer 3회 × 각 outer에서 structured SDK 최대 3회 + prompt-JSON fallback 최대 3회 + fallback JSON repair 최대 3회로 기본 최악 27 fetch다. 강제 JSON 경로도 18 fetch다. PREMIUM 어법 사다리는 answer-only/add-decoys/repair의 최대 9 stage × stage당 최대 9 fetch로 81 fetch이며, give-up 뒤 legacy generation·candidate repair·solver까지 이어질 수 있다.
- 이 원자 상한 위에 strict attempt, relaxed/rescue, grammar-scarce, universal salvage가 다시 곱해진다. 현재 fast `count=1`과 기본 retry 값에서 단일 문항 최악 envelope는 STANDARD KILLER 빈칸 648, STANDARD 확장 어법 675, PREMIUM 사다리 어법 432 physical fetch다. 평균이나 예측값이 아니라 즉시 실패가 반복되는 경로까지 포함한 제어 상한이다.
- 더 근본적으로 `GEMINI_QUESTION_MAX_RETRIES`, `GEMINI_QUESTION_EMPTY_RESULT_MAX_ATTEMPTS`, legacy direct count, auto plan 길이·item count, 동시 fast 요청 합계가 서버에서 유한하게 제한되지 않아 캠페인 전체 절대 상한은 없다. 270/540초 deadline은 빠른 실패 호출 수를 제한하지 않으며 Trigger crash window도 재실행을 만들 수 있다.
- 기존 usage event는 SDK hidden retry·실패 call·fallback continuation repair·PREMIUM repair 사용량 일부를 잃으므로 candidate/physical/USD cap의 증거가 아니다. 실제 연구 controller는 모든 fetch 직전 원자 lease, unknown-cost 최악 정산, 모든 repair/fallback/ladder/solver child lineage, bounded retry/input attestation, assignment 전체 worst-case envelope admission을 요구한다. production policy를 중간에서 잘라놓고 parity라 부르지 않는다.
- 감사 JSON SHA-256은 `6d4bc14eed634574b77bd27e33fd668d0450714a5535eed6ab2600ed2cd15066`, 감사 문서는 `7b2e7f9d59f311b1e031cc370476364b772c588a794c519b7b8d1be32cff563d`, verifier는 `49fb58323ef2255ec3c6f52fa3121372b5515f9f4994d550408b3d7b04fc66b9`이며 `FAIL_BLOCKED`를 재현했다. API 사용량은 여전히 **0/1,000**이다.

### O42. 25개 유형의 notice/salvage 코드 102개를 전수 감사하자, 3개는 즉시 차단·10개는 fatal/craft 분리가 필요했다

- 독립 감사에서 정책 노출 9유형과 비노출 16유형을 모두 추적했다. notice-eligible 합집합 102개 중 87개는 해당 코드만으로 정답 무효를 확정할 수 없는 craft 신호였고, emitter가 없는 stale 2개, 즉시 완화 제거 3개, 동일 code가 fatal과 craft를 섞은 split-required 10개로 분류됐다. 코드 이름이 불편해 보인다는 이유만으로 87개를 wholesale harden하면 정상 문항 재생성·비용을 크게 늘린다.
- `blank-paraphrase-subject-slot-mismatch`는 정답을 넣은 완성문 주어/계사 frame 자체를 깨고, `topic-option-language`와 `implied-meaning-option-language`의 error branch는 명시된 `optionLanguage=en` 위반이다. 세 코드를 SHIP_FIRST/SALVAGE에서 제거하고 relaxed blocking을 유지했으며 관련 회귀 54/54가 통과했다.
- 반면 `grammar-keypoint-choice-mismatch`는 nonexistent label이라는 학생-facing V4/V5 오류와, 설명은 맞고 `pointCode`만 틀린 metadata drift를 한 코드로 낸다. 과거 replay에서 109회 관측돼 통째 차단하면 비용 폭증 위험이 있다. sentence-order empty/label contamination, blank residual answer leak, summary task direction, 용어 실제 오류/register, 요약 비문/regex false positive 등도 같은 이유로 새 고정밀 fatal code를 분리해야 한다.
- 감사 판정은 아직 **BLOCK**이다. inventory SHA-256은 `89baf2d3ea4fd6804d9d2e822fb24e03987df467f2e4584a6e2f3a08940e8b8a`, 문서는 `e3d0731723eedf43847d08c2e6e93e7502646eb8a9481a8df7050ebed863d6c4`, 스크립트는 `c4c0c06a9eccbabe35316f7bb13b7a8a30424c9b93facb7361a9fe4afa9f13f7`다. 10개 split의 정밀도 회귀와 offline replay가 끝나기 전에는 PASS로 바꾸지 않는다.

### O43. corpus v4의 공급 부족 수치는 재현됐지만, `asOf`와 provenance hash가 실제로 스냅샷을 고정하지 못했다

- 독립 구현은 strict blank 59, current committed 154, automatic-clean committed 248 중 v3 대비 net-new 0, M1 net 86, ExtractionItem net 19, linked-blank official-type-tagged DRAFT 3을 모두 재현했다. blank queue 262 대비 203, disjoint DB queue 973 대비 819의 부족도 동일하며, posting cap 200을 없앤 민감도 검사에서 숨은 exact/near 누수는 0이었다. 따라서 **현 로컬 공급으로 기존 v3 확증 설계를 열 수 없다는 결론은 유지**한다.
- 그러나 v4의 `asOf`는 DB 쿼리에 한 번도 적용되지 않는다. `2000-01-01`을 넘긴 read-only dry-run도 현재 수치 59/154/203/819를 그대로 반환했다. live drift PASS는 ‘지금 DB와 같다’는 뜻이지 해당 시각 상태를 복원했다는 뜻이 아니다.
- `codeHash`도 v4 폴더 안 5개 TS만 묶고 실제 import한 selector/v2/v3 파일 5개를 빠뜨렸다. 그 파일들이 모두 untracked라 Git SHA로도 보완되지 않는다. private semantic snapshot은 행 변조를 막지만, 미래에 완전한 알고리즘을 재구성하는 provenance는 아니다.
- `officialTraceable`은 sourceRef·원본 파일·rights 기록을 요구하지 않는 type tag였고, net M1/ExtractionItem/Result 전체의 sourceRef 또는 originalFile 보유는 0이었다. linked blank 3개도 전부 DRAFT·rights 미확인이다. M1의 crossSource 4건은 실제로 within-M1 near duplicate라 라벨도 과장됐다.
- 판정은 **immutable point-in-time snapshot FAIL/BLOCKED, shortage conclusion CONFIRMED**다. 감사 문서 SHA-256은 `eb2f176d694afafe9830ffe9265ecd3e9d289dc0f4b46d8f9b81f12286de843d`, 독립 verifier는 `de682fc04957b5177ad8740a02775ffb68c69dcf4c7c768e5fcf9cd7f12f3d74`다. 시간 의미를 `capturedAt`으로 정직하게 바꾸고 DB extract hash와 묶으며, transitive dependency hash·evidence-strength 라벨을 고치기 전에는 manifest를 만들지 않는다. API 사용량은 **0/1,000**이다.

### O44. O40의 69개 배포 파일은 수치가 맞지만 production dependency snapshot은 아니었다

- fresh-eyes 감사가 Vercel 원문 69개를 다시 내려받아 raw SHA-1 UID 69/69, 당시 분류 58 current-exact/11 history drift/2 local-only/0 unmatched, drift commit과 기존 네 artifact hash를 모두 재현했다. 따라서 O40의 좁은 집합 내부 산술은 맞다.
- 그러나 기존 `isRelevant`는 수작업 prefix predicate였다. **배포 당시 원문**의 정적 local import를 따라가자 집합 밖 직접 dependency 42개·edge 96개가 나왔고, 재귀 폐쇄는 240개 중 171개가 index에 없었다. question schema/postprocess/type settings/feature flag/point catalog/cost/credit 등 실제 동작을 바꾸는 파일도 포함된다.
- UID는 content identifier일 뿐 archive가 아니다. 기록 당시 `CURRENT_EXACT`였던 `run-question-generation-helpers.ts`와 sentence-insert validator 두 파일은 Git raw/LF/CRLF history 어디에도 배포 UID가 없어, mutable worktree가 바뀐 뒤에는 기존 index만으로 원문을 장기 복원할 수 없다. 현재는 Vercel API에서 회수 가능하지만 그것을 영구 보존으로 간주하지 않는다.
- 따라서 O40의 ‘관련 dependency 69개’는 **narrow hand-selected subset**으로 정정한다. 배포 원문 기반 import closure manifest, Git으로 복원 안 되는 raw content-addressed bundle, runtime config/data/Prisma/generated source, Trigger worker version을 추가 고정하기 전에는 production-identical cohort provenance로 쓰지 않는다.
- 판정은 **FAIL_SELECTION_INCOMPLETE**다. 감사 SHA-256은 `e704fda591dcbb83fa1ee5998df4de61f509a3187fa34aeca09eee28af132b56`, verifier는 `6c3f7debc6dfb2d29ede7eb3b02fe8c7b630f0cfa249d510721cd35522b10f62`, live closure manifest는 `9afb6b6d75273a66187c917027a767689a42c701a0e52cff6c01a071841a7cdb`다. 모델/OpenRouter/DB write/production mutation은 0이며 캠페인은 **0/1,000**이다.

### O45. corpus v4의 무결성 결함은 고쳤지만, 공급 부족이라는 수학적 차단은 그대로다

- `asOf`라는 거짓 역사 시점 주장을 제거하고 실제 DB 읽기 시작·종료 시각과 `capturedAt`을 기록했다. 호출자가 `--as-of`나 `--captured-at`을 주면 이제 명시적으로 실패한다. 이 아티팩트의 시간 의미는 **현재 상태 read-only capture**이며 transaction snapshot이나 과거 복원이 아니다.
- DB extract와 정렬된 record set을 각각 해시하고, 정적 import 폐쇄 16개·동적 grammar-drill JSON 126개·조사 카탈로그 4개·Prisma schema 1개·package/lock 2개·v3 private anchor 1개 등 총 150개 입력의 파일별 SHA-256·크기·Git 상태를 고정했다. dependency manifest SHA-256은 `ddb235f236839f95bd8cd09fbfe624216ebb348ecdcc83a4d061ab68b507e0a8`이다.
- 과장된 `officialTraceable`은 `officialTypeTagged`로 바꾸고 sourceRef/original-file locator 보유를 별도 집계했다. M1의 4건도 선행 source와의 중복이 아니라 M1 내부 근접중복으로 수정했으며, 저장·승격 계보를 `SAVED_PASSAGE_LINKED`와 `NONE`으로 드러냈다.
- 제가 동일 명령을 다시 실행해 단위 테스트 9/9, 전용 TypeScript, ESLint, pinned rebuild, live DB/input drift를 모두 통과시켰다. semantic snapshot은 `5346734a689d67aaa425daff3b17c3a7b910b741f25e7f8a2e1c79cfac0d01f6`, DB extract는 `aa692b32fa8aa381d682b7980e5530bb5ec2962e88dac1e50b3d88fc9dc0b86b`, public inventory는 `e989e508c508ab7c11dc10f1693defab3d4145617a023737f588364e5e3864f7`다.
- 그러나 strict blank 59개와 committed DB eligible 154개, blank 순증분 부족 203개와 DB 순증분 부족 819개는 그대로다. 따라서 무결성 교정이 표본 공급을 만들어낸 것은 아니며 operational generation manifest는 계속 만들지 않았다. API·모델·브라우저 호출과 DB write는 0이고 캠페인은 **0/1,000**이다.

### O46. Phase B controller의 단위 테스트 통과는 실제 캠페인 허가가 아니었다

- custom-fetch 경계와 초안 controller/ledger는 zero-network 테스트 26/26·25/25, 전체 TypeScript와 대상 ESLint를 통과했다. exact wire attestation, fetch 전 SQLite lease, SDK hidden retry 포착, 실패 후보 슬롯의 영구 소비라는 원자 primitive는 유효하다.
- 그러나 fresh-eyes 감사는 **BLOCK**을 냈다. production 생성 호출부가 scope·child lineage·parser disposition을 전혀 설치하지 않고, controller는 물리 호출 하나씩만 예약하므로 assignment 도중 cap이 production retry 정책을 잘라 selection bias를 만든다.
- 고정 exact body hash만으로는 부모 출력에 의존하는 continuation·repair·solver·ladder 자식 prompt를 사전 등록할 수 없다. response/clone/parser state는 memory-only라 crash 뒤 복구할 수 없고, caller가 제출한 normalized candidate는 캡처된 response body나 frozen parser artifact와 암호학적으로 묶여 있지 않다.
- durable ledger에도 registry/entry, exact wire와 provenance, parent physical call, HTTP/body/served-model/provider/raw-cost 증거가 빠져 있다. stage transition·entry별 횟수·controller-owned close/recovery도 없고, 가격 snapshot과 overhead는 hard upper bound로 증명되지 않았다.
- 동시에 callgraph verifier가 현재 `question-repair.ts`의 source hash drift에서 실패해 기존 648/675/432 envelope도 live tree admission 근거로 바로 쓸 수 없다. 감사 문서 SHA-256은 `56508ddcf924dfb98028c135698a8e87c88fbd7aad62568ebfc1c17fc37009ef`다. 위 결함을 고치고 2차 독립 감사를 통과하기 전 실제 provider는 계속 **NO-GO**, API 사용량은 **0/1,000**이다.

### O47. Vercel production의 허용목록 환경변수는 현재 요청한 Flash/Pro·thinking-off 기본값으로 해석된다

- production 환경을 `vercel env ls`와 일시적인 `vercel env pull`로 read-only 확인하되, 문제 생성과 관련된 비밀이 아닌 허용목록 10개만 파싱하고 원시 출력은 억제했다. 임시 env 파일은 즉시 삭제했고 API key·token·그 밖의 이름이나 값은 어떤 아티팩트에도 남기지 않았다.
- `GEMINI_QUESTION_MAX_RETRIES`, `GEMINI_QUESTION_EMPTY_RESULT_MAX_ATTEMPTS`, `OPENROUTER_STANDARD_MODEL`, `OPENROUTER_GEMINI_REASONING_EFFORT`는 이름은 존재하지만 값이 빈 문자열이라 코드 fallback을 탄다. 나머지 모델/reasoning override 6개는 absent였다.
- 현재 로컬 fallback 해석상 STANDARD는 `google/gemini-3.5-flash`, 일반 PREMIUM과 PREMIUM 어법 사다리는 `google/gemini-3.1-pro-preview`, Gemini reasoning은 `enabled=false/effort=none/exclude=true`, wrapper retry와 empty-result attempt는 각각 2다. 즉 사용자가 요구한 모델 조합과 thinking-off가 env 차원에서는 맞다.
- 이 결과는 배포 dirty source가 현재 로컬 fallback 코드와 동일하다는 증명은 아니다. 그 문제는 O44의 배포 원문 closure/archive와 별도로 닫아야 한다. 허용목록 attestation SHA-256은 `92f551ccec6a4f188cb04246d48c212d8d328754d11630160633b0e5adaa0c48`이며 모델 호출·DB write는 0, 캠페인은 **0/1,000**이다.

### O48. env가 thinking-off여도 PREMIUM 어법 사다리의 코드 내부 `low` 재시도가 사고를 다시 켜고 있었다

- O47의 환경 해석만으로는 충분하지 않았다. `grammar-premium-ladder.ts`가 최초 400 응답 뒤 `reasoning_effort: "low"`를 넣어 재호출하는 숨은 fallback을 갖고 있어, 기본 Gemini thinking-off 계약과 충돌했다.
- 이 fallback을 제거하고 동일한 thinking-off 설정을 유지한 JSON parse 재시도만 남겼다. 정적 불변식 테스트는 PREMIUM 어법 경로에 `low/medium/high` 하드코딩 reasoning fallback이 다시 들어오지 못하게 한다. Atlas Gemini 기본 요청의 `enabled=false/effort=none/exclude=true` 회귀와 함께 17/17을 통과했고 대상 ESLint·전체 TypeScript도 통과했다.
- 그 결과 PREMIUM 어법 사다리의 stage당 fire-once 분기가 3개에서 2개로 줄어, 기존 계산식의 사다리 원자 상한은 81에서 54 physical fetch로 내려간다. 다만 O41의 과거 callgraph FAIL 산출물은 당시 소스의 불변 기록으로 보존하며, 전체 경로 상한과 controller admission은 새 pinned source로 다시 계산하기 전까지 갱신됐다고 주장하지 않는다.
- 동시에 빈칸 응답 스키마가 해설을 `4단 구조: ①…④`로 요구하면서 validator는 같은 원형숫자 단계 서술을 fatal로 막는 모순도 제거했다. 스키마는 `먼저/이어서/따라서`를 쓰고 ①~⑤는 실제 선지 인용에만 쓰도록 바뀌었다. API 사용량은 계속 **0/1,000**이다.

### O49. 배포 원문 폐쇄는 245개 파일로 재구성됐지만 Trigger·컴파일 산출물의 바이트 동일성은 별도 미증명 경계다

- O44의 수작업 69개 집합을 폐기하고 Vercel raw source 4,410개에서 route/provider/Trigger/config의 정적 local import를 재귀 추적했다. 최종 폐쇄는 245개 파일·722개 local edge이며 type-only 110, external 98, unresolved/ambiguous/computed local ref는 모두 0이다.
- Git raw bytes로 94개, CRLF 정규화까지 허용해 147개를 추가 복원할 수 있었다. Git에 없는 것은 4개 파일·4 unique blob·58,036 bytes뿐이며 private content-addressed archive로 고정했다. 오프라인 verifier가 모든 byte/UID/graph를 재구성했고 secret-pattern inventory와 공개 아티팩트 교집합은 모두 0이었다.
- closure manifest SHA-256은 `9a3364beaf64fa205e8226a2c5328e4bd6dfc967dd72b3b4430677dd71947124`, verification report는 `ebad6dcd40d7ecace515678319878a91cd61262f88ce965bbc769e7b361fa456`, private archive index는 `208da5aff9bd508790e8e51ba01070cd779e9c4a3c57345b8d37800a69963f1b`다.
- Trigger `20260714.1`은 같은 SHA/ref/dirty이고 Vercel 뒤 19.586초에 만들어진 target task 등록 bundle이라 강하게 연결되지만 API가 소스 bytes/per-file digest를 주지 않는다. promotion state도 알 수 없고 해당 버전의 실제 문제 생성 run은 관측되지 않았다. Next compiled Lambda, external packages, generated Prisma, env/DB/runtime data 역시 raw-source closure의 바깥 경계다. 따라서 이 PASS를 compiled production byte parity로 확대 해석하지 않는다. 모델/API·DB write는 0이다.

### O50. 1,000개 hard cap 안의 실험은 production-parity와 bounded single-shot이라는 서로 다른 추정대상으로 분리해야 한다

- 현행 production envelope를 25유형×2플랜 전체에 첫 호출 전에 합산하면 1,000 candidate cap을 넘는다. 다만 assignment 하나를 batch 하나로 고정하고 모든 call/parser/gate/billing을 terminal close한 뒤 실제 미사용 예약량을 release하면, 다음 고정 row의 whole envelope를 순차 admission하는 방식은 조건부로 가능하다.
- 이 순차 parity queue는 25유형×2플랜×3난도 150행의 순서를 미리 고정한다. 다음 row envelope가 남은 cap에 들어오지 않으면 그 row와 뒤의 모든 row를 `budget_not_admitted` ITT 실패로 남기며 skip·reorder·싼 유형 우선·top-up을 금지한다. 따라서 admitted row는 production path를 보존할 수 있지만 전 유형 coverage는 보장되지 않고 admitted-only 품질률은 보고할 수 없다. symbolic queue SHA-256은 `c8666fd6d745774aedc8976e4ebc2e9ae9e7a9587824f1f2608498f9e98e868e`다.
- 별도 reduced registry는 retry/repair/fallback을 끊은 one candidate-capable request 정책이다. 실행 960+영구 잠금 40, STANDARD/PREMIUM 각 480, blank/grammar 각 342, 나머지 23유형 각 12로 산술상 전 유형을 건드린다. 하지만 production yield가 아닌 별도 estimand이며 parity로 부를 수 없다. symbolic queue SHA-256은 `dd8f951b93f3687ed27980bc28433d52775064b1cda1986a24b53891e689787d`다.
- reduced policy도 candidate 960+design 382+solver 342=physical 1,684이고 stale-price 보수 envelope가 `$662.52`다. strict blank 59개를 전부 써 reserve가 0이며, 실제 source binding에서 하나라도 탈락하면 재설계해야 한다. provider/controller/parser fresh PASS, 최신 callgraph envelope, private source binding, 네 profile hash, 15분 이내 가격과 provider-side spend cap 전에는 두 registry 모두 authorization 0이다.
- verifier 판정은 `PASS_DESIGN_INVARIANTS_ONLY_EXECUTION_REMAINS_BLOCKED`, campaign JSON SHA-256은 `5e3b2b2cd80ba12dbc192a1660efb15084f0c80cc40fd77783d7f9589eef8983`, manifest file SHA-256은 `878c80ef9052860ffaba748b6662152444c51e9e4809de00f8e9ee304297741f`다. API 사용량은 **0/1,000**이다.

### O51. 결정론 split 감사의 첫 520개 결과는 38개 명확 실패를 드러냈고, 실패를 동결한 뒤 구조적으로 고쳤다

- v3 상속 242개와 새 natural/property/metamorphic 278개를 독립 실행한 v4는 482/520으로 **BLOCK**이었다. 명확 false negative 29개는 summary mixed-task 25, Unicode-decoration ghost label 2, 학생용 해설의 전문 `계사` 합성어 2였고, false positive 9개는 `오답이라고 본다/보인다/확정된다/귀결된다` 같은 실제 선지 종결 판정을 서술 단계 번호로 오인한 경우였다.
- 이 BLOCK을 `deterministic-splits-remediation-reaudit-v4`에 먼저 불변 동결했다. manifest file SHA-256은 `fe3125b22d192dd5420b5cea9a1ba5223faad1dd2fd0f0d834436f9d621ef1a0`이며, 실패 오라클을 삭제하거나 완화하지 않았다.
- 수정은 접속어 표면 목록이 아니라 두 번째 과업의 객체(강조 문장·본문 빈칸·제목/중심생각·내용판정·무관문장·삽입·순서·지칭·어휘)를 탐지하도록 summary 방향 검사를 확장했다. 빈칸 해설은 outcome phrase와 종결 판정을 하나의 anchored unit으로 보되 기준/조건/규칙 같은 meta task와 분리했다. keyPoint prefix는 Unicode mark/Cf 장식을 제거하고, `계사`는 일반 어휘·육십갑자 suffix만 제외한 나머지 합성 전문어를 구조적으로 검출한다.
- exact 실패들을 상시 단위 테스트에 편입한 뒤 focused 45/45와 ESLint가 통과했고, 동결된 v4 audit script의 read-only semantic replay는 현재 소스에서 520/520을 냈다. 그러나 같은 audit에 맞춘 과적합 가능성이 있으므로 이 replay를 최종 PASS 산출물로 바꾸지 않았다. 새 독립 holdout 160개 이상을 추가한 sibling v5가 동결되기 전까지 결정론 단계는 계속 검증 중이다. API 사용량은 **0/1,000**이다.

### O52. Phase-B 원장·파서 primitive는 61개 적대 테스트를 통과했지만 실제 dynamic child handoff는 아직 실행 불가능하다

- whole-assignment physical/candidate/USD envelope, registry/entry/transition, exact static wire, durable terminal·billing·private raw body·parser evidence, restart no-replay, pricing 최대치 proof를 구현했다. 원장 25/25와 controller/boundary 36/36, 전체 TypeScript와 대상 ESLint를 제가 다시 실행해 통과시켰다.
- 연구 scope의 성공 응답은 `Response.clone()` tee 대신 원본 stream을 16 MiB까지만 bounded read하고 같은 exact bytes로 SDK용 Response를 재구성한다. 초과·read 실패는 source cancel 후 증거를 남기며, 성공 후보 응답을 검사할 수 없으면 모든 예약 slot을 `unknown_after_send`로 소비하고 assignment를 quarantine해 restart 뒤에도 replay하지 않는다.
- parser는 caller가 재구성한 JSON이 아니라 private append-only BLOB의 exact response bytes에만 실행된다. schema-invalid container 안의 완전한 문항도 semantic candidate로 세고, overflow는 숨기지 않고 assignment/campaign을 breach한다. 공개 export에는 body hash/length만 남긴다.
- 그러나 fixture 테스트의 dynamic receipt는 harness가 미래 body hash를 미리 알았기 때문에 가능했다. 실제 caller는 parent response body hash를 받지 못하고 AI SDK의 exact child wire body도 fetch 전에는 알 수 없다. caller가 이를 추측·재구성하면 response binding이 깨진다. 따라서 primitive PASS를 provider readiness로 올리지 않고 **campaign NO-GO**로 유지했다.
- 실제 통합은 caller-supplied receipt를 제거하고, child가 parent physical ID와 frozen derivation intent만 선언한 뒤 trusted boundary가 actual wire facts를 파싱한 시점에 controller가 durable parent body·transition·artifact와 결속한 receipt를 mint/authorize해야 한다. production callsite와 zero-network E2E가 이를 증명하기 전 repair/ladder 호출과 API 실행은 금지다.
- remediation 문서 SHA-256은 `f00b80e0727fa6170fb0ed3c31167ae58f75e9e6961f7a1491feef8d2de9d128`이다. API/browser/canonical DB 호출은 0이고 캠페인은 **0/1,000**이다.

### O53. 현재 OpenRouter completion key는 무제한이며 management key가 아니어서 외부 하드 지출 한도가 아직 없다

- OpenRouter 공식 문서상 현재 key의 limit은 `GET /api/v1/key`로 읽을 수 있고, 별도 key 생성·limit 변경은 management key가 필요한 `/api/v1/keys` 계열이다. 실행 시에는 key별 USD limit과 remaining을 provider-side 안전장치로 사용할 수 있다.
- 현재 `.env.local`의 key를 read-only 조회하되 key·label·원문 응답·구체 사용액은 저장하지 않았다. 결과는 `limit=null`, `limit_remaining=null`, `limit_reset=null`, management/provisioning key 모두 false였다. 즉 현재 key는 무제한 completion key이고, 이 key 자체로 제한된 실험 key를 만들거나 수정할 수 없다.
- 이 key는 production과 공유될 가능성이 있으므로 임의로 한도를 걸어 production traffic을 막지 않는다. 별도 limited campaign key 또는 독립적으로 승인된 동등한 provider-side hard cap이 생기기 전에는 대량 캠페인을 열지 않는다. 실행 직전에는 limit/remaining과 가격을 다시 캡처해야 한다.
- redacted attestation SHA-256은 `cd8cd063dc5d48cc9cf02b9d31031dcac64ebb077822ebfaeae916b5923cc565`이다. 이 metadata 조회는 모델/문항 생성 호출이 아니며 캠페인 사용량은 **0/1,000**이다.

### O54. `be permitted something`은 내부 모델 합의가 아니라 사전의 명시적 문형으로 재확인됐다

- Oxford Advanced Learner's Dictionary는 `permit`을 `[transitive, often passive]`로 기술하고 `be permitted something`의 실제 예로 “We were not permitted any contact with each other”를 제시한다. Cambridge English Grammar Today도 `permit/allow`의 수동태가 일반적임을 별도 항목으로 명시한다. 따라서 과거 문항의 `writing is not permitted the nonverbal communication ...`은 의미가 매우 부자연스럽더라도 retained-object passive라는 대안 통사 분석을 배제할 수 없어, 단일 정답형 어법의 무오류 정답 자리로 쓸 수 없다는 판정이 외부 근거와 일치한다.
- 현재 결정론 게이트는 `allow/ask/award/deny/give/grant/offer/pay/permit/promise/show/teach/tell`의 능동→수동 정답 변형을 `grammar-debatable-retained-object-passive`로 차단한다. 이는 이번 결함 family의 고정 회귀를 막지만 영어의 모든 수여·이중목적어 어휘를 완전 열거했다는 증명은 아니다. 따라서 site certificate와 독립 solver의 대안 분석을 없애거나 이 목록만으로 어법 유효성을 보증하지 않는다.
- 확인한 문서는 `https://www.oxfordlearnersdictionaries.com/us/definition/english/permit_1`과 `https://dictionary.cambridge.org/grammar/british-grammar/allow-permit-or-let`이며, 문제 생성·평가 API와 DB write는 0, 캠페인은 **0/1,000**이다.

### O55. 결정론 v6는 904개 중 10개를 다시 놓쳤고, 실패를 동결한 뒤 answer-object 구조로 고쳤다

- v6는 v5의 712개를 전부 재실행하고 완전 신규 192개를 6 family별 positive 16/negative 16으로 균형 구성했다. 결과는 v5 replay 712/712, 신규 182/192, 합계 **894/904 BLOCK**이었다. 실패 10개는 모두 요약문 (A)/(B) 완성 뒤 `본문이 뒷받침하지 않는 진술`을 별도 답안으로 고르게 하는 content-match 과업의 자연스러운 한국어·영어 변형이었다. 같은 근거 어휘가 단지 요약쌍 선택 기준인 negative 16개는 과잉차단 0이었다.
- BLOCK 아티팩트를 먼저 ReadOnly로 동결했다. manifest SHA-256은 `99f7472df3f71a8a7c00c0856b622726284370b65a155a5a4b1d3efaa9e8af56`, audit script는 `f557fb04ccf4eb83758b13b7a09a63209343ad8aaaf1658204cc4daf861653a7`, RESULTS는 `feae16b10378de3881f3ee62372bbda733b7956627e3ebe687495f82cac62707`, verifier는 `d596879962541d03bd48d4e7f6c91184dd1fbeea8470554f4863ce4f1a9e45e3`, AUDIT은 `bbc9f60edf29a72d395bde970f6b0892df01596c36f36516a0949989e1774a67`이다. 제가 verifier를 다시 실행해 exact replay와 모든 source/test/v4/v5 hash 일치를 확인했다.
- 수정은 `근거/증거` 표현 목록만 늘리지 않았다. 별도 선택 행위가 `주장/진술/claim/statement/assertion`이라는 답안 객체를 직접 겨냥하고, 그 객체의 지문 근거상 support/contradiction/true-false를 판정하는지를 함께 본다. 실패 10개와 evidence-bound negative 16개를 영구 회귀에 추가했고, 현재 소스에서 단위 테스트 8/8, 대상 ESLint, v6 semantic replay **904/904**가 통과했다.
- 이 904/904는 동결 BLOCK의 사후 적합 결과이지 새 독립 PASS가 아니다. `요약문의 주장 자체가 근거에 맞도록 pair를 고르라`처럼 같은 어휘를 쓰지만 선택 객체는 여전히 (A)/(B)인 hard negative를 포함한 신규 v7 전까지 단계 판정은 계속 미확정이다. API 사용량은 **0/1,000**이다.

### O56. 최초 severity 감사의 `blank semantic-role loss` 권고는 아직 구현 완료가 아니다

- 현재 `blank-paraphrase-correct-too-thin`은 token-count 기반 craft 신호로 남아 있고, 별도 fatal split은 `subject/clause/verb-form slot mismatch`와 매우 좁은 `resist ... reduce` → `reduce` 극성 반전만 검출한다. 최초 감사가 명시한 actor·condition·cause·scope 손실을 일반적으로 판정하는 `blank-paraphrase-semantic-role-loss` emitter나 동등한 구조 증명은 현재 소스에 없다.
- 이것은 단순히 금지어 regex를 더 붙여 해결할 사안이 아니다. 충실한 압축(`resist reducing complex evidence to simple rules` → `avoid oversimplification`)과 의미를 버린 일반화(`sound judgment`)가 같은 token-count 경고를 내므로, 현재 코드만 harden하면 정상 KILLER 정답을 과잉 차단할 수 있다.
- 따라서 policy severity 단계는 기존 BLOCK을 유지한다. 다음 독립 재감사는 10개 split 각각의 실제 emitter·정책 membership을 다시 고정하고, 빈칸 role loss에는 actor/polarity/condition/cause/scope별 결함·정상 대조군을 모두 포함한다. deterministic precision이 불충분하면 생성 시 제출하는 source-role→answer-role certificate와 맹검 semantic gate를 별도 추정대로 검증하며, token-count proxy를 fatal 증거로 승격하지 않는다.
- 이 확인은 소스·기존 동결 산출물의 zero-call 재검사이며 모델/API·DB write는 0, 캠페인은 **0/1,000**이다.

### O57. 복수 후보 불명확성은 Gemini/OpenRouter 한계가 아니라 현행 wrapper 스키마의 무상한 `questions[]` 문제일 가능성이 높다

- 현행 `getAiResponseSchema`는 root를 `{ questions: z.array(questionSchema) }`로 만들지만 요청한 문항 수를 `minItems=maxItems`로 고정하지 않는다. 연구 boundary는 이 wrapper를 단순 root object 1개로 오인하지 않고, `questions` 배열의 equal min/max가 없으면 semantic candidate 수를 미확정으로 두도록 고쳐져 있다. 따라서 현재 production-parity campaign을 BLOCK한 판정은 맞다.
- 다만 공식 OpenRouter 문서는 `response_format.type=json_schema`, `strict=true`, `provider.require_parameters=true`를 통해 정확한 JSON Schema 지원 endpoint만 선택할 수 있다고 명시한다. Google Gemini structured-output 문서도 array의 `minItems`와 `maxItems`를 지원한다고 명시한다. 즉 `json_object`에 프롬프트로 “한 개만” 부탁하는 것과 달리, `questions.length(requestedCount)`를 실제 wire schema에 넣는 해결 가설이 존재한다.
- zero-network SDK wire probe에서 현행 `BLANK_INFERENCE` wrapper는 strict `json_schema`임에도 `questions.minItems/maxItems=null`이고 `{questions:[]}`가 client schema를 통과했다. 같은 구조는 등록 AI 유형 64/64와 활성 영어 유형 25/25 모두 무상한이었다. 반대로 같은 SDK의 `.length(1)`과 `.length(3)`은 actual request body에 각각 equal min/max를 냈고, request transform의 `provider.require_parameters=true`도 보존됐다. verifier·ESLint가 통과했으며 probe manifest SHA-256은 `b9fda458d952fa0d43a817ca0b6bd2a838aa25183d94fb0709d84497f4f32f50`다.
- 이 가설은 아직 production 변경이나 실행 허가가 아니다. production builder/Atlas transform에 처치를 연결했을 때도 equal min/max와 parameter-support requirement가 남는지, Gemini 3.5 Flash/3.1 Pro가 해당 schema를 받아들이는지, count>1·fallback·repair 경로가 같은 cardinality를 보존하는지를 먼저 production-callsite zero-network E2E와 이후 제한된 mechanistic probe로 확인해야 한다. schema가 거부될 때 prompt-JSON fallback으로 조용히 내려가면 보증이 다시 사라지므로 fallback은 별도 candidate envelope 또는 fail-closed 정책이 필요하다.
- 근거 문서는 `https://openrouter.ai/docs/guides/features/structured-outputs`, `https://openrouter.ai/docs/guides/routing/provider-selection`, `https://ai.google.dev/gemini-api/docs/structured-output?lang=rest`다. 이 확인은 문서 조회와 로컬 소스 대조뿐이며 생성 API·DB write는 0, 캠페인은 **0/1,000**이다.

### O58. 두 고정 모델은 structured output을 노출하지만, 스키마 강제는 성공률·비용 문제를 없애지 않는다

- OpenRouter의 현재 `google/gemini-3.5-flash`와 `google/gemini-3.1-pro-preview` 모델 페이지는 모두 `response_format` 지원을 노출한다. Flash provider 페이지는 관측 창의 structured-output error rate도 provider별로 별도 공개한다. 즉 exact cardinality schema는 “유효 응답이 왔을 때 후보 수를 무상한으로 두지 않는다”는 안전성 개선이지, provider/schema 오류나 no-candidate를 0으로 만드는 장치가 아니다.
- 따라서 고정 길이 스키마를 채택하더라도 실패를 프롬프트 JSON으로 자동 완화해 같은 estimand로 섞으면 안 된다. strict structured arm의 provider/schema failure는 ITT 실패와 실제 비용으로 남기고, fallback을 허용하는 production arm은 그 fallback의 별도 candidate envelope·parser binding·비용을 모두 예약해야 한다. 오류율 때문에 평균 2회 재생성을 기본값으로 올리는 해법도 금지한다.
- 확인한 모델 문서는 `https://openrouter.ai/google/gemini-3.5-flash/api`, `https://openrouter.ai/google/gemini-3.5-flash/providers`, `https://openrouter.ai/google/gemini-3.1-pro-preview/api`다. 수치는 실행 직전 다시 고정해야 하며 이 문서 확인은 생성 호출이 아니므로 캠페인은 **0/1,000**이다.

### O59. exact `questions[N]`를 넣어도 prompt-JSON fallback을 같은 후보 경로로 허용하면 상한 증명이 다시 깨진다

- structured request가 masked 400/compiled-grammar error를 만나면 현행 `generateQuestionObject`는 schema를 프롬프트에 인라인한 일반 text generation으로 내려가고, raw JSON을 client-side Zod로 검증한다. Zod의 `.length(N)`은 최종 채택을 막을 수는 있어도 provider가 보내기 전 semantic candidate 수를 제한하지 못한다. raw response 안의 완전한 문항 객체를 모두 candidate로 세는 현재 hard-cap 정의에서는 “최종 parse가 실패했으니 0개”라고 되돌릴 수도 없다.
- 따라서 exact-cardinality mechanistic 정책은 이 fallback을 fail-closed ITT failure로 두거나, token/byte 상한에서 가능한 semantic candidate 전부를 감당하는 별도 보수 envelope를 사전 예약해야 한다. 현 32k output fallback을 통상 N개로만 예약하는 것은 금지다. 이 처치는 production fallback을 그대로 둔 parity estimand와 다르므로 두 결과를 합칠 수 없다.
- provider가 strict schema를 지원한다고 선언하고 `require_parameters=true`로 라우팅된 호출의 non-2xx는 no-candidate failure로 닫되, schema를 무시한 2xx·oversized body·parser overflow는 assignment quarantine과 no-replay 대상이다. API 사용량은 계속 **0/1,000**이다.

### O60. 실제 Workbench 호출 경계까지 연결한 고정-cardinality 경로는 기계적으로 통과했지만 production parity는 아직 BLOCK이다

- 실제 `atlasChatModel → fetch` 경계와 structured root, prompt-JSON fallback, JSON/candidate repair, solver, PREMIUM grammar ladder, outer retry를 연구 runtime·controller·durable ledger에 연결했다. caller는 physical ID·response hash·receipt를 만들 수 없고, trusted boundary/controller만 실제 wire와 durable parent response를 결속한다.
- 독립 재실행에서 boundary/controller/callsite 52/52, 예산 harness 25/25, targeted ESLint, 전체 TypeScript, manifest 18/18이 모두 통과했다. strict schema가 400을 반환한 뒤 prompt-JSON으로 내려가려는 경로는 연구 assignment에서 두 번째 network 호출 전에 fail-closed되고 ITT no-candidate로 남는다. 외부 API·network·DB 호출은 0이다.
- 그러나 현재 일반 production schema의 `questions[]`는 여전히 무상한이고, JSON repair의 `json_object`와 plain-text fallback은 semantic cardinality를 증명하지 못한다. sealed campaign runner, retained non-latest/multi-question parent lineage, unknown-after-send billing reconciliation도 미완료다. 따라서 판정은 **고정-cardinality structured mechanistic PASS / unrestricted full production parity BLOCK**으로 분리한다.
- 동결 산출물은 `reviews/provider-callsite-integration/`이며 `AUDIT.md` SHA-256은 `50b08bdc8685e56cb304cbcc6a9071e56a8b4787d0fffaac3b122ab6248a22d9`, manifest SHA-256은 `a9a2895d3c13cbe79dd851deee3bcb17765dde386389b7cf4c48db7b0b13b050`이다. API 사용량은 **0/1,000**이다.

### O61. 프롬프트 길이의 이분법 대신 8개 구조 가설과 비용·통계 판정 규칙을 먼저 동결했다

- 어법 G0 현행, G1 최종 체크리스트 제거, G2 긍정형 compact, G3 정답자리 certificate와 빈칸 B0 현행, B1 type-scoped tail, B2 긍정형 compact, B3 option-intent ledger를 독립 가설로 정의했다. “길면 나쁘다/짧으면 좋다”가 아니라 제약의 위치·역할·구조화 정도를 분리한다.
- S1은 어법 96 + 빈칸 84 = 180 fixed single-shot calls이고 n=6 셀의 점추정으로 승자를 뽑지 않는다. 고정 우선순위, plan별 parse 10/12 이상, structured binding failure 2/24 이하, 신규 fatal 0과 기존 fatal regression 0만으로 S2 진입 후보를 정한다. B1 PREMIUM은 B0와 byte-identical이라 호출하지 않고 S2에도 진입하지 않는다.
- S2는 유형별 240 ITT assignment를 목표로 하되, fatal-free NI -5pp, A/B superiority, cost ratio upper bound <1.25의 6개 one-sided family를 Holm α=.05로 동시에 통과해야 한다. PREMIUM 어법 control은 answer-only→add-decoys→validators→triggered repair/regeneration→solver→fallback/salvage 전체 현행 ladder이며 G3만 answer stage certificate를 바꾼다.
- 이 설계의 verifier는 통과했지만 provider exact-wire와 최신 source-closed callgraph가 아직 없어서 판정은 `PASS_DESIGN_INVARIANTS_ONLY_EXECUTION_NO_GO`, S2는 `SOURCE_UNPINNED_BLOCK`이다. manifest SHA-256은 `c801d8a3babbafe3a0234bb652db9c269d44f15d65c7a85b2aeead9b1570426a`이고 API 사용량은 **0/1,000**이다.

### O62. v6의 사후적 904/904는 새 블라인드 256개에서 91건 깨졌으므로 PASS가 아니었다

- v7은 v6 904개를 그대로 replay하면서, 과거 감사·테스트를 읽기 전에 봉인한 224개와 answer-object를 표적화한 별도 post-seal 32개를 추가했다. 결과는 inherited 904/904, 신규 165/256, 합계 **1,069/1,160, 실패 91 → BLOCK**이다. 신규 오류는 FN 77, FP 14다.
- 요약 direction은 FN 18·FP 14였고 실제 선택 객체가 `(A)/(B)` 쌍인 targeted negative 16개 중 14개를 content-match로 오판했다. 그 밖에 자연형 원형번호 풀이 단계 16건, ghost label 14건, 명백히 틀린 문법 규칙 16건, 순서 문항 본문 무결성 13건을 놓쳤다. exact transformed-answer residue만 신규 32/32였다.
- 최초 결과 파일은 도구 stdout 축약으로 failure 91개 중 35개만 남아 verifier가 실패했다. 이를 숨기지 않고 compact failure index로 91개 전부 재생성한 뒤 exact replay verifier를 다시 통과시켰다. 동결 v7 manifest SHA-256은 `d79f00fd7cfe5a1fe92ba09f3c429391a50981b9fb9cd2f3e60f02c22720537c`다.
- 이 결과 때문에 v6 current-source replay 904/904를 독립 PASS로 승격하지 않는다. API 사용량은 **0/1,000**이다.

### O63. 요약 direction은 키워드 공존이 아니라 선택 동사의 실제 목적어를 결속하도록 수정했다

- 한국어는 마지막 선택 명령 앞의 명시적 목적격을 찾되 `진술을 제시문을 기준으로 고르시오`에서 `제시문` 같은 source-frame 목적어를 제외하고, 실제 answer head가 주장·진술·명제·설명인지 쌍·조합·짝·빈칸·단어·표현인지 구분한다. 영어도 마지막 selection command 뒤 첫 answer-object head를 claim 계열과 completion 계열로 분리한다.
- 집중 unit 9/9, targeted ESLint, 전체 TypeScript가 통과했고, 동결 v7 요약 96개는 기존 64/96(FN18·FP14)에서 **96/96(FN0·FP0)**으로 회복했다. 그러나 반례를 본 뒤 고친 post-fit replay이므로 판정은 `PASS_POST_FIT_REPLAY_ONLY`; 조사 생략·목적어 생략·명사화 명령·영어 관계절을 섞은 새 홀드아웃 전에는 독립 PASS가 아니다.
- 동결 remediation manifest SHA-256은 `4c096f8c7d1af013c8f6a879fd0cd21d0ed1553c85980978c5ee98818e898e74`이며 모델/API·network·DB 호출은 0이다.

### O64. strict 빈칸 59개를 실제 content hash와 private ID에 결속했지만 아직 한 건도 실행 승인하지 않았다

- immutable v3 snapshot과 동일 selector를 재실행해 `focus-blank-killer` 59개를 정확히 복원했다. 모두 `origin=repo-official`, `sourceKind=EXAM`, `originalType=빈칸추론`, word 150~262, sentence 5~12이며 content hash 59개가 전부 고유하다. public frame에는 passage text·candidate/DB/academy/source-record ID가 없고, private git-ignored map만 실제 ID를 보존한다.
- 분포는 수능모의평가 25·학력평가 27·대학수학능력시험 7, 2007~2026 15개 연도, 3·4·6·7·9·10·11월·수능·예비 9개 round다. binding hash는 `6be6c1f29d0c6e6e2f0d0152fcbb175bf081dd281d1dde15f9beba1b8045a212`다.
- 자동 source/historical/near-duplicate/central-span gate를 통과한 것과 실제 passage integrity를 사람이 검수한 것은 다르다. 현재 59/59가 `manualPassageIntegrity=UNREVIEWED`, snapshot에 권리 필드가 없어 59/59 `rightsRecord=NOT_PRESENT_IN_SNAPSHOT`, campaign eligible은 0이다. reduced design은 59개 전부를 써 reserve 0이므로 한 건이라도 탈락하면 silent replacement 없이 재설계한다.
- verifier 판정은 `BOUND_NOT_AUTHORIZED`, manifest SHA-256은 `d50caf4ed8fc3a41829931302fabba075e82b223079e00a8beeeb44e92d5b419`이며 새 DB/API/network 호출은 0, 캠페인은 **0/1,000**이다.

### O65. 연구 runtime 안에서만 exact `questions[N]`와 `require_parameters`를 실제 엔진 진입점까지 관통시켰다

- sealed registry의 candidate contract에서 expected question count를 도출해 ALS에 고정하고, `getAiResponseSchema`와 alternate structured wrapper가 연구 runtime에서만 `.length(N)`을 쓴다. production plan count와 sealed count가 다르거나 positive safe integer가 아니면 provider callback 전에 거절한다. runtime 밖 현행 production은 의도적으로 기존 unbounded array를 유지한다.
- Atlas request transform은 연구 runtime이 활성이고 실제 wire가 `json_schema`일 때만 `provider.require_parameters=true`를 병합한다. zero-network actual wire에서 count 1·3의 equal min/max와 provider flag를 확인했고, no-runtime·research text negative control에는 둘 다 없었다.
- 실제 `runQuestionGenerationWithEmptyRetry`를 부르는 sealed runner의 `BLANK_INFERENCE×1` masked-400 fixture는 structured mock dispatch 1, prompt-JSON dispatch 0, terminal `no_candidate` 1, assignment closed를 기록했다. 독립 full verifier는 focused 68/68, budget 25/25, ESLint, tsc, manifest 27/27을 통과했다.
- 이것은 한 개 실패 fixture의 engine-entry route PASS이지 성공 응답의 downstream repair/solver/gate, retained parent, multi-question, billing recovery, Workbench HTTP/Trigger, live provider acceptance를 증명하지 않는다. full production parity는 계속 **BLOCK**이다. Phase-C manifest SHA-256은 `2b80b4698a3f26633584135cd4d7c2ff4a168342238df0e30da76100f9a41ddb`이고 외부 API/network 호출은 0이다.

### O66. 영어 quality emitter 466개를 전수 재구성했지만 빈칸 정답의 의미역 보존은 0/5였다

- current source AST에서 영어 quality emitter code 466개와 raw/final severity, SHIP_FIRST·RELAXED_BLOCKING·SALVAGE_RELAXABLE membership을 재구성했다. 이전 즉시 제거·severity split 지적 13건 중 12건은 실제 emitter와 relaxed/salvage 동작까지 해소됐다.
- 남은 `blank-paraphrase-correct-too-thin`은 의미 보존과 길이를 분리하지 못한다. 동일 token 수의 정상/결함 쌍으로 actor(local communities→central regulators), polarity(necessary→unnecessary), condition(only when information shared→even when lacking), cause(transparency→trust의 방향 역전), scope(few/narrow→many/broad)를 바꿨지만 결함 5개 중 semantic hard block은 **0/5**, 다른 issue도 0/5였다.
- `avoid oversimplification`과 의미를 잃은 `sound judgment`에 같은 thin warning이 나오는 점도 확인했다. 따라서 thinness code를 hard error로 올리거나 금지 regex를 늘리는 것은 해결이 아니다. source proposition과 answer proposition의 actor·polarity·condition·cause·scope certificate 또는 별도 semantic verifier가 필요하다.
- stale policy entry 2개도 남아 있다. 재감사 판정은 **BLOCK**, `AUDIT.md` SHA-256은 `902be65c35dafa7832152afac9fd50c3f8b35020291fcbc4e756584beea5318c`이며 API 후보·network·DB·secret 접근은 0이다.

### O67. v7의 고신뢰 구조 결함은 95/95로 보강했지만 자유서술 문법 진위는 의도적으로 BLOCK에 남겼다

- 빈칸 해설은 `먼저/다음으로`가 없어도 찾기·비교·구분·선택 같은 자연형 풀이 동작이 원형번호 두 개 이상에 걸쳐 나오면 procedural numbering fatal로 분리한다. 실제 선지 번호와 정오 판정을 연결한 해설은 정상 control로 보존했다.
- 어법 ghost label은 원숫자·원문자·괄호숫자·로마자·한글 서수를 실제 rendered label과 비교한다. 순서 문항은 본문 내부 중복 structural label과 짧은 overt dependent fragment를 각각 전용 fatal로 분리하고, 종속절 opener 뒤 독립 main clause가 있는 정상문은 통과시킨다.
- 집중 37/37, ESLint, 이후 root가 재실행한 전체 TypeScript가 통과했다. bounded high-confidence subset은 95/95이며, remediation-aware sentence-order는 32/32다. frozen v7의 `grammar-label-neg-12`는 선언 `[1]~[5]`인데 `㉡` 참조를 정상으로 봉인한 오라클 모순이어서 구현을 약화하지 않았다.
- 자유서술 문법 규칙 16개는 exposed 문구를 금지목록에 넣어 외우게 하지 않았다. bounded rule certificate/catalog와 source/correction binding, catalog 밖 free-form claim의 조건부 semantic verifier 설계가 필요하므로 전체 판정은 **BLOCK**이다. artifact manifest SHA-256은 `db4c222752f1c403debad6bb5e3c678423d8081073c2d534b6aeba8e1c56ca5e`이고 API 사용량은 **0/1,000**이다.

### O68. 모델 자유서술 해설 대신 blind solver certificate→server template 경로를 설계·기계검증했다

- solver prompt에는 학생용 발문과 마킹 지문만 넣고 정답 키·correction·기존 explanation·keyPoints·wrongOptionExplanations를 주지 않는다. solver는 다섯 마커의 exact surface, grammatical/ungrammatical/unresolved, corrected form, CORE-10 pointCode, closed ruleId, exact evidence span, alternative standard parse 유무를 모두 구조화해 제출한다.
- server binder는 `UNIQUE_INVALID`, solver 답=후보 정답, 정확히 한 비문, 네 decoy 정문, surface/correction/pointCode/ruleId 일치, evidence가 실제 학생 지문의 exact substring이며 해당 surface 포함, `NONE_DEFENSIBLE`을 모두 만족할 때만 승인한다. 하나라도 어긋나면 explanation을 만들지 않는다.
- 승인 뒤에는 후보가 쓴 자유서술과 solver의 free-form reasoning을 버리고 versioned Korean catalog template로 정답 해설·keyPoints 3개·오답 해설 4개를 렌더한다. 이로써 해설 길이를 통제하면서도 모델이 별도의 틀린 문법 규칙을 지어내는 통로를 닫는다.
- 계약 테스트는 정상 binding·answer/nonunique·surface·correction·point/rule·evidence·alternative parse·unknown rule·marker cardinality를 포함해 5/5, ESLint와 전체 TypeScript도 통과했다. 다만 solver 자체의 진실성, provider wire/ledger, fresh truth holdout, 추가 호출 비용은 미검증이므로 판정은 `PASS_DESIGN_MECHANISM_ONLY_EXECUTION_BLOCKED`다. manifest SHA-256은 `b9ee7f610dd42ed7da1b8ba094eacb60b32fa6eeecb489984e1f5b2c4e96e1dc`, API 사용량은 **0/1,000**이다.

### O69. 사후 95/95 구조 개선은 새 블라인드 256개에서 93개 false negative를 남겼다

- v8 감사자는 기존 소스·테스트·감사 산출물을 보기 전에 8 family×32개(정상 16·결함 16)를 봉인했다. 의미 리터럴 764개를 과거 116개 파일·6,652,373 bytes와 대조한 exact 재사용은 0이었다. 전체는 **163/256, FN 93, FP 0 → BLOCK**이다.
- 빈칸 해설의 원형번호 절차/실제 선지 분석과 exact transformed-answer residue는 각각 32/32로 독립 통과했다. 반면 SUMMARY_COMPLETE_MC의 keyed option-object 불일치 16, 새 Unicode/rendered ghost label 13, 자유서술 문법 진위 16, 순서 본문 중간 label 16, 문장부호가 있는 종속절 fragment 16, 빈칸 actor/polarity/condition/cause/scope 변조 16을 놓쳤다.
- 이는 post-fit 95/95를 전체 안전성으로 확대하지 않은 결정이 옳았음을 보여준다. 고신뢰 표면 구조 family는 구조적 normalization/binding으로 보강하되, 문법 진위와 빈칸 의미역은 예문 금지목록으로 외우게 하지 않고 별도 인증 경로로 남긴다.
- verifier를 root가 다시 실행해 seal·manifest·source hash·80/80 legacy test·163/256 replay를 확인했다. cases SHA-256은 `564064210a382bd41c54913d9cf6edbd4943385f968517a5dfba81827afcb08f`, manifest SHA-256은 `8c131d19fc15ef7efa3eed28f7662d873cf11f3c886995b8259c7f42d60b52d0`이며 API 사용량은 **0/1,000**이다.

### O70. strict 빈칸 59개는 두 독립 렌즈 교집합이 24개뿐이라 기존 26-cluster 설계를 채우지 못한다

- Reviewer A는 원문 복원·target centrality·무결성을 59/59 수동 검토해 PASS 29, EXCLUDE 3, DOMAIN_REVIEW 27을 냈다. raw blank-bearing evidence가 있는 32건은 restored full text 32/32 exact였지만, 증거가 없는 27건을 겉보기 문장 완결성만으로 승격하지 않았다.
- Reviewer B는 독립적으로 paired INTERMEDIATE/KILLER 문항 설계 가능성을 59/59 검토해 PASS 49, EXCLUDE 7, DOMAIN_REVIEW 3을 냈다. 두 reviewer가 상대 판정표를 보지 않은 상태에서 각각 manifest를 봉인한 뒤에만 교차했다.
- 결합 규칙은 어느 한쪽이라도 EXCLUDE면 제외, EXCLUDE가 없고 한쪽이라도 DOMAIN_REVIEW면 보류, 양쪽 PASS만 frame pass다. 결과는 **양쪽 PASS 24 / EXCLUDE 9 / DOMAIN_REVIEW 26**이다. 24개도 expository 20, argumentative 2, narrative 2로 편향돼 있다.
- 따라서 개발 6+확증 20=26 unique cluster 설계는 권리 검토 전에도 최소 2개 부족하고 장르 균형도 실패한다. 기존 59개 전량·reserve 0 queue는 폐기하며 silent top-up을 금지한다. 새 공급은 별도 binding·독립 검수·history 분리·장르 균형을 동결해야 한다.
- A/B verifier와 reconciliation verifier를 root가 재실행했다. A manifest SHA-256은 `5401fbff24faddca0aaab8d70ab026020b5304a889444066b591610ef72a1729`, B는 `a4cd1d9d7670125bfeaedeb5a9decff648f4abab1a1f1bc1c6589cb9625d7230`, reconciliation manifest는 `e6a40cf741dabdd7adc195a5ef96a34df1643873f914e3809e6d62a05bb80c31`이다. 권리 기록은 여전히 별도이며 campaign eligible은 0, API 사용량은 **0/1,000**이다.

### O71. 빈칸 의미역 손실을 다섯 닫힌 축으로 재계산하는 blind certificate 메커니즘을 만들었다

- blind solver에는 학생용 발문, originalExpression을 실제 빈칸으로 가린 지문, 다섯 visible option만 준다. 생성 정답·별도 source span·blankDesign/blankBlueprint·기존 해설·오답 해설은 주지 않는다.
- solver는 passage exact evidence에 결속한 role ID로 inferred target과 각 option을 표현하고, actor/target·polarity·condition/modality·causal relation/direction·scope/quantifier 다섯 축을 제출한다. server가 두 proposition의 축 차이를 직접 재계산하므로 모델이 `divergentAxes=[]`라고 주장하는 것만으로 통과하지 못한다.
- key는 모든 축이 같고 FULL_EQUIVALENT이며 독립 solver answer가 후보 key와 같아야 한다. KILLER 네 오답은 high-overlap·정확히 한 축 distortion이고 네 primary axis가 달라야 한다. option text·role reference·source evidence·대안 동치 해석을 모두 actual student surface에 bind한다.
- 승인 시 생성 자유서술을 버리고 exact evidence와 versioned Korean axis copy로 짧은 정답/오답 해설을 렌더하며, 불일치 시 아무 해설도 만들지 않는다. actor/polarity/condition/cause/scope 계산, surface/evidence/role binding, KILLER 단일축/다양성, nonunique/competing parse를 포함한 계약 테스트 7/7, ESLint, 전체 TypeScript가 통과했다.
- 이것은 solver가 실제 의미를 옳게 읽는다는 증명이 아니다. 사람 truth holdout의 false accept/block, provider wire, evaluation-only ledger, no-certificate/1회/dual 정책의 cost-per-A/B 비교 전에는 실행 차단이다. 자동 regeneration도 허가하지 않는다. artifact manifest SHA-256은 `b8e5d7a25e57f943ff7559ff9096dd22699a23bfbff498296e18b418d1c8c57c`, API 사용량은 **0/1,000**이다.

### O72. 24/59 교집합 통과율의 불확실성을 반영해 새 빈칸 공급 157개를 사전 동결했다

- 기존 24/59를 점추정으로 쓰지 않고 one-sided 95% Clopper–Pearson lower bound `0.298659465008`을 사용했다. dual-lens frame pass 38개를 목표로 할 때 binomial reach probability가 처음 95%를 넘는 queue는 157개다: n=157은 `0.951548806461`, n=156은 `0.946412208647`이다.
- 새 frame은 immutable v3의 `focus-grammar-killer` 고정 queue 307개 중 **앞 157개를 passage-source pool로만** 사용한다. prompt/profile 작성자는 passage text를 보지 않았고 reviewer outcome·사후 점수·candidate span은 selection에 관여하지 않았다. strict blank v1 59개와 content-hash overlap은 0이다.
- metadata 분포는 discourse argumentative 38/expository 64/narrative 46/practical 9, topic 5개 전부, word band 99/51/7로 구성된다. 이는 이전 dual-pass 24개 중 expository 20 편향을 줄이는 공급 설계일 뿐 실제 빈칸 적합성의 증명이 아니다.
- 두 reviewer가 157/157을 각각 fixed protocol로 검토하기 전 campaign eligible은 0이다. 38개 통과 뒤에도 dev 6·confirmatory 20·reserve 12의 장르 균형 split, fresh history, rights handling이 남는다. frame binding hash는 `52da32f52ef03e2af9c834be2ac26d66d761c64a845dd5714b4a2791ce73ec25`, manifest SHA-256은 `a86eb7cb520c05846f8c30b47ca35787505da54492aca10df9c731d861d05511`이며 API 사용량은 **0/1,000**이다.

### O73. 현재 production은 환경변수와 SDK hidden retry 때문에 절대 호출 상한을 소스에서 증명할 수 없다

- 현재 `GEMINI_QUESTION_MAX_RETRIES`와 `GEMINI_QUESTION_EMPTY_RESULT_MAX_ATTEMPTS`는 양의 정수이면 상한 없이 수용한다. 배포 환경값은 이 감사에서 읽지 않았으므로, repository default 계산은 배포 보증이 아니라 진단치다. deadline도 빠르게 실패하는 요청 수를 제한하지 못한다.
- default application retry 2, empty retry 2, AI SDK hidden retry 2, subtype 1·count 1에서 보수적 physical fetch 진단은 STANDARD blank 648, PREMIUM blank 162, STANDARD grammar 675, PREMIUM grammar 378이다. 현행 premium ladder는 과거 기록의 81이 아니라 54 fetch이며, ordinary `questions[]`는 schema상 최대가 없어 응답 하나의 semantic candidate cardinality도 미확정이다.
- research exact arithmetic은 216/54/225/198이지만 실행 가능한 네 셀 registry가 아니다. Phase-C는 STANDARD blank masked-400 1건만 실제 entrypoint로 증명했고, repeat/repair/solver/ladder/scarce/salvage child 전부를 봉인한 registry가 없다. reduced design의 SDK retry 0 주장도 실제 runner에 연결되지 않았다.
- 따라서 production 기본 동작을 임의 변경하지 않으면서 application/env hard cap, AI SDK retry의 명시적 배선, research-only single-shot 0 retry를 실제 wire에서 증명해야 한다. 이 전에는 production-parity 배치를 열지 않는다. manifest SHA-256은 `251184451463c7325de3f39a43d05d3e77df360d6e0af37e0ce73eda1ec7ff42`이고 API·network·DB·secret read는 0, 캠페인은 **0/1,000**이다.

### O74. 전체 25개 활성 영어 유형의 사람 평가 계약을 F/C/B/A로 고정했다

- 활성 UI의 정확한 25개 유형 각각에 task, fatal, craft, KILLER, explanation 기준을 따로 작성했다. registered-only legacy `TOPIC_MAIN_IDEA`는 포함하지 않았고, 문항 성립·source·render·정답 cardinality·사실 해설 오류는 문체가 좋아도 즉시 F다.
- 평가자는 학생 surface를 먼저 풀고 key·해설을 나중에 보며, 두 독립 평가자와 fresh adjudicator를 요구한다. A는 단순 무오류가 아니라 모든 visible element가 의도적 오개념을 겨냥하고 풀이 경로가 날카롭고 경제적인 상태다.
- 비중점 23유형의 유형당 12개는 defect discovery용일 뿐, 결함 0건이어도 유형별 품질 추정·Standard/Premium 비교·release 승인을 하지 않는다. rubric은 자동 judge가 사람 풀이를 대체하도록 허가하지 않는다.
- verifier·lint가 통과했고 manifest SHA-256은 `9c3a2cd9d5ddc62d5e7eecd6ee1fc5ec772de48315ce12c6e5b7d1bb8443942e`다. 문항/API·network·DB 호출은 0, 캠페인은 **0/1,000**이다.

### O75. v8의 네 구조 family는 128/128로 사후 복구했지만 의미 진위 두 family는 계속 BLOCK이다

- SUMMARY_COMPLETE_MC는 명시적 선택 술어가 가리키는 고유한 실제 선지 전체 표면을 `correctAnswer`에 결속한다. 비교·배제된 언급, 중복·너무 짧은 표면, 일반 지시문에는 보수적으로 abstain한다. grammar ghost label은 NFKC·결합기호·괄호·제한된 `<u>`·숫자 entity를 actual rendered label과 같은 canonical grammar로 비교한다.
- SENTENCE_ORDER는 단락 본문 어디의 standalone `(A)/(B)/(C)`·대괄호·원문자 중복도 막되 인용·수식·단어 내부를 보존한다. 문장부호로 끝난 종속절 뒤에 padding 문장이 붙어도 첫 fragment를 독립 검사하며, 문두 지시대명사 `That`은 정상 control로 고정했다.
- frozen v8의 해당 네 family는 **128/128, FN 0, FP 0**, 집중 suite 35/35, 광범위 grammar 106/106, ESLint, 전체 TypeScript를 root가 재실행해 통과했다. 기존 broad grammar fixture의 `can change`는 판단 여지가 없는 filler decoy라서 게이트를 약화하지 않고 실제 판단 가능한 `whether` site로 교체했다.
- 이 수치는 결함을 본 뒤의 post-fit replay다. 특히 v8 원본 summary projection은 sealed choices/key 대신 고정 base를 넣었던 결손이 있어, 새 replay는 sealed five choices와 key를 production binder에 직접 결속했다. 독립 v9가 필요하며 자유서술 grammar truth와 blank semantic role은 certificate 설계만 있고 실행 증명이 없어 global 판정은 BLOCK이다.
- remediation manifest SHA-256은 `ab0593fd855e531896308eff06aa3342992b3195abb7150c7a3686e5d633d6bc`이고 모델/API·network·DB 호출은 0, 캠페인은 **0/1,000**이다.

### O76. 새 빈칸 공급은 dual-pass 133개를 확보했고 6/20/12 장르 균형 split을 동결했다

- Reviewer A는 source integrity·inference target 렌즈로 PASS 134/EXCLUDE 23/DOMAIN_REVIEW 0, Reviewer B는 paired item·KILLER headroom 렌즈로 PASS 151/EXCLUDE 2/DOMAIN_REVIEW 4를 각각 157/157 봉인했다. root가 두 verifier와 source-frame verifier를 상대 결과를 합치기 전에 다시 실행했다.
- 고정 reconciliation 규칙으로 PASS/PASS **133**, 어느 한쪽 EXCLUDE 23, EXCLUDE 없이 DOMAIN_REVIEW 1이다. 이전 strict frame의 24/59와 달리 수량과 네 장르 공급이 모두 충분하다.
- passage text·private note·prospective target·문항 점수를 보지 않고 고정 discourse/topic cell quota와 seeded content-hash 순서만으로 38개를 선택했다. development 6은 논증2/설명2/서사1/실용1, confirmatory 20은 네 장르 각5, reserve 12는 논증3/설명3/서사4/실용2다. 다섯 topic class도 모두 포함한다.
- 이 split은 생성 결과를 본 뒤 top-up하지 않는다. 권리 처리는 별도이고, operational seal 직전 generation history refresh, provider/retry envelope, private queue binding이 남아 있어 campaign eligible은 0이다.
- reconciliation manifest SHA-256은 `7e2d2d4b936d710836c13ba7b97f7e5b0773a0ad6bff36a282a9b6a164b05028`이다. API·network·DB·secret access·문항 생성은 0, 캠페인은 **0/1,000**이다.

### O77. 호출 상한은 env 두 개가 아니라 공개 인수·SDK·Trigger·PREMIUM repair까지 닫아야 한다

- 독립 설계 재감사는 application retry `R`, AI SDK hidden retry `K`, outer quality attempt `E`, Trigger whole-job attempt `T`를 분리했다. env만 cap해도 public `maxRetries/maxAttempts`, `Infinity/NaN/huge`, ladder parse retry, PREMIUM `experimental_repairText`가 우회하므로 충분하지 않다.
- production default를 유지하는 상한 `R=2, K=2, E=2, T=2`를 모든 소비 경계에서 강제하면 engine 1회 physical 상한은 STANDARD blank 648, PREMIUM blank 162, STANDARD grammar 675, PREMIUM grammar 378이다. Trigger job 전체의 보수 상한은 1,296/324/1,350/756으로 두 배다. legacy planner·중복 client submit은 별도 범위다.
- research single-dispatch는 active ALS에서 `R=0, K=0, ladderParse=0, structuredRepair=false`여야 한다. 같은 outer topology의 complete registry를 가정한 산술은 24/6/25/28 physical이지만, 이는 stage당 single-dispatch이지 assignment당 단일 호출이 아니다. `maxAttempts=1`도 내장 floor와 relaxed/scarce/salvage를 없애지 않는다.
- ordinary `questions[]` cardinality, forceJsonFallback/json_object exact성, complete four-cell registry, 제한된 provider key는 여전히 별도 BLOCK이다. 설계 verifier는 통과했고 manifest SHA-256은 `b20b0004f8fce70333abfe70d11e935c771341f3ec178dfa056e7a99915c0eb6`; production 구현은 이 관찰 시점에는 아직 시작 전이다. API·network·DB는 0, 캠페인은 **0/1,000**이다.

### O78. 빈칸 source-frame v2의 Reviewer-B verifier 타입 오류는 결과를 바꾸지 않고 투명하게 재봉인했다

- `cross-type-blank-source-frame-v2/verify-reviewer-b.mts`의 `Set` 추론만 `Set<string>`으로 명시했다. 이는 컴파일러 수준 수정이며 reviewer 판정, reconciliation 규칙, split seed, passage/ID binding을 바꾸지 않는다.
- `POST-FREEZE-TYPECHECK-REMEDIATION.md`를 추가하고 Reviewer-B manifest와 reconciliation manifest에 포함했다. Reviewer-B verifier, `reconcile-and-split.mjs --write`, finalizer, reconciliation verifier를 모두 다시 실행했고 PASS/PASS 133, EXCLUDE 23, DOMAIN_REVIEW 1과 development 6 / confirmatory 20 / reserve 12가 그대로 재현됐다.
- 새 `RECONCILIATION-MANIFEST.sha256` 파일 SHA-256은 `b3b9fefd73c4e33bae1909aeb783910d9601a170848f3629852ea1a21f94e27f`이다. 운영 권리·history refresh·provider/queue 봉인은 여전히 별도 hold이며 API 사용량은 **0/1,000**이다.

### O79. 어법 공급은 빈칸 후보 전체를 빼는 대신 실제 운영 선택 38개 cluster만 배제해야 38개 이중합격 목표를 충족한다

- v1은 빈칸 screen의 선행 157개를 전부 배제해 focus-grammar queue 307개 중 150개만 남겼다. 과거 dual-pass 19/52의 one-sided 95% Clopper–Pearson 하한으로 계산한 최소 queue 186에 36개 부족해 `HARD_BLOCK`이었다.
- v2는 빈칸 v2의 실제 운영 선택 38개와 그 exact/normalized/transitive near-duplicate cluster만 배제한다. 추가 충돌은 0이었고 269개가 남았다. 같은 보수 하한 `0.2541665012621336`에서 dual-pass 38개 도달확률은 n=186에서 `0.95285793615`, n=185에서 `0.94874355858`이므로 최초 186개를 immutable queue 순서대로 결속했다.
- passage 내용·예상 어법 자리·reviewer 결과를 이용한 양성 선택이나 탈락 후 top-up은 없다. binding SHA-256은 `4ef61dc5cf515427fcb2de75e063282f2b4e84af8c52b048bf21ee10f6fd6ae1`, `MANIFEST.sha256` 파일 SHA-256은 `ba8cddbc7dfa536e5d649e80acbf4f2c618d4ab116cef4267bd4c9f64e71d192`이다. Reviewer A/B 전수 186개가 모두 봉인되기 전 campaign eligible은 0이다.

### O80. 완전히 새 blind v9는 post-fit 128/128 뒤에도 46개의 실제 구조 누락을 찾았다

- author는 기존 source/test/v7/v8/research note를 보지 않고 4 family×40=160개(정상 80, 결함 80)를 만들었고 source-aware auditor가 pre-inspection seal을 확인한 뒤 실행했다. 전체는 TP 33 / FN 47 / FP 13 / TN 67, accuracy 62.5%, recall 41.25%, specificity 83.75%로 BLOCK이었다.
- 독립 adjudicator가 disagreement 60개와 paired control 60개를 전수 검토했다. `CONFIRMED_ORACLE` 46개는 summary full-option/key 14, grammar rendered-label 18, dependent-fragment 14였다. sentence-order 13개는 제품 계약이 요구하는 `(A)/(B)/(C)`와 generic alternate-label oracle의 범위 불일치였고, fragment 1개는 이미 상위 paragraph-too-short wrapper가 위치 3곳 모두에서 잡는 중복 진단이었다. 모호·누락은 0이다.
- 따라서 sentence-order를 임의 라벨 체계로 넓히지 않는다. 46개만 좁은 paired regression으로 수정하고, 그 뒤에는 v9 재맞춤 점수가 아니라 다시 처음 보는 v10 holdout으로 평가한다. v9 pre-inspection manifest는 `2f8e98078388d74b1e3f2d84e6bab25ff337e63898cb4802e265049146aae1dc`, source-aware post-audit manifest는 `5b0173ada3708b16368b3779aace1f0aa9dec512fa332653f640e9b155103d11`, adjudication `MANIFEST.sha256` 파일 SHA-256은 `3633225a9a3d0f778be4c16753af62514df7cdf08d846373aac76e9149482036`이다. API 사용량은 **0/1,000**이다.

### O81. Workbench가 이미 소유한 요청 문항 수를 ordinary structured schema와 실제 Atlas wire에 넣었다

- 기존 연구 ALS의 `.length(N)`은 유지하면서, Workbench production plan이 정규화한 `expectedTypeCount`를 AI schema와 alternate structured schema 양쪽에 넘겼다. 연구 seal과 production count가 다르거나 양의 safe integer가 아니면 provider 이전에 실패한다. count를 모르는 다른 생성·편집 호출자는 기존 unbounded wrapper를 유지한다.
- 활성 영어 25유형은 모두 AI 또는 alternate structured 경로에 속하며, zero-network 검증에서 각 유형의 `questions`가 요청 count와 같은 `minItems=maxItems`를 냈다. 실제 Atlas request-body probe도 count 2를 그대로 `response_format.json_schema`에 실었다. 기존 Phase-C 연구 wire 4개와 새 cardinality 5개, 전체 TypeScript, 대상 ESLint가 통과했다.
- 이 수정만으로 ordinary provider가 schema를 반드시 집행한다고 확정하지 않는다. ordinary request에는 아직 `provider.require_parameters=true`가 없으므로 provider enforcement와 실제 Gemini 수용성은 별도 실험 hold다. production source closure 독립 감사 전 판정은 `PASS_LOCAL_WIRE_DECLARATION_ONLY_PROVIDER_ENFORCEMENT_BLOCKED`이며 API 사용량은 **0/1,000**이다.

### O82. retry·SDK·Trigger 상한 구현은 독립 감사에서 통과했지만 plain-text와 운영 registry는 계속 막혀 있다

- application retry와 outer attempt는 public/env 입력을 포함해 production default를 보존하는 `0..2`·`1..2` hard cap으로 정규화했고, 다섯 SDK 호출점은 `maxRetries`를 명시했다. Trigger `maxAttempts=2`, ordinary ladder parse retry 1, research ladder parse retry 0, research structured repair/continuation 금지를 실제 소스에 연결했다.
- 독립 감사가 current source 41개를 다시 봉인하고 retry/reasoning/cardinality 15/15, Phase-C/cardinality wire 9/9, 전체 기록 326/326, global TypeScript, targeted ESLint를 통과했다. 최종 drift는 0이다. ordinary engine physical 상한 648/162/675/378과 Trigger 1,296/324/1,350/756도 독립 verifier가 재계산했다.
- 이 PASS는 `등록되어 admission된 각 stage당 single-dispatch`다. plain-text prompt-JSON 응답은 client parse 전에 provider가 여러 full-question object를 출력할 수 있고, 네 셀의 root/repeat/repair/ladder/solver/scarce/salvage를 모두 담은 승인 registry도 아직 없다. 따라서 판정은 `PASS_SCOPED_WITH_EXPLICIT_BLOCKS`, 실행 권한은 0이다. 감사 `MANIFEST.sha256` 파일 SHA-256은 `1ae9fd31f23a03931f20a29b853d22fae22d71f0a83ade1c9dd5d25d616a834f`, API 사용량은 **0/1,000**이다.

### O83. v9의 확정 결함 46개만 고친 뒤 다시 처음 보는 v10 200개를 봉인했다

- 독립 adjudication에서 제품 계약과 일치한다고 확정한 summary full-option/key 14, grammar rendered-label 18, dependent-fragment 14만 수정했다. alternate sentence-order 라벨 13개는 제품이 고정한 `(A)/(B)/(C)` 계약 밖이라 넓히지 않았고, 상위 wrapper가 이미 잡는 fragment 1개도 중복 emitter를 추가하지 않았다.
- 확정 결함 46/46과 paired controls 46/46, 총 92/92가 통과했고 frozen v8 128/128, 관련 단위 141/141, ESLint와 전체 TypeScript도 통과했다. remediation `MANIFEST.sha256` 파일 SHA-256은 `0441d39b200613998db907bed3e49f7a4ec0e4a06dc4ed32fdb6509afced1704`다.
- post-fit 수치를 최종 증거로 쓰지 않기 위해 별도 author가 production source·tests·v9를 보지 않고 4 family×50=200개, family별 결함25/정상25의 v10을 만들었다. root는 내용을 열기 전에 author verifier로 payload seal `2ddce4ecbebdcbb5d411a812185f2613d3639a727ab4ded3e8aa594c231fbc03`과 균형 구성을 확인했다. pre-inspection manifest file SHA-256은 `d49592fd684fc91d3f918fd6fe3031523a42853c81fb770d55f7101f39d4b66a`다.
- 현재 fresh source-aware auditor가 blinded projection에서 200개 예측을 먼저 봉인한 뒤에만 oracle을 여는 중이다. 결과 전까지 v9 remediation의 일반화 판정은 미확정이며 모델/API·network·DB 호출은 0, 캠페인은 **0/1,000**이다.

### O84. 여덟 prompt profile을 연구 전용 single-shot 경로에 연결하고 15개 실제 wire를 network 없이 검증했다

- G0/G1/G2/G3와 B0/B1/B2/B3를 AsyncLocalStorage 연구 scope 안에서만 활성화했다. 일반 호출은 prompt/schema/candidate 객체를 그대로 통과한다. B1 PREMIUM은 B0와 byte-identical이므로 operation·stage·fetch 전에 거절한다.
- S1은 profile×plan 비교를 위해 root candidate request 1회, application/SDK retry 0, structured repair·candidate repair·grammar ladder·solver 0으로 고정한다. 프로덕션 parity 주장이 아니라 mechanism screen이며, 후속 holdout에서는 별도 full-topology mapping이 필요하다.
- G3는 `errorDesign`을 typed `siteCertificate`로, B3는 `blankDesign`을 typed `blankBlueprint`로 wire에서만 교체한 뒤 raw candidate를 먼저 원장에 관측하고 exact adapter를 통과한 객체만 기존 post-process/gate에 넘긴다. adapter는 whitespace를 보존한 단일 source window, mutation/marker 전 필드, blank target/window/slot, 고유 evidence와 실제 참조 ID, 다섯 option-intent·key를 재결속한다.
- 사전 고정 비용 계약대로 어법 output cap 6,000, 빈칸 4,000을 research profile wire에 연결했다. 실제 Atlas zero-network 15셀은 각 1 fetch, STANDARD `google/gemini-3.5-flash`, PREMIUM `google/gemini-3.1-pro-preview`, `provider.require_parameters=true`, reasoning disabled/none/exclude, `questions.minItems=maxItems=1`, 해당 output cap을 냈다. B1 PREMIUM은 fetch 0이었다.
- frozen v1의 exact treatment는 그대로다: G2/G3/B2/B3 길이 960/1,641/926/1,612와 SHA-256 `fc0170…`, `001139…`, `ff1099…`, `1b98cb…`가 일치한다. profile 단위 6/6와 wire 3/3, 대상 ESLint는 통과했으며 current source 독립 v2 감사가 진행 중이다. 독립 감사 전 실행 권한은 0, API 사용량은 **0/1,000**이다.

### O85. 어법 source-frame v2의 Reviewer A는 186개 전수를 봉인했지만 단독 PASS를 공급으로 쓰지 않는다

- Reviewer A는 186/186 passage를 source integrity·어법 출제 가능성의 고정 7기준으로 직접 검토해 PASS 142, EXCLUDE 40, DOMAIN_REVIEW 4로 봉인했다. sampling·대리검토·탈락 후 replacement/top-up은 없었고 외부 API·network·DB·문항 생성도 없었다.
- root는 Reviewer B 결과를 보거나 reconciliation하기 전에 A 전용 verifier를 다시 실행해 186행 binding·aggregate·privacy를 확인했다. `REVIEWER-A-MANIFEST.sha256` 파일 SHA-256은 `efc035a81f16f158354a9d60ab3d0c2ab45a555c47afb4c3d9d374c0b29e31bf`다.
- A의 142개를 campaign eligible로 승격하지 않는다. Reviewer B가 독립 186/186을 봉인한 뒤 EXCLUDE 우선·DOMAIN defer·PASS/PASS only 규칙으로 합치고, 38개 이상일 때만 고정 6/20/12 split을 만든다. 현재 eligible은 0, 캠페인은 **0/1,000**이다.

### O86. prompt-profile 배선은 pre-fix BLOCK 두 건을 닫고 최신 소스 독립 감사에서 local PASS를 받았다

- 독립 감사가 최초 배선에서 G3/B3 provider schema description drift와 두 fail-open을 발견했다. G3는 원문에 없는 비정답 marker를 인증서 밖에서 만들 수 있었고, B3는 같은 distractor mechanism 네 개를 반복해도 adapter가 받았다. 해당 pre-fix 증거와 seal은 지우지 않고 별도 보존했다.
- frozen v1 description 19곳을 바이트 동일하게 복원하고, G3의 모든 비정답 marker를 unique source window/expression에 재결속했으며, B3는 네 primary mechanism의 고유성을 server adapter에서 재계산한다. frozen comparable schema와 exact `questions.length(1)` wrapper 해시는 G3 `40e24f…`/`0e8761…`, B3 `3130f8…`/`0f6a3e…`로 각각 정확히 일치했다.
- 최신 소스에서 8 profile, 15 applicable profile×plan 실제 entrypoint wire, reasoning-off, Flash/Pro model, `require_parameters`, count 1, output cap, raw-candidate identity, engine drift preflight, ordinary-call identity를 다시 검증했다. focused 70/70, 전체 TypeScript, ESLint와 감사 verifier가 통과했다.
- 판정은 `PASS_LOCAL_INTEGRATION / CAMPAIGN_NO_GO`다. 실문항 품질 효과·제한 키·180행 queue·live provider·full-topology 확인은 아직 없다. 감사 `MANIFEST.sha256` 파일 SHA-256은 `481031ce4fd6023682a6d986c5030ac171f9f4a7fd7c578944824b7a2527b60e`, API 사용량은 **0/1,000**이다.

### O87. 어법 source-frame도 PASS/PASS 137개를 확보하고 6/20/12 split을 독립 재현했다

- Reviewer A 186/186과 Reviewer B 186/186을 EXCLUDE 우선, 그다음 DOMAIN_REVIEW, 오직 PASS/PASS만 채택하는 규칙으로 합치자 `DUAL_PASS 137 / EXCLUDE 42 / DOMAIN_REVIEW 7`이었다.
- passage·예상 문제점·생성 결과를 보지 않고 고정 topic quota와 content-blind seeded rank로 38개를 선택했다. development 6, confirmatory 20, reserve 12이고 topic quota는 모두 exact다. 전체 38개 담화는 논증14/설명15/서사8/실용1이라 한 담화가 절반을 넘지 않는다.
- 독립 verifier가 실제 186개 판정과 선택행을 전수 재계산하고 공개 산출물의 ID·content hash·passage·개별 판정·split membership 누출 0을 확인했다. replacement/top-up은 0이다.
- history·rights·provider·운영 queue는 별도 hold라 campaign eligible은 0이다. 공개 reconciliation manifest 파일 SHA-256은 `ce735aed8eb7f9174e2df7b57ec8de2d0e1c8a110e697a6a62d36214de059af9`, API 사용량은 **0/1,000**이다.

### O88. 선택된 어법·빈칸 76개는 현재 production DB 생성 이력과 다시 대조해 76/76 clean이었다

- pinned snapshot에서 당시 `Question=0`, `aiGenerated Question=0`, `WorkbenchAiJob=0`이었던 dual-pass development/confirmatory/reserve 총 76개를 현재 DB의 모든 학원 영어/null-subject passage 2,733개, normalized content group 1,872개와 읽기 전용으로 다시 대조했다.
- 동일 내용 DB passage가 있는 행은 빈칸 development/confirmatory/reserve 1/4/1, 어법 2/6/6이었지만, 그 어느 행에도 현재 Question 또는 Workbench job exposure가 없어 **history clean 76 / exposed 0**이었다. DB write와 모델 호출은 0이다.
- prospective corpus/review 파일은 지문을 포함한다는 이유만으로 antecedent model history라고 잘못 세지 않는다. repo antecedent history는 pinned v3 snapshot이 담당하고, 이 refresh는 변하는 production DB delta만 담당하도록 경계를 분리했다.
- 이 결과는 생성 허가가 아니며 pre-dispatch 새 label로 다시 캡처해야 한다. public artifact SHA-256은 `e952933f2f3cd976288aa4bf9865a304c0f5740bb594f075e7a945522dc57d61`이고 독립 DB/쿼리/프라이버시 감사가 진행 중이다. API 사용량은 **0/1,000**이다.

### O89. 새 v10은 원시 125/200이었고 source-aware 판정 뒤에도 실제 구조 결함 34개가 남았다

- 완전히 새 200개에서 production 함수는 TP25/FN75/FP0/TN100, 62.5%였다. FN 75개와 1:1 정상 control 75개를 전수 source-aware 판정하자 `CONFIRMED_PRODUCT_CONTRACT 34 / ORACLE_SCOPE_MISMATCH 41 / AMBIGUOUS 0 / REDUNDANT_UPSTREAM 0`이었다.
- 확정 결함은 English summary의 authoritative full-option/key binding 13, English sentence-order의 independent matrix clause 누락 10, product exact `(A)/(B)/(C)` standalone label 위반 11이다. 한국어 summary 12, canonical `(A)~(J)` 밖 grammar label 19, 영어 lane 밖 한국어 order unit 10은 범위 불일치라 패치 근거에서 제외한다.
- blind prediction process는 oracle 없는 shuffled projection만 읽고 adjudication 전 predictions를 봉인했으며 재실행 hash가 일치했다. 다만 최초 PowerShell UTF-8 parse 실패가 supervisor shell에 일부 oracle을 노출했으므로 supervisor-level perfect blind라고 과장하지 않고 OS filesystem sandbox도 없었다고 기록했다.
- verifier, 42/42 관련 단위, scoped/global TypeScript, ESLint가 통과했다. manifest SHA-256은 `0286ddca35caaa444e4dd9fa4b4a93f5b5b01d1eed1e67d6bab251cd86551465`이다. 지금은 34개만 confirmed-only remediation 중이며 그 뒤에는 새 v11이 필요하다. API 사용량은 **0/1,000**이다.

### O90. 선택된 어법·빈칸 76개는 현재 DB 재캡처에서도 직접·보조 계보 노출 0으로 유지됐다

- 독립 감사 verifier를 root가 2026-07-15 KST에 다시 실행했다. 모든 학원의 `Passage` **2,736행**을 읽어 exact normalized-content를 재계산했고, 선택 집합과 일치한 20행은 pinned DB ID 20개와 모두 내용까지 동일했다. repo-official 56행을 포함한 전체 선택 집합은 어법 38 / 빈칸 38이다.
- 직접 연결 노출은 `Question=0`, `aiQuestion=0`, `WorkbenchAiJob=0`이었다. 보조 exact-ID 계보도 `NaeshinQuestion=0`, custom/similar question job reference=0, detached Workbench config/result reference=0이었다. DB write·모델/API 호출·문항 생성은 모두 0이다.
- 공개/비공개 seal 6개, public-to-private binding, 공개물의 원문·비공개 ID 비노출도 다시 통과했다. 판정은 **PASS(범위 한정)**다. exact-content 검사는 near duplicate·삭제된 과거 내용·모든 대체 저장소를 증명하지 못하고, frozen selector 자체는 전체 공급 부족 때문에 여전히 ready가 아니다. 실행 직전에는 같은 verifier로 다시 recapture해야 한다.
- 독립 감사 artifact는 `experiments/question-quality-20260715/reviews/selected-source-history-v1-audit/`이며, API 사용량은 계속 **0/1,000**이다.

### O91. fresh v12는 validator 자체 384/384와 relaxed 출하 정책을 분리해 51개 누수를 찾았고, 독립 판정 뒤 최소 5개만 차단했다

- v11 fresh 288개는 target-code exactness TP144/TN144를 냈고, production false positive처럼 보인 12개 control은 source-aware 재검토에서 실제 invalid control로 판정됐다. 그 결과를 다시 외운 테스트로 끝내지 않고, 별도 author가 64 family×3 lexical variant×defect/control = **384개** v12를 새로 봉인했다.
- v12 validator target-code exactness는 TP192/TN192/FP0/FN0였지만 relaxed production policy는 TP138/TN195/FP0/FN51이었다. 즉 emitter가 오류를 찾고도 17개 코드가 relaxed blocklist에 없어 출하될 수 있었다. 동시에 v12의 `controls 192/192 globally valid` 주장은 독립 검토에서 `확정 유효 117 / 의미 정답 모순 6 / 해설 문법 결함 12 / 원문 부재 15 / 현행 production profile 불일치 42`로 반박됐다.
- 51행·17코드를 production schema·후처리까지 다시 실행한 독립 adjudication은 A 15행·5코드, C 36행·12코드, B/D 0으로 분류했다. A는 `generic-answer-count`, `generic-multi-answer-direction`, `sentence-insert-missing-given`, `sentence-order-dependent-fragment`, `sentence-order-paragraph-body-label`이고, C는 상류 schema/post-process 또는 기존 blocker가 이미 제거하는 중복 방어였다.
- 위 5개만 `RELAXED_BLOCKING_QUALITY_CODES`에 추가했다. 후속 독립 감사는 A 15/15가 relaxed-blocking이면서 salvage/SHIP_FIRST에는 0, C 36/36 certificate PASS, 의도하지 않은 C blocklist 추가 0을 확인했다. unit 40/40, 전체 TypeScript, ESLint가 통과했다. remediation audit SHA-256은 `bac4a83cec974cba27c656e3e5d9e86c08bb82b32931106d319cb42948db2ce6`, manifest SHA-256은 `ed48dd6fc44394e2099d3c03056306e48a56788108b8ed9e2480ebd30a4f07b0`이다. API 사용량은 **0/1,000**이다.

### O92. S1은 12개 지문·180 assignment로 완전히 동결했지만 실행 자격은 여전히 0이다

- 어법/빈칸 dual-pass corpus의 development 6개씩, 총 12개 지문을 I/K와 STANDARD/PREMIUM에 균형 배치해 S1 **180 assignment**(어법 96, 빈칸 84; STANDARD 96, PREMIUM 84; I 90, K 90)를 만들었다. B1 PREMIUM은 B0와 byte-identical이라 사전 규칙대로 0회다. 이 queue는 profile 효과 screen이지 full production topology parity가 아니다.
- reservation은 최대 `$44.16`, physical assignment hard count 180이고 campaign API counter와 별도 운영 원장을 함께 요구한다. public artifact에는 지문·DB ID가 없고 private queue SHA-256은 `ba2e64ea9989d594147019c3cf88b066266bbeff11eefb74cb8299732af52583`, 현재 public artifact SHA-256은 `f4e2085c90736042329d4a921cc2d28bfc81fe47bf4b72f410253a688c8b909a`, design manifest SHA-256은 `5a31e85be1b8c6c25fd0110f06566193c645f295e92566b60ecdd7ecefd6dff9`다. 뒤의 두 값은 research wire privacy route를 fail-closed로 강화한 뒤 다시 봉인한 현재 값이다.
- 독립 감사 판정은 `PASS_DESIGN_INTEGRITY_EXECUTION_REMAINS_BLOCKED`다. 남은 다섯 hold는 (1) 권리 근거, (2) privacy/allowlist, (3) 제한 credential과 provider hard-spend, (4) 실행 15분 이내 권위 가격표, (5) exact-wire registry다. 따라서 `campaignEligible=0`, 실제 생성은 계속 **0/1,000**이다.

### O93. production assignment 예산 경계의 소스 P0를 닫고, 실제 PostgreSQL 동일-job 경합까지 통과시켰다

- shared Atlas physical fetch 직전에 Workbench job ID별 durable lease를 원자적으로 예약한다. OFF는 callback 값·Promise·인자를 그대로 반환하고 Prisma/ALS를 건드리지 않는다. AUDIT/SHADOW는 인프라 telemetry 장애만 fail-open하며, inactive job·policy drift 같은 의미 오류는 절대 우회하지 않는다. CANARY 비선정 job은 관찰 모드이고 깨진 상세 가격 설정은 durable AUDIT warning으로 내리지만, 선정 job은 fail-closed다.
- enforcing wire는 exact endpoint/model/provider-routing hash, reasoning off, output cap×n, request UTF-8 byte 상한, 전 body의 multimodal/plugin 탐지, 현재 SDK top-level cost-shape allowlist, 15분 가격 freshness를 검사한다. DB 잠금 대기 뒤에도 `dispatchNotAfter`를 fetch 직전에 다시 확인한다. Trigger는 terminal-state CAS와 run ownership으로 FAILED/CANCELLED를 PROCESSING으로 부활시키지 않으며 budget 오류를 terminal/refund 처리 뒤 재시도하지 않는다.
- zero-network SDK wire와 focused budget test **24/24**, architecture focused **62/62**, 전체 TypeScript, Prisma validate, ESLint가 통과했다. 이어 격리 loopback PostgreSQL 16.14에 실제 migration을 적용했다. 동일 job 100-way cap7은 delegate 7·reject 93·ordinal 1~7, mixed-cost 100-way는 physical cap100인데 USD cap 8,000에서 delegate 6·reject94·예약 7,700, ordinal 재진입은 1~5를 정확히 이어갔다. terminal-wins는 delegate0, lease-wins 뒤 terminal은 이후 delegate0, ENFORCE→SHADOW drift callback0, illegal state CHECK 2종도 모두 PASS였다.
- DB integration artifact는 `reviews/production-assignment-budget-v1-postgres-integration/`, results SHA-256 `2b8cc1eeafd06c3347afb162bb01379d867ce7e4ec5fc9435e8411484459779e`, manifest SHA-256 `0d1ac2288db10211556985a3f620f8098764640f470c72220165d2eb357b6544`다. OpenRouter/API·외부 network·production DB write는 0이다.
- 이 통과로 local PostgreSQL atomicity hold는 닫혔지만 실제 `CANARY_ENFORCE/ENFORCE`를 허가하지 않는다. 최신 권위 가격표, provider 측 독립 hard-spend cap, 셀별 통계 cap, staging migration/deploy topology 증거가 없고 migration도 배포하지 않았다. 운영 기본값은 계속 **OFF**, 캠페인은 **0/1,000**이다.

### O94. 지금까지의 개선은 “오류 0”의 하한을 강화했을 뿐, 아름다운 킬러 문항 효과를 증명하지 않았다

- v12 remediation 5개와 assignment budget은 정답 가능성·출하 무결성·비용 폭주를 막는 안전장치다. 이들은 오답 선지의 의도성, 함정의 경쟁 강도, 어법 자리의 교육적 가치, 해설의 압축성과 정확성을 직접 개선했다는 실험 결과가 아니다.
- 따라서 안전성 PASS를 prompt profile 품질 승리로 합치지 않는다. S1 180개는 권리·privacy·limited credential·fresh price·exact wire가 모두 닫힌 뒤에만 실행하고, 고정 rubric의 validity와 craft를 분리해 blind dual review한다. profile 승격은 parse/yield/fatal 회귀와 비용을 함께 통과해야 하며 n=6 cell 점추정으로 승자를 선언하지 않는다.
- 특히 STANDARD Flash에 premium ladder를 붙이거나 평균 재생성을 늘리는 과거 Pareto 열위안을 되살리지 않는다. 새 모델 호출을 한 건도 쓰지 않은 현재 단계의 정확한 상태는 **구조·운영 안전성 대폭 보강 / 문항 미학 효과 미측정 / API 0/1,000**이다.

### O95. production 사용 원장은 비용 규모의 기준선을 주지만 품질 인과 추론 자료는 아니다

- frozen public v3 snapshot을 독립 재계산한 결과 Workbench job 15,311건, cost row 19,070건, join event 19,064건, orphan 6건, KST 44일, mixed ledger cost `$462.304344`가 산술적으로 일치했다. 최대 일자는 2026-06-28의 job 2,524건·event 3,465건·`$85.199761`이고, 배포 시각 이후 timestamp-correlated slice는 job 8건·event 19건·`$0.463582`다.
- 이 값은 reconstructed estimate와 gateway-recorded amount가 섞인 운영 기준선이며, 배포 전후 품질 효과나 모델 가격 실험으로 해석하지 않는다. public snapshot SHA-256은 `44782149c518bbff736e78a76b5039ba95bbe3ba58c1454d26ff2802492ecd25`, private snapshot SHA-256은 `959c7790d4f40e473047080180d528d8e67a82bde8fb7c9035d8f91cba7f5563`, audit script SHA-256은 `99f1166e09277d8c1189c1d67086310a11e62732f2d6efe787bd4e70ec326c91`다. 독립 verifier는 privacy와 산술을 PASS했고 API 사용량은 0이다.

### O96. v5 S1의 12개 기존 지문은 출처 추적은 되지만 외부 모델 처리 권리가 행 단위로 증명되지 않았다

- 독립 local rights audit에서 repo official/EXAM 9개·134 assignment와 DB HANDOUT 3개·46 assignment 모두 `rightsRecord=NOT_PRESENT_IN_SNAPSHOT`으로 판정됐다. 출처 라벨, 공식 시험 표기, 일반 약관 동의는 full text의 외부 model-processing chain 전송 권리를 대신하지 않는다.
- 따라서 v5의 180건을 그대로 호출하지 않는다. 현 실행 자격은 0이다. 해결 방향은 불명확한 기존 지문에 권리를 추정하는 것이 아니라, S1 목적에 맞춰 직접 작성하고 PII를 제거한 새 v6 corpus에 생성 시점·작성 주체·허용 처리 범위가 결합된 provenance record를 봉인하는 것이다. 이 감사도 network/model/DB call 없이 API 0/1,000을 유지했다.

### O97. 현재 production core의 180개 exact wire는 재현 가능하지만, 그것만으로 durable 실행 허가는 아니다

- local fetch interceptor 아래에서 frozen 180 assignment 전부를 현재 production generation core로 두 차례 독립 재생했다. 매 replay마다 assignment당 정확히 1회, 총 180회가 intercept됐고 180개 wire body가 모두 고유하면서 두 replay 간 byte-identical이었다. model/profile/difficulty/schema/token/reasoning-off와 `google-vertex/global` 단독 `order`·`only`, fallback 차단, `require_parameters`, `data_collection=deny`, `zdr=true`가 모두 일치했다.
- official controller preflight public artifact SHA-256은 `e9c70852df618c9e1069c91cee6b6ff4efc362be3d11df8ccc35f29ece77b720`, manifest SHA-256은 `8ace7726634fd2cd2d579a517e0e16422975e34f169cd9b556a315be06ccdf05`다. 독립 replay result SHA-256은 `39727e103dc98b0d093054657230a93d5214d8a6ef6439417d9b6594664600a3`, manifest SHA-256은 `c2f1bdc4f632ce07b9a08575e36bfdaefec9a9a2bd89c5de09f1ed62daa20cd2`다.
- 다만 이 preflight는 Fast/Trigger entrypoint, empty retry, durable assignment budget, lease·outcome ledger, 최신 가격, provider hard cap을 실행하지 않았다. 그러므로 판정은 `PASS_OFFLINE_WIRE_PREFLIGHT_ONLY_EXECUTION_BLOCKED`이며 provider/model/API call은 0이다.

### O98. 로컬의 기존 OpenRouter credential은 S1 전용 zero-usage hard-capped key가 아니다

- 공식 read-only `/api/v1/key` metadata를 단 한 번 조회한 결과, 기존 credential은 전용 campaign label 조건, `$44.16` 이하 finite cap, remaining=limit, zero prior usage, BYOK limit 포함 조건을 충족하지 않았다. key 값·hash·label은 출력하거나 저장하지 않았고 account mutation과 model/generation call은 0이다.
- 판정은 `BLOCK_NOT_A_DEDICATED_ZERO_USAGE_HARD_CAPPED_S1_CREDENTIAL`이다. audit result SHA-256은 `ad16442218ca19da9ac76698812b7f8e1ec41d02c9c905bd67e85bc02f9c6d84`, manifest SHA-256은 `811cb740d44a33d59ddc5ba20cae5b201ef9f0ad124689113e530885a8933bc0`다. 이 credential을 full 180-run에 재사용하지 않고, 향후 실행기는 전용 환경변수와 독립 per-assignment cap이 없으면 fail-closed해야 한다.

### O99. privacy hardening 이후 v5 source closure를 다시 봉인했지만 권리·계정·가격·durability hold는 그대로다

- current public artifact `f4e2085c90736042329d4a921cc2d28bfc81fe47bf4b72f410253a688c8b909a`와 manifest `5a31e85be1b8c6c25fd0110f06566193c645f295e92566b60ecdd7ecefd6dff9`에 대해 official builder를 `--write`로 재생했으며 pre/post 여섯 hash와 private queue가 모두 동일했다. Workbench fast·Trigger·generation engine·Atlas·production/research fetch boundary·scope coordinator·budget runtime/policy·research runtime/profile·LLM wire·phase runner·callsite adapter의 현재 source closure를 포함한다.
- 독립 v3 판정은 `PASS_CURRENT_SOURCE_AND_OFFLINE_WIRE_EXECUTION_REMAINS_BLOCKED`이고 감사 manifest SHA-256은 `3c704e1ff35ab428cef9b6c60dd0ac7786c4757686b9dfb3c116c931d611666a`다. 요청 단위 route/ZDR 강제는 account logging·retention·guardrail과 endpoint availability를 증명하지 않으며, rights-clear v6 corpus·전용 제한 credential·15분 이내 exact-provider 가격·durable per-assignment registry가 모두 닫히기 전에는 생성 1건도 집행하지 않는다. 누적 API 사용량은 **0/1,000**이다.

### O100. 기존 지문 권리를 추정하지 않고, v6용 직접 작성 12개 지문으로 교체했다

- 외부 문서·web search·외부 API/model을 사용하지 않고 이 연구를 위해 새로 작성한 영어 지문 12개를 `corpus/original-s1-v6/`에 봉인했다. 어법 6개·빈칸 6개, topic family 12개, discourse family 12개이며 private exact-text artifact에 행별 작성 기원·비복제·PII 관찰·S1 v6 한정 외부 모델 처리 범위를 결합했다.
- 공개 artifact에는 지문 원문이나 설계 hinge가 없고, 12-token public leakage 0, 새 행 상호간 5-gram overlap 0, 기존 v5 12개 및 v3 retained 57개와 exact/8-gram overlap 0, machine PII pattern hit 0이다. private exact artifact SHA-256은 `bcb5d7683e9ee6bd110add462da6956dea6468e29dd2222d00067e80ddcabb68`, public artifact SHA-256은 `e7808d0cc562e6288c806beb2455a85eafb2b9f376b9073fd7f564163a33d9a2`, manifest SHA-256은 `79a1bb6aa928aafab5cf414caf7c078a35e7310ba33a472bce54bf09a8facd79`다.
- 이것은 corpus admission의 권리·PII 하한을 닫는 engineering record이지 전 지구적 독창성이나 법률 의견이 아니다. 문법성·자연스러움·시험 지문 적합성은 별도 독립 적대 감사가 PASS해야 하고, privacy/credential/fresh price/controller hold도 독립적으로 남는다. 현재 API 사용량은 **0/1,000**이다.

### O101. v6 원문은 비문 0이어도 표본 설계 편향 때문에 무조건 투입을 차단했다

- 독립 감사가 12행·127문장을 직접 검수하고 repo-wide 8-gram까지 재탐색한 결과 사전 비문·문법 오류 0, 내용 모순 0, PII 0, 저장소 중복 0, 공개 12-token leak 0이었다. 그러나 G02/G03/B05/B06의 비관용적·부자연스러운 표현, G03/G04/G05의 실제 문장과 맞지 않는 어법 affordance metadata, B02의 close-paraphrase 난도 위험을 확인했다.
- 더 중요한 표본 결함은 추천/strongest 빈칸 위치가 final 4, penultimate 1, middle 1로 final-or-penultimate가 5/6(83.3%)이라는 점이다. 유일한 middle B05도 원문 수정 전 차단이고, clean internal contrast/counterexample hinge와 anaphoric bridge 표본은 각각 0이다. 맞춤법·문법이 깨끗하다는 이유로 이 편향을 무시하면 terminal-thesis 빈칸에만 잘 맞는 profile을 일반 승자로 오판한다.
- 따라서 판정은 `BLOCK_UNCONDITIONAL_S1_V6_ADMISSION_PENDING_TEXT_METADATA_DIFFICULTY_AND_BLANK_POSITION_REMEDIATION`이다. public audit SHA-256은 `de1872c1d008b1f90eeab00787c50eafebed041748eb80925d2e465f0a64053e`, manifest SHA-256은 `351cc8d49fdee8e4458078c88ad732102f86f7bb6df2a0cf149e6f7f74637698`다. 현재 corpus를 호출하지 않고 원문·메타·빈칸 위치 층화를 수정한 뒤 다른 독립 감사로 다시 봉인한다. API는 **0/1,000**이다.

### O102. 연결성 확인 2건은 분석 표본과 분리한 전용 원문으로 제한한다

- 첫 실호출은 품질 비교가 아니라 현재 exact route가 Flash와 Pro에서 각각 한 번 작동하는지만 보는 serial 2-call run-in이다. 배정마다 candidate 1·physical fetch 1·outer attempt 1·SDK retry 0이고 repair·solver·fallback·replacement·top-up을 전부 금지했다. 실패·timeout·parse rejection도 각각 1/1,000을 즉시 소비하며 두 호출의 총 frozen worst-case cost는 `$0.34`다.
- run-in 관찰로 S1 profile을 고르거나 같은 지문을 실험 표본으로 재사용하지 않기 위해 별도 직접 작성 PII-free 원문 `OCVP-B01`을 봉인하고 S1/S2/S3/S4에서 영구 제외했다. pilot source public SHA-256은 `465e3d6d17bd6c2748fb69d05f3947f96ecc42d0abf71bd56f4e3dbb969933f6`, private SHA-256은 `8578b249210470bf87d7ba4670b342bba1a781384b8616242ca87d6ca42d7adf`다. pilot protocol SHA-256은 `b6eba782e92a16c8bba3b6b3b4c5a633449fba117fcf0b5e51a3dbf3f1e8b1f2`다.
- 현재는 corpus 검증과 protocol만 PASS한 설계 상태다. exact-wire registry, exact provider-tag fresh price, durable two-call ledger가 모두 닫히기 전에는 이 2건도 실행하지 않는다. API는 계속 **0/1,000**이다.

### O103. “아름다운 문항”을 오류 없음과 분리하고 1,000개 상한 안의 검증 가능 주장으로 고정했다

- 25개 활성 영어 유형에 공통 validity/fatal 층과 craft 층을 비보상적으로 분리했다. 정답 유일성·문법성·source/surface/scoring 동기화·사실인 해설·정상 렌더·누설 방지 중 하나라도 실패하면 즉시 F이며, 그 뒤의 미학 점수로 상쇄하지 않는다. A는 단순 무오류가 아니라 모든 visible element가 서로 다른 오개념을 시험하고, 증거 경로가 경제적이며, 난도에 맞는 함정이 끝까지 경쟁하는 경우로 한정했다.
- 최대 회계는 연결성 run-in 2 + focus BASIC sentinel 4 + S1 mechanism screen 180 + S2 focus first look 480 + 비집중 23유형의 STANDARD/PREMIUM×BASIC/KILLER sentinel 92 + S4 extension 240 = **998**이고, 나머지 2개는 post-hoc top-up에 쓰지 않는 잠금 여유다. 연결성 원문·출력은 S1~S4, profile 선택, calibration에 영구 재사용하지 않는다. 비집중 유형의 4개 표본은 결함 발견만 가능하며 clean 4건으로 유형 품질이나 모델 우위를 주장하지 않는다.
- focus 확증은 type별로 plan을 층화한 paired passage 설계다. INTERMEDIATE의 primary craft success는 B/A, KILLER는 A이며, 120쌍 interim에서 one-sided α=.005, 180쌍 final에서 α=.020을 써 두 유형×두 look의 FWER를 0.05 이하로 제한한다. `(challenger-only, control-only)=(.25,.10)`일 때 final exact McNemar power는 약 .906이고 `(.30,.10)`이면 .988이다. 네 type×plan validity cell은 challenger evaluable ≥86, confirmed fatal 0이어야 simultaneous one-sided 95% fatal-rate upper bound가 약 4.968% 아래가 된다.
- 이 설계는 현재 실행 허가가 아니다. S2/S4에는 권리·PII 조건을 만족하는 고유 focus passage cluster 360개가 별도로 필요하며, 실제 production topology가 assignment당 후보를 2개 이상 만들면 998 회계는 성립하지 않으므로 표본을 몰래 줄이지 않고 주장 범위를 축소해야 한다. verifier는 173개 조건과 합성 반례 13개를 통과했고 판정은 `PASS_DESIGN_ONLY_EXECUTION_BLOCKED`, `MANIFEST.sha256` 파일 SHA-256은 `5d576e4238a61234f7e6460e3c2506911b6a64c4991a2be30eec45debf730f36`이며 API·network·DB 호출은 0이다.

### O104. v6 원문 보정본은 구조 게이트를 통과했지만 작성자 자체검수만으로 입장을 허용하지 않는다

- 최초 독립 감사에서 드러난 어색한 문구 4건과 G03/G04/G05의 affordance 메타데이터를 고쳤고, 빈칸 표본을 내부 5·말미 1로 재층화했다. 내부 대조·반례 지점은 3개, 내부 지시·인과 bridge는 1개이며 여섯 행 모두 INTERMEDIATE/KILLER 양쪽 설계 여지를 기록한다. 정상 build가 과거 비공개 원문을 직접 읽던 비재현성 결함은 package-local SHA-256 fixture로 닫았다. fixture에는 정규화 원문 hash와 8-gram hash만 있고 원문·n-gram 평문은 없다.
- 보정 작성자의 seal은 private `342824222a0271798821b5369034d0faf7246bab84102a16cfcb64e67b8d8e68`, public `108380e8ba86dd358fed4543f329433e6c1d87e2c8455667dc3e9bf412659ddf`, manifest `2621b69dde74ee014ec4367fd03aba72f5d56e4d8f8eae4c90d432824d7e8eb7`, local hash fixture `a928c576b3dd86a0caae4f67444c112e218b0c80c7bcaaeb4298c457dbcf7b07`이다. root가 별도로 build·verify·targeted TypeScript를 재실행해 12행·어법 binding 30·내부 빈칸 5·말미 1·선정 과거 corpus 8-gram overlap 0·공개 누출 0과 같은 hash를 확인했다. API·network·model·DB 호출은 0이다.
- 문구 수정자와 다른 agent가 12개·127문장, 메타데이터·권리·PII, 30개 어법 binding, 6개 빈칸 지점과 뒤 문맥, hermetic closure를 처음부터 독립 재감사했다. 12행 자연스러움/문법성/일관성 PASS, 어법 30/30, 빈칸 INTERMEDIATE 6/6·KILLER 6/6·정답 유일성 6/6, 내부 5·말미 1, 뒤 문맥의 대체 정답 restatement 0이었다. 별도 broad filesystem scan은 9,057개 text file·451,837,985 bytes에서 새 원문과 겹치는 8-token hit 0을 냈고 tamper 10/10을 모두 거부했다. 판정은 `PASS_INDEPENDENT_V2_CORPUS_AUDIT_NOT_EXTERNAL_DISPATCH_AUTHORIZATION`, public audit SHA-256은 `a56aece108d9ccbf14ee1714f85611db53c8879e4df6a841ab666ec9f095cd7`, manifest SHA-256은 `0c1c2575d968d7d9555023ffabb63911cc4245595ca1b9d9db0b717494df243d`다. corpus hold는 닫혔지만 provider/price/controller/exact-wire hold는 남아 있으며 누적 API 사용량은 **0/1,000**이다.

### O105. 180회 durable controller의 최초 보정본에서도 장시간 실행과 응답 cardinality 결함을 발견했다

- 초기 구현은 runtime type을 신뢰해 실제 180-cell 교차표를 충분히 재검증하지 않았고, `NaN` 시각·비용 값이 비교식을 우회할 수 있었으며, child process가 알 수 없는 상위 환경변수를 상속하고, request-envelope/profile artifact hash가 실행 provenance에서 탈락할 수 있었다. 이를 runtime enum·정확한 6+6 passage 교차표·B1 Premium 0·출력 cap 6,000/4,000·권리/본문 hash·유한수·환경 allowlist·artifact binding 적대 테스트로 보정 중이다.
- 더 큰 운영 결함은 credential/가격 증명이 15분 뒤 만료되는데 180개 직렬 Gemini 호출은 그 안에 끝날 수 없다는 점이었다. 가격 timestamp가 캠페인 semantic identity 안에 남으면 갱신 때 새 캠페인으로 갈라져 완료 셀 재생·예산 이중예약 위험이 생긴다. immutable campaign/batch identity와 rolling 15분 credential·schema-v2 tag-price attestation을 분리하고, 같은 durable batch에서 window1 일부 완료→만료 차단→window2 재개→완료 셀 replay 차단→총량 180 유지→동결 emergency envelope를 넘는 가격 상승 차단을 가짜시계로 증명하기 전에는 executable로 보지 않는다.
- raw OpenRouter parser가 `choices[0]`만 읽어 서버가 두 completion을 돌려줘도 한 후보로 숨길 수 있는 결함도 발견했다. extra valid choice, valid+malformed choice, 한 choice 안의 두 question을 모두 response-contract 위반/semantic overflow로 격리하고 후보 용량을 재활용하지 않아야 한다. 이 절의 controller 판정은 **보정 진행 중 / 실행 차단 / API 0/1,000**이다.

### O106. G3의 `NO_SAFE_SITE`는 문구상 허용됐지만 provider schema가 사실상 억지 출제를 강제했다

- `G3_SITE_CERTIFICATE` prompt는 안전한 어법 변형 지점이 없으면 `NO_SAFE_SITE`를 내라고 했지만, provider-visible schema는 같은 객체에 source spans·mutation·대안 해석·완성된 markedExpressions/options/해설을 전부 required로 강제했다. 진짜 최소 abstention은 SDK/Zod parse 전에 탈락하므로 모델이 형식상 완성된 가짜 certificate와 문항을 채우도록 압박하는 방법론적 coercion이다.
- 보정 방향은 provider가 지원하는 단일 object surface에서 abstention 필드를 선택적으로 허용하되, 서버 conditional validation이 `CERTIFIED`에는 기존 전체 필드와 exact binding을 한 항목도 빠짐없이 다시 강제하고 `NO_SAFE_SITE`에는 status와 구체적 reason만 허용하는 것이다. abstention도 시작된 한 candidate opportunity를 소비하고 raw 관찰 뒤 `parsed_rejected`로 계상하며 재시도·교체하지 않는다.
- B3의 `seamAudit=true` 자기주장은 adapter가 학생 문항으로 신뢰해 보존하지 않고 postprocess에서 제거된다. 다만 현재 결정론 게이트가 재계산하는 것은 일부 고신뢰 경계 문법·형태 신호이며, 다섯 선지의 전면 문법성이나 의미 intent 진실성까지 증명하지 않는다. 이 부분은 blind rater/후속 semantic 검증 영역으로 남긴다. profile 보정과 회귀 감사가 끝날 때까지 v6 exact-wire seal은 중지하고 API는 **0/1,000**을 유지한다.

## 과거 결론 상태표

### 재검 없이 되살리지 않을 기각안

- STANDARD Flash에 premium 사다리 적용: 73.3%, 약 79원으로 현행 63~77%, 약 36원 대비 Pareto 열위.
- Flash diet 사다리: 약 73원, 10개 중 6개 결함 잔존.
- Pro 단독이면 충분: 63.3%로 실패. 과거 성공 주장은 Pro 공예×사다리 집행의 결합이었다.
- Claude 단순 교체, 10개 표본 승자 일반화, 금지목록 계속 추가, residual soft-error 전부 resend, 고정 5지점 강제, 짧은 KILLER blank span 일괄 차단: 모두 과거 실측에서 실패·롤백됐다.

### 새 실험으로 분리 검증할 열린 가설

- 어법 solver가 `correctedForm`, `isKeySurfaceUngrammatical`, `governingRule`, per-option validity를 구조적으로 제출하면 key-convergence만 볼 때보다 치명 결함 회수율이 비용 대비 개선된다.
- 긴 금지목록을 긍정적 설계 절차와 작은 내부 산출물로 압축하면 yield와 craft가 함께 개선된다.
- 빈칸 전 선택지에 동일 suffix/prefix seam을 실제 결합해 보는 결정론 검사가 문법 소거를 저비용으로 차단한다.
- KILLER 빈칸의 핵심은 span 길이가 아니라 thesis 위치, cross-sentence synthesis, 오답 intent 간 경쟁 강도다.

## 현재 가설(아직 확정 아님)

- H1: 어법의 핵심 병목은 모델 하나보다 “안전한 정답 자리 선택”과 “해설 구조 인증”의 부재다.
- H2: 빈칸의 핵심 병목은 정답 패러프레이즈보다 오답별 의도 설계와 blank boundary/suffix contract다.
- H3: KILLER craft warning을 단순 hard-block하면 비용과 relaxed 출하가 악화할 수 있다. warning별 표적수리/후보선택 정책이 필요하다.
- H4: 모델 조합은 Flash/Pro를 유지하되 역할을 유형·결함별로 다르게 배분해야 Pareto 개선이 가능하다.
- H5: 프롬프트를 늘리는 것보다 내부 설계 산출물(자리 후보, 선지 intent ledger)을 작게 분리하는 방식이 더 안정적일 수 있다.

## 다음 액션

1. 최신 15문항 평가는 완료했다. 기존 프리미엄 어법 60문항을 같은 rubric으로 독립 재평가해 과거 `60/60 ok`와 실제 validity/craft를 분리한다.
2. 고정 코퍼스 1차 감사(PASS 74/EXCLUDE 17/DOMAIN_REVIEW 29)에 이어 독립 2차 감사를 완료하고, 이견을 fresh-eyes 판정한 뒤 탈락분을 seed-preserving 방식으로 교체한다.
3. API 하드캡 v2를 실제 provider 경계에 연결하고 crash/overrun/우회 적대 테스트를 통과시킨다.
4. 빈칸 seam, 어법 salvage, 해설 사실성 결함을 기존 산출물에 offline replay하여 정밀도와 오탐을 먼저 추정한다.
5. 위 조건과 paired baseline preregistration을 모두 충족한 뒤에만 첫 소규모 API 배치를 실행한다.
