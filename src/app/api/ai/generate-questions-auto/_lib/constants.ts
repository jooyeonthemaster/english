export const TYPE_LABELS: Record<string, string> = {
  BLANK_INFERENCE: "빈칸 추론",
  GRAMMAR_ERROR: "어법 판단",
  VOCAB_CHOICE: "어휘 적절성",
  SENTENCE_ORDER: "글의 순서",
  SENTENCE_INSERT: "문장 삽입",
  TOPIC_MAIN_IDEA: "주제/요지",
  TITLE: "제목 추론",
  REFERENCE: "지칭 추론",
  CONTENT_MATCH: "내용 일치",
  IRRELEVANT: "무관한 문장",
  CONDITIONAL_WRITING: "조건부 영작",
  SENTENCE_TRANSFORM: "문장 전환",
  FILL_BLANK_KEY: "핵심 표현 빈칸",
  SUMMARY_COMPLETE: "요약문 완성",
  WORD_ORDER: "배열 영작",
  GRAMMAR_CORRECTION: "문법 오류 수정",
  CONTEXT_MEANING: "문맥 속 의미",
  SYNONYM: "동의어",
  ANTONYM: "반의어",
};

export const DIFF_DESCRIPTION: Record<string, string> = {
  BASIC: "기본 — 교과서 수준, 직접적 이해 위주, 쉬운 어휘와 단순 문법",
  INTERMEDIATE: "중급 — 모의고사 중위권 수준, 추론 필요, 패러프레이징 포함",
  KILLER:
    "킬러 — 수능 1등급 컷 수준, 고난도 추론/함축 의미 파악, 복잡한 구문과 어휘, 매력적인 오답",
};

export const DIFFICULTY_RUBRIC: Record<string, string> = {
  BASIC: `## 난이도 품질 기준
- BASIC은 원문 근거가 직접 드러나는 확인형 문제로 만드세요.
- 함정 선지는 명백히 구분되게 하되, 정답 근거는 반드시 지문에 있어야 합니다.`,
  INTERMEDIATE: `## 난이도 품질 기준
- INTERMEDIATE는 원문 한 문장 복사가 아니라 문맥 연결, 쉬운 패러프레이즈, 원인-결과 추론을 요구해야 합니다.
- 오답은 지문 일부와 연결되지만 핵심 논리에서 어긋나게 구성하세요.`,
  KILLER: `## 난이도 품질 기준 - KILLER
- "KILLER" 라벨만 붙이지 말고, 실제 상위권 변별 문제로 만드세요.
- 정답은 최소 2단계 사고가 필요해야 합니다: 지문 근거 확인 -> 문맥/논리/함축 해석 -> 선지 간 미세 차이 판별.
- 오답 4개는 전부 그럴듯해야 하며, 단순 반대말/무관 단어/길이 차이로 쉽게 지워지면 안 됩니다.
- 해설은 왜 정답인지뿐 아니라 매력적인 오답이 왜 틀렸는지 핵심 함정을 짚어야 합니다.
- 어휘형 KILLER는 단순 사전식 synonym/antonym을 피하고, 문맥상 뉘앙스/평가/논리 역할까지 보게 하세요.
- 지칭 추론은 대명사의 문법적 수/의미 역할/앞뒤 논리를 모두 확인해야 풀리게 하세요.
- 서술형 KILLER는 한 개 문법 포인트가 아니라 2개 이상의 조건을 동시에 만족하게 하세요.
- 요약문/영작/배열 문제의 정답은 자연스러운 영어 collocation이어야 하며, 어색한 조합은 금지합니다.
- 배열 영작의 scrambledWords는 정답 순서 그대로 두지 말고, punctuation-only 조각이 생기지 않게 의미 단위로 나누세요.`,
};

export const MARKING_RUBRIC = `## 표시/위치 정확도 필수 규칙
- underlinedPronoun/underlinedWord/originalExpression/markedWords/markedExpressions는 원문에 실제로 존재하는 표현만 쓰세요.
- 특히 "it", "is", "in", "as" 같은 짧은 단어는 반드시 독립 단어로 존재하는 위치만 선택하세요. digital, commitments, within 같은 단어 내부의 일부를 선택하면 실패입니다.
- surroundingText는 선택한 표현을 포함하는 원문 그대로의 40~80자여야 하며, 철자/공백/문장부호를 바꾸지 마세요.
- passageWithBlank, passageWithMarkers, passageWithUnderline, passageWithNumbers 같은 지문 전체 복사 필드는 생성하지 마세요.`;
