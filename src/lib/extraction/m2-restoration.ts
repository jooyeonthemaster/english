import { z } from "zod";

export const restorationChangeSchema = z.object({
  sentenceOrder: z.number().int().min(1).nullable().optional(),
  before: z.string().default(""),
  after: z.string().default(""),
  reason: z.string().default(""),
  evidenceQuestionNumber: z.number().int().min(1).nullable().optional(),
  evidenceType: z
    .enum([
      "VOCAB",
      "GRAMMAR",
      "WORD_ORDER",
      "BLANK",
      "INSERTION",
      "ORDERING",
      "SUMMARY",
      "SOURCE_MATCH",
      "MANUAL_REQUIRED",
      "OTHER",
    ])
    .default("OTHER"),
  confidence: z.number().min(0).max(1).default(0.5),
});

export const restorationSentenceSchema = z.object({
  order: z.number().int().min(1),
  text: z.string(),
  status: z.enum(["OK", "RESTORED", "CHECK", "UNRESOLVED"]).default("OK"),
});

export const passageRestorationResponseSchema = z.preprocess(
  normalizeRestorationResponse,
  z.object({
    status: z
      .enum(["ORIGINAL_MATCHED", "RESTORED", "PARTIAL", "FAILED"])
      .default("PARTIAL"),
    method: z
      .enum(["SOURCE_MATCH", "QUESTION_EVIDENCE", "MIXED", "FAILED"])
      .default("QUESTION_EVIDENCE"),
    restoredText: z.string(),
    confidence: z.number().min(0).max(1).default(0.5),
    sentences: z.array(restorationSentenceSchema).default([]),
    changes: z.array(restorationChangeSchema).default([]),
    unresolvedMarkers: z.array(z.string()).default([]),
    warnings: z.array(z.string()).default([]),
  }),
);

export const passageVerificationResponseSchema = z.preprocess(
  normalizeVerificationResponse,
  z.object({
    status: z.enum(["PASS", "WARN", "FAIL"]).default("WARN"),
    confidence: z.number().min(0).max(1).default(0.5),
    warnings: z.array(z.string()).default([]),
    remainingProblemMarkers: z.array(z.string()).default([]),
    suspiciousChanges: z.array(z.string()).default([]),
    teacherReviewRequired: z.boolean().default(true),
  }),
);

export type PassageRestorationResponse = z.infer<
  typeof passageRestorationResponseSchema
>;
export type PassageVerificationResponse = z.infer<
  typeof passageVerificationResponseSchema
>;

export interface RestorationQuestionInput {
  questionNumber: number | null;
  stem: string;
  choices: Array<{
    label: string;
    content: string;
    isAnswer: boolean;
  }>;
  explanation: string | null;
}

export interface SourceMatchInput {
  title: string;
  sourceType: string;
  confidence: number;
  reason: string;
  content?: string;
  sourceId?: string;
  sourceRef?: string;
  publisher?: string;
  unit?: string;
  year?: number;
  metadata?: Record<string, unknown>;
}

export interface BuildRestorationPromptInput {
  problemText: string;
  questions: RestorationQuestionInput[];
  sourceMatches: SourceMatchInput[];
}

function normalizeRestorationResponse(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const row = value as Record<string, unknown>;
  return {
    ...row,
    status: normalizeRestorationStatus(row.status),
    method: normalizeRestorationMethod(row.method),
    sentences: normalizeSentenceArray(row.sentences),
    changes: normalizeChangeArray(row.changes),
    warnings: normalizeStringArray(row.warnings),
    unresolvedMarkers: normalizeStringArray(row.unresolvedMarkers),
  };
}

function normalizeVerificationResponse(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const row = value as Record<string, unknown>;
  return {
    ...row,
    status: normalizeVerificationStatus(row.status),
    warnings: normalizeStringArray(row.warnings),
    remainingProblemMarkers: normalizeStringArray(row.remainingProblemMarkers),
    suspiciousChanges: normalizeStringArray(row.suspiciousChanges),
  };
}

function normalizeRestorationStatus(value: unknown): string {
  const status = String(value ?? "").toUpperCase();
  if (status === "SUCCESS" || status === "COMPLETE" || status === "COMPLETED") {
    return "RESTORED";
  }
  if (status === "MATCHED" || status === "ORIGINAL") return "ORIGINAL_MATCHED";
  if (status === "NEEDS_REVIEW" || status === "WARN") return "PARTIAL";
  return status || "PARTIAL";
}

function normalizeRestorationMethod(value: unknown): string {
  const method = String(value ?? "").toUpperCase();
  if (
    method === "NONE" ||
    method === "INSUFFICIENT_DATA" ||
    method === "UNSUPPORTED" ||
    method === "FAILURE"
  ) {
    return "FAILED";
  }
  if (method.includes("SOURCE") && method.includes("QUESTION")) return "MIXED";
  if (method.includes("SOURCE")) return "SOURCE_MATCH";
  if (
    method.includes("QUESTION") ||
    method.includes("SOLV") ||
    method.includes("PROBLEM") ||
    method.includes("SHEET") ||
    method.includes("OCR") ||
    method.includes("DIRECT") ||
    method.includes("PASSAGE") ||
    method.includes("TEXT")
  ) {
    return "QUESTION_EVIDENCE";
  }
  return method || "QUESTION_EVIDENCE";
}

