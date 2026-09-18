// ============================================================================
// 결제 관리 상단 카드 집계 — 3초 SSE 스트림이 반복 호출하므로 쿼리 수를 세어 가며 짠다.
// 매출 정의(D1)는 admin-revenue.ts 헬퍼가 단일 소스, 대기 분류는 admin-topup-progress.ts.
// 계약: docs/analytics/analytics-spec.md §9.2 F1·F2
// ============================================================================

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getTodayKST, getTomorrowKST } from "@/lib/date-utils";
import {
  PENDING_STALE_MINUTES,
  topUpGrossWhere,
  topUpRefundWhere,
} from "@/lib/admin-revenue";
import {
  BANK_DEPOSIT_MATCH_WINDOW_MINUTES,
  TOPUP_REVIEW_WINDOW_DAYS,
} from "@/lib/admin-topup-progress";

// 「확인 필요」 기간 상수는 클라이언트 공용 모듈(admin-topup-progress.ts)에 있다 —
// 이 파일은 server-only(admin-revenue) 를 끌고 오므로 클라이언트가 import 하면 번들이 깨진다.
export { TOPUP_REVIEW_WINDOW_DAYS };

/**
 * 결제 관리 상단 카드 집계. 매출 정의는 `admin-revenue.ts`(D1) 를 따른다.
 * - 오늘 = KST 자정~내일 자정. 결제액은 COMPLETED+REFUNDED 의 결제일 기준 gross, 환불은 환불일 기준 별도.
 * - 대기 = PENDING+WAITING_FOR_DEPOSIT. 시간창은 상태별로 다르다(admin-topup-progress.ts):
 *   PENDING 60분 · WAITING_FOR_DEPOSIT 은 무통장 자동매칭 창(기본 30분). 초과는 「미완료(이탈·만료)」.
 *   DB 상태는 바꾸지 않는다(D3) — 표시 분류만.
 * - 「확인 필요」의 실패·취소는 **주문 생성일**(createdAt) 기준, 환불만 **환불일**(admin-revenue D1) 기준이다.
 *   두 기준을 「같은 기간」으로 뭉뚱그리면 사실이 아니다(실측 26-09-18: 생성일 7일 취소 10건 vs
 *   이벤트일 7일 56건) — 화면 문구도 기준을 나눠 쓴다.
 */
export interface AdminTopUpStats {
  /** 오늘(KST) 결제 완료 건수(이후 환불된 건 포함) */
  todayCount: number;
  /** 오늘(KST) 결제액 gross = Σ COALESCE(paidAmount, price) */
  todayRevenue: number;
  todayCredits: number;
  /** 오늘(KST) 환불(환불일 기준) */
  todayRefundCount: number;
  todayRefundAmount: number;
  /** 전체 기간 COMPLETED(환불 제외) */
  completedCount: number;
  completedRevenue: number;
  completedCredits: number;
  /** 시간창 이내 PENDING+WAITING — 결제·입금 진행 중 */
  pendingActiveCount: number;
  /** 시간창 초과 PENDING+WAITING — 이탈·만료(매출 아님) */
  pendingStaleCount: number;
  /** 미완료 주문의 주문금액 합(price) — 참고용, 매출 아님 */
  pendingStaleAmount: number;
  /** PENDING(결제창 이탈) 판정 시간창(분) */
  pendingStaleMinutes: number;
  /** WAITING_FOR_DEPOSIT(무통장 입금) 판정 시간창(분) */
  bankStaleMinutes: number;
  /** 최근 reviewWindowDays 일 **생성** 주문 중 FAILED */
  failedCount: number;
  /** 최근 reviewWindowDays 일 **생성** 주문 중 CANCELLED */
  cancelledCount: number;
  /** 최근 reviewWindowDays 일 **환불일** 기준 환불 건수(admin-revenue 정의) */
  refundedCount: number;
  reviewWindowDays: number;
}

/**
 * where 에 걸리는 충전 건의 Σ COALESCE(paidAmount, price) — admin-revenue.ts `topUpAmount` 와 같은 값.
 * 3초 스트림이 매번 부르므로 행을 읽지 않고 집계 2번으로 계산한다.
 */
async function sumTopUpAmounts(where: Prisma.CreditTopUpWhereInput) {
  const [withPaid, withoutPaid] = await Promise.all([
    prisma.creditTopUp.aggregate({
      where: { AND: [where, { paidAmount: { not: null } }] },
      _sum: { paidAmount: true, creditAmount: true },
      _count: true,
    }),
    prisma.creditTopUp.aggregate({
      where: { AND: [where, { paidAmount: null }] },
      _sum: { price: true, creditAmount: true },
      _count: true,
    }),
  ]);
  return {
    count: withPaid._count + withoutPaid._count,
    amount: (withPaid._sum.paidAmount ?? 0) + (withoutPaid._sum.price ?? 0),
    credits: (withPaid._sum.creditAmount ?? 0) + (withoutPaid._sum.creditAmount ?? 0),
  };
}

/**
 * 대기(PENDING/WAITING) 분류 — 행을 읽지 않고 한 문장으로 센다.
 * 이전 구현은 PENDING/WAITING 전 행을 findMany 로 읽었는데, 만료 배치가 금지(D3)라
 * 이 집합은 줄어들 수단이 없고 3초 스트림이 매 틱 전부 전송했다.
 * 시간창은 상태별로 다르다(PENDING 60분 / 무통장 30분) — admin-topup-progress.ts 가 단일 소스.
 */
