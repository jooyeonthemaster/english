// ============================================================================
// POST /api/extraction/jobs/:jobId/commit
//
// Dual-shape endpoint:
//   1. Legacy payload (`commitJobRequestSchema`) — DRAFT ExtractionResults get
//      promoted to Passage rows. Left untouched for backward compatibility.
//   2. V2 payload (`commitJobRequestSchemaV2`) — mode-aware, branches on
//      `.mode`:
//        - M1 (PASSAGE_ONLY):   SourceMaterial + Passage + PassageCollection
//        - M2 (QUESTION_SET):   +Question (+ QuestionExplanation)
//        - M4 (FULL_EXAM):      +PassageBundle + Exam + ExamCollection
//
// The v2 flow also:
//   - reuses job.sourceMaterialId when the finalize step already created one
//   - deduplicates SourceMaterials by (academyId, contentHash) — actually
//     reuses the existing row rather than creating a second one
//   - updates ExtractionItem.promotedTo with URN strings for every promotion
//   - flips the job's ExtractionResult drafts to SAVED
//   - is **re-commit safe**: stale PassageBundles are cleared first, and
//     Passage/Question rows that were already promoted from the same
//     ExtractionItem are reused instead of duplicated
//
// Every promotion for a given mode happens inside a single Prisma transaction
// (with a raised timeout — M4 can create many rows) so partial writes never
// leave dangling state.
// ============================================================================

import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { Prisma as PrismaNS } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  requireStaff,
  loadJobWithAuth,
  errorResponse,
} from "@/lib/extraction/api-utils";
import {
  commitJobRequestSchema,
  commitJobRequestSchemaV2,
  type CommitJobRequestV2,
  type M1CommitRequest,
  type M2CommitRequest,
  type M4CommitRequest,
} from "@/lib/extraction/zod-schemas";

// Commit-time error codes — keep colocated so the tests and the client can
// assert against a single source of truth.
const ERR_NOT_IMPLEMENTED = "NOT_IMPLEMENTED";
const ERR_CROSS_TENANT = "CROSS_TENANT_ITEM_CONFLICT";
const ERR_PROMOTE_ITEM_MISSING = "PROMOTE_ITEM_MISSING";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface RouteContext {
  params: Promise<{ jobId: string }>;
}

// ─── Types ──────────────────────────────────────────────────────────────────

type TxClient = Prisma.TransactionClient;

type SourceMaterialMeta = NonNullable<M1CommitRequest["sourceMaterial"]>;

type PassageInput = M1CommitRequest["passages"][number];
type QuestionInput = M2CommitRequest["questions"][number];

interface JobLike {
  id: string;
  academyId: string;
  createdById: string;
  originalFileName: string | null;
  originalFileUrl: string | null;
  sourceMaterialId: string | null;
  status: string;
}

interface CommitSummary {
  createdPassageIds: string[];
  createdQuestionIds: string[];
  createdBundleIds: string[];
  createdExamId: string | null;
  sourceMaterialId: string | null;
  collectionId: string | null;
  examCollectionId: string | null;
  /**
   * Ids of existing Passage rows that were *reused* (not overwritten) on
   * re-commit because `overwriteExisting` was false/omitted. The UI should
   * surface this list as "kept your edits".
   */
  skippedPassageIds: string[];
  /** Same as skippedPassageIds but for Question rows. */
  skippedQuestionIds: string[];
  warning?: "DUPLICATE_SOURCE_MATERIAL";
}

// ─── Transaction timeouts ───────────────────────────────────────────────────
// M4 commits span: N passages + N questions + bundles + exam + two collections
// Default $transaction timeout (5s) is dangerously tight for N > ~20, so we
// widen it across every commit path. maxWait gives callers a bit more slack
// before Postgres starts rejecting the transaction start.
const TX_TIMEOUT_MS = 30_000;
const TX_MAX_WAIT_MS = 5_000;
const TX_OPTIONS = { timeout: TX_TIMEOUT_MS, maxWait: TX_MAX_WAIT_MS } as const;

// ─── Domain error helpers ───────────────────────────────────────────────────
// Thrown from inside $transaction callbacks to bubble up as a 400 response.
// The outer catch converts CommitPayloadError → errorResponse().
class CommitPayloadError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "CommitPayloadError";
  }
}

/**
 * Signals that the requested commit mode is structurally valid (Zod accepted
 * it) but the server-side commit path has not been implemented yet. Surfaced
 * as `501 Not Implemented` so clients can distinguish "bad request" (400)
 * from "server doesn't do this yet". Currently thrown for M3 (EXPLANATION).
 */
class CommitNotImplementedError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CommitNotImplementedError";
  }
}

// ─── Entry point ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { jobId } = await ctx.params;
  const staff = await requireStaff();
  if (staff instanceof NextResponse) return staff;

  const auth = await loadJobWithAuth(jobId, staff.academyId);
  if (!auth.ok) return auth.response;

  if (!["COMPLETED", "PARTIAL", "PROCESSING"].includes(auth.job.status)) {
    return errorResponse(
      "JOB_NOT_COMMITTABLE",
      "이 작업은 아직 저장할 준비가 되지 않았습니다.",
      409,
      { currentStatus: auth.job.status },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_PAYLOAD", "요청 본문을 읽을 수 없습니다.", 400);
  }

  // 1) Try legacy schema first — existing clients are unaffected.
  const legacyParsed = commitJobRequestSchema.safeParse(body);
  if (legacyParsed.success) {
    return handleLegacyCommit({
      jobId,
      academyId: staff.academyId,
      job: auth.job,
      payload: legacyParsed.data,
    });
  }

  // 2) Fall through to the mode-aware v2 schema.
  let v2Parsed: CommitJobRequestV2;
  try {
    v2Parsed = commitJobRequestSchemaV2.parse(body);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return errorResponse(
        "INVALID_PAYLOAD",
        "입력이 올바르지 않습니다.",
        400,
        err.issues,
      );
    }
    return errorResponse("INVALID_PAYLOAD", "요청 본문을 읽을 수 없습니다.", 400);
  }

  // M3 (EXPLANATION) — zod now accepts it so the client sees a clean error
  // shape, but the server-side commit pipeline is intentionally not wired
  // yet. Return 501 before entering the transaction path.
  if (v2Parsed.mode === "EXPLANATION") {
    return errorResponse(
      ERR_NOT_IMPLEMENTED,
      "해설 자료 모드는 준비 중입니다.",
      501,
    );
  }

  try {
    const summary = await handleV2Commit({
      jobId,
      academyId: staff.academyId,
      createdById: staff.id,
      job: auth.job,
      payload: v2Parsed,
    });
    return NextResponse.json(summary);
  } catch (err) {
    if (err instanceof CommitPayloadError) {
      // Cross-tenant conflicts are authorization failures, map to 403.
      const status = err.code === ERR_CROSS_TENANT ? 403 : 400;
      return errorResponse(err.code, err.message, status, err.details);
    }
    if (err instanceof CommitNotImplementedError) {
      return errorResponse(err.code, err.message, 501);
    }
    const message = err instanceof Error ? err.message : "commit 실패";
    return errorResponse("COMMIT_FAILED", message, 500);
  }
}

