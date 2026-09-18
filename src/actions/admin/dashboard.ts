"use server";

import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth-admin";
import { getTodayKST, getTomorrowKST, getYesterdayKST, getMonthStartKST } from "@/lib/date-utils";
import {
  manualGrantAt, manualGrantRevenueWhere, subscriptionPaidAt, subscriptionRevenueWhere,
  sumRevenue, topUpAmount, topUpGrossWhere, topUpPaidAt, topUpRefundWhere, topUpRefundedAt,
} from "@/lib/admin-revenue";
import { getBankDepositConfig } from "@/lib/bank-deposit";
import {
  TOPUP_PROGRESS_ACTIVE_LABEL, TOPUP_PROGRESS_STALE_LABEL,
} from "@/lib/admin-topup-progress";

// 계약: docs/analytics/analytics-spec.md §9.2 (F4~F9, D1·D5·D6)

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** D6 활성 학원 = 정지·해지가 아닌 학원(소셜 가입 TRIAL 포함) */
const INACTIVE_ACADEMY_STATUSES = ["SUSPENDED", "DEACTIVATED"];

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
  /** 숫자의 정의(카드 하단 보조문구) */
  hint?: string;
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
  /** 원장 Staff.id — 회원 상세 링크용(없으면 null) */
  directorStaffId: string | null;
}

export interface RecentSignupAcademy {
  academyId: string;
  name: string;
  createdAt: string;
  /** 원장 Staff.id — `/admin/members/[id]`(없으면 `/admin/academies/[id]`) */
  directorStaffId: string | null;
}

export interface DashboardOverview {
  actionItems: DashboardActionItem[];
  /** 순매출(D1: 결제일 gross − 환불일 환불 + 구독 + 무통장 수동지급) */
  revenue: DashboardKpi;
  signups: DashboardKpi;
  questions: DashboardKpi;
  /** 크레딧 소모 − 실패 자동환불 */
  creditsConsumed: DashboardKpi;
  /** 오늘 크레딧을 소모한 학원 수 */
  activeAcademiesToday: number;
  /** D6 — 정지·해지 제외 전체 학원 수 */
  activeAcademiesTotal: number;
  month: {
    revenue: number;
    aiCostKrw: number;
    /** AI 원가 차감 마진(고정비 미포함) */
    margin: number;
  };
  errorsToday: number;
  trend: DashboardTrendPoint[];
  /** 잔액이 남은 임박 학원 먼저, 그 다음 이미 소진(잔액 0) — 상위 8곳 */
  lowCreditAcademies: LowCreditAcademy[];
  /** 소진 임박 전체 학원 수(= lowCreditImminent + lowCreditExhausted) */
  lowCreditTotal: number;
  /** 잔액이 남아 있어 충전 유도가 유효한 학원 수(0 < balance < threshold) */
  lowCreditImminent: number;
  /** 이미 소진(잔액 0) — 대부분 휴면 */
  lowCreditExhausted: number;
  /** 최근 7일(KST, 오늘 포함) 가입 학원 최신순 상위 8곳 */
  recentSignups: RecentSignupAcademy[];
  recentSignupsTotal: number;
  generatedAt: string;
}

