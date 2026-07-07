// ============================================================================
// Credit Expiry — single balance-wide expiration model
// ============================================================================
//
// Every academy's CreditBalance carries ONE `expiresAt`. There are no per-lot
// buckets: the whole balance lives and dies together.
//
// Two grant behaviours:
//   • EXTEND — a purchase, or an admin grant with a validity period. The expiry
//     is pushed to  GREATEST(expiresAt, now) + grantedDays. Equivalently
//     `now + (remaining + grantedDays)`, so a grant never shortens the clock.
//   • RIDE   — a promotion/event credit, or an admin grant left open-ended. The
//     credits join the balance but the expiry is untouched. If there is no
//     active expiry they stay 무기한 until the next EXTEND grant creates one.
//
// Days are measured on a strict 24h basis (not calendar midnight).

import { Prisma } from "@prisma/client";

export const DAY_MS = 86_400_000;

/**
 * "무기한" 크레딧에 강제 적용하는 대체 소멸 시한(2030-12-31 23:59:59 KST).
 * 정책상 진짜 무기한은 두지 않고, 유효기간이 지정되지 않은 크레딧도 이 시한을
 * 소멸 예정일로 갖는다. 서비스가 한국(KST) 기준이므로 +09:00로 고정한다.
 */
export const NO_EXPIRY_FALLBACK = new Date("2030-12-31T23:59:59+09:00");

/**
 * Whole days remaining until `expiresAt` (0 if null, already elapsed, or in the
 * past). Rounded up so "23h left" still reads as 1 day.
 */
export function remainingDays(
  expiresAt: Date | null | undefined,
  now: Date = new Date(),
): number {
  if (!expiresAt) return 0;
  const ms = expiresAt.getTime() - now.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / DAY_MS);
}

/**
 * EXTEND math: new expiry = GREATEST(current, now) + addDays (24h each).
 * `addDays <= 0` (무제한 product / no validity) is a no-op — returns `current`.
 */
export function computeExtendedExpiry(
  current: Date | null | undefined,
  addDays: number,
  now: Date = new Date(),
): Date | null {
  if (!Number.isFinite(addDays) || addDays <= 0) return current ?? null;
  const base =
    current && current.getTime() > now.getTime() ? current : now;
  return new Date(base.getTime() + addDays * DAY_MS);
}

/** True once the balance's clock has run out (and there is something to expire). */
export function isExpired(
  expiresAt: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  return !!expiresAt && expiresAt.getTime() <= now.getTime();
}

/**
 * SQL fragment for the EXTEND rule inside an `INSERT ... ON CONFLICT DO UPDATE`
 * targeting `credit_balances`. Mirrors {@link computeExtendedExpiry} using DB
 * time so the write is race-safe (no read-modify-write window).
 *
 *   SET "expiresAt" = GREATEST(COALESCE(credit_balances."expiresAt", NOW()), NOW())
 *                     + make_interval(days => <addDays>)
 *
 * When `addDays <= 0` the current value is preserved (RIDE).
 */
export function expiresAtConflictSql(addDays: number): Prisma.Sql {
  if (!Number.isFinite(addDays) || addDays <= 0) {
    // RIDE / 무제한: 기존 소멸일을 유지하되, 없으면 무기한 대체 시한을 부여한다
    // (진짜 무기한 null 을 만들지 않는다).
    return Prisma.sql`COALESCE(credit_balances."expiresAt", ${NO_EXPIRY_FALLBACK})`;
  }
  // ${addDays} binds as bigint via Prisma; make_interval's `days` arg is int4,
  // so cast explicitly (make_interval(days => bigint) has no overload).
  return Prisma.sql`GREATEST(COALESCE(credit_balances."expiresAt", NOW()), NOW()) + make_interval(days => ${addDays}::int)`;
}

/**
 * SQL fragment for the EXTEND rule in the `VALUES (...)` of a fresh insert
 * (no prior balance, so remaining = 0 → `NOW() + addDays`). `addDays <= 0`
 * inserts NULL (무기한).
 */
export function expiresAtInsertSql(addDays: number): Prisma.Sql {
  if (!Number.isFinite(addDays) || addDays <= 0) {
    // 신규 잔액인데 유효기간이 없으면 무기한 대신 대체 시한을 부여한다.
    return Prisma.sql`${NO_EXPIRY_FALLBACK}`;
  }
  // See expiresAtConflictSql: cast to int4 so make_interval resolves.
  return Prisma.sql`NOW() + make_interval(days => ${addDays}::int)`;
}

// ── 절대 만료일로 연장(EXTEND-TO-DATE) ───────────────────────────────────────
// "이 크레딧은 특정 날짜까지 유효" 규칙. add-days 대신 목표일로 연장하되, 기존 소멸일이
// 더 나중이면 유지한다(GREATEST — 단축 없음). 상대일수 EXTEND와 달리 발급~등록 사이
// 시간이 흘러도 만료일이 밀리지 않는다(캘린더로 고른 실물 쿠폰 만료일에 적합).

/**
 * `INSERT ... ON CONFLICT DO UPDATE`의 conflict 절: 기존 소멸일과 목표일 중 더 나중.
 *   SET "expiresAt" = GREATEST(COALESCE(credit_balances."expiresAt", <date>), <date>)
 */
export function expiresAtConflictSqlToDate(date: Date): Prisma.Sql {
  return Prisma.sql`GREATEST(COALESCE(credit_balances."expiresAt", ${date}), ${date})`;
}

/** 신규 잔액(prior 없음)의 `VALUES (...)`: 목표일 그대로. */
export function expiresAtInsertSqlToDate(date: Date): Prisma.Sql {
  return Prisma.sql`${date}`;
}
