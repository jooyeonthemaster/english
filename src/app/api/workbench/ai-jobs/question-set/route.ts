import { NextRequest, NextResponse } from "next/server";
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
import { generateQuestionSet } from "@/lib/question-sets/generate-set";
import { FEATURE_FLAGS } from "@/lib/feature-flags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const VOCAB_TYPES = new Set(["CONTEXT_MEANING", "SYNONYM", "ANTONYM"]);

const requestSchema = z.object({
  passageId: z.string().min(1),
  structuralMode: z
    .enum(["NONE", "SENTENCE_ORDER", "SENTENCE_INSERT"])
    .default("NONE"),
  setLabel: z.string().optional(),
  generationPlan: z.unknown().optional(),
  customPrompt: z.string().optional(),
  members: z
    .array(
      z.object({
        typeId: z.string().min(1),
        difficulty: z
          .enum(["BASIC", "INTERMEDIATE", "KILLER"])
          .default("INTERMEDIATE"),
        typeSettings: z.unknown().optional(),
      }),
    )
    .min(1)
    .max(8),
});

export async function POST(req: NextRequest) {
  if (!FEATURE_FLAGS.ENABLE_LONG_PASSAGE_SETS) {
    return NextResponse.json({ error: "장문 세트 기능이 비활성화되어 있습니다." }, { status: 403 });
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

  const passage = await prisma.passage.findFirst({
    where: { id: input.passageId, academyId: staff.academyId },
    select: { id: true, title: true },
  });
  if (!passage) {
    return NextResponse.json({ error: "Passage not found" }, { status: 404 });
  }

  const baseCreditCost = input.members.reduce(
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
      requestedCount: input.members.length,
      startedAt: new Date(),
      config: {
        mode: "SET",
        structuralMode: input.structuralMode,
        members: input.members.map((m) => ({
          typeId: m.typeId,
          difficulty: m.difficulty,
        })),
        setLabel: input.setLabel ?? null,
        generationPlan,
        customPrompt: input.customPrompt ?? "",
      },
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
        memberCount: input.members.length,
        structuralMode: input.structuralMode,
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
      structuralMode: input.structuralMode,
      setLabel: input.setLabel,
      generationPlan,
      customPrompt: input.customPrompt,
      members: input.members,
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
        "장문 세트 생성 실패",
        creditCost,
      ).catch(() => {});
    }
    const message = err instanceof Error ? err.message : "장문 세트 생성에 실패했습니다.";
    await prisma.workbenchAiJob.update({
      where: { id: job.id },
      data: { status: "FAILED", errorMessage: message, completedAt: new Date() },
    });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
