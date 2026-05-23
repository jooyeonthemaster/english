/**
 * 시험지 디자인 토큰.
 * DOCX 와 같은 시각 비율을 유지하기 위해 pt/색상을 동일하게 맞춤.
 */

export const COLORS = {
  black: "#000000",
  darkGray: "#333333",
  gray: "#666666",
  lightGray: "#999999",
  separator: "#CCCCCC",
  errorLeft: "#FF0000",
  answerBg: "#F5F5F5",
} as const;

// pt 단위
export const SIZE = {
  title: 22,
  titleCompact: 18,
  subtitle: 8,
  info: 9,
  instructions: 9,
  qNum: 11,
  qNumCompact: 10,
  meta: 8.5,
  body: 10,
  bodyCompact: 9,
  passageTitle: 7.5,
  continued: 8,
  footer: 8,
  answerLabel: 9,
  answerValue: 11,
  explainLabel: 9,
  explainBody: 9.5,
} as const;

export const SUBTYPE_LABELS: Record<string, string> = {
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
