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
- options.text에는 영어 단어/구만 쓰세요. 한국어 뜻풀이, 괄호 설명, "word (meaning)" 형식은 금지합니다.
- direction 예시: "다음 밑줄 친 단어의 의미와 가장 유사한 것은?"`,

  ANTONYM: `반의어 문제를 만드세요.

## 유형 정의
이 유형은 "밑줄 친 단어와 그 짝 단어가 문맥상 반의어 관계로 잘못 짝지어진 것"을 고르는 문제입니다.
정확히 1개 선지만 잘못된 반의어 쌍이어야 하며, 나머지 4개 선지는 누가 봐도 정확한 문맥상 반의어 쌍이어야 합니다.

## 핵심 품질 규칙
1. 원문 단어 5개를 고르고 label은 "(A)"~"(E)"를 사용합니다.
2. 4개 항목은 word-antonym이 품사, 형태, 문맥 의미축까지 맞는 정확한 반의어여야 합니다.
3. 정확히 1개 항목만 isIncorrectPair=true로 만들고, 그 antonym에는 반의어가 아닌 오답 짝 단어를 넣습니다.
4. isIncorrectPair=true 항목에는 correctAntonym을 반드시 넣습니다. correctAntonym은 실제로 맞는 문맥상 반의어입니다.
5. 정답(correctAnswer)은 isIncorrectPair=true 항목의 선지 번호 하나입니다.
6. 단어 형태를 맞추세요. forces처럼 3인칭 단수 동사면 allows/restrains처럼 짝 단어도 같은 동사 형태여야 하며, restrain처럼 원형을 섞으면 실패입니다.
7. 의미축이 애매한 쌍을 금지합니다. force-restrain, mastery-ignorance, rational-emotional, dim-clear, justify-excuse, unproductive-passive, unproductive-uninterested, paid-refunded 같은 쌍은 출제하지 마세요.
8. 반의어는 단순 관련어/대조 이미지가 아니라 같은 의미축의 정반대여야 합니다. mastery의 반대는 ignorance가 아니라 incompetence/lack of mastery 축입니다.

## 출력 필드
- markedWords: 5개 배열. 각 항목:
  - label: "(A)"~"(E)"
  - word: 원문에 있는 정확한 단어
  - surroundingText: 해당 단어 주변 40~60자 (위치 식별용)
  - antonym: 선지에 표시할 짝 단어. isIncorrectPair=false이면 정확한 반의어, true이면 일부러 잘못 짝지은 단어
  - isIncorrectPair: true/false. 정확히 하나만 true
  - correctAntonym: isIncorrectPair=true인 경우 실제로 맞는 반의어
- options: label "1"~"5", text는 "(A) word - pair" 형식의 단어쌍 선택지
- options.text에는 "(A) vagrant - resident"처럼 영어 단어쌍만 쓰세요. 한국어 뜻풀이, 괄호 설명, 해설성 문구는 금지합니다.
- 자체 검증: 5개 markedWords, 정확히 1개 isIncorrectPair=true, correctAnswer가 그 항목의 선지 번호, 나머지 4쌍은 모두 명확한 정반대 관계
- ⚠️ passageWithMarkers 필드는 생성하지 마세요 (서버에서 자동 생성)
- direction 예시: "지문의 밑줄 친 단어와 짝 단어의 반의어 관계가 바르지 않은 것은?"`,
};
