import { prisma } from "@/lib/prisma";
import {
  analyzeExamPattern,
  type AnalysisSummary,
} from "@/lib/similar-exam-generation/analysis";
import {
  generateEligibleQuestionGroups,
  type BatchGenerationSummary,
} from "@/lib/similar-exam-generation/generation";
import { savePatternGeneratedExam } from "@/lib/similar-exam-generation/persistence";
import {
  examPatternProfileSchema,
  normalizePatternProfile,
  type ExamPatternProfile,
  type SelectedPassageForGeneration,
} from "@/lib/similar-exam-generation/schemas";
import type { RunnerLogger } from "@/lib/similar-exam-generation/runner-types";

interface RunnerOptions {
  runId: string;
  logger?: RunnerLogger;
}

interface CallSummary {
  analysis: {
    provider: AnalysisSummary["provider"] | "reused-blueprint";
    pages: number;
    chunks: number;
    llmCalls: number;
    llmAttempts: number;
    reusedBlueprint: boolean;
  };
  generation?: BatchGenerationSummary;
  llmCallsTotal: number;
  llmAttemptsTotal: number;
}

function readPageImageUrls(raw: unknown): string[] {
  return Array.isArray(raw)
    ? raw.filter((value): value is string => typeof value === "string")
    : [];
}

function readPassageIds(raw: unknown): string[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const value = (raw as { passageIds?: unknown }).passageIds;
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is string => typeof id === "string" && id.trim().length > 0))];
}