// ============================================================================
// Legacy commit — preserved verbatim from the previous implementation.
// ============================================================================

async function handleLegacyCommit(args: {
  jobId: string;
  academyId: string;
  job: JobLike;
  payload: z.infer<typeof commitJobRequestSchema>;
}) {
  const { jobId, academyId, job, payload } = args;

  const collectionId = await resolvePassageCollection({
    academyId,
    requestedId: payload.collectionId,
    requestedName: payload.collectionName,
    originalFileName: job.originalFileName,
  });

  const createdIds: string[] = [];

  for (const draft of payload.results) {
    const passage = await prisma.$transaction(async (tx) => {
      const p = await tx.passage.create({
        data: {
          academyId,
          title: draft.title,
          content: draft.content,
          source: job.originalFileName
            ? `bulk-extract:${job.originalFileName}`
            : `bulk-extract:${job.id}`,
          grade: draft.grade,
          semester: draft.semester,
          unit: draft.unit,
          publisher: draft.publisher,
          difficulty: draft.difficulty,
          tags: draft.tags ? JSON.stringify(draft.tags) : null,
        },
      });

      if (collectionId) {
        const maxItem = await tx.passageCollectionItem.findFirst({
          where: { collectionId },
          orderBy: { orderNum: "desc" },
          select: { orderNum: true },
        });
        await tx.passageCollectionItem.create({
          data: {
            collectionId,
            passageId: p.id,
            orderNum: (maxItem?.orderNum ?? -1) + 1,
          },
        });
      }

      await tx.extractionResult.updateMany({
        where: { jobId, passageOrder: draft.passageOrder },
        data: {
          status: "SAVED",
          savedPassageId: p.id,
          title: draft.title,
          content: draft.content,
        },
      });

      return p;
    }, TX_OPTIONS);
    createdIds.push(passage.id);
  }

  return NextResponse.json({
    createdPassageIds: createdIds,
    collectionId,
  });
}

// ============================================================================
// V2 commit — mode-aware
// ============================================================================

async function handleV2Commit(args: {
  jobId: string;
  academyId: string;
  createdById: string;
  job: JobLike;
  payload: CommitJobRequestV2;
}): Promise<CommitSummary> {
  const { payload } = args;
  switch (payload.mode) {
    case "PASSAGE_ONLY":
      return commitPassageOnly({ ...args, payload });
    case "QUESTION_SET":
      return commitQuestionSet({ ...args, payload });
    case "FULL_EXAM":
      return commitFullExam({ ...args, payload });
    case "EXPLANATION":
      // M3 (해설 첨부) — Zod 는 이제 payload 를 받아주지만 서버 측 구현이
      // 아직 없으므로 501 로 명시적으로 반환한다. silent 404/500 방지.
      throw new CommitNotImplementedError(
        "EXPLANATION_COMMIT_NOT_IMPLEMENTED",
        "해설 첨부(M3) 커밋은 아직 지원되지 않습니다.",
      );
    default: {
      // `never` — exhaustiveness guard.
      const _unreachable: never = payload;
      void _unreachable;
      throw new Error("지원하지 않는 모드입니다.");
    }
  }
}

// ─── M1: PASSAGE_ONLY ───────────────────────────────────────────────────────

async function commitPassageOnly(args: {
  jobId: string;
  academyId: string;
  createdById: string;
  job: JobLike;
  payload: M1CommitRequest;
}): Promise<CommitSummary> {
  const { jobId, academyId, createdById, job, payload } = args;

  const collectionName =
    payload.collectionName ??
    payload.sourceMaterial?.title ??
    job.originalFileName ??
    undefined;

  const result = await prisma.$transaction(async (tx) => {
    const { sourceMaterialId, resolvedSchoolId, warning } = await ensureSourceMaterial(tx, {
      jobId,
      academyId,
      createdById,
      job,
      meta: payload.sourceMaterial,
    });

    const createdPassageIds: string[] = [];
    const skippedPassageIds: string[] = [];
    const overwriteExisting = payload.overwriteExisting ?? false;

    // Create every Passage first (re-commit safe).
    for (const passage of payload.passages) {
      const outcome = await createOrReusePassage(tx, {
        academyId,
        sourceMaterialId,
        schoolId: resolvedSchoolId,
        job,
        input: passage,
        overwriteExisting,
      });
      if (outcome.skipped) {
        skippedPassageIds.push(outcome.row.id);
      } else {
        createdPassageIds.push(outcome.row.id);
      }

      if (passage.sourceItemId) {
        await promoteItem(tx, {
          itemId: passage.sourceItemId,
          academyId,
          urn: `Passage:${outcome.row.id}`,
        });
      }
    }

    // Bucket them into a PassageCollection for discoverability.
    const collectionId = await ensurePassageCollection(tx, {
      academyId,
      requestedId: payload.collectionId,
      name: collectionName,
      originalFileName: job.originalFileName,
    });

    if (collectionId) {
      await attachPassagesToCollection(tx, collectionId, [
        ...createdPassageIds,
        ...skippedPassageIds,
      ]);
    }

    await markResultsSaved(tx, jobId);

    return {
      sourceMaterialId,
      warning,
      createdPassageIds,
      skippedPassageIds,
      collectionId,
    };
  }, TX_OPTIONS);

  return {
    createdPassageIds: result.createdPassageIds,
    createdQuestionIds: [],
    createdBundleIds: [],
    createdExamId: null,
    sourceMaterialId: result.sourceMaterialId,
    collectionId: result.collectionId,
    examCollectionId: null,
    skippedPassageIds: result.skippedPassageIds,
    skippedQuestionIds: [],
    ...(result.warning ? { warning: result.warning } : {}),
  };
}

