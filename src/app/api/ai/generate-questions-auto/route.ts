import { NextRequest, NextResponse } from "next/server";

import { buildQuestionAnnotationBlock } from "@/lib/annotation-prompt";
import { getStaffSession } from "@/lib/auth";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import {
  InsufficientCreditsError,
  deductCredits,
  refundCredits,
} from "@/lib/credits";
import { prisma } from "@/lib/prisma";
import { generateQuestionObject } from "@/lib/question-generation-llm";
import {
  getQuestionGenerationCreditCost,
  normalizeQuestionGenerationPlan,
} from "@/lib/question-generation-plans";

import {
  buildAnalysisContext,
  extractTeacherAnnotations,
} from "./_lib/build-analysis-context";
import { DIFF_DESCRIPTION } from "./_lib/constants";
import { buildPlanningPrompt } from "./_lib/prompts";
import { runQuestionGeneration } from "./_lib/run-question-generation";
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
    const generationPlan = normalizeQuestionGenerationPlan(rawGenerationPlan);
    const creditCost = getQuestionGenerationCreditCost(
      CREDIT_COSTS.AUTO_GEN_BATCH,
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
        { error: "지문 분석이 완료된 지문만 문제 생성에 사용할 수 있습니다." },
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

    let allQuestions: Record<string, unknown>[] = [];
    let rationale = "";
    try {
      // ═══ STEP 1: AI plans question type distribution ═══
      console.log(
        "[AUTO-GEN] Step 1: Planning started for passage:",
        passage.title?.slice(0, 30),
      );
      const { object: planResult } = await generateQuestionObject({
        schema: planSchema,
        prompt: buildPlanningPrompt({
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

      console.log(
        "[AUTO-GEN] Step 1 done. Plan:",
        JSON.stringify(
          planResult.plan.map((p) => ({ type: p.subType, count: p.count })),
        ),
      );

      // ═══ STEP 2: Generate questions per type using existing structured schemas ═══
      allQuestions = await runQuestionGeneration({
        plan: planResult.plan,
        schoolType,
        gradeInfo,
        passageContent: passage.content,
        teacherIntentBlock,
        analysisContext,
        diffLabel,
        diffInstruction,
        generationPlan,
      });
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

    return NextResponse.json({
      questions: allQuestions,
      rationale,
      count: allQuestions.length,
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
