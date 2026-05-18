import { z } from "zod";
import { normalizeStringArray } from "../_shared/string-utils";
import { PASSAGE_QUESTION_TYPES, RESTORATION_ACTION_TYPES } from "./constants";

export const problemEvidenceActionSchema = z.object({
  type: z.enum(RESTORATION_ACTION_TYPES),
  target: z.string().nullable().optional(),
  value: z.string().nullable().optional(),
  reason: z.string().default(""),
  confidence: z.number().min(0).max(1).default(0.5),
});

export const problemEvidenceQuestionSchema = z.object({
  questionNumber: z.number().int().min(1).nullable().optional(),
  questionType: z.enum(PASSAGE_QUESTION_TYPES).default("UNKNOWN"),
  typeLabel: z.string().default("Unknown"),
  confidence: z.number().min(0).max(1).default(0.5),
  stem: z.string().default(""),
  answer: z.string().nullable().optional(),
  answerConfidence: z.number().min(0).max(1).nullable().optional(),
  evidence: z.array(z.string()).default([]),
  restorationActions: z.array(problemEvidenceActionSchema).default([]),
  warnings: z.array(z.string()).default([]),
});

export const problemEvidenceResponseSchema = z.preprocess(
  normalizeProblemEvidenceResponse,
  z.object({
    status: z.enum(["SOLVED", "PARTIAL", "NO_QUESTIONS", "FAILED"]).default("PARTIAL"),
    confidence: z.number().min(0).max(1).default(0.5),
    sourceHints: z.array(z.string()).default([]),
    questions: z.array(problemEvidenceQuestionSchema).default([]),
    globalActions: z.array(problemEvidenceActionSchema).default([]),
    unresolved: z.array(z.string()).default([]),
    warnings: z.array(z.string()).default([]),
  }),
);

export type ProblemEvidenceResponse = z.infer<typeof problemEvidenceResponseSchema>;
export type ProblemEvidenceQuestion = z.infer<typeof problemEvidenceQuestionSchema>;
export type ProblemEvidenceAction = z.infer<typeof problemEvidenceActionSchema>;

function normalizeProblemEvidenceResponse(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const row = value as Record<string, unknown>;
  return {
    ...row,
    status: normalizeStatus(row.status),
    sourceHints: normalizeStringArray(row.sourceHints),
    unresolved: normalizeStringArray(row.unresolved),
    warnings: normalizeStringArray(row.warnings),
    questions: Array.isArray(row.questions)
      ? row.questions.map(normalizeQuestion)
      : [],
    globalActions: normalizeActions(row.globalActions),
  };
}

function normalizeQuestion(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const row = value as Record<string, unknown>;
  return {
    ...row,
    questionType: normalizeQuestionType(row.questionType),
    typeLabel:
      typeof row.typeLabel === "string" && row.typeLabel.trim()
        ? row.typeLabel
        : normalizeQuestionType(row.questionType),
    evidence: normalizeStringArray(row.evidence),
    restorationActions: normalizeActions(row.restorationActions),
    warnings: normalizeStringArray(row.warnings),
  };
}

function normalizeActions(value: unknown): unknown[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === "string") {
      return {
        type: normalizeActionType(item),
        reason: item,
        confidence: 0.5,
      };
    }
    if (!item || typeof item !== "object") return item;
    const row = item as Record<string, unknown>;
    return {
      ...row,
      type: normalizeActionType(row.type),
    };
  });
}

function normalizeStatus(value: unknown): string {
  const status = String(value ?? "").toUpperCase();
  if (status === "OK" || status === "SUCCESS" || status === "SOLVED_FULL") {
    return "SOLVED";
  }
  if (status === "NONE" || status === "CLEAN_PASSAGE") return "NO_QUESTIONS";
  if (status === "ERROR") return "FAILED";
  return status || "PARTIAL";
}

function normalizeQuestionType(value: unknown): string {
  const type = String(value ?? "").toUpperCase().replace(/[\s-]+/g, "_");
  const aliases: Record<string, string> = {
    ORDERING: "SENTENCE_ORDER",
    INSERTION: "SENTENCE_INSERT",
    INSERT_SENTENCE: "SENTENCE_INSERT",
    UNRELATED: "IRRELEVANT",
    ODD_SENTENCE: "IRRELEVANT",
    VOCAB: "VOCAB_CHOICE",
    GRAMMAR: "GRAMMAR_ERROR",
    BLANK: "BLANK_INFERENCE",
    MAIN_IDEA: "TOPIC_MAIN_IDEA",
    TOPIC: "TOPIC_MAIN_IDEA",
    SUMMARY: "SUMMARY_COMPLETE",
    WRITING: "CONDITIONAL_WRITING",
  };
  const normalized = aliases[type] ?? type;
  return PASSAGE_QUESTION_TYPES.includes(
    normalized as (typeof PASSAGE_QUESTION_TYPES)[number],
  )
    ? normalized
    : "UNKNOWN";
}

function normalizeActionType(value: unknown): string {
  const type = String(value ?? "").toUpperCase().replace(/[\s-]+/g, "_");
  const aliases: Record<string, string> = {
    REMOVE_MARKER: "REMOVE_PROBLEM_MARKER",
    REMOVE_MARKERS: "REMOVE_PROBLEM_MARKER",
    BLANK: "RESTORE_BLANK",
    GRAMMAR: "RESTORE_GRAMMAR",
    VOCAB: "RESTORE_VOCAB",
    ORDERING: "REORDER_CHUNKS",
    INSERTION: "INSERT_SENTENCE",
    REMOVE_IRRELEVANT: "REMOVE_IRRELEVANT_SENTENCE",
    WORD_ORDER: "RESTORE_WORD_ORDER",
    REVIEW: "TEACHER_REVIEW_REQUIRED",
  };
  const normalized = aliases[type] ?? type;
  return RESTORATION_ACTION_TYPES.includes(
    normalized as (typeof RESTORATION_ACTION_TYPES)[number],
  )
    ? normalized
    : "TEACHER_REVIEW_REQUIRED";
}
