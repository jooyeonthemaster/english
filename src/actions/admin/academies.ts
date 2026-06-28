"use server";

import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth-admin";

/**
 * List all academies with subscription info, credit balance, and aggregate counts.
 */
export async function getAcademyList() {
  await requireAdminAuth();

  const academies = await prisma.academy.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      subscriptions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { plan: true },
      },
      creditBalance: true,
      _count: {
        select: {
          questions: true,
          staff: true,
          students: true,
        },
      },
    },
  });

  return academies.map((a) => ({
    id: a.id,
    name: a.name,
    slug: a.slug,
    status: a.status,
    createdAt: a.createdAt,
    subscription: a.subscriptions[0] ?? null,
    creditBalance: a.creditBalance,
    questionCount: a._count.questions,
    staffCount: a._count.staff,
    studentCount: a._count.students,
  }));
}

/**
 * Get full details for a single academy, including subscription, credits,
 * staff roster, recent transactions, and usage stats.
 */
export async function getAcademyDetail(academyId: string) {
  await requireAdminAuth();

  const academy = await prisma.academy.findUnique({
    where: { id: academyId },
    include: {
      subscriptions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { plan: true },
      },
      creditBalance: true,
      staff: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          createdAt: true,
        },
      },
      _count: {
        select: {
          questions: true,
          students: true,
          passages: true,
          exams: true,
          classes: true,
        },
      },
    },
  });

  if (!academy) {
    return null;
  }

  // Recent credit transactions (last 50)
  const recentTransactions = await prisma.creditTransaction.findMany({
    where: { academyId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // Usage stats: credits consumed in last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const consumptionAgg = await prisma.creditTransaction.aggregate({
    where: {
      academyId,
      type: "CONSUMPTION",
      createdAt: { gte: thirtyDaysAgo },
    },
    _sum: { amount: true },
    _count: { id: true },
  });

  // Fetch actual content data for the file browser
  const [passages, questions, exams] = await Promise.all([
    prisma.passage.findMany({
      where: { academyId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        content: true,
        difficulty: true,
        grade: true,
        semester: true,
        unit: true,
        publisher: true,
        createdAt: true,
        _count: { select: { questions: { where: { deletedAt: null } } } },
      },
    }),
    prisma.question.findMany({
      where: { academyId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        type: true,
        subType: true,
        difficulty: true,
        questionText: true,
        aiGenerated: true,
        approved: true,
        starred: true,
        passageId: true,
        createdAt: true,
      },
    }),
    prisma.exam.findMany({
      where: { academyId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        createdAt: true,
        _count: { select: { questions: { where: { question: { deletedAt: null } } } } },
      },
    }),
  ]);

  return {
    ...academy,
    subscription: academy.subscriptions[0] ?? null,
    recentTransactions,
    usageStats: {
      creditsConsumedLast30Days: Math.abs(consumptionAgg._sum.amount ?? 0),
      transactionCountLast30Days: consumptionAgg._count.id,
      questionCount: academy._count.questions,
      studentCount: academy._count.students,
      passageCount: academy._count.passages,
      examCount: academy._count.exams,
      classCount: academy._count.classes,
    },
    content: {
      passages,
      questions,
      exams,
    },
  };
}
