import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { buildAnalysisPrompt } from "@/lib/annotation-prompt";
import { getStaffSession } from "@/lib/auth";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import {
  InsufficientCreditsError,
  refundCredits,
} from "@/lib/credits";
import { hashContent } from "@/lib/passage-utils";
import {
  providerFromModel,
  readAiUsageTokens,
  recordPlatformApiUsageCost,
} from "@/lib/platform-api-costs";
import {
  DEFAULT_ANALYSIS_TONE,
  normalizeAnalysisTone,
  type AnalysisTone,
} from "@/lib/passage-analysis-options";
import { prisma } from "@/lib/prisma";
import {
  getQuestionGenerationCreditCost,
  getQuestionGenerationPlanTag,
  normalizeQuestionGenerationPlan,
  type QuestionGenerationPlan,
} from "@/lib/question-generation-plans";
import { ensureWorkbenchAiJobCharged } from "@/lib/workbench-ai-job-credit";
import { loadPersistedAnnotations } from "@/app/api/ai/passage-analysis/[passageId]/_lib/annotations";
import { classifyAnalysisError } from "@/app/api/ai/passage-analysis/[passageId]/_lib/error-classification";
import { generateAnalysisReport } from "@/lib/passage-report/analysis-report/generate";
import { derivePassageAnalysisFromReport } from "@/lib/passage-report/analysis-report/derive-legacy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

const requestSchema = z.object({
  passageId: z.string().min(1),
  customPrompt: z.string().optional(),
  focusAreas: z.array(z.string()).optional(),
  targetLevel: z.string().optional(),
  generationPlan: z.unknown().optional(),
  analysisTone: z.unknown().optional(),
});

function getAnalysisGenerationPlan(value: unknown): QuestionGenerationPlan | null {
  if (!value || typeof value !== "object") return null;
  const raw = (value as Record<string, unknown>)._generationPlan;
  return raw === "PREMIUM" || raw === "STANDARD" ? raw : null;
}

function getAnalysisTone(value: unknown): AnalysisTone | null {
  if (!value || typeof value !== "object") return null;
  const raw = (value as Record<string, unknown>)._analysisTone;
  return typeof raw === "string" ? normalizeAnalysisTone(raw) : null;
}

function shouldUseCachedAnalysis(
  cached: unknown,
  requestedPlan: QuestionGenerationPlan,
  requestedTone: AnalysisTone,
): boolean {
  const cachedPlan = getAnalysisGenerationPlan(cached);
  const cachedTone = getAnalysisTone(cached);
  if (cachedTone && cachedTone !== requestedTone) return false;
  if (!cachedTone && requestedTone !== DEFAULT_ANALYSIS_TONE) return false;
  if (requestedPlan === "PREMIUM") return cachedPlan === "PREMIUM";
  return true;
}

function withAnalysisGenerationMetadata(
  analysisData: unknown,
  generationPlan: QuestionGenerationPlan,
  analysisTone: AnalysisTone,
) {
  if (!analysisData || typeof analysisData !== "object" || Array.isArray(analysisData)) {
    return analysisData;
  }

  return {
    ...(analysisData as Record<string, unknown>),
    _generationPlan: generationPlan,
    _generationTag: getQuestionGenerationPlanTag(generationPlan),
    _analysisTone: analysisTone,
  };
}

async function recordCostSafely(input: {
  sourceKey: string;
  sourceId: string;
  sourceDetail: string;
  academyId: string;
  provider: ReturnType<typeof providerFromModel>;
  model: string;
  inputTokens: number;
  outputTokens: number;
  usageAt: Date;
  metadata: Record<string, unknown>;
}) {
  try {
    await recordPlatformApiUsageCost({
      sourceKey: input.sourceKey,
      sourceType: "WORKBENCH_AI_JOB",
      sourceId: input.sourceId,
      sourceDetail: input.sourceDetail,
      academyId: input.academyId,
      provider: input.provider,
      model: input.model,
      operationType: "PASSAGE_ANALYSIS",
      unitType: "TOKENS",
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      usageAt: input.usageAt,
      metadata: input.metadata as Prisma.InputJsonValue,
    });
  } catch (error) {
    console.warn("[workbench-fast-analysis] Failed to record API cost", error);
  }
}

