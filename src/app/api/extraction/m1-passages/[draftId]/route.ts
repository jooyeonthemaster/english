import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { errorResponse, requireStaff } from "@/lib/extraction/api-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ draftId: string }>;
}

const updateDraftSchema = z.object({
  title: z.string().trim().max(200).nullable().optional(),
  teacherText: z.string().trim().min(1),
});

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { draftId } = await ctx.params;
  const staff = await requireStaff();
  if (staff instanceof NextResponse) return staff;

  const draft = await prisma.extractionM1PassageDraft.findFirst({
    where: {
      id: draftId,
      deletedAt: null,
      job: {
        academyId: staff.academyId,
        mode: "PASSAGE_ONLY",
        deletedAt: null,
      },
    },
    include: {
      job: {
        select: {
          id: true,
          originalFileName: true,
          displayName: true,
          totalPages: true,
          createdAt: true,
          completedAt: true,
          status: true,
          pages: {
            orderBy: { pageIndex: "asc" },
            select: {
              pageIndex: true,
              sourceFileName: true,
            },
          },
        },
      },
      sourceMaterial: {
        select: { id: true, customLabel: true },
      },
      changes: {
        orderBy: [{ sentenceOrder: "asc" }, { createdAt: "asc" }],
      },
      sourceMatches: {
        orderBy: [{ selected: "desc" }, { confidence: "desc" }],
      },
    },
  });
  if (!draft) {
    return errorResponse(
      "NOT_FOUND",
      "지문 추출 결과를 찾을 수 없습니다.",
      404,
    );
  }

  type ExamMetaShape = { pageNumber?: number | null };
  // Prisma's JSON-null filter needs the explicit `Prisma.DbNull` sentinel —
  // `{ not: { equals: null } }` on a JSONB column compiles to a runtime
  // validation error in the client. Without this, every detail GET threw
  // and the manage UI showed "자료 상세를 불러오지 못했습니다." despite
  // the optimistic draft rendering fine from the list payload.
  const itemsWithExamMeta = await prisma.extractionItem.findMany({
    where: {
      jobId: draft.jobId,
      examMeta: { not: Prisma.DbNull },
    },
    orderBy: { order: "asc" },
    select: { sourcePageIndex: true, examMeta: true },
  });
  const examPageNumberByPageIndex = new Map<number, number>();
  for (const item of itemsWithExamMeta) {
    const meta = item.examMeta as ExamMetaShape | null;
    const pn = typeof meta?.pageNumber === "number" ? meta.pageNumber : null;
    if (pn === null) continue;
    const pIdx = item.sourcePageIndex?.[0];
    if (typeof pIdx !== "number") continue;
    if (!examPageNumberByPageIndex.has(pIdx)) {
      examPageNumberByPageIndex.set(pIdx, pn);
    }
  }

  return NextResponse.json({
    draft: {
      ...draft,
      job: {
        ...draft.job,
        pages: draft.job.pages.map((p) => ({
          ...p,
          examPageNumber: examPageNumberByPageIndex.get(p.pageIndex) ?? null,
        })),
      },
    },
  });
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const { draftId } = await ctx.params;
  const staff = await requireStaff();
  if (staff instanceof NextResponse) return staff;

  const parsed = updateDraftSchema.safeParse(
    await req.json().catch(() => ({})),
  );
  if (!parsed.success) {
    return errorResponse(
      "INVALID_PAYLOAD",
      "수정할 지문 내용이 올바르지 않습니다.",
      400,
      parsed.error.issues,
    );
  }

  const draft = await prisma.extractionM1PassageDraft.findFirst({
    where: {
      id: draftId,
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
  if (!draft) {
    return errorResponse(
      "NOT_FOUND",
      "지문 추출 결과를 찾을 수 없습니다.",
      404,
    );
  }

  const updated = await prisma.extractionM1PassageDraft.update({
    where: { id: draftId },
    data: {
      title: parsed.data.title ?? null,
      teacherText: parsed.data.teacherText,
      reviewStatus: "REVIEWED",
    },
    include: {
      changes: {
        orderBy: [{ sentenceOrder: "asc" }, { createdAt: "asc" }],
      },
      sourceMatches: {
        orderBy: [{ selected: "desc" }, { confidence: "desc" }],
      },
    },
  });

  return NextResponse.json({ draft: updated });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
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
  if (!draft) {
    return errorResponse(
      "NOT_FOUND",
      "지문 추출 결과를 찾을 수 없습니다.",
      404,
    );
  }

  await prisma.$transaction([
    prisma.extractionAuditLog.create({
      data: {
        academyId: staff.academyId,
        actorStaffId: staff.id,
        action: "M1_DRAFT_DELETE",
        targetType: "EXTRACTION_M1_PASSAGE_DRAFT",
        targetId: draft.id,
        targetLabel:
          draft.title || draft.job.displayName || draft.job.originalFileName,
        metadata: {
          jobId: draft.jobId,
          passageOrder: draft.passageOrder,
        },
      },
    }),
    prisma.extractionM1PassageDraft.update({
      where: { id: draftId },
      data: {
        deletedAt: new Date(),
        deletedById: staff.id,
      },
    }),
  ]);

  return NextResponse.json({ draftId, deleted: true });
}
