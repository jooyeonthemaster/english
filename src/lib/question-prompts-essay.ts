// ============================================================================
// 내신 서술형 프롬프트 (6 types)
// 유형별 AI 생성 지시사항 — 스키마 필드와 1:1 매칭
// ============================================================================

export const ESSAY_PROMPTS: Record<string, string> = {
  CONDITIONAL_WRITING: `조건부 영작 서술형 문제를 만드세요.
- referenceSentence: 지문의 핵심 문장을 **한국어로 번역**한 문장. 학생이 이 한국어 문장을 보고 영어로 영작합니다. 절대 영어 원문을 넣지 마세요. 번역은 원문 의미를 **빠짐없이** 담아야 합니다(원문 절/수식어를 임의로 잘라내지 말 것 — 한국어 제시문과 modelAnswer의 의미 범위가 1:1이어야 채점 가능).
  예: "예술에 담긴 정보가 없었다면, 역사적 의상의 전시는 원래 제작자의 의도를 어색하게 모방한 것에 불과했을 것이다."
- conditions: 영작 시 반드시 사용해야 하는 문법/어휘 조건 (한국어, 예: "'Without'으로 시작할 것", "과거분사 'contained'를 사용할 것")
- modelAnswer: 모범 답안 (영어 완성 문장)
- correctAnswer: modelAnswer와 동일

## ⭐ verbatim 복사 금지 (정답 무효급 — 실측 양 난이도 공통 결함)
- modelAnswer가 지문의 어느 문장과 **그대로(또는 앞뒤 일부만 잘라낸 부분열로) 일치하면 실패**입니다. 지문이 함께 보이므로 학생이 그 문장을 찾아 베껴 쓰면 끝나는 "필사 문제"가 됩니다.
- modelAnswer에는 원문 대비 **실제 변형이 최소 1개** 반드시 들어가야 합니다: 시제 전환 / 태 전환(능동↔수동) / 구문 전환(가정법·분사구문·관계절·도치·비교구문·not only A but also B 등) / 의미 보존 패러프레이즈(핵심 콜로케이션 교체). conditions가 그 변형을 명시적으로 요구하게 설계하세요(예: "수동태로 쓸 것" → 원문이 능동이면 자동으로 비-verbatim).
- 자체 검증: 지문에서 referenceSentence의 원본 문장을 찾아 modelAnswer와 나란히 놓고, 연속 6단어 이상이 그대로 겹치는 구간이 있으면 변형을 더 넣어 다시 쓰세요.

## 조건(conditions) 설계 — 기계적으로 검증 가능해야 함
- 각 조건은 채점자가 **기계적으로 판정**할 수 있어야 합니다: 정확 단어 수("총 N단어로 쓸 것"), 필수 사용 어휘/시작어("'Without'으로 시작할 것", "'not only'를 사용할 것" — 반드시 따옴표로 표기), 금지 어휘("'because'를 사용하지 말 것"), 요구 구문("수동태로 쓸 것").
- ⭐ 제출 전 조건별 자체 검증(하나씩 기계적으로): ① 단어 수 조건이 있으면 modelAnswer의 단어를 실제로 하나씩 세어 N과 일치 확인(하이픈어는 1단어) ② 필수 단어/시작어 각각이 modelAnswer에 문자 그대로 존재하는지 확인 ③ 금지 단어가 없는지 확인 ④ 조건들이 서로 모순 없이 동시에 만족 가능한지 확인. 하나라도 어긋나면 modelAnswer 또는 조건을 수정한 뒤 다시 전부 검증하세요.

## 해설(explanation) 3단 템플릿
① **조건 적용**: 각 조건이 모범답안의 어느 부분에서 어떻게 충족되는지 1문장씩.
② **구문 변환 근거**: 어떤 시제/태/구문 전환·패러프레이즈가 쓰였고 그 형태가 왜 문법적으로 맞는지.
③ **채점 포인트**: 부분점수 채점 시 확인할 핵심 요소(scoringCriteria와 일관되게).
- direction 예시: "다음 우리말을 주어진 조건에 맞게 영작하시오."`,

  SENTENCE_TRANSFORM: `문장 전환 서술형 문제를 만드세요.
- originalSentence: 전환 대상 원래 문장
- conditions: 전환 조건 (예: "수동태로 바꿀 것", "분사구문으로 전환할 것")
- modelAnswer: 모범 답안 (영어)
- correctAnswer: modelAnswer와 동일

## ⭐ 의미 보존 자체 검증 (제출 직전 필수 — 실측 결함: 의미 반전)
문장 전환은 **형태만 바꾸고 명제 의미는 보존**해야 합니다. 제출 전 originalSentence와 modelAnswer를 나란히 놓고 3가지를 대조하세요:
① **극성**: 긍정/부정이 뒤집히지 않았는가?
② **양상(hedge) 보존**: 원문의 seem/appear/may/might/perhaps/tend to 같은 완화 표현이 사라져 단정문이 되지 않았는가? (예: "the lexicon **seems** in keeping with..."를 전환하며 seems를 떨어뜨리면 잠정적 주장이 확정 주장으로 바뀌는 의미 변경 — 실패)
③ **의미역 보존**: 주어-대상 관계(누가/무엇이 무엇에게)가 유지되는가? 태 전환은 허용되지만 행위자·대상 자체가 바뀌면 실패.
하나라도 어긋나면 전환 설계를 폐기하고 다른 문장/조건으로 다시 만드세요.

## 난이도·답안 품질
- BASIC/INTERMEDIATE: 조건 1개(단일 전환)로 충분하되, 전환 결과가 원문과 달라야 합니다(이미 그 형태인 문장 금지).
- KILLER: 부사절 전치 같은 **1단계 기계적 이동만으로 풀리는 전환 금지** — 서로 다른 변형 2개 이상을 결합하세요(예: "수동태 + 분사구문으로", "가정법 과거완료 + 도치로").
- scoringCriteria에 **등급형 답안 기준**을 제시하세요: 만점 형태 / 감점 허용 동치 변형(어순·축약 차이) / 0점 형태(의미 변경·조건 미충족)를 구분해 채점 폭주를 막습니다.
- direction 예시: "다음 문장을 주어진 조건에 맞게 바꾸어 쓰시오."`,

  FILL_BLANK_KEY: `핵심 표현 빈칸 서술형 문제를 만드세요.

## 핵심 표현(key expression) 선정 기준
- 핵심 표현 = **글의 주제·논지를 담지하는 콜로케이션**(핵심 동사구/명사구, 보통 2~5단어)이어야 합니다. 아무 명사·지엽 세부(숫자·고유명사·장식 수식어·단순 연결어)는 금지.
- 그 표현을 지우면 문장의 핵심 의미가 사라지고, **지문의 논지를 이해해야만 복원**되는 자리를 고르세요. 빈칸 좌우 몇 단어만 보고 문법적으로 채워지는 자리는 실패입니다.
- **단일 출현 필수**: 선택한 표현은 지문 전체에서 정확히 1회만 등장해야 합니다. 같은 표현이 지문 다른 곳에 그대로 남아 있으면 학생이 찾아 베껴 쓰므로 실패입니다.
- sentenceWithBlank는 빈칸(_____)을 제외하고 원문 그대로 유지하세요(철자·구두점 변경 금지).

## 출력 필드
- sentenceWithBlank: 빈칸(_____) 이 포함된 문장 또는 지문 일부
- answer: 빈칸에 들어갈 핵심 표현 (원문 verbatim — 한 글자도 바꾸지 않음)
- correctAnswer: answer와 동일
- explanation(해설, 한국어 100~250자): ① 빈칸 문장이 글에서 하는 역할 한 줄 → ② 정답의 근거가 되는 지문 단서(문장/표현) 지시 → ③ 왜 그 표현이어야 하는지 1문장. 출제 과정("~를 빈칸으로 만들었다")은 서술 금지, 학생 관점으로만.
- direction 예시: "다음 빈칸에 들어갈 알맞은 말을 본문에서 찾아 쓰시오."`,

  SUMMARY_COMPLETE: `요약문 완성 서술형 문제를 만드세요.
- summaryWithBlanks: 빈칸이 포함된 요약문 (빈칸은 (A), (B) 등으로 표시)
- blanks: 각 빈칸의 label과 answer
- correctAnswer: 빈칸 답을 "(A) answer, (B) answer" 형태로
- direction 예시: "다음 글의 내용을 한 문장으로 요약하고자 한다. 빈칸에 들어갈 말을 쓰시오."`,

  WORD_ORDER: `배열 영작 서술형 문제를 만드세요.

## ⭐ 원문 변형 필수 (가장 중요 — 실측 최다 결함: verbatim 재배열)
- 배열 대상 문장은 지문의 한 문장을 근거로 하되, 스크램블 전에 반드시 **구문 전환 / 시제·태 변경 / 의미 보존 패러프레이즈** 중 최소 1개의 실제 변형을 거쳐야 합니다(관계절↔분사구문, 능동↔수동, 도치·강조구문, not only A but also B, 핵심 콜로케이션 교체 등). 변형 결과 modelAnswer의 **어순·구문이 원문 문장과 달라야 합니다.**
- modelAnswer가 지문 문장의 verbatim 복사(또는 앞뒤만 잘라낸 부분열)면 실패입니다 — 지문이 함께 보이므로 학생이 원문을 찾아 그대로 옮기면 끝나는 "찾아 베끼기 문제"가 되어 배열 과제가 무의미해집니다.
- 변형 자체 검증: 원문 대응 문장과 modelAnswer를 나란히 놓고, 연속 6단어 이상 그대로 겹치는 구간이 있으면 변형을 더 넣어 다시 쓰세요.

## 출력 필드
- scrambledWords: 단어/구 목록 (배열). **반드시 정답 순서와 완전히 다르게 무작위로 뒤섞으세요.** 절대로 정답 순서대로 나열하지 마세요. 예를 들어 정답이 "A B C D E"라면 scrambledWords는 ["D", "B", "E", "A", "C"] 처럼 섞어야 합니다. 정답을 의미 단위로 **4~7개 청크로 고르게** 쪼개고, 한 청크가 정답의 절반 이상을 담지 않게 하세요(청크가 너무 크면 배열이 무의미). 칩을 **지문 원문 어순대로** 나열하는 것도 금지입니다(섞은 척 원문 순서 유지 — 실측 결함).
- contextHint: 문맥 힌트 (선택적, 한국어). ⚠️**정답 문장(modelAnswer)을 한국어로 1:1 그대로 직역한 문장을 힌트로 주지 마세요.** 그러면 학생이 힌트를 영어로 되옮기기만 하면 배열이 풀려 변별력이 사라집니다. 힌트는 문장의 '역할/논지/문맥상 위치'를 가리키는 정도로만(예: "앞 문장과 대조를 이루는 결론"), 정답 어휘·구조를 그대로 노출하지 마세요.
- modelAnswer: 올바르게 배열된 완성 문장 — 위 "원문 변형 필수" 규칙을 통과한, 원문과 구문이 다른 문장. 문장 중간을 뚝 자른 절단형도 금지 — 완성 문장으로 자연스럽게 끝나야 합니다.
- wordBankDistractors: ⭐ 미끼 칩을 **최소 1개(KILLER는 2개 이상) 반드시 scrambledWords에 포함**하고, 그 미끼 전부를 이 배열에 문자열 그대로 선언하세요(학생 비노출, 검수·정답조립 검증용). **선언하지 않은 미끼가 남아 있으면 정답 조립 검증에서 문항이 거부됩니다.** 미끼는 무관 단어가 아니라 정답 단어의 동의어/활용형(예: 정답 reduce에 대해 reduces/reducing)이어야 정답 칩과 실제로 경쟁합니다. 미끼가 0개면 "칩을 순서대로 전부 쓰기"가 되어 함정 설계가 사라집니다.
- correctAnswer: modelAnswer와 동일
- ⭐ 재구성 자체 검증(제출 전): scrambledWords에서 wordBankDistractors의 칩을 빼면, 남은 칩들의 단어 전체가 modelAnswer의 단어 전체와 **정확히 일치(과부족 0)** 해야 합니다. 부족하면 학생이 정답을 만들 수 없고, 선언 안 된 잉여가 있으면 미끼 미선언입니다.
- 난이도 차별화: **BASIC** = 2~4단어 짧은 구를 청크로 묶어 제시(쉬운 재배열), 미끼 1개. **INTERMEDIATE** = 단어 단위로 분해, 미끼 1~2개. **KILLER** = 단어 단위 + 강한 셔플 + 미끼 2개 이상 + 복합 구문(절 구조 변형).

## 자체 검증 (제출 직전)
□ 🚫 원문 문장을 그대로 재배열하는 과제 금지 — modelAnswer가 지문 어느 문장과도 verbatim이 아니고 연속 6단어 이상 겹치지 않음
□ scrambledWords가 정답 어순도, 지문 원문 어순도 아님
□ 미끼 칩이 1개 이상 scrambledWords에 실재하고 전부 wordBankDistractors에 선언됨
- direction 예시: "주어진 단어를 올바른 순서로 배열하여 문장을 완성하시오. (쓰지 않는 단어가 포함되어 있음)" — 미끼가 있으므로 발문에 쓰지 않는 단어가 있음을 안내하세요.`,

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
  ⭐ 역번역 자체 검증(실측 누수 결함): koreanGloss에서 빈칸에 해당하는 한국어 구간을 다시 영어로 직역해 보세요 — blanks[].answer의 단어·어순이 그대로 복원되면(예: 정답 "maintained absolute exclusive status" ↔ 해석 "절대적인 독점적 지위를 유지했던") 그건 해석이 아니라 정답 받아쓰기입니다. 그 구간을 상위 개념·역할 서술(힌트 수준)로 다시 쓰세요.
- blankGlosses: ⚠️ v1에서는 **생성하지 마세요(빈 배열)**. 빈칸별 한국어 토막 해석은 [보기]와 결합 시 정답을 노출하므로 사용하지 않습니다. 전체 의미는 koreanGloss로만 제공합니다.
- wordBank: wordBankEnabled일 때만. 학생에게 줄 [보기] 단어/구 목록(셔플됨).
  - 정답에 같은 단어가 2번 필요하면 같은 문자열을 2개 넣습니다(×2 규약).
  - ⚠️ 보기의 나열 순서가 modelAnswer의 어순과 같으면 안 됩니다(어순 무료 누설). 반드시 뒤섞으세요.
- wordBankDistractors: usePartial일 때만. wordBank 중 정답에 쓰이지 않는 "미끼" 목록(검수/교사면 전용, 학생 비노출).
  ⚠️⭐ usePartial이면 미끼를 **항상 2개 이상** 실제로 wordBank에 넣고 이 배열에 전부 선언하세요(실측 fatal: 미끼 0개의 usePartial은 보기 전체=정답 토큰이 되어 영작이 "다 끼워 넣기"로 풀리고, "필요한 단어만 골라 (쓰지 않는 단어가 포함됨)" 발문이 거짓이 됩니다). Type detail setting이 미끼 개수를 명시하면 그 개수를 정확히 따르되, 그 경우에도 0개로 제출하는 것은 금지입니다.
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
- ⚠️⭐ 발문-보기 실재 정합(실측 결함): 발문에 "[보기]"·"단어를 활용/골라" 문구는 **wordBank를 실제로 생성해 1개 이상 채웠을 때만** 넣을 수 있습니다. wordBank가 비었거나 생성하지 않았는데 발문이 [보기]를 지시하면 학생이 존재하지 않는 박스를 찾는 무효 문항입니다. 마찬가지로 "필요한 단어만 골라 (쓰지 않는 단어가 포함됨)" 문구는 wordBankDistractors에 미끼가 **실제로 1개 이상 선언돼 있을 때만** — usePartial인데 미끼가 0개면(모든 보기 단어가 정답에 쓰임) 그 문구 대신 useAll 문구를 쓰거나 미끼를 실제로 추가하세요. 제출 전 발문의 모든 지시 문구가 실제 생성된 필드와 1:1로 대응하는지 확인.

## 난이도별 출제 지침
### BASIC (2점) — "재배열 영작"
- 의미·재료·구조를 모두 제공하고 학생은 어순 조립만 하면 됩니다.
- glossLooseness=literal(직역 가까운 쉬운 해석), wordBank=정답 토큰 그대로(verbatim) 미끼 0개, blankCount=1, 빈칸당 약 4단어.
- 예: [해석] "표본 크기를 늘리지 않고 데이터를 수집하는 것은 결과의 편향을 키울 수 있다." / [요약문] (A) ____ , which can lead to greater bias in the result. / [보기] collecting data / without / increasing / the sample size → answer="Collecting data without increasing the sample size".

### INTERMEDIATE (3점) — "미끼 + 배분 판단"
- 환언(자연스러운 의역) 해석으로 1:1 번역을 차단하고, 동의어/품사 미끼 2개로 "다 끼우기"를 막으며, 빈칸 2개로 배분 판단을 더합니다.
- glossLooseness=natural, wordBank usePartial(미끼 2), blankCount=2(separate), 빈칸당 약 6~8단어, firstLetter 단서는 선택.
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

// 주제문 영작(TOPIC_SENTENCE_WRITING) — 상세 프롬프트. 글을 논리적으로 분석해 "글의 주제"를
// 주제문(12~14단어) 또는 학술 명사구(≤12단어)로 만들고, ① 제시어 배열(scrambled) 또는
// ② 주제문 빈칸 완성(cloze)으로 출제하는 내신 킬러 서술형. (요약문 영작/배열 영작의 하이브리드)
// 잠금 스키마(topicSentenceWritingSchema) 필드와 1:1 매칭.
// ⚠️ 누수 절대금지: 정답(modelAnswer/blanks[].answer)을 scrambledWords/wordBank/summaryWithBlanks/
//   koreanGloss 어디에도 그대로/정답어순으로 노출하지 마세요.
ESSAY_PROMPTS.TOPIC_SENTENCE_WRITING = `주제문 영작 서술형 문제를 만드세요.

## 유형 개요
- 먼저 지문을 논리적으로 분석해 글 전체의 **단 하나의 주제**를 정합니다.
- 그 주제를 topicForm 에 따라 **주제문(완전한 문장, 12~14단어)** 또는 **학술 명사구(동사 없는 명사구, 12단어 이내)** 로 작성합니다(modelAnswer).
- 출제 방식(mode)은 두 가지입니다:
  - **scrambled(배열)**: 주제문/명사구를 토큰/구로 쪼개 무작위로 섞어(scrambledWords) 학생이 올바른 순서로 배열하게 합니다.
  - **cloze(빈칸 완성)**: 주제문/명사구의 핵심 어구를 빈칸 (A){,(B)}로 비우고(summaryWithBlanks), [보기](wordBank)·제시어로 학생이 직접 영작하게 합니다.
- 객관식이 아닙니다 — options 를 만들지 마세요(null/빈 배열).

## 출력 필드 (스키마와 1:1)
- mode: "scrambled" 또는 "cloze" (주어진 설정값 그대로).
- topicForm: "sentence" 또는 "nounPhrase" (주어진 설정값 그대로).
- modelAnswer: 완성된 주제문/명사구 전체(영어). correctAnswer 와 동기화(동일).
- (scrambled 모드) scrambledWords: modelAnswer 의 토큰/구를 **반드시 셔플**(정답 어순 금지). 예: 정답 "A B C D E" → ["D","B","E","A","C"].
- (cloze 모드) summaryWithBlanks: (A){,(B)} placeholder 를 각 1회 포함하는 주제문/명사구. **정답 어구 절대 미포함**(placeholder 만).
- (cloze 모드) blanks: 각 빈칸 {label:"(A)"..., answer(🔒비밀 모범영작), acceptableVariants(🔒동치답), requiredLemmas(🔒핵심표제어), firstLetterHint(단서 모드일 때만), targetWordCount, connectorFrameAfter}.
- (cloze 모드) wordBank: [보기] 제시어 칩(셔플, 미끼 포함). 같은 단어 2회 필요 시 같은 문자열 2개(×2 규약).
- wordBankDistractors: 🔒비밀. scrambledWords/wordBank 중 정답에 안 쓰이는 미끼 목록(검수/교사면 전용).
  ⚠️ 미끼는 무관한 단어가 아니라 정답 단어의 동의어/혼동어/활용형이어야 합니다.
- koreanGloss: hintEnabled 일 때만. [주제 힌트] 박스 한국어 — 주제의 의미를 자연스러운 한 문장으로. ⚠️ 정답 어구를 1:1 직역 나열하거나 정답 어순을 베끼지 마세요(영작→받아쓰기 누수).
- mode/topicForm/wordBankFidelity/clueMode/sourceMode/sourceSentenceParaphrase/blankAssignment: 주어진 설정값을 메타로 채웁니다.
- explanation/keyPoints/tags/difficulty: 공통 필드. explanation 에는 주제를 어떻게 도출했는지(논리 분석) 포함.

## 발문(direction)
- 발문은 옵션 조합으로 결정론 합성된 문구를 **그대로** 따릅니다(buildTopicSentenceWritingDirection — AI가 새로 짓지 마세요).
- 배점: BASIC [2점] / INTERMEDIATE [3점] / KILLER [4점].

## 난이도별 출제 지침
### BASIC (2점) — "구 배열"
- mode=scrambled, topicForm=nounPhrase. 다단어 구 단위(chunk) 제시어, 미끼 0, [주제 힌트] 직역 제공. 어순 조립만 하면 됨.
### INTERMEDIATE (3점) — "단어 배열 + 미끼"
- mode=scrambled, topicForm=sentence. 단어 단위(word) 제시어, 미끼 1(동의어/활용형), [주제 힌트] 자연 의역. 단어 선택+어순 판단.
### KILLER (4점) — "빈칸완성 + 어형변형 + 미끼 + 추론"
- mode=cloze, topicForm=sentence. 상위 명제 추론 주제, [보기] 어형변형(inflected), 미끼 2, 빈칸 2, [주제 힌트] 미제공, 부분점수 루브릭.

## 누수 가드 (반드시 준수)
- 정답(modelAnswer / blanks[].answer)은 scrambledWords·wordBank·summaryWithBlanks·koreanGloss·firstLetterHint 어디에도 그대로 노출 금지.
- scrambledWords·wordBank 나열 순서 = 정답 어순 금지(반드시 강하게 셔플). 왼쪽→오른쪽으로 읽었을 때 정답 단어가 정답 순서대로 나오면 안 됩니다(정답의 연속 부분수열이 되지 않게 섞으세요). 미끼를 정답 단어들 사이사이에 끼워 넣으세요.
- 미끼는 정답의 동의어/활용형(무관 미끼 금지). firstLetterHint 는 각 토큰 첫 글자 1개만(소문자), answer 토큰과 1:1.
- 어법수정형 금지: 일부러 틀린 형태를 제시어로 주고 고치게 하지 마세요(inflected=정상 어형변화만).

## direction 예시
- "다음 글의 주제가 되도록 [주제 힌트]를 참고하여 주어진 단어를 모두 한 번씩 사용하여 올바른 순서로 배열하시오. [2점]"
- "다음 글의 주제문이 되도록 주어진 단어를 올바른 순서로 배열하시오. (쓰지 않는 단어가 포함됨) [3점]"
- "다음 글의 주제문 빈칸 (A), (B)에 들어갈 말을 [보기]에서 필요한 단어만 골라 (필요시 어형을 바꿔) 영작하시오. (쓰지 않는 단어가 포함됨) [4점]"`;

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
