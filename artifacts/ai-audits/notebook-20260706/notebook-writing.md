# 영작(writing) 클러스터 연구노트 (26-07-06)

## 착수 시점 상태 (postspine-baseline-20260706 실측)
- **유일한 생성 실패 셀: SUMMARY_WRITING PREMIUM KILLER** — 품질 게이트가 아니라
  model 단계 3연속 "Forced prompt-inlined JSON generation failed (parse/schema
  validation)". strict 2회 + salvage 1회 전부 zod 검증 실패 → 파스 후보 0 → 풀도 빈다.
  (SW/TSW 프리미엄은 sonnet-5 strict json_schema 불능이라 forceJsonFallback 경로.)
- 저점 셀: CONDITIONAL_WRITING ST-K 58/PREM-K 65, WORD_ORDER ST-I/K 58,
  FILL_BLANK_KEY ST-K 58·PREM-I 60·PREM-K 65, SENTENCE_TRANSFORM ST-I/K 58·PREM-K 68,
  SUMMARY_COMPLETE ST/PREM-K 68, SUMMARY_WRITING ST-K 62, GRAMMAR_CORRECTION ST-K 58.
- 주의: ST 문항은 Claude 심사(가혹) — 플랜 간 비교 오염, 플랜 내 비교만 유효.

## 검증 대기 가설 (우선순위순)
- H1(최우선): SW KILLER 프리미엄의 zod 실패는 (a) 마크다운 펜스/전후 산문 혼입,
  (b) 토큰 상한 절단(KILLER 봉투 최대), (c) 필드 타입 미스 중 하나 — 실패 raw 를
  캡처해 원인 확정 후 파서 견고화(펜스 제거·JSON 블록 추출·trailing comma 수리·
  zod 이슈 경로를 에러 메시지에 포함).
- H2: 영작 계열 저점의 공통 fatal 패턴 추출(베이스라인 jsonl) — verbatim/난이도
  차별화/발문-조건 모순 중 무엇이 남았는지 분류 후 1개 직격.
- H3: FILL_BLANK_KEY 3셀 공통 병목(빈칸 스팬 선택?) 실측.

## 시도 기록

### [03:04~03:25] Iteration 1 — H1: SW PREMIUM KILLER 생성 실패 박멸 → **채택**
- **가설**: zod 실패는 (a) 펜스 혼입 / (b) 토큰 절단 / (c) 필드 타입 미스 중 하나.
- **재현+raw 캡처**: env게이트 덤프(QGEN_FALLBACK_RAW_DUMP_DIR)를 폴백 함수에 삽입 후
  SW:PREMIUM:KILLER 2런 재실측(artifacts/ai-audits/loop-writing-iter1-sw-20260706).
  덤프 11개 전수 동일: **finishReason=stop(절단 아님), 펜스 정상, JSON 정상 —
  유일 이슈 `questions.0.koreanGloss: expected string, received null`**.
  → 원인 확정 = (c)의 변종: 프롬프트 인라인 JSON 모드(provider 문법 강제 없음)에서
  sonnet-5 가 해당 없는 optional 필드를 null 로 채움. z.string().optional() 은 null 거부.
  repair 호출도 "Preserve the existing content" 지시라 같은 null 을 재방출 → 3연속 전멸.
  베이스라인 0/3 은 이 동전던지기(null vs 필드 생략)의 불운 케이스 — 재현 런에서도
  폴백 호출 다수가 같은 이슈로 죽고 재시도 운으로만 2/2 생성(총 449s, 거절 3).
- **변경**(src/lib/question-generation-llm.ts — 폴백 파스 헬퍼 내부만):
  1) `safeParsePromotingNullOptionals`(신규): zod "received null" 이슈 경로의 **객체
     속성 null 만 키 제거(undefined 승격)** 후 재검증(최대 2패스). 필수 필드 null 은
     required 오류로 재실패하므로 F급 오통과 불가. nullable 필드·배열 원소 null 무접촉.
     폴백 내 safeParse 2개 호출부(원 파스+repair 재파스) 교체.
  2) `parseJsonLoose`: 1차 JSON.parse 실패 시에만 trailing comma(",}",",]") 보수 후
     2차 시도(유효 JSON 훼손 불가).
  3) 진단성: zod 실패 로그에 finishReason·rawLen·이슈 경로 8개 포함 + env게이트 raw 덤프.
