import { z } from "zod";
import {
  normalizeChangeArray,
  normalizeComparisonRecommendation,
  normalizeFinalStatus,
  normalizeRestorationMethod,
  normalizeRestorationStatus,
  normalizeSentenceArray,
  normalizeVerificationStatus,
} from "./normalizers";
import { normalizeStringArray } from "../_shared/string-utils";

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

export const groundedSourceMatchSchema = z.object({
  title: z.string().default(""),
  url: z.string().nullable().optional(),
  publisher: z.string().nullable().optional(),
  year: z.number().int().nullable().optional(),
  content: z.string().default(""),
  confidence: z.number().min(0).max(1).default(0),
  reason: z.string().default(""),
});

export const groundedAiRestorationSchema = z.object({
  status: z.enum(["RESTORED", "PARTIAL", "FAILED"]).default("PARTIAL"),
  method: z
    .enum(["SOURCE_MATCH", "QUESTION_EVIDENCE", "MIXED", "FAILED"])
    .default("QUESTION_EVIDENCE"),
  restoredText: z.string().default(""),
  confidence: z.number().min(0).max(1).default(0.5),
  sentences: z.array(restorationSentenceSchema).default([]),
  changes: z.array(restorationChangeSchema).default([]),
  unresolvedMarkers: z.array(z.string()).default([]),
});

export const groundedComparisonSchema = z.object({
  agreement: z.number().min(0).max(1).default(0),
  differences: z.array(z.string()).default([]),
  recommendation: z
    .enum([
      "SOURCE_PRIMARY",
      "AI_PRIMARY",
      "BOTH_AGREE",
      "TEACHER_REVIEW_REQUIRED",
    ])
    .default("TEACHER_REVIEW_REQUIRED"),
});

export const groundedRestorationResponseSchema = z.preprocess(
  normalizeGroundedRestorationResponse,
  z.object({
    sourceMatch: groundedSourceMatchSchema.nullable().optional(),
    aiRestoration: groundedAiRestorationSchema,
    comparison: groundedComparisonSchema.nullable().optional(),
    finalRestoredText: z.string().default(""),
    finalStatus: z
      .enum(["RESTORED", "PARTIAL", "FAILED"])
      .default("PARTIAL"),
    finalMethod: z
      .enum(["SOURCE_MATCH", "QUESTION_EVIDENCE", "MIXED", "FAILED"])
      .default("QUESTION_EVIDENCE"),
    warnings: z.array(z.string()).default([]),
  }),
);

export const groundedRestorationBatchItemSchema = z.object({
  id: z.string(),
  sourceMatch: groundedSourceMatchSchema.nullable().optional(),
  aiRestoration: groundedAiRestorationSchema,
  comparison: groundedComparisonSchema.nullable().optional(),
  finalRestoredText: z.string().default(""),
  finalStatus: z.enum(["RESTORED", "PARTIAL", "FAILED"]).default("PARTIAL"),
  finalMethod: z
    .enum(["SOURCE_MATCH", "QUESTION_EVIDENCE", "MIXED", "FAILED"])
    .default("QUESTION_EVIDENCE"),
  warnings: z.array(z.string()).default([]),
});

export const groundedRestorationBatchResponseSchema = z.preprocess(
  (value) => {
    if (!value || typeof value !== "object") return value;
    const row = value as Record<string, unknown>;
    const rawList = Array.isArray(row.results)
      ? row.results
      : Array.isArray(value)
        ? (value as unknown[])
        : Array.isArray(row.items)
          ? row.items
          : [];
    const results = rawList.map((item) => {
      if (!item || typeof item !== "object") return item;
      return normalizeGroundedRestorationResponse(item);
    });
    return { results };
  },
  z.object({
    results: z.array(groundedRestorationBatchItemSchema).default([]),
  }),
);

export type PassageRestorationResponse = z.infer<
  typeof passageRestorationResponseSchema
>;
export type PassageVerificationResponse = z.infer<
  typeof passageVerificationResponseSchema
>;
export type GroundedRestorationResponse = z.infer<
  typeof groundedRestorationResponseSchema
>;
export type GroundedSourceMatch = z.infer<typeof groundedSourceMatchSchema>;
export type GroundedAiRestoration = z.infer<typeof groundedAiRestorationSchema>;
export type GroundedComparison = z.infer<typeof groundedComparisonSchema>;
export type GroundedRestorationBatchItem = z.infer<
  typeof groundedRestorationBatchItemSchema
>;
export type GroundedRestorationBatchResponse = z.infer<
  typeof groundedRestorationBatchResponseSchema
>;

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

function normalizeGroundedRestorationResponse(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const row = value as Record<string, unknown>;
  const aiRestorationRaw =
    row.aiRestoration && typeof row.aiRestoration === "object"
      ? (row.aiRestoration as Record<string, unknown>)
      : {};
  const aiRestoration = {
    ...aiRestorationRaw,
    status: normalizeFinalStatus(aiRestorationRaw.status),
    method: normalizeRestorationMethod(aiRestorationRaw.method),
    sentences: normalizeSentenceArray(aiRestorationRaw.sentences),
    changes: normalizeChangeArray(aiRestorationRaw.changes),
    unresolvedMarkers: normalizeStringArray(
      aiRestorationRaw.unresolvedMarkers,
    ),
  };
  const sourceMatchRaw =
    row.sourceMatch && typeof row.sourceMatch === "object"
      ? (row.sourceMatch as Record<string, unknown>)
      : null;
  const sourceMatch = sourceMatchRaw
    ? {
        ...sourceMatchRaw,
        title:
          typeof sourceMatchRaw.title === "string" ? sourceMatchRaw.title : "",
        content:
          typeof sourceMatchRaw.content === "string"
            ? sourceMatchRaw.content
            : "",
        url:
          typeof sourceMatchRaw.url === "string" ? sourceMatchRaw.url : null,
        publisher:
          typeof sourceMatchRaw.publisher === "string"
            ? sourceMatchRaw.publisher
            : null,
        year:
          typeof sourceMatchRaw.year === "number" ? sourceMatchRaw.year : null,
        confidence:
          typeof sourceMatchRaw.confidence === "number"
            ? sourceMatchRaw.confidence
            : 0,
        reason:
          typeof sourceMatchRaw.reason === "string"
            ? sourceMatchRaw.reason
            : "",
      }
    : null;
  const comparisonRaw =
    row.comparison && typeof row.comparison === "object"
      ? (row.comparison as Record<string, unknown>)
      : null;
  const comparison = comparisonRaw
    ? {
        ...comparisonRaw,
        agreement:
          typeof comparisonRaw.agreement === "number"
            ? comparisonRaw.agreement
            : 0,
        differences: normalizeStringArray(comparisonRaw.differences),
        recommendation: normalizeComparisonRecommendation(
          comparisonRaw.recommendation,
        ),
      }
    : null;
  return {
    ...row,
    sourceMatch,
    aiRestoration,
    comparison,
    finalRestoredText:
      typeof row.finalRestoredText === "string" ? row.finalRestoredText : "",
    finalStatus: normalizeFinalStatus(row.finalStatus),
    finalMethod: normalizeRestorationMethod(row.finalMethod),
    warnings: normalizeStringArray(row.warnings),
  };
}
