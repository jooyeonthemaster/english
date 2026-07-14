# 어법 프리미엄 사다리 (P1) — 프로덕션 이식 계약서

작성: Fable 26-07-15. 근거: experiments/grammar-quality-20260714/research-note.md §8 (42구성 실측, 결승 60지문 C·F 0).

## 0. 한 줄 정의

`GRAMMAR_ERROR × generationPlan=PREMIUM` 조합만 새 엔진(gemini-3.1-pro 3콜 사다리)으로 교체한다. **그 외 전부(일반 어법 — KILLER 난이도 포함, 타 유형, 타 플랜) 바이트 동일.**

## 1. 확정 스펙 (실측 재현 대상)

- 콜1 **정답 생성**: few-shot A등급 예시 2개 + 미니멀 규칙 + 지문 → 정답 1개만 (소형 스키마: 오형·교정·pointCode·해설)
- 콜2 **미끼 추가**: 콜1 결과 + "정답을 가리지 않는 저울질 미끼 4개" → 완성 문항 (기존 GRAMMAR_ERROR 스키마)
- **게이트**: 기존 결정론 게이트 전체(validateQuestionQuality) + 기존 솔버 게이트 재사용
- **사다리**: 하드블록(error-not-mutated / 마커 미렌더 / nonword / noun-what / killer-answer-point-repeated) → 전체 재생성 ≤2회(반려 사유 주입) / 소프트 error → **표적수리 1콜 후 수용**(수리 프롬프트에 후보 블록 상위 15개 동봉, "정답 자리·타 밑줄 보존") / 잔존 재생성 회송 금지(결승 롤백 실측)
- **difficulty 동기화**: 최종 수용 직전 question.difficulty = 요청 난이도 덮어쓰기
- 모델: 전 콜 `google/gemini-3.1-pro-preview` — env `GRAMMAR_PREMIUM_MODEL_ID` 로 오버라이드 가능(preview 만료 대비), **strict json_schema 금지 리스크**: pro 파싱실패 산발 실측 → 동형 재시도 1회 흡수(x-strategies w3ProObject 패턴)
- 기대 성능: 98원/문항·~49s·A+B 100%

## 2. 비타협 계약 (전부 필수)

1. **never-fail 보존**: 사다리 give-up 시 후보를 버리지 말고 기존 파이프라인의 반려 풀/salvage 사다리로 합류 — "사다리 도입 = 생성 실패"는 어떤 경로로도 불가
2. **무회귀**: STANDARD 어법·비어법 유형·비생성 경로(수정/분석) 프롬프트와 동작 바이트 동일. PREMIUM 비어법 유형은 기존 Claude 경로 그대로
3. **관측성**: 콜별 onModelUsage(원가 원장) + 사다리 이력(재생성/수리 횟수·트리거·해소 코드) 로그 — RCA "시간 블랙홀" 재발 금지
4. **deadlineAt 존중**: fast 라우트 270s 벽 — 사다리 각 콜 전에 deadline 확인, 부족하면 조기 give-up→기존 경로
5. **트리거 워커 호환**: run-question-generation만 수정하면 fast/큐/트리거 3경로 자동 관통(기존 검증 사실) — 배포 시 vercel+trigger 동시 재배포 주석 명기
6. **크레딧 불변**: PREMIUM 배수 2(4cr) 그대로 — 원가 98원 vs 판가 292~528원

## 3. 파일 계획

- **신규** `src/app/api/ai/generate-questions-auto/_lib/grammar-premium-ladder.ts`: few-shot 예시 상수(결승 A등급 실물 2문항 — x/w3-triple-ladder/results-run1-100pct.jsonl 의 q22(20150409_A-q19 Choosing→Choose)·q25 계열에서 발췌 박제), answer-only 스키마, 사다리 오케스트레이션(재생성·수리·difficulty 동기화), 프롬프트 빌더(미니멀 — 후보블록·체크리스트 산더미 주입 금지)
- **수정** `src/lib/question-generation-llm.ts`: generateQuestionObject 계열에 modelId 오버라이드 옵션(기존 호출부 무영향 — 옵셔널)
- **수정** `src/app/api/ai/generate-questions-auto/_lib/run-question-generation.ts`: GRAMMAR_ERROR × PREMIUM 분기에서 사다리 호출(기존 generateWithRetry 대체), 결과를 기존 finalize/솔버 게이트/수용 머신에 합류. give-up 폴백 배선
- **수정** `src/lib/feature-flags.ts` + `src/lib/question-generation-plans.ts`: 프리미엄 잠정 중단 해제(SHOW_MODEL_SELECTOR 기본 true 복원, normalize 클램프 제거) — **구현·검증 전부 통과 후 마지막에**
- 참조(수정 금지): experiments/grammar-quality-20260714/x-strategies.ts 의 w3GenerateSplit/w3Repair/w3ProObject — 프롬프트 문구·사다리 정책의 원본

## 4. 검증 게이트 (순서 고정)

1. tsc·eslint 0
2. **무회귀 diff 검수**: STANDARD 경로 프롬프트 바이트 동일 확인(어법 STANDARD 1건 하니스 생성 → round-6 대비 topReject/프롬프트 구조 비교)
3. **E2E 실측**: prod 동일 경로(runQuestionGenerationWithEmptyRetry, generationPlan=PREMIUM) ×10지문 — 실패 0·사다리 이력 기록·원가 ~$0.07 확인
4. 블라인드 채점 ×10 — A+B ≥ 9/10
5. 전부 그린 후에만 플래그 해제 커밋 대기 상태로
