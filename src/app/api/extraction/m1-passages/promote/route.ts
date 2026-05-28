import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createHash } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { errorResponse, requireStaff } from "@/lib/extraction/api-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const promoteSchema = z.object({
  draftIds: z.array(z.string().min(1)).min(1).max(200),
});

type PromoteOutcome =
  | { draftId: string; status: "promoted"; passageId: string }
  | { draftId: string; status: "skipped"; reason: string }
  | { draftId: string; status: "failed"; reason: string };

function sha1(input: string): string {
  return createHash("sha1")
    .update(input.replace(/\s+/g, " ").trim(), "utf8")
    .digest("hex");
}

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

  const drafts = await prisma.extractionM1PassageDraft.findMany({
    where: {
      id: { in: parsed.data.draftIds },
      deletedAt: null,
      job: { academyId: staff.academyId, deletedAt: null },
    },
    include: {
      job: {
        select: { id: true, originalFileName: true, academyId: true },
      },
      sourceMaterial: {
        select: { id: true, schoolId: true },
      },
    },
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
      if (draft.savedPassageId) {
        outcomes.push({
          draftId: draft.id,
          status: "skipped",
          reason: "already_promoted",
        });
        continue;
      }

      const teacherText = draft.teacherText.trim();
      if (!teacherText) {
        outcomes.push({
          draftId: draft.id,
          status: "skipped",
          reason: "empty_content",
        });
        continue;
      }

      if (!draft.sourceMaterialId) {
        outcomes.push({
          draftId: draft.id,
          status: "skipped",
          reason: "no_source_material",
        });
        continue;
      }

      const title = (draft.title?.trim() || `지문 ${draft.passageOrder + 1}`).slice(
        0,
        200,
      );

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
          },
          select: { id: true },
        });

        await tx.extractionM1PassageDraft.update({
          where: { id: draft.id },
          data: {
            savedPassageId: created.id,
            reviewStatus: "COMMITTED",
            confirmedAt: new Date(),
          },
        });

        return created;
      });

      outcomes.push({
        draftId: draft.id,
        status: "promoted",
        passageId: passage.id,
      });
    } catch (err) {
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
