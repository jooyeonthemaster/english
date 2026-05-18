import { z } from "zod";
import { coerceStringArray } from "../_shared/string-utils";

/** Tolerant string-array preprocessor.
 *
 *  Gemini occasionally returns a SINGLE STRING for fields the prompt asks
 *  for as an ARRAY (e.g. `"warnings": "주의: ..."` instead of
 *  `"warnings": ["주의: ..."]`). Strict `z.array(z.string())` rejects that
 *  and tanks the entire page parse. We coerce up front so the Zod schema
 *  can stay strict while still accepting common drift.
 */
const flexibleStringArray = z.preprocess(
  coerceStringArray,
  z.array(z.string()).default([]),
);

/** Per-question analysis attached to a QUESTION_STEM block. The 1st-pass OCR
 *  call now performs question-type classification + answer inference at the
 *  same time as text extraction, so the 2nd-pass restoration call can skip
 *  the separate problem-evidence Gemini round-trip. */
const questionAnalysisSchema = z.object({
  questionType: z.string().nullable().optional(),
  typeLabel: z.string().nullable().optional(),
  answer: z.string().nullable().optional(),
  answerConfidence: z.number().min(0).max(1).nullable().optional(),
  evidence: flexibleStringArray.nullable().optional(),
  warnings: flexibleStringArray.nullable().optional(),
});

/** Page-level problem-evidence summary — hints that don't belong to a single
 *  question (source attribution clues, page-wide warnings). */
const pageProblemEvidenceSchema = z.object({
  sourceHints: flexibleStringArray.nullable().optional(),
  unresolved: flexibleStringArray.nullable().optional(),
  warnings: flexibleStringArray.nullable().optional(),
});

/** Parsed structured OCR response. Used by worker after JSON.parse. */
export const structuredOcrResponseSchema = z.object({
  blocks: z
    .array(
      z.object({
        blockType: z.enum([
          "PASSAGE_BODY",
          "QUESTION_STEM",
          "CHOICE",
          "EXPLANATION",
          "EXAM_META",
          "HEADER",
          "FOOTER",
          "DIAGRAM",
          "NOISE",
        ]),
        content: z.string(),
        confidence: z.number().min(0).max(1).nullable().optional(),
        questionNumber: z.number().int().min(1).max(999).nullable().optional(),
        choiceIndex: z.number().int().min(1).max(9).nullable().optional(),
        isAnswer: z.boolean().nullable().optional(),
        /** Range (e.g. "2~4") this block belongs to when it's part of a
         *  shared-passage set. Null / omitted for independent passages. */
        sharedPassageRange: z.string().nullable().optional(),
        /** 1st-pass question analysis. Only meaningful on QUESTION_STEM blocks
         *  — for other block types the model is asked to omit / set to null. */
        questionAnalysis: questionAnalysisSchema.nullable().optional(),
        /** Page-boundary boundary metadata for PASSAGE_BODY only. The legacy
         *  single-pass restoration fields (restoredText / restorationStatus /
         *  restorationChanges / restorationWarnings) have been retired —
         *  restoration is now done in the 2nd-pass grounded restoration call.
         *  These fields stay here as `nullable().optional()` so old responses
         *  still parse without the parser rejecting them. */
        restoredText: z.string().nullable().optional(),
        restorationStatus: z
          .enum(["RESTORED", "NO_RESTORATION_NEEDED", "PARTIAL", "FAILED"])
          .nullable()
          .optional(),
        restorationChanges: z
          .array(
            z.object({
              sentenceOrder: z.number().int().min(1).nullable().optional(),
              before: z.string().default(""),
              after: z.string().default(""),
              changeType: z.string().nullable().optional(),
              reason: z.string().nullable().optional(),
              confidence: z.number().min(0).max(1).nullable().optional(),
            }),
          )
          .nullable()
          .optional(),
        restorationWarnings: flexibleStringArray.nullable().optional(),
        continuesFromPrevious: z.boolean().nullable().optional(),
        continuesToNext: z.boolean().nullable().optional(),
        boundaryConfidence: z.number().min(0).max(1).nullable().optional(),
      }),
    )
    .default([]),
  pageMeta: z
    .object({
      hasExamHeader: z.boolean().nullable().optional(),
      subject: z.enum(["ENGLISH", "KOREAN", "MATH", "OTHER"]).nullable().optional(),
      year: z.number().int().nullable().optional(),
      round: z.string().nullable().optional(),
      schoolName: z.string().nullable().optional(),
      publisher: z.string().nullable().optional(),
      /** Page number visible on this sheet (1-based). e.g. "1 / 8" → 1.
       *  Null when no page-number markup is present. Used by finalize to
       *  reorder pages when the upload order is wrong. */
      pageNumber: z.number().int().nullable().optional(),
      /** Total page count visible on this sheet. e.g. "1 / 8" → 8.
       *  Same fingerprint within a single test booklet, so it also acts
       *  as a clustering signal across mixed-upload jobs. */
      pageTotal: z.number().int().nullable().optional(),
      /** Free-text exam code printed on the page (e.g. "과목코드 03").
       *  Strongest single fingerprint for "same test booklet" clustering. */
      examCode: z.string().nullable().optional(),
      problemEvidence: pageProblemEvidenceSchema.nullable().optional(),
    })
    .optional(),
});

export type StructuredOcrResponse = z.infer<typeof structuredOcrResponseSchema>;
export type StructuredOcrQuestionAnalysis = z.infer<typeof questionAnalysisSchema>;
export type StructuredOcrPageProblemEvidence = z.infer<
  typeof pageProblemEvidenceSchema
>;
