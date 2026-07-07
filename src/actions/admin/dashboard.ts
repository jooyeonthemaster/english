"use server";

import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth-admin";
import {
  getTodayKST,
  getYesterdayKST,
  getMonthStartKST,
} from "@/lib/date-utils";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** UTC Date → KST 기준 "YYYY-MM-DD" 키 */
function kstDayKey(date: Date): string {
  return new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

export interface DashboardActionItem {
  key: string;
  label: string;
  count: number;
  href: string;
  /** true면 돈/고객이 걸린 긴급 항목(빨강), false면 일반 대기(주황) */
  urgent: boolean;
}

export interface DashboardKpi {
  today: number;
  yesterday: number;
}

export interface DashboardTrendPoint {
  date: string; // "MM/DD"
  revenue: number;
  signups: number;
}

export interface LowCreditAcademy {
  academyId: string;
  name: string;
  balance: number;
  threshold: number;
}

export interface TrialEndingAcademy {
  academyId: string;
  name: string;
  trialEndsAt: string;
}

export interface DashboardOverview {
  actionItems: DashboardActionItem[];
  revenue: DashboardKpi;
  signups: DashboardKpi;
  questions: DashboardKpi;
  creditsConsumed: DashboardKpi;
  activeAcademiesToday: number;
  activeAcademiesTotal: number;
  month: {
    revenue: number;
    aiCostKrw: number;
    margin: number;
  };
  errorsToday: number;
  trend: DashboardTrendPoint[];
  lowCreditAcademies: LowCreditAcademy[];
  trialEndingSoon: TrialEndingAcademy[];
  generatedAt: string;
}

export async function getDashboardOverview(): Promise<DashboardOverview> {
  await requireAdminAuth();

  const todayStart = getTodayKST();
  const yesterdayStart = getYesterdayKST();
  const monthStart = getMonthStartKST();
  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * DAY_MS);
  // 오늘 포함 최근 14일치 버킷
  const trendStart = new Date(todayStart.getTime() - 13 * DAY_MS);

  const [
    // --- 액션 필요 스트립 ---
    unmatchedDeposits,
    waitingTopups,
    pendingRegistrations,
    pendingSupport,
    pendingSeminars,
    // --- 오늘의 맥박 ---
    topupRevenueToday,
    topupRevenueYesterday,
    subRevenueToday,
    subRevenueYesterday,
    signupsToday,
    signupsYesterday,
    questionsToday,
    questionsYesterday,
    creditsToday,
    creditsYesterday,
    activeAcademiesTodayRows,
    activeAcademiesTotal,
    // --- 이번 달 수익성 ---
    topupRevenueMonth,
    subRevenueMonth,
    aiCostMonth,
    // --- 오늘 오류 ---
    workbenchFailed,
    extractionFailed,
    tutorFailed,
    webhookFailed,
    // --- 추이(14일) ---
    topupTrendRows,
    subTrendRows,
    signupTrendRows,
    // --- 리스크 ---
    lowCreditRows,
    trialEndingRows,
    // --- 수동지급(MANUAL_GRANT) 무통장입금 매출 ---
    grantRevenueToday,
    grantRevenueYesterday,
    grantRevenueMonth,
    grantTrendRows,
  ] = await Promise.all([
    prisma.bankDepositNotification.count({
      where: { status: { in: ["UNMATCHED", "AMBIGUOUS"] } },
    }),
    prisma.creditTopUp.count({
      where: { status: "WAITING_FOR_DEPOSIT", paymentMethod: "BANK_TRANSFER" },
    }),
    prisma.academyRegistration.count({ where: { status: "PENDING" } }),
    prisma.helpPost.count({
      where: { board: "SUPPORT", status: { in: ["OPEN", "IN_PROGRESS"] } },
    }),
    prisma.seminarRequest.count({ where: { status: "RECEIVED" } }),

    sumTopup(todayStart),
    sumTopup(yesterdayStart, todayStart),
    sumSubscription(todayStart),
    sumSubscription(yesterdayStart, todayStart),
    prisma.academy.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.academy.count({
      where: { createdAt: { gte: yesterdayStart, lt: todayStart } },
    }),
    prisma.question.count({
      where: { deletedAt: null, createdAt: { gte: todayStart } },
    }),
    prisma.question.count({
      where: {
        deletedAt: null,
        createdAt: { gte: yesterdayStart, lt: todayStart },
      },
    }),
    sumConsumption(todayStart),
    sumConsumption(yesterdayStart, todayStart),
    prisma.creditTransaction.groupBy({
      by: ["academyId"],
      where: { type: "CONSUMPTION", createdAt: { gte: todayStart } },
    }),
    prisma.academy.count({ where: { status: "ACTIVE" } }),

    sumTopup(monthStart),
    sumSubscription(monthStart),
    prisma.platformApiUsageCost.aggregate({
      _sum: { costKrw: true },
      where: { usageAt: { gte: monthStart } },
    }),

    prisma.workbenchAiJob.count({
      where: { status: "FAILED", createdAt: { gte: todayStart } },
    }),
    prisma.extractionJob.count({
      where: { status: "FAILED", createdAt: { gte: todayStart } },
    }),
    prisma.tutorAiLog.count({
      where: { status: "FAILED", createdAt: { gte: todayStart } },
    }),
    prisma.portOneWebhookEvent.count({
      where: { status: "FAILED", receivedAt: { gte: todayStart } },
    }),

    prisma.creditTopUp.findMany({
      where: { status: "COMPLETED", completedAt: { gte: trendStart } },
      select: { completedAt: true, price: true },
    }),
    prisma.subscriptionPayment.findMany({
      where: { status: "PAID", paidAt: { gte: trendStart } },
      select: { paidAt: true, amount: true },
    }),
    prisma.academy.findMany({
      where: { createdAt: { gte: trendStart } },
      select: { createdAt: true },
    }),

    prisma.$queryRaw<
      Array<{ academyId: string; name: string; balance: number; threshold: number }>
    >`
      SELECT cb."academyId" AS "academyId", a.name AS name,
             cb.balance AS balance, cb."lowCreditThreshold" AS threshold
      FROM credit_balances cb
      JOIN academies a ON a.id = cb."academyId"
      WHERE cb.balance < cb."lowCreditThreshold" AND a.status = 'ACTIVE'
      ORDER BY cb.balance ASC
      LIMIT 8
    `,
    prisma.academySubscription.findMany({
      where: {
        status: "TRIAL",
        trialEndsAt: { gte: now, lte: in7Days },
      },
      orderBy: { trialEndsAt: "asc" },
      take: 8,
      select: { academyId: true, trialEndsAt: true, academy: { select: { name: true } } },
    }),

    // 수동지급(MANUAL_GRANT) 무통장입금 — creditTopUp 없이 시스템 외 지급된
    // 실입금. 충전/구독 매출과 함께 오늘·어제·이번 달·추이에 합산한다.
    sumManualGrant(todayStart),
    sumManualGrant(yesterdayStart, todayStart),
    sumManualGrant(monthStart),
    prisma.bankDepositNotification.findMany({
      where: { status: "MANUAL_GRANT", receivedAt: { gte: trendStart } },
      select: { receivedAt: true, amount: true },
    }),
  ]);

  // 액션 스트립 조립 (0인 항목도 노출하되 색으로 구분)
  const actionItems: DashboardActionItem[] = [
    {
      key: "deposits",
      label: "미확인 입금",
      count: unmatchedDeposits,
      href: "/admin/credits/bank-deposits?status=ACTION",
      urgent: true,
    },
    {
      key: "waiting-topups",
      label: "입금 대기",
      count: waitingTopups,
      href: "/admin/credits/bank-deposits?view=pending",
      urgent: false,
    },
    {
      key: "registrations",
      label: "가입 승인 대기",
      count: pendingRegistrations,
      href: "/admin/registrations?status=PENDING",
      urgent: false,
    },
    {
      key: "support",
      label: "미답변 문의",
      count: pendingSupport,
      href: "/admin/support?status=PENDING",
      urgent: false,
    },
    {
      key: "seminars",
      label: "세미나 신청",
      count: pendingSeminars,
      href: "/admin/seminars?status=RECEIVED",
      urgent: false,
    },
  ];

  // 14일 버킷 초기화
  const buckets = new Map<string, { revenue: number; signups: number }>();
  const dayKeys: string[] = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(trendStart.getTime() + i * DAY_MS);
    const key = kstDayKey(d);
    dayKeys.push(key);
    buckets.set(key, { revenue: 0, signups: 0 });
  }
  for (const r of topupTrendRows) {
    if (!r.completedAt) continue;
    const b = buckets.get(kstDayKey(r.completedAt));
    if (b) b.revenue += r.price;
  }
  for (const r of subTrendRows) {
    if (!r.paidAt) continue;
    const b = buckets.get(kstDayKey(r.paidAt));
    if (b) b.revenue += r.amount;
  }
  for (const r of grantTrendRows) {
    const b = buckets.get(kstDayKey(r.receivedAt));
    if (b) b.revenue += r.amount;
  }
  for (const r of signupTrendRows) {
    const b = buckets.get(kstDayKey(r.createdAt));
    if (b) b.signups += 1;
  }
  const trend: DashboardTrendPoint[] = dayKeys.map((key) => {
    const b = buckets.get(key)!;
    return { date: `${key.slice(5, 7)}/${key.slice(8, 10)}`, ...b };
  });

  const monthRevenue = topupRevenueMonth + subRevenueMonth + grantRevenueMonth;
  const monthAiCost = aiCostMonth._sum.costKrw ?? 0;

  return {
    actionItems,
    revenue: {
      today: topupRevenueToday + subRevenueToday + grantRevenueToday,
      yesterday: topupRevenueYesterday + subRevenueYesterday + grantRevenueYesterday,
    },
    signups: { today: signupsToday, yesterday: signupsYesterday },
    questions: { today: questionsToday, yesterday: questionsYesterday },
    creditsConsumed: { today: creditsToday, yesterday: creditsYesterday },
    activeAcademiesToday: activeAcademiesTodayRows.length,
    activeAcademiesTotal,
    month: {
      revenue: monthRevenue,
      aiCostKrw: monthAiCost,
      margin: monthRevenue - monthAiCost,
    },
    errorsToday: workbenchFailed + extractionFailed + tutorFailed + webhookFailed,
    trend,
    lowCreditAcademies: lowCreditRows.map((r) => ({
      academyId: r.academyId,
      name: r.name,
      balance: r.balance,
      threshold: r.threshold,
    })),
    trialEndingSoon: trialEndingRows.map((r) => ({
      academyId: r.academyId,
      name: r.academy.name,
      trialEndsAt: r.trialEndsAt!.toISOString(),
    })),
    generatedAt: new Date().toISOString(),
  };
}

