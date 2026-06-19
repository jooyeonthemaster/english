import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { buildQuestionAnnotationBlock } from "@/lib/annotation-prompt";
import { getStaffSession } from "@/lib/auth";
import { CREDIT_COSTS, type OperationType } from "@/lib/credit-costs";
import {
  InsufficientCreditsError,
  refundCredits,
} from "@/lib/credits";
import {
  providerFromModel,
  readAiUsageTokens,
  recordPlatformApiUsageCost,
} from "@/lib/platform-api-costs";
import {
  getQuestionGenerationCreditCost,
  mergeQuestionGenerationPlanTag,
  normalizeQuestionGenerationPlan,
} from "@/lib/question-generation-plans";
import { saveGeneratedQuestionsForJob } from "@/lib/question-generation-persistence";
import { prisma } from "@/lib/prisma";
import { ensureWorkbenchAiJobCharged } from "@/lib/workbench-ai-job-credit";
import { cleanupStaleWorkbenchAiJobs } from "@/lib/workbench-ai-job-stale-cleanup";
import {
  buildAnalysisContext,
  extractTeacherAnnotations,
} from "@/app/api/ai/generate-questions-auto/_lib/build-analysis-context";
import { DIFF_DESCRIPTION } from "@/app/api/ai/generate-questions-auto/_lib/constants";
import { runQuestionGenerationWithEmptyRetry } from "@/app/api/ai/generate-questions-auto/_lib/run-question-generation";
import { type PlanResult } from "@/app/api/ai/generate-questions-auto/_lib/schemas";
import { toUserFacingQuestionGenerationError } from "@/lib/question-generation-llm";
import { countPassageSentences } from "@/lib/passage-sentence-utils";
import { preflightQuestionFeasibility } from "@/lib/question-quality";
import {
  buildQuestionDiversityContext,
  type QuestionDiversityContext,
} from "@/lib/question-diversity";
import {
  readQuestionTypeDifficultySetting,
  readQuestionTypeGenerationPlanSetting,
  readIrrelevantSlotCountSetting,
  validateIrrelevantAgainstPassage,
} from "@/lib/question-type-generation-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 300s = 같은 앱의 다른 무거운 inline 경로(passage-analysis/fast·question-set·
// generate-questions-auto)와 동일. PREMIUM(Claude)은 1회 ~25~35s, 긴/어려운 지문은
// 교정 재시도+relaxed 폴백까지 다회 필요해 120s로는 데드라인에 잘려 실패했다.
export const maxDuration = 300;

const VOCAB_TYPES = new Set(["CONTEXT_MEANING", "SYNONYM", "ANTONYM"]);

const requestSchema = z.object({
  passageId: z.string().min(1),
  mode: z.literal("MANUAL").default("MANUAL"),
  count: z.number().int().min(1).max(1).default(1),
  questionType: z.string().optional(),
  questionTypeSettings: z.unknown().optional(),
  difficulty: z.string().default("INTERMEDIATE"),
  customPrompt: z.string().optional(),
  generationPlan: z.unknown().optional(),
  // 같은 배치에서 병렬 생성되는 N개 중 몇 번째인지 — 다양성(타깃/정답 위치 분산)용.
  variantIndex: z.number().int().min(0).max(99).optional(),
  variantCount: z.number().int().min(1).max(99).optional(),
});

function getOperationType({
  questionType,
}: {
  questionType?: string;
}): OperationType {
  return questionType && VOCAB_TYPES.has(questionType)
    ? "QUESTION_GEN_VOCAB"
    : "QUESTION_GEN_SINGLE";
}

function buildManualPlan({
  questionType,
  count,
}: {
  questionType?: string;
  count: number;
}): PlanResult["plan"] {
  if (!questionType) {
    throw new Error("Manual question generation requires questionType.");
  }
  return [
    {
      subType: questionType,
      count,
      reason: "Manual teacher-selected question type.",
      targetPoints: [],
    },
  ];
}

function readQuestionTags(rawTags: unknown): string[] {
  if (Array.isArray(rawTags)) {
    return rawTags.filter((tag): tag is string => typeof tag === "string");
  }
  if (typeof rawTags !== "string") return [];
  try {
    const parsed = JSON.parse(rawTags);
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === "string")
      : [];
  } catch {
    return rawTags
      .split(/[,;|]/)
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
}