// ─── M2: QUESTION_SET ───────────────────────────────────────────────────────

async function commitQuestionSet(args: {
  jobId: string;
  academyId: string;
  createdById: string;
  job: JobLike;
  payload: M2CommitRequest;
}): Promise<CommitSummary> {
  const { jobId, academyId, createdById, job, payload } = args;
  const overwriteExisting = payload.overwriteExisting === true;

  const result = await prisma.$transaction(async (tx) => {
    const { sourceMaterialId, resolvedSchoolId, warning } = await ensureSourceMaterial(tx, {
      jobId,
      academyId,
      createdById,
      job,
      meta: payload.sourceMaterial,
    });

    // Passages first — build a map so questions can resolve their parent.
    const passageByOrder = new Map<number, string>();
    const createdPassageIds: string[] = [];
    const skippedPassageIds: string[] = [];
    for (const passage of payload.passages) {
      const outcome = await createOrReusePassage(tx, {
        academyId,
        sourceMaterialId,
        schoolId: resolvedSchoolId,
        job,
        input: passage,
        overwriteExisting,
      });
      passageByOrder.set(passage.passageOrder, outcome.row.id);
      if (outcome.skipped) {
        skippedPassageIds.push(outcome.row.id);
      } else {
        createdPassageIds.push(outcome.row.id);
      }
      if (passage.sourceItemId) {
        await promoteItem(tx, {
          itemId: passage.sourceItemId,
          academyId,
          urn: `Passage:${outcome.row.id}`,
        });
      }
    }

    // Questions — each may link to a passage via passageOrder.
    const createdQuestionIds: string[] = [];
    const skippedQuestionIds: string[] = [];
    for (const q of payload.questions) {
      const passageId =
        q.passageOrder !== undefined ? passageByOrder.get(q.passageOrder) : undefined;

      const outcome = await createOrReuseQuestion(tx, {
        academyId,
        sourceMaterialId,
        passageId: passageId ?? null,
        bundleId: null,
        input: q,
        overwriteExisting,
      });
      if (outcome.skipped) {
        skippedQuestionIds.push(outcome.row.id);
      } else {
        createdQuestionIds.push(outcome.row.id);
      }

      if (q.explanation && q.explanation.trim().length > 0) {
        await tx.questionExplanation.upsert({
          where: { questionId: outcome.row.id },
          update: { content: q.explanation, aiGenerated: false },
          create: {
            questionId: outcome.row.id,
            content: q.explanation,
            aiGenerated: false,
          },
        });
      }

      if (q.sourceItemIds && q.sourceItemIds.length > 0) {
        for (const itemId of q.sourceItemIds) {
          await promoteItem(tx, {
            itemId,
            academyId,
            urn: `Question:${outcome.row.id}`,
          });
        }
      }
    }

    const collectionId = await ensurePassageCollection(tx, {
      academyId,
      requestedId: undefined,
      name: payload.sourceMaterial?.title ?? job.originalFileName ?? undefined,
      originalFileName: job.originalFileName,
    });
    if (collectionId) {
      await attachPassagesToCollection(tx, collectionId, [
        ...createdPassageIds,
        ...skippedPassageIds,
      ]);
    }

    await markResultsSaved(tx, jobId);

    return {
      sourceMaterialId,
      warning,
      createdPassageIds,
      skippedPassageIds,
      createdQuestionIds,
      skippedQuestionIds,
      collectionId,
    };
  }, TX_OPTIONS);

  return {
    createdPassageIds: result.createdPassageIds,
    createdQuestionIds: result.createdQuestionIds,
    createdBundleIds: [],
    createdExamId: null,
    sourceMaterialId: result.sourceMaterialId,
    collectionId: result.collectionId,
    examCollectionId: null,
    skippedPassageIds: result.skippedPassageIds,
    skippedQuestionIds: result.skippedQuestionIds,
    ...(result.warning ? { warning: result.warning } : {}),
  };
}

// ─── M4: FULL_EXAM ──────────────────────────────────────────────────────────