function toJson(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

async function setJobState(
  jobId: string,
  data: {
    status?: string;
    stage?: string;
    triggerRunId?: string;
    blueprint?: unknown;
    result?: unknown;
    generatedExamId?: string;
    errorMessage?: string | null;
    startedAt?: Date;
    completedAt?: Date;
  },
) {
  await prisma.similarExamGenerationJob.update({
    where: { id: jobId },
    data: {
      ...data,
      blueprint: data.blueprint === undefined ? undefined : toJson(data.blueprint),
      result: data.result === undefined ? undefined : toJson(data.result),
    },
  });
}

async function loadSelectedPassages(args: {
  academyId: string;
  passageIds: string[];
}): Promise<SelectedPassageForGeneration[]> {
  const rows = await prisma.passage.findMany({
    where: { academyId: args.academyId, id: { in: args.passageIds } },
    select: {
      id: true,
      title: true,
      content: true,
      analysis: { select: { analysisData: true } },
    },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  const passages = args.passageIds
    .map((id) => byId.get(id))
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .map((row) => ({
      id: row.id,
      title: row.title,
      content: row.content,
      analysisData: row.analysis?.analysisData ?? undefined,
    }));
  if (passages.length === 0) {
    throw new Error("생성에 사용할 지문이 1개 이상 필요합니다.");
  }
  return passages;
}

function messageForError(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Exam pattern generation failed.";
}

export async function processSimilarExamGenerationJob(
  jobId: string,
  options: RunnerOptions,
) {
  const job = await prisma.similarExamGenerationJob.findUnique({ where: { id: jobId } });
  if (!job || job.deletedAt) return { skipped: true as const, reason: "JOB_NOT_FOUND" };
  if (["COMPLETED", "FAILED", "CANCELLED"].includes(job.status)) {
    return { skipped: true as const, status: job.status };
  }
  // Retry guard: a previous attempt already produced the exam. Don't double-create.
  if (job.generatedExamId) {
    await setJobState(jobId, {
      status: "COMPLETED",
      stage: "COMPLETED",
      completedAt: job.completedAt ?? new Date(),
    });
    return { skipped: true as const, reason: "ALREADY_GENERATED", examId: job.generatedExamId };
  }

  const taskStartedAt = Date.now();
  let analysisMs = 0;
  let generationMs = 0;
  let persistenceMs = 0;

  const callSummary: CallSummary = {
    analysis: {
      provider: "reused-blueprint",
      pages: 0,
      chunks: 0,
      llmCalls: 0,
      llmAttempts: 0,
      reusedBlueprint: false,
    },
    llmCallsTotal: 0,
    llmAttemptsTotal: 0,
  };

  await setJobState(jobId, {
    status: "PROCESSING",
    stage: "ANALYZING_PATTERN",
    startedAt: job.startedAt ?? new Date(),
    triggerRunId: options.runId,
  });

  try {
    const selectedPassages = await loadSelectedPassages({
      academyId: job.academyId,
      passageIds: readPassageIds(job.config),
    });

    let profile: ExamPatternProfile;
    const parsedExisting = examPatternProfileSchema.safeParse(job.blueprint);
    if (parsedExisting.success) {
      profile = normalizePatternProfile(parsedExisting.data);
      callSummary.analysis.reusedBlueprint = true;
    } else {
      const pageImageUrls = readPageImageUrls(job.pageImageUrls);
      if (pageImageUrls.length !== job.totalPages || pageImageUrls.length === 0) {
        throw new Error("Uploaded page images are incomplete.");
      }

      const analysisStartedAt = Date.now();
      const analyzed = await analyzeExamPattern({
        paths: pageImageUrls,
        originalFileName: job.originalFileName,
        totalPages: job.totalPages,
        selectedPassageCount: selectedPassages.length,
        logger: options.logger,
        onChunkStart: (chunkNumber, chunkCount) =>
          setJobState(jobId, {
            stage:
              chunkCount > 1
                ? `ANALYZING_PATTERN_${chunkNumber}_OF_${chunkCount}`
                : "ANALYZING_PATTERN",
          }),
      });
      analysisMs = Date.now() - analysisStartedAt;
      profile = analyzed.profile;
      callSummary.analysis = {
        provider: analyzed.summary.provider,
        pages: analyzed.summary.pages,
        chunks: analyzed.summary.chunks,
        llmCalls: analyzed.summary.llmCalls,
        llmAttempts: analyzed.summary.llmAttempts,
        reusedBlueprint: false,
      };
      await setJobState(jobId, { blueprint: profile });
    }

    await setJobState(jobId, { stage: "GENERATING_QUESTIONS" });
    const generationStartedAt = Date.now();
    const generated = await generateEligibleQuestionGroups({
      profile,
      passages: selectedPassages,
    });
    generationMs = Date.now() - generationStartedAt;
    callSummary.generation = generated.summary;
    callSummary.llmCallsTotal =
      callSummary.analysis.llmCalls + generated.summary.llmCalls;
    callSummary.llmAttemptsTotal =
      callSummary.analysis.llmAttempts + generated.summary.llmAttempts;

    if (generated.groups.length === 0) {
      throw new Error("No passage-based question slots were eligible for generation.");
    }

    await setJobState(jobId, { stage: "SAVING" });
    const persistenceStartedAt = Date.now();
    const saved = await savePatternGeneratedExam({
      academyId: job.academyId,
      createdById: job.createdById,
      jobId,
      profile,
      groups: generated.groups,
    });
    persistenceMs = Date.now() - persistenceStartedAt;

    const result = {
      generatedExamId: saved.examId,
      questionCount: saved.questionCount,
      selectedPassageIds: selectedPassages.map((passage) => passage.id),
      patternQuestionCount: profile.questionSlots.length,
      mapping: saved.mapping,
      callSummary,
      debugTiming: {
        analysisMs,
        generationMs,
        persistenceMs,
        totalRunMs: Date.now() - taskStartedAt,
      },
    };
    await setJobState(jobId, {
      status: "COMPLETED",
      stage: "COMPLETED",
      generatedExamId: saved.examId,
      result,
      completedAt: new Date(),
    });
    return { success: true as const, examId: saved.examId, callSummary };
  } catch (err) {
    const message = messageForError(err);
    await setJobState(jobId, {
      status: "FAILED",
      stage: "FAILED",
      errorMessage: message,
      result: {
        callSummary,
        debugTiming: {
          analysisMs,
          generationMs,
          persistenceMs,
          totalRunMs: Date.now() - taskStartedAt,
        },
      },
      completedAt: new Date(),
    });
    options.logger?.error?.("exam pattern generation failed", { jobId, error: message });
    throw err;
  }
}
