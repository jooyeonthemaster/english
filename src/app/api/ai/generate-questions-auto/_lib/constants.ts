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
