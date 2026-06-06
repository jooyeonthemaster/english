import type { BuilderQuestion } from "./types";

type PassageFlow = "embedded" | "source";
type PassageQuestionLike = Pick<
  BuilderQuestion,
  "subType" | "questionText" | "structuredData"
> & {
  passage?: { content?: string | null } | null;
};

export const QUESTION_PASSAGE_FLOW_RULES: Record<string, PassageFlow> = {
  BLANK_INFERENCE: "embedded",
  GRAMMAR_ERROR: "embedded",
  VOCAB_CHOICE: "embedded",
  SENTENCE_ORDER: "embedded",
  SENTENCE_INSERT: "embedded",
  TOPIC: "source",
  MAIN_IDEA: "source",
  TOPIC_MAIN_IDEA: "source",
  TITLE: "source",
  IMPLIED_MEANING: "embedded",
  REFERENCE: "embedded",
  CONTENT_MATCH: "source",
  SUMMARY_COMPLETE_MC: "source",
  IRRELEVANT: "embedded",
  CONDITIONAL_WRITING: "source",
  SENTENCE_TRANSFORM: "source",
  FILL_BLANK_KEY: "embedded",
  SUMMARY_COMPLETE: "source",
  WORD_ORDER: "source",
  GRAMMAR_CORRECTION: "embedded",
  CONTEXT_MEANING: "embedded",
  SYNONYM: "source",
  ANTONYM: "embedded",
};

const INLINE_SOURCE_PASSAGE_SUBTYPES = new Set([
  "TOPIC",
  "MAIN_IDEA",
  "TOPIC_MAIN_IDEA",
  "TITLE",
  "CONTENT_MATCH",
  "SUMMARY_COMPLETE_MC",
  "CONDITIONAL_WRITING",
  "SENTENCE_TRANSFORM",
  "SUMMARY_COMPLETE",
  "WORD_ORDER",
  "SYNONYM",
]);

export function shouldRenderSourcePassageInsideQuestion(subType: string | null | undefined): boolean {
  return INLINE_SOURCE_PASSAGE_SUBTYPES.has(subType || "");
}

const EMBEDDED_PASSAGE_FIELDS = [
  "passageWithBlank",
  "passageWithMarkers",
  "passageWithUnderline",
  "passageWithNumbers",
] as const;

const UNDERLINED_TEXT_PATTERN =
  /(^|[^_])__(?!_)(?=[^_\n]{1,180}__(?!_))(?=[^_\n]*[A-Za-z0-9\uAC00-\uD7A3])[^_\n_]+__(?!_)/;

function getQuestionPassageFlow(subType: string | null | undefined): PassageFlow | null {
  return QUESTION_PASSAGE_FLOW_RULES[subType || ""] ?? null;
}

function hasSourcePassageContent(question: PassageQuestionLike): boolean {
  return Boolean(question.passage?.content?.trim());
}

function readStructuredData(question: PassageQuestionLike): Record<string, unknown> | null {
  const raw = question.structuredData;
  if (!raw) return null;
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function structuredDataHasEmbeddedPassage(question: PassageQuestionLike): boolean {
  const data = readStructuredData(question);
  if (!data) return false;
  if (EMBEDDED_PASSAGE_FIELDS.some((field) => typeof data[field] === "string" && String(data[field]).trim())) {
    return true;
  }
  return Array.isArray(data.paragraphs) && data.paragraphs.length > 0;
}

function questionTextLooksEmbedded(questionText: string): boolean {
  const text = questionText.trim();
  if (!text) return false;
  const wordCount = text.split(/\s+/).length;
  if (UNDERLINED_TEXT_PATTERN.test(text) && wordCount > 35) return true;
  if (/[\u2460-\u2473\u3251-\u325F\u32B1-\u32BF]/.test(text) && wordCount > 35) return true;
  return false;
}

function hasEmbeddedPassageDisplay(question: PassageQuestionLike): boolean {
  return (
    structuredDataHasEmbeddedPassage(question) ||
    questionTextLooksEmbedded(question.questionText || "")
  );
}

// source 흐름이라 기본은 출처 지문을 켜두지만(단독 출제 시 발문의 "다음 글"이 필요),
// 강제(토글 잠금)는 하지 않는 유형. 같은 지문을 공유하는 문항들에서 중복 지문을
// 숨기고 싶을 수 있어 출제자가 끌 수 있게 둔다. 기본값(ON)은 그대로 유지된다
// — shouldIncludeSourcePassageByDefault 가 flow === "source" 로 결정하기 때문.
// (별도 출처 지문 블록을 쓰는 서술형/어휘 유형만. 주제·제목·요지 등 INLINE 유형은
//  지문이 문제 안에 렌더되어 토글이 무의미하므로 제외 → 그대로 강제.)
const HIDEABLE_SOURCE_PASSAGE_SUBTYPES = new Set([
  "CONDITIONAL_WRITING", // 조건부 영작
  "SENTENCE_TRANSFORM", // 문장 전환
  "SUMMARY_COMPLETE", // 요약문 완성
  "WORD_ORDER", // 배열 영작
  "SYNONYM", // 동의어
]);

export function shouldForceSourcePassage(question: PassageQuestionLike): boolean {
  if (HIDEABLE_SOURCE_PASSAGE_SUBTYPES.has(question.subType || "")) return false;
  if (hasEmbeddedPassageDisplay(question)) return false;
  return hasSourcePassageContent(question) && getQuestionPassageFlow(question.subType) === "source";
}

export function questionHasEmbeddedPassage(question: PassageQuestionLike): boolean {
  const flow = getQuestionPassageFlow(question.subType);
  const hasEmbeddedDisplay = hasEmbeddedPassageDisplay(question);
  if (flow === "embedded") return true;
  if (flow === "source") return hasEmbeddedDisplay;
  return hasEmbeddedDisplay;
}

export function shouldIncludeSourcePassageByDefault(question: PassageQuestionLike): boolean {
  if (!hasSourcePassageContent(question)) return false;
  const flow = getQuestionPassageFlow(question.subType);
  if (flow === "source") return !hasEmbeddedPassageDisplay(question);
  if (flow === "embedded") return false;
  return !questionHasEmbeddedPassage(question);
}
