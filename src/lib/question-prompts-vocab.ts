// ============================================================================
// 어휘 프롬프트 (3 types)
// 유형별 AI 생성 지시사항 — 스키마 필드와 1:1 매칭
// AI는 지문 전체를 복사하지 않고, 서버 재구성에 필요한 최소 데이터만 반환
// ============================================================================

export const VOCAB_PROMPTS: Record<string, string> = {
  CONTEXT_MEANING: `문맥 속 의미 파악 문제를 만드세요.

## 출력 필드
- underlinedWord: 밑줄 칠 단어
- surroundingText: 해당 단어 주변 40~60자 텍스트 (위치 식별용)
- options: label "1"~"5", text는 영어 동의어 선택지
- ⚠️ passageWithUnderline 필드는 생성하지 마세요 (서버에서 자동 생성)
- direction 예시: "밑줄 친 단어의 문맥상 의미와 가장 가까운 것은?"`,

  SYNONYM: `동의어 문제를 만드세요.
- targetWord: 대상 단어
- contextSentence: 문맥 문장 (지문에서 발췌)
- options: label "1"~"5", text는 영어 동의어 선택지
- direction 예시: "다음 밑줄 친 단어의 의미와 가장 유사한 것은?"`,

  ANTONYM: `반의어 문제를 만드세요.

## 출력 필드
- markedWords: 5개 배열. 각 항목:
  - label: "(A)"~"(E)"
  - word: 원문에 있는 정확한 단어
  - surroundingText: 해당 단어 주변 40~60자 (위치 식별용)
  - antonym: 반의어
- options: label "1"~"5", text는 "단어 - 반의어" 쌍 선택지
- ⚠️ passageWithMarkers 필드는 생성하지 마세요 (서버에서 자동 생성)
- direction 예시: "지문의 밑줄 친 단어와 반의어 관계가 바르게 짝지어진 것은?"`,
};
