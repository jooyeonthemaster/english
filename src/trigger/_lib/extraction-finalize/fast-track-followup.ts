// ============================================================================
// "빠른 분석" / "빠른 생성" 흐름의 후속 처리.
//
// extraction-finalize 가 추출 + restoration 까지 끝낸 직후에 호출된다.
// ExtractionJob.metadata.fastTrackFollowUp 가 있으면:
//   1) 검수 단계를 건너뛰고 모든 M1 draft 를 자동 promote → Passage 생성
//   2) Passage 마다 workbench-{passage-analysis | question-generation} 잡을
//      enqueue. 한 페이지에 지문 N개가 있으면 잡 N개로 fan-out.
//   3) metadata.fastTrackFollowUp.consumedAt 을 마킹해 finalize retry 시
//      중복 실행을 막는다.
//
// 잡 enqueue 의 idempotencyKey 는 WorkbenchAiJob.id 기반이라 Trigger.dev 가
// 자체적으로 중복 실행은 막아주지만, Passage 별 중복 잡 row 가 만들어지는
// 것은 막아야 하므로 "동일 academy + passageId + domain + PENDING/PROCESSING"
// 잡이 있는지 사전 검사한다.
// ============================================================================

import { tasks, logger } from "@trigger.dev/sdk/v3";
import { createHash } from "node:crypto";

import {
  academyConcurrencyKey,
  WORKBENCH_PASSAGE_ANALYSIS_QUEUE_NAME,
  WORKBENCH_QUESTION_GENERATION_QUEUE_NAME,
} from "@/lib/concurrency-config";
import { prisma } from "@/lib/prisma";

type Flow = "PASSAGE_ANALYSIS" | "QUESTION_GENERATION";

interface FastTrackFollowUpConfig {
  flow: Flow;
  staffId: string;
  generationPlan: string;
  customPrompt?: string;
  uploadLabel?: string | null;
  consumedAt?: string;
  questionGeneration?: {
    mode: "AUTO" | "MANUAL";
    count: number;
    questionType: string | null;
    questionTypeSettings: unknown;
    difficulty: string;
  };
}

function parseFollowUp(raw: unknown): FastTrackFollowUpConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const flow = r.flow;
  if (flow !== "PASSAGE_ANALYSIS" && flow !== "QUESTION_GENERATION") {
    return null;
  }
  const staffId = typeof r.staffId === "string" ? r.staffId : null;
  if (!staffId) return null;
  const generationPlan =
    typeof r.generationPlan === "string" ? r.generationPlan : "STANDARD";

  const out: FastTrackFollowUpConfig = {
    flow,
    staffId,
    generationPlan,
    customPrompt: typeof r.customPrompt === "string" ? r.customPrompt : undefined,
    uploadLabel:
      typeof r.uploadLabel === "string"
        ? r.uploadLabel
        : r.uploadLabel === null
          ? null
          : undefined,
    consumedAt: typeof r.consumedAt === "string" ? r.consumedAt : undefined,
  };

  if (flow === "QUESTION_GENERATION") {
    const qg = r.questionGeneration;
    if (qg && typeof qg === "object") {
      const q = qg as Record<string, unknown>;
      out.questionGeneration = {
        mode: q.mode === "MANUAL" ? "MANUAL" : "AUTO",
        count:
          typeof q.count === "number" && Number.isFinite(q.count)
            ? Math.min(50, Math.max(1, Math.floor(q.count)))
            : 1,
        questionType: typeof q.questionType === "string" ? q.questionType : null,
        questionTypeSettings: q.questionTypeSettings ?? null,
        difficulty:
          typeof q.difficulty === "string" ? q.difficulty : "INTERMEDIATE",
      };
    }
  }

  return out;
}

function sha1NormalizedContent(content: string): string {
  return createHash("sha1")
    .update(content.replace(/\s+/g, " ").trim(), "utf8")
    .digest("hex");
}

interface RunFastTrackFollowUpInput {
  jobId: string;
  academyId: string;
  originalFileName: string | null;
}

interface PromotedPassage {
  draftId: string;
  passageId: string;
  title: string;
  reused: boolean;
}

