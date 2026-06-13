import type { PaperSize } from "./types";

export const TYPE_LABELS: Record<string, string> = {
  MULTIPLE_CHOICE: "객관식",
  SHORT_ANSWER: "주관식",
  ESSAY: "서술형",
  FILL_BLANK: "빈칸",
  ORDERING: "순서",
  VOCAB: "어휘",
};

export const SUBTYPE_LABELS: Record<string, string> = {
  BLANK_INFERENCE: "빈칸 추론",
  GRAMMAR_ERROR: "어법 판단",
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
  CUSTOM: "커스텀",
  CUSTOM_LAYOUT: "커스텀",
};

export const DIFFICULTY_META: Record<string, { label: string; className: string }> = {
  BASIC: { label: "기본", className: "bg-blue-50 text-blue-700 border-blue-200" },
  INTERMEDIATE: { label: "중급", className: "bg-amber-50 text-amber-700 border-amber-200" },
  KILLER: { label: "킬러", className: "bg-red-50 text-red-700 border-red-200" },
};

export const DEFAULT_INSTRUCTIONS =
  "다음 물음에 알맞은 답을 고르거나 조건에 맞게 서술하시오.";

export const PREVIEW_PAGE_WIDTH = 760;
export const DEFAULT_SHOW_PASSAGE_TITLE = false;
export const A4_HEIGHT_RATIO = 297 / 210;
export const PAPER_SIZE_SPECS: Record<
  PaperSize,
  {
    label: string;
    widthMm: number;
    heightMm: number;
    heightRatio: number;
    widthRatio: number;
  }
> = {
  A4: {
    label: "A4",
    widthMm: 210,
    heightMm: 297,
    heightRatio: 297 / 210,
    widthRatio: 1,
  },
  B4: {
    label: "B4",
    widthMm: 257,
    heightMm: 364,
    heightRatio: 364 / 257,
    widthRatio: 257 / 210,
  },
};
export const TWO_COLUMN_GAP = 32;
export const GROUP_GAP = 16;
export const ITEM_GAP = 12;