export async function POST(req: NextRequest) {
  const requestStartedAt = Date.now();
  const staff = await getStaffSession();
  if (!staff) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const parsed = requestSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const generationPlan = normalizeQuestionGenerationPlan(
    parsed.data.generationPlan,
  );
  const analysisTone = normalizeAnalysisTone(parsed.data.analysisTone);

  const passage = await prisma.passage.findFirst({
    where: { id: parsed.data.passageId, academyId: staff.academyId },
    include: {
      analysis: true,
      school: { select: { type: true } },
    },
  });
  if (!passage) {
    return NextResponse.json({ error: "Passage not found" }, { status: 404 });
  }

  const active = await prisma.workbenchAiJob.findFirst({
    where: {
      academyId: staff.academyId,
      domain: "PASSAGE_ANALYSIS",
      passageId: passage.id,
      status: { in: ["PENDING", "PROCESSING"] },
      deletedAt: null,
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, createdAt: true },
  });
  if (active) {
    return NextResponse.json({
      jobId: active.id,
      status: active.status,
      createdAt: active.createdAt.toISOString(),
      fastPath: false,
    });
  }

  const now = new Date();
  const job = await prisma.workbenchAiJob.create({
    data: {
      academyId: staff.academyId,
      createdById: staff.id,
      domain: "PASSAGE_ANALYSIS",
      status: "PROCESSING",
      title: passage.title,
      passageId: passage.id,
      mode: "FULL",
      generationPlan,
      requestedCount: 1,
      startedAt: now,
      config: {
        customPrompt: parsed.data.customPrompt ?? "",
        focusAreas: parsed.data.focusAreas ?? [],
        targetLevel: parsed.data.targetLevel ?? "",
        generationPlan,
        analysisTone,
        fastPath: true,
      },
    },
  });

  const currentHash = hashContent(passage.content);
  let creditTxId: string | null = null;
  let creditMs = 0;
  let generationMs = 0;
  let generationStartedAt: number | null = null;
  let persistenceMs = 0;

  try {
    if (passage.analysis && passage.analysis.contentHash === currentHash) {
      const cachedAnalysis = JSON.parse(passage.analysis.analysisData);
      if (shouldUseCachedAnalysis(cachedAnalysis, generationPlan, analysisTone)) {
        const completedAt = new Date();
        const debugTiming = {
          queueWaitMs: 0,
          creditMs: 0,
          generationMs: 0,
          persistenceMs: 0,
          totalRunMs: Date.now() - requestStartedAt,
          cached: true,
          fastPath: true,
        };

        await prisma.workbenchAiJob.update({
          where: { id: job.id },
          data: {
            status: "COMPLETED",
            successCount: 1,
            failedCount: 0,
            resultCount: 1,
            result: JSON.parse(JSON.stringify({
              cached: true,
              passageId: passage.id,
              generationPlan,
              analysisTone,
              debugTiming,
              fastPath: true,
            })),
            completedAt,
          },
        });

        return NextResponse.json({
          jobId: job.id,
          status: "COMPLETED",
          data: cachedAnalysis,
          cached: true,
          generationPlan,
          analysisTone: getAnalysisTone(cachedAnalysis) || analysisTone,
          createdAt: job.createdAt.toISOString(),
          completedAt: completedAt.toISOString(),
          debugTiming,
          fastPath: true,
        });
      }
    }

    const creditCost = getQuestionGenerationCreditCost(
      CREDIT_COSTS.PASSAGE_ANALYSIS,
      generationPlan,
    );
    const creditStartedAt = Date.now();
    const credit = await ensureWorkbenchAiJobCharged({
      jobId: job.id,
      academyId: job.academyId,
      staffId: job.createdById,
      operationType: "PASSAGE_ANALYSIS",
      metadata: {
        passageId: passage.id,
        generationPlan,
        analysisTone,
        creditCost,
        fastPath: true,
      },
      creditCost,
    });
    creditMs = Date.now() - creditStartedAt;
    creditTxId = credit.transactionId;

    const persistedAnns = await loadPersistedAnnotations(passage.id);
    const annotationPrompt =
      persistedAnns.length > 0 ? buildAnalysisPrompt("", persistedAnns) : "";
    const mergedPrompt = [annotationPrompt, parsed.data.customPrompt]
      .filter((v) => typeof v === "string" && v.trim().length > 0)
      .join("\n\n");

    generationStartedAt = Date.now();
    // PRIME A4 보고서를 단일 소스로 생성 (옛 5-layer runFullAnalysis 대체)
    const primeResult = await generateAnalysisReport({
      passageContent: passage.content,
      schoolType: (passage.school?.type as "MIDDLE" | "HIGH" | undefined) ?? null,
      grade: passage.grade,
      customPrompt: mergedPrompt || undefined,
    });
    generationMs = Date.now() - generationStartedAt;
    if (!primeResult.ok) {
      throw new Error(`PRIME 생성 실패: ${primeResult.error}`);
    }
    const usageEvent = primeResult.usage;
    if (usageEvent) {
      const usage = readAiUsageTokens(usageEvent.usage);
      await recordCostSafely({
        sourceKey: `workbench_ai_job:${job.id}:analysis`,
        sourceId: job.id,
        sourceDetail: "PASSAGE_ANALYSIS",
        academyId: job.academyId,
        provider: providerFromModel(usageEvent.modelId),
        model: usageEvent.modelId,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        usageAt: new Date(),
        metadata: {
          passageId: passage.id,
          generationPlan,
          fastPath: true,
          durationMs: usageEvent.durationMs,
        },
      });
    }
    const primeReport = primeResult.report;
    // 카드/문제생성 호환용 파생 데이터 (별도 LLM 호출 없음)
    const analysisData = derivePassageAnalysisFromReport(primeReport);

    const persistenceStartedAt = Date.now();
    await prisma.$transaction(async (tx) => {
      // 1) PRIME 보고서 저장/갱신 (모달이 읽어 A4 렌더)
      const existingPrime = await tx.passageReport.findFirst({
        where: { passageId: passage.id, academyId: passage.academyId, generationPlan: "PRIME", deletedAt: null },
        select: { id: true },
      });
      const primeData = {
        title: primeReport.meta.titleKo,
        status: "PUBLISHED",
        pages: primeReport as never,
        theme: { themeId: primeReport.themeId } as never,
        templateId: "prime",
        generationPlan: "PRIME",
        lastEditedById: staff.id,
        lastEditedAt: new Date(),
      };
      if (existingPrime) {
        await tx.passageReport.update({ where: { id: existingPrime.id }, data: { ...primeData, version: { increment: 1 } } });
      } else {
        await tx.passageReport.create({ data: { academyId: passage.academyId, passageId: passage.id, createdById: staff.id, ...primeData } });
      }
      // 2) 파생 PassageAnalysis (지문 카드 칩·문제생성 컨텍스트 호환)
      await tx.passageAnalysis.upsert({
        where: { passageId: passage.id },
        update: { analysisData: JSON.stringify(analysisData), contentHash: currentHash, version: 1 },
        create: { passageId: passage.id, analysisData: JSON.stringify(analysisData), contentHash: currentHash, version: 1 },
      });
    });
    persistenceMs = Date.now() - persistenceStartedAt;

    const completedAt = new Date();
    const debugTiming = {
      queueWaitMs: 0,
      creditMs,
      generationMs,
      persistenceMs,
      totalRunMs: Date.now() - requestStartedAt,
      cached: false,
      fastPath: true,
    };

    await prisma.workbenchAiJob.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        successCount: 1,
        failedCount: 0,
        resultCount: 1,
        result: JSON.parse(JSON.stringify({
          cached: false,
          passageId: passage.id,
          generationPlan,
          analysisTone,
          debugTiming,
          fastPath: true,
        })),
        completedAt,
      },
    });

    return NextResponse.json({
      jobId: job.id,
      status: "COMPLETED",
      data: analysisData,
      cached: false,
      generationPlan,
      analysisTone,
      creditsRemaining: credit.balanceAfter,
      createdAt: job.createdAt.toISOString(),
      completedAt: completedAt.toISOString(),
      debugTiming,
      fastPath: true,
    });
  } catch (err) {
    if (generationStartedAt !== null && generationMs === 0) {
      generationMs = Date.now() - generationStartedAt;
    }

    if (err instanceof InsufficientCreditsError) {
      await prisma.workbenchAiJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          failedCount: 1,
          errorMessage: `Insufficient credits: have ${err.currentBalance}, need ${err.requiredCredits}`,
          completedAt: new Date(),
        },
      });
      return NextResponse.json(
        {
          error: "Insufficient credits",
          balance: err.currentBalance,
          required: err.requiredCredits,
        },
        { status: 402 },
      );
    }

    const creditCost = getQuestionGenerationCreditCost(
      CREDIT_COSTS.PASSAGE_ANALYSIS,
      generationPlan,
    );
    if (creditTxId) {
      await refundCredits(
        job.academyId,
        "PASSAGE_ANALYSIS",
        creditTxId,
        "Fast workbench passage analysis failed",
        creditCost,
      ).catch((refundErr) => {
        console.error("Fast passage analysis refund failed", refundErr);
      });
    }

    const classified = classifyAnalysisError(err);
    await prisma.workbenchAiJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        failedCount: 1,
        errorMessage: classified.message,
        result: {
          debugTiming: {
            queueWaitMs: 0,
            creditMs,
            generationMs,
            persistenceMs,
            totalRunMs: Date.now() - requestStartedAt,
            fastPath: true,
          },
        },
        completedAt: new Date(),
      },
    });

    return NextResponse.json(
      { error: "Passage analysis failed", details: classified.message, code: classified.code },
      { status: classified.status },
    );
  }
}
