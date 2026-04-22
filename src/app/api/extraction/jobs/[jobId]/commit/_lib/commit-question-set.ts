import { prisma } from "@/lib/prisma";
import type { M2CommitRequest } from "@/lib/extraction/zod-schemas";
import type { CommitSummary, JobLike } from "./types";
import { TX_OPTIONS } from "./types";
import { ensureSourceMaterial } from "./ensure-source-material";
import { createOrReusePassage } from "./create-or-reuse-passage";
import { createOrReuseQuestion } from "./create-or-reuse-question";
import {
  ensurePassageCollection,
  attachPassagesToCollection,
} from "./collections";
import { promoteItem, markResultsSaved } from "./promote-item";

// ─── M2: QUESTION_SET ───────────────────────────────────────────────────────

export async function commitQuestionSet(args: {
  jobId: string;
  academyId: string;
  createdById: string;
  job: JobLike;
  payload: M2CommitRequest;
}): Promise<CommitSummary> {
  const { jobId, academyId, createdById, job, payload } = args;
  const overwriteExisting = payload.overwriteExisting === true;

  const result = await prisma.$transaction(async (tx) => {
    const { sourceMaterialId, resolvedSchoolId, warning } = await ensureSourceMaterial(tx, {
      jobId,
      academyId,
      createdById,
      job,
      meta: payload.sourceMaterial,
    });

    // Passages first — build a map so questions can resolve their parent.
    const passageByOrder = new Map<number, string>();
    const createdPassageIds: string[] = [];
    const skippedPassageIds: string[] = [];
    for (const passage of payload.passages) {
      const outcome = await createOrReusePassage(tx, {
        academyId,
        sourceMaterialId,
        schoolId: resolvedSchoolId,
        job,
        input: passage,
        overwriteExisting,
      });
      passageByOrder.set(passage.passageOrder, outcome.row.id);
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

    // Questions — each may link to a passage via passageOrder.
    const createdQuestionIds: string[] = [];
    const skippedQuestionIds: string[] = [];
    for (const q of payload.questions) {
      const passageId =
        q.passageOrder !== undefined ? passageByOrder.get(q.passageOrder) : undefined;

      const outcome = await createOrReuseQuestion(tx, {
        academyId,
        sourceMaterialId,
        passageId: passageId ?? null,
        bundleId: null,
        input: q,
        overwriteExisting,
      });
      if (outcome.skipped) {
        skippedQuestionIds.push(outcome.row.id);
      } else {
        createdQuestionIds.push(outcome.row.id);
      }

      if (q.explanation && q.explanation.trim().length > 0) {
        await tx.questionExplanation.upsert({
          where: { questionId: outcome.row.id },
          update: { content: q.explanation, aiGenerated: false },
          create: {
            questionId: outcome.row.id,
            content: q.explanation,
            aiGenerated: false,
          },
        });
      }

      if (q.sourceItemIds && q.sourceItemIds.length > 0) {
        for (const itemId of q.sourceItemIds) {
          await promoteItem(tx, {
            itemId,
            academyId,
            urn: `Question:${outcome.row.id}`,
          });
        }
      }
    }

    const collectionId = await ensurePassageCollection(tx, {
      academyId,
      requestedId: undefined,
      name: payload.sourceMaterial?.title ?? job.originalFileName ?? undefined,
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
      createdQuestionIds,
      skippedQuestionIds,
      collectionId,
    };
  }, TX_OPTIONS);

  return {
    createdPassageIds: result.createdPassageIds,
    createdQuestionIds: result.createdQuestionIds,
    createdBundleIds: [],
    createdExamId: null,
    sourceMaterialId: result.sourceMaterialId,
    collectionId: result.collectionId,
    examCollectionId: null,
    skippedPassageIds: result.skippedPassageIds,
    skippedQuestionIds: result.skippedQuestionIds,
    ...(result.warning ? { warning: result.warning } : {}),
  };
}
