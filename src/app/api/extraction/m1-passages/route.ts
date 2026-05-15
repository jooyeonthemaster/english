import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/extraction/api-utils";
import { isM1DraftVisible } from "@/lib/extraction/m1-draft-visibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VISIBLE_M1_DRAFT_STATUSES = ["DRAFT", "REVIEWED"];

export async function GET(req: NextRequest) {
  const staff = await requireStaff();
  if (staff instanceof NextResponse) return staff;

  const limit = Math.min(
    300,
    Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 200)),
  );
  const jobId = req.nextUrl.searchParams.get("jobId");

  const drafts = await prisma.extractionM1PassageDraft.findMany({
    where: {
      ...(jobId ? { jobId } : {}),
      reviewStatus: { in: VISIBLE_M1_DRAFT_STATUSES },
      job: {
        academyId: staff.academyId,
        mode: "PASSAGE_ONLY",
      },
    },
    orderBy: [
      { job: { createdAt: "desc" } },
      { passageOrder: "asc" },
    ],
    take: limit,
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
              pageMeta: true,
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

  const visibleDrafts = drafts.filter(isM1DraftVisible);

  // Server-side merge: stamp `examPageNumber` (booklet's own page number)
  // onto each job's pages so the review UI can show "시험지 7쪽" instead of
  // "input file 6번째". Finalize stamps `examMeta` onto the first item per
  // page (and onto EXAM_META blocks when present), so we pull those items
  // in one query per response, build a {jobId, pageIndex} → pageNumber
  // map, and merge.
  const uniqueJobIds = Array.from(new Set(visibleDrafts.map((d) => d.jobId)));
  type ExamMetaShape = { pageNumber?: number | null };
  const examPageNumberByJobPageIndex = new Map<string, number>();
  if (uniqueJobIds.length > 0) {
    const itemsWithExamMeta = await prisma.extractionItem.findMany({
      where: {
        jobId: { in: uniqueJobIds },
        examMeta: { not: { equals: null as never } },
      },
      orderBy: { order: "asc" },
      select: { jobId: true, sourcePageIndex: true, examMeta: true },
    });
    for (const item of itemsWithExamMeta) {
      const meta = item.examMeta as ExamMetaShape | null;
      const pn = typeof meta?.pageNumber === "number" ? meta.pageNumber : null;
      if (pn === null) continue;
      const pIdx = item.sourcePageIndex?.[0];
      if (typeof pIdx !== "number") continue;
      const key = `${item.jobId}:${pIdx}`;
      if (!examPageNumberByJobPageIndex.has(key)) {
        examPageNumberByJobPageIndex.set(key, pn);
      }
    }
  }

  const enriched = visibleDrafts.map((d) => ({
    ...d,
    job: d.job
      ? {
          ...d.job,
          pages: d.job.pages.map((p) => ({
            ...p,
            examPageNumber:
              examPageNumberByJobPageIndex.get(`${d.jobId}:${p.pageIndex}`) ?? null,
          })),
        }
      : d.job,
  }));

  return NextResponse.json({ drafts: enriched });
}
