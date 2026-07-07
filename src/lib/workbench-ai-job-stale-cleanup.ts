import type { Prisma } from "@prisma/client";

import { CREDIT_COSTS, type OperationType } from "@/lib/credit-costs";
import { refundCredits } from "@/lib/credits";
import { EXAM_REPORT_JOB_DOMAIN } from "@/lib/exam-report/types";
import { prisma } from "@/lib/prisma";

const FAST_PATH_STALE_MS = 10 * 60 * 1000;
const TRIGGERLESS_STALE_MS = 15 * 60 * 1000;
const TRIGGER_BACKED_STALE_MS = 2 * 60 * 60 * 1000;

const STALE_JOB_MESSAGE =
  "Stale AI job auto-cleaned after timeout. Please run it again.";

type CleanupStaleWorkbenchAiJobsInput = {
  // Optional so a scheduled global reaper can clean every academy in one pass.
  // When omitted, the academyId filter is dropped from the WHERE clause.
  academyId?: string;
  domain?: string;
  passageId?: string;
  now?: Date;
};

type StaleJobForRefund = {
  id: string;
  academyId: string;
  creditTxId: string | null;
  domain: string;
  config: Prisma.JsonValue;
};

function isOperationType(value: unknown): value is OperationType {
  return typeof value === "string" && value in CREDIT_COSTS;
}

async function refundStaleJobCharge(job: StaleJobForRefund): Promise<boolean> {
  if (!job.creditTxId) return false;

  const original = await prisma.creditTransaction.findUnique({
    where: { id: job.creditTxId },
    select: {
      academyId: true,
      type: true,
      operationType: true,
    },
  });
  if (
    !original ||
    original.academyId !== job.academyId ||
    original.type !== "CONSUMPTION" ||
    !isOperationType(original.operationType)
  ) {
    throw new Error(`Invalid stale job credit transaction: ${job.creditTxId}`);
  }

  const refundedAmount = await refundCredits(
    job.academyId,
    original.operationType,
    job.creditTxId,
    STALE_JOB_MESSAGE,
  );
  return refundedAmount > 0;
}

/**
 * 도메인 특화 훅(EXAM_REPORT 전용): 리퍼가 잡을 FAILED+전액환불 처리해도
 * examAnalysis.aiMeta 의 paidFullRun(첫 실행 전액과금 흔적)은 도메인 상태라 리퍼가
 * 모른 채 잔존한다 — 잔존하면 다음 재실행이 전 문항을 무료(freeKeys) 처리해
 * "전액 환불 + 전량 무료 재분석 = 최종 과금 0" 언더차지 누수(적대 검수 CRITICAL).
 * 환불이 실제 실행된 잡에 한해 과금 흔적을 함께 회수한다. 실패는 무해 무시(로그만)
 * — 잡 FAILED/환불 자체는 이미 완료된 상태라 되돌리지 않는다.
 */
