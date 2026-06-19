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

  SUMMARY_WRITING: `요약문 영작 서술형 문제를 만드세요.
- summaryWithBlanks: (A){, (B), (C)} placeholder를 각 1회 포함하는 영어 요약문. 정답 어구를 절대 포함하지 마세요(placeholder만).
- blanks[].answer: 각 빈칸의 모범 영작(다단어 어구, 영어).
- modelAnswer: 빈칸을 모두 채운 전체 모범 요약문(영어). correctAnswer = modelAnswer로 동기화.
- direction 예시: "다음 글의 요약문 빈칸 (A)에 들어갈 말을 [보기]의 단어를 활용하여 영작하시오."`,
};

// 요약문 영작(SUMMARY_WRITING) — 상세 프롬프트. SUMMARY_COMPLETE(요약문 완성)의
// 한 단계 상위로, 학생이 한 빈칸에 다단어 어구 전체를 직접 "영작(작문)"한다.
// 잠금 스키마(question-schemas-essay.ts summaryWritingSchema) 필드와 1:1 매칭.
// ⚠️ 누수 절대 금지: 정답 어구는 summaryWithBlanks / koreanGloss / wordBank /
//   firstLetterHint 어디에도 노출하지 마세요. 보기 어순 = 정답 어순도 금지.
ESSAY_PROMPTS.SUMMARY_WRITING = `요약문 영작 서술형 문제를 만드세요.

## 유형 개요
- 지문 전체를 한두 문장으로 요약한 영어 요약문에서 핵심 어구를 빈칸 (A){, (B), (C)}로 비워 둡니다.
- 학생은 [보기]·[해석]·[앞글자] 단서를 활용해 그 빈칸에 들어갈 영어 어구를 "직접 영작"합니다. (객관식 선지를 고르는 것이 아닙니다 — 선지를 만들지 마세요.)
- 한 빈칸에는 한 단어가 아니라 다단어 어구 전체(예: "Collecting data without increasing the sample size")가 들어갑니다.

## 출력 필드 (스키마와 1:1)
- summaryWithBlanks: (A){, (B), (C)} placeholder를 각 정확히 1회 포함하는 영어 요약문.
  ⚠️ 빈칸 자리에는 placeholder 라벨만 두고, 정답 어구를 절대 넣지 마세요. 라벨 외에는 정답을 유추하게 만드는 단어를 넣지 마세요.
- blanks: 빈칸 정의 배열(요청 개수만큼). 각 항목:
  - label: "(A)", "(B)", "(C)" — summaryWithBlanks 등장 순서.
  - answer: 이 빈칸의 모범 영작(다단어 어구, 영어). 자연스러운 collocation이어야 합니다.
  - acceptableVariants: 동치 정답(어순 변형/동의 구문 — 분사구문↔관계절, not only A but B↔both 등). 채점 폭주를 막기 위한 동치답 1~3개.
  - requiredLemmas: 부분점수 채점에 반드시 포함돼야 할 핵심 표제어(원형). 예: ["collect","sample"].
  - firstLetterHint: clueMode=firstLetter일 때만. answer의 각 토큰 첫 글자를 "소문자 한 글자"로, 공백으로 구분해 answer 토큰과 1:1로 나열(예: answer="pursuing superficial diversity" → "p s d"). 토큰 수가 answer와 다르면 안 됩니다.
  - targetWordCount: 이 빈칸 목표 단어 수(정수). targetWordsMode=approx면 "약 N단어"로 표시됩니다. hidden이면 생략.
  - connectorFrameAfter: 빈칸 뒤에 이어지는 고정 프레임(예: ", which can lead to greater bias"). connectorFrame=full/partial일 때만.
- koreanGloss: glossEnabled일 때만 작성하는 [해석] 박스 한국어 뜻. **글 전체의 의미를 자연스러운 한 문장으로** 풀어 줍니다(레퍼런스의 [해석] 형식).
  ⚠️ 빈칸(정답 어구)을 한국어로 **빈칸별로 토막내어 1:1 직역하지 마세요**. 빈칸 부분의 의미는 전체 문장 흐름 속에 자연스럽게 녹여 표현하되, 보기 단어를 그대로 한국어로 옮겨 나열하거나 정답 어순을 베껴 옮기지 마세요(영작을 받아쓰기로 만드는 누수).
- blankGlosses: ⚠️ v1에서는 **생성하지 마세요(빈 배열)**. 빈칸별 한국어 토막 해석은 [보기]와 결합 시 정답을 노출하므로 사용하지 않습니다. 전체 의미는 koreanGloss로만 제공합니다.
- wordBank: wordBankEnabled일 때만. 학생에게 줄 [보기] 단어/구 목록(셔플됨).
  - 정답에 같은 단어가 2번 필요하면 같은 문자열을 2개 넣습니다(×2 규약).
  - ⚠️ 보기의 나열 순서가 modelAnswer의 어순과 같으면 안 됩니다(어순 무료 누설). 반드시 뒤섞으세요.
- wordBankDistractors: usePartial일 때만. wordBank 중 정답에 쓰이지 않는 "미끼" 목록(검수/교사면 전용, 학생 비노출).
  ⚠️ 미끼는 무관한 단어가 아니라 정답 단어의 동의어/혼동어/활용형이어야 합니다(무관 미끼는 즉시 배제돼 함정이 무력해짐).
- wordBankPolicy("useAll"|"usePartial"|"freeCount"), wordBankFidelity("verbatim"|"inflected"|"mixed"), blankAssignment("separate"|"shared"), clueMode, targetWordsMode, connectorFrame, summarySourceMode, sourceSentenceParaphrase: 주어진 설정 값을 그대로 메타로 채웁니다.
- modelAnswer: 빈칸을 모두 채운 전체 모범 요약문(영어). correctAnswer와 동기화(동일).
- correctAnswer: modelAnswer와 동일.
- scoringCriteria: 부분점수 루브릭(한국어, 교사면 전용). 예: ["핵심어구 'collecting data' 포함 시 1점","'without increasing the sample size' 포함 시 1점"].
- explanation/keyPoints/tags/difficulty: 공통 필드.

## 발문(direction)
- 발문은 옵션 조합에 따라 결정론적으로 합성된 문구를 따릅니다(buildSummaryWritingDirection 산출 — AI가 매번 다른 문구를 지어내지 마세요).
- 기본형: "다음 글의 요약문 빈칸 (A){,(B)}에 들어갈 말을 영작하시오."
- wordBankEnabled면 "+ [보기]의 단어를 활용하여".
- wordBankPolicy=useAll이고 fidelity=verbatim이고 미끼가 0이면 "+ [보기]의 단어를 변형 없이 한 번씩 모두 사용하여".
- fidelity≠verbatim이면 "+ (필요시 어형을 바꿔)".
- 미끼가 있으면(usePartial) "+ [보기]에서 필요한 단어만 골라 (쓰지 않는 단어가 포함됨)".
- targetWordsMode=exact면 "+ 각 빈칸을 N단어로", approx면 "+ 약 N단어로".
- glossEnabled면 "[해석]을 참고하여".
- 배점: BASIC [2점] / INTERMEDIATE [3점] / KILLER [4점].
- ⚠️ 미끼가 있거나 어형을 바꿔야 하면 "변형 없이 한 번씩 모두 사용" 문구를 발문에 넣지 마세요(정답 불가능 모순).

## 난이도별 출제 지침
### BASIC (2점) — "재배열 영작"
- 의미·재료·구조를 모두 제공하고 학생은 어순 조립만 하면 됩니다.
- glossLooseness=literal(직역 가까운 쉬운 해석), wordBank=정답 토큰 그대로(verbatim) 미끼 0개, blankCount=1, 빈칸당 약 4단어.
- 예: [해석] "표본 크기를 늘리지 않고 데이터를 수집하는 것은 결과의 편향을 키울 수 있다." / [요약문] (A) ____ , which can lead to greater bias in the result. / [보기] collecting data / without / increasing / the sample size → answer="Collecting data without increasing the sample size".

### INTERMEDIATE (3점) — "미끼 + 배분 판단"
- 환언(자연스러운 의역) 해석으로 1:1 번역을 차단하고, 동의어/품사 미끼 1~2개로 "다 끼우기"를 막으며, 빈칸 2개로 배분 판단을 더합니다.
- glossLooseness=natural, wordBank usePartial(미끼 1~2), blankCount=2(separate), 빈칸당 약 6~8단어, firstLetter 단서는 선택.
- 미끼는 정답의 동의어/활용형(예: 정답 visible에 대해 real/actual)로 둡니다.

### KILLER (4점) — "추론 요약 + 어형 변형 + 미끼 + 배분"
- 해석을 제공하지 않고(glossEnabled=false), 지문 표면을 넘어선 추론 요약(상위 명제)으로 요약문을 구성합니다.
- wordBank usePartial(미끼 2~3, 동의어), wordBankFidelity=inflected(보기는 원형/기본형으로 주고 학생이 시제·수일치 등 어형을 바꿔 쓰게 함 — 단, 틀린 형태를 주고 고치게 하는 어법수정형은 금지), blankCount=2(shared 가능), targetWordsMode=hidden.
- 빈칸 밖 문장도 같은 의미로 변형(sourceSentenceParaphrase)해 지문 암기 표면 매칭을 막습니다.
- 부분점수 루브릭(scoringCriteria)으로 핵심 어구별 채점을 안내합니다.

## 누수 가드 (반드시 준수)
- 정답 어구(blanks[].answer / modelAnswer)는 summaryWithBlanks·koreanGloss·wordBank·firstLetterHint 어디에도 그대로 노출하지 마세요.
- wordBank의 나열 순서를 modelAnswer 어순과 같게 두지 마세요(반드시 셔플).
- firstLetterHint는 각 토큰의 "첫 글자 한 개"만(소문자), answer 토큰 수와 1:1. 두 번째 글자·단어 길이·고유명사 통째 노출 금지.
- 어법수정형 금지(v1): 일부러 틀린 형태를 보기로 주고 고치게 하지 마세요. wordBankFidelity=inflected는 시제·수일치 등 정상적인 어형 변화만 요구합니다.

## direction 예시
- "다음 글의 요약문 빈칸 (A)에 들어갈 말을 [보기]의 단어를 변형 없이 한 번씩 모두 사용하여 영작하시오. [2점]"
- "다음 글의 [해석]을 참고하여 요약문 빈칸 (A), (B)에 들어갈 말을 [보기]에서 필요한 단어만 골라 (필요시 어형을 바꿔) 영작하시오. (쓰지 않는 단어가 포함됨) [3점]"`;

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
