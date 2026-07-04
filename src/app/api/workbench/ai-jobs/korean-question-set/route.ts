// ============================================================================
// 국어 지문 세트 생성 라우트 — 영어 question-set/route.ts 의 병렬 KO 라우트
// ============================================================================
// 무회귀 우세안: 기존 영어 라우트(ENABLE_LONG_PASSAGE_SETS 플래그 게이트)는
// 무접촉으로 두고 KO 전용 라우트를 신설한다. KO 세트는 국어 라우트에서만
// 노출되므로 플래그 없이 자체 허용하되, 지문 subject=KOREAN 을 강제한다.
// 크레딧: 멤버수 × 단일 생성 단가 × KO_SET_CHARGE_ATTEMPTS 선차감 후,
// 실제 엔진 호출 횟수 기준 미사용분 환불(영어 세트 관행 미러).
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { getStaffSession } from "@/lib/auth";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import { InsufficientCreditsError, refundCredits } from "@/lib/credits";
import {
  getQuestionGenerationCreditCost,
  normalizeQuestionGenerationPlan,
} from "@/lib/question-generation-plans";
import { prisma } from "@/lib/prisma";
import { ensureWorkbenchAiJobCharged } from "@/lib/workbench-ai-job-credit";
import { cleanupStaleWorkbenchAiJobs } from "@/lib/workbench-ai-job-stale-cleanup";
import { isKoreanSubject, readKoKindFromTags } from "@/lib/korean/core/passage-meta";
import { generateKoQuestionSet } from "@/lib/korean/sets/generate";
import {
  KO_SET_CHARGE_ATTEMPTS,
  passageMeetsKoSetPreset,
  resolveKoSetPreset,
  resolveKoSetSlots,
} from "@/lib/korean/sets/presets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const requestSchema = z.object({
  passageId: z.string().min(1),
  presetId: z.string().min(1),
  difficulty: z.enum(["BASIC", "INTERMEDIATE", "KILLER"]).default("INTERMEDIATE"),
  generationPlan: z.unknown().optional(),
  customPrompt: z.string().optional(),
  /** 프리셋 슬롯 순서와 평행한 멤버별 오버라이드(난이도·플랜·세부설정). */
  memberOverrides: z
    .array(
      z.object({
        difficulty: z.enum(["BASIC", "INTERMEDIATE", "KILLER"]).optional(),
        generationPlan: z.enum(["STANDARD", "PREMIUM"]).optional(),
        typeSettings: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .optional(),
});

export async function POST(req: NextRequest) {
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
  const input = parsed.data;
  const generationPlan = normalizeQuestionGenerationPlan(input.generationPlan);

  const preset = resolveKoSetPreset(input.presetId);
  if (!preset) {
    return NextResponse.json({ error: "알 수 없는 국어 세트 프리셋입니다." }, { status: 400 });
  }

  const passage = await prisma.passage.findFirst({
    where: { id: input.passageId, academyId: staff.academyId },
    select: { id: true, title: true, content: true, subject: true, tags: true },
  });
  if (!passage) {
    return NextResponse.json({ error: "Passage not found" }, { status: 404 });
  }
  if (!isKoreanSubject(passage.subject)) {
    return NextResponse.json(
      { error: "국어 지문이 아닙니다 — 국어 세트는 국어 지문에서만 생성할 수 있습니다." },
      { status: 400 },
    );
  }

  // 갈래→슬롯 해석 + 최소 분량 사전검증 — 차감 전에 빠르게 거른다(생성기도 재검증).
  const passageKind = readKoKindFromTags(passage.tags);
  const resolution = resolveKoSetSlots(preset, passageKind);
  if (!resolution.ok) {
    return NextResponse.json({ error: resolution.reason }, { status: 400 });
  }
  const feasibility = passageMeetsKoSetPreset(passage.content, preset);
  if (!feasibility.ok) {
    return NextResponse.json({ error: feasibility.reason }, { status: 400 });
  }

  await cleanupStaleWorkbenchAiJobs({
    academyId: staff.academyId,
    domain: "QUESTION_GENERATION",
    passageId: passage.id,
  });

  const memberCount = resolution.members.length;
  const unitCreditCost = getQuestionGenerationCreditCost(
    CREDIT_COSTS.QUESTION_GEN_SINGLE,
    generationPlan,
  );
  const baseCreditCost = memberCount * unitCreditCost;
  const creditCost = baseCreditCost * KO_SET_CHARGE_ATTEMPTS;

  const job = await prisma.workbenchAiJob.create({
    data: {
      academyId: staff.academyId,
      createdById: staff.id,
      domain: "QUESTION_GENERATION",
      status: "PROCESSING",
      title: passage.title,
      passageId: passage.id,
      mode: "SET",
      generationPlan,
      requestedCount: memberCount,
      startedAt: new Date(),
      config: {
        mode: "SET",
        subject: "KOREAN",
        presetId: preset.id,
        passageKind,
        difficulty: input.difficulty,
        members: resolution.members.map((m, index) => ({
          typeId: m.typeId,
          points: m.points,
          difficulty:
            input.memberOverrides?.[index]?.difficulty ?? m.difficulty ?? input.difficulty,
          generationPlan: input.memberOverrides?.[index]?.generationPlan ?? generationPlan,
          typeSettings: input.memberOverrides?.[index]?.typeSettings ?? null,
        })),
        setLabel: preset.label,
        generationPlan,
        customPrompt: input.customPrompt ?? "",
      } as Prisma.InputJsonValue,
    },
  });

  let creditTxId: string | null = null;
  try {
    const credit = await ensureWorkbenchAiJobCharged({
      jobId: job.id,
      academyId: job.academyId,
      staffId: job.createdById,
      operationType: "QUESTION_GEN_SINGLE",
      metadata: {
        passageId: passage.id,
        mode: "SET",
        subject: "KOREAN",
        presetId: preset.id,
        memberCount,
        generationPlan,
        baseCreditCost,
        maxChargeAttempts: KO_SET_CHARGE_ATTEMPTS,
        creditCost,
      },
      creditCost,
    });
    creditTxId = credit.transactionId;

    const result = await generateKoQuestionSet({
      academyId: staff.academyId,
      staffId: staff.id,
      jobId: job.id,
      passageId: passage.id,
      presetId: preset.id,
      generationPlan,
      customPrompt: input.customPrompt,
      difficulty: input.difficulty,
      memberOverrides: input.memberOverrides,
    });

    // 미사용분 환불 — 선차감(멤버수×KO_SET_CHARGE_ATTEMPTS=멤버당 실호출 상한)
    // 대비 실제 엔진 호출 수 기준(KOSET-5: 상한 정합으로 초과 호출 무계상 0).
    const chargedCalls = memberCount * KO_SET_CHARGE_ATTEMPTS;
    const unusedCalls = Math.max(0, chargedCalls - result.generationCallCount);
    const unusedCreditCost = unusedCalls * unitCreditCost;
    let refundedUnusedCredits = 0;
    if (unusedCreditCost > 0) {
      refundedUnusedCredits = await refundCredits(
        job.academyId,
        "QUESTION_GEN_SINGLE",
        credit.transactionId,
        "국어 지문 세트 미사용 재시도분 환불",
        unusedCreditCost,
      ).catch(() => 0);
    }
    const creditsRemaining = credit.balanceAfter + refundedUnusedCredits;

    await prisma.workbenchAiJob.update({
      where: { id: job.id },
      data: {
        status: result.status === "DEGRADED" ? "PARTIAL" : "COMPLETED",
        successCount: result.questionIds.length,
        resultCount: result.questionIds.length,
        result: JSON.parse(JSON.stringify(result)),
        completedAt: new Date(),
      },
    });

    return NextResponse.json({
      jobId: job.id,
      ...result,
      creditsRemaining,
    });
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      await prisma.workbenchAiJob.update({
        where: { id: job.id },
        data: { status: "FAILED", errorMessage: "Insufficient credits", completedAt: new Date() },
      });
      return NextResponse.json(
        { error: "Insufficient credits", balance: err.currentBalance, required: err.requiredCredits },
        { status: 402 },
      );
    }
    if (creditTxId) {
      await refundCredits(
        job.academyId,
        "QUESTION_GEN_SINGLE",
        creditTxId,
        "국어 지문 세트 생성 실패",
        creditCost,
      ).catch(() => {});
    }
    const message = err instanceof Error ? err.message : "국어 지문 세트 생성에 실패했습니다.";
    await prisma.workbenchAiJob.update({
      where: { id: job.id },
      data: { status: "FAILED", errorMessage: message, completedAt: new Date() },
    });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