async function commitFullExam(args: {
  jobId: string;
  academyId: string;
  createdById: string;
  job: JobLike;
  payload: M4CommitRequest;
}): Promise<CommitSummary> {
  const { jobId, academyId, createdById, job, payload } = args;
  const overwriteExisting = payload.overwriteExisting === true;

  // ── Pre-transaction payload validation ─────────────────────────────────
  // PassageBundle has @@unique([sourceMaterialId, passageId]) — so two
  // bundles with the same passageOrder would trip P2002 mid-transaction
  // and roll everything back. Catch it here with a clean 400.
  validateBundlesPayload(payload.bundles);

  const result = await prisma.$transaction(async (tx) => {
    const { sourceMaterialId, resolvedSchoolId, warning } = await ensureSourceMaterial(tx, {
      jobId,
      academyId,
      createdById,
      job,
      meta: payload.sourceMaterial,
    });

    // Clean slate for bundles on re-commit: existing bundles for this
    // SourceMaterial would collide on @@unique([sourceMaterialId, passageId])
    // when the payload re-sends the same passageOrder. Dropping them first
    // is safe because bundle identity is just (sourceMaterial, passage).
    await tx.passageBundle.deleteMany({ where: { sourceMaterialId } });

    // Passages
    const passageByOrder = new Map<number, string>();
    const createdPassageIds: string[] = [];
    const skippedPassageIds: string[] = [];
    for (const p of payload.passages) {
      const outcome = await createOrReusePassage(tx, {
        academyId,
        sourceMaterialId,
        schoolId: resolvedSchoolId,
        job,
        input: p,
        overwriteExisting,
      });
      passageByOrder.set(p.passageOrder, outcome.row.id);
      if (outcome.skipped) {
        skippedPassageIds.push(outcome.row.id);
      } else {
        createdPassageIds.push(outcome.row.id);
      }
      if (p.sourceItemId) {
        await promoteItem(tx, {
          itemId: p.sourceItemId,
          academyId,
          urn: `Passage:${outcome.row.id}`,
        });
      }
    }

    // Questions (with passage linkage; bundleId added below once bundles exist)
    const questionByOrder = new Map<number, string>();
    const createdQuestionIds: string[] = [];
    const skippedQuestionIds: string[] = [];
    for (const q of payload.questions) {
      const passageId =
        q.passageOrder !== undefined ? passageByOrder.get(q.passageOrder) : undefined;
      const outcome = await createOrReuseQuestion(tx, {
        academyId,
        sourceMaterialId,
        passageId: passageId ?? null,
        bundleId: null,
        input: q,
        overwriteExisting,
      });
      questionByOrder.set(q.questionOrder, outcome.row.id);
      if (outcome.skipped) {
        skippedQuestionIds.push(outcome.row.id);
      } else {
        createdQuestionIds.push(outcome.row.id);
      }

      if (q.explanation && q.explanation.trim().length > 0) {
        await tx.questionExplanation.upsert({
          where: { questionId: outcome.row.id },
          update: { content: q.explanation, aiGenerated: false },
          create: {
            questionId: outcome.row.id,
            content: q.explanation,
            aiGenerated: false,
          },
        });
      }

      if (q.sourceItemIds && q.sourceItemIds.length > 0) {
        for (const itemId of q.sourceItemIds) {
          await promoteItem(tx, {
            itemId,
            academyId,
            urn: `Question:${outcome.row.id}`,
          });
        }
      }
    }

    // Track which questions have been bound to a bundle — used to build the
    // ExamQuestion list below and to detect missing question references.
    const bundledQuestionIds = new Set<string>();

    // Bundles: [32~34] groups. Optional on the payload.
    const createdBundleIds: string[] = [];
    if (payload.bundles && payload.bundles.length > 0) {
      for (const bundle of payload.bundles) {
        const passageId = passageByOrder.get(bundle.passageOrder);
        if (!passageId) {
          throw new CommitPayloadError(
            "BUNDLE_PASSAGE_MISSING",
            "묶음(bundle)이 존재하지 않는 passageOrder를 참조합니다.",
            { passageOrder: bundle.passageOrder },
          );
        }

        const createdBundle = await tx.passageBundle.create({
          data: {
            sourceMaterialId,
            passageId,
            orderInMaterial: bundle.orderInMaterial,
            sharedLabel: bundle.sharedLabel,
          },
        });
        createdBundleIds.push(createdBundle.id);

        // Resolve each questionOrder → questionId. Missing orders are a
        // client bug — fail fast with an explicit 400 instead of silently
        // filtering them out.
        const questionIds: string[] = [];
        for (const order of bundle.questionOrders) {
          const qid = questionByOrder.get(order);
          if (!qid) {
            throw new CommitPayloadError(
              "BUNDLE_QUESTION_MISSING",
              "묶음(bundle)이 존재하지 않는 questionOrder를 참조합니다.",
              { questionOrder: order, passageOrder: bundle.passageOrder },
            );
          }
          questionIds.push(qid);
          bundledQuestionIds.add(qid);
        }

        // Defense-in-depth: although `questionIds` originate from our own
        // createOrReuseQuestion (academy-scoped), we also filter by
        // `academyId` here so any future refactor that widens the source
        // of these ids cannot accidentally flip bundleId on a cross-tenant
        // Question row.
        await tx.question.updateMany({
          where: { id: { in: questionIds }, academyId },
          data: { bundleId: createdBundle.id },
        });
      }
    }

    // Exam (+ ExamQuestion rows) — optional.
    let createdExamId: string | null = null;
    let examCollectionId: string | null = null;
    if (payload.exam) {
      const exam = await tx.exam.create({
        data: {
          academyId,
          title: payload.exam.title,
          type: payload.exam.type,
          status: "DRAFT",
          grade: payload.sourceMaterial.grade,
          semester: payload.sourceMaterial.semester,
          year: payload.sourceMaterial.year,
          examType: mapExamType(payload.sourceMaterial.examType),
          duration: payload.exam.timeLimit,
          sourceMaterialId,
        },
      });
      createdExamId = exam.id;

      // Pick question order for the Exam:
      //   1. If payload.exam.questionOrders is provided → whitelist & honour it.
      //   2. Else if any bundles exist → include only bundled questions,
      //      preserving their insertion order (bundled in-order).
      //   3. Else → include every question in insertion order (legacy).
      // NOTE: Both newly-created AND reused (skipped) questions belong on
      // the Exam — skipping reuse purely protects editable columns, it does
      // not imply "exclude from the exam roster".
      const allQuestionIds = [...createdQuestionIds, ...skippedQuestionIds];
      const examQuestionIds = resolveExamQuestionIds({
        payloadExam: payload.exam,
        questionByOrder,
        createdQuestionIds: allQuestionIds,
        bundledQuestionIds,
        hasBundles: createdBundleIds.length > 0,
      });

      if (examQuestionIds.length > 0) {
        await tx.examQuestion.createMany({
          data: examQuestionIds.map((questionId, idx) => ({
            examId: exam.id,
            questionId,
            orderNum: idx,
            points: 1,
          })),
        });
      }

      // ExamCollection — group this exam for easy re-distribution.
      examCollectionId = await ensureExamCollection(tx, {
        academyId,
        name: payload.sourceMaterial.title,
      });
      if (examCollectionId) {
        const maxItem = await tx.examCollectionItem.findFirst({
          where: { collectionId: examCollectionId },
          orderBy: { orderNum: "desc" },
          select: { orderNum: true },
        });
        await tx.examCollectionItem.create({
          data: {
            collectionId: examCollectionId,
            examId: exam.id,
            orderNum: (maxItem?.orderNum ?? -1) + 1,
          },
        });
      }
    }

    const collectionId = await ensurePassageCollection(tx, {
      academyId,
      requestedId: undefined,
      name: payload.sourceMaterial.title,
      originalFileName: job.originalFileName,
    });
    if (collectionId) {
      await attachPassagesToCollection(tx, collectionId, [
        ...createdPassageIds,
        ...skippedPassageIds,
      ]);
    }

    await markResultsSaved(tx, jobId);

    return {
      sourceMaterialId,
      warning,
      createdPassageIds,
      skippedPassageIds,
      createdQuestionIds,
      skippedQuestionIds,
      createdBundleIds,
      createdExamId,
      collectionId,
      examCollectionId,
    };
  }, TX_OPTIONS);

  return {
    createdPassageIds: result.createdPassageIds,
    createdQuestionIds: result.createdQuestionIds,
    createdBundleIds: result.createdBundleIds,
    createdExamId: result.createdExamId,
    sourceMaterialId: result.sourceMaterialId,
    collectionId: result.collectionId,
    examCollectionId: result.examCollectionId,
    skippedPassageIds: result.skippedPassageIds,
    skippedQuestionIds: result.skippedQuestionIds,
    ...(result.warning ? { warning: result.warning } : {}),
  };
}

