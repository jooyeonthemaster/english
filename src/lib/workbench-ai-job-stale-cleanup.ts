import type { Prisma } from "@prisma/client";

import { CREDIT_COSTS, type OperationType } from "@/lib/credit-costs";
import { refundCredits } from "@/lib/credits";
import { EXAM_REPORT_JOB_DOMAIN } from "@/lib/exam-report/types";
import { AI_PASSAGE_AUTHORING_JOB_DOMAIN } from "@/lib/passage-authoring/schema";
import { prisma } from "@/lib/prisma";

// fastPath 잡은 maxDuration=300s 인라인 함수 안에서만 실행된다(passage-analysis/fast
// route.ts). 즉 startedAt 이 300s 를 넘긴 fastPath+triggerRunId=null 행은 실행 주체가
// 이미 죽은 것이 증명된다 — 360s 는 그 벽에 60s 여유를 둔 값이라 살아 있는 잡을
// 오살하지 않는다. 10분이던 값을 6분으로 좁힌 이유: dev 재시작으로 남은 PROCESSING
// 좀비 행이 같은 지문의 모든 재시도를 활성-잡 가드로 밀어내 "분석 중"에 갇히게
// 했다(26-07-25 실사고 — 스트리밍이 고장난 것처럼 보인 원인 중 하나).
const FAST_PATH_STALE_MS = 6 * 60 * 1000;
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
  /** 편/문항 단위 과금 도메인의 부분 인도 판정용. */
  requestedCount: number;
  successCount: number;
};

function isOperationType(value: unknown): value is OperationType {
  return typeof value === "string" && value in CREDIT_COSTS;
}

/**
 * 부분 환불(=인도분 유지)을 적용할 도메인인지. **PASSAGE_AUTHORING 전용**이다.
 *
 * 왜 도메인을 명시적으로 좁히는가 — "원 거래액 == 단가 × requestedCount" 같은
 * 구조적 추론으로 넓히면 다른 도메인까지 조용히 환불 정책이 바뀐다. 실제로
 * EXAM_REPORT 는 route-db 가 실행 중 successCount 를 점진 동기화하므로 좀비 잡이
 * successCount > 0 을 갖고, 문항 수가 15 이상이면 "단가 × requested" 와도 일치한다.
 * 그 경로에서 전액 환불이 부분 환불로 바뀌면 아래 revokeExamReportPaidFullRun
 * (환불이 실제 실행된 잡에서만 과금 흔적을 회수한다)의 전제가 깨져,
 * 과거 적대 검수가 CRITICAL 로 잡았던 "전액 환불 + 전량 무료 재분석 = 과금 0"
 * 언더차지 누수가 되살아난다. 요청받지 않은 기존 매출 경로는 건드리지 않는다.
 */
function isPerUnitDeliveryDomain(domain: string): boolean {
  return domain === AI_PASSAGE_AUTHORING_JOB_DOMAIN;
}

/**
 * 이 잡이 "단가 × requestedCount" 로 과금된 **단위 과금**인지 판정한다.
 * 원 거래 금액이 그 곱과 정확히 일치할 때에만 참이다 — 금액이 어긋나면(할인·
 * floor·가변 청구) 부분 환불 계산이 성립하지 않으므로 기존 전액 환불로 되돌린다.
 */
function unitPriceIfPerUnitCharge(
  operationType: OperationType,
  chargedAmount: number,
  requestedCount: number,
): number | null {
  const unit = CREDIT_COSTS[operationType];
  if (!Number.isFinite(unit) || unit <= 0) return null;
  if (!Number.isFinite(requestedCount) || requestedCount <= 0) return null;
  return Math.abs(chargedAmount) === unit * requestedCount ? unit : null;
}

/**
 * 좀비 잡의 환불. **이미 전달된 산출물만큼은 환불하지 않는다.**
 *
 * 왜: PASSAGE_AUTHORING 같은 편당 과금 도메인은 한 편이 끝날 때마다 결과를 잡
 * result 에 저장하므로, 실행이 중간에 죽어도 완성된 편은 사용자가 그대로 지문함에
 * 넣을 수 있다. 그런데 리퍼가 전액(2N)을 돌려주면 "지문 4편을 0크레딧에 획득"이
 * 되어 과금해야 할 매출이 그대로 샌다(적대 검수 지적).
 * → successCount 만큼을 환불액에서 뺀다. 단, 그 계산은 단위 과금이 증명된
 *   경우에만 적용한다(unitPriceIfPerUnitCharge).
 */
async function refundStaleJobCharge(job: StaleJobForRefund): Promise<boolean> {
  if (!job.creditTxId) return false;

  const original = await prisma.creditTransaction.findUnique({
    where: { id: job.creditTxId },
    select: {
      academyId: true,
      type: true,
      operationType: true,
      amount: true,
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

  let costOverride: number | undefined;
  if (isPerUnitDeliveryDomain(job.domain) && job.successCount > 0) {
    const unit = unitPriceIfPerUnitCharge(
      original.operationType,
      original.amount,
      job.requestedCount,
    );
    if (unit !== null) {
      const undelivered = Math.max(0, job.requestedCount - job.successCount);
      // 전부 전달됐다면 돌려줄 것이 없다 — 환불 자체를 건너뛴다.
      if (undelivered === 0) return false;
      costOverride = unit * undelivered;
    }
  }

  const refundedAmount = await refundCredits(
    job.academyId,
    original.operationType,
    job.creditTxId,
    STALE_JOB_MESSAGE,
    costOverride,
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
      // 부분 인도 판정용(편당 과금 도메인의 부분 환불·PARTIAL 마감).
      requestedCount: true,
      successCount: true,
    },
  });

  let failed = 0;
  let refunded = 0;
  let refundFailed = 0;

  for (const job of jobs) {
    // 이미 일부를 전달한 잡을 FAILED 로 뒤집으면 "결과가 4편 남아 있는데 생성
    // 실패"라고 표시된다 → 인도분이 있으면 PARTIAL 로 마감하고 미인도 편수를
    // failedCount 로 적는다(전체 실패 경로는 기존 값 그대로).
    // 부분 환불과 동일하게 PASSAGE_AUTHORING 으로만 좁힌다 — 다른 도메인의 좀비
    // 마감 상태를 바꾸면 그 도메인 UI/재실행 분기가 조용히 달라진다(무회귀 계약).
    const delivered =
      isPerUnitDeliveryDomain(job.domain) &&
      job.successCount > 0 &&
      job.requestedCount > 0;
    const undelivered = Math.max(0, job.requestedCount - job.successCount);
    const jobData = delivered
      ? {
          ...data,
          status: undelivered === 0 ? "COMPLETED" : "PARTIAL",
          failedCount: undelivered,
          ...(undelivered === 0 ? { errorMessage: null } : {}),
        }
      : data;
    const updated = await prisma.workbenchAiJob.updateMany({
      where: {
        ...where,
        id: job.id,
      },
      data: jobData,
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
      // fastPath 6분(startedAt, FAST_PATH_STALE_MS) 규칙과 trigger-backed 2시간
      // 규칙은 불변.
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
