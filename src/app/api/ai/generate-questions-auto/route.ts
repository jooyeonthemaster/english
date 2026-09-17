import { NextRequest, NextResponse } from "next/server";

import { buildQuestionAnnotationBlock } from "@/lib/annotation-prompt";
import { getStaffSession } from "@/lib/auth";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import {
  isKoreanSubject,
  readKoKindFromTags,
} from "@/lib/korean/core/passage-meta";
import { buildKoPlanningPrompt } from "@/lib/korean/prompts/planning";
import {
  InsufficientCreditsError,
  deductCredits,
  refundCredits,
} from "@/lib/credits";
import { prisma } from "@/lib/prisma";
import { recordAiCost } from "@/lib/platform-api-costs";
import { generateQuestionObject } from "@/lib/question-generation-llm";
import {
  getQuestionGenerationCreditCost,
  normalizeQuestionGenerationPlan,
  resolveEffectiveGenerationPlan,
  withQuestionGenerationPlanMetadata,
} from "@/lib/question-generation-plans";

import {
  buildAnalysisContext,
  extractTeacherAnnotations,
} from "./_lib/build-analysis-context";
import { DIFF_DESCRIPTION } from "./_lib/constants";
import { buildPlanningPrompt } from "./_lib/prompts";
import { runQuestionGenerationWithEmptyRetry } from "./_lib/run-question-generation";
import { planSchema } from "./_lib/schemas";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    // ── Auth + Credit deduction ──
    const staff = await getStaffSession();
    if (!staff) {
      return NextResponse.json(
        { error: "인증이 필요합니다." },
        { status: 401 },
      );
    }

    const body = await request.json();
    const { passageId, count, difficulty, customPrompt, generationPlan: rawGenerationPlan } = body as {
      passageId: string;
      count: number;
      difficulty?: string;
      customPrompt?: string;
      generationPlan?: unknown;
    };
    // 26-08-18 난이도 기반 티어: KILLER 배치는 2배(결정 함수 단일 소스).
    const generationPlan = resolveEffectiveGenerationPlan(rawGenerationPlan, difficulty);
    // 자동 출제는 문제 1개당 단가 — 생성할 문제 수만큼 청구.
    const creditCost = getQuestionGenerationCreditCost(
      CREDIT_COSTS.AUTO_GEN_BATCH * Math.max(1, Math.floor(Number(count) || 1)),
      generationPlan,
    );

    let creditResult: { balanceAfter: number; transactionId: string };
    try {
      creditResult = await deductCredits(
        staff.academyId,
        "AUTO_GEN_BATCH",
        staff.id,
        { passageId, count, generationPlan, creditCost },
        creditCost,
      );
    } catch (err) {
      if (err instanceof InsufficientCreditsError) {
        return NextResponse.json(
          {
            error: "크레딧이 부족합니다",
            balance: err.currentBalance,
            required: err.requiredCredits,
          },
          { status: 402 },
        );
      }
      throw err;
    }

    const passage = await prisma.passage.findFirst({
      where: { id: passageId, academyId: staff.academyId },
      include: {
        school: { select: { type: true, name: true } },
        analysis: { select: { analysisData: true } },
        notes: { orderBy: { order: "asc" } },
      },
    });

    if (!passage) {
      await refundCredits(
        staff.academyId,
        "AUTO_GEN_BATCH",
        creditResult.transactionId,
        "Passage not found",
        creditCost,
      );
      return NextResponse.json(
        { error: "지문을 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    if (request.nextUrl.searchParams.get("requireAnalysis") === "true" && !passage.analysis) {
      await refundCredits(
        staff.academyId,
        "AUTO_GEN_BATCH",
        creditResult.transactionId,
        "Passage analysis required",
        creditCost,
      );
      return NextResponse.json(
        { error: "학습지 생성이 완료된 지문만 문제 생성에 사용할 수 있습니다." },
        { status: 400 },
      );
    }

    const schoolType = passage.school?.type === "MIDDLE" ? "중학교" : "고등학교";
    const gradeInfo = passage.grade ? `${passage.grade}학년` : "";

    // Teacher markings — fed to BOTH the planning step (so type/count
    // distribution reflects what the teacher emphasized) AND each generation
    // step (so the produced questions actually target the marked spans).
    const teacherAnnotations = extractTeacherAnnotations(passage);
    const teacherIntentBlock = buildQuestionAnnotationBlock(teacherAnnotations);
    const diffLabel = difficulty || "INTERMEDIATE";
    const diffInstruction =
      DIFF_DESCRIPTION[diffLabel] || DIFF_DESCRIPTION.INTERMEDIATE;

    const analysisContext = buildAnalysisContext(passage);

    // ── KO(국어) 게이트 — 지문 과목이 KOREAN 이면 플래닝·생성에 KO 컨텍스트 주입.
    // null/ENGLISH 지문은 아래 두 분기 모두 기존 영어 경로 byte 동일.
    const isKoreanPassage = isKoreanSubject(passage.subject);
    const koPassageKind = isKoreanPassage
      ? readKoKindFromTags(passage.tags)
      : null;

    let allQuestions: Record<string, unknown>[] = [];
    let rationale = "";
    const aiCostRecords: Array<{ model: string; usage: unknown }> = [];
    try {
      // ═══ STEP 1: AI plans question type distribution ═══
      console.log(
        "[AUTO-GEN] Step 1: Planning started for passage:",
        passage.title?.slice(0, 30),
      );
      const {
        object: planResult,
        usage: planUsage,
        modelId: planModelId,
      } = await generateQuestionObject({
        schema: planSchema,
        prompt: isKoreanPassage
          ? buildKoPlanningPrompt({
              schoolType,
              gradeInfo,
              count,
              passageContent: passage.content,
              teacherIntentBlock,
              analysisContext,
              customPrompt,
              diffLabel,
              passageKind: koPassageKind,
            })
          : buildPlanningPrompt({
              schoolType,
              gradeInfo,
              count,
              passageContent: passage.content,
              teacherIntentBlock,
              analysisContext,
              customPrompt,
              diffLabel,
              generationPlan,
            }),
        generationPlan,
        logPrefix: "AUTO-GEN-PLAN",
        maxTokens: 4_096,
      });
      rationale = planResult.rationale;
      aiCostRecords.push({ model: planModelId, usage: planUsage });

      console.log(
        "[AUTO-GEN] Step 1 done. Plan:",
        JSON.stringify(
          planResult.plan.map((p) => ({ type: p.subType, count: p.count })),
        ),
      );

      // ═══ STEP 2: Generate questions per type using existing structured schemas ═══
      const generationResult = await runQuestionGenerationWithEmptyRetry({
        plan: planResult.plan,
        schoolType,
        gradeInfo,
        passageContent: passage.content,
        teacherIntentBlock,
        analysisContext,
        diffLabel,
        diffInstruction,
        generationPlan,
        customPrompt,
        koPassageKind: koPassageKind ?? undefined,
      });
      allQuestions = generationResult.questions;
      // Step 2 의 모든 provider 호출(유형별·재시도·repair) 토큰을 수집.
      for (const usageEvent of generationResult.usageEvents) {
        aiCostRecords.push({ model: usageEvent.modelId, usage: usageEvent.usage });
      }
    } catch (aiError) {
      // Refund credits on AI failure
      await refundCredits(
        staff.academyId,
        "AUTO_GEN_BATCH",
        creditResult.transactionId,
        "Auto generation failed",
        creditCost,
      );
      throw aiError;
    }

    if (allQuestions.length === 0) {
      // Refund if no questions were produced
      await refundCredits(
        staff.academyId,
        "AUTO_GEN_BATCH",
        creditResult.transactionId,
        "No questions generated",
        creditCost,
      );
      return NextResponse.json({
        error: "문제 생성에 실패했습니다.",
        questions: [],
        creditsRemaining: creditResult.balanceAfter,
      });
    }

    const taggedQuestions = allQuestions.map((question) =>
      // 엔진의 문항별 스탬프(_generationPlan)를 우선한다 — KO 동결 등으로 실제
      // 실행 레인이 요청 플랜과 다를 수 있다(fast/trigger 경로와 동일 규칙).
      withQuestionGenerationPlanMetadata(
        question,
        normalizeQuestionGenerationPlan(
          (question as { _generationPlan?: unknown })._generationPlan ??
            generationPlan,
        ),
      ),
    );

    // 계획(Step 1) + 유형별 생성(Step 2)의 모든 AI 호출 토큰을 원가 기록.
    for (const record of aiCostRecords) {
      await recordAiCost({
        sourceType: "AI_INTERACTIVE",
        sourceDetail: "generate-questions-auto",
        academyId: staff.academyId,
        model: record.model,
        operationType: "AUTO_GEN_BATCH",
        usage: record.usage,
      });
    }

    return NextResponse.json({
      questions: taggedQuestions,
      rationale,
      count: taggedQuestions.length,
      generationPlan,
      creditsRemaining: creditResult.balanceAfter,
    });
  } catch (error) {
    console.error("Auto question generation error:", error);
    return NextResponse.json(
      { error: "자동 문제 생성 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
