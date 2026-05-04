import { prisma } from "@/lib/prisma";
import type { M4CommitRequest } from "@/lib/extraction/zod-schemas";
import type { CommitSummary, JobLike } from "./types";
import { CommitPayloadError, TX_OPTIONS } from "./types";
import { ensureSourceMaterial } from "./ensure-source-material";
import { createOrReusePassage } from "./create-or-reuse-passage";
import { createOrReuseQuestion } from "./create-or-reuse-question";
import {
  ensurePassageCollection,
  attachPassagesToCollection,
  ensureExamCollection,
} from "./collections";
import { promoteItem, markResultsSaved } from "./promote-item";
import { mapExamType } from "./map-exam-type";
import { validateBundlesPayload, resolveExamQuestionIds } from "./exam-helpers";

// ─── M4: FULL_EXAM ──────────────────────────────────────────────────────────

export async function commitFullExam(args: {
  jobId: string;
  academyId: string;
  createdById: string;
  job: JobLike;
  payload: M4CommitRequest;
}): Promise<CommitSummary> {
  const { jobId, academyId, createdById, job, payload } = args;
  const overwriteExisting = payload.overwriteExisting === true;

  // ── Pre-transaction payload validation ─────────────────────────────────
  // PassageBundle has @@unique([sourceMaterialId, passageId]) — so two
  // bundles with the same passageOrder would trip P2002 mid-transaction
  // and roll everything back. Catch it here with a clean 400.
  validateBundlesPayload(payload.bundles);

  const result = await prisma.$transaction(async (tx) => {
    const { sourceMaterialId, resolvedSchoolId, warning } = await ensureSourceMaterial(tx, {
      jobId,
      academyId,
      createdById,
      job,
      meta: payload.sourceMaterial,
    });

    // Clean slate for bundles on re-commit: existing bundles for this
    // SourceMaterial would collide on @@unique([sourceMaterialId, passageId])
    // when the payload re-sends the same passageOrder. Dropping them first
    // is safe because bundle identity is just (sourceMaterial, passage).
    await tx.passageBundle.deleteMany({ where: { sourceMaterialId } });

    // Passages
    const passageByOrder = new Map<number, string>();
    const createdPassageIds: string[] = [];
    const skippedPassageIds: string[] = [];
    for (const p of payload.passages) {
      const outcome = await createOrReusePassage(tx, {
        academyId,
        sourceMaterialId,
        schoolId: resolvedSchoolId,
        job,
        input: p,
        overwriteExisting,
      });
      passageByOrder.set(p.passageOrder, outcome.row.id);
      if (outcome.skipped) {
        skippedPassageIds.push(outcome.row.id);
      } else {
        createdPassageIds.push(outcome.row.id);
      }
      if (p.sourceItemId) {
        await promoteItem(tx, {
          itemId: p.sourceItemId,
          academyId,
          urn: `Passage:${outcome.row.id}`,
        });
      }
    }

    // Questions (with passage linkage; bundleId added below once bundles exist)
    const questionByOrder = new Map<number, string>();
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
      questionByOrder.set(q.questionOrder, outcome.row.id);
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

    // Track which questions have been bound to a bundle — used to build the
    // ExamQuestion list below and to detect missing question references.
    const bundledQuestionIds = new Set<string>();

    // Bundles: [32~34] groups. Optional on the payload.
    const createdBundleIds: string[] = [];
    if (payload.bundles && payload.bundles.length > 0) {
      for (const bundle of payload.bundles) {
        const passageId = passageByOrder.get(bundle.passageOrder);
        if (!passageId) {
          throw new CommitPayloadError(
            "BUNDLE_PASSAGE_MISSING",
            "묶음(bundle)이 존재하지 않는 passageOrder를 참조합니다.",
            { passageOrder: bundle.passageOrder },
          );
        }

        const createdBundle = await tx.passageBundle.create({
          data: {
            sourceMaterialId,
            passageId,
            orderInMaterial: bundle.orderInMaterial,
            sharedLabel: bundle.sharedLabel,
          },
        });
        createdBundleIds.push(createdBundle.id);

        // Resolve each questionOrder → questionId. Missing orders are a
        // client bug — fail fast with an explicit 400 instead of silently
        // filtering them out.
        const questionIds: string[] = [];
        for (const order of bundle.questionOrders) {
          const qid = questionByOrder.get(order);
          if (!qid) {
            throw new CommitPayloadError(
              "BUNDLE_QUESTION_MISSING",
              "묶음(bundle)이 존재하지 않는 questionOrder를 참조합니다.",
              { questionOrder: order, passageOrder: bundle.passageOrder },
            );
          }
          questionIds.push(qid);
          bundledQuestionIds.add(qid);
        }

        // Defense-in-depth: although `questionIds` originate from our own
        // createOrReuseQuestion (academy-scoped), we also filter by
        // `academyId` here so any future refactor that widens the source
        // of these ids cannot accidentally flip bundleId on a cross-tenant
        // Question row.
        await tx.question.updateMany({
          where: { id: { in: questionIds }, academyId },
          data: { bundleId: createdBundle.id },
        });
      }
    }

    // Exam (+ ExamQuestion rows) — optional.
    let createdExamId: string | null = null;
    let examCollectionId: string | null = null;
    if (payload.exam) {
      const exam = await tx.exam.create({
        data: {
          academyId,
          title: payload.exam.title,
          type: payload.exam.type,
          status: "DRAFT",
          grade: payload.sourceMaterial.grade,
          semester: payload.sourceMaterial.semester,
          year: payload.sourceMaterial.year,
          examType: mapExamType(payload.sourceMaterial.examType),
          duration: payload.exam.timeLimit,
          sourceMaterialId,
        },
      });
      createdExamId = exam.id;

      // Pick question order for the Exam:
      //   1. If payload.exam.questionOrders is provided → whitelist & honour it.
      //   2. Else if any bundles exist → include only bundled questions,
      //      preserving their insertion order (bundled in-order).
      //   3. Else → include every question in insertion order (legacy).
      // NOTE: Both newly-created AND reused (skipped) questions belong on
      // the Exam — skipping reuse purely protects editable columns, it does
      // not imply "exclude from the exam roster".
      const allQuestionIds = [...createdQuestionIds, ...skippedQuestionIds];
      const examQuestionIds = resolveExamQuestionIds({
        payloadExam: payload.exam,
        questionByOrder,
        createdQuestionIds: allQuestionIds,
        bundledQuestionIds,
        hasBundles: createdBundleIds.length > 0,
      });

      if (examQuestionIds.length > 0) {
        await tx.examQuestion.createMany({
          data: examQuestionIds.map((questionId, idx) => ({
            examId: exam.id,
            questionId,
            orderNum: idx,
            points: 1,
          })),
        });
      }

      // ExamCollection — group this exam for easy re-distribution.
      examCollectionId = await ensureExamCollection(tx, {
        academyId,
        name: payload.sourceMaterial.title,
      });
      if (examCollectionId) {
        const maxItem = await tx.examCollectionItem.findFirst({
          where: { collectionId: examCollectionId },
          orderBy: { orderNum: "desc" },
          select: { orderNum: true },
        });
        await tx.examCollectionItem.create({
          data: {
            collectionId: examCollectionId,
            examId: exam.id,
            orderNum: (maxItem?.orderNum ?? -1) + 1,
          },
        });
      }
    }

    const collectionId = await ensurePassageCollection(tx, {
      academyId,
      requestedId: undefined,
      name: payload.sourceMaterial.title,
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
      createdBundleIds,
      createdExamId,
      collectionId,
      examCollectionId,
    };
  }, TX_OPTIONS);

  return {
    createdPassageIds: result.createdPassageIds,
    createdQuestionIds: result.createdQuestionIds,
    createdBundleIds: result.createdBundleIds,
    createdExamId: result.createdExamId,
    sourceMaterialId: result.sourceMaterialId,
    collectionId: result.collectionId,
    examCollectionId: result.examCollectionId,
    skippedPassageIds: result.skippedPassageIds,
    skippedQuestionIds: result.skippedQuestionIds,
    ...(result.warning ? { warning: result.warning } : {}),
  };
}
