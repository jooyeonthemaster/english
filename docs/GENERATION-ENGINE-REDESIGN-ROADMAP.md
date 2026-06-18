# 문제 생성 엔진 재설계 — 통합 로드맵

> 작성 2026-06-18 (jay). 이번 세션의 전수 조사(재시도 아키텍처·169 품질실패·게이트 A/B/C 감사·모델 라우팅·프로덕션 데이터) + jooyeon 모델 실험을 **하나의 설계**로 통합. 코드 경로 = `c:\roqkf\english`.

## 0. 제품 원칙 (불변)

1. **강사 의도 우선(SHIP-FIRST)**: 강사가 고른 지문 + 유형 + 난이도 + 설정은 확정된 의도다. 엔진이 "이 지문엔 적합한 출제 포인트가 없다"고 판단해도 **생성을 막지 않는다.**
2. **명백한 오류만 차단**: 정답 오류·정답 노출·답 모호(복수정답/무정답)·형식 깨짐·렌더 불가만 실패 사유. 그 외는 **조용히 출하**(경고배지·난이도 라벨 변경 없음).
3. **기계적 불가만 빠른 실패**: 지문이 그 유형의 형식을 물리적으로 못 만들면(문장수 부족 등) 실패가 맞다. 단 **차감 전 사전 감지 + 즉시 실패**, 재시도 0. "포인트가 약하다"는 절대 실패 사유 아님.
4. **안 되는 걸 계속 재시도 금지**.

## 1. 근거 데이터 (프로덕션 30일, 8,200잡)

- 크레딧 부족(1,554)·Gemini 빌링 장애(261) 제거 시 **진짜 품질 성공률 96.2%**. 진짜 엔진 품질 실패는 **169건(2.1%)**, KILLER 난이도(빈칸·무관·함축·어법)에 집중.
- **PREMIUM(Claude) 실패의 71%(47/66)는 Claude 품질이 아니라 DB 트랜잭션 저장 버그.** Claude 평균 1.12시도, 콜당 중앙값 52s(max 194s) → 100s fast 라우트에서 STALE 8건.
- 모델 배치: **STANDARD = `gemini-3.5-flash`**, **PREMIUM = `claude-sonnet-4-6`** (현재 구성 유지가 맞음 — Claude=프리미엄 생성 모델).
- 핵심 비효율 = **실패 시 전체 재생성**(필드 하나만 깨져도 문항 통째 재생성).

## 2. 게이트 감사 결과 (151 차단코드, 적대검증 0 flip)

- **A 113** 유지차단(명백한 결함) / **B 36** 차단해제→조용히 출하(취향) / **C 2** 사전 fast-fail(기계불가).
- B 36개·C 2개 전체 목록은 §4 WS1/WS6 참조.

## 3. 작업 순서 (의존성·DB 마지막)

```
WS1 ship-first 게이트(S, 무의존)  ── 원칙 #1·#2 실현, 최저위험 ── EXEMPLAR·1순위
WS6 C 사전 fast-fail(M, 무의존)   ── 원칙 #3·#4 실현 ── 2순위
WS3 부분-repair 라우터(L)          ── 전체재생성 대체 토대(신규 파일) ── 3순위
WS2 오케스트레이션(L, →WS3)        ── repair 루프 배선 ── 4순위
WS4 PREMIUM async 라우팅(L, →WS6) ── STALE 제거 ── 5순위
WS5 GRAMMAR_ERROR 컴파일러(XL,→WS1)── #1 실패군 박멸 ── 6순위
─────────────────────────────────────────────────
DB 트랜잭션 저장 버그 수정          ── 위 전부 완료 후 ── 마지막
```

각 work-stream 구현 직후 **검증 게이트**: `tsc --noEmit` + eslint(신규 0) + 하네스 실생성 전수(무회귀, DB 무저장).

## 4. Work-stream 스펙 (구현가능)