export async function runFastTrackFollowUp(
  input: RunFastTrackFollowUpInput,
): Promise<{ followed: boolean; promoted: number; jobsEnqueued: number }> {
  const { jobId, academyId, originalFileName } = input;

  const job = await prisma.extractionJob.findUnique({
    where: { id: jobId },
    select: { metadata: true },
  });
  if (!job?.metadata) return { followed: false, promoted: 0, jobsEnqueued: 0 };

  const metaObject = job.metadata as Record<string, unknown>;
  const followUp = parseFollowUp(metaObject.fastTrackFollowUp);
  if (!followUp) return { followed: false, promoted: 0, jobsEnqueued: 0 };

  if (followUp.consumedAt) {
    logger.info("fast-track follow-up already consumed; skipping", {
      jobId,
      consumedAt: followUp.consumedAt,
    });
    return { followed: false, promoted: 0, jobsEnqueued: 0 };
  }

  // ── 1. Promote M1 drafts → Passage ────────────────────────────────────
  const drafts = await prisma.extractionM1PassageDraft.findMany({
    where: { jobId, deletedAt: null },
    select: {
      id: true,
      title: true,
      teacherText: true,
      passageOrder: true,
      sourceMaterialId: true,
      savedPassageId: true,
    },
    orderBy: { passageOrder: "asc" },
  });

  const sourceTag = originalFileName
    ? `fast-track:upload:${originalFileName}`
    : `fast-track:${jobId}`;

  const promoted: PromotedPassage[] = [];

  for (const draft of drafts) {
    const teacherText = draft.teacherText?.trim() ?? "";
    if (!teacherText) continue;
    const title = (
      draft.title?.trim() || `지문 ${draft.passageOrder + 1}`
    ).slice(0, 200);

    // Already promoted in a previous attempt — reuse the same passageId.
    if (draft.savedPassageId) {
      promoted.push({
        draftId: draft.id,
        passageId: draft.savedPassageId,
        title,
        reused: true,
      });
      continue;
    }

    const contentHash = sha1NormalizedContent(teacherText);

    try {
      const passage = await prisma.$transaction(async (tx) => {
        // Dedup against existing Passages within the same academy. The bulk
        // promote flow does NOT dedup (every promotion creates a new row),
        // but for fast-track we want re-uploads of the same image to land on
        // the same Passage so analysis/generation jobs don't pile up.
        const existing = await tx.passage.findFirst({
          where: { academyId, contentHash },
          select: { id: true },
        });
        const passageId =
          existing?.id ??
          (
            await tx.passage.create({
              data: {
                academyId,
                schoolId: null,
                title,
                content: teacherText,
                source: sourceTag,
                sourceMaterialId: draft.sourceMaterialId ?? null,
                contentHash,
              },
              select: { id: true },
            })
          ).id;

        await tx.extractionM1PassageDraft.update({
          where: { id: draft.id },
          data: {
            savedPassageId: passageId,
            reviewStatus: "COMMITTED",
            confirmedAt: new Date(),
          },
        });

        return { id: passageId, existed: Boolean(existing) };
      });

      promoted.push({
        draftId: draft.id,
        passageId: passage.id,
        title,
        reused: passage.existed,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("fast-track promote failed", { draftId: draft.id, message });
    }
  }

  if (promoted.length === 0) {
    logger.info("fast-track follow-up: no passages to enqueue", { jobId });
    await markConsumed(jobId, metaObject, followUp);
    return { followed: true, promoted: 0, jobsEnqueued: 0 };
  }

  // ── 2. Fan out workbench jobs (one per Passage) ───────────────────────
  let jobsEnqueued = 0;
  if (followUp.flow === "PASSAGE_ANALYSIS") {
    jobsEnqueued = await fanOutPassageAnalysis({
      academyId,
      followUp,
      passages: promoted,
      extractionJobId: jobId,
    });
  } else if (followUp.flow === "QUESTION_GENERATION") {
    jobsEnqueued = await fanOutQuestionGeneration({
      academyId,
      followUp,
      passages: promoted,
      extractionJobId: jobId,
    });
  }

  // ── 3. Mark consumed so finalize retries don't double-fire ────────────
  await markConsumed(jobId, metaObject, followUp);

  logger.info("fast-track follow-up done", {
    jobId,
    flow: followUp.flow,
    promoted: promoted.length,
    jobsEnqueued,
  });

  return { followed: true, promoted: promoted.length, jobsEnqueued };
}

async function markConsumed(
  jobId: string,
  metaObject: Record<string, unknown>,
  followUp: FastTrackFollowUpConfig,
): Promise<void> {
  await prisma.extractionJob.update({
    where: { id: jobId },
    data: {
      metadata: {
        ...metaObject,
        fastTrackFollowUp: {
          ...followUp,
          consumedAt: new Date().toISOString(),
        },
      } as any,
    },
  });
}

interface FanOutInput {
  academyId: string;
  followUp: FastTrackFollowUpConfig;
  passages: PromotedPassage[];
  extractionJobId: string;
}

async function fanOutPassageAnalysis(input: FanOutInput): Promise<number> {
  const { academyId, followUp, passages, extractionJobId } = input;
  let enqueued = 0;

  for (const p of passages) {
    const existing = await prisma.workbenchAiJob.findFirst({
      where: {
        academyId,
        domain: "PASSAGE_ANALYSIS",
        passageId: p.passageId,
        status: { in: ["PENDING", "PROCESSING"] },
        deletedAt: null,
      },
      select: { id: true },
    });
    if (existing) {
      enqueued += 1;
      continue;
    }

    const aiJob = await prisma.workbenchAiJob.create({
      data: {
        academyId,
        createdById: followUp.staffId,
        domain: "PASSAGE_ANALYSIS",
        status: "PENDING",
        title: p.title,
        passageId: p.passageId,
        mode: "FULL",
        generationPlan: followUp.generationPlan,
        requestedCount: 1,
        config: {
          customPrompt: followUp.customPrompt ?? "",
          focusAreas: [],
          targetLevel: "",
          generationPlan: followUp.generationPlan,
          fastTrack: true,
          fastTrackSource: "upload",
          fastTrackExtractionJobId: extractionJobId,
          uploadLabel: followUp.uploadLabel ?? null,
        },
      },
    });

    try {
      const handle = await tasks.trigger(
        "workbench-passage-analysis",
        { jobId: aiJob.id },
        {
          idempotencyKey: `workbench-passage-analysis:${aiJob.id}`,
          queue: WORKBENCH_PASSAGE_ANALYSIS_QUEUE_NAME,
          concurrencyKey: academyConcurrencyKey(academyId),
        },
      );
      await prisma.workbenchAiJob.update({
        where: { id: aiJob.id },
        data: { triggerRunId: handle.id },
      });
      enqueued += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await prisma.workbenchAiJob.update({
        where: { id: aiJob.id },
        data: {
          status: "FAILED",
          errorMessage: message,
          completedAt: new Date(),
          failedCount: 1,
        },
      });
      logger.error("fast-track passage-analysis enqueue failed", {
        aiJobId: aiJob.id,
        message,
      });
    }
  }

  return enqueued;
}

async function fanOutQuestionGeneration(input: FanOutInput): Promise<number> {
  const { academyId, followUp, passages, extractionJobId } = input;
  const qg = followUp.questionGeneration;
  if (!qg) {
    logger.warn("fast-track question-generation: missing config", {
      extractionJobId,
    });
    return 0;
  }
  let enqueued = 0;

  for (const p of passages) {
    const existing = await prisma.workbenchAiJob.findFirst({
      where: {
        academyId,
        domain: "QUESTION_GENERATION",
        passageId: p.passageId,
        status: { in: ["PENDING", "PROCESSING"] },
        deletedAt: null,
      },
      select: { id: true },
    });
    if (existing) {
      enqueued += 1;
      continue;
    }

    const aiJob = await prisma.workbenchAiJob.create({
      data: {
        academyId,
        createdById: followUp.staffId,
        domain: "QUESTION_GENERATION",
        status: "PENDING",
        title: p.title,
        passageId: p.passageId,
        mode: qg.mode,
        questionType: qg.questionType,
        generationPlan: followUp.generationPlan,
        difficulty: qg.difficulty,
        requestedCount: qg.count,
        config: {
          mode: qg.mode,
          count: qg.count,
          questionType: qg.questionType,
          questionTypeSettings: qg.questionTypeSettings as any,
          difficulty: qg.difficulty,
          customPrompt: followUp.customPrompt ?? "",
          generationPlan: followUp.generationPlan,
          fastTrack: true,
          fastTrackSource: "upload",
          fastTrackExtractionJobId: extractionJobId,
          uploadLabel: followUp.uploadLabel ?? null,
        },
      },
    });

    try {
      const handle = await tasks.trigger(
        "workbench-question-generation",
        { jobId: aiJob.id },
        {
          idempotencyKey: `workbench-question-generation:${aiJob.id}`,
          queue: WORKBENCH_QUESTION_GENERATION_QUEUE_NAME,
          concurrencyKey: academyConcurrencyKey(academyId),
        },
      );
      await prisma.workbenchAiJob.update({
        where: { id: aiJob.id },
        data: { triggerRunId: handle.id },
      });
      enqueued += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await prisma.workbenchAiJob.update({
        where: { id: aiJob.id },
        data: {
          status: "FAILED",
          errorMessage: message,
          completedAt: new Date(),
          failedCount: 1,
        },
      });
      logger.error("fast-track question-generation enqueue failed", {
        aiJobId: aiJob.id,
        message,
      });
    }
  }

  return enqueued;
}
