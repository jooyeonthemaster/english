import { prisma } from "@/lib/prisma";
import {
  findDuplicateNotificationCandidates,
  findManualGrantTransactionCandidates,
} from "@/lib/manual-topup-complete";

/** 결제 상세 모달의 "학원 크레딧 사용 로그" 한 페이지 크기. */
export const ACADEMY_ACTIVITY_PAGE_SIZE = 20;

const ACADEMY_ACTIVITY_SELECT = {
  id: true,
  type: true,
  amount: true,
  balanceAfter: true,
  operationType: true,
  description: true,
  staffId: true,
  createdAt: true,
} as const;

/** 학원의 전체 크레딧 활동(사용/충전/조정 등)을 페이지 단위로 조회. */
export async function getAcademyCreditActivity(
  academyId: string,
  page = 1,
  pageSize = ACADEMY_ACTIVITY_PAGE_SIZE,
) {
  const size = Math.min(Math.max(pageSize, 1), 100);
  const currentPage = Math.max(page, 1);
  const [items, total] = await Promise.all([
    prisma.creditTransaction.findMany({
      where: { academyId },
      orderBy: { createdAt: "desc" },
      skip: (currentPage - 1) * size,
      take: size,
      select: ACADEMY_ACTIVITY_SELECT,
    }),
    prisma.creditTransaction.count({ where: { academyId } }),
  ]);
  return { items, total, page: currentPage, pageSize: size };
}

export async function getAdminCreditTopUpTotalCount() {
  return prisma.creditTopUp.count();
}

export async function getAdminCreditTopUps(limit = 50, offset = 0) {
  return prisma.creditTopUp.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: Math.min(Math.max(limit, 1), 200),
    skip: Math.max(offset, 0),
    include: {
      academy: {
        select: {
          id: true,
          name: true,
          slug: true,
          creditBalance: {
            select: {
              balance: true,
              bonusCredits: true,
              totalAllocated: true,
            },
          },
          staff: {
            where: { role: "DIRECTOR" },
            select: { id: true, name: true, email: true },
            take: 1,
          },
        },
      },
      creditTransaction: {
        select: {
          id: true,
          balanceAfter: true,
          createdAt: true,
        },
      },
    },
  });
}

