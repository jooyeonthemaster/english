import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { errorResponse, requireStaff } from "@/lib/extraction/api-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const deleteManySchema = z.object({
  draftIds: z.array(z.string().min(1)).min(1).max(500),
});

export async function POST(req: NextRequest) {
  const staff = await requireStaff();
  if (staff instanceof NextResponse) return staff;

  const parsed = deleteManySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return errorResponse(
      "INVALID_PAYLOAD",
      "삭제 요청이 올바르지 않습니다.",
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
    select: {
      id: true,
      jobId: true,
      passageOrder: true,
      title: true,
      job: {
        select: {
          displayName: true,
          originalFileName: true,
        },
      },
    },
  });
  const draftIds = drafts.map((draft) => draft.id);
  if (draftIds.length === 0) {
    return NextResponse.json({
      requested: parsed.data.draftIds.length,
      deleted: 0,
    });
  }

  const [, result] = await prisma.$transaction([
    prisma.extractionAuditLog.createMany({
      data: drafts.map((draft) => ({
        academyId: staff.academyId,
        actorStaffId: staff.id,
        action: "M1_DRAFT_BULK_DELETE",
        targetType: "EXTRACTION_M1_PASSAGE_DRAFT",
        targetId: draft.id,
        targetLabel:
          draft.title || draft.job.displayName || draft.job.originalFileName,
        metadata: {
          jobId: draft.jobId,
          passageOrder: draft.passageOrder,
          requestedCount: parsed.data.draftIds.length,
        },
      })),
    }),
    prisma.extractionM1PassageDraft.updateMany({
      where: {
        id: { in: draftIds },
        deletedAt: null,
        job: { academyId: staff.academyId, deletedAt: null },
      },
      data: {
        deletedAt: new Date(),
        deletedById: staff.id,
      },
    }),
  ]);

  return NextResponse.json({
    requested: parsed.data.draftIds.length,
    deleted: result.count,
  });
}