/** CreditTopUp(충전) 매출 합계 — status COMPLETED, completedAt 기준 */
async function sumTopup(gte: Date, lt?: Date): Promise<number> {
  const res = await prisma.creditTopUp.aggregate({
    _sum: { price: true },
    where: { status: "COMPLETED", completedAt: lt ? { gte, lt } : { gte } },
  });
  return res._sum.price ?? 0;
}

/** SubscriptionPayment(구독) 매출 합계 — status PAID, paidAt 기준 */
async function sumSubscription(gte: Date, lt?: Date): Promise<number> {
  const res = await prisma.subscriptionPayment.aggregate({
    _sum: { amount: true },
    where: { status: "PAID", paidAt: lt ? { gte, lt } : { gte } },
  });
  return res._sum.amount ?? 0;
}

/**
 * 수동지급(MANUAL_GRANT) 무통장입금 매출 합계 — receivedAt 기준.
 * creditTopUp 레코드가 없는 시스템 외 지급이라 별도로 합산한다. MATCHED(자동
 * 지급)는 creditTopUp 으로 이미 집계되고 manual_grant 전환도 막혀 이중집계 없음.
 */
async function sumManualGrant(gte: Date, lt?: Date): Promise<number> {
  const res = await prisma.bankDepositNotification.aggregate({
    _sum: { amount: true },
    where: {
      status: "MANUAL_GRANT",
      receivedAt: lt ? { gte, lt } : { gte },
    },
  });
  return res._sum.amount ?? 0;
}

/** 크레딧 소모량 합계(절대값) — type CONSUMPTION */
async function sumConsumption(gte: Date, lt?: Date): Promise<number> {
  const res = await prisma.creditTransaction.aggregate({
    _sum: { amount: true },
    where: { type: "CONSUMPTION", createdAt: lt ? { gte, lt } : { gte } },
  });
  return Math.abs(res._sum.amount ?? 0);
}
