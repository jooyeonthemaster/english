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
  GRAMMAR_CORRECTION: "source",
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
  if (/__(?:[^_]+)__/.test(text)) return true;
  if (/[\u2460-\u2473\u3251-\u325F\u32B1-\u32BF]/.test(text) && text.split(/\s+/).length > 35) return true;
  if (/\([A-Ea-e]\)/.test(text) && text.split(/\s+/).length > 35) return true;
  return false;
}

export function shouldForceSourcePassage(question: PassageQuestionLike): boolean {
  return hasSourcePassageContent(question) && getQuestionPassageFlow(question.subType) === "source";
}

export function questionHasEmbeddedPassage(question: PassageQuestionLike): boolean {
  const flow = getQuestionPassageFlow(question.subType);
  if (flow === "embedded") return true;
  if (flow === "source") return false;
  return (
    structuredDataHasEmbeddedPassage(question) ||
    questionTextLooksEmbedded(question.questionText || "")
  );
}

export function shouldIncludeSourcePassageByDefault(question: PassageQuestionLike): boolean {
  if (!hasSourcePassageContent(question)) return false;
  const flow = getQuestionPassageFlow(question.subType);
  if (flow === "source") return true;
  if (flow === "embedded") return false;
  return !questionHasEmbeddedPassage(question);
}
