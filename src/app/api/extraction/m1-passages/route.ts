import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/extraction/api-utils";
import { isM1DraftVisible } from "@/lib/extraction/m1-draft-visibility";
import { normalizeForDup } from "@/lib/duplicate-detection";

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

function parseIdList(value: string | null): string[] {
  if (!value) return [];
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    decoded = value;
  }
  return Array.from(
    new Set(
      decoded
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ).slice(0, 100);
}

type DraftForAnalysisStatus = {
  id: string;
  savedPassageId: string | null;
  rawText: string;
  restoredText?: string | null;
  teacherText: string;
};
type SavedPassageAnalysis = {
  id: string;
  createdAt: Date;
  analysis: { id: string } | null;
};

function getDraftAnalysisKey(draft: DraftForAnalysisStatus): string {
  return normalizeForDup(
    draft.teacherText?.trim() ||
      draft.restoredText?.trim() ||
      draft.rawText?.trim() ||
      "",
  );
}

function preferPassageMatch(
  current: SavedPassageAnalysis | undefined,
  next: SavedPassageAnalysis,
): SavedPassageAnalysis {
  if (!current) return next;
  if (!current.analysis && next.analysis) return next;
  if (!!current.analysis === !!next.analysis && next.createdAt > current.createdAt) {
    return next;
  }
  return current;
}

async function getSavedPassageAnalysisByDraftId(
  academyId: string,
  drafts: DraftForAnalysisStatus[],
): Promise<Map<string, SavedPassageAnalysis>> {
  const savedPassageIds = Array.from(
    new Set(drafts.map((d) => d.savedPassageId).filter(Boolean)),
  ) as string[];
  const matchByDraftId = new Map<string, SavedPassageAnalysis>();

  if (savedPassageIds.length > 0) {
    const linkedPassages = await prisma.passage.findMany({
      where: {
        academyId,
        id: { in: savedPassageIds },
      },
      select: {
        id: true,
        createdAt: true,
        analysis: { select: { id: true } },
      },
    });
    const linkedById = new Map(linkedPassages.map((p) => [p.id, p]));
    for (const draft of drafts) {
      if (!draft.savedPassageId) continue;
      const linked = linkedById.get(draft.savedPassageId);
      if (linked) matchByDraftId.set(draft.id, linked);
    }
  }

  const draftKeys = new Map<string, string>();
  const keysToMatch = new Set<string>();
  for (const draft of drafts) {
    const key = getDraftAnalysisKey(draft);
    if (!key) continue;
    draftKeys.set(draft.id, key);
    keysToMatch.add(key);
  }

  if (keysToMatch.size === 0) {
    return matchByDraftId;
  }

  const passageCandidates = await prisma.passage.findMany({
    where: { academyId },
    select: {
      id: true,
      content: true,
      createdAt: true,
      analysis: { select: { id: true } },
    },
  });

  const bestPassageByContentKey = new Map<string, SavedPassageAnalysis>();
  for (const passage of passageCandidates) {
    const key = normalizeForDup(passage.content);
    if (!keysToMatch.has(key)) continue;
    bestPassageByContentKey.set(
      key,
      preferPassageMatch(bestPassageByContentKey.get(key), passage),
    );
  }

  for (const draft of drafts) {
    const key = draftKeys.get(draft.id);
    if (!key) continue;
    const contentMatch = bestPassageByContentKey.get(key);
    if (!contentMatch) continue;
    matchByDraftId.set(
      draft.id,
      preferPassageMatch(matchByDraftId.get(draft.id), contentMatch),
    );
  }

  return matchByDraftId;
}

function withDraftAnalysisStatus<T extends DraftForAnalysisStatus>(
  draft: T,
  savedPassageAnalysisByDraftId: Map<string, SavedPassageAnalysis>,
) {
  const savedPassage = savedPassageAnalysisByDraftId.get(draft.id) ?? null;
  const analysisStatus = savedPassage?.analysis ? "analyzed" : "not_analyzed";

  return {
    ...draft,
    savedPassageId: draft.savedPassageId ?? savedPassage?.id ?? null,
    analysisStatus,
    savedPassageAnalysisId: savedPassage?.analysis?.id ?? null,
  };
}

export async function GET(req: NextRequest) {
  const staff = await requireStaff();
  if (staff instanceof NextResponse) return staff;

  const limit = Math.min(
    300,
    Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 200)),
  );
  const jobId = req.nextUrl.searchParams.get("jobId");
  // Fetch the draft behind a committed Passage (생성 페이지 "지문 전체 보기").
  const savedPassageId = req.nextUrl.searchParams.get("savedPassageId");
  const draftIds = parseIdList(req.nextUrl.searchParams.get("draftIds"));
  const view = req.nextUrl.searchParams.get("view");
  const cursor = decodeListCursor(req.nextUrl.searchParams.get("cursor"));

  if (view === "list") {
    const cursorDate = cursor ? new Date(cursor.jobCreatedAt) : null;
    const drafts = await prisma.extractionM1PassageDraft.findMany({
      where: {
        ...(draftIds.length > 0 ? { id: { in: draftIds } } : {}),
        ...(jobId ? { jobId } : {}),
        ...(savedPassageId ? { savedPassageId } : {}),
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
            sourceType: true,
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

    const savedPassageAnalysisByDraftId = await getSavedPassageAnalysisByDraftId(
      staff.academyId,
      visibleDrafts,
    );

    const enriched = visibleDrafts.map((d) => ({
      ...withDraftAnalysisStatus(d, savedPassageAnalysisByDraftId),
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
      ...(draftIds.length > 0 ? { id: { in: draftIds } } : {}),
      ...(jobId ? { jobId } : {}),
      ...(savedPassageId ? { savedPassageId } : {}),
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
          sourceType: true,
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

  const savedPassageAnalysisByDraftId = await getSavedPassageAnalysisByDraftId(
    staff.academyId,
    visibleDrafts,
  );

  const enriched = visibleDrafts.map((d) => ({
    ...withDraftAnalysisStatus(d, savedPassageAnalysisByDraftId),
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
