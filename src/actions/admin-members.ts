"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth-admin";
import {
  MAX_ADJUSTMENT_AMOUNT,
  TRANSACTION_TYPES,
  getOperationTypeLabel,
  getTransactionTypeLabel,
} from "@/lib/admin-members-labels";

// ============================================================================
// Types & Constants
// ============================================================================

export type ProviderFilter = "all" | "google" | "kakao" | "other";
export type ActiveFilter = "all" | "active" | "inactive";
export type MemberSortKey = "createdAt" | "lastLoginAt" | "balance";
export type SortOrder = "asc" | "desc";

export interface MemberListFilters {
  provider?: ProviderFilter;
  active?: ActiveFilter;
  search?: string;
  sortKey?: MemberSortKey;
  sortOrder?: SortOrder;
  limit?: number;
}

// All admin-facing time grouping happens in Asia/Seoul so dashboards line up
// with how the operator perceives the day, regardless of Postgres or browser
// timezone. Centralized constant prevents drift across queries.
const DISPLAY_TIMEZONE = "Asia/Seoul";

// Redaction marker for PII fields shown to non-SUPER_ADMIN sessions.
const REDACTED = "—";

function isSuperAdmin(session: { role: string } | null | undefined): boolean {
  return session?.role === "SUPER_ADMIN";
}

// Email masking that keeps domain-level visibility (useful for triage)
// but hides the full local-part identity from SUPPORT-tier admins.
function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return REDACTED;
  const local = email.slice(0, at);
  const domain = email.slice(at);
  if (local.length <= 2) return `${local[0] ?? ""}*${domain}`;
  return `${local[0]}${"*".repeat(Math.min(local.length - 2, 6))}${local[local.length - 1]}${domain}`;
}

// ============================================================================
// Result discriminated union (codebase-wide pattern for new actions)
// ============================================================================

type ActionFail = { success: false; error: string };
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type ActionResult<T extends object = {}> =
  | ({ success: true } & T)
  | ActionFail;

function fail(error: string): ActionFail {
  return { success: false, error };
}

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

// ============================================================================
// 3. Member transaction history (paginated)
// ============================================================================

export interface TransactionFilters {
  type?: string;
  operationType?: string;
  cursor?: string | null;
  limit?: number;
}

export type TransactionListResult =
  | { kind: "ok"; items: TransactionListItem[]; nextCursor: string | null }
  | { kind: "not_found" }
  | { kind: "not_director" }
  | { kind: "invalid_input"; error: string };

interface TransactionListItem {
  id: string;
  type: string;
  typeLabel: string;
  amount: number;
  balanceAfter: number;
  operationType: string | null;
  operationLabel: string;
  description: string | null;
  referenceId: string | null;
  referenceType: string | null;
  staffId: string | null;
  adminId: string | null;
  metadata: string | null;
  createdAt: Date;
}

export async function getMemberTransactions(
  memberId: string,
  filters: TransactionFilters = {},
): Promise<TransactionListResult> {
  const session = await requireAdminAuth();
  const elevated = isSuperAdmin(session);

  const staff = await prisma.staff.findUnique({
    where: { id: memberId },
    select: { academyId: true, role: true },
  });
  if (!staff) return { kind: "not_found" };
  if (staff.role !== "DIRECTOR") return { kind: "not_director" };

  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
  const where: Prisma.CreditTransactionWhereInput = {
    academyId: staff.academyId,
  };

  if (filters.type && filters.type !== "all") {
    if (!(TRANSACTION_TYPES as readonly string[]).includes(filters.type)) {
      return { kind: "invalid_input", error: "알 수 없는 거래 종류입니다." };
    }
    where.type = filters.type;
  }
  if (filters.operationType && filters.operationType !== "all") {
    // Allowlist defends against value reflection back to UI / CSV exports
    // even though Prisma parameterizes the SQL itself.
    if (!OPERATION_TYPE_ALLOWLIST.has(filters.operationType)) {
      return { kind: "invalid_input", error: "알 수 없는 상품 종류입니다." };
    }
    where.operationType = filters.operationType;
  }

  const items = await prisma.creditTransaction.findMany({
    where,
    // Tiebreaker on `id` — `createdAt` collisions in burst writes would
    // otherwise drop or duplicate rows across cursor pages.
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
  });

  const hasMore = items.length > limit;
  const slice = hasMore ? items.slice(0, limit) : items;

  return {
    kind: "ok",
    items: slice.map((tx) => ({
      id: tx.id,
      type: tx.type,
      typeLabel: getTransactionTypeLabel(tx.type),
      amount: tx.amount,
      balanceAfter: tx.balanceAfter,
      operationType: tx.operationType,
      operationLabel: getOperationTypeLabel(tx.operationType),
      description: tx.description,
      referenceId: tx.referenceId,
      referenceType: tx.referenceType,
      staffId: tx.staffId,
      adminId: tx.adminId,
      // Per-call metadata may include API token costs / model names / prompt
      // hashes. SUPPORT-tier admins do not need this operational detail.
      metadata: elevated ? tx.metadata : null,
      createdAt: tx.createdAt,
    })),
    nextCursor: hasMore ? slice[slice.length - 1].id : null,
  };
}