async function getPendingProgressCounts(now: number) {
  const pendingCutoff = new Date(now - PENDING_STALE_MINUTES * 60_000);
  const bankCutoff = new Date(now - BANK_DEPOSIT_MATCH_WINDOW_MINUTES * 60_000);
  const rows = await prisma.$queryRaw<
    Array<{ active: bigint; stale: bigint; staleAmount: bigint | number | null }>
  >`
    SELECT
      COUNT(*) FILTER (
        WHERE ("status" = 'PENDING' AND "createdAt" >= ${pendingCutoff})
           OR ("status" = 'WAITING_FOR_DEPOSIT' AND "createdAt" >= ${bankCutoff})
      ) AS "active",
      COUNT(*) FILTER (
        WHERE ("status" = 'PENDING' AND "createdAt" < ${pendingCutoff})
           OR ("status" = 'WAITING_FOR_DEPOSIT' AND "createdAt" < ${bankCutoff})
      ) AS "stale",
      COALESCE(SUM("price") FILTER (
        WHERE ("status" = 'PENDING' AND "createdAt" < ${pendingCutoff})
           OR ("status" = 'WAITING_FOR_DEPOSIT' AND "createdAt" < ${bankCutoff})
      ), 0) AS "staleAmount"
    FROM "credit_top_ups"
    WHERE "status" IN ('PENDING', 'WAITING_FOR_DEPOSIT')
  `;
  const row = rows[0];
  return {
    active: Number(row?.active ?? 0),
    stale: Number(row?.stale ?? 0),
    staleAmount: Number(row?.staleAmount ?? 0),
  };
}

/** 초 단위로 변하지 않는 집계(전체 기간·최근 7일)의 메모리 캐시. */
interface SlowTopUpStats {
  todayRefundCount: number;
  todayRefundAmount: number;
  completedCount: number;
  completedRevenue: number;
  completedCredits: number;
  failedCount: number;
  cancelledCount: number;
  refundedCount: number;
}
const SLOW_STATS_TTL_MS = 60_000;
let slowStatsCache: { at: number; dayStart: number; value: SlowTopUpStats } | null = null;

async function getSlowTopUpStats(
  now: number,
  todayStart: Date,
  tomorrowStart: Date,
  allowCache: boolean,
): Promise<SlowTopUpStats> {
  if (
    allowCache &&
    slowStatsCache &&
    now - slowStatsCache.at < SLOW_STATS_TTL_MS &&
    slowStatsCache.dayStart === todayStart.getTime()
  ) {
    return slowStatsCache.value;
  }
  const reviewStart = new Date(now - TOPUP_REVIEW_WINDOW_DAYS * 24 * 60 * 60_000);
  const [todayRefunds, completed, reviewRows, refundedCount] = await Promise.all([
    sumTopUpAmounts(topUpRefundWhere(todayStart, tomorrowStart)),
    sumTopUpAmounts({ status: "COMPLETED" }),
    prisma.creditTopUp.groupBy({
      by: ["status"],
      where: {
        status: { in: ["FAILED", "CANCELLED"] },
        createdAt: { gte: reviewStart },
      },
      _count: { _all: true },
    }),
    prisma.creditTopUp.count({
      where: topUpRefundWhere(reviewStart, new Date(now)),
    }),
  ]);
  const reviewCount = (status: string) =>
    reviewRows.find((r) => r.status === status)?._count._all ?? 0;
  const value: SlowTopUpStats = {
    todayRefundCount: todayRefunds.count,
    todayRefundAmount: todayRefunds.amount,
    completedCount: completed.count,
    completedRevenue: completed.amount,
    completedCredits: completed.credits,
    failedCount: reviewCount("FAILED"),
    cancelledCount: reviewCount("CANCELLED"),
    refundedCount,
  };
  slowStatsCache = { at: now, dayStart: todayStart.getTime(), value };
  return value;
}

/**
 * @param allowCache 전체 기간·7일 집계를 60초 캐시로 대신한다(3초 SSE 틱 전용).
 *   페이지 로드·새로고침·환불 직후 재조회는 기본값(false)이라 항상 실시간이다.
 *   캐시를 쓰면 틱당 쿼리가 3개(오늘 결제 2 + 대기 1)로 떨어진다.
 */
export async function getAdminCreditTopUpStats(
  { allowCache = false }: { allowCache?: boolean } = {},
): Promise<AdminTopUpStats> {
  const now = Date.now();
  const todayStart = getTodayKST();
  const tomorrowStart = getTomorrowKST();

  const [today, pending, slow] = await Promise.all([
    sumTopUpAmounts(topUpGrossWhere(todayStart, tomorrowStart)),
    getPendingProgressCounts(now),
    getSlowTopUpStats(now, todayStart, tomorrowStart, allowCache),
  ]);

  return {
    todayCount: today.count,
    todayRevenue: today.amount,
    todayCredits: today.credits,
    todayRefundCount: slow.todayRefundCount,
    todayRefundAmount: slow.todayRefundAmount,
    completedCount: slow.completedCount,
    completedRevenue: slow.completedRevenue,
    completedCredits: slow.completedCredits,
    pendingActiveCount: pending.active,
    pendingStaleCount: pending.stale,
    pendingStaleAmount: pending.staleAmount,
    pendingStaleMinutes: PENDING_STALE_MINUTES,
    bankStaleMinutes: BANK_DEPOSIT_MATCH_WINDOW_MINUTES,
    failedCount: slow.failedCount,
    cancelledCount: slow.cancelledCount,
    refundedCount: slow.refundedCount,
    reviewWindowDays: TOPUP_REVIEW_WINDOW_DAYS,
  };
}
