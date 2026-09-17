import { tasks } from "@trigger.dev/sdk/v3";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getStaffSession } from "@/lib/auth";
import {
  academyConcurrencyKey,
  WORKBENCH_PASSAGE_ANALYSIS_QUEUE_NAME,
} from "@/lib/concurrency-config";
import { prisma } from "@/lib/prisma";
import { normalizeAnalysisTone } from "@/lib/passage-analysis-options";
import { normalizeQuestionGenerationPlan } from "@/lib/question-generation-plans";
import { cleanupStaleWorkbenchAiJobs } from "@/lib/workbench-ai-job-stale-cleanup";
import { preflightCreditGate } from "@/lib/credit-preflight";
import { getPassageAnalysisCreditCost } from "@/lib/passage-analysis-credit-costs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  passageId: z.string().min(1),
  customPrompt: z.string().optional(),
  focusAreas: z.array(z.string()).optional(),
  targetLevel: z.string().optional(),
  generationPlan: z.unknown().optional(),
  analysisTone: z.unknown().optional(),
  forcePrimeReport: z.boolean().optional(),
  /** true 면 기본 분석에 이어 실전 학습지(06)까지 한 번에 생성·병합한다 (+5크레딧). */
  includeWorksheet: z.boolean().optional(),
  /**
   * true 면 기본 분석 대신 파이널 원페이지(A4 1장 족집게)만 생성한다 (◈5).
   * 이 라우트는 config 로 포워딩만 하고 실제 분기는 trigger 워커가 처리한다
   * (스펙 정본 .tmp-final-qa/final-onepage-spec.md §2).
   */
  finalOnepage: z.boolean().optional(),
  /**
   * [F1-M4] 직독직해 분석본 표식 — 이 인큐 라우트는 **처리하지 않는다**(400 명시
   * 거절, 아래 게이트). 스키마에 두는 이유: z.object 는 미정의 키를 무음 strip 하므로
   * 키가 없으면 reading 요청이 「주문 안 한 기본 분석」 잡으로 둔갑해 과금까지 됐다.
   * trigger 워커에는 reading 분기가 없다 — fast 라우트(passage-analysis/fast) 전용.
   */
  readingAnalysis: z.boolean().optional(),
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

  // [F1-M4] 직독직해는 fast 라우트 전용 — 잡 생성 **이전** 명시 거절. 무음 strip 이면
  // reading 주문이 기본 분석 잡으로 생성·과금되는 구멍이 된다(requestSchema 주석 참조).
  if (parsed.data.readingAnalysis === true) {
    return NextResponse.json(
      {
        error:
          "직독직해 분석본은 이 라우트에서 생성할 수 없습니다. fast 라우트(/api/workbench/ai-jobs/passage-analysis/fast)를 사용하세요.",
        code: "READING_FAST_ROUTE_ONLY",
      },
      { status: 400 },
    );
  }

  const passage = await prisma.passage.findFirst({
    where: { id: parsed.data.passageId, academyId: staff.academyId },
    select: { id: true, title: true },
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
  });
  if (active) {
    return NextResponse.json({ jobId: active.id, status: active.status });
  }

  const generationPlan = normalizeQuestionGenerationPlan(
    parsed.data.generationPlan,
  );
  const analysisTone = normalizeAnalysisTone(parsed.data.analysisTone);
  // 사전 잔액 게이트(잡 행 생성 전) — 워커가 과금 단계에서 FAILED 로 닫던 doomed
  // 잡을 만들지 않는다(26-09-08 전수조사). 최종 권위는 워커의 원자적 차감.
  const preflight = await preflightCreditGate({
    academyId: staff.academyId,
    requiredCredits: getPassageAnalysisCreditCost({
      includeWorksheet: parsed.data.includeWorksheet ?? false,
    }),
  });
  if (!preflight.ok) return preflight.response;
  const job = await prisma.workbenchAiJob.create({
    data: {
      academyId: staff.academyId,
      createdById: staff.id,
      domain: "PASSAGE_ANALYSIS",
      status: "PENDING",
      title: passage.title,
      passageId: passage.id,
      mode: "FULL",
      generationPlan,
      requestedCount: 1,
      config: {
        customPrompt: parsed.data.customPrompt ?? "",
        focusAreas: parsed.data.focusAreas ?? [],
        targetLevel: parsed.data.targetLevel ?? "",
        generationPlan,
        analysisTone,
        forcePrimeReport: parsed.data.forcePrimeReport ?? false,
        includeWorksheet: parsed.data.includeWorksheet ?? false,
        // 파이널 원페이지 표식 — 부재 시 키 자체가 실리지 않는다(기존 잡 config 무회귀).
        ...(parsed.data.finalOnepage === true ? { finalOnepage: true } : {}),
      },
    },
  });

  try {
    const handle = await tasks.trigger(
      "workbench-passage-analysis",
      { jobId: job.id },
      {
        idempotencyKey: `workbench-passage-analysis:${job.id}`,
        queue: WORKBENCH_PASSAGE_ANALYSIS_QUEUE_NAME,
        concurrencyKey: academyConcurrencyKey(staff.academyId),
      },
    );

    await prisma.workbenchAiJob.update({
      where: { id: job.id },
      data: { triggerRunId: handle.id },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to enqueue Trigger.dev task.";
    await prisma.workbenchAiJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        failedCount: 1,
        errorMessage: message,
        completedAt: new Date(),
      },
    });
    return NextResponse.json(
      { error: "Failed to enqueue passage analysis job", details: message },
      { status: 502 },
    );
  }

  return NextResponse.json({ jobId: job.id, status: "PENDING" });
}
