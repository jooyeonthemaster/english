import { getCircledNumbers } from "@/lib/question-postprocess/types";
// ─── Constants ───────────────────────────────────────────

export const CIRCLED_MARKER_PATTERN = "\\u2460-\\u2473\\u3251-\\u325F\\u32B1-\\u32BF";

export const CIRCLED_MARKER_REGEX = new RegExp(`^[${CIRCLED_MARKER_PATTERN}]$`);

export const TYPE_LABELS: Record<string, string> = {
  MULTIPLE_CHOICE: "객관식",
  SHORT_ANSWER: "주관식",
};

export const SUBTYPE_LABELS: Record<string, string> = {
  BLANK_INFERENCE: "빈칸 추론",
  GRAMMAR_ERROR: "어법 판단",
  GRAMMAR_CHOICE_COMBO: "네모 어법",
  VOCAB_CHOICE: "어휘 적절성",
  SENTENCE_ORDER: "글의 순서",
  SENTENCE_INSERT: "문장 삽입",
  TOPIC: "주제 추론",
  MAIN_IDEA: "요지/주장",
  TOPIC_MAIN_IDEA: "주제/요지",
  TITLE: "제목 추론",
  IMPLIED_MEANING: "함축 의미 추론",
  REFERENCE: "지칭 추론",
  CONTENT_MATCH: "내용 일치",
  SUMMARY_COMPLETE_MC: "요약문 완성(객관식)",
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

export const DIFFICULTY_CONFIG: Record<
  string,
  { label: string; className: string }
> = {
    BASIC: {
      label: "기본",
      className: "border-blue-200 bg-blue-50 text-blue-700",
    },
    INTERMEDIATE: {
      label: "중급",
      className: "border-amber-200 bg-amber-50 text-amber-700",
    },
    KILLER: {
      label: "킬러",
      className: "border-red-200 bg-red-50 text-red-700",
    },
  };

export const MARKERS = {
  lowercase: [
    "(a)",
    "(b)",
    "(c)",
    "(d)",
    "(e)",
    "(f)",
    "(g)",
    "(h)",
    "(i)",
    "(j)",
  ],
  uppercase: [
    "(A)",
    "(B)",
    "(C)",
    "(D)",
    "(E)",
    "(F)",
    "(G)",
    "(H)",
    "(I)",
    "(J)",
  ],
  circled: getCircledNumbers(50),
  none: getCircledNumbers(50),
};

export const STRUCTURED_RENDERER_SOURCE_PASSAGE_TYPES = new Set([
  "TOPIC",
  "MAIN_IDEA",
  "TOPIC_MAIN_IDEA",
  "TITLE",
  "CONTENT_MATCH",
  "SUMMARY_COMPLETE_MC",
  // 서술형 영작·요약 유형도 전용 렌더러가 원문 지문을 직접 싣는다(SourcePassageBlock).
  // 원본 지문 블록을 중복 노출하지 않도록 여기에 포함한다.
  "CONDITIONAL_WRITING",
  "SENTENCE_TRANSFORM",
  "SUMMARY_COMPLETE",
  "SUMMARY_WRITING",
  "WORD_ORDER",
]);