- **유닛테스트**: tests/unit/fallback-json-null-promotion.test.mjs — 실캡처 raw 픽스처
  (tests/fixtures/sw-premium-killer-fallback-raw-20260706.txt)로 종전 safeParse 실패
  재현 + 승격 후 통과 + 안전성 5종(필수 null 구제 불가/nullable 보존/배열 원소 무접촉/
  중첩 2패스/trailing comma). 12체크 green.
- **재실측**(artifacts/ai-audits/loop-writing-iter1-sw-postfix-20260706, 2런):
  | 지표 | 베이스라인 | pre-fix 재현 | post-fix |
  |---|---|---|---|
  | 생성률 | 0/1 | 2/2(운) | **2/2** |
  | model 거절 | 3 | 3 | **0** |
  | null 덤프 | - | 11 | **0** |
  | 런당 시간 | 314s(실패) | 149s/302s | **25s/22s** |
  | llmScore | null | 78/85 | 83/83 |
- **판정: 채택.** 전 유형 공통 이득(모든 forceJsonFallback/grammar-too-large 폴백 경로).
  95-bar 통과는 별개 과제(craft) — H1 스코프는 생성 실패 박멸로 완료.

### [03:2x~] Iteration 2 — H2/H3: 저점 셀 최다 공통 fatal = "verbatim/국소 복원 빈칸" → FILL_BLANK_KEY 직격
- **분류**(postspine-baseline jsonl, 저점 9셀 llmFatal): ① verbatim/국소 문법 슬롯
  빈칸(복사 답) 7건/4셀 — FBK ST-K(2)·PREM-I(2)·PREM-K(2)·CW PREM-K(1) ② 부자연
  영어 모범답안 5건(CW ST-K, ST 계열) ③ 칩/보기 불일치 4건(WO 2셀, TSW PREM-K)
  ④ SC 발문-형식 모순 2건. → 최다 = ①, 그 중 FBK 는 3셀 전부 + 4셀 모두 같은 문장
  ("Not that they did not exist...")의 같은 국소 스팬('considered' 계열)을 난이도
  무관 선택 — FBK 프롬프트에 난이도 분화가 0줄이었음(H3 과 동일 뿌리).
- **변경**(src/lib/question-prompts-essay.ts FILL_BLANK_KEY 블록):
  국소 복원 금지 자체 검증(빈칸 문장만 읽고 문법으로 채워지면 실패 — 실측 예시 인용,
  1단어 정답 금지·최소 2단어) + 난이도별 설계(BASIC 2~3단어 인접 단서 / INTERMEDIATE
  3~5단어·빈칸 문장 밖 단서 1개 필수 / KILLER 4~7단어·수렴점·단서 2곳 종합, explanation
  에 단서 인용 강제). 검증기는 무변경(신규 blocking 게이트는 salvage 등재가 공용 파일
  소유권이라 보류).
- **재실측**(artifacts/ai-audits/loop-writing-iter2-fbk-20260706, 4셀×1런):
  ST-I 88→72 / ST-K 58→72 / PREM-I 60→62 / PREM-K 65→60. 4셀 전부 **여전히 동일
  스팬**("were considered colors" 계열) 선택, verbatim-copy fatal 존속.
- **판정: 기각(효과 없음).** RCA 2가지: ① **자기 앵커링** — 프롬프트의 스팬 확장
  예시로 이 지문의 실제 어구("were considered colors 전체")를 인용했더니 모델이
  그 스팬을 그대로 채택(측정 지문=예시 지문 오염). ② KILLER 4~7단어 규칙을 3단어로
  위반해도 잡는 하드 조건이 없었음. 부수 발견: ST-K 신규 fatal = sentenceWithBlank
  가 원문 문장 꼬리 절을 잘라 passageWithBlank 와 모순(프레임 게이트는 prefix 복원을
  통과시키는 구멍).
- 구조 한계 메모: FBK 계약(정답=원문 verbatim + 지문 전문이 빈칸 처리되어 노출)상
  심사는 INT/KILLER 에서 "copy task" fatal 을 구조적으로 반복한다. 근본 해소는
  패러프레이즈 프레임 문장으로의 유형 재설계인데 postprocessor(question-postprocess/
  processors/fill-blank-key.ts)·렌더러가 소유권 밖 — 캠페인 백로그로 이관.

