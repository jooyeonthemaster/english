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
- underlinedSegments: 문장/절 단위 밑줄 구간 1~5개. 모든 항목은 label("(A)"부터 순서대로), isError=true 포함
- errorPart/errorParts: 밑줄 구간 안에 숨어 있는 틀린 표현
- correctedPart/correctedParts: 학생이 써야 하는 올바른 표현
- correctedSentence: 첫 correctedPart가 들어간 원문 문장
- correctAnswer: "(A) correctedPart, (B) correctedPart"처럼 label과 correctedPart를 순서대로 연결
- direction 예시: "다음 글의 밑줄 친 부분에서 어법상 틀린 부분을 찾아 바르게 고쳐 쓰시오."`,
};

ESSAY_PROMPTS.GRAMMAR_CORRECTION = `어법 고치기 서술형 문제를 만드세요.

## 출제 방식
- 원문 지문 안에서 문장 또는 절 단위의 밑줄 구간을 고릅니다. 설정이 없으면 1개, 설정이 있으면 정확히 그 개수만큼 고릅니다.
- 밑줄 구간 개수와 오류 개수는 같습니다. 모든 밑줄 구간 안에 어법 오류를 숨깁니다.
- 각 밑줄 구간은 (A), (B), (C)처럼 순서대로 구분되어야 합니다.
- 오류 표현 자체만 밑줄 치지 마세요. 밑줄 구간은 errorPart보다 충분히 넓은 문장/절이어야 합니다.
- 학생은 밑줄 친 구간 안에서 틀린 표현을 직접 찾아 올바른 표현으로 고쳐 씁니다.
- 문제 아래에 오류 문장이나 틀린 위치를 따로 제시하지 마세요.
- underlinedSegments.sourceText는 반드시 원문 지문에 있는 올바른 문장/절입니다.
- isError=true인 항목의 displayedText는 sourceText 안의 correctedPart를 errorPart로 바꾼 텍스트입니다.

## 좋은 어법 포인트
- 주어-동사 수일치, 정동사/준동사, 병렬구조, 분사 능수동, 관계사/명사절, 대명사 일치, 보어 형태, 비교구문, 전치사 vs 접속사처럼 내신에서 판단 가치가 큰 포인트를 사용합니다. 수능·평가원 28년 최빈출 코어(정·준동사, 관계사 that/what, 분사 능수동, 병렬, 수일치)를 우선합니다.
- 관사, 사소한 전치사, 철자, 구두점, 문체 선호, 논쟁적인 표현 개선은 사용하지 마세요.
- 원문이 이미 문법적으로 옳다고 가정하고, 원문을 고치는 문제가 아니라 원문 표현을 틀리게 변형한 뒤 되돌리게 하는 문제를 만듭니다.

## ⚠️ errorPart 설계 — "둘 다 맞는" 변형·비현실적 형태 금지
- 밑줄 구간(sourceText)은 절/문장 단위로 넓게 두되, 실제 틀린 토큰(errorPart)은 **판단이 걸린 최소 단위**(보통 1~3단어)여야 합니다. 절 전체를 errorPart로 잡지 마세요.
- errorPart↔correctedPart는 **한쪽만 명백히 틀려야** 합니다. 둘 다 문법적으로 성립하는 변형 금지: "better utilizing"↔"to better utilize", "to gain"↔"to be gained", "stop to do"↔"stop doing", that 생략 가능 자리, 시간부사 없는 현재완료↔과거.
- errorPart는 실제 영어에 있는 형태여야 합니다. ❌"unfriendlily"(-ly 형용사에 -ly), ❌"more better"(이중 비교급), ❌"informations"(불가산 복수), ❌"childs" 같은 가짜 형태 금지. -ly 형용사(friendly/costly)는 부사로 못 바꾸므로 형/부 오류로 쓰지 마세요.

## 출력 필드
- underlinedSegments: 문장/절 단위 밑줄 구간 1~5개. 각 항목은 label, sourceText, displayedText, isError=true, surroundingText, errorPart, correctedPart를 포함합니다.
- errorPart: 첫 밑줄 구간 안에 숨어 있는 틀린 표현
- errorParts: 각 밑줄 구간 안에 숨어 있는 틀린 표현 목록
- correctedPart: 첫 밑줄 구간의 원문에 있던 올바른 표현
- correctedParts: 각 밑줄 구간의 원문에 있던 올바른 표현 목록
- correctedSentence: 첫 correctedPart가 들어간 원문 문장
- correctAnswer: "(A) correctedPart, (B) correctedPart"처럼 label과 correctedPart를 순서대로 연결
- direction: "다음 글의 밑줄 친 부분에서 어법상 틀린 부분을 찾아 바르게 고쳐 쓰시오."`;
