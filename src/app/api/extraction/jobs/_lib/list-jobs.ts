// ============================================================================
// GET /api/extraction/jobs — list extraction jobs for the current academy,
// most recent first. Returns per-job draft/saved/result counts and first-page
// thumbnails for the task-queue UI.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { requireStaff } from "@/lib/extraction/api-utils";
import { prisma } from "@/lib/prisma";
import { createSignedDownloadUrl } from "@/lib/supabase-storage";

import {
  VISIBLE_M1_DRAFT_STATUSES,
  hasM1DraftPipelineError,
} from "./helpers";

export async function handleListJobs(req: NextRequest) {
  const staff = await requireStaff();
  if (staff instanceof NextResponse) return staff;

  const limit = Math.min(
    200,
    Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 20)),
  );
  const includeThumbnails =
    req.nextUrl.searchParams.get("thumbnails") !== "0";

  const jobs = await prisma.extractionJob.findMany({
    where: { academyId: staff.academyId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      sourceType: true,
      mode: true,
      sourceMaterialId: true,
      originalFileName: true,
      displayName: true,
      status: true,
      totalPages: true,
      successPages: true,
      failedPages: true,
      pendingPages: true,
      creditsConsumed: true,
      creditsRefunded: true,
      errorSummary: true,
      createdAt: true,
      startedAt: true,
      completedAt: true,
    },
  });

  const jobIds = jobs.map((job) => job.id);
  const resultCounts =
    jobIds.length > 0
      ? await prisma.extractionResult.groupBy({
          by: ["jobId", "status"],
          where: { jobId: { in: jobIds } },
          _count: { _all: true },
        })
      : [];
  // m1DraftCounts must mirror `isM1DraftVisible` exactly so the task-queue
  // drawer and the 자료 관리 card grid never disagree. Prisma's `groupBy`
  // can't combine the `restorationStatus`/`rawText.length`/`metadata.reason`
  // gate that drives client-side visibility, so we drop to raw SQL — same
  // rules transcribed into Postgres predicates. Keep this WHERE clause in
  // sync with `src/lib/extraction/m1-draft-visibility.ts`.
  const m1DraftCounts =
    jobIds.length > 0
      ? await prisma.$queryRaw<
          Array<{ jobId: string; reviewStatus: string; cnt: bigint }>
        >(
          Prisma.sql`
            SELECT
              d."jobId"        AS "jobId",
              d."reviewStatus" AS "reviewStatus",
              COUNT(*)::bigint AS cnt
            FROM "extraction_m1_passage_drafts" d
            WHERE d."jobId" IN (${Prisma.join(jobIds)})
              AND d."deletedAt" IS NULL
              AND d."reviewStatus" IN (${Prisma.join(VISIBLE_M1_DRAFT_STATUSES)})
              AND (
                d."restorationStatus" != 'NO_RESTORATION_NEEDED'
                OR (
                  LENGTH(d."rawText") >= 400
                  AND (
                    d.metadata->>'reason' IS NULL
                    OR d.metadata->>'reason' NOT LIKE 'no_passage_body%'
                  )
                )
              )
            GROUP BY d."jobId", d."reviewStatus"
          `,
        )
      : [];
  const countsByJob = new Map<
    string,
    { draftResultCount: number; savedResultCount: number; resultCount: number }
  >();
  for (const row of resultCounts) {
    const current =
      countsByJob.get(row.jobId) ??
      { draftResultCount: 0, savedResultCount: 0, resultCount: 0 };
    current.resultCount += row._count._all;
    if (row.status === "DRAFT" || row.status === "REVIEWED") {
      current.draftResultCount += row._count._all;
    }
    if (row.status === "SAVED") {
      current.savedResultCount += row._count._all;
    }
    countsByJob.set(row.jobId, current);
  }
  const m1CountsByJob = new Map<
    string,
    { draftResultCount: number; savedResultCount: number; resultCount: number }
  >();
  for (const row of m1DraftCounts) {
    const current =
      m1CountsByJob.get(row.jobId) ??
      { draftResultCount: 0, savedResultCount: 0, resultCount: 0 };
    // raw SQL returns counts as bigint — coerce once on the way in.
    const count = Number(row.cnt);
    current.resultCount += count;
    if (row.reviewStatus === "DRAFT" || row.reviewStatus === "REVIEWED") {
      current.draftResultCount += count;
    }
    if (row.reviewStatus === "SAVED" || row.reviewStatus === "COMMITTED") {
      current.savedResultCount += count;
    }
    m1CountsByJob.set(row.jobId, current);
  }

  // First-page thumbnail per job — used by inline task lists / drawer cards
  // to show a preview without an extra round-trip. Signed URLs expire in 1h,
  // which is comfortably longer than the 10s client polling interval.
  const firstPages =
    includeThumbnails && jobIds.length > 0
      ? await prisma.extractionPage.findMany({
          where: { jobId: { in: jobIds }, pageIndex: 0 },
          select: { jobId: true, imageUrl: true },
        })
      : [];
  const firstPageKeyByJob = new Map<string, string>();
  for (const p of firstPages) {
    if (p.imageUrl) firstPageKeyByJob.set(p.jobId, p.imageUrl);
  }
  const signedEntries = includeThumbnails
    ? await Promise.all(
        jobIds.map(async (id) => {
          const key = firstPageKeyByJob.get(id);
          if (!key) return [id, null] as const;
          try {
            // Server-side resize: 320px long edge is plenty for a 220px card
            // thumbnail at 2x DPR. Cuts payload from ~MB-scale OCR scans to
            // ~30-60KB JPEGs, eliminating the slow page-nav image load.
            const url = await createSignedDownloadUrl(key, 60 * 60, {
              transform: { width: 320, resize: "contain", quality: 70 },
            });
            return [id, url] as const;
          } catch {
            return [id, null] as const;
          }
        }),
      )
    : [];
  const firstPageUrlByJob = new Map(signedEntries);

  // Every PASSAGE_ONLY job stays visible — including COMPLETED rows
  // whose grouping produced zero drafts (pure-passage PDFs, single-photo
  // uploads, OCR-failed sheets, etc). Teachers need to see the row to
  // diagnose / retry / delete. The earlier filter pruned anything with
  // 0 drafts, which silently hid every "I uploaded a textbook page with
  // no problem stems" case. `limit=50` keeps the list bounded.
  const visibleJobs = jobs;

  return NextResponse.json({
    jobs: visibleJobs.map((job) => {
      const counts =
        job.mode === "PASSAGE_ONLY"
          ? (m1CountsByJob.get(job.id) ?? countsByJob.get(job.id))
          : countsByJob.get(job.id);
      return {
        ...job,
        m1DraftPipelineError: hasM1DraftPipelineError(job.errorSummary),
        firstPageImageUrl: firstPageUrlByJob.get(job.id) ?? null,
        ...(counts ?? {
          draftResultCount: 0,
          savedResultCount: 0,
          resultCount: 0,
        }),
      };
    }),
  });
}