### [03:4x~] Iteration 3 — H2 최종: FBK 프롬프트 탈앵커링 + 난이도 하드 조건
- **가설**: iter2 무효과의 직접 원인(예시 앵커링·하드 조건 부재·문장 절단)을 제거하면
  스팬 다양화·최소 길이 준수가 생긴다.
- **변경**(question-prompts-essay.ts FILL_BLANK_KEY): ① 지문 실어구 예시 제거(추상
  패턴 서술로 교체) ② 후보 스팬 2~3개를 서로 다른 문장에서 뽑아 비교 선택 지시
  ③ INTERMEDIATE ≥3단어·KILLER ≥4단어 하드 조건(3단어 이하 제출 금지) ④
  sentenceWithBlank 문장 중간 절단 금지(실측 fatal 반영).
- **재실측**(artifacts/ai-audits/loop-writing-iter3-fbk-20260706, KILLER 2셀×1런):
  ST-K 58 / PREM-K 65. 두 셀 모두 **여전히 "were considered colors"(3단어)** — ≥4단어
  하드 조건 무시. 더 나쁜 신규 결함: ST-K 에서 패러프레이즈 압력이 answer(verbatim)
  vs correctAnswer(패러프레이즈) **모순 정답키**(F급 소지)를 유발 + 발문 '고르시오'
  드리프트 + "_____(A)_____" 이상 마커.
- **판정: 기각 + 전체 원복.** FBK 프롬프트 블록을 pre-iter2 상태로 되돌림(byte 동일
  확인). 프롬프트 조향으로는 이 유형의 fatal 을 못 옮기고(2회 실측 무효과), 오히려
  모순 정답키라는 새 F급 결함 모드를 만든다 — G2/G4 원칙상 원복이 옳다.
- **잔여 가설(백로그 이관)**:
  1) FBK 구조 재설계 — 프레임 문장을 지문 밖 패러프레이즈 요약문으로 바꾸는 유형
     계약 변경(blankAnswerMode=PARAPHRASE 상당). postprocessor(question-postprocess/
     processors/fill-blank-key.ts)·렌더러·fbk-frame-altered 게이트 동시 수술 필요 —
     소유권이 오케스트레이터/공용에 걸려 이번 캠페인 밖.
  2) 심사 rubric 자체가 FBK 의 "본문에서 찾아 쓰시오" 계약과 INT/KILLER 에서 구조적
     으로 충돌 — 유형 정의(난이도 상한 BASIC/INT 고정?) 재논의 대상.
  3) P2(부자연 모범답안 영어 — CW/ST 계열 5 fatal)·P3(칩 불일치 — WO 2셀)·P4(SC
     발문-형식 모순)는 미착수. P4 는 SUMMARY_COMPLETE 발문의 "가장 적절한 것은?"
     혼입을 직렬화/프롬프트에서 서술형 발문으로 고정하는 소수술로 승산 있음(다음
     iteration 1순위 추천).

## 종료 요약 (26-07-06)
- **채택 1건(H1)**: 폴백 JSON null-optional 승격 + trailing comma 보수 + 진단 로깅
  (src/lib/question-generation-llm.ts 폴백 헬퍼 내부). SW PREMIUM KILLER 생성
  0/1(베이스라인)→**2/2, 거절 0, 25s/22s**. 유닛 12체크 green(실캡처 픽스처), wave3
  계약 테스트 4/4 유지, eslint 0, tsc — 내 파일 기여 오류 0(잔여 2건은 타 에이전트
  진행 중인 credit-costs.ts/feature-margin.ts 소관, 본 작업 무관).
- **기각 2건(H2 iter2·iter3)**: FBK 프롬프트 조향 — 실측 무효과+신규 결함 모드로
  전체 원복. 잔여 가설은 위 백로그.
- 측정물: loop-writing-iter1-sw-20260706(+postfix), loop-writing-iter2-fbk-20260706,
  loop-writing-iter3-fbk-20260706, raw-dump-sw-20260706(11), raw-dump-sw-postfix(0).
