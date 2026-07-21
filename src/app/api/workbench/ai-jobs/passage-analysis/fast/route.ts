import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { buildAnalysisPrompt } from "@/lib/annotation-prompt";
import { getStaffSession } from "@/lib/auth";
import {
  InsufficientCreditsError,
  refundCredits,
} from "@/lib/credits";
import { hashContent } from "@/lib/passage-utils";
import {
  providerFromModel,
  readAiUsageCost,
  readAiUsageTokens,
  recordPlatformApiUsageCost,
} from "@/lib/platform-api-costs";
import {
  DEFAULT_ANALYSIS_TONE,
  normalizeAnalysisTone,
  type AnalysisTone,
} from "@/lib/passage-analysis-options";
import {
  getPassageAnalysisCreditCost,
  getPassageAnalysisWorksheetCreditCost,
} from "@/lib/passage-analysis-credit-costs";
import { prisma } from "@/lib/prisma";
import { cleanupStaleWorkbenchAiJobs } from "@/lib/workbench-ai-job-stale-cleanup";
import {
  normalizeQuestionGenerationPlan,
  type QuestionGenerationPlan,
} from "@/lib/question-generation-plans";
import { ensureWorkbenchAiJobCharged } from "@/lib/workbench-ai-job-credit";
import { loadPersistedAnnotations } from "@/app/api/ai/passage-analysis/[passageId]/_lib/annotations";
import { classifyAnalysisError } from "@/app/api/ai/passage-analysis/[passageId]/_lib/error-classification";
import { generateLearningWorksheetResilient } from "@/lib/passage-report/analysis-report/generate";
import {
  generateAnalysisReportResilient,
  type ResilientCheckpoint,
} from "@/lib/passage-report/analysis-report/resilient-generate";
import {
  loadPriorCheckpoint,
  persistCheckpoint,
} from "@/lib/passage-report/analysis-report/resilient-checkpoint";
import type { AnalysisReport } from "@/lib/passage-report/analysis-report/schema";
import { derivePassageAnalysisFromReport } from "@/lib/passage-report/analysis-report/derive-legacy";
import {
  buildKoPromptInputFromPassage,
  isKoreanPassage,
  saveKoPrimeReport,
} from "@/lib/passage-report/analysis-report/ko-entry";
import { generateKoAnalysisReportResilient } from "@/lib/passage-report/analysis-report/ko-resilient-generate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 실전 학습지 포함(includeWorksheet) 시 LLM 3회 호출(기본 1 + 워크북/추론 2)이라
// 기본 분석(180s)보다 여유가 필요하다 — 옵트인 워크시트 라우트와 동일하게 300s.
export const maxDuration = 300;

