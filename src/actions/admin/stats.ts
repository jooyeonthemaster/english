"use server";

import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth-admin";

/**
 * Get system-wide statistics for the admin dashboard.
 */
export async function getSystemStats() {
  await requireAdminAuth();

  const [
    totalAcademies,
    activeAcademies,
    totalStudents,
    totalStaff,
    totalQuestions,
    totalPassages,
    totalExams,
    pendingRegistrations,
    creditStats,
    recentTransactions,
    directorProviderRows,
  ] = await Promise.all([
    prisma.academy.count(),
    prisma.academy.count({ where: { status: "ACTIVE" } }),
    prisma.student.count(),
    prisma.staff.count(),
    prisma.question.count(),
    prisma.passage.count(),
    prisma.exam.count(),
    prisma.academyRegistration.count({ where: { status: "PENDING" } }),
    prisma.creditTransaction.aggregate({
      _sum: { amount: true },
      where: { type: "CONSUMPTION" },
    }),
    prisma.creditTransaction.count({
      where: {
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
    }),
    prisma.staff.groupBy({
      by: ["authProvider"],
      where: { role: "DIRECTOR" },
      _count: { _all: true },
    }),
  ]);

  // Revenue estimate: sum of all subscription plan monthly prices for active subscriptions
  const activeSubscriptions = await prisma.academySubscription.findMany({
    where: { status: { in: ["ACTIVE", "TRIAL"] } },
    include: { plan: { select: { monthlyPrice: true } } },
  });
  const monthlyRevenue = activeSubscriptions.reduce(
    (sum, sub) => sum + sub.plan.monthlyPrice,
    0,
  );

  // Director signup attribution. Kakao bypasses Supabase Auth (custom OAuth in
  // /api/auth/kakao), so the canonical source is staff.authProvider, not
  // auth.identities. Null = pre-OAuth seed data or credential-based imports.
  const providerCounts = { google: 0, kakao: 0, other: 0 };
  for (const row of directorProviderRows) {
    const key = row.authProvider;
    if (key === "google") providerCounts.google += row._count._all;
    else if (key === "kakao") providerCounts.kakao += row._count._all;
    else providerCounts.other += row._count._all;
  }
  const totalDirectors =
    providerCounts.google + providerCounts.kakao + providerCounts.other;

  return {
    totalAcademies,
    activeAcademies,
    totalStudents,
    totalStaff,
    totalQuestions,
    totalPassages,
    totalExams,
    pendingRegistrations,
    totalCreditsConsumed: Math.abs(creditStats._sum.amount ?? 0),
    transactionsLast30Days: recentTransactions,
    estimatedMonthlyRevenue: monthlyRevenue,
    directorsByProvider: {
      total: totalDirectors,
      google: providerCounts.google,
      kakao: providerCounts.kakao,
      other: providerCounts.other,
    },
  };
}
