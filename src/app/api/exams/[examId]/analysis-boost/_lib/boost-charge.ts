// ============================================================================
// analysis-boost 라우트의 「잡 생성 + 과금」 단계 (W6 / v4)
//
// RUNNING 게이트가 잡힌 **직후**에만 호출된다 — 여기서 어떤 실패가 나든 게이트를
// FAILED 로 닫고 응답을 돌려준다(닫지 않으면 카드가 BOOST_STALE_MS 까지 글로우로
// 남고 모든 재시도가 409 를 받는다). 잡 생성 자체가 던지는 창(DB 장애·스키마 드리프트)
// 도 예전엔 try 밖이라 게이트가 6분간 열린 채 500 이었다 — JOB_CREATE_FAILED 로 닫는다.
// ============================================================================

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { InsufficientCreditsError } from "@/lib/credits";
import { ensureWorkbenchAiJobCharged } from "@/lib/workbench-ai-job-credit";
import { EXAM_ANALYSIS_BOOST_JOB_DOMAIN } from "@/lib/exam-scoring/boost";
import { BOOST_OPERATION, writeBoostResult, type BoostMeta } from "./boost-store";

export type BoostChargeResult =
  | { ok: true; jobId: string; creditTxId: string }
  | { ok: false; response: NextResponse };

/** 게이트 FAILED 닫기(격리 — 던지거나 안 실리면 로그만). */
async function closeGateFailed(opts: {
  analysisId: string;
  academyId: string;
  boost: BoostMeta;
  label: string;
}): Promise<void> {
  try {
    const closed = await writeBoostResult({
      analysisId: opts.analysisId,
      academyId: opts.academyId,
      analyses: [],
      boost: opts.boost,
    });
    if (!closed) console.error(`[analysis-boost] FAILED gate write did not land (${opts.label})`);
  } catch (writeErr) {
    console.error(`[analysis-boost] FAILED gate write threw (${opts.label})`, writeErr);
  }
}

export async function openBoostJobAndCharge(opts: {
  academyId: string;
  staffId: string;
  examId: string;
  examTitle: string;
  analysisId: string;
  questionCount: number;
  unitCost: number;
  totalCost: number;
  runningBoost: BoostMeta;
}): Promise<BoostChargeResult> {
  // ── 잡 생성(실패 = 게이트 FAILED + 500 JOB_CREATE_FAILED) ──────────────────
  let jobId: string;
  try {
    const job = await prisma.workbenchAiJob.create({
      data: {
        academyId: opts.academyId,
        createdById: opts.staffId,
        domain: EXAM_ANALYSIS_BOOST_JOB_DOMAIN,
        status: "PROCESSING",
        title: `AI 시험 분석 — ${opts.examTitle}`,
        requestedCount: opts.questionCount,
        startedAt: new Date(),
        config: {
          fastPath: true,
          examId: opts.examId,
          examAnalysisId: opts.analysisId,
          questionCount: opts.questionCount,
        },
      },
      select: { id: true },
    });
    jobId = job.id;
  } catch (err) {
    console.error("[analysis-boost] job create failed", err);
    await closeGateFailed({
      analysisId: opts.analysisId,
      academyId: opts.academyId,
      boost: {
        ...opts.runningBoost,
        status: "FAILED",
        completedAt: Date.now(),
        error: "JOB_CREATE_FAILED",
      },
      label: "job create",
    });
    return {
      ok: false,
      response: NextResponse.json(
        { error: "AI 분석을 시작하지 못했습니다.", code: "JOB_CREATE_FAILED" },
        { status: 500 },
      ),
    };
  }

  // ── 과금(N × 1cr, costOverride) — 402/차감 실패 = 게이트 FAILED + 잡 FAILED ──
  try {
    const credit = await ensureWorkbenchAiJobCharged({
      jobId,
      academyId: opts.academyId,
      staffId: opts.staffId,
      operationType: BOOST_OPERATION,
      metadata: {
        examId: opts.examId,
        examAnalysisId: opts.analysisId,
        questionCount: opts.questionCount,
        unitCost: opts.unitCost,
        creditCost: opts.totalCost,
        fastPath: true,
      },
      creditCost: opts.totalCost,
    });
    return { ok: true, jobId, creditTxId: credit.transactionId };
  } catch (err) {
    // 환불 없음(차감 자체가 실패).
    await closeGateFailed({
      analysisId: opts.analysisId,
      academyId: opts.academyId,
      boost: {
        ...opts.runningBoost,
        status: "FAILED",
        jobId,
        completedAt: Date.now(),
        error: "CHARGE_FAILED",
      },
      label: "charge",
    });
    const insufficient = err instanceof InsufficientCreditsError;
    try {
      await prisma.workbenchAiJob.update({
        where: { id: jobId },
        data: {
          status: "FAILED",
          failedCount: opts.questionCount,
          errorMessage: insufficient
            ? `Insufficient credits: have ${err.currentBalance}, need ${err.requiredCredits}`
            : err instanceof Error
              ? err.message
              : String(err),
          completedAt: new Date(),
        },
      });
    } catch (jobErr) {
      console.error("[analysis-boost] job FAILED update threw (charge)", jobErr);
    }
    if (insufficient) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "크레딧이 부족합니다.", balance: err.currentBalance, required: err.requiredCredits },
          { status: 402 },
        ),
      };
    }
    return {
      ok: false,
      response: NextResponse.json(
        { error: "AI 분석을 시작하지 못했습니다.", code: "CHARGE_FAILED" },
        { status: 500 },
      ),
    };
  }
}
