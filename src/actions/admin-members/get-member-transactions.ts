"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth-admin";
import {
  TRANSACTION_TYPES,
  getOperationTypeLabel,
  getTransactionTypeLabel,
} from "@/lib/admin-members-labels";
import { OPERATION_TYPE_ALLOWLIST, isSuperAdmin } from "./_shared";

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
  /** 이 거래를 발생시킨 사람 표시명(직원명 또는 관리자명) */
  actorName: string | null;
  actorType: "staff" | "admin" | null;
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

  // 거래를 발생시킨 사람(직원=사용, 관리자=조정) 이름을 일괄 조회해 매핑.
  const staffIds = [
    ...new Set(slice.map((t) => t.staffId).filter((x): x is string => Boolean(x))),
  ];
  const adminIds = [
    ...new Set(slice.map((t) => t.adminId).filter((x): x is string => Boolean(x))),
  ];
  const [staffRows, adminRows] = await Promise.all([
    staffIds.length
      ? prisma.staff.findMany({
          where: { id: { in: staffIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    adminIds.length
      ? prisma.superAdmin.findMany({
          where: { id: { in: adminIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);
  const staffName = new Map(staffRows.map((s) => [s.id, s.name]));
  const adminName = new Map(adminRows.map((a) => [a.id, a.name]));

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
      actorType: tx.adminId ? "admin" : tx.staffId ? "staff" : null,
      actorName: tx.adminId
        ? (adminName.get(tx.adminId) ?? "관리자")
        : tx.staffId
          ? (staffName.get(tx.staffId) ?? null)
          : null,
      // Per-call metadata may include API token costs / model names / prompt
      // hashes. SUPPORT-tier admins do not need this operational detail.
      metadata: elevated ? tx.metadata : null,
      createdAt: tx.createdAt,
    })),
    nextCursor: hasMore ? slice[slice.length - 1].id : null,
  };
}
