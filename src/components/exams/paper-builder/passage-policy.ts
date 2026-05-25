import type { BuilderQuestion } from "./types";

type PassageFlow = "embedded" | "source";

export const QUESTION_PASSAGE_FLOW_RULES: Record<string, PassageFlow> = {
  BLANK_INFERENCE: "embedded",
  GRAMMAR_ERROR: "embedded",
  VOCAB_CHOICE: "embedded",
  SENTENCE_ORDER: "embedded",
  SENTENCE_INSERT: "embedded",
  TOPIC_MAIN_IDEA: "source",
  TITLE: "source",
  REFERENCE: "embedded",
  CONTENT_MATCH: "source",
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

const EMBEDDED_PASSAGE_FIELDS = [
  "passageWithBlank",
  "passageWithMarkers",
  "passageWithUnderline",
  "passageWithNumbers",
] as const;

function readStructuredData(question: BuilderQuestion): Record<string, unknown> | null {
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

function structuredDataHasEmbeddedPassage(question: BuilderQuestion): boolean {
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
  if (/[\u2460-\u2469]/.test(text) && text.split(/\s+/).length > 35) return true;
  if (/\([A-Ea-e]\)/.test(text) && text.split(/\s+/).length > 35) return true;
  return false;
}

export function questionHasEmbeddedPassage(question: BuilderQuestion): boolean {
  const subType = question.subType || "";
  if (QUESTION_PASSAGE_FLOW_RULES[subType] === "embedded") return true;
  return structuredDataHasEmbeddedPassage(question) || questionTextLooksEmbedded(question.questionText);
}

export function shouldIncludeSourcePassageByDefault(question: BuilderQuestion): boolean {
  return Boolean(question.passage?.content?.trim()) && !questionHasEmbeddedPassage(question);
}