// ============================================================================
// 4. Manual credit adjustment (atomic, audit-logged, SUPER_ADMIN only)
// ============================================================================

const adjustmentSchema = z.object({
  memberId: z.string().min(1),
  amount: z
    .number()
    .int({ message: "정수만 입력 가능합니다." })
    .refine((n) => n !== 0, "0이 아닌 값을 입력해주세요.")
    .refine(
      (n) => Math.abs(n) <= MAX_ADJUSTMENT_AMOUNT,
      `한 번에 ${MAX_ADJUSTMENT_AMOUNT.toLocaleString()} 크레딧을 초과할 수 없습니다.`,
    ),
  reason: z
    .string()
    .trim()
    .min(5, "사유는 5자 이상 입력해주세요.")
    .max(500, "사유는 500자 이하로 입력해주세요."),
});

export async function adjustMemberCredits(input: {
  memberId: string;
  amount: number;
  reason: string;
}): Promise<ActionResult<{ balanceAfter: number; transactionId: string }>> {
  const session = await requireAdminAuth("SUPER_ADMIN");

  const parsed = adjustmentSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다.");
  }
  const { memberId, amount, reason } = parsed.data;

  const staff = await prisma.staff.findUnique({
    where: { id: memberId },
    select: { id: true, academyId: true, role: true },
  });
  if (!staff) return fail("회원을 찾을 수 없습니다.");
  if (staff.role !== "DIRECTOR") {
    return fail("원장 회원만 조정 가능합니다.");
  }

  // Resolve the active subscription's monthlyCredits — needed when
  // initializing a CreditBalance row that doesn't yet exist, so the monthly
  // reset/rollover job sees the correct allocation.
  const activeSub = await prisma.academySubscription.findFirst({
    where: {
      academyId: staff.academyId,
      status: { in: ["ACTIVE", "TRIAL"] },
    },
    include: { plan: { select: { monthlyCredits: true } } },
    orderBy: { createdAt: "desc" },
  });
  const planMonthlyCredits = activeSub?.plan.monthlyCredits ?? 0;

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        // ADJUSTMENT only moves `balance`. Lifetime metrics
        // (totalAllocated/totalConsumed/bonusCredits) are reserved for the
        // organic flows (ALLOCATION/CONSUMPTION/TOP_UP) so reports cleanly
        // separate "operational throughput" from "manual admin overrides".
        // Every adjustment is fully traceable through CreditTransaction.
        //
        // We use raw UPDATE/INSERT ... RETURNING balance so that the audit
        // row's `balanceAfter` reflects the value RIGHT AFTER our own
        // mutation, not a separately-issued findUnique that another
        // concurrent transaction could interleave against. This makes the
        // (balance change, audit row) tuple internally consistent.
        let newBalance: number;

        if (amount < 0) {
          // Atomic guarded decrement: only succeeds when current balance is
          // sufficient. Predicate runs under the row's X-lock taken by the
          // UPDATE, so two concurrent decrements cannot both pass.
          const decremented = await tx.$queryRaw<Array<{ balance: number }>>`
            UPDATE credit_balances
            SET balance = balance + ${amount}, "updatedAt" = NOW()
            WHERE "academyId" = ${staff.academyId}
              AND balance >= ${-amount}
            RETURNING balance
          `;
          if (decremented.length === 0) {
            const exists = await tx.creditBalance.findUnique({
              where: { academyId: staff.academyId },
              select: { id: true },
            });
            if (!exists) throw new Error("balance_not_initialized");
            throw new Error("insufficient_balance");
          }
          newBalance = decremented[0].balance;
        } else {
          // Positive: native Postgres UPSERT (INSERT ... ON CONFLICT DO
          // UPDATE) with RETURNING. Single statement is atomic at the row
          // level — concurrent positive adjustments serialize through the
          // unique-index conflict resolution, each receiving the truthful
          // post-write balance.
          const upserted = await tx.$queryRaw<Array<{ balance: number }>>`
            INSERT INTO credit_balances (id, "academyId", balance, "monthlyAllocation", "updatedAt")
            VALUES (${randomUUID()}, ${staff.academyId}, ${amount}, ${planMonthlyCredits}, NOW())
            ON CONFLICT ("academyId") DO UPDATE
              SET balance = credit_balances.balance + EXCLUDED.balance,
                  "updatedAt" = NOW()
            RETURNING balance
          `;
          if (upserted.length === 0) throw new Error("balance_upsert_failed");
          newBalance = upserted[0].balance;
        }

        const txnRecord = await tx.creditTransaction.create({
          data: {
            academyId: staff.academyId,
            type: "ADJUSTMENT",
            amount,
            balanceAfter: newBalance,
            description: reason,
            adminId: session.adminId,
            referenceType: "ADMIN_ADJUSTMENT",
          },
          select: { id: true, balanceAfter: true },
        });

        return {
          balanceAfter: newBalance,
          transactionId: txnRecord.id,
        };
      },
      {
        // ReadCommitted is sufficient: each guarded UPDATE/UPSERT statement
        // holds its own row X-lock, and we read `newBalance` from the same
        // statement via RETURNING — no separate read window for races.
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        timeout: 10_000,
      },
    );

    revalidatePath(`/admin/members/${memberId}`);
    revalidatePath(`/admin/members`);

    return {
      success: true,
      balanceAfter: result.balanceAfter,
      transactionId: result.transactionId,
    };
  } catch (err) {
    const code = err instanceof Error ? err.message : "unknown_error";
    if (code === "insufficient_balance") {
      return fail("잔고가 부족합니다.");
    }
    if (code === "balance_not_initialized") {
      return fail(
        "초기 잔고가 없는 회원입니다. 먼저 양수 크레딧으로 충전해주세요.",
      );
    }
    console.error("[adjustMemberCredits] failed", {
      memberId,
      adminId: session.adminId,
      err,
    });
    return fail("조정 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
  }
}

