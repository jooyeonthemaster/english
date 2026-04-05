// ============================================================================
// 수능/모의고사 객관식 프롬프트 (10 types)
// 유형별 AI 생성 지시사항 — 스키마 필드와 1:1 매칭
// ============================================================================

export const MC_PROMPTS: Record<string, string> = {
  BLANK_INFERENCE: `빈칸 추론 문제를 만드세요.
- 지문에서 핵심 표현 하나를 빈칸(_____) 으로 만듭니다
- passageWithBlank: 원문을 수정하여 빈칸이 삽입된 전체 지문을 반환합니다
- 빈칸 자리에 원래 있던 표현을 정답으로, 비슷하지만 틀린 영어 표현 4개를 오답으로 구성
- options: label "1"~"5", text는 영어 표현
- direction 예시: "다음 글의 빈칸에 들어갈 말로 가장 적절한 것은?"`,

  GRAMMAR_ERROR: `어법 판단 문제를 만드세요.
- 지문에서 5개 표현을 선택하고 (A)~(E) 로 마킹합니다
- 그 중 하나에 어법 오류를 삽입합니다
- passageWithMarkers: 밑줄 부분을 __(A) expression__ 형태로 표시한 전체 지문
- markedExpressions: 5개 마킹된 표현의 label, expression, isError, correction 정보
- options: label "(A)"~"(E)", text는 해당 표현
- direction 예시: "다음 글의 밑줄 친 부분 중, 어법상 틀린 것은?"`,

  VOCAB_CHOICE: `어휘 적절성 문제를 만드세요.
- 지문에서 핵심 어휘 5개를 선택하고 (a)~(e) 로 마킹합니다
- 그 중 하나를 문맥상 부적절한 단어로 교체합니다
- passageWithMarkers: 밑줄 부분을 __(a) word__ 형태로 표시한 전체 지문
- markedWords: 5개 어휘의 label, word, isInappropriate, betterWord
- options: label "(a)"~"(e)", text는 해당 단어
- direction 예시: "다음 글의 밑줄 친 부분 중, 문맥상 낱말의 쓰임이 적절하지 않은 것은?"`,

  SENTENCE_ORDER: `글의 순서 문제를 만드세요.
- givenSentence: 주어진 첫 문장
- paragraphs: (A), (B), (C) 3개 단락 (label + text)
- options: 순서 조합 5개 (예: label "1", text "(A)-(C)-(B)")
- direction 예시: "주어진 글 다음에 이어질 글의 순서로 가장 적절한 것은?"`,

  SENTENCE_INSERT: `문장 삽입 문제를 만드세요.
- givenSentence: 삽입할 문장
- passageWithMarkers: ①②③④⑤ 위치 마커가 포함된 지문
- options: label "1"~"5", text는 "①"~"⑤"
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
- passageWithUnderline: 밑줄 친 대명사가 __대명사__ 형태로 표시된 지문
- underlinedPronoun: 밑줄 친 대명사
- options: label "1"~"5", text는 한국어 지칭 대상
- direction 예시: "밑줄 친 'it'이 가리키는 것으로 가장 적절한 것은?"`,

  CONTENT_MATCH: `내용 일치/불일치 문제를 만드세요.
- matchType: "일치" 또는 "불일치"
- options: label "1"~"5", text는 한국어 진술문
- direction 예시: "다음 글의 내용과 일치하지 않는 것은?"`,

  IRRELEVANT: `무관한 문장 문제를 만드세요.
- passageWithNumbers: ①~⑤ 번호가 매겨진 문장이 포함된 지문
- 하나의 문장은 전체 흐름과 무관해야 합니다
- options: label "1"~"5", text는 "①"~"⑤"
- direction 예시: "다음 글에서 전체 흐름과 관계 없는 문장은?"`,
};