async function recordCostSafely(input: {
  sourceKey: string;
  sourceId: string;
  sourceDetail: string;
  academyId: string;
  provider: ReturnType<typeof providerFromModel>;
  model: string;
  operationType: OperationType;
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
      operationType: input.operationType,
      unitType: "TOKENS",
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      usageAt: input.usageAt,
      metadata: input.metadata as Prisma.InputJsonValue,
    });
  } catch (error) {
    console.warn("[workbench-fast-question] Failed to record API cost", error);
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

  const config = {
    ...parsed.data,
    generationPlan: normalizeQuestionGenerationPlan(parsed.data.generationPlan),
  };
  const effectiveGenerationPlan =
    config.mode === "MANUAL" && config.questionType
      ? readQuestionTypeGenerationPlanSetting(
          config.questionTypeSettings,
          config.generationPlan,
        )
      : config.generationPlan;
  const effectiveDifficulty =
    config.mode === "MANUAL" && config.questionType
      ? readQuestionTypeDifficultySetting(
          config.questionTypeSettings,
          config.difficulty,
        )
      : readQuestionTypeDifficultySetting(undefined, config.difficulty);

  if (config.mode === "MANUAL" && !config.questionType) {
    return NextResponse.json(
      { error: "questionType is required for manual generation" },
      { status: 400 },
    );
  }

  const passage = await prisma.passage.findFirst({
    where: { id: config.passageId, academyId: staff.academyId },
    include: {
      school: { select: { type: true, name: true } },
      analysis: { select: { analysisData: true } },
      notes: { orderBy: { order: "asc" } },
    },
  });

  if (!passage) {
    return NextResponse.json({ error: "Passage not found" }, { status: 404 });
  }

  await cleanupStaleWorkbenchAiJobs({
    academyId: staff.academyId,
    domain: "QUESTION_GENERATION",
    passageId: passage.id,
  });

  // ── IRRELEVANT slot count guardrail (MANUAL mode only) ────────────────
  if (config.mode === "MANUAL" && config.questionType === "IRRELEVANT") {
    const requestedSlotCount = readIrrelevantSlotCountSetting(config.questionTypeSettings);
    const passageSentenceCount = countPassageSentences(passage.content);
    const v = validateIrrelevantAgainstPassage(requestedSlotCount, passageSentenceCount);
    if (!v.ok) {
      return NextResponse.json(
        {
          error: v.error,
          code: "IRRELEVANT_SLOT_COUNT_TOO_HIGH",
          passageSentenceCount,
          requestedSlotCount,
          maxSlotCount: v.effective,
        },
        { status: 400 },
      );
    }
  }

  // ── SHIP-FIRST 사전 적합성 게이트: 기계적 불가(예: SENTENCE_ORDER 문장수 부족)만
  // 차감·잡 생성 전에 거른다. 출제 포인트 품질 판단이 아니라 형식 불가능만 차단. ──
  if (config.mode === "MANUAL") {
    const feas = preflightQuestionFeasibility(
      config.questionType,
      effectiveDifficulty,
      passage.content,
    );
    if (!feas.ok) {
      return NextResponse.json(
        { error: feas.error, code: feas.code, ...feas.detail },
        { status: 400 },
      );
    }
  }

  // ── 사전 잔액 게이트 ──────────────────────────────────────────────
  // 잡 레코드를 만들기 전에 비차감(read-only) 잔액을 확인한다. 잔액이
  // 부족하면 FAILED 잡 행을 남기지 않고 즉시 402로 거절한다. (크레딧 0
  // 학원이 "전체 유형 일괄 생성"을 눌러 수천 건의 FAILED 행을 양산하던
  // 폭주 패턴을 차단 — 2026-06-09 단일 학원 1,482건 사건이 그 예.)
  // 최종 권위는 여전히 ensureWorkbenchAiJobCharged 의 원자적 차감(balance
  // gte)이며, 이 사전 체크는 doomed 잡 생성을 피하는 최적화일 뿐이다.
  const operationType = getOperationType(config);
  const creditCost = getQuestionGenerationCreditCost(
    CREDIT_COSTS[operationType],
    effectiveGenerationPlan,
  );
  const preflightBalance = await prisma.creditBalance.findUnique({
    where: { academyId: staff.academyId },
    select: { balance: true },
  });
  const availableBalance = preflightBalance?.balance ?? 0;
  if (availableBalance < creditCost) {
    return NextResponse.json(
      {
        error: "Insufficient credits",
        balance: availableBalance,
        required: creditCost,
      },
      { status: 402 },
    );
  }

  const now = new Date();
  const job = await prisma.workbenchAiJob.create({
    data: {
      academyId: staff.academyId,
      createdById: staff.id,
      domain: "QUESTION_GENERATION",
      status: "PROCESSING",
      title: passage.title,
      passageId: passage.id,
      mode: config.mode,
      questionType: config.questionType ?? null,
      generationPlan: effectiveGenerationPlan,
      difficulty: effectiveDifficulty,
      requestedCount: config.count,
      startedAt: now,
      config: {
        mode: config.mode,
        count: config.count,
        questionType: config.questionType ?? null,
        questionTypeSettings: config.questionTypeSettings ?? null,
        difficulty: effectiveDifficulty,
        customPrompt: config.customPrompt ?? "",
        generationPlan: effectiveGenerationPlan,
        fastPath: true,
      },
    },
  });

  let creditTxId: string | null = null;
  let creditMs = 0;
  const planningMs = 0;
  let generationMs = 0;
  let generationAttempts = 0;
  let persistenceMs = 0;
  let generationRejectionSummary: unknown = null;

  try {
    const creditStartedAt = Date.now();
    const credit = await ensureWorkbenchAiJobCharged({
      jobId: job.id,
      academyId: job.academyId,
      staffId: job.createdById,
      operationType,
      metadata: {
        passageId: passage.id,
        mode: config.mode,
        questionType: config.questionType,
        count: config.count,
        generationPlan: effectiveGenerationPlan,
        difficulty: effectiveDifficulty,
        creditCost,
        fastPath: true,
      },
      creditCost,
    });
    creditMs = Date.now() - creditStartedAt;
    creditTxId = credit.transactionId;

    const schoolType =
      passage.school?.type === "MIDDLE"
        ? "\uc911\ud559\uad50"
        : "\uace0\ub4f1\ud559\uad50";
    const gradeInfo = passage.grade ? `${passage.grade}\ud559\ub144` : "";
    const teacherAnnotations = extractTeacherAnnotations(passage);
    const teacherIntentBlock = buildQuestionAnnotationBlock(teacherAnnotations);
    const analysisContext = buildAnalysisContext(passage);
    const diffLabel = effectiveDifficulty;
    const diffInstruction =
      DIFF_DESCRIPTION[diffLabel] || DIFF_DESCRIPTION.INTERMEDIATE;

    // AUTO(플래너가 유형을 정하는) 모드는 제거됨 — 항상 교사가 지정한 단일
    // 유형으로 생성한다. (AUTO 는 프로덕션 실패율 48.9% 의 최악 경로였다.)
    const plan: PlanResult["plan"] = buildManualPlan({
      questionType: config.questionType,
      count: config.count,
    });
    const rationale = "";

    if (plan.length === 0) {
      throw new Error("No question generation plan was produced.");
    }

    // ── 다양성 컨텍스트: 같은 지문+유형의 기존 문항에서 사용된 타깃/정답 위치를
    // 추출해 회피 목록·위치 스티어링·보기 셔플을 활성화한다. 조회 실패는
    // 생성 자체를 막지 않는다 (빈 컨텍스트로 진행 — 셔플/배치 분산은 유지).
    // 단건 생성(variantCount<=1)은 결정형 오프셋이 위치를 고정시키므로
    // variantIndex 를 비워 무작위 분산을 쓰게 한다.
    const effectiveVariantIndex =
      (config.variantCount ?? 1) > 1 ? config.variantIndex : undefined;
    let diversity: QuestionDiversityContext = {
      bySubType: {},
      variantIndex: effectiveVariantIndex,
      variantCount: config.variantCount,
    };
    try {
      const planSubTypes = [...new Set(plan.map((item) => item.subType))];
      const recentQuestions = await prisma.question.findMany({
        where: {
          academyId: staff.academyId,
          passageId: passage.id,
          subType: { in: planSubTypes },
        },
        orderBy: { createdAt: "desc" },
        take: 40,
        select: { subType: true, structuredData: true, correctAnswer: true },
      });
      diversity = buildQuestionDiversityContext(recentQuestions, {
        variantIndex: effectiveVariantIndex,
        variantCount: config.variantCount,
      });
    } catch (error) {
      console.warn(
        "[workbench-fast-question] Failed to build diversity context",
        error,
      );
    }

    const generationStartedAt = Date.now();
    const generationResult = await runQuestionGenerationWithEmptyRetry(
      {
        plan,
        schoolType,
        gradeInfo,
        passageContent: passage.content,
        teacherIntentBlock,
        analysisContext,
        diffLabel,
        diffInstruction,
        generationPlan: effectiveGenerationPlan,
        customPrompt: config.customPrompt,
        typeSettings:
          config.mode === "MANUAL" && config.questionType
            ? { [config.questionType]: config.questionTypeSettings }
            : undefined,
        diversity,
      },
      {
        logPrefix: "WORKBENCH-FAST-Q-GEN",
        // Vercel maxDuration 300s. 270s 후엔 새 시도를 멈춰 함수 강제종료(잡 고아
        // → 환불 누락)를 막고, catch 에서 정상 실패+환불로 흐르게 한다. 30s 여유로
        // 후처리·저장·환불을 마친다. 느린 PREMIUM(Claude) 다수 재시도의 핵심 안전판.
        deadlineAt: requestStartedAt + 270_000,
      },
    );
    const questions = generationResult.questions;
    for (const [idx, event] of generationResult.usageEvents.entries()) {
      const usage = readAiUsageTokens(event.usage);
      await recordCostSafely({
        sourceKey: `workbench_ai_job:${job.id}:generation:${idx}`,
        sourceId: job.id,
        sourceDetail: `QUESTION_GENERATION:${event.subType}`,
        academyId: job.academyId,
        provider: providerFromModel(event.modelId),
        model: event.modelId,
        operationType,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        usageAt: new Date(),
        metadata: {
          passageId: passage.id,
          generationPlan: event.generationPlan ?? effectiveGenerationPlan,
          difficulty: event.difficulty ?? diffLabel,
          fastPath: true,
          qualityMode: event.qualityMode,
          attempts: event.attempts,
          durationMs: event.durationMs,
        },
      });
    }
    generationAttempts = generationResult.attempts;
    generationMs = Date.now() - generationStartedAt;
    const relaxedFallback = generationResult.relaxedFallback;
    generationRejectionSummary = generationResult.rejectionSummary;

    const questionsForDisplay = questions.slice(0, config.count).map((question) => {
      const questionPlan = normalizeQuestionGenerationPlan(
        question._generationPlan ?? effectiveGenerationPlan,
      );
      const tags = mergeQuestionGenerationPlanTag(
        readQuestionTags(question.tags),
        questionPlan,
      );
      return {
        ...question,
        _generationPlan: questionPlan,
        tags,
      };
    });

    if (questionsForDisplay.length === 0) {
      throw new Error(
        `No questions generated after ${generationAttempts} generation attempt${
          generationAttempts === 1 ? "" : "s"
        }. ${generationResult.rejectionSummary.message}`,
      );
    }

    const persistenceStartedAt = Date.now();
    const createdQuestionIds = await saveGeneratedQuestionsForJob({
      academyId: job.academyId,
      passageId: passage.id,
      questions: questionsForDisplay,
      generationPlan: effectiveGenerationPlan,
      skipPassageEligibilityCheck: true,
    });
    persistenceMs = Date.now() - persistenceStartedAt;

    const completedAt = new Date();
    const debugTiming = {
      queueWaitMs: 0,
      creditMs,
      planningMs,
      generationAttempts,
      relaxedFallback: relaxedFallback ? 1 : 0,
      generationMs,
      persistenceMs,
      totalRunMs: Date.now() - requestStartedAt,
    };

    await prisma.workbenchAiJob.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        successCount: questionsForDisplay.length,
        failedCount: 0,
        resultCount: questionsForDisplay.length,
        result: JSON.parse(JSON.stringify({
          passageId: passage.id,
          questions: questionsForDisplay,
          questionIds: createdQuestionIds,
          rationale,
          generationPlan: effectiveGenerationPlan,
          debugTiming,
          fastPath: true,
        })),
        completedAt,
      },
    });

    return NextResponse.json({
      jobId: job.id,
      status: "COMPLETED",
      questions: questionsForDisplay,
      questionIds: createdQuestionIds,
      generationPlan: effectiveGenerationPlan,
      creditsRemaining: credit.balanceAfter,
      createdAt: job.createdAt.toISOString(),
      completedAt: completedAt.toISOString(),
      debugTiming,
    });
  } catch (err) {
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

    if (creditTxId) {
      await refundCredits(
        job.academyId,
        operationType,
        creditTxId,
        "Fast workbench question generation failed",
        creditCost,
      ).catch((refundErr) => {
        console.error("Fast question generation refund failed", refundErr);
      });
    }

    const message =
      err instanceof Error ? err.message : "Question generation failed.";
    await prisma.workbenchAiJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        failedCount: 1,
        errorMessage: toUserFacingQuestionGenerationError(message),
        result: JSON.parse(JSON.stringify({
          passageId: passage.id,
          generationPlan: effectiveGenerationPlan,
          difficulty: effectiveDifficulty,
          rawError: message,
          debugTiming: {
            queueWaitMs: 0,
            creditMs,
            planningMs,
            generationAttempts,
            generationMs,
            persistenceMs,
            totalRunMs: Date.now() - requestStartedAt,
          },
          rejectionSummary: generationRejectionSummary,
          fastPath: true,
        })),
        completedAt: new Date(),
      },
    });

    return NextResponse.json(
      { error: "Question generation failed", details: message },
      { status: 500 },
    );
  }
}