// ============================================================================
// Shared helpers
// ============================================================================

/**
 * Validate that the `bundles` payload, if supplied, does not assign the same
 * passageOrder to two different bundles. That would deterministically trip
 * PassageBundle's @@unique([sourceMaterialId, passageId]) constraint mid-
 * transaction and roll the whole commit back. We raise a 400 here instead.
 */
function validateBundlesPayload(bundles: M4CommitRequest["bundles"]): void {
  if (!bundles || bundles.length === 0) return;

  const seenPassageOrders = new Set<number>();
  const seenQuestionOrders = new Set<number>();

  for (const bundle of bundles) {
    if (seenPassageOrders.has(bundle.passageOrder)) {
      throw new CommitPayloadError(
        "BUNDLE_DUPLICATE_PASSAGE",
        "동일한 지문을 가리키는 묶음이 두 개 이상입니다.",
        { passageOrder: bundle.passageOrder },
      );
    }
    seenPassageOrders.add(bundle.passageOrder);

    for (const order of bundle.questionOrders) {
      if (seenQuestionOrders.has(order)) {
        throw new CommitPayloadError(
          "BUNDLE_DUPLICATE_QUESTION",
          "같은 문제가 두 개의 묶음에 동시에 포함되었습니다.",
          { questionOrder: order },
        );
      }
      seenQuestionOrders.add(order);
    }
  }
}

/**
 * Resolve the ordered list of question ids to attach to the Exam via
 * ExamQuestion. Supports an explicit whitelist (`payload.exam.questionOrders`),
 * bundle-scoped inclusion, or the legacy "all questions" fallback.
 */
function resolveExamQuestionIds(args: {
  payloadExam: NonNullable<M4CommitRequest["exam"]>;
  questionByOrder: Map<number, string>;
  createdQuestionIds: string[];
  bundledQuestionIds: Set<string>;
  hasBundles: boolean;
}): string[] {
  const {
    payloadExam,
    questionByOrder,
    createdQuestionIds,
    bundledQuestionIds,
    hasBundles,
  } = args;

  // Whitelist mode — defensive against future schema field. The Zod schema
  // currently omits `questionOrders`, but accepting it opportunistically
  // keeps the door open without breaking older clients.
  const maybeOrders = (payloadExam as { questionOrders?: unknown }).questionOrders;
  if (Array.isArray(maybeOrders) && maybeOrders.length > 0) {
    const ids: string[] = [];
    for (const raw of maybeOrders) {
      if (typeof raw !== "number" || !Number.isInteger(raw)) {
        throw new CommitPayloadError(
          "BUNDLE_QUESTION_MISSING",
          "exam.questionOrders에 유효하지 않은 값이 있습니다.",
          { value: raw },
        );
      }
      const qid = questionByOrder.get(raw);
      if (!qid) {
        throw new CommitPayloadError(
          "BUNDLE_QUESTION_MISSING",
          "exam.questionOrders가 존재하지 않는 문제를 참조합니다.",
          { questionOrder: raw },
        );
      }
      ids.push(qid);
    }
    return ids;
  }

  // Bundle-scoped: only attach questions that belong to a bundle.
  if (hasBundles) {
    return createdQuestionIds.filter((id) => bundledQuestionIds.has(id));
  }

  // Fallback: every question, insertion order.
  return createdQuestionIds.slice();
}

/**
 * Reuse job.sourceMaterialId when finalize has already created one, otherwise
 * build a fresh SourceMaterial from the payload meta. Deduplicates by
 * (academyId, contentHash) — when a duplicate is detected, the existing row
 * is **reused** (no new row is created) and the caller is informed via the
 * `DUPLICATE_SOURCE_MATERIAL` warning.
 *
 * Everything — the lookup, the row creation, and the ExtractionJob patch —
 * runs inside the caller's transaction so partial failures never orphan a
 * SourceMaterial or leave an ExtractionJob pointing at nothing.
 */
