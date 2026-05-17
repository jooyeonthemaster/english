import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
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
      job: {
        academyId: staff.academyId,
        mode: "PASSAGE_ONLY",
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
  const itemsWithExamMeta = await prisma.extractionItem.findMany({
    where: {
      jobId: draft.jobId,
      examMeta: { not: { equals: null as never } },
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
      job: { academyId: staff.academyId },
    },
    select: { id: true },
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
      job: { academyId: staff.academyId },
    },
    select: { id: true },
  });
  if (!draft) {
    return errorResponse(
      "NOT_FOUND",
      "지문 추출 결과를 찾을 수 없습니다.",
      404,
    );
  }

  await prisma.extractionM1PassageDraft.delete({ where: { id: draftId } });

  return NextResponse.json({ draftId, deleted: true });
}
