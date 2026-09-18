import { prisma } from "@/lib/prisma";

// 상단 카드 집계는 admin-credit-topup-stats.ts 로 분리(파일 400줄 상한). 기존 호출부 호환을 위해 재수출.
export {
  TOPUP_REVIEW_WINDOW_DAYS,
  getAdminCreditTopUpStats,
} from "@/lib/admin-credit-topup-stats";
export type { AdminTopUpStats } from "@/lib/admin-credit-topup-stats";

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
          // 원장이 여럿이면 활성 원장 우선 → 가장 먼저 만들어진 순(결정론) — 회원 상세 링크 대상.
          // 규칙은 RC-DIRECTOR 확정안(isActive DESC, createdAt ASC, id ASC)과 같다.
          staff: {
            where: { role: "DIRECTOR" },
            orderBy: [{ isActive: "desc" }, { createdAt: "asc" }, { id: "asc" }],
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
          // 원장이 여럿이면 활성 원장 우선 → 가장 먼저 만들어진 순(결정론) — 회원 상세 링크 대상.
          // 규칙은 RC-DIRECTOR 확정안(isActive DESC, createdAt ASC, id ASC)과 같다.
          staff: {
            where: { role: "DIRECTOR" },
            orderBy: [{ isActive: "desc" }, { createdAt: "asc" }, { id: "asc" }],
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
  // 「누적 사용」은 회원 상세(credit_balances.totalConsumed)와 같은 순사용이어야 한다 —
  // 생성 실패 자동환급(REFUND · referenceType='CREDIT_TRANSACTION')은 그때 totalConsumed 에서
  // 빠지므로 여기서도 뺀다(spec §9.2 F7·F11 과 같은 규칙). 실DB 대조: 네안데르이동주 1,975−187=1,788.
  const [activityPage, consumptionAgg, usageRefundAgg] = await Promise.all([
    getAcademyCreditActivity(topUp.academyId, 1),
    prisma.creditTransaction.aggregate({
      where: { academyId: topUp.academyId, type: "CONSUMPTION" },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.creditTransaction.aggregate({
      where: {
        academyId: topUp.academyId,
        type: "REFUND",
        referenceType: "CREDIT_TRANSACTION",
      },
      _sum: { amount: true },
    }),
  ]);

  return {
    ...topUp,
    relatedCreditTransactions,
    academyCreditActivity: activityPage.items,
    academyActivityTotal: activityPage.total,
    academyActivityPageSize: activityPage.pageSize,
    academyUsageSummary: {
      /** 순사용(= 회원 상세 「누적 사용」 = credit_balances.totalConsumed) */
      totalConsumed:
        Math.abs(consumptionAgg._sum.amount ?? 0) - (usageRefundAgg._sum.amount ?? 0),
      /** 총사용(환급 차감 전) — 참고용 */
      grossConsumed: Math.abs(consumptionAgg._sum.amount ?? 0),
      /** 생성 실패 자동환급으로 되돌아온 크레딧 */
      refundedCredits: usageRefundAgg._sum.amount ?? 0,
      consumptionCount: consumptionAgg._count,
    },
  };
}