async function ensureSourceMaterial(
  tx: TxClient,
  args: {
    jobId: string;
    academyId: string;
    createdById: string;
    job: JobLike;
    meta?: SourceMaterialMeta;
  },
): Promise<{
  sourceMaterialId: string;
  /**
   * Resolved School FK for this commit — either the caller-supplied
   * `meta.schoolId` or the result of looking up `meta.schoolName` within the
   * academy. `undefined` when no school was specified OR the name lookup
   * missed (the raw name is still preserved on SourceMaterial.subtitle/
   * sourceRef in that case).
   */
  resolvedSchoolId?: string;
  warning?: "DUPLICATE_SOURCE_MATERIAL";
}> {
  const { jobId, academyId, createdById, job, meta } = args;

  // 0. Need the meta up front so we can resolve the school even when we end
  //    up reusing an existing SourceMaterial (the Passage rows still need a
  //    schoolId to link to). Caller may omit it (legal only for M1 / M2);
  //    synthesize a minimal placeholder in that case.
  const resolvedMeta: SourceMaterialMeta = meta ?? {
    title: job.originalFileName ?? "새 원본 자료",
  };

  // 0-b. Resolve `schoolName` (free-form) → `schoolId` (FK) within this
  //      academy. This prevents silent data loss when the reviewer typed a
  //      school name into the meta form but no SchoolId was known yet.
  //      Resolution order:
  //        (i)   meta.schoolId already present → trust it (authoritative).
  //        (ii)  Look up School by (academyId, name=trimmed schoolName).
  //        (iii) On miss, keep the raw name on `subtitle` / `sourceRef` so
  //              the signal is preserved for later triage.
  let resolvedSchoolId: string | undefined = resolvedMeta.schoolId;
  let unresolvedSchoolName: string | null = null;
  const rawSchoolName = resolvedMeta.schoolName?.trim();
  if (!resolvedSchoolId && rawSchoolName) {
    const school = await tx.school.findFirst({
      where: { academyId, name: rawSchoolName },
      select: { id: true },
    });
    if (school) {
      resolvedSchoolId = school.id;
    } else {
      unresolvedSchoolName = rawSchoolName;
    }
  }

  // Preserve schoolName signal when no FK match was found. We prefer
  // `subtitle` (visible in list views) and fall back to `sourceRef` so the
  // free-form breadcrumb survives across re-commit / export paths.
  const resolvedSubtitle =
    resolvedMeta.subtitle ??
    (unresolvedSchoolName ? `학교: ${unresolvedSchoolName}` : undefined);
  const resolvedSourceRef = unresolvedSchoolName
    ? `school:${unresolvedSchoolName}`
    : undefined;

  // 1. Finalize already linked one — trust it (academy scoped, so enforce).
  //    Read back the persisted schoolId so Passage creation can inherit it.
  if (job.sourceMaterialId) {
    const existing = await tx.sourceMaterial.findFirst({
      where: { id: job.sourceMaterialId, academyId },
      select: { id: true, schoolId: true },
    });
    if (existing) {
      return {
        sourceMaterialId: existing.id,
        resolvedSchoolId: existing.schoolId ?? resolvedSchoolId,
      };
    }
  }

  // 3. Dedup by (academyId, contentHash). Reuse the existing row — never
  //    create a second SourceMaterial for the same content in the same
  //    academy.
  if (resolvedMeta.contentHash) {
    const duplicate = await tx.sourceMaterial.findFirst({
      where: { academyId, contentHash: resolvedMeta.contentHash },
      select: { id: true, schoolId: true },
    });
    if (duplicate) {
      await tx.extractionJob.update({
        where: { id: jobId },
        data: { sourceMaterialId: duplicate.id },
      });
      return {
        sourceMaterialId: duplicate.id,
        resolvedSchoolId: duplicate.schoolId ?? resolvedSchoolId,
        warning: "DUPLICATE_SOURCE_MATERIAL",
      };
    }
  }

  // 4. No duplicate — insert. A concurrent commit may still race us on the
  //    unique (academyId, contentHash) index → catch P2002 and fall back to
  //    the freshly-inserted row.
  try {
    const created = await tx.sourceMaterial.create({
      data: {
        academyId,
        createdById,
        title: resolvedMeta.title,
        subtitle: resolvedSubtitle,
        type: resolvedMeta.type ?? "EXAM",
        subject: resolvedMeta.subject ?? "ENGLISH",
        grade: resolvedMeta.grade,
        semester: resolvedMeta.semester,
        year: resolvedMeta.year,
        round: resolvedMeta.round,
        examType: resolvedMeta.examType,
        publisher: resolvedMeta.publisher,
        schoolId: resolvedSchoolId,
        sourceRef: resolvedSourceRef,
        contentHash: resolvedMeta.contentHash,
        originalFileUrl: job.originalFileUrl,
      },
    });

    await tx.extractionJob.update({
      where: { id: jobId },
      data: { sourceMaterialId: created.id },
    });

    return { sourceMaterialId: created.id, resolvedSchoolId };
  } catch (err) {
    if (
      err instanceof PrismaNS.PrismaClientKnownRequestError &&
      err.code === "P2002" &&
      resolvedMeta.contentHash
    ) {
      const winner = await tx.sourceMaterial.findFirst({
        where: { academyId, contentHash: resolvedMeta.contentHash },
        select: { id: true, schoolId: true },
      });
      if (winner) {
        await tx.extractionJob.update({
          where: { id: jobId },
          data: { sourceMaterialId: winner.id },
        });
        return {
          sourceMaterialId: winner.id,
          resolvedSchoolId: winner.schoolId ?? resolvedSchoolId,
          warning: "DUPLICATE_SOURCE_MATERIAL",
        };
      }
    }
    throw err;
  }
}

/**
 * Promote a Passage payload into a Passage row — re-commit safe.
 *
 * On re-commit the same ExtractionItem may have already been promoted in a
 * prior commit; Passage.sourceExtractionItemId is @unique, so a naive
 * tx.passage.create() would trip P2002 and roll back the whole transaction.
 *
 * Strategy:
 *   1. If `input.sourceItemId` is supplied AND a Passage already exists
 *      against it (academy-scoped), reuse that row. When `overwriteExisting`
 *      is true we update with the latest payload; otherwise we return the
 *      existing row unchanged and mark it as `skipped` so the caller can
 *      report "kept your edits" to the UI.
 *   2. Otherwise, create a fresh Passage. On P2002 we:
 *        a. Look up a same-academy row with that sourceExtractionItemId.
 *           If found, reuse it (same overwrite rules).
 *        b. If no same-academy row exists, the unique collision is from a
 *           DIFFERENT academy owning that ExtractionItem id. That's a cross-
 *           tenant violation — raise a clear 403 instead of leaking through
 *           as a generic 500.
 */
