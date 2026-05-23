// ============================================================================
// 수능/모의고사 객관식 프롬프트 (10 types)
// 유형별 AI 생성 지시사항 — 스키마 필드와 1:1 매칭
// AI는 지문 전체를 복사하지 않고, 서버 재구성에 필요한 최소 데이터만 반환
// ============================================================================

export const MC_PROMPTS: Record<string, string> = {
  BLANK_INFERENCE: `빈칸 추론 문제를 만드세요.

## 핵심 규칙 (반드시 준수)
1. 지문에서 핵심 표현(단어, 구, 절) 하나를 선택합니다.
2. 기본 모드에서는 **정답은 반드시 원문에서 선택한 표현을 그대로(한 글자도 바꾸지 않고) 사용해야 합니다.**
   - 패러프레이즈, 동의어 치환, 어순 변경 절대 불가
3. 단, 별도의 Type detail setting이 주어지면 그 설정이 정답 선지 구성 규칙을 우선합니다.
4. 오답 4개는 원문에 없는, 비슷하지만 명확히 구분 가능한 영어 표현으로 구성합니다.

## 출력 필드
- originalExpression: 원문에서 빈칸으로 만들 정확한 표현 (원문과 한 글자도 다르면 안 됨)
- surroundingText: originalExpression 주변 40~60자 텍스트 (위치 식별용, 원문 그대로 복사)
- blankAnswerMode: 기본 모드는 "SOURCE_EXACT"; 부정-부정 설정이 있을 때만 "DOUBLE_NEGATIVE"
- answerLogic: 부정-부정 설정이 있을 때, 정답 논리를 한국어로 간단히 설명
- correctAnswer: 정답 선지의 label ("1"~"5")
- options: label "1"~"5", text는 영어 표현. 기본 모드에서는 정답 선지의 text가 반드시 originalExpression과 동일
- ⚠️ passageWithBlank 필드는 생성하지 마세요 (서버에서 자동 생성)
- direction 예시: "다음 글의 빈칸에 들어갈 말로 가장 적절한 것은?"`,

  GRAMMAR_ERROR: `어법 판단 문제를 만드세요.

## 출제 철학
수능 어법 5지선다는 5개 위치 모두가 어법 결정 지점입니다. 정답뿐 아니라 4개 디코이도 학생이 능동적 어법 판단을 해야 하는 자리.

## 5개 위치 선정
1. 5개 모두 **서로 다른 pointCode** (a~m). 5개 코드는 unique.
2. 5개는 서로 다른 문장
3. pointCode 풀:
   (a) 정·준동사  (b) 관계사  (c) 분사 능/수동  (d) 수일치
   (e) 능/수동태  (f) 형/부 자리  (g) 대명사 일치  (h) 목적격보어
   (i) 병렬  (j) 가정법 시제  (k) to-v vs. v-ing  (l) 전치사 vs. 접속사
   (m) 비교구문
4. **pointCode 정확성**: 표시한 expression의 문법적 성격에 정확히 맞는 코드를 골라야 함. 분사면 c, 대명사면 g, 동사 단·복수면 d 등.

## ⚠️ 약한 디코이 금지
- to-v 전용 동사 뒤 to-v (plan, want, decide, refuse, hope, expect, manage, agree, promise, fail, learn)
- v-ing 전용 동사 뒤 v-ing (enjoy, finish, avoid, mind, suggest, consider, postpone, deny)
- 단순 관사, 단순 전치사, 고유명사, 평이한 명사

대신 강한 디코이만: 자동사 분사(missing/retired 류), 수식어구 분리 주어, 콤마 뒤 분사구문, 비교급 than 뒤, 관계대명사 앞 모호 선행사, 2형식 보어, 5형식 OC, 등위접속사 뒤.

## 오류 위치 다양화
같은 지문에서 매번 가장 명백한 위치(가정법 절벽 등)를 정답으로 만들지 말 것. 명백한 자리는 디코이로 활용하고, 미묘한 자리(분사 능수동, 수일치, 형/부, 대명사 등)도 정답 후보로 검토.

## 오류 생성 — 어간 유지 + 형태만 변형 (11가지 중 1개)
1. V-ing ↔ p.p.  2. 정동사 ↔ 준동사  3. that ↔ what  4. which ↔ where/when
5. 단·복수 V  6. 형↔부  7. 능↔수  8. 대명사 단·복수·격
9. to-v ↔ v-ing  10. 가정법 시제  11. 전치사 ↔ 접속사
**금지**: 동사↔명사, 형용사↔명사 같은 품사 변경. errorExpression의 어간은 expression과 동일해야 함.

## wrongOptionExplanations 일관성 (배열 길이 4)
각 항목은 markedExpressions의 같은 label과 정확히 일치:
- label: markedExpressions에서 정답이 아닌 4개
- expression: 해당 label의 markedExpression.expression과 완전 동일 문자열
- pointCode: 해당 label의 markedExpression.pointCode와 동일 코드
- explanation: 이 expression(인용 필수)이 어떤 포인트를 묻고 왜 어법상 맞는지 1~2문장 한국어

❌ 잘못된 예 ((B) 위치가 detached인데 해설은 'them' 언급): {label:"(B)", expression:"detached", explanation:"...대명사 'them'이 옳다"}
⭕ 올바른 예: {label:"(B)", expression:"detached", pointCode:"c", explanation:"이 자리는 분사 능/수동을 묻고 있으며, isolated words가 detach의 대상이므로 과거분사 'detached'가 어법상 옳다."}

## correctAnswer 포맷
괄호 포함: "(A)" "(B)" "(C)" "(D)" "(E)" 중 하나.

## 출력 작성 순서
1. 지문에서 다른 문장의 강한 디코이 자리 5개 후보 선정 (각 a~m 중 다른 pointCode)
2. 약한 디코이 자리가 섞이면 즉시 교체
3. markedExpressions[5] 작성 — pointCode 라벨링. 5개 pointCode 서로 다름 확인.
4. 가장 명백한 위치는 디코이로 두고 정답 위치 다양화 검토
5. 1개에 11가지 변형 중 1개 적용 → isError=true, errorExpression 변형, correction = expression
6. correctAnswer = "(?)"
7. wrongOptionExplanations[4]: 정답 제외 4개 각각에 markedExpression의 label·expression·pointCode를 복사하고, expression을 인용한 해설 작성
8. options[5] (오류는 errorExpression, 나머지는 expression)
9. explanation, keyPoints[3], tags[5] (각 pointCode의 한국어 포인트명)

## 자체 검증
□ 5 pointCode unique (a~m 중 5개 선택, 중복 없음)
□ 5 verbatim · 1 isError · 다른 문장 분포
□ correctAnswer = "(?)" 괄호 포함
□ errorExpression 어간 = expression 어간 (품사 변경 X)
□ wrongOptionExplanations 길이 4, 각 항목의 label·expression·pointCode가 markedExpressions와 완전 일치
□ wrongOptionExplanation 본문이 해당 expression을 인용 (다른 표현 언급 X)
□ 약한 디코이 자리(plan+to-v, 단순 관사 등) 0개
□ ⚠️ passageWithMarkers 필드는 생성하지 마세요 (서버에서 자동 생성)

direction 예시: "다음 글의 밑줄 친 부분 중, 어법상 틀린 것은?"`,

  VOCAB_CHOICE: `어휘 적절성 문제를 만드세요.

## 핵심 규칙
1. 지문에서 핵심 어휘 5개를 선택합니다 (label "(a)"~"(e)")
2. 그 중 정확히 하나를 문맥상 부적절한 단어로 교체합니다

## 출력 필드
- markedWords: 5개 배열. 각 항목:
  - label: "(a)"~"(e)"
  - originalWord: 원문에 있는 정확한 단어
  - surroundingText: 해당 단어 주변 40~60자 (위치 식별용)
  - isInappropriate: true/false
  - substituteWord: isInappropriate가 true인 경우, 문맥상 부적절한 대체 단어
  - betterWord: isInappropriate가 true인 경우, 원래 적절한 단어 (= originalWord와 동일)
- options: label "(a)"~"(e)", text는 표시될 단어 (적절한 것은 originalWord, 부적절한 것은 substituteWord)
- ⚠️ passageWithMarkers 필드는 생성하지 마세요 (서버에서 자동 생성)
- direction 예시: "다음 글의 밑줄 친 부분 중, 문맥상 낱말의 쓰임이 적절하지 않은 것은?"`,

  SENTENCE_ORDER: `글의 순서 문제를 만드세요.
- givenSentence: 주어진 첫 문장
- paragraphs: (A), (B), (C) 3개 단락 (label + text)
- options: 순서 조합 5개 (예: label "1", text "(A)-(C)-(B)")
- direction 예시: "주어진 글 다음에 이어질 글의 순서로 가장 적절한 것은?"`,

  SENTENCE_INSERT: `문장 삽입 문제를 만드세요.

## 핵심 규칙
1. 삽입할 문장 하나를 만듭니다
2. 지문의 문장 사이에 ①~⑤ 위치 마커 5개를 배치할 위치를 결정합니다

## 출력 필드
- givenSentence: 삽입할 문장
- markerAfterSentenceIndices: 5개 숫자 배열. 각 숫자는 "N번째 문장 뒤에 마커를 삽입"을 의미 (0-based)
  - 예: [0, 2, 4, 6, 8] → 1번째, 3번째, 5번째, 7번째, 9번째 문장 뒤에 ①②③④⑤ 삽입
  - 숫자는 반드시 오름차순으로 정렬
- options: label "1"~"5", text는 "①"~"⑤"
- ⚠️ passageWithMarkers 필드는 생성하지 마세요 (서버에서 자동 생성)
- direction 예시: "글의 흐름으로 보아, 주어진 문장이 들어가기에 가장 적절한 곳은?"`,

  TOPIC_MAIN_IDEA: `주제/요지 파악 문제를 만드세요.
- 원문 지문을 수정하지 않습니다 (지문은 별도로 표시됨)
- options: label "1"~"5", text는 한국어 주제/요지 진술문
- direction 예시: "다음 글의 요지로 가장 적절한 것은?"`,

  TITLE: `제목 추론 문제를 만드세요.
- 원문 지문을 수정하지 않습니다
- options: label "1"~"5", text는 영어 제목
- direction 예시: "다음 글의 제목으로 가장 적절한 것은?"`,

  REFERENCE: `지칭 추론 문제를 만드세요.

## 출력 필드
- underlinedPronoun: 밑줄 칠 대명사 (예: "them", "it")
- surroundingText: 해당 대명사 주변 40~60자 텍스트 (위치 식별용, 동일 대명사가 여러 번 나올 수 있으므로 반드시 포함)
- options: label "1"~"5", text는 한국어 지칭 대상
- ⚠️ passageWithUnderline 필드는 생성하지 마세요 (서버에서 자동 생성)
- direction 예시: "밑줄 친 'it'이 가리키는 것으로 가장 적절한 것은?"`,

  CONTENT_MATCH: `내용 일치/불일치 문제를 만드세요.
- matchType: "일치" 또는 "불일치"
- options: label "1"~"5", text는 한국어 진술문
- direction 예시: "다음 글의 내용과 일치하지 않는 것은?"`,

  IRRELEVANT: `무관한 문장 문제를 만드세요.

## 핵심 출제 철학
요즘 수능/모의고사형 무관한 문장은 "완전히 다른 주제"가 아니라, 같은 소재와 핵심 어휘를 공유하지만 문단의 논리 역할을 잘못 이어받는 문장입니다.
킬러 문항일수록 훑어 읽으면 자연스러워 보이고, 앞뒤 문장의 기능을 따져야만 제거됩니다.

## 핵심 규칙
1. 지문에서 서로 이어지는 5문장 안팎의 흐름을 잡고, 그중 정확히 1문장을 AI 생성 문장으로 대체합니다.
2. 나머지 4개는 지문의 실제 문장을 원문 그대로 사용합니다. 의미 보존 paraphrase, 요약, 문장 결합은 금지입니다.
3. 무관한 문장은 같은 소재/상황/핵심 어휘를 최소 2개 이상 공유해야 하며, 가능하면 주변 원문 문장의 영어 content word를 그대로 재사용합니다.
   - 삽입문 안의 의미 있는 단어 중 상당수는 선택한 원문 흐름의 단어여야 합니다. 새 구체명사를 많이 추가하지 마세요.
4. 무관한 문장은 "랜덤한 외부 사실"이 아니라 다음 중 하나의 논리 이탈이어야 합니다.
   - 예시 흐름인데 일반 처방/조언으로 바뀜
   - 원인 설명 흐름인데 결과/해결책으로 성급히 이동함
   - 같은 키워드를 쓰지만 행위자, 목적, 범위, 시간, 평가 기준이 달라짐
   - 앞뒤 문장의 대조/양보/인과 관계를 미묘하게 뒤집음
   - 단, 중심 주장과 정반대되는 말을 노골적으로 써서 쉽게 들키게 만들지는 마세요.
5. 너무 쉬운 무관문 금지: 갑자기 교통, 광고, 사진, 날씨, 학교 행사, 디지털 기기 같은 새 분야를 끌어오지 마세요. 해당 소재가 원문에 이미 있을 때만 사용합니다.
6. 너무 노골적인 단서 금지: 원문에 없는 should/must/always/never/completely/most/everyone 같은 처방·극단어로 티 나게 만들지 마세요.
7. 킬러 문항에서는 가급적 중립적 설명문을 쓰세요. 원문 흐름이 조언문이 아닌데 "To maximize...", "To prevent...", "Students should..."처럼 노골적인 처방문으로 시작하지 마세요.
8. 삽입 문장은 문법적으로 완벽하고 자연스러운 영어여야 합니다. 어색한 collocation이나 잘못된 동사형은 절대 금지입니다.
9. 삽입 문장의 길이, 문체, 추상도는 주변 원문 문장과 비슷해야 합니다.
10. correctAnswer는 반드시 irrelevantIndex에 대응하는 label이어야 합니다. 예: irrelevantIndex가 2이면 correctAnswer는 "③".

## 최종 자체 점검
- 무관문을 빼면 나머지 4문장이 원문 흐름으로 자연스럽게 이어지는가?
- 무관문이 "다른 분야"라서가 아니라 "논리 역할이 틀려서" 빠지는가?
- 무관문이 주변 문장의 영어 content word를 최소 2개 그대로 재사용했는가?
- 무관문이 어색한 영어, 극단어, 노골적 반대 주장 때문에 바로 들키지는 않는가?
- 무관문이 조언/처방문으로 튀지 않고 주변 원문과 같은 설명문 톤을 유지하는가?

## 출력 필드
- sentences: 5개 문장 배열 (순서대로 ①~⑤에 대응)
  - 4개는 지문 원문에서 가져온 실제 문장
  - 1개는 같은 소재를 공유하지만 논리 기능이 어긋나는 문장
- irrelevantIndex: 무관한 문장의 인덱스 (0~4)
- options: label과 text 모두 "①"~"⑤" 형식
- wrongOptionExplanations: 정답이 아닌 4개 문장이 문단에서 맡는 역할(도입, 정의, 예시, 대조, 결론 등)을 각각 설명
- ⚠️ passageWithNumbers 필드는 생성하지 마세요 (서버에서 자동 생성)
- direction 예시: "다음 글에서 전체 흐름과 관계 없는 문장은?"`,
};
