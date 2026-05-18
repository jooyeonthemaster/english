import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/extraction/api-utils";
import { isM1DraftVisible } from "@/lib/extraction/m1-draft-visibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VISIBLE_M1_DRAFT_STATUSES = ["DRAFT", "REVIEWED", "COMMITTED"];

interface ListCursor {
  jobCreatedAt: string;
  passageOrder: number;
  id: string;
}

function decodeListCursor(value: string | null): ListCursor | null {
  if (!value) return null;
  try {
    const decoded = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<ListCursor>;
    if (
      typeof decoded.jobCreatedAt !== "string" ||
      typeof decoded.passageOrder !== "number" ||
      typeof decoded.id !== "string"
    ) {
      return null;
    }
    return {
      jobCreatedAt: decoded.jobCreatedAt,
      passageOrder: decoded.passageOrder,
      id: decoded.id,
    };
  } catch {
    return null;
  }
}

function encodeListCursor(draft: {
  id: string;
  passageOrder: number;
  job: { createdAt: Date | string };
}): string {
  const jobCreatedAt =
    draft.job.createdAt instanceof Date
      ? draft.job.createdAt.toISOString()
      : new Date(draft.job.createdAt).toISOString();
  return Buffer.from(
    JSON.stringify({
      jobCreatedAt,
      passageOrder: draft.passageOrder,
      id: draft.id,
    } satisfies ListCursor),
    "utf8",
  ).toString("base64url");
}

export async function GET(req: NextRequest) {
  const staff = await requireStaff();
  if (staff instanceof NextResponse) return staff;

  const limit = Math.min(
    300,
    Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 200)),
  );
  const jobId = req.nextUrl.searchParams.get("jobId");
  const view = req.nextUrl.searchParams.get("view");
  const cursor = decodeListCursor(req.nextUrl.searchParams.get("cursor"));

  if (view === "list") {
    const cursorDate = cursor ? new Date(cursor.jobCreatedAt) : null;
    const drafts = await prisma.extractionM1PassageDraft.findMany({
      where: {
        ...(jobId ? { jobId } : {}),
        deletedAt: null,
        ...(cursor && cursorDate && !Number.isNaN(cursorDate.getTime())
          ? {
              OR: [
                { job: { createdAt: { lt: cursorDate } } },
                {
                  job: { createdAt: cursorDate },
                  passageOrder: { gt: cursor.passageOrder },
                },
                {
                  job: { createdAt: cursorDate },
                  passageOrder: cursor.passageOrder,
                  id: { gt: cursor.id },
                },
              ],
            }
          : {}),
        reviewStatus: { in: VISIBLE_M1_DRAFT_STATUSES },
        job: {
          academyId: staff.academyId,
          mode: "PASSAGE_ONLY",
          deletedAt: null,
        },
      },
      orderBy: [
        { job: { createdAt: "desc" } },
        { passageOrder: "asc" },
        { id: "asc" },
      ],
      take: limit + 1,
      select: {
        id: true,
        jobId: true,
        sourceMaterialId: true,
        passageOrder: true,
        sourcePageIndex: true,
        title: true,
        rawText: true,
        teacherText: true,
        restorationStatus: true,
        reviewStatus: true,
        confidence: true,
        warnings: true,
        metadata: true,
        confirmedAt: true,
        savedPassageId: true,
        createdAt: true,
        updatedAt: true,
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
        // `changes` powers the per-edit evidence panel in the detail modal —
        // each row carries the AI's reason / evidenceType / confidence the
        // teacher needs to evaluate a restoration. Source matches stay out
        // of the list payload (they're loaded lazily by the source-match
        // panel when expanded); `restoredText` is the heavy field we keep
        // empty in this view because the UI renders teacherText anyway.
        changes: {
          orderBy: [{ sentenceOrder: "asc" }, { createdAt: "asc" }],
        },
      },
    });

    const pageDrafts = drafts.slice(0, limit);
    const visibleDrafts = pageDrafts.filter(isM1DraftVisible);
    const nextCursor =
      drafts.length > limit && pageDrafts.length > 0
        ? encodeListCursor(pageDrafts[pageDrafts.length - 1])
        : null;
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
        const pn =
          typeof meta?.pageNumber === "number" ? meta.pageNumber : null;
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
      restoredText: "",
      sourceMatches: [],
      job: d.job
        ? {
            ...d.job,
            pages: d.job.pages.map((p) => ({
              ...p,
              examPageNumber:
                examPageNumberByJobPageIndex.get(`${d.jobId}:${p.pageIndex}`) ??
                null,
            })),
          }
        : d.job,
    }));

    return NextResponse.json({
      drafts: enriched,
      nextCursor,
      hasMore: nextCursor !== null,
    });
  }

  const drafts = await prisma.extractionM1PassageDraft.findMany({
    where: {
      ...(jobId ? { jobId } : {}),
      deletedAt: null,
      reviewStatus: { in: VISIBLE_M1_DRAFT_STATUSES },
      job: {
        academyId: staff.academyId,
        mode: "PASSAGE_ONLY",
        deletedAt: null,
      },
    },
    orderBy: [{ job: { createdAt: "desc" } }, { passageOrder: "asc" }],
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
              examPageNumberByJobPageIndex.get(`${d.jobId}:${p.pageIndex}`) ??
              null,
          })),
        }
      : d.job,
  }));

  return NextResponse.json({ drafts: enriched });
}
