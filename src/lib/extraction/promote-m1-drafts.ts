// ============================================================================
// M1 draft → Passage promotion (shared core).
//
// Used by two callers with the same semantics:
//   1. POST /api/extraction/m1-passages/promote — the generate page's client
//      polling path (legacy + fallback).
//   2. autoPromoteJobDrafts — server-side promotion inside extraction finalize
//      for jobs created with `autoPromote=true` (generate-page jobs). This is
//      the durability fix: the client poller lives in component memory, so if
//      the user navigates away or refreshes during the ~40s inline extraction
//      the completed job's drafts used to stay DRAFT forever and never surface
//      as passages. Server-side promotion runs to completion regardless.
//
// Race safety: promotion is claimed atomically — the draft row is updated with
// `WHERE savedPassageId IS NULL` inside the same transaction that creates the
// Passage. If the client poller and the server promotion race, exactly one
// wins; the loser's transaction rolls back its Passage and reports
// `already_promoted`. (Server promotion also runs BEFORE the job flips to
// COMPLETED, so in practice the client only ever sees already-promoted drafts.)
// ============================================================================

import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { isM1DraftVisible } from "@/lib/extraction/m1-draft-visibility";

export type PromoteOutcome =
  | { draftId: string; status: "promoted"; passageId: string }
  | { draftId: string; status: "skipped"; reason: string; passageId?: string }
  | { draftId: string; status: "failed"; reason: string };

/** Minimal draft shape required for promotion. Satisfied by rows loaded with
 *  `PROMOTABLE_DRAFT_INCLUDE` (full draft + job/sourceMaterial selections). */
export interface PromotableDraft {
  id: string;
  title: string | null;
  passageOrder: number;
  teacherText: string;
  sourceMaterialId: string | null;
  sourcePageIndex: number[];
  restorationStatus: string;
  savedPassageId: string | null;
  job: { id: string; originalFileName: string | null; academyId: string };
  sourceMaterial: { id: string; schoolId: string | null } | null;
}

export const PROMOTABLE_DRAFT_INCLUDE = {
  job: {
    select: { id: true, originalFileName: true, academyId: true },
  },
  sourceMaterial: {
    select: { id: true, schoolId: true },
  },
} as const;

/** Same status whitelist the m1-passages list API exposes — promotion must
 *  never resurrect discarded/deleted drafts the review UI can't see. */
const PROMOTABLE_REVIEW_STATUSES = ["DRAFT", "REVIEWED", "COMMITTED"];

function sha1(input: string): string {
  return createHash("sha1")
    .update(input.replace(/\s+/g, " ").trim(), "utf8")
    .digest("hex");
}

class AlreadyPromotedError extends Error {
  constructor() {
    super("already_promoted");
  }
}

/**
 * Promote a single draft to a Passage. Throws on unexpected DB errors (caller
 * maps to a `failed` outcome); never throws for the expected skip cases.
 *
 * `markReviewed` (default true): also flips the draft to COMMITTED(검수완료).
 * Pass false to materialize the Passage WITHOUT marking it reviewed — e.g. when
 * a teacher generates from an un-reviewed material (the material is now usable
 * but still needs human 검수, so it keeps its 검수필요 status / red border).
 */