async function createOrReusePassage(
  tx: TxClient,
  args: {
    academyId: string;
    sourceMaterialId: string;
    /**
     * School FK resolved by `ensureSourceMaterial`. When present, cascades
     * to `Passage.schoolId` so downstream queries (school-scoped filter,
     * ranking, report) keep the linkage even for bulk-imported passages.
     */
    schoolId?: string;
    job: JobLike;
    input: PassageInput;
    /** When true, overwrite teacher-edited fields on re-commit (opt-in). */
    overwriteExisting: boolean;
  },
): Promise<{ row: { id: string }; skipped: boolean }> {
  const {
    academyId,
    sourceMaterialId,
    schoolId,
    job,
    input,
    overwriteExisting,
  } = args;
  const contentHash = sha1(input.content);

  const data = {
    academyId,
    schoolId: schoolId ?? undefined,
    title: input.title,
    content: input.content,
    source: job.originalFileName
      ? `bulk-extract:${job.originalFileName}`
      : `bulk-extract:${job.id}`,
    grade: input.grade,
    semester: input.semester,
    unit: input.unit,
    publisher: input.publisher,
    difficulty: input.difficulty,
    tags: input.tags ? JSON.stringify(input.tags) : null,
    sourceMaterialId,
    sourceExtractionItemId: input.sourceItemId,
    contentHash,
  };

  // Fast path: look up an existing Passage for this ExtractionItem.
  if (input.sourceItemId) {
    const existing = await tx.passage.findFirst({
      where: {
        academyId,
        sourceExtractionItemId: input.sourceItemId,
      },
      select: { id: true },
    });
    if (existing) {
      if (overwriteExisting) {
        const updated = await tx.passage.update({
          where: { id: existing.id },
          data,
        });
        return { row: updated, skipped: false };
      }
      // Reuse as-is — teacher edits are preserved.
      return { row: existing, skipped: true };
    }
  }

  try {
    const created = await tx.passage.create({ data });
    return { row: created, skipped: false };
  } catch (err) {
    if (
      err instanceof PrismaNS.PrismaClientKnownRequestError &&
      err.code === "P2002" &&
      input.sourceItemId
    ) {
      const winner = await tx.passage.findFirst({
        where: {
          academyId,
          sourceExtractionItemId: input.sourceItemId,
        },
        select: { id: true },
      });
      if (winner) {
        if (overwriteExisting) {
          const updated = await tx.passage.update({
            where: { id: winner.id },
            data,
          });
          return { row: updated, skipped: false };
        }
        return { row: winner, skipped: true };
      }
      // No same-academy row owns this sourceExtractionItemId → the unique
      // collision is from a Passage previously promoted by a DIFFERENT
      // academy. This is a cross-tenant leak attempt — raise a clear 403
      // instead of bubbling as a generic 500.
      throw new CommitPayloadError(
        ERR_CROSS_TENANT,
        "다른 학원에서 이미 사용된 추출 데이터입니다.",
        { sourceItemId: input.sourceItemId },
      );
    }
    throw err;
  }
}

/**
 * Promote a Question payload into a Question row — re-commit safe.
 *
 * Same reasoning as createOrReusePassage: Question.sourceExtractionItemId is
 * @unique, and questionSets with a single sourceItemId must survive a re-
 * commit without colliding on the unique constraint.
 */
async function createOrReuseQuestion(
  tx: TxClient,
  args: {
    academyId: string;
    sourceMaterialId: string;
    passageId: string | null;
    bundleId: string | null;
    input: QuestionInput;
    /** When true, overwrite teacher-edited fields on re-commit (opt-in). */
    overwriteExisting: boolean;
  },
): Promise<{ row: { id: string }; skipped: boolean }> {
  const {
    academyId,
    sourceMaterialId,
    passageId,
    bundleId,
    input,
    overwriteExisting,
  } = args;

  // Pack choices into the canonical JSON shape used everywhere else.
  const options =
    input.choices && input.choices.length > 0
      ? JSON.stringify(
          input.choices.map((text, idx) => ({
            label: CHOICE_LABELS[idx] ?? `${idx + 1}`,
            text,
          })),
        )
      : null;

  const type = options ? "MULTIPLE_CHOICE" : "SHORT_ANSWER";

  const sourceExtractionItemId =
    input.sourceItemIds && input.sourceItemIds.length === 1
      ? input.sourceItemIds[0]
      : undefined;

  const data = {
    academyId,
    passageId: passageId ?? undefined,
    sourceMaterialId,
    bundleId: bundleId ?? undefined,
    sourceExtractionItemId,
    questionNumber: input.questionNumber,
    type,
    questionText: input.stem,
    options,
    correctAnswer: input.correctAnswer ?? "",
    points: input.points !== undefined ? Math.round(input.points) : 1,
    aiGenerated: false,
    approved: false,
  };

  // Fast path: existing question already promoted from this ExtractionItem.
  if (sourceExtractionItemId) {
    const existing = await tx.question.findFirst({
      where: {
        academyId,
        sourceExtractionItemId,
      },
      select: { id: true },
    });
    if (existing) {
      if (overwriteExisting) {
        const updated = await tx.question.update({
          where: { id: existing.id },
          data,
        });
        return { row: updated, skipped: false };
      }
      return { row: existing, skipped: true };
    }
  }

  try {
    const created = await tx.question.create({ data });
    return { row: created, skipped: false };
  } catch (err) {
    if (
      err instanceof PrismaNS.PrismaClientKnownRequestError &&
      err.code === "P2002" &&
      sourceExtractionItemId
    ) {
      const winner = await tx.question.findFirst({
        where: {
          academyId,
          sourceExtractionItemId,
        },
        select: { id: true },
      });
      if (winner) {
        if (overwriteExisting) {
          const updated = await tx.question.update({
            where: { id: winner.id },
            data,
          });
          return { row: updated, skipped: false };
        }
        return { row: winner, skipped: true };
      }
      // Cross-tenant: the sourceExtractionItemId unique is held by a Question
      // in another academy. Raise 403 instead of a generic 500.
      throw new CommitPayloadError(
        ERR_CROSS_TENANT,
        "다른 학원에서 이미 사용된 추출 데이터입니다.",
        { sourceItemIds: input.sourceItemIds },
      );
    }
    throw err;
  }
}

