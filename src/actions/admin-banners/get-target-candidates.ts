"use server";

import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth-admin";
import { isSuperAdmin, maskEmail } from "@/actions/admin-members/_shared";

export interface BannerTargetCandidate {
  academyId: string;
  memberName: string;
  academyName: string;
  email: string;
  provider: string | null;
  isActive: boolean;
  /** 가입일 (ISO). */
  createdAt: string;
  /** 크레딧 잔액. */
  balance: number;
  /** 크레딧 소멸 예정일 (ISO) — 없으면 null. */
  expiresAt: string | null;
  /** 최근 구입 상품명 — 없으면 null. */
  lastProductName: string | null;
}

/**
 * Member/academy list for the banner target picker, enriched with the fields the
 * picker filters on (signup date, credit balance, credit expiry, last purchased
 * product). One row per academy; PII (email) masked for non-SUPER_ADMIN.
 */
export async function getBannerTargetCandidates(): Promise<BannerTargetCandidate[]> {
  const session = await requireAdminAuth();
  const elevated = isSuperAdmin(session);

  const rows = await prisma.staff.findMany({
    where: { role: "DIRECTOR" },
    orderBy: { createdAt: "desc" },
    select: {
      name: true,
      email: true,
      authProvider: true,
      isActive: true,
      createdAt: true,
      academy: {
        select: {
          id: true,
          name: true,
          creditBalance: { select: { balance: true, expiresAt: true } },
        },
      },
    },
  });

  // Latest completed top-up per academy → "최근 구입 상품".
  const academyIds = [...new Set(rows.map((r) => r.academy.id))];
  const topups = academyIds.length
    ? await prisma.creditTopUp.findMany({
        where: { academyId: { in: academyIds }, status: "COMPLETED" },
        orderBy: [{ academyId: "asc" }, { completedAt: { sort: "desc", nulls: "last" } }],
        distinct: ["academyId"],
        select: { academyId: true, orderName: true },
      })
    : [];
  const topupMap = new Map(topups.map((t) => [t.academyId, t.orderName]));

  const seen = new Set<string>();
  const out: BannerTargetCandidate[] = [];
  for (const s of rows) {
    if (seen.has(s.academy.id)) continue;
    seen.add(s.academy.id);
    out.push({
      academyId: s.academy.id,
      memberName: s.name,
      academyName: s.academy.name,
      email: elevated ? s.email : maskEmail(s.email),
      provider: s.authProvider,
      isActive: s.isActive,
      createdAt: s.createdAt.toISOString(),
      balance: s.academy.creditBalance?.balance ?? 0,
      expiresAt: s.academy.creditBalance?.expiresAt
        ? s.academy.creditBalance.expiresAt.toISOString()
        : null,
      lastProductName: topupMap.get(s.academy.id) ?? null,
    });
  }
  return out;
}