### WS1 — ship-first 게이트 재분류 [S, 무의존] ⭐EXEMPLAR
- **메커니즘**: `question-quality.ts`에 `SHIP_FIRST_WARNING_CODES`(36) Set 추가. `validateQuestionQuality` **반환 직전** 단일 post-pass로 해당 코드의 `severity:'error'→'warning'` 강등(삭제 아님 — 검수 UI 가시성 보존). 36개 emit 사이트를 안 건드리는 단일 진실원.
- **효과(무료)**: 강등되면 strict/relaxed 양쪽에서 더 이상 error가 아니라 → 차단·재시도 안 함. A-clean 문항 1회차 출하.
- **동반 수정**: `run-question-generation.ts:662-665` — 경고를 **strict에서도** `_qualityWarnings`에 부착(현재 relaxed 전용). `_qualityMode`는 relaxed에서만 'relaxed'(취향 경고에 저품질 배지 금지 — 원칙 #2).
- **정리**: `RELAXED_BLOCKING_QUALITY_CODES`(:103-275)에서 36개 제거 + `blank-target-list-like` 중복(133·264) 제거.
- **36 B**: wrong-option-explanation-count, grammar-decoy-point-diversity, grammar-killer-thin-answer, grammar-correction-killer-thin-segment, grammar-correction-underline-too-narrow, grammar-correction-underlined-segment-short, blank-killer-target-too-easy, blank-target-too-small, blank-target-list-like, blank-awkward-correct-option, blank-awkward-option, blank-paraphrase-correct-too-thin, blank-paraphrase-difficulty-mismatch, blank-paraphrase-killer-giveaway-distractors, blank-paraphrase-killer-too-easy, blank-paraphrase-missing-answer-logic, blank-paraphrase-option-imbalance, blank-paraphrase-option-source-copy, blank-paraphrase-subject-slot-mismatch, blank-paraphrase-target-too-wide, blank-paraphrase-target-trailing-function, irrelevant-too-unrelated, irrelevant-obvious-counterclaim-cue, irrelevant-prescriptive-giveaway, sentence-order-given-too-long, sentence-order-given-too-long-relative, sentence-order-paragraph-imbalance, implied-meaning-missing-surface-meaning, implied-meaning-noncentral-target, implied-meaning-rhetorical-question-target, implied-meaning-single-word-target, implied-meaning-target-too-short, implied-meaning-thin-evidence-chain, implied-meaning-thin-reasoning-gap, summary-mc-awkward-collocation, summary-mc-missing-half-correct-traps
- ⚠️ 정확한 36-string Set만 강등(prefix 매칭 금지) — 인접한 A코드(implied-meaning-direct-answer-leak, irrelevant-too-many-new-terms 등) 차단 유지.

### WS6 — C 사전 fast-fail [M, 무의존]
- **신규** `question-quality.ts`: `preflightQuestionFeasibility(typeId, difficulty, passage)` → `{ok:true} | {ok:false, code, error(한국어), detail}`. typeId 디스패치, **현재 SENTENCE_ORDER만 활성**, 나머지 전부 ok(기본 개방=ship-first). 검사: `countDisplaySentences < 6`(too-short), `countWords < ~72`(too-thin). 기존 private 헬퍼·상수 재사용. **난이도는 게이트하지 않음**(KILLER를 불가로 취급 금지).
- **배선**(IRRELEVANT 사전게이트와 동일): 차감 전 — `fast/route.ts:~225`, async `question-generation/route.ts:~91`, trigger backstop `:~188`. 실패=400(차감 없음)/trigger는 FAILED+완료.
- `sentence-order-paragraph-count`(3덩이 모양)은 **A 유지**(모델 출력 오류).

### WS3 — failure-code 부분-repair 라우터 [L]
- **신규** `_lib/question-repair.ts`: `REPAIR_ROUTER`(failing code→{strategy,fn}) + `repairQuestion(subType,question,issues,passage,ctx)`. A-결함 문항의 **깨진 필드만** 수리. 결정형(무LLM): 마커 재앵커·라벨 정합·옵션 재배열. 스코프-LLM: 마이크로 스키마+마이크로 페이로드로 `generateQuestionObject` 재사용(maxTokens~1024, PREMIUM은 system 캐시). 다필드(>~2 A코드) 파손은 repair 스킵→재생성. repair 출력은 신뢰 안 함 → 후처리+게이트 재실행.

### WS2 — 재시도/repair 오케스트레이션 [L, →WS3]
- `run-question-generation.ts:630-657` 이진(strict/relaxed) → **3-way 분류** `classifyQualityErrors→{a,b,c}`. c>0=preflight-doomed 즉시 중단(재시도0). a=0=즉시 출하(b는 _qualityWarnings 부착). a>0=`continue`(폐기) 대신 **WS3 repair `A_REPAIR_ROUNDS`(제안 2)회** → 성공 출하/실패 폴백. 후보 finalize를 함수 추출. deadline·usage·rejectionSummary 보존. relaxed 폴백은 이번엔 KEEP(축소만).

### WS4 — PREMIUM async 라우팅 [L, →WS6]
- 모델 매핑 무변경. **PREMIUM 유닛만 비동기 trigger 경로(540s)로**, STANDARD는 sync fast(100s) 유지. 디스패치 분기: `use-generation-handlers.ts`·`use-workspace-generation.ts`(유닛 plan별), 완료 폴링(`generate-page-client.tsx`, job.result.questions). async route에 C 사전게이트+diversity(variantIndex) 패리티 추가. 선택: per-job GET 폴링 엔드포인트.

### WS5 — GRAMMAR_ERROR 준-결정형 컴파일러 [XL, →WS1]
- **신규** `grammar-compiler.ts`: ①SPAN LOCATOR(결정형, `grammarPointCodeSurfaceMismatch` 검출기 미러) ②MUTATION COMPILER(`grammar-minimal-pairs.ts` 검증쌍) ③마커 렌더 ④LLM은 해설/난이도/오답다양성만. LLM markedExpressions는 힌트로만, 검증 후보로 snap. **ship-first: KILLER 구조 없으면 하위난이도 에러라도 반드시 출하(거부 금지)**. flag-gated, GRAMMAR_ERROR 한정(COMBO·CORRECTION 무관). 기존 processor/gate는 안전망으로 유지(무변경). 4a(단일 콜서 구조필드 덮어쓰기, 무추가비용) 채택.

### DB — 트랜잭션 저장 버그 [마지막]
- 후처리 저장이 question+해설+크레딧을 5s interactive tx로 묶어 만료→롤백(58건 유실, PREMIUM 47). 위 전부 완료 후: tx 타임아웃 상향 또는 해설 저장을 임계 tx 밖으로.

## 5. 해소된 핵심 결정
- 회색지대 게이트 = **출하 우선**(명백한 오류만 차단). → 감사가 0 flip으로 36 B 확정.
- B 출하 시 **조용히**(경고배지/난이도 변경 없음, `_qualityWarnings`만 부착).
- C는 **기계적 불가만**, 사전 즉시 실패.
- 모델: Claude=프리미엄 생성 주모델(judge/repair 강등 아님), Gemini 3.5=STANDARD 주력.

## 6. 진행 상태 (2026-06-18 구현·검증)
- [x] **WS1 ship-first 게이트** — `question-quality.ts`(SHIP_FIRST_WARNING_CODES 36 + 반환 직전 demotion), `run-question-generation.ts`(strict 경고 부착 + RELAXED_BLOCKING 동기화 차감). tsc/eslint 0. 라이브: IMPLIED noncentral 등 KILLER warning 출하.
- [x] **WS6 C 사전 fast-fail** — `preflightQuestionFeasibility` + fast·async·trigger 3라우트 배선. 결정형 8/8.
- [x] **WS3 부분-repair 라우터** — 신규 `question-repair.ts`. 라이브: grammar-error-not-mutated 등 제자리 교정.
- [x] **WS2 오케스트레이션** — finalizeCandidate 추출 + repair 배선. KILLER 18/18·12/12, INTERMEDIATE 38/38 무회귀.
- [⏭] **WS5 GRAMMAR_ERROR 컴파일러 — 미빌드(의도적)**: repair가 어법 #1 실패군을 이미 해결(어법 KILLER 100%). XL 신규 빌드는 회귀 리스크만 추가 → 품질 목적 종료. (향후 LLM콜 절감용으로만 재검토 가치.)
- [⏸] **WS4 PREMIUM async — 보류(판단 대기)**: STALE 0.4%·deadline 가드로 이미 우아한 환불. 클라이언트 상태머신 3+파일 리워크라 생성테스트 검증 불가(브라우저/Playwright 필요). UI 담당 분리 권고.
- [ ] **DB 트랜잭션 버그(마지막)** — 이번 세션 제외(사용자 지시).

### 검증 결과 (적대적 품질 판정, KILLER 24문항)
- **23/24 usable**, broken 1건(BLANK_INFERENCE-3)뿐 — 그러나 **ship-first 무관**(강등 게이트 미적용 항목). 원인=상류 빈칸 추출 결함(등위 명사열 중간 절단→문법만으로 정답 결정). **오분류 게이트 0, ship-first가 깨진 문항을 새로 출하한 사례 0.** → ship-first 전제 확정.
- 발견된 신규(기존) 버그: **빈칸 등위열 중간 절단 누설** — 빈칸 추출기에 A-가드 추가 후보(별건, 이번 6 WS 밖).
