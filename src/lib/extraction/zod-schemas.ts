// ============================================================================
// Zod schemas for the extraction API surface.
// These are the single source of truth — every route (`/api/extraction/*`)
// and the client imports from here. Keep fields narrow; refuse unknown keys.
// ============================================================================

import { z } from "zod";
import {
  ACCEPTED_IMAGE_MIMES,
  MAX_PAGES_PER_JOB,
  MAX_PAGE_IMAGE_BYTES,
  MIN_COMMIT_PASSAGE_LENGTH,
  MIN_COMMIT_PASSAGE_LENGTH_BY_MODE,
} from "./constants";

// ─── Reusable primitives ────────────────────────────────────────────────────

export const extractionModeSchema = z.enum([
  "PASSAGE_ONLY",
  "QUESTION_SET",
  "EXPLANATION",
  "FULL_EXAM",
]);

export const blockTypeSchema = z.enum([
  "PASSAGE_BODY",
  "QUESTION_STEM",
  "CHOICE",
  "EXPLANATION",
  "EXAM_META",
  "HEADER",
  "FOOTER",
  "DIAGRAM",
  "NOISE",
]);

// ─── POST /api/extraction/jobs ──────────────────────────────────────────────

export const createJobRequestSchema = z.object({
  sourceType: z.enum(["PDF", "IMAGES"]),
  mode: extractionModeSchema.default("PASSAGE_ONLY"),
  // P7-D2: 추출 산출 모드. 미전달=기존 자동복원 휴리스틱 유지(비적응 무영향).
  outputMode: z.enum(["verbatim", "restored"]).optional(),
  totalPages: z.number().int().min(1).max(MAX_PAGES_PER_JOB),
  originalFileName: z.string().max(255).optional(),
  /** Optional original first-page preview kept separate from extraction crops. */
  previewPage: z
    .object({
      size: z.number().int().positive().max(MAX_PAGE_IMAGE_BYTES),
      mimeType: z.enum(ACCEPTED_IMAGE_MIMES),
    })
    .optional(),
  pages: z
    .array(
      z.object({
        pageIndex: z.number().int().min(0).max(MAX_PAGES_PER_JOB - 1),
        size: z.number().int().positive().max(MAX_PAGE_IMAGE_BYTES),
        mimeType: z.enum(ACCEPTED_IMAGE_MIMES),
        sourceFileName: z.string().trim().max(255).optional(),
      }),
    )
    .min(1)
    .max(MAX_PAGES_PER_JOB)
    .refine(
      (pages) => {
        const indices = pages.map((p) => p.pageIndex);
        return new Set(indices).size === indices.length;
      },
      { message: "pageIndex 값이 중복됩니다." },
    ),
});

export type CreateJobRequest = z.infer<typeof createJobRequestSchema>;

// 텍스트 지문 1개(제목 + 본문). 여러 개를 한 작업으로 묶어 보낼 때의 단위.
export const textPassageInputSchema = z.object({
  title: z.string().trim().max(200).optional(),
  text: z.string().trim().min(20).max(60_000),
});

export const createTextExtractionRequestSchema = z
  .object({
    mode: z.literal("PASSAGE_ONLY").default("PASSAGE_ONLY"),
    // P7-D2: "verbatim"이면 AI 복원 생략(붙여넣은 텍스트 그대로 저장).
    outputMode: z.enum(["verbatim", "restored"]).optional(),
    // 단건(하위호환). passages가 오면 무시된다.
    title: z.string().trim().max(200).optional(),
    text: z.string().trim().min(20).max(60_000).optional(),
    // 여러 지문을 한 작업으로 묶어 추출(파일 모드와 동일). 1개여도 됨.
    passages: z
      .array(textPassageInputSchema)
      .min(1)
      .max(MAX_PAGES_PER_JOB)
      .optional(),
  })
  .refine((v) => (v.passages?.length ?? 0) > 0 || typeof v.text === "string", {
    message: "text 또는 passages 중 하나는 반드시 필요합니다.",
  });

export type TextPassageInput = z.infer<typeof textPassageInputSchema>;
export type CreateTextExtractionRequest = z.infer<
  typeof createTextExtractionRequestSchema
>;

export const createJobResponseSchema = z.object({
  jobId: z.string(),
  uploadTargets: z.array(
    z.object({
      pageIndex: z.number(),
      uploadUrl: z.string().url(),
      uploadPath: z.string(),
      token: z.string().optional(),
      expiresAt: z.string(),
    }),
  ),
  previewUploadTarget: z
    .object({
      uploadUrl: z.string().url(),
      uploadPath: z.string(),
      token: z.string().optional(),
      expiresAt: z.string(),
    })
    .nullable()
    .optional(),
  creditsProjected: z.number(),
  creditsBalanceBefore: z.number(),
});

