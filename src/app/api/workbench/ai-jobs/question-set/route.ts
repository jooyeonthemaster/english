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
import { generateQuestionSet } from "@/lib/question-sets/generate-set";
import { passageMeetsPreset, resolvePreset } from "@/lib/question-sets/presets";
import { FEATURE_FLAGS } from "@/lib/feature-flags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const VOCAB_TYPES = new Set(["CONTEXT_MEANING", "SYNONYM", "ANTONYM"]);

const requestSchema = z.object({
  passageId: z.string().min(1),
  presetId: z.string().min(1),
  difficulty: z.enum(["BASIC", "INTERMEDIATE", "KILLER"]).default("INTERMEDIATE"),
  generationPlan: z.unknown().optional(),
  customPrompt: z.string().optional(),
  /** 멤버별 오버라이드(프리셋 멤버 순서와 평행) — 난이도·세부설정 커스터마이즈. */
  memberOverrides: z
    .array(
      z.object({
        difficulty: z.enum(["BASIC", "INTERMEDIATE", "KILLER"]).optional(),
        typeSettings: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .optional(),
});

export async function POST(req: NextRequest) {
  if (!FEATURE_FLAGS.ENABLE_LONG_PASSAGE_SETS) {
    return NextResponse.json({ error: "지문 세트 기능이 비활성화되어 있습니다." }, { status: 403 });
  }

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

  const preset = resolvePreset(input.presetId);
  if (!preset) {
    return NextResponse.json({ error: "알 수 없는 세트 프리셋입니다." }, { status: 400 });
  }

  const passage = await prisma.passage.findFirst({
    where: { id: input.passageId, academyId: staff.academyId },
    select: { id: true, title: true, content: true },
  });
  if (!passage) {
    return NextResponse.json({ error: "Passage not found" }, { status: 404 });
  }

  // 최소 분량 사전검증 — 차감 전에 빠르게 거른다(생성기도 한 번 더 검증).
  const feasibility = passageMeetsPreset(passage.content, preset);
  if (!feasibility.ok) {
    return NextResponse.json({ error: feasibility.reason }, { status: 400 });
  }

  await cleanupStaleWorkbenchAiJobs({
    academyId: staff.academyId,
    domain: "QUESTION_GENERATION",
    passageId: passage.id,
  });

  const baseCreditCost = preset.members.reduce(
    (sum, m) =>
      sum +
      (VOCAB_TYPES.has(m.typeId)
        ? CREDIT_COSTS.QUESTION_GEN_VOCAB
        : CREDIT_COSTS.QUESTION_GEN_SINGLE),
    0,
  );
  const creditCost = getQuestionGenerationCreditCost(baseCreditCost, generationPlan);

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
      requestedCount: preset.members.length,
      startedAt: new Date(),
      config: {
        mode: "SET",
        presetId: preset.id,
        structuralMode: preset.structuralMode,
        difficulty: input.difficulty,
        members: preset.members.map((m) => ({
          typeId: m.typeId,
          difficulty: m.difficulty ?? input.difficulty,
          typeSettings: m.typeSettings ?? null,
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
        presetId: preset.id,
        memberCount: preset.members.length,
        structuralMode: preset.structuralMode,
        generationPlan,
        creditCost,
      },
      creditCost,
    });
    creditTxId = credit.transactionId;

    const result = await generateQuestionSet({
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
      creditsRemaining: credit.balanceAfter,
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
        "지문 세트 생성 실패",
        creditCost,
      ).catch(() => {});
    }
    const message = err instanceof Error ? err.message : "지문 세트 생성에 실패했습니다.";
    await prisma.workbenchAiJob.update({
      where: { id: job.id },
      data: { status: "FAILED", errorMessage: message, completedAt: new Date() },
    });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