export async function getDashboardOverview(): Promise<DashboardOverview> {
  await requireAdminAuth();

  const todayStart = getTodayKST();
  const tomorrowStart = getTomorrowKST();
  const yesterdayStart = getYesterdayKST();
  const monthStart = getMonthStartKST();
  const now = new Date();
  // 오늘 포함 최근 14일치 버킷
  const trendStart = new Date(todayStart.getTime() - 13 * DAY_MS);
  // 「최근 가입 학원(7일)」 — 추이 차트와 같은 KST 일 경계(오늘 포함 7일)
  const signupWindowStart = new Date(todayStart.getTime() - 6 * DAY_MS);
  // F8: 무통장 자동매칭 시간창. 표시 자구는 admin-topup-progress.ts 와 같지만, 「몇 분」은
  // 매칭기(matchBankDeposit)가 실제로 쓰는 값을 따른다 — 숫자가 매처와 어긋나면 카드가 거짓말을 한다
  // (src/lib/bank-deposit.ts getBankDepositConfig — env BANK_DEPOSIT_MATCH_WINDOW_MINUTES, 기본 30분.
  //  화면 공용 상수는 NEXT_PUBLIC_BANK_DEPOSIT_MATCH_WINDOW_MINUTES 를 읽는다 — 둘 다 미설정이면 30 으로 같다).
  const bankWindowMinutes = getBankDepositConfig().matchWindowMinutes;
  const bankWindowStart = new Date(now.getTime() - bankWindowMinutes * 60_000);

  const [
    // --- 액션 필요 스트립 ---
    unmatchedDeposits,
    waitingTopupsAll,
    waitingTopups,
    pendingRegistrations,
    pendingSupport,
    pendingSeminars,
    // --- 오늘의 맥박 ---
    revenueToday,
    revenueYesterday,
    signupsToday,
    signupsYesterday,
    questionsToday,
    questionsYesterday,
    creditsToday,
    creditsYesterday,
    activeAcademiesTodayRows,
    activeAcademiesTotal,
    // --- 이번 달 수익성 ---
    revenueMonth,
    aiCostMonth,
    // --- 오늘 오류 ---
    workbenchFailed,
    extractionFailed,
    tutorFailed,
    webhookFailed,
    // --- 추이(14일) ---
    topupGrossTrendRows,
    topupRefundTrendRows,
    subTrendRows,
    grantTrendRows,
    signupTrendRows,
    // --- 리스크·최근 가입 ---
    lowCreditRows,
    lowCreditCountRows,
    recentSignupRows,
    recentSignupsTotal,
  ] = await Promise.all([
    // 무통장입금 목록 ?status=ACTION 과 같은 정의(api/admin/credits/bank-deposits/route.ts)
    prisma.bankDepositNotification.count({
      where: { status: { in: ["UNMATCHED", "AMBIGUOUS", "FAILED"] } },
    }),
    prisma.creditTopUp.count({
      where: { status: "WAITING_FOR_DEPOSIT", paymentMethod: "BANK_TRANSFER" },
    }),
    prisma.creditTopUp.count({
      where: {
        status: "WAITING_FOR_DEPOSIT",
        paymentMethod: "BANK_TRANSFER",
        createdAt: { gte: bankWindowStart },
      },
    }),
    prisma.academyRegistration.count({ where: { status: "PENDING" } }),
    prisma.helpPost.count({ where: { board: "SUPPORT", status: { in: ["OPEN", "IN_PROGRESS"] } } }),
    prisma.seminarRequest.count({ where: { status: "RECEIVED" } }),

    sumRevenue(todayStart, tomorrowStart),
    sumRevenue(yesterdayStart, todayStart),
    prisma.academy.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.academy.count({ where: { createdAt: { gte: yesterdayStart, lt: todayStart } } }),
    prisma.question.count({ where: { deletedAt: null, createdAt: { gte: todayStart } } }),
    prisma.question.count({ where: { deletedAt: null, createdAt: { gte: yesterdayStart, lt: todayStart } } }),
    sumNetConsumption(todayStart, tomorrowStart),
    sumNetConsumption(yesterdayStart, todayStart),
    prisma.creditTransaction.groupBy({
      by: ["academyId"],
      where: { type: "CONSUMPTION", createdAt: { gte: todayStart } },
    }),
    prisma.academy.count({
      where: { status: { notIn: INACTIVE_ACADEMY_STATUSES } },
    }),

    sumRevenue(monthStart, tomorrowStart),
    prisma.platformApiUsageCost.aggregate({
      _sum: { costKrw: true },
      where: { usageAt: { gte: monthStart } },
    }),

    prisma.workbenchAiJob.count({ where: { status: "FAILED", createdAt: { gte: todayStart } } }),
    prisma.extractionJob.count({ where: { status: "FAILED", createdAt: { gte: todayStart } } }),
    prisma.tutorAiLog.count({ where: { status: "FAILED", createdAt: { gte: todayStart } } }),
    prisma.portOneWebhookEvent.count({ where: { status: "FAILED", receivedAt: { gte: todayStart } } }),

    // 추이 매출 — sumRevenue(src/lib/admin-revenue.ts)와 같은 조건·같은 기준 시각으로 일별 버킷
    prisma.creditTopUp.findMany({
      where: topUpGrossWhere(trendStart, tomorrowStart),
      select: { price: true, paidAmount: true, paidAt: true, completedAt: true },
    }),
    prisma.creditTopUp.findMany({
      where: topUpRefundWhere(trendStart, tomorrowStart),
      select: { price: true, paidAmount: true, cancelledAt: true, updatedAt: true },
    }),
    // 구독·수동지급도 admin-revenue.ts 의 조건 헬퍼를 그대로 쓴다(정의 단일화, spec §13 S6)
    prisma.subscriptionPayment.findMany({
      where: subscriptionRevenueWhere(trendStart, tomorrowStart),
      select: { amount: true, paidAmount: true, paidAt: true, completedAt: true },
    }),
    prisma.bankDepositNotification.findMany({
      where: manualGrantRevenueWhere(trendStart, tomorrowStart),
      select: { amount: true, occurredAt: true, receivedAt: true },
    }),
    prisma.academy.findMany({
      where: { createdAt: { gte: trendStart } },
      select: { createdAt: true },
    }),

    // F6(D6): 정지·해지 제외.
    // 잔액 0(이미 소진·대부분 휴면)은 뒤로 미루고 잔액이 남은 「진짜 임박」을 먼저 보여준다
    // — 실DB 실측 잔액 0 이 149곳이라 balance ASC 만으로는 상위 8칸이 100% 잔액 0 으로 고정된다.
    prisma.$queryRaw<
      Array<{
        academyId: string;
        name: string;
        balance: number;
        threshold: number;
        directorStaffId: string | null;
      }>
    >`
      SELECT cb."academyId" AS "academyId", a.name AS name,
             cb.balance AS balance, cb."lowCreditThreshold" AS threshold,
             (SELECT st.id FROM staff st
               WHERE st."academyId" = a.id AND st.role = 'DIRECTOR'
               ORDER BY st."createdAt" ASC LIMIT 1) AS "directorStaffId"
      FROM credit_balances cb
      JOIN academies a ON a.id = cb."academyId"
      WHERE cb.balance < cb."lowCreditThreshold"
        AND a.status NOT IN ('SUSPENDED', 'DEACTIVATED')
      ORDER BY (cb.balance = 0), cb.balance ASC, cb."updatedAt" DESC
      LIMIT 8
    `,
    prisma.$queryRaw<Array<{ imminent: bigint | number; exhausted: bigint | number }>>`
      SELECT COUNT(*) FILTER (WHERE cb.balance <> 0) AS imminent,
             COUNT(*) FILTER (WHERE cb.balance = 0) AS exhausted
      FROM credit_balances cb
      JOIN academies a ON a.id = cb."academyId"
      WHERE cb.balance < cb."lowCreditThreshold"
        AND a.status NOT IN ('SUSPENDED', 'DEACTIVATED')
    `,

    // F9(D5): 「체험 종료 임박」(소셜 가입 체험이 전부 종료돼 항상 빈 목록) → 최근 가입 학원
    prisma.academy.findMany({
      where: { createdAt: { gte: signupWindowStart } },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        name: true,
        createdAt: true,
        staff: {
          where: { role: "DIRECTOR" },
          orderBy: { createdAt: "asc" },
          take: 1,
          select: { id: true },
        },
      },
    }),
    prisma.academy.count({ where: { createdAt: { gte: signupWindowStart } } }),
  ]);

  const waitingExpired = Math.max(0, waitingTopupsAll - waitingTopups);
  const lowCreditImminent = Number(lowCreditCountRows[0]?.imminent ?? 0);
  const lowCreditExhausted = Number(lowCreditCountRows[0]?.exhausted ?? 0);

  // 액션 스트립 조립 (0인 항목도 노출하되 색으로 구분)
  // 자구는 spec §9.2 F2 결정(「진행 중」 / 「미완료(이탈·만료)」)을 따른다 — DB 상태는 바꾸지 않는다(D3).
  const actionItems: DashboardActionItem[] = [
    { key: "deposits", label: "미확인 입금", count: unmatchedDeposits, href: "/admin/credits/bank-deposits?status=ACTION", urgent: true, hint: "미매칭·확인 필요·실패" },
    {
      key: "waiting-topups", label: "입금 대기", count: waitingTopups, href: "/admin/credits/bank-deposits?view=pending", urgent: false,
      hint: `주문 후 ${bankWindowMinutes}분 이내 ${TOPUP_PROGRESS_ACTIVE_LABEL}`,
    },
    {
      key: "waiting-topups-stale", label: "미완료 입금", count: waitingExpired, href: "/admin/credits/bank-deposits?view=pending", urgent: false,
      hint: `${TOPUP_PROGRESS_STALE_LABEL} · ${bankWindowMinutes}분 초과 · 입금되면 수동 처리`,
    },
    { key: "registrations", label: "가입 승인 대기", count: pendingRegistrations, href: "/admin/registrations?status=PENDING", urgent: false },
    { key: "support", label: "미답변 문의", count: pendingSupport, href: "/admin/support?status=PENDING", urgent: false },
    { key: "seminars", label: "세미나 신청", count: pendingSeminars, href: "/admin/seminars?status=RECEIVED", urgent: false },
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
  const addRevenue = (at: Date | null, amount: number) => {
    if (!at) return;
    const b = buckets.get(kstDayKey(at));
    if (b) b.revenue += amount;
  };
  for (const r of topupGrossTrendRows) addRevenue(topUpPaidAt(r), topUpAmount(r));
  for (const r of topupRefundTrendRows) addRevenue(topUpRefundedAt(r), -topUpAmount(r));
  for (const r of subTrendRows) addRevenue(subscriptionPaidAt(r), r.paidAmount ?? r.amount);
  for (const r of grantTrendRows) addRevenue(manualGrantAt(r), r.amount);
  for (const r of signupTrendRows) {
    const b = buckets.get(kstDayKey(r.createdAt));
    if (b) b.signups += 1;
  }
  const trend: DashboardTrendPoint[] = dayKeys.map((key) => {
    const b = buckets.get(key)!;
    return { date: `${key.slice(5, 7)}/${key.slice(8, 10)}`, ...b };
  });

  const monthAiCost = aiCostMonth._sum.costKrw ?? 0;

  return {
    actionItems,
    revenue: { today: revenueToday.net, yesterday: revenueYesterday.net },
    signups: { today: signupsToday, yesterday: signupsYesterday },
    questions: { today: questionsToday, yesterday: questionsYesterday },
    creditsConsumed: { today: creditsToday, yesterday: creditsYesterday },
    activeAcademiesToday: activeAcademiesTodayRows.length,
    activeAcademiesTotal,
    month: {
      revenue: revenueMonth.net,
      aiCostKrw: monthAiCost,
      margin: revenueMonth.net - monthAiCost,
    },
    errorsToday: workbenchFailed + extractionFailed + tutorFailed + webhookFailed,
    trend,
    lowCreditAcademies: lowCreditRows.map((r) => ({
      academyId: r.academyId,
      name: r.name,
      balance: Number(r.balance),
      threshold: Number(r.threshold),
      directorStaffId: r.directorStaffId ?? null,
    })),
    lowCreditTotal: lowCreditImminent + lowCreditExhausted,
    lowCreditImminent,
    lowCreditExhausted,
    recentSignups: recentSignupRows.map((r) => ({
      academyId: r.id,
      name: r.name,
      createdAt: r.createdAt.toISOString(),
      directorStaffId: r.staff[0]?.id ?? null,
    })),
    recentSignupsTotal,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * 크레딧 소모량(절대값) — CONSUMPTION 합에서 실패 자동환불을 뺀 값.
 * 자동환불 = type REFUND AND referenceType 'CREDIT_TRANSACTION'(src/lib/credits.ts 환불 경로,
 * referenceId 는 원 CONSUMPTION 거래). 충전 환불 회수분(referenceType CREDIT_TOP_UP_REFUND)은 소모가 아니므로 제외.
 */
async function sumNetConsumption(gte: Date, lt: Date): Promise<number> {
  const [consumed, refunded] = await Promise.all([
    prisma.creditTransaction.aggregate({
      _sum: { amount: true },
      where: { type: "CONSUMPTION", createdAt: { gte, lt } },
    }),
    prisma.creditTransaction.aggregate({
      _sum: { amount: true },
      where: {
        type: "REFUND",
        referenceType: "CREDIT_TRANSACTION",
        createdAt: { gte, lt },
      },
    }),
  ]);
  return Math.max(
    0,
    Math.abs(consumed._sum.amount ?? 0) - (refunded._sum.amount ?? 0),
  );
}