export type CreateJobResponse = z.infer<typeof createJobResponseSchema>;

// ─── POST /api/extraction/jobs/:id/start ────────────────────────────────────

export const startJobRequestSchema = z.object({}).passthrough().default({});

export const startJobResponseSchema = z.object({
  jobId: z.string(),
  status: z.enum(["PROCESSING", "COMPLETED", "PARTIAL", "FAILED", "CANCELLED"]),
  triggerRunId: z.string().optional(),
  draftCount: z.number().optional(),
});

// ─── POST /api/extraction/jobs/:id/commit ───────────────────────────────────

export const commitJobRequestSchema = z.object({
  collectionName: z.string().min(1).max(120).optional(),
  collectionId: z.string().optional(),
  results: z
    .array(
      z.object({
        passageOrder: z.number().int().min(0),
        title: z.string().min(1).max(200),
        content: z.string().min(MIN_COMMIT_PASSAGE_LENGTH),
        sourcePageIndex: z.array(z.number().int().min(0)).min(1),
        grade: z.number().int().min(1).max(13).optional(),
        semester: z.enum(["FIRST", "SECOND"]).optional(),
        unit: z.string().max(120).optional(),
        publisher: z.string().max(120).optional(),
        difficulty: z
          .enum([
            "BEGINNER",
            "ELEMENTARY",
            "INTERMEDIATE",
            "UPPER_INTERMEDIATE",
            "ADVANCED",
            "EXPERT",
          ])
          .optional(),
        tags: z.array(z.string().min(1).max(40)).max(20).optional(),
      }),
    )
    .min(1),
});

export type CommitJobRequest = z.infer<typeof commitJobRequestSchema>;

export const commitJobResponseSchema = z.object({
  createdPassageIds: z.array(z.string()),
  collectionId: z.string().nullable(),
});

// ─── POST /api/extraction/jobs/:id/commit  — v2 (mode-aware) ────────────────
// Mode-specific payloads. Existing `commitJobRequestSchema` stays untouched
// so old clients keep working while the new flow migrates.
// ────────────────────────────────────────────────────────────────────────────

const sourceMaterialMetaSchema = z.object({
  title: z.string().min(1).max(200),
  subtitle: z.string().max(200).optional(),
  type: z
    .enum(["EXAM", "TEXTBOOK", "WORKBOOK", "HANDOUT", "MOCK", "SUNEUNG", "OTHER"])
    .optional(),
  subject: z.enum(["ENGLISH", "KOREAN", "MATH", "OTHER"]).optional(),
  grade: z.number().int().min(1).max(13).optional(),
  semester: z.enum(["FIRST", "SECOND"]).optional(),
  year: z.number().int().min(2000).max(2100).optional(),
  round: z.string().max(40).optional(),
  examType: z
    .enum(["MIDTERM", "FINAL", "MOCK", "SUNEUNG", "DIAGNOSTIC", "EBS", "PRIVATE"])
    .optional(),
  publisher: z.string().max(120).optional(),
  schoolId: z.string().optional(),
  // Free-form school name (client may send this when the user typed a school
  // name into the meta form but no SchoolId is known yet). The commit route
  // will try to resolve it to an existing `School` row within the academy;
  // on miss, the raw name is preserved in `subtitle` / `sourceRef` so the
  // signal is never silently dropped.
  schoolName: z.string().max(120).optional(),
  contentHash: z.string().max(80).optional(),
});

/**
 * Base passage commit schema — content must satisfy the default minimum length
 * (`MIN_COMMIT_PASSAGE_LENGTH`). Modes that allow shorter passages (M2/M4, where
 * a "passage" may be a short directive block tied to multiple short questions)
 * compose this schema via `withMinPassageLength(mode)` below.
 *
 * Rationale: we historically allowed `z.string()` (no min) here, which meant
 * empty strings could be committed to the DB when the OCR/segmentation pipeline
 * produced a noise block. That path is now hard-closed — every mode has an
 * explicit floor.
 */
