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

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireStaff,
  loadJobWithAuth,
  errorResponse,
} from "@/lib/extraction/api-utils";
import {
  commitJobRequestSchema,
  commitJobRequestSchemaV2,
  type CommitJobRequestV2,
} from "@/lib/extraction/zod-schemas";
import {
  CommitNotImplementedError,
  CommitPayloadError,
  ERR_CROSS_TENANT,
  ERR_NOT_IMPLEMENTED,
  type RouteContext,
} from "./_lib/types";
import { handleLegacyCommit } from "./_lib/handle-legacy";
import { handleV2Commit } from "./_lib/handle-v2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