export async function promoteM1Draft(
  draft: PromotableDraft,
  opts?: { markReviewed?: boolean },
): Promise<PromoteOutcome> {
  const markReviewed = opts?.markReviewed ?? true;
  if (draft.savedPassageId) {
    return {
      draftId: draft.id,
      status: "skipped",
      reason: "already_promoted",
      passageId: draft.savedPassageId,
    };
  }

  const teacherText = draft.teacherText.trim();
  if (!teacherText) {
    return { draftId: draft.id, status: "skipped", reason: "empty_content" };
  }
  if (!draft.sourceMaterialId) {
    return {
      draftId: draft.id,
      status: "skipped",
      reason: "no_source_material",
    };
  }

  const title = (draft.title?.trim() || `지문 ${draft.passageOrder + 1}`).slice(
    0,
    200,
  );

  try {
    const passage = await prisma.$transaction(async (tx) => {
      const created = await tx.passage.create({
        data: {
          academyId: draft.job.academyId,
          schoolId: draft.sourceMaterial?.schoolId ?? null,
          title,
          content: teacherText,
          source: draft.job.originalFileName
            ? `bulk-extract:${draft.job.originalFileName}`
            : `bulk-extract:${draft.job.id}`,
          sourceMaterialId: draft.sourceMaterialId,
          contentHash: sha1(teacherText),
          // (adaptive-intake P1) — 출처 페이지 보존 + 복원본 여부 기록.
          sourcePageIndex: draft.sourcePageIndex,
          extractionOutput:
            draft.restorationStatus === "RESTORED" ? "restored" : "verbatim",
        },
        select: { id: true },
      });

      // Atomic claim: only the first promoter flips savedPassageId. A racing
      // second promoter sees count===0, throws, and its Passage rolls back.
      // markReviewed=false leaves reviewStatus untouched (draft stays 검수필요).
      const claimed = await tx.extractionM1PassageDraft.updateMany({
        where: { id: draft.id, savedPassageId: null },
        data: markReviewed
          ? {
              savedPassageId: created.id,
              reviewStatus: "COMMITTED",
              confirmedAt: new Date(),
            }
          : { savedPassageId: created.id },
      });
      if (claimed.count === 0) throw new AlreadyPromotedError();

      return created;
    });

    return { draftId: draft.id, status: "promoted", passageId: passage.id };
  } catch (err) {
    if (err instanceof AlreadyPromotedError) {
      const current = await prisma.extractionM1PassageDraft.findUnique({
        where: { id: draft.id },
        select: { savedPassageId: true },
      });
      return {
        draftId: draft.id,
        status: "skipped",
        reason: "already_promoted",
        passageId: current?.savedPassageId ?? undefined,
      };
    }
    throw err;
  }
}

export interface AutoPromoteResult {
  enabled: boolean;
  promotedPassageIds: string[];
  skipped: number;
  failed: number;
}

/**
 * Server-side promotion for `autoPromote` jobs. Called by extraction finalize
 * (inline crop-native + structured orchestrator) right BEFORE the job status
 * flips to COMPLETED/PARTIAL, so by the time any client polling reacts the
 * drafts already carry savedPassageId.
 *
 * Best-effort by contract: a promotion failure must never fail the extraction
 * job itself (the client fallback path can still pick the draft up later), so
 * per-draft errors are swallowed into the `failed` counter and logged by the
 * caller.
 */
export async function autoPromoteJobDrafts(
  jobId: string,
): Promise<AutoPromoteResult> {
  const job = await prisma.extractionJob.findUnique({
    where: { id: jobId },
    select: { autoPromote: true },
  });
  if (!job?.autoPromote) {
    return { enabled: false, promotedPassageIds: [], skipped: 0, failed: 0 };
  }

  const drafts = await prisma.extractionM1PassageDraft.findMany({
    where: {
      jobId,
      deletedAt: null,
      savedPassageId: null,
      reviewStatus: { in: PROMOTABLE_REVIEW_STATUSES },
    },
    orderBy: { passageOrder: "asc" },
    include: PROMOTABLE_DRAFT_INCLUDE,
  });

  // Same visibility rule as the list API — stub drafts (listening problems,
  // shared-passage sub-questions) are hidden from review and must not become
  // passages either.
  const visible = drafts.filter((draft) => isM1DraftVisible(draft));

  const promotedPassageIds: string[] = [];
  let skipped = 0;
  let failed = 0;
  for (const draft of visible) {
    try {
      const outcome = await promoteM1Draft(draft);
      if (outcome.status === "promoted") {
        promotedPassageIds.push(outcome.passageId);
      } else if (outcome.status === "skipped") {
        skipped += 1;
      } else {
        failed += 1;
      }
    } catch (err) {
      failed += 1;
      console.error("[autoPromoteJobDrafts] draft promotion failed", {
        jobId,
        draftId: draft.id,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { enabled: true, promotedPassageIds, skipped, failed };
}