const passageCommitSchema = z.object({
  passageOrder: z.number().int().min(0),
  title: z.string().min(1).max(200),
  content: z.string().min(MIN_COMMIT_PASSAGE_LENGTH),
  sourcePageIndex: z.array(z.number().int().min(0)).min(1),
  grade: z.number().int().min(1).max(13).optional(),
  semester: z.enum(["FIRST", "SECOND"]).optional(),
  unit: z.string().max(120).optional(),
  publisher: z.string().max(120).optional(),
  difficulty: z
    .enum([
      "BEGINNER",
      "ELEMENTARY",
      "INTERMEDIATE",
      "UPPER_INTERMEDIATE",
      "ADVANCED",
      "EXPERT",
    ])
    .optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
  /** 연결된 ExtractionItem.id (확정 시 promotedTo 업데이트용) */
  sourceItemId: z.string().optional(),
  /** 저장 텍스트가 원문(verbatim)인지 AI복원본(restored)인지 (D2). */
  extractionOutput: z.enum(["verbatim", "restored"]).optional(),
});

/**
 * Build a passage commit schema whose `content.min` matches the mode-specific
 * floor in `MIN_COMMIT_PASSAGE_LENGTH_BY_MODE`. M2 / M4 use a shorter floor
 * because question-set and full-exam payloads legitimately contain short
 * stems / directives as "passage-like" blocks.
 */
function passageCommitSchemaForMode(mode: keyof typeof MIN_COMMIT_PASSAGE_LENGTH_BY_MODE) {
  const min = MIN_COMMIT_PASSAGE_LENGTH_BY_MODE[mode];
  // Keep the exact object shape identical to `passageCommitSchema` so any
  // existing consumer that consumes the inferred type still compiles.
  return passageCommitSchema.extend({
    content: z.string().min(min),
  });
}

const questionCommitSchema = z.object({
  questionOrder: z.number().int().min(0),
  /** 같은 지문에 딸린 문제면 passageOrder로 연결 */
  passageOrder: z.number().int().min(0).optional(),
  questionNumber: z.number().int().min(1).max(100).optional(),
  stem: z.string().min(1),
  choices: z.array(z.string().min(1)).max(7).optional(),
  correctAnswer: z.string().max(40).optional(),
  explanation: z.string().optional(),
  points: z.number().min(0).max(100).optional(),
  sourceItemIds: z.array(z.string()).optional(),
});

/**
 * Opt-in: when re-committing a previously-committed extraction, do we
 * overwrite teacher-edited Passage/Question fields (title/content/tags) with
 * the fresh payload, or preserve the existing row as-is?
 *
 * Default `false` — the server reuses the existing row id without touching
 * its editable columns and returns those ids in `summary.skippedPassageIds`
 * / `summary.skippedQuestionIds` so the UI can surface "kept your edits".
 * Setting `true` restores the pre-fix "silent overwrite" behaviour.
 */
const overwriteExistingSchema = z.boolean().optional();

// ─── M1 commit — 지문만 ─────────────────────────────────────────────────────
export const m1CommitSchema = z.object({
  mode: z.literal("PASSAGE_ONLY"),
  collectionName: z.string().min(1).max(120).optional(),
  collectionId: z.string().optional(),
  sourceMaterial: sourceMaterialMetaSchema.optional(),
  overwriteExisting: overwriteExistingSchema,
  passages: z.array(passageCommitSchemaForMode("PASSAGE_ONLY")).min(1),
});
export type M1CommitRequest = z.infer<typeof m1CommitSchema>;

// ─── M2 commit — 지문 + 문제 ────────────────────────────────────────────────
export const m2CommitSchema = z.object({
  mode: z.literal("QUESTION_SET"),
  sourceMaterial: sourceMaterialMetaSchema.optional(),
  overwriteExisting: overwriteExistingSchema,
  passages: z.array(passageCommitSchemaForMode("QUESTION_SET")).min(1),
  questions: z.array(questionCommitSchema).min(1),
});
export type M2CommitRequest = z.infer<typeof m2CommitSchema>;