async function revokeExamReportPaidFullRun(job: StaleJobForRefund): Promise<void> {
  if (job.domain !== EXAM_REPORT_JOB_DOMAIN) return;
  const cfg =
    job.config && typeof job.config === "object" && !Array.isArray(job.config)
      ? (job.config as Record<string, unknown>)
      : null;
  const examAnalysisId = cfg?.examAnalysisId;
  if (typeof examAnalysisId !== "string" || examAnalysisId.length === 0) return;
  try {
    const row = await prisma.examAnalysis.findFirst({
      where: { id: examAnalysisId, academyId: job.academyId },
      select: { aiMeta: true },
    });
    if (!row) return;
    const base =
      row.aiMeta && typeof row.aiMeta === "object" && !Array.isArray(row.aiMeta)
        ? { ...(row.aiMeta as Record<string, unknown>) }
        : {};
    // 회수할 흔적이 없으면 쓰기 생략(불필요한 version 증가·경합 회피).
    if (base.paidFullRun !== true) return;
    await prisma.examAnalysis.update({
      where: { id: examAnalysisId },
      data: {
        aiMeta: { ...base, paidFullRun: false } as Prisma.InputJsonValue,
        version: { increment: 1 },
      },
    });
  } catch (error) {
    console.error("[workbench-ai-job-stale-cleanup] paidFullRun revoke failed", {
      jobId: job.id,
      examAnalysisId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function failStaleJobsWithRefund({
  where,
  data,
}: {
  where: Prisma.WorkbenchAiJobWhereInput;
  data: Prisma.WorkbenchAiJobUpdateManyMutationInput;
}) {
  const jobs = await prisma.workbenchAiJob.findMany({
    where,
    select: {
      id: true,
      academyId: true,
      creditTxId: true,
      // EXAM_REPORT paidFullRun 회수 훅용 — 도메인 판별 + examAnalysisId 추출.
      domain: true,
      config: true,
    },
  });

  let failed = 0;
  let refunded = 0;
  let refundFailed = 0;

  for (const job of jobs) {
    const updated = await prisma.workbenchAiJob.updateMany({
      where: {
        ...where,
        id: job.id,
      },
      data,
    });
    if (updated.count === 0) continue;
    failed += 1;

    try {
      if (await refundStaleJobCharge(job)) {
        refunded += 1;
        // 환불이 실제 실행된 EXAM_REPORT 잡만 — 분석행의 전액과금 흔적(paidFullRun)을
        // 함께 회수해 "전액 환불 + 무료 재실행" 이중 혜택을 차단한다(도메인 특화 훅).
        await revokeExamReportPaidFullRun(job);
      }
    } catch (error) {
      refundFailed += 1;
      console.error("[workbench-ai-job-stale-cleanup] refund failed", {
        jobId: job.id,
        creditTxId: job.creditTxId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { failed, refunded, refundFailed };
}

export async function cleanupStaleWorkbenchAiJobs({
  academyId,
  domain,
  passageId,
  now = new Date(),
}: CleanupStaleWorkbenchAiJobsInput) {
  const baseWhere = {
    ...(academyId ? { academyId } : {}),
    deletedAt: null,
    status: { in: ["PENDING", "PROCESSING"] },
    ...(domain ? { domain } : {}),
    ...(passageId ? { passageId } : {}),
  };
  const failData = {
    status: "FAILED",
    failedCount: 1,
    errorMessage: STALE_JOB_MESSAGE,
    completedAt: now,
  };

  const fastPathCutoff = new Date(now.getTime() - FAST_PATH_STALE_MS);
  const triggerlessCutoff = new Date(now.getTime() - TRIGGERLESS_STALE_MS);
  const triggerBackedCutoff = new Date(
    now.getTime() - TRIGGER_BACKED_STALE_MS,
  );

  const fastPath = await failStaleJobsWithRefund({
    where: {
      ...baseWhere,
      triggerRunId: null,
      startedAt: { lt: fastPathCutoff },
      config: { path: ["fastPath"], equals: true },
    },
    data: failData,
  });
  const triggerless = await failStaleJobsWithRefund({
    where: {
      ...baseWhere,
      triggerRunId: null,
      createdAt: { lt: triggerlessCutoff },
      // 오살 방지: exam-report 자가연쇄처럼 15분을 넘겨 정상 진행 중인 잡은 배치
      // 커밋/펜스 갱신으로 updatedAt 이 계속 돈다 — createdAt 만 보면 살아있는
      // 체인을 FAILED+환불로 죽이므로 updatedAt 신선도(15분 무활동)도 함께 요구한다.
      // fastPath 10분(startedAt) 규칙과 trigger-backed 2시간 규칙은 불변.
      updatedAt: { lt: triggerlessCutoff },
    },
    data: failData,
  });
  const triggerBacked = await failStaleJobsWithRefund({
    where: {
      ...baseWhere,
      triggerRunId: { not: null },
      OR: [
        { startedAt: { lt: triggerBackedCutoff } },
        { startedAt: null, createdAt: { lt: triggerBackedCutoff } },
      ],
    },
    data: failData,
  });

  return {
    failed: fastPath.failed + triggerless.failed + triggerBacked.failed,
    fastPath: fastPath.failed,
    triggerless: triggerless.failed,
    triggerBacked: triggerBacked.failed,
    refunded: fastPath.refunded + triggerless.refunded + triggerBacked.refunded,
    refundFailed:
      fastPath.refundFailed +
      triggerless.refundFailed +
      triggerBacked.refundFailed,
  };
}
