export const VOCAB_DIFFICULTY: Record<string, { label: string; color: string }> = {
  basic: { label: "기본", color: "bg-emerald-100 text-emerald-700" },
  intermediate: { label: "심화", color: "bg-blue-100 text-blue-700" },
  advanced: { label: "고난도", color: "bg-red-100 text-red-700" },
};

export const EXAM_TYPE_GROUPS = [
  {
    group: "수능/모의고사 객관식",
    items: [
      { id: "BLANK_INFERENCE", label: "빈칸 추론" },
      { id: "GRAMMAR_ERROR", label: "어법 판단" },
      { id: "VOCAB_CHOICE", label: "어휘 적절성" },
      { id: "SENTENCE_ORDER", label: "글의 순서" },
      { id: "SENTENCE_INSERT", label: "문장 삽입" },
      { id: "TOPIC_MAIN_IDEA", label: "주제/요지" },
      { id: "TITLE", label: "제목 추론" },
      { id: "REFERENCE", label: "지칭 추론" },
      { id: "CONTENT_MATCH", label: "내용 일치" },
      { id: "IRRELEVANT", label: "무관한 문장" },
    ],
  },
  {
    group: "내신 서술형",
    items: [
      { id: "CONDITIONAL_WRITING", label: "조건부 영작" },
      { id: "SENTENCE_TRANSFORM", label: "문장 전환" },
      { id: "FILL_BLANK_KEY", label: "핵심 표현 빈칸" },
      { id: "SUMMARY_COMPLETE", label: "요약문 완성" },
      { id: "WORD_ORDER", label: "배열 영작" },
      { id: "GRAMMAR_CORRECTION", label: "문법 오류 수정" },
    ],
  },
  {
    group: "어휘",
    items: [
      { id: "CONTEXT_MEANING", label: "문맥 속 의미" },
      { id: "SYNONYM", label: "동의어" },
      { id: "ANTONYM", label: "반의어" },
    ],
  },
];

export const Q_TYPE_LABELS: Record<string, string> = {
  MULTIPLE_CHOICE: "객관식",
  SHORT_ANSWER: "주관식",
  FILL_BLANK: "빈칸",
  ORDERING: "순서배열",
  VOCAB: "어휘",
};

export const Q_SUBTYPE_LABELS: Record<string, string> = {
  BLANK_INFERENCE: "빈칸 추론", GRAMMAR_ERROR: "어법 판단", VOCAB_CHOICE: "어휘 적절성",
  SENTENCE_INSERT: "문장 삽입", SENTENCE_ORDER: "글의 순서", TOPIC_MAIN_IDEA: "주제/요지",
  TITLE: "제목 추론", REFERENCE: "지칭 추론", CONTENT_MATCH: "내용 일치",
  IRRELEVANT: "무관한 문장", CONDITIONAL_WRITING: "조건부 영작", SENTENCE_TRANSFORM: "문장 전환",
  FILL_BLANK_KEY: "핵심 표현 빈칸", SUMMARY_COMPLETE: "요약문 완성", WORD_ORDER: "배열 영작",
  GRAMMAR_CORRECTION: "문법 오류 수정", CONTEXT_MEANING: "문맥 속 의미", SYNONYM: "동의어", ANTONYM: "반의어",
};

export const Q_DIFF: Record<string, { label: string; cls: string }> = {
  BASIC: { label: "기본", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  INTERMEDIATE: { label: "중급", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  KILLER: { label: "킬러", cls: "bg-red-50 text-red-700 border-red-200" },
};