export async function getAdminCreditTopUpDetail(topUpId: string) {
  const topUp = await prisma.creditTopUp.findUnique({
    where: { id: topUpId },
    include: {
      academy: {
        select: {
          id: true,
          name: true,
          slug: true,
          creditBalance: {
            select: {
              balance: true,
              bonusCredits: true,
              totalAllocated: true,
              monthlyAllocation: true,
            },
          },
          staff: {
            where: { role: "DIRECTOR" },
            select: { id: true, name: true, email: true },
            take: 1,
          },
        },
      },
      creditTransaction: {
        select: {
          id: true,
          amount: true,
          balanceAfter: true,
          description: true,
          createdAt: true,
        },
      },
      webhookEvents: {
        orderBy: { receivedAt: "desc" },
        take: 20,
        select: {
          id: true,
          webhookId: true,
          eventType: true,
          status: true,
          errorMessage: true,
          receivedAt: true,
          processedAt: true,
        },
      },
    },
  });

  if (!topUp) return null;

  const relatedTransactionFilters = [
    { referenceId: topUp.id },
    ...(topUp.creditTransactionId ? [{ id: topUp.creditTransactionId }] : []),
  ];

  const relatedCreditTransactions = await prisma.creditTransaction.findMany({
    where: {
      academyId: topUp.academyId,
      OR: relatedTransactionFilters,
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      type: true,
      amount: true,
      balanceAfter: true,
      description: true,
      referenceType: true,
      adminId: true,
      staffId: true,
      metadata: true,
      createdAt: true,
    },
  });

  // 이 학원의 크레딧 사용/충전 흐름(결제 건과 무관하게 전체 활동)을 함께 노출해
  // 어드민이 "이 학원이 크레딧을 어떻게 쓰고 있는지" 파악할 수 있게 한다. 첫 페이지만
  // 실어 보내고, 나머지 페이지는 클라이언트가 credit-activity 엔드포인트로 이어 받는다.
  const [activityPage, consumptionAgg] = await Promise.all([
    getAcademyCreditActivity(topUp.academyId, 1),
    prisma.creditTransaction.aggregate({
      where: { academyId: topUp.academyId, type: "CONSUMPTION" },
      _sum: { amount: true },
      _count: true,
    }),
  ]);

  // 수동 충전 완료 처리가 가능한 주문(미지급 상태)일 때만, 모달이 쓸 연결 후보를 같이 싣는다.
  //  - manualGrantCandidates: "이미 지급한" 크레딧 거래 후보(보통 관리자 ADJUSTMENT)
  //  - duplicateNotificationCandidates: 같은 입금을 매출에 또 넣고 있는 MANUAL_GRANT 알림
  const canManualComplete =
    !topUp.creditTransactionId &&
    (topUp.status === "WAITING_FOR_DEPOSIT" || topUp.status === "PENDING");

  const [manualGrantCandidates, duplicateNotificationCandidates] =
    canManualComplete
      ? await Promise.all([
          findManualGrantTransactionCandidates({
            academyId: topUp.academyId,
            around: topUp.createdAt,
          }),
          findDuplicateNotificationCandidates({
            price: topUp.price,
            around: topUp.createdAt,
          }),
        ])
      : [[], []];

  return {
    ...topUp,
    canManualComplete,
    manualGrantCandidates,
    duplicateNotificationCandidates,
    relatedCreditTransactions,
    academyCreditActivity: activityPage.items,
    academyActivityTotal: activityPage.total,
    academyActivityPageSize: activityPage.pageSize,
    academyUsageSummary: {
      totalConsumed: Math.abs(consumptionAgg._sum.amount ?? 0),
      consumptionCount: consumptionAgg._count,
    },
  };
}

export async function getAdminCreditTopUpStats() {
  const todayStart = new Date(new Date().setHours(0, 0, 0, 0));
  const [today, pendingCount, completedAgg, failedCount] = await Promise.all([
    // "오늘 결제"는 매출이므로 실제로 완료된 건만 센다. 상태 필터가 없으면 결제 대기·
    // 입금 확인 실패처럼 한 푼도 들어오지 않은 주문까지 전액 매출로 잡힌다.
    // 기간 기준은 원가분석(operations-cost)과 동일하게 paidAt ?? completedAt 을 쓴다.
    // 주문 생성일(createdAt)로 잡으면 어제 주문·오늘 입금 건이 두 화면에서 어긋난다.
    prisma.creditTopUp.aggregate({
      where: {
        status: "COMPLETED",
        OR: [
          { paidAt: { gte: todayStart } },
          { paidAt: null, completedAt: { gte: todayStart } },
        ],
      },
      _sum: { price: true, creditAmount: true },
      _count: true,
    }),
    prisma.creditTopUp.count({
      where: { status: { in: ["PENDING", "WAITING_FOR_DEPOSIT"] } },
    }),
    prisma.creditTopUp.aggregate({
      where: { status: "COMPLETED" },
      _sum: { price: true, creditAmount: true },
      _count: true,
    }),
    prisma.creditTopUp.count({
      where: { status: { in: ["FAILED", "CANCELLED", "REFUNDED"] } },
    }),
  ]);

  return {
    todayCount: today._count,
    todayRevenue: today._sum.price ?? 0,
    todayCredits: today._sum.creditAmount ?? 0,
    pendingCount,
    completedCount: completedAgg._count,
    completedRevenue: completedAgg._sum.price ?? 0,
    completedCredits: completedAgg._sum.creditAmount ?? 0,
    failedCount,
  };
}
