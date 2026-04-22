import { prisma } from "@/lib/prisma";
import type { M1CommitRequest } from "@/lib/extraction/zod-schemas";
import type { CommitSummary, JobLike } from "./types";
import { TX_OPTIONS } from "./types";
import { ensureSourceMaterial } from "./ensure-source-material";
import { createOrReusePassage } from "./create-or-reuse-passage";
import {
  ensurePassageCollection,
  attachPassagesToCollection,
} from "./collections";
import { promoteItem, markResultsSaved } from "./promote-item";

// ─── M1: PASSAGE_ONLY ───────────────────────────────────────────────────────

export async function commitPassageOnly(args: {
  jobId: string;
  academyId: string;
  createdById: string;
  job: JobLike;
  payload: M1CommitRequest;
}): Promise<CommitSummary> {
  const { jobId, academyId, createdById, job, payload } = args;

  const collectionName =
    payload.collectionName ??
    payload.sourceMaterial?.title ??
    job.originalFileName ??
    undefined;

  const result = await prisma.$transaction(async (tx) => {
    const { sourceMaterialId, resolvedSchoolId, warning } = await ensureSourceMaterial(tx, {
      jobId,
      academyId,
      createdById,
      job,
      meta: payload.sourceMaterial,
    });

    const createdPassageIds: string[] = [];
    const skippedPassageIds: string[] = [];
    const overwriteExisting = payload.overwriteExisting ?? false;

    // Create every Passage first (re-commit safe).
    for (const passage of payload.passages) {
      const outcome = await createOrReusePassage(tx, {
        academyId,
        sourceMaterialId,
        schoolId: resolvedSchoolId,
        job,
        input: passage,
        overwriteExisting,
      });
      if (outcome.skipped) {
        skippedPassageIds.push(outcome.row.id);
      } else {
        createdPassageIds.push(outcome.row.id);
      }

      if (passage.sourceItemId) {
        await promoteItem(tx, {
          itemId: passage.sourceItemId,
          academyId,
          urn: `Passage:${outcome.row.id}`,
        });
      }
    }

    // Bucket them into a PassageCollection for discoverability.
    const collectionId = await ensurePassageCollection(tx, {
      academyId,
      requestedId: payload.collectionId,
      name: collectionName,
      originalFileName: job.originalFileName,
    });

    if (collectionId) {
      await attachPassagesToCollection(tx, collectionId, [
        ...createdPassageIds,
        ...skippedPassageIds,
      ]);
    }

    await markResultsSaved(tx, jobId);

    return {
      sourceMaterialId,
      warning,
      createdPassageIds,
      skippedPassageIds,
      collectionId,
    };
  }, TX_OPTIONS);

  return {
    createdPassageIds: result.createdPassageIds,
    createdQuestionIds: [],
    createdBundleIds: [],
    createdExamId: null,
    sourceMaterialId: result.sourceMaterialId,
    collectionId: result.collectionId,
    examCollectionId: null,
    skippedPassageIds: result.skippedPassageIds,
    skippedQuestionIds: [],
    ...(result.warning ? { warning: result.warning } : {}),
  };
}
