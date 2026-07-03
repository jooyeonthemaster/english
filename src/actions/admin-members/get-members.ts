"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth-admin";
import {
  MAX_SEARCH_LENGTH,
  REDACTED,
  SMS_OPT_OUT_FLAG_KEY,
  isInternalAccount,
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
  // limit 미지정 시 전체 로드 — 회원 검색이 일부(이전 500명 캡)가 아니라 전 범위를
  // 대상으로 이뤄지도록. 명시적으로 넘긴 경우에만 상한(5000)을 적용한다.
  const limit =
    filters.limit === undefined
      ? undefined
      : Math.min(Math.max(filters.limit, 1), 5000);

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

  // NOTE: balance sort is performed in memory after a full DB pull (no take
  // when limit is unset). For typical admin-side member counts this is
  // acceptable. If the member table grows past low-thousands, migrate to a raw
  // join with ORDER BY credit_balances.balance DESC and server-side search.
  // lastActiveAt(=로그인/사용 중 최근)은 파생값이라 DB 정렬이 불가 — 화면(클라이언트)
  // 에서 정렬한다. balance와 동일하게 넓게 떠서 메모리 정렬(회원 수가 수천 미만 가정).
  const dbOrderBy: Prisma.StaffOrderByWithRelationInput =
    sortKey === "balance" || sortKey === "lastActiveAt"
      ? { createdAt: "desc" }
      : { createdAt: sortOrder };

  const staffRows = await prisma.staff.findMany({
    where: { AND: conditions },
    orderBy: dbOrderBy,
    ...(limit !== undefined ? { take: limit } : {}),
    include: {
      academy: {
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          memo: true,
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
              expiresAt: true,
            },
          },
          // SMS 발송 제외 플래그 — academy_feature_flags 재사용(마이그레이션 불필요)
          academyFeatureFlags: {
            where: { key: SMS_OPT_OUT_FLAG_KEY },
            select: { enabled: true },
            take: 1,
          },
        },
      },
    },
  });

  // "최근 활동" = 마지막 로그인과 마지막 실제 사용(크레딧 소비) 중 더 최근 것.
  // lastLoginAt만 보면 세션 유지 회원이 매일 써도 "오래 전"으로 보이는 문제 해결.
  const academyIds = [...new Set(staffRows.map((s) => s.academyId))];
  const lastUsageRows = academyIds.length
    ? await prisma.creditTransaction.groupBy({
        by: ["academyId"],
        where: { academyId: { in: academyIds }, type: "CONSUMPTION" },
        _max: { createdAt: true },
      })
    : [];
  const lastUsageMap = new Map(
    lastUsageRows.map((r) => [r.academyId, r._max.createdAt]),
  );

  // 학원별 "가장 최근 구입한 상품" — 완료된 크레딧 충전(CreditTopUp) 중 최신 1건.
  // distinct(academyId) + orderBy(academyId, completedAt desc)로 학원당 최신 행만.
  const latestTopUpRows = academyIds.length
    ? await prisma.creditTopUp.findMany({
        where: { academyId: { in: academyIds }, status: "COMPLETED" },
        orderBy: [
          { academyId: "asc" },
          { completedAt: { sort: "desc", nulls: "last" } },
        ],
        distinct: ["academyId"],
        select: {
          academyId: true,
          orderName: true,
          creditAmount: true,
          price: true,
          completedAt: true,
          createdAt: true,
        },
      })
    : [];
  const latestTopUpMap = new Map(latestTopUpRows.map((t) => [t.academyId, t]));

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
    lastActiveAt: (() => {
      const dates = [s.lastLoginAt, lastUsageMap.get(s.academyId)].filter(
        (d): d is Date => Boolean(d),
      );
      return dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : null;
    })(),
    // 문자 발송 대상 관리용 플래그 — 화면 목록에서 바로 토글/표시한다.
    smsOptOut: s.academy.academyFeatureFlags[0]?.enabled ?? false,
    // 마케팅 수신 동의 — 광고성 발송 대상 필터에 쓰인다(정보통신망법 opt-in).
    marketingConsent: s.marketingConsent === true,
    isInternal: isInternalAccount({
      name: s.name,
      academyName: s.academy.name,
      email: s.email,
    }),
    academy: {
      id: s.academy.id,
      name: s.academy.name,
      slug: s.academy.slug,
      status: s.academy.status,
      memo: s.academy.memo,
    },
    subscription: s.academy.subscriptions[0]
      ? {
          status: s.academy.subscriptions[0].status,
          planName: s.academy.subscriptions[0].plan.name,
          planTier: s.academy.subscriptions[0].plan.tier,
          currentPeriodEnd: s.academy.subscriptions[0].currentPeriodEnd,
        }
      : null,
    // 가장 최근 구입한 상품(완료된 충전). 목록의 "최근 구입 상품" 열/정렬에 사용.
    latestPurchase: (() => {
      const t = latestTopUpMap.get(s.academyId);
      if (!t) return null;
      return {
        name: t.orderName ?? `${t.creditAmount.toLocaleString("ko-KR")} 크레딧`,
        creditAmount: t.creditAmount,
        price: t.price,
        purchasedAt: t.completedAt ?? t.createdAt,
      };
    })(),
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
