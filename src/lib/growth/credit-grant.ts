/**
 * In-transaction credit grant / clawback helpers for the growth program.
 *
 * Unlike `allocateCredits` in @/lib/credits (which returns void and uses a bare
 * `.update`), these run inside a caller-provided transaction and RETURN the
 * ledger transaction id, so the caller can persist the linkage (referral.referrerTxId,
 * academyMissionClaim.creditTxId) and enforce idempotency atomically in the same tx.
 *
 * Idempotency is the CALLER's responsibility — create the unique guard row
 * (Referral.referredAcademyId / AcademyMissionClaim composite unique) inside the
 * SAME transaction before calling grant, so a duplicate guard insert (P2002)
 * aborts the whole tx and prevents a double grant.
 */

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  NO_EXPIRY_FALLBACK,
  expiresAtConflictSql,
  expiresAtInsertSql,
  expiresAtConflictSqlToDate,
  expiresAtInsertSqlToDate,
} from "@/lib/credit-expiry";

export interface GrantResult {
  transactionId: string;
  balanceAfter: number;
}

export interface GrantBonusParams {
  academyId: string;
  amount: number; // positive
  description: string;
  operationType?: string | null;
  referenceId?: string | null;
  referenceType?: string | null;
  staffId?: string | null;
  adminId?: string | null;
  metadata?: Record<string, unknown> | null;
  // Optional validity window. `> 0` EXTENDs the balance-wide expiry by
  // (remaining + expiryDays) via the standard credit-expiry pipeline; omitted /
  // 0 / null keeps the existing RIDE behaviour (promo/mission grants — the
  // expiry is untouched, and a brand-new balance gets NO_EXPIRY_FALLBACK).
  expiryDays?: number | null;
  // Optional ABSOLUTE expiry date (takes precedence over expiryDays). Extends the
  // balance-wide expiry to this date, never shortening (GREATEST). Use for a
  // calendar-picked expiry so it doesn't drift with issue→grant elapsed time.
  expiresAt?: Date | null;
}

/**
 * Atomically add bonus credits (type=TOP_UP) to an academy and append a ledger row.
 * Defensive against a missing CreditBalance row (creates it).
 */
export async function grantBonusCreditsTx(
  tx: Prisma.TransactionClient,
  params: GrantBonusParams,
): Promise<GrantResult> {
  const { academyId, amount } = params;
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`grantBonusCreditsTx: invalid amount ${amount}`);
  }

  const absoluteExpiry =
    params.expiresAt instanceof Date && !Number.isNaN(params.expiresAt.getTime())
      ? params.expiresAt
      : null;
  const expiryDays =
    Number.isFinite(params.expiryDays) && (params.expiryDays ?? 0) > 0
      ? Math.floor(params.expiryDays as number)
      : 0;

  let balanceAfter: number;
  if (absoluteExpiry || expiryDays > 0) {
    // EXTEND — raw upsert so the expiry math runs in the DB (race-safe, no
    // read-modify-write window), mirroring the admin-grant path. Still atomic on
    // the academyId unique index. bonusCredits/totalAllocated increment as usual.
    // 절대 만료일(캘린더 선택)이 있으면 그 날짜로 연장(단축 없음), 없으면 상대일수 EXTEND.
    const insertExpiry = absoluteExpiry
      ? expiresAtInsertSqlToDate(absoluteExpiry)
      : expiresAtInsertSql(expiryDays);
    const conflictExpiry = absoluteExpiry
      ? expiresAtConflictSqlToDate(absoluteExpiry)
      : expiresAtConflictSql(expiryDays);
    const rows = await tx.$queryRaw<Array<{ balance: number }>>`
      INSERT INTO credit_balances (id, "academyId", balance, "bonusCredits", "totalAllocated", "monthlyAllocation", "expiresAt", "updatedAt")
      VALUES (${randomUUID()}, ${academyId}, ${amount}, ${amount}, ${amount}, 0, ${insertExpiry}, NOW())
      ON CONFLICT ("academyId") DO UPDATE
        SET balance = credit_balances.balance + EXCLUDED.balance,
            "bonusCredits" = credit_balances."bonusCredits" + EXCLUDED."bonusCredits",
            "totalAllocated" = credit_balances."totalAllocated" + EXCLUDED."totalAllocated",
            "expiresAt" = ${conflictExpiry},
            "updatedAt" = NOW()
      RETURNING balance
    `;
    if (rows.length === 0) throw new Error("grantBonusCreditsTx: upsert_failed");
    balanceAfter = rows[0].balance;
  } else {
    // RIDE — existing behaviour, untouched for mission/referral callers.
    // Upsert is atomic on the academyId unique index, so a concurrent first-ever
    // grant to a brand-new academy can't lose to a P2002 create race.
    const balance = await tx.creditBalance.upsert({
      where: { academyId },
      create: {
        academyId,
        balance: amount,
        bonusCredits: amount,
        totalAllocated: amount,
        // 보너스/프로모션 지급은 기존 소멸일을 승계하되, 신규 잔액이면 무기한
        // 대신 대체 시한을 부여한다(진짜 무기한 null 을 만들지 않는다).
        expiresAt: NO_EXPIRY_FALLBACK,
      },
      update: {
        balance: { increment: amount },
        totalAllocated: { increment: amount },
        bonusCredits: { increment: amount },
      },
    });
    balanceAfter = balance.balance;
  }

  const transaction = await tx.creditTransaction.create({
    data: {
      academyId,
      type: "TOP_UP",
      amount,
      balanceAfter,
      operationType: params.operationType ?? null,
      description: params.description,
      referenceId: params.referenceId ?? null,
      referenceType: params.referenceType ?? null,
      staffId: params.staffId ?? null,
      adminId: params.adminId ?? null,
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
    },
  });

  return { transactionId: transaction.id, balanceAfter };
}

