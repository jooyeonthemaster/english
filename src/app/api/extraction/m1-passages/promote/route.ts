import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { errorResponse, requireStaff } from "@/lib/extraction/api-utils";
import {
  PROMOTABLE_DRAFT_INCLUDE,
  promoteM1Draft,
  type PromoteOutcome,
} from "@/lib/extraction/promote-m1-drafts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const promoteSchema = z.object({
  draftIds: z.array(z.string().min(1)).min(1).max(200),
  markReviewed: z.boolean().optional().default(true),
});

export async function POST(req: NextRequest) {
  const staff = await requireStaff();
  if (staff instanceof NextResponse) return staff;

  const parsed = promoteSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return errorResponse(
      "INVALID_PAYLOAD",
      "검수 처리 요청이 올바르지 않습니다.",
      400,
      parsed.error.issues,
    );
  }

  const markReviewed = parsed.data.markReviewed;

  const drafts = await prisma.extractionM1PassageDraft.findMany({
    where: {
      id: { in: parsed.data.draftIds },
      deletedAt: null,
      job: { academyId: staff.academyId, deletedAt: null },
    },
    orderBy: { passageOrder: "asc" },
    include: PROMOTABLE_DRAFT_INCLUDE,
  });

  const foundIds = new Set(drafts.map((d) => d.id));
  const outcomes: PromoteOutcome[] = [];

  // Drafts that don't belong to this academy never appear in the result.
  // Mark them as failed (not_found) so the client can surface counts cleanly.
  for (const id of parsed.data.draftIds) {
    if (!foundIds.has(id)) {
      outcomes.push({ draftId: id, status: "failed", reason: "not_found" });
    }
  }

  for (const draft of drafts) {
    try {
      // 이미 승격됐지만 아직 COMMITTED가 아닌 draft를 검수 완료(markReviewed)로
      // 재커밋한다. (main의 markReviewed=false 경로가 남긴 REVIEWED 상태 잔존
      // 데이터를 검수 UI에서 커밋 처리할 수 있게 하는 보완 — promoteM1Draft는
      // savedPassageId가 있으면 skipped(already_promoted)만 반환한다.)
      if (
        draft.savedPassageId &&
        markReviewed &&
        draft.reviewStatus !== "COMMITTED"
      ) {
        await prisma.extractionM1PassageDraft.update({
          where: { id: draft.id },
          data: {
            reviewStatus: "COMMITTED",
            confirmedAt: new Date(),
          },
        });
        outcomes.push({
          draftId: draft.id,
          status: "promoted",
          passageId: draft.savedPassageId,
        });
        continue;
      }

      outcomes.push(await promoteM1Draft(draft, { markReviewed }));
    } catch (err) {
      console.error("[m1-passages/promote] draft promotion failed", {
        draftId: draft.id,
        jobId: draft.job.id,
        reason: err instanceof Error ? err.message : String(err),
      });
      outcomes.push({
        draftId: draft.id,
        status: "failed",
        reason: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  const promoted = outcomes.filter((o) => o.status === "promoted");
  const skipped = outcomes.filter((o) => o.status === "skipped");
  const failed = outcomes.filter((o) => o.status === "failed");

  return NextResponse.json({
    summary: {
      requested: parsed.data.draftIds.length,
      promoted: promoted.length,
      skipped: skipped.length,
      failed: failed.length,
    },
    outcomes,
  });
}