// ============================================================================
// 5. Toggle member active state (audit-logged, SUPER_ADMIN only)
// ============================================================================

const toggleSchema = z.object({
  memberId: z.string().min(1),
  isActive: z.boolean(),
  reason: z
    .string()
    .trim()
    .min(5, "사유는 5자 이상 입력해주세요.")
    .max(500, "사유는 500자 이하로 입력해주세요."),
});

// Search query length cap — Prisma parameterizes contains so SQL injection is
// impossible, but a 10MB search string still consumes index/regex CPU.
const MAX_SEARCH_LENGTH = 100;

// Allowlist of operationType values that may be submitted as a filter.
// MUST stay in sync with OPERATION_TYPE_LABELS in
// src/lib/admin-members-labels.ts — when adding a new op-type, update both
// places (or label will appear without the value being filterable, and the
// allowlist will reject any UI selection of it).
const OPERATION_TYPE_ALLOWLIST = new Set([
  "QUESTION_GEN_SINGLE",
  "QUESTION_GEN_VOCAB",
  "AUTO_GEN_BATCH",
  "PASSAGE_ANALYSIS",
  "TEXT_EXTRACTION",
  "EXAM_GENERATION",
]);

export async function toggleMemberActive(input: {
  memberId: string;
  isActive: boolean;
  reason: string;
}): Promise<ActionResult> {
  const session = await requireAdminAuth("SUPER_ADMIN");

  const parsed = toggleSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다.");
  }

  const staff = await prisma.staff.findUnique({
    where: { id: parsed.data.memberId },
    select: { id: true, role: true, isActive: true },
  });
  if (!staff) return fail("회원을 찾을 수 없습니다.");
  if (staff.role !== "DIRECTOR") return fail("원장 회원만 조정 가능합니다.");

  // No-op guard: don't write audit rows for "set active=true on already-active".
  if (staff.isActive === parsed.data.isActive) {
    return fail(
      parsed.data.isActive
        ? "이미 활성 상태입니다."
        : "이미 비활성 상태입니다.",
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.staff.update({
        where: { id: staff.id },
        data: { isActive: parsed.data.isActive },
      });
      await tx.adminAuditLog.create({
        data: {
          adminId: session.adminId,
          targetType: "MEMBER",
          targetId: staff.id,
          action: parsed.data.isActive ? "MEMBER_ACTIVATE" : "MEMBER_DEACTIVATE",
          reason: parsed.data.reason,
          beforeJson: JSON.stringify({ isActive: staff.isActive }),
          afterJson: JSON.stringify({ isActive: parsed.data.isActive }),
        },
      });
    });
  } catch (err) {
    console.error("[toggleMemberActive] failed", {
      memberId: staff.id,
      adminId: session.adminId,
      err,
    });
    return fail("상태 변경 중 오류가 발생했습니다.");
  }

  revalidatePath(`/admin/members/${parsed.data.memberId}`);
  revalidatePath(`/admin/members`);
  return { success: true };
}
