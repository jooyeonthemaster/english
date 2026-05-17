import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { errorResponse, requireStaff } from "@/lib/extraction/api-utils";
import { buildM1SourceMatchRows } from "@/lib/extraction/m1-draft-persistence";
import { restoreM1Passage } from "@/trigger/_lib/m1-passage-restoration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 240;

interface RouteContext {
  params: Promise<{ draftId: string }>;
}

export async function POST(_req: Request, ctx: RouteContext) {
  const { draftId } = await ctx.params;
  const staff = await requireStaff();
  if (staff instanceof NextResponse) return staff;

  const draft = await prisma.extractionM1PassageDraft.findFirst({
    where: {
      id: draftId,
      deletedAt: null,
      job: { academyId: staff.academyId, deletedAt: null },
    },
    select: {
      id: true,
      rawText: true,
      sourcePageIndex: true,
    },
  });
  if (!draft) {
    return errorResponse("NOT_FOUND", "지문 추출 결과를 찾을 수 없습니다.", 404);
  }

  try {
    const restoration = await restoreM1Passage({
      academyId: staff.academyId,
      rawText: draft.rawText,
      questions: [],
    });

    const changeRows: Prisma.ExtractionM1PassageDraftChangeCreateManyInput[] =
      restoration.changes.map((change) => ({
        passageDraftId: draft.id,
        sentenceOrder: change.sentenceOrder ?? null,
        before: change.before,
        after: change.after,
        changeType: change.changeType ?? null,
        reason: change.reason ?? null,
        confidence: change.confidence ?? null,
        sourcePageIndex: draft.sourcePageIndex,
      }));
    const sourceMatchRows = buildM1SourceMatchRows({
      passageDraftId: draft.id,
      sourceMatches: restoration.sourceMatches,
    });

    const updated = await prisma.$transaction(
      async (tx) => {
        await tx.extractionM1PassageDraftChange.deleteMany({
          where: { passageDraftId: draft.id },
        });
        await tx.extractionM1PassageSourceMatch.deleteMany({
          where: { passageDraftId: draft.id },
        });
        await tx.extractionM1PassageDraft.update({
          where: { id: draft.id },
          data: {
            restoredText: restoration.restoredText,
            teacherText: restoration.restoredText,
            restorationStatus: restoration.status,
            reviewStatus: "DRAFT",
            confidence: restoration.confidence,
            warnings:
              restoration.warnings.length > 0
                ? (restoration.warnings as Prisma.InputJsonValue)
                : Prisma.JsonNull,
            metadata: restoration.metadata,
          },
        });
        if (changeRows.length > 0) {
          await tx.extractionM1PassageDraftChange.createMany({ data: changeRows });
        }
        if (sourceMatchRows.length > 0) {
          await tx.extractionM1PassageSourceMatch.createMany({
            data: sourceMatchRows,
          });
        }
        return tx.extractionM1PassageDraft.findUniqueOrThrow({
          where: { id: draft.id },
          include: {
            changes: {
              orderBy: [{ sentenceOrder: "asc" }, { createdAt: "asc" }],
            },
            sourceMatches: {
              orderBy: [{ selected: "desc" }, { confidence: "desc" }],
            },
          },
        });
      },
      { timeout: 30_000, maxWait: 10_000 },
    );

    return NextResponse.json({ draft: updated });
  } catch (err) {
    return errorResponse(
      "RERESTORE_FAILED",
      err instanceof Error ? err.message : "AI 복원을 다시 실행하지 못했습니다.",
      500,
    );
  }
}