const requestSchema = z.object({
  passageId: z.string().min(1),
  customPrompt: z.string().optional(),
  focusAreas: z.array(z.string()).optional(),
  targetLevel: z.string().optional(),
  generationPlan: z.unknown().optional(),
  analysisTone: z.unknown().optional(),
  /** true 면 기본 분석에 이어 실전 학습지(06)까지 한 번에 생성·병합한다 (+5크레딧). */
  includeWorksheet: z.boolean().optional(),
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

async function recordCostSafely(input: {
  sourceKey: string;
  sourceId: string;
  sourceDetail: string;
  academyId: string;
  provider: ReturnType<typeof providerFromModel>;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** OpenRouter 실측 청구액 합(USD) — 있으면 RECORDED 단가로 기록. */
  recordedCostUsd?: number | null;
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
      recordedCostUsd: input.recordedCostUsd,
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
  const includeWorksheet = parsed.data.includeWorksheet === true;

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

  await cleanupStaleWorkbenchAiJobs({
    academyId: staff.academyId,
    domain: "PASSAGE_ANALYSIS",
    passageId: passage.id,
  });

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
        includeWorksheet,
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
  let resilientCheckpoint: ResilientCheckpoint | null = null;

  // ── PRIME_KO 게이트: 국어 지문은 KO 회복형 생성기·PRIME_KO 마커로만 처리 ──────
  // 영어 분석기·derive-legacy(PassageAnalysis 파생)·실전 학습지로 절대 흐르지 않는다.
  // 자기완결 블록(자체 과금/환불/잡 상태) — 아래 영어 경로는 무변경.
  if (isKoreanPassage(passage)) {
    const koCreditCost = getPassageAnalysisCreditCost({ includeWorksheet: false });
    let koCreditTxId: string | null = null;
    try {
      const creditStartedAt = Date.now();
      const credit = await ensureWorkbenchAiJobCharged({
        jobId: job.id,
        academyId: job.academyId,
        staffId: job.createdById,
        operationType: "PASSAGE_ANALYSIS",
        metadata: { passageId: passage.id, generationPlan, koPrime: true, creditCost: koCreditCost, fastPath: true },
        creditCost: koCreditCost,
      });
      creditMs = Date.now() - creditStartedAt;
      koCreditTxId = credit.transactionId;

      generationStartedAt = Date.now();
      const koResilient = await generateKoAnalysisReportResilient(
        buildKoPromptInputFromPassage({
          content: passage.content,
          tags: passage.tags,
          grade: passage.grade,
          schoolType: (passage.school?.type as "MIDDLE" | "HIGH" | undefined) ?? null,
          customPrompt: parsed.data.customPrompt,
        }),
        {
          contentHash: currentHash,
          deadlineAt: requestStartedAt + 255_000,
        },
      );
      generationMs = Date.now() - generationStartedAt;

      // KO LLM 호출 토큰·실측 원가 합산 기록(플랫폼 원가 추적 — 영어 경로와 parity).
      const koTokens = koResilient.usages.reduce(
        (acc, u) => {
          const t = readAiUsageTokens(u.usage);
          const c = readAiUsageCost(u.usage);
          acc.input += t.inputTokens;
          acc.output += t.outputTokens;
          if (c.costUsd) acc.costUsd += c.costUsd;
          return acc;
        },
        { input: 0, output: 0, costUsd: 0 },
      );
      if (koTokens.input > 0 || koTokens.output > 0) {
        const koModelId = koResilient.usages.find((u) => u.modelId)?.modelId ?? "gemini-3.6-flash";
        await recordCostSafely({
          sourceKey: `workbench_ai_job:${job.id}:analysis`,
          sourceId: job.id,
          sourceDetail: "PASSAGE_ANALYSIS",
          academyId: job.academyId,
          provider: providerFromModel(koModelId),
          model: koModelId,
          inputTokens: koTokens.input,
          outputTokens: koTokens.output,
          recordedCostUsd: koTokens.costUsd > 0 ? koTokens.costUsd : null,
          usageAt: new Date(),
          metadata: { passageId: passage.id, generationPlan, koPrime: true, fastPath: true, calls: koResilient.usages.length },
        });
      }

      // 품질 게이트 — 개관 폴백이거나 목표 섹션 절반 미만이면 환불 + FAILED.
      const targetsCount = koResilient.completeness.present.length + koResilient.completeness.missing.length;
      const koDegraded =
        koResilient.completeness.fallback.includes("ko-overview") ||
        koResilient.completeness.present.length < Math.ceil(targetsCount / 2);
      if (koDegraded) {
        if (koCreditTxId) {
          await refundCredits(
            job.academyId,
            "PASSAGE_ANALYSIS",
            koCreditTxId,
            "PRIME_KO analysis incomplete — refunded",
            koCreditCost,
          ).catch((refundErr) => console.error("PRIME_KO incomplete refund failed", refundErr));
        }
        await prisma.workbenchAiJob.update({
          where: { id: job.id },
          data: {
            status: "FAILED",
            failedCount: 1,
            errorMessage: "일시적인 AI 문제로 국어 분석을 완성하지 못했어요. 크레딧은 환불됐어요. 잠시 후 다시 시도해주세요.",
            result: JSON.parse(JSON.stringify({
              koPrime: true,
              resilient: {
                complete: koResilient.completeness.complete,
                present: koResilient.completeness.present,
                missing: koResilient.completeness.missing,
                fallback: koResilient.completeness.fallback,
                rounds: koResilient.rounds,
              },
            })),
            completedAt: new Date(),
          },
        });
        return NextResponse.json(
          {
            error: "Passage analysis incomplete",
            code: "PASSAGE_ANALYSIS_INCOMPLETE",
            details: "일시적인 AI 문제로 국어 분석을 완성하지 못했어요. 크레딧은 환불됐어요. 다시 시도해주세요.",
            completeness: koResilient.completeness,
          },
          { status: 502 },
        );
      }

      await saveKoPrimeReport(prisma, {
        academyId: passage.academyId,
        passageId: passage.id,
        staffId: staff.id,
        report: koResilient.report,
      });

      const completedAt = new Date();
      const debugTiming = {
        queueWaitMs: 0,
        creditMs,
        generationMs,
        persistenceMs: 0,
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
            koPrime: true,
            debugTiming,
            fastPath: true,
            resilient: {
              complete: koResilient.completeness.complete,
              present: koResilient.completeness.present,
              missing: koResilient.completeness.missing,
              fallback: koResilient.completeness.fallback,
              rounds: koResilient.rounds,
              draftUsed: koResilient.draftUsed,
            },
          })),
          completedAt,
        },
      });
      return NextResponse.json({
        jobId: job.id,
        status: "COMPLETED",
        data: null,
        koPrime: true,
        cached: false,
        generationPlan,
        creditsRemaining: credit.balanceAfter,
        createdAt: job.createdAt.toISOString(),
        completedAt: completedAt.toISOString(),
        debugTiming,
        fastPath: true,
      });
    } catch (koErr) {
      if (koErr instanceof InsufficientCreditsError) {
        await prisma.workbenchAiJob.update({
          where: { id: job.id },
          data: {
            status: "FAILED",
            failedCount: 1,
            errorMessage: `Insufficient credits: have ${koErr.currentBalance}, need ${koErr.requiredCredits}`,
            completedAt: new Date(),
          },
        });
        return NextResponse.json(
          { error: "Insufficient credits", balance: koErr.currentBalance, required: koErr.requiredCredits },
          { status: 402 },
        );
      }
      if (koCreditTxId) {
        await refundCredits(
          job.academyId,
          "PASSAGE_ANALYSIS",
          koCreditTxId,
          "PRIME_KO fast passage analysis failed",
          koCreditCost,
        ).catch((refundErr) => console.error("PRIME_KO fast refund failed", refundErr));
      }
      const classified = classifyAnalysisError(koErr);
      await prisma.workbenchAiJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          failedCount: 1,
          errorMessage: classified.message,
          completedAt: new Date(),
        },
      });
      return NextResponse.json(
        { error: "Passage analysis failed", details: classified.message, code: classified.code },
        { status: classified.status },
      );
    }
  }

  try {
    // 실전 학습지 포함 요청은 캐시 단락을 타지 않는다 — 사용자가 명시적으로
    // "기본 + 실전" 풀 생성을 선택한 것이므로 항상 신선하게 생성한다.
    if (!includeWorksheet && passage.analysis && passage.analysis.contentHash === currentHash) {
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

    // 실전 학습지는 옵트인 라우트(prime/[passageId]/worksheet)와 동일 단가.
    const worksheetCost = getPassageAnalysisWorksheetCreditCost(includeWorksheet);
    const creditCost = getPassageAnalysisCreditCost({ includeWorksheet });
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
        includeWorksheet,
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
    // 회복형 생성: 전체 초안으로 통과 섹션을 부분 구제 → 실패/누락 섹션만 정확히 골라
    // 섹션 단위로 다시 생성(직전 실패를 교정 지시로 주입) → 완성된 섹션은 건너뛰고
    // 진전마다 체크포인트를 남겨 다음 시도가 이어받게 하며, 필수(passage)는 무조건 채워
    // 항상 렌더 가능한 보고서를 완성한다. (기존 all-or-nothing generateAnalysisReportCore 대체)
    const priorCheckpoint = await loadPriorCheckpoint(prisma, {
      academyId: staff.academyId,
      passageId: passage.id,
      contentHash: currentHash,
      excludeJobId: job.id,
    });
    const resilient = await generateAnalysisReportResilient(
      {
        passageContent: passage.content,
        schoolType: (passage.school?.type as "MIDDLE" | "HIGH" | undefined) ?? null,
        grade: passage.grade,
        customPrompt: mergedPrompt || undefined,
      },
      {
        contentHash: currentHash,
        // Vercel maxDuration(300s) 벽 안에서 마치고 부분 결과를 남기도록 데드라인을 둔다.
        // 실전 학습지(includeWorksheet)까지 한 요청에서 생성하면 코어 뒤로 워크북+추론
        // 호출이 더 붙으므로, 코어 데드라인을 낮춰 학습지 몫(≈135s)을 벽 안에 남겨 둔다.
        deadlineAt: requestStartedAt + (includeWorksheet ? 150_000 : 255_000),
        checkpoint: priorCheckpoint,
        // promise 를 반환해 resilient 가 await — fire-and-forget 시 지연 쓰기가 최종
        // COMPLETED 결과를 덮어쓰는 레이스를 차단(쓰기 직렬화).
        onCheckpoint: (cp) => {
          resilientCheckpoint = cp;
          return persistCheckpoint(prisma, job.id, cp);
        },
      },
    );
    generationMs = Date.now() - generationStartedAt;
    let primeReport = resilient.report;

    // 회복형 분석의 모든 LLM 호출(초안+섹션) 토큰을 합산해 비용 회계에 기록 — 기존
    // 단일 호출 회계와 parity. (사용자 과금이 아니라 플랫폼 원가 추적용.)
    const analysisTokens = resilient.usages.reduce(
      (acc, u) => {
        const t = readAiUsageTokens(u.usage);
        const c = readAiUsageCost(u.usage);
        acc.input += t.inputTokens;
        acc.output += t.outputTokens;
        if (c.costUsd) acc.costUsd += c.costUsd;
        return acc;
      },
      { input: 0, output: 0, costUsd: 0 },
    );
    if (analysisTokens.input > 0 || analysisTokens.output > 0) {
      const usageModelId = resilient.usages.find((u) => u.modelId)?.modelId ?? "gemini-3.6-flash";
      await recordCostSafely({
        sourceKey: `workbench_ai_job:${job.id}:analysis`,
        sourceId: job.id,
        sourceDetail: "PASSAGE_ANALYSIS",
        academyId: job.academyId,
        provider: providerFromModel(usageModelId),
        model: usageModelId,
        inputTokens: analysisTokens.input,
        outputTokens: analysisTokens.output,
        recordedCostUsd: analysisTokens.costUsd > 0 ? analysisTokens.costUsd : null,
        usageAt: new Date(),
        metadata: { passageId: passage.id, generationPlan, fastPath: true, calls: resilient.usages.length },
      });
    }

    // 품질 게이트: 본문(passage)이 결정론 폴백이거나 확보 섹션이 너무 적으면(=AI 사실상 실패)
    // COMPLETED·과금하지 않고 환불 + FAILED 로 흘린다. 체크포인트는 보존돼 재시도가 완성분을 이어받는다.
    const degraded =
      resilient.completeness.fallback.includes("passage") ||
      resilient.completeness.present.length < 4;
    if (degraded) {
      const refundCost = getPassageAnalysisCreditCost({ includeWorksheet });
      if (creditTxId) {
        await refundCredits(
          job.academyId,
          "PASSAGE_ANALYSIS",
          creditTxId,
          "Resilient passage analysis incomplete — refunded",
          refundCost,
        ).catch((refundErr) => console.error("Fast analysis incomplete refund failed", refundErr));
      }
      await prisma.workbenchAiJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          failedCount: 1,
          errorMessage:
            "일시적인 AI 문제로 분석을 완성하지 못했어요. 크레딧은 환불됐어요. 잠시 후 다시 시도하면 만들어 둔 부분을 이어서 완성합니다.",
          result: JSON.parse(JSON.stringify({
            debugTiming: { queueWaitMs: 0, creditMs, generationMs, persistenceMs: 0, totalRunMs: Date.now() - requestStartedAt, fastPath: true },
            checkpoint: resilientCheckpoint,
            partial: true,
            resilient: {
              complete: resilient.completeness.complete,
              present: resilient.completeness.present,
              missing: resilient.completeness.missing,
              fallback: resilient.completeness.fallback,
              rounds: resilient.rounds,
            },
          })),
          completedAt: new Date(),
        },
      });
      return NextResponse.json(
        {
          error: "Passage analysis incomplete",
          code: "PASSAGE_ANALYSIS_INCOMPLETE",
          details: "일시적인 AI 문제로 분석을 완성하지 못했어요. 크레딧은 환불됐어요. 다시 시도해주세요.",
          completeness: resilient.completeness,
        },
        { status: 502 },
      );
    }

    // ── 실전 학습지 한 번에 생성 (옵트인) ──────────────────────────────
    // 기본 분석 성공 후 워크북(어법 선택·어휘 빈칸·배열) + 수능추론을 생성해
    // learning-worksheet 섹션을 풀 콘텐츠로 교체한다. 워크시트만 실패하면
    // 기본 학습지는 그대로 저장하고 워크시트 몫만 환불한다.
    let worksheetFailed = false;
    if (includeWorksheet) {
      // 학습지도 코어와 동일한 회복형 — 워크북·수능추론 유닛을 다중 라운드로 끝까지 완성한다.
      // 같은 300s 벽을 공유하므로 데드라인(285s)을 두고 내부 호출이 self-abort 하게 한다.
      const worksheet = await generateLearningWorksheetResilient(
        {
          passageContent: passage.content,
          schoolType: (passage.school?.type as "MIDDLE" | "HIGH" | undefined) ?? null,
          grade: passage.grade,
        },
        primeReport,
        { deadlineAt: requestStartedAt + 285_000 },
      );
      // 유효한 학습지 섹션일 때만 교체한다. null(유효한 학습지 생성 실패)이면 기존 코어
      // learning-worksheet(있으면)를 그대로 두거나 섹션을 비운다 — 무효 섹션 저장 금지.
      if (worksheet.section) {
        primeReport = {
          ...primeReport,
          sections: [
            ...primeReport.sections.filter((s) => s.kind !== "learning-worksheet"),
            worksheet.section,
          ],
        } as AnalysisReport;
      }
      // 학습지 LLM 호출(워크북+추론, 라운드별) 토큰 합산 기록.
      const wsTokens = worksheet.usages.reduce(
        (acc, u) => {
          const t = readAiUsageTokens(u.usage);
          const c = readAiUsageCost(u.usage);
          acc.input += t.inputTokens;
          acc.output += t.outputTokens;
          if (c.costUsd) acc.costUsd += c.costUsd;
          return acc;
        },
        { input: 0, output: 0, costUsd: 0 },
      );
      if (wsTokens.input > 0 || wsTokens.output > 0) {
        const wsModelId = worksheet.usages.find((u) => u.modelId)?.modelId ?? "gemini-3.6-flash";
        await recordCostSafely({
          sourceKey: `workbench_ai_job:${job.id}:worksheet`,
          sourceId: job.id,
          sourceDetail: "PASSAGE_ANALYSIS_WORKSHEET",
          academyId: job.academyId,
          provider: providerFromModel(wsModelId),
          model: wsModelId,
          inputTokens: wsTokens.input,
          outputTokens: wsTokens.output,
          recordedCostUsd: wsTokens.costUsd > 0 ? wsTokens.costUsd : null,
          usageAt: new Date(),
          metadata: { passageId: passage.id, generationPlan, fastPath: true, calls: worksheet.usages.length },
        });
      }
      // 두 유닛 모두 못 만든 경우(=실전 학습지 가치 전무)에만 워크시트 몫 환불. 부분(워크북/추론
      // 하나라도 확보)은 제공된 것으로 본다. 기본 분석은 항상 그대로 저장된다.
      if (worksheet.present.length === 0) {
        worksheetFailed = true;
        if (creditTxId) {
          await refundCredits(
            job.academyId,
            "PASSAGE_ANALYSIS",
            creditTxId,
            "실전 학습지 생성 실패 — 기본 학습지는 저장, 워크시트 몫 환불",
            worksheetCost,
          ).catch((refundErr) => console.error("Fast analysis worksheet refund failed", refundErr));
        }
      }
    }

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
          includeWorksheet,
          worksheetFailed,
          debugTiming,
          fastPath: true,
          // 회복형 생성 진단 — 어느 섹션을 부분구제/재생성/폴백했는지, 완성 여부.
          resilient: {
            complete: resilient.completeness.complete,
            present: resilient.completeness.present,
            missing: resilient.completeness.missing,
            fallback: resilient.completeness.fallback,
            rounds: resilient.rounds,
            draftUsed: resilient.draftUsed,
          },
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
      includeWorksheet,
      worksheetFailed,
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

    // 청구 총액(분석 + 옵트인 워크시트 몫) 그대로 환불 — 부분 환불은 위의
    // worksheetFailed 경로에서만 발생하고, 여기는 기본 분석 자체가 실패한 경우다.
    const creditCost = getPassageAnalysisCreditCost({ includeWorksheet });
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
        result: JSON.parse(JSON.stringify({
          debugTiming: {
            queueWaitMs: 0,
            creditMs,
            generationMs,
            persistenceMs,
            totalRunMs: Date.now() - requestStartedAt,
            fastPath: true,
          },
          // 부분 진행분 보존 — 다음 시도가 완성된 섹션을 건너뛰고 이어받게.
          ...(resilientCheckpoint ? { checkpoint: resilientCheckpoint, partial: true } : {}),
        })),
        completedAt: new Date(),
      },
    });

    return NextResponse.json(
      { error: "Passage analysis failed", details: classified.message, code: classified.code },
      { status: classified.status },
    );
  }
}
