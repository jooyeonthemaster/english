// ============================================================================
// 어휘 프롬프트 (3 types)
// 유형별 AI 생성 지시사항 — 스키마 필드와 1:1 매칭
// ============================================================================

export const VOCAB_PROMPTS: Record<string, string> = {
  CONTEXT_MEANING: `문맥 속 어휘 의미 문제를 만드세요.
- passageWithUnderline: 밑줄 친 단어가 __단어__ 형태로 표시된 지문
- underlinedWord: 밑줄 친 단어
- options: label "1"~"5", text는 영어 동의어
- direction 예시: "밑줄 친 'conduit'과 문맥상 의미가 가장 유사한 것은?"`,

  SYNONYM: `동의어 문제를 만드세요.
- targetWord: 대상 단어
- contextSentence: 문맥 문장 (지문에서 발췌)
- options: label "1"~"5", text는 영어 동의어 선택지
- direction 예시: "다음 밑줄 친 단어의 의미와 가장 유사한 것은?"`,

  ANTONYM: `반의어 문제를 만드세요.
- passageWithMarkers: (A)~(E) 밑줄 어휘가 포함된 지문
- markedWords: 5개 어휘의 label, word, antonym
- options: label "(A)"~"(E)", text는 "word -- antonym" 형태
- direction 예시: "다음 글의 밑줄 친 단어와 반의어 관계가 올바르지 않은 것은?"`,
};
