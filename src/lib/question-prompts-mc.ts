// ============================================================================
// 수능/모의고사 객관식 프롬프트 (10 types)
// 유형별 AI 생성 지시사항 — 스키마 필드와 1:1 매칭
// AI는 지문 전체를 복사하지 않고, 서버 재구성에 필요한 최소 데이터만 반환
// ============================================================================

export const MC_PROMPTS: Record<string, string> = {
  BLANK_INFERENCE: `빈칸 추론 문제를 만드세요.

## 핵심 규칙 (반드시 준수)
1. 지문에서 핵심 표현(단어, 구, 절) 하나를 선택합니다.
2. **정답은 반드시 원문에서 선택한 표현을 그대로(한 글자도 바꾸지 않고) 사용해야 합니다.**
   - 패러프레이즈, 동의어 치환, 어순 변경 절대 불가
3. 오답 4개는 원문에 없는, 비슷하지만 명확히 구분 가능한 영어 표현으로 구성합니다.

## 출력 필드
- originalExpression: 원문에서 빈칸으로 만들 정확한 표현 (원문과 한 글자도 다르면 안 됨)
- surroundingText: originalExpression 주변 40~60자 텍스트 (위치 식별용, 원문 그대로 복사)
- correctAnswer: 정답 선지의 label ("1"~"5")
- options: label "1"~"5", text는 영어 표현. 정답 선지의 text는 반드시 originalExpression과 동일
- ⚠️ passageWithBlank 필드는 생성하지 마세요 (서버에서 자동 생성)
- direction 예시: "다음 글의 빈칸에 들어갈 말로 가장 적절한 것은?"`,

  GRAMMAR_ERROR: `어법 판단 문제를 만드세요.

## 핵심 규칙
1. 지문에서 5개 표현을 선택합니다 (label "(A)"~"(E)")
2. 그 중 정확히 하나에 어법 오류를 삽입합니다
3. 각 표현의 주변 텍스트를 포함하여 위치를 식별할 수 있게 합니다

## 출력 필드
- markedExpressions: 5개 배열. 각 항목:
  - label: "(A)"~"(E)"
  - expression: 원문에 있는 정확한 표현
  - surroundingText: 해당 표현 주변 40~60자 (위치 식별용)
  - isError: true/false
  - errorExpression: isError가 true인 경우, 어법상 틀린 형태 (예: "have" → "has")
  - correction: isError가 true인 경우, 올바른 표현 (= expression과 동일)
- options: label "(A)"~"(E)", text는 해당 표현
- ⚠️ passageWithMarkers 필드는 생성하지 마세요 (서버에서 자동 생성)
- direction 예시: "다음 글의 밑줄 친 부분 중, 어법상 틀린 것은?"`,

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

## 핵심 규칙
1. 지문의 내용을 기반으로 5개 문장을 구성합니다
2. 그 중 하나는 전체 흐름과 무관한 문장으로 만듭니다
3. 나머지 4개는 지문의 실제 문장을 사용합니다 (원문 그대로)

## 출력 필드
- sentences: 5개 문장 배열 (순서대로 ①~⑤에 대응)
  - 4개는 지문 원문에서 가져온 실제 문장
  - 1개는 흐름과 무관한 문장 (AI가 생성)
- irrelevantIndex: 무관한 문장의 인덱스 (0~4)
- options: label "1"~"5", text는 "①"~"⑤"
- ⚠️ passageWithNumbers 필드는 생성하지 마세요 (서버에서 자동 생성)
- direction 예시: "다음 글에서 전체 흐름과 관계 없는 문장은?"`,
};