export interface ClawbackParams {
  academyId: string;
  amount: number; // positive amount to reverse
  description: string;
  referenceId?: string | null;
  referenceType?: string | null;
  adminId?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Reverse a previously-granted bonus (e.g. confirmed fraud). Decrements balance,
 * clamped at 0 (records any shortfall in metadata), and appends a negative
 * ADJUSTMENT ledger row. The credit ledger stays append-only (we never mutate the
 * original grant row).
 */
export async function clawbackCreditsTx(
  tx: Prisma.TransactionClient,
  params: ClawbackParams,
): Promise<GrantResult> {
  const { academyId, amount } = params;
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`clawbackCreditsTx: invalid amount ${amount}`);
  }

  const current = await tx.creditBalance.findUnique({ where: { academyId } });
  if (!current) {
    throw new Error(`clawbackCreditsTx: no balance row for ${academyId}`);
  }

  const reversible = Math.min(amount, current.balance);
  const shortfall = amount - reversible;

  if (reversible > 0) {
    await tx.creditBalance.update({
      where: { academyId },
      data: {
        balance: { decrement: reversible },
        bonusCredits: { decrement: Math.min(reversible, current.bonusCredits) },
      },
    });
    // Maintain the invariant bonusCredits <= balance. These can legitimately
    // drift apart because consumption decrements balance but not bonusCredits,
    // so after a clawback bonusCredits could otherwise exceed the new balance.
    const after = await tx.creditBalance.findUnique({ where: { academyId } });
    if (after && after.bonusCredits > after.balance) {
      await tx.creditBalance.update({
        where: { academyId },
        data: { bonusCredits: Math.max(after.balance, 0) },
      });
    }
  }

  const balance = await tx.creditBalance.findUnique({ where: { academyId } });

  const transaction = await tx.creditTransaction.create({
    data: {
      academyId,
      type: "ADJUSTMENT",
      amount: -reversible,
      balanceAfter: balance!.balance,
      description: params.description,
      referenceId: params.referenceId ?? null,
      referenceType: params.referenceType ?? null,
      adminId: params.adminId ?? null,
      metadata: JSON.stringify({
        ...(params.metadata ?? {}),
        clawback: true,
        requestedAmount: amount,
        reversedAmount: reversible,
        unreversedShortfall: shortfall,
      }),
    },
  });

  return { transactionId: transaction.id, balanceAfter: balance!.balance };
}