const CHOICE_LABELS = ["①", "②", "③", "④", "⑤", "⑥", "⑦"] as const;

async function ensurePassageCollection(
  tx: TxClient,
  args: {
    academyId: string;
    requestedId?: string;
    name?: string;
    originalFileName: string | null;
  },
): Promise<string | null> {
  const { academyId, requestedId, name, originalFileName } = args;

  if (requestedId) {
    const existing = await tx.passageCollection.findUnique({
      where: { id: requestedId },
      select: { academyId: true },
    });
    if (existing && existing.academyId === academyId) return requestedId;
  }

  const defaultName =
    name ||
    originalFileName ||
    `일괄 등록 ${new Date().toLocaleDateString("ko-KR")}`;

  const created = await tx.passageCollection.create({
    data: {
      academyId,
      name: defaultName.slice(0, 120),
      description: "시험지 일괄 등록으로 자동 생성된 컬렉션",
    },
  });
  return created.id;
}

async function attachPassagesToCollection(
  tx: TxClient,
  collectionId: string,
  passageIds: string[],
) {
  if (passageIds.length === 0) return;
  const maxItem = await tx.passageCollectionItem.findFirst({
    where: { collectionId },
    orderBy: { orderNum: "desc" },
    select: { orderNum: true },
  });
  const baseOrder = (maxItem?.orderNum ?? -1) + 1;
  await tx.passageCollectionItem.createMany({
    data: passageIds.map((passageId, idx) => ({
      collectionId,
      passageId,
      orderNum: baseOrder + idx,
    })),
    skipDuplicates: true,
  });
}

async function ensureExamCollection(
  tx: TxClient,
  args: { academyId: string; name: string },
): Promise<string | null> {
  const safeName = args.name.slice(0, 120);
  const created = await tx.examCollection.create({
    data: {
      academyId: args.academyId,
      name: safeName,
      description: "시험지 일괄 등록으로 자동 생성된 시험 컬렉션",
    },
  });
  return created.id;
}

/**
 * Mark an ExtractionItem as PROMOTED with the given URN — ACADEMY-SCOPED.
 *
 * SECURITY: The previous implementation used `where: { id }` only, which
 * allowed a crafted payload to overwrite the `promotedTo` field of another
 * academy's ExtractionItem. This version joins to `job.academyId` so the
 * update is a no-op for any foreign-academy id; when that happens we detect
 * the zero-row result and raise an explicit 400 so the client cannot
 * silently point an item it doesn't own at a freshly-created URN.
 */
async function promoteItem(
  tx: TxClient,
  args: { itemId: string; academyId: string; urn: string },
): Promise<void> {
  const { itemId, academyId, urn } = args;
  const { count } = await tx.extractionItem.updateMany({
    where: { id: itemId, job: { academyId } },
    data: {
      promotedTo: urn,
      status: "PROMOTED",
    },
  });
  if (count === 0) {
    // Either the id does not exist or it belongs to another academy. Either
    // way the commit payload is referencing an item this staff cannot own;
    // bubble up as a clean 400 (via CommitPayloadError → outer catch).
    throw new CommitPayloadError(
      ERR_PROMOTE_ITEM_MISSING,
      "연결하려는 추출 블록을 찾을 수 없거나 접근 권한이 없습니다.",
      { itemId },
    );
  }
}

async function markResultsSaved(tx: TxClient, jobId: string) {
  await tx.extractionResult.updateMany({
    where: { jobId, status: "DRAFT" },
    data: { status: "SAVED" },
  });
}

/** commit-time content hash for Passage duplicate detection. */
function sha1(input: string): string {
  return createHash("sha1")
    .update(input.replace(/\s+/g, " ").trim(), "utf8")
    .digest("hex");
}

/**
 * The commit payload's `examType` uses a broad enum for flexibility; Exam.examType
 * historically accepted only MIDTERM | FINAL | QUIZ | MOCK. Map any new values
 * conservatively so the column stays semantically clean.
 */
function mapExamType(input?: string): string | undefined {
  if (!input) return undefined;
  switch (input) {
    case "MIDTERM":
    case "FINAL":
    case "MOCK":
      return input;
    case "SUNEUNG":
    case "DIAGNOSTIC":
    case "EBS":
      return "MOCK";
    case "PRIVATE":
      return "QUIZ";
    default:
      return undefined;
  }
}

/** Either reuse an existing collection, use the supplied id, or create one.
 *  Used only by the legacy path. */
async function resolvePassageCollection(args: {
  academyId: string;
  requestedId: string | undefined;
  requestedName: string | undefined;
  originalFileName: string | null;
}): Promise<string | null> {
  const { academyId, requestedId, requestedName, originalFileName } = args;

  if (requestedId) {
    const existing = await prisma.passageCollection.findUnique({
      where: { id: requestedId },
      select: { academyId: true },
    });
    if (existing && existing.academyId === academyId) return requestedId;
  }

  const defaultName =
    requestedName ||
    originalFileName ||
    `일괄 등록 ${new Date().toLocaleDateString("ko-KR")}`;

  const collection = await prisma.passageCollection.create({
    data: {
      academyId,
      name: defaultName.slice(0, 120),
      description: "시험지 일괄 등록으로 자동 생성된 컬렉션",
    },
  });
  return collection.id;
}