function normalizeVerificationStatus(value: unknown): string {
  const status = String(value ?? "").toUpperCase();
  if (
    status === "SUCCESS" ||
    status === "OK" ||
    status === "VALID" ||
    status === "VERIFIED" ||
    status === "VERIFIED_WITH_WARNINGS"
  ) {
    return "PASS";
  }
  if (status === "NEEDS_REVISION" || status === "NEEDS_REVIEW") return "WARN";
  return status || "WARN";
}

function normalizeSentenceArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    if (typeof item === "string") {
      return { order: index + 1, text: item, status: "RESTORED" };
    }
    if (item && typeof item === "object") {
      return { order: index + 1, ...(item as Record<string, unknown>) };
    }
    return { order: index + 1, text: String(item ?? ""), status: "CHECK" };
  });
}

function normalizeChangeArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === "string") {
      return {
        before: "",
        after: "",
        reason: item,
        evidenceType: "OTHER",
        confidence: 0.5,
      };
    }
    return item;
  });
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return typeof value === "string" && value.trim() ? [value] : [];
  }
  return value
    .map((item) => (typeof item === "string" ? item : JSON.stringify(item)))
    .filter((item) => item.trim().length > 0);
}

function stringifyQuestions(questions: RestorationQuestionInput[]): string {
  if (questions.length === 0) return "(no linked questions)";
  return questions
    .map((q, idx) => {
      const choices = q.choices
        .map(
          (c) =>
            `${c.label}${c.isAnswer ? " [ANSWER_MARK]" : ""}: ${c.content}`,
        )
        .join("\n");
      return [
        `Question ${q.questionNumber ?? idx + 1}`,
        `Stem: ${q.stem}`,
        choices ? `Choices:\n${choices}` : "Choices: (none)",
        q.explanation ? `Explanation: ${q.explanation}` : null,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}

function stringifySourceMatches(matches: SourceMatchInput[]): string {
  if (matches.length === 0) return "(no source candidates)";
  return matches
    .map((m, idx) =>
      [
        `Candidate ${idx + 1}: ${m.title}`,
        `type=${m.sourceType}; confidence=${m.confidence}`,
        `reason=${m.reason}`,
        m.content ? `content=${m.content.slice(0, 4000)}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
}

export function buildRestorationPrompts(input: BuildRestorationPromptInput): {
  systemPrompt: string;
  userPrompt: string;
} {
  return {
    systemPrompt:
      "You restore English study passages from Korean school problem sheets. " +
      "Use only evidence from source candidates and the linked questions. " +
      "Do not invent unsupported content. Return strict JSON only.",
    userPrompt: [
      "Restore the problem-mutated passage into the clean original study passage.",
      "",
      "Rules:",
      "- If a source candidate clearly matches, use that original text.",
      "- Otherwise solve the linked questions only to recover the original passage.",
      "- Preserve paragraph order.",
      "- Remove problem-only markers such as @, underlines, bracketed base forms, and answer-choice word-order fragments.",
      "- If evidence is insufficient, keep the best supported text and mark PARTIAL or FAILED.",
      "- Split the restored passage into numbered English sentences.",
      "- Return JSON matching: { status, method, restoredText, confidence, sentences, changes, unresolvedMarkers, warnings }.",
      "",
      "Problem-sheet passage:",
      input.problemText,
      "",
      "Linked questions:",
      stringifyQuestions(input.questions),
      "",
      "Source candidates:",
      stringifySourceMatches(input.sourceMatches),
    ].join("\n"),
  };
}

export function buildVerificationPrompts(input: {
  problemText: string;
  restoredText: string;
  questions: RestorationQuestionInput[];
  changes: Array<z.infer<typeof restorationChangeSchema>>;
}): { systemPrompt: string; userPrompt: string } {
  return {
    systemPrompt:
      "You verify restored English passages for school worksheet extraction. " +
      "Check for unsupported restoration, leftover problem markers, and mismatches with question evidence. Return strict JSON only.",
    userPrompt: [
      "Verify this restored passage.",
      "",
      "Return JSON matching: { status, confidence, warnings, remainingProblemMarkers, suspiciousChanges, teacherReviewRequired }.",
      "",
      "Problem-sheet passage:",
      input.problemText,
      "",
      "Restored passage:",
      input.restoredText,
      "",
      "Linked questions:",
      stringifyQuestions(input.questions),
      "",
      "Restoration changes:",
      JSON.stringify(input.changes, null, 2),
    ].join("\n"),
  };
}
