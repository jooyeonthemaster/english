// ============================================================================
// 내신 서술형 프롬프트 (6 types)
// 유형별 AI 생성 지시사항 — 스키마 필드와 1:1 매칭
// ============================================================================

export const ESSAY_PROMPTS: Record<string, string> = {
  CONDITIONAL_WRITING: `조건부 영작 서술형 문제를 만드세요.
- referenceSentence: 지문의 핵심 문장을 **한국어로 번역**한 문장. 학생이 이 한국어 문장을 보고 영어로 영작합니다. 절대 영어 원문을 넣지 마세요.
  예: "예술에 담긴 정보가 없었다면, 역사적 의상의 전시는 원래 제작자의 의도를 어색하게 모방한 것에 불과했을 것이다."
- conditions: 영작 시 반드시 사용해야 하는 문법/어휘 조건 (한국어, 예: "'Without'으로 시작할 것", "과거분사 'contained'를 사용할 것")
- modelAnswer: 모범 답안 (영어 완성 문장)
- correctAnswer: modelAnswer와 동일
- direction 예시: "다음 우리말을 주어진 조건에 맞게 영작하시오."`,

  SENTENCE_TRANSFORM: `문장 전환 서술형 문제를 만드세요.
- originalSentence: 전환 대상 원래 문장
- conditions: 전환 조건 (예: "수동태로 바꿀 것", "분사구문으로 전환할 것")
- modelAnswer: 모범 답안 (영어)
- correctAnswer: modelAnswer와 동일
- direction 예시: "다음 문장을 주어진 조건에 맞게 바꾸어 쓰시오."`,

  FILL_BLANK_KEY: `핵심 표현 빈칸 서술형 문제를 만드세요.
- sentenceWithBlank: 빈칸(_____) 이 포함된 문장 또는 지문 일부
- answer: 빈칸에 들어갈 핵심 표현
- correctAnswer: answer와 동일
- direction 예시: "다음 빈칸에 들어갈 알맞은 말을 본문에서 찾아 쓰시오."`,

  SUMMARY_COMPLETE: `요약문 완성 서술형 문제를 만드세요.
- summaryWithBlanks: 빈칸이 포함된 요약문 (빈칸은 (A), (B) 등으로 표시)
- blanks: 각 빈칸의 label과 answer
- correctAnswer: 빈칸 답을 "(A) answer, (B) answer" 형태로
- direction 예시: "다음 글의 내용을 한 문장으로 요약하고자 한다. 빈칸에 들어갈 말을 쓰시오."`,

  WORD_ORDER: `배열 영작 서술형 문제를 만드세요.
- scrambledWords: 단어/구 목록 (배열). **반드시 정답 순서와 완전히 다르게 무작위로 뒤섞으세요.** 절대로 정답 순서대로 나열하지 마세요. 예를 들어 정답이 "A B C D E"라면 scrambledWords는 ["D", "B", "E", "A", "C"] 처럼 섞어야 합니다.
- contextHint: 문맥 힌트 (선택적, 한국어)
- modelAnswer: 올바르게 배열된 완성 문장
- correctAnswer: modelAnswer와 동일
- direction 예시: "주어진 단어를 올바른 순서로 배열하여 문장을 완성하시오."`,

  GRAMMAR_CORRECTION: `문법 오류 수정 서술형 문제를 만드세요.
- sentenceWithError: 오류가 포함된 문장
- errorPart: 오류 부분
- correctedPart: 수정된 부분
- correctedSentence: 전체 수정된 문장
- correctAnswer: correctedPart
- direction 예시: "다음 문장에서 어법상 틀린 부분을 찾아 바르게 고쳐 쓰시오."`,
};
