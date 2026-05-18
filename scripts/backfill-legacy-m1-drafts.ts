// One-shot backfill for legacy PASSAGE_ONLY extraction jobs.
//
// Older extraction runs stored passage results in `extraction_results` before
// the M1 draft review table became the source for 자료 관리. This script
// materialises those legacy results into `extraction_m1_passage_drafts`.
//
// Dry run:
//   npx tsx scripts/backfill-legacy-m1-drafts.ts
//
// Apply:
//   npx tsx scripts/backfill-legacy-m1-drafts.ts --apply
//
// Optional single job:
//   npx tsx scripts/backfill-legacy-m1-drafts.ts --jobId=<id> --apply

import * as nextEnv from "@next/env";
import { Prisma, PrismaClient } from "@prisma/client";

nextEnv.loadEnvConfig(process.cwd());

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const jobIdArg = process.argv
  .find((arg) => arg.startsWith("--jobId="))
  ?.slice("--jobId=".length);

const MIN_CONTENT_LENGTH = 40;

function toReviewStatus(status: string): string {
  if (status === "SAVED") return "COMMITTED";
  if (status === "REVIEWED") return "REVIEWED";
  return "DRAFT";
}

async function main() {
  const jobs = await prisma.extractionJob.findMany({
    where: {
      ...(jobIdArg ? { id: jobIdArg } : {}),
      mode: "PASSAGE_ONLY",
      deletedAt: null,
      m1PassageDrafts: { none: {} },
      results: { some: {} },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      academyId: true,
      sourceMaterialId: true,
      originalFileName: true,
      displayName: true,
      createdAt: true,
      results: {
        where: { status: { in: ["DRAFT", "REVIEWED", "SAVED"] } },
        orderBy: { passageOrder: "asc" },
        select: {
          id: true,
          passageOrder: true,
          sourcePageIndex: true,
          title: true,
          content: true,
          meta: true,
          confidence: true,
          status: true,
          savedPassageId: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  let candidateJobs = 0;
  let candidateDrafts = 0;
  let createdDrafts = 0;

  for (const job of jobs) {
    const rows = job.results
      .filter((result) => result.content.trim().length >= MIN_CONTENT_LENGTH)
      .map((result) => ({
        jobId: job.id,
        sourceMaterialId: job.sourceMaterialId,
        passageOrder: result.passageOrder,
        sourcePageIndex: result.sourcePageIndex,
        title: result.title,
        rawText: result.content,
        restoredText: result.content,
        teacherText: result.content,
        restorationStatus: "RESTORED",
        reviewStatus: toReviewStatus(result.status),
        confidence: result.confidence,
        savedPassageId: result.savedPassageId,
        confirmedAt: result.status === "SAVED" ? result.updatedAt : null,
        metadata: {
          backfilledFrom: "extraction_results",
          legacyResultId: result.id,
          legacyStatus: result.status,
          legacyMeta: result.meta,
        } satisfies Prisma.InputJsonValue,
      }));

    if (rows.length === 0) continue;

    candidateJobs++;
    candidateDrafts += rows.length;

    const label = job.displayName || job.originalFileName || job.id;
    console.log(
      `${APPLY ? "backfill" : "dry-run"} ${job.id} (${label}) -> ${rows.length} drafts`,
    );

    if (!APPLY) continue;

    const result = await prisma.extractionM1PassageDraft.createMany({
      data: rows,
      skipDuplicates: true,
    });
    createdDrafts += result.count;
  }

  console.log(
    JSON.stringify(
      {
        mode: APPLY ? "apply" : "dry-run",
        candidateJobs,
        candidateDrafts,
        createdDrafts,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
