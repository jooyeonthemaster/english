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

function jsonRecord(value: Prisma.JsonValue | null): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function previewKeyFromMetadata(metadata: Prisma.JsonValue | null): string | null {
  const record = jsonRecord(metadata);
  const key = record?.previewImageUrl;
  return typeof key === "string" && key.trim().length > 0 ? key : null;
}

async function signedPreviewUrlForKeys(keys: string[]): Promise<string | null> {
  const uniqueKeys = Array.from(new Set(keys.filter((key) => key.trim())));
  for (const key of uniqueKeys) {
    try {
      try {
        return await createSignedDownloadUrl(key, 60 * 60, {
          transform: { width: 320, resize: "contain", quality: 70 },
        });
      } catch {
        return await createSignedDownloadUrl(key, 60 * 60);
      }
    } catch {
      // Try the next candidate if this object is missing/stale.
    }
  }
  return null;
}

export async function handleListJobs(req: NextRequest) {
  const staff = await requireStaff();
  if (staff instanceof NextResponse) return staff;

  const limit = Math.min(
    200,
    Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 20)),
  );
  const includeThumbnails =
    req.nextUrl.searchParams.get("thumbnails") !== "0";
  // 과목 스코프 — 잡 생성 시 metadata.subject 에 기록된 과목("KOREAN") 기준.
  // 기본(파라미터 없음)=영어 표면: 국어 잡 제외 / subject=KOREAN=국어 잡만.
  // 응답이 metadata 를 제거하므로(아래 publicJob) 클라이언트 필터는 원천
  // 불가 — 반드시 서버에서 거른다. 역사적 영어 잡은 metadata 가 NULL 이거나
  // subject 키 자체가 없으므로, NULL 을 탈락시키는 `<>` 비교 대신
  // IS DISTINCT FROM 으로 걸러 영어 잡이 절대 빠지지 않게 한다.
  const subjectScope =
    req.nextUrl.searchParams.get("subject") === "KOREAN" ? "KOREAN" : null;

  // Stale cleanup runs globally in the 5-min extraction-reaper — no need to run
  // it on this polled list GET. (See memory: project_vercel_egress_aijobs_polling.)
  // 과목 스코프는 Prisma JSON path 필터가 키 부재/NULL 행을 탈락시키는 함정이
  // 있어 raw 술어로 id 를 선별한 뒤, 본 조회는 기존 select 형태 그대로 받는다.
  const scopedIdRows = await prisma.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`
      SELECT j.id
      FROM "extraction_jobs" j
      WHERE j."academyId" = ${staff.academyId}
        AND j."deletedAt" IS NULL
        AND ${
          subjectScope === "KOREAN"
            ? Prisma.sql`j.metadata->>'subject' = 'KOREAN'`
            : Prisma.sql`j.metadata->>'subject' IS DISTINCT FROM 'KOREAN'`
        }
      ORDER BY j."createdAt" DESC
      LIMIT ${limit}
    `,
  );
  const scopedIds = scopedIdRows.map((row) => row.id);
  const jobs =
    scopedIds.length === 0
      ? []
      : await prisma.extractionJob.findMany({
          where: {
            id: { in: scopedIds },
            academyId: staff.academyId,
            deletedAt: null,
          },
          orderBy: { createdAt: "desc" },
          take: limit,
          select: {
            id: true,
            sourceType: true,
            mode: true,
            sourceMaterialId: true,
            originalFileName: true,
            displayName: true,
            metadata: true,
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
  const fallbackPageKeyByJob = new Map<string, string>();
  for (const p of firstPages) {
    if (p.imageUrl) fallbackPageKeyByJob.set(p.jobId, p.imageUrl);
  }
  const signedEntries = includeThumbnails
    ? await Promise.all(
        jobs.map(async (job) => {
          const keys = [
            previewKeyFromMetadata(job.metadata),
            fallbackPageKeyByJob.get(job.id),
          ].filter((key): key is string => Boolean(key));
          return [job.id, await signedPreviewUrlForKeys(keys)] as const;
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
      const publicJob = { ...job, metadata: undefined };
      const counts =
        job.mode === "PASSAGE_ONLY"
          ? (m1CountsByJob.get(job.id) ?? countsByJob.get(job.id))
          : countsByJob.get(job.id);
      return {
        ...publicJob,
        // metadata.subject 파생 필드 — metadata 자체는 응답에서 제거하므로,
        // 소비처(작업 드로어 등)가 과목을 알 수 있게 subject 만 노출한다.
        subject:
          jsonRecord(job.metadata)?.subject === "KOREAN"
            ? ("KOREAN" as const)
            : null,
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