// ─── M3 commit — 해설 첨부 ──────────────────────────────────────────────────
//
// NOTE: M3 (EXPLANATION) 파이프라인은 아직 서버 측에 commit 구현이 없습니다.
// 하지만 discriminated union에 누락되어 있으면 클라이언트가 M3 mode로 요청할
// 때 Zod가 "invalid discriminator" 내부 에러를 던져 디버깅이 어려워집니다.
// 따라서 최소한 structurally valid 한 스키마를 정의하고, commit route가 이
// mode 를 만나면 명시적으로 501 Not Implemented 로 응답하게 합니다.
//
// 필드 설계:
//   - `targetQuestions`: 이미 저장된 Question.id 와 붙일 해설 본문 매핑.
//   - `sourceMaterial`: 선택 — 해설만 첨부할 때는 생략 가능.
// 추후 구현 시 필드 확장(페이지 인덱스·증빙 이미지 등)은 가능하되,
// 기존 필드의 의미는 보존해야 합니다.
// ────────────────────────────────────────────────────────────────────────────
export const m3CommitSchema = z.object({
  mode: z.literal("EXPLANATION"),
  sourceMaterial: sourceMaterialMetaSchema.optional(),
  targetQuestions: z
    .array(
      z.object({
        questionId: z.string().min(1),
        explanationContent: z.string().min(1),
      }),
    )
    .min(1),
});
export type M3CommitRequest = z.infer<typeof m3CommitSchema>;

// ─── M4 commit — 시험지 통째 ────────────────────────────────────────────────
export const m4CommitSchema = z.object({
  mode: z.literal("FULL_EXAM"),
  sourceMaterial: sourceMaterialMetaSchema,
  overwriteExisting: overwriteExistingSchema,
  exam: z
    .object({
      title: z.string().min(1).max(200),
      type: z.enum(["OFFLINE", "ONLINE", "VOCAB", "MOCK"]).default("MOCK"),
      timeLimit: z.number().int().min(1).max(600).optional(),
    })
    .optional(),
  passages: z.array(passageCommitSchemaForMode("FULL_EXAM")).min(1),
  questions: z.array(questionCommitSchema).min(1),
  bundles: z
    .array(
      z.object({
        orderInMaterial: z.number().int().min(0),
        sharedLabel: z.string().max(40).optional(),
        passageOrder: z.number().int().min(0),
        questionOrders: z.array(z.number().int().min(0)).min(1),
      }),
    )
    .optional(),
});
export type M4CommitRequest = z.infer<typeof m4CommitSchema>;

/**
 * Discriminated union of every "new style" commit payload.
 *
 * M3 (EXPLANATION) is included so that the server can parse the request and
 * branch explicitly — the route handler still returns 501 Not Implemented
 * until the backend wiring lands, but the Zod layer no longer fails with an
 * opaque "invalid discriminator" error for clients sending `mode: "EXPLANATION"`.
 */
export const commitJobRequestSchemaV2 = z.discriminatedUnion("mode", [
  m1CommitSchema,
  m2CommitSchema,
  m3CommitSchema,
  m4CommitSchema,
]);
export type CommitJobRequestV2 = z.infer<typeof commitJobRequestSchemaV2>;

// ─── POST retry/cancel — trivial but validated for future extension ─────────

export const retryPageResponseSchema = z.object({
  pageIndex: z.number(),
  status: z.literal("PENDING"),
  triggered: z.literal(true),
});

export const cancelJobResponseSchema = z.object({
  jobId: z.string(),
  status: z.literal("CANCELLED"),
});

// ─── Common error envelope ──────────────────────────────────────────────────

export const errorResponseSchema = z.object({
  error: z.string(),
  code: z.string(),
  details: z.unknown().optional(),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;

// ─── Adaptive Intake — 트리아지(D3) 사전분석 결과 (extraction-triage 태스크) ──
// Gemini 3.5 Flash가 verbatim 본문 없이 경계·레이아웃·잘림 신호만 JSON으로 산출.

export const triageLayoutSchema = z.enum([
  "single",
  "exam2col",
  "longform",
  "mixed",
]);

export const triageBoundarySchema = z.object({
  afterPage: z.number().int().min(0),
  nonTerminal: z.boolean(),
  confidence: z.number().min(0).max(1),
});

export const triageCropSignalSchema = z.object({
  page: z.number().int().min(0),
  truncated: z.boolean(),
  skew: z.boolean(),
});

export const triageReorderSchema = z.object({
  fromIndex: z.number().int().min(0),
  toIndex: z.number().int().min(0),
  reason: z.string().max(200),
});

/** extraction-triage 태스크가 모델로부터 받아 검증하는 원시 결과. */
export const triageResultSchema = z.object({
  passageCount: z.number().int().min(0).max(60),
  layout: triageLayoutSchema,
  boundaries: z.array(triageBoundarySchema).max(60).default([]),
  cropSignals: z.array(triageCropSignalSchema).max(60).default([]),
  reorder: z.array(triageReorderSchema).max(60).default([]),
  modeGuess: extractionModeSchema.default("PASSAGE_ONLY"),
  confidence: z.number().min(0).max(1),
});

export type TriageResultParsed = z.infer<typeof triageResultSchema>;
