import { prisma } from "@/lib/prisma";

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

  return {
    ...topUp,
    relatedCreditTransactions,
  };
}

export async function getAdminCreditTopUpStats() {
  const [today, pendingCount, completedAgg, failedCount] = await Promise.all([
    prisma.creditTopUp.aggregate({
      where: {
        createdAt: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
        },
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
