"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth-admin";
import {
  MAX_SEARCH_LENGTH,
  REDACTED,
  isSuperAdmin,
  maskEmail,
  type MemberListFilters,
} from "./_shared";

// ============================================================================
// 1. List members (DIRECTOR-scoped, with academy + plan + balance)
// ============================================================================

export async function getMembers(filters: MemberListFilters = {}) {
  const session = await requireAdminAuth();
  const elevated = isSuperAdmin(session);

  const provider = filters.provider ?? "all";
  const active = filters.active ?? "all";
  const search = (filters.search ?? "").trim().slice(0, MAX_SEARCH_LENGTH);
  const sortKey = filters.sortKey ?? "createdAt";
  const sortOrder = filters.sortOrder ?? "desc";
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);

  const conditions: Prisma.StaffWhereInput[] = [{ role: "DIRECTOR" }];

  if (provider === "google") {
    conditions.push({ authProvider: "google" });
  } else if (provider === "kakao") {
    conditions.push({ authProvider: "kakao" });
  } else if (provider === "other") {
    conditions.push({
      OR: [
        { authProvider: null },
        { authProvider: { notIn: ["google", "kakao"] } },
      ],
    });
  }

  if (active === "active") conditions.push({ isActive: true });
  else if (active === "inactive") conditions.push({ isActive: false });

  if (search) {
    conditions.push({
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { academy: { name: { contains: search, mode: "insensitive" } } },
      ],
    });
  }

  // NOTE: balance sort is performed in memory after a wide DB pull capped by
  // `limit`. For typical admin-side member counts this is acceptable. If the
  // member table grows past low-thousands, migrate to a raw join with
  // ORDER BY credit_balances.balance DESC.
  const dbOrderBy: Prisma.StaffOrderByWithRelationInput =
    sortKey === "balance"
      ? { createdAt: "desc" }
      : sortKey === "lastLoginAt"
        ? { lastLoginAt: { sort: sortOrder, nulls: "last" } }
        : { createdAt: sortOrder };

  const staffRows = await prisma.staff.findMany({
    where: { AND: conditions },
    orderBy: dbOrderBy,
    take: limit,
    include: {
      academy: {
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          subscriptions: {
            where: { status: { in: ["ACTIVE", "TRIAL"] } },
            include: {
              plan: { select: { name: true, tier: true, monthlyCredits: true } },
            },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
          creditBalance: {
            select: {
              balance: true,
              monthlyAllocation: true,
              bonusCredits: true,
              totalConsumed: true,
              totalAllocated: true,
            },
          },
        },
      },
    },
  });

  const mapped = staffRows.map((s) => ({
    id: s.id,
    name: s.name,
    // PII fields are redacted for SUPPORT-tier admins; only SUPER_ADMIN sees
    // raw email/phone. The schema allows future field-level audit if we
    // ever need to log who saw what.
    email: elevated ? s.email : maskEmail(s.email),
    phone: elevated ? s.phone : s.phone ? REDACTED : null,
    avatarUrl: s.avatarUrl,
    authProvider: s.authProvider,
    isActive: s.isActive,
    createdAt: s.createdAt,
    lastLoginAt: s.lastLoginAt,
    academy: {
      id: s.academy.id,
      name: s.academy.name,
      slug: s.academy.slug,
      status: s.academy.status,
    },
    subscription: s.academy.subscriptions[0]
      ? {
          status: s.academy.subscriptions[0].status,
          planName: s.academy.subscriptions[0].plan.name,
          planTier: s.academy.subscriptions[0].plan.tier,
          currentPeriodEnd: s.academy.subscriptions[0].currentPeriodEnd,
        }
      : null,
    creditBalance: s.academy.creditBalance ?? null,
  }));

  if (sortKey === "balance") {
    mapped.sort((a, b) => {
      const av = a.creditBalance?.balance ?? 0;
      const bv = b.creditBalance?.balance ?? 0;
      return sortOrder === "asc" ? av - bv : bv - av;
    });
  }

  return mapped;
}

export type MemberListItem = Awaited<ReturnType<typeof getMembers>>[number];
