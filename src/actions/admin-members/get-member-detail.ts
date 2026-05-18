"use server";

import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth-admin";
import { getOperationTypeLabel } from "@/lib/admin-members-labels";
import { DISPLAY_TIMEZONE, REDACTED, isSuperAdmin, maskEmail } from "./_shared";

// ============================================================================
// 2. Member detail (full info + recent transactions)
// ============================================================================

export async function getMemberDetail(memberId: string) {
  const session = await requireAdminAuth();
  const elevated = isSuperAdmin(session);

  const staff = await prisma.staff.findUnique({
    where: { id: memberId },
    include: {
      academy: {
        include: {
          subscriptions: {
            include: { plan: true },
            orderBy: { createdAt: "desc" },
          },
          creditBalance: true,
          _count: {
            select: {
              students: true,
              passages: true,
              questions: true,
              exams: true,
            },
          },
        },
      },
    },
  });

  if (!staff) return { kind: "not_found" as const };
  if (staff.role !== "DIRECTOR") return { kind: "not_director" as const };

  const academy = staff.academy;

  const consumptionByOpRaw = await prisma.creditTransaction.groupBy({
    by: ["operationType"],
    where: { academyId: academy.id, type: "CONSUMPTION" },
    _sum: { amount: true },
    _count: { _all: true },
  });

  const consumptionByOp = consumptionByOpRaw
    .map((row) => ({
      operationType: row.operationType,
      label: getOperationTypeLabel(row.operationType),
      totalAmount: Math.abs(row._sum.amount ?? 0),
      count: row._count._all,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  // Group by day in DISPLAY_TIMEZONE so the keys returned to the client match
  // the local-day string the UI builds. Storing as YYYY-MM-DD text avoids
  // any further timezone juggling on either end.
  const dailyRows = await prisma.$queryRaw<
    Array<{ day: string; total: bigint }>
  >`
    SELECT to_char("createdAt" AT TIME ZONE ${DISPLAY_TIMEZONE}, 'YYYY-MM-DD') AS day,
           SUM(ABS(amount))::bigint AS total
    FROM credit_transactions
    WHERE "academyId" = ${academy.id}
      AND type = 'CONSUMPTION'
      AND "createdAt" >= ${since}
    GROUP BY day
    ORDER BY day ASC
  `;

  const dailyConsumption = dailyRows.map((r) => ({
    day: r.day,
    total: Number(r.total),
  }));

  return {
    kind: "ok" as const,
    member: {
      id: staff.id,
      name: staff.name,
      // PII redaction for SUPPORT-tier — same policy as getMembers above.
      email: elevated ? staff.email : maskEmail(staff.email),
      phone: elevated ? staff.phone : staff.phone ? REDACTED : null,
      avatarUrl: staff.avatarUrl,
      authProvider: staff.authProvider,
      isActive: staff.isActive,
      createdAt: staff.createdAt,
      lastLoginAt: staff.lastLoginAt,
      kakaoId: elevated ? staff.kakaoId : null,
      supabaseUserId: elevated ? staff.supabaseUserId : null,
      academy: {
        id: academy.id,
        name: academy.name,
        slug: academy.slug,
        status: academy.status,
        address: academy.address,
        phone: academy.phone,
        createdAt: academy.createdAt,
        counts: academy._count,
      },
      subscriptions: academy.subscriptions.map((sub) => ({
        id: sub.id,
        status: sub.status,
        planName: sub.plan.name,
        planTier: sub.plan.tier,
        monthlyPrice: sub.plan.monthlyPrice,
        monthlyCredits: sub.plan.monthlyCredits,
        currentPeriodStart: sub.currentPeriodStart,
        currentPeriodEnd: sub.currentPeriodEnd,
        cancelledAt: sub.cancelledAt,
      })),
      creditBalance: academy.creditBalance,
      consumptionByOp,
      dailyConsumption,
    },
  };
}

export type MemberDetailResult = Awaited<ReturnType<typeof getMemberDetail>>;
export type MemberDetail = Extract<MemberDetailResult, { kind: "ok" }>["member"];
