// ============================================================================
// 실물 쿠폰 등록(Claim) — 서버 서비스.
//   · CREDIT_GRANT : 1 트랜잭션에서 조건부 UPDATE(ACTIVE→USED) + grantBonusCreditsTx + creditTxId
//   · DISCOUNT_*   : 조건부 UPDATE(ACTIVE→CLAIMED) — 실제 할인은 충전 결제 시(§9)
// 멱등성 = 조건부 UPDATE(WHERE status='ACTIVE')의 count 가드. 0행이면 선점 → 실패.
// ============================================================================

import "server-only";
import { prisma } from "@/lib/prisma";
import { grantBonusCreditsTx } from "@/lib/growth/credit-grant";
import { hashCouponToken, normalizeCouponCode } from "@/lib/printable-coupons";

export type ClaimFailReason =
  | "not_found"
  | "not_active"
  | "batch_inactive"
  | "expired"
  | "per_academy_limit"
  | "already_taken"
  | "rate_limited"
  | "error";

export type ClaimResult =
  | {
      ok: true;
      mode: "granted";
      title: string;
      granted: number;
      balanceAfter: number;
      // 지급 후 학원 전체 크레딧의 단일 소멸 예정일(ISO). null=소멸일 없음.
      expiresAt: string | null;
    }
  | {
      ok: true;
      mode: "claimed";
      title: string;
      coupon: {
        effectType: string;
        discountAmount: number | null;
        discountPercent: number | null;
        validUntil: string | null;
      };
    }
  | { ok: false; reason: ClaimFailReason };

const FAIL_MESSAGES: Record<ClaimFailReason, string> = {
  not_found: "존재하지 않는 쿠폰 코드입니다.",
  not_active: "이미 등록되었거나 사용할 수 없는 쿠폰입니다.",
  batch_inactive: "현재 사용할 수 없는 쿠폰입니다.",
  expired: "등록 기간이 지난 쿠폰입니다.",
  per_academy_limit: "이 쿠폰의 학원당 등록 한도를 초과했습니다.",
  already_taken: "방금 다른 요청이 이 쿠폰을 선점했습니다. 다시 확인해주세요.",
  rate_limited: "요청이 너무 잦습니다. 잠시 후 다시 시도해주세요.",
  error: "등록 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
};

export function claimFailMessage(reason: ClaimFailReason): string {
  return FAIL_MESSAGES[reason] ?? FAIL_MESSAGES.error;
}

// ── Rate limit (fixed window, DB-backed — instance-safe) ────────────────────

interface RateLimitOpts {
  windowMs: number;
  max: number;
}

/**
 * 한 (scope,key) 조합의 window 내 시도 수를 원자적으로 증가시키고, max 초과 여부를
 * 반환한다. tutorLoginRateLimit 패턴 차용(upsert + increment).
 */
export async function consumeRateLimit(
  scope: "ip" | "academy",
  key: string,
  { windowMs, max }: RateLimitOpts,
): Promise<boolean> {
  const now = Date.now();
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
  const rec = await prisma.printableCouponClaimRateLimit.upsert({
    where: { scope_key_windowStart: { scope, key: key.slice(0, 128), windowStart } },
    create: { scope, key: key.slice(0, 128), windowStart, count: 1 },
    update: { count: { increment: 1 } },
    select: { count: true },
  });
  return rec.count > max;
}

// ── Claim ───────────────────────────────────────────────────────────────────

export interface ClaimInput {
  token?: string | null;
  code?: string | null;
  academyId: string;
  staffId: string;
}

/**
 * 코드/토큰으로 쿠폰을 등록한다. CREDIT_GRANT는 즉시 지급, DISCOUNT_*는 보유 등록.
 * 비-ok 결과는 throw 없이 {ok:false, reason}로 반환(클라이언트가 사유별 렌더).
 */
export async function claimPrintableCoupon(
  input: ClaimInput,
): Promise<ClaimResult> {
  const { academyId, staffId } = input;

  // 1) 코드 조회 — 토큰(해시 대조) 우선, 없으면 사람입력 코드.
  const where = input.token
    ? { tokenHash: hashCouponToken(input.token) }
    : input.code
      ? { serialNumber: normalizeCouponCode(input.code) }
      : null;
  if (!where) return { ok: false, reason: "not_found" };

  const code = await prisma.printableCouponCode.findUnique({
    where,
    include: { batch: true },
  });
  if (!code) return { ok: false, reason: "not_found" };
  if (code.status !== "ACTIVE") return { ok: false, reason: "not_active" };
  if (!code.batch.isActive) return { ok: false, reason: "batch_inactive" };

  // 2) 만료 — 개별 expiresAt 우선, 없으면 배치 validUntil (서버시간 기준).
  const deadline = code.expiresAt ?? code.batch.validUntil;
  if (deadline && deadline.getTime() <= Date.now()) {
    return { ok: false, reason: "expired" };
  }

  // 3) 학원당 한도 선검증(트랜잭션 안에서 재검증).
  const perLimit = code.batch.perAcademyLimit;
  const alreadyForAcademy = await prisma.printableCouponCode.count({
    where: {
      batchId: code.batchId,
      claimedByAcademyId: academyId,
      status: { in: ["CLAIMED", "USED"] },
    },
  });
  if (alreadyForAcademy >= perLimit) {
    return { ok: false, reason: "per_academy_limit" };
  }

  const batch = code.batch;

  try {
    if (batch.effectType === "CREDIT_GRANT") {
      const result = await prisma.$transaction(async (tx) => {
        // 한도 재검증(트랜잭션 내).
        const perAcademy = await tx.printableCouponCode.count({
          where: {
            batchId: code.batchId,
            claimedByAcademyId: academyId,
            status: { in: ["CLAIMED", "USED"] },
          },
        });
        if (perAcademy >= perLimit) throw new Error("per_academy_limit");

        // 조건부 상태전이 = 멱등 가드. 0행이면 선점.
        const moved = await tx.printableCouponCode.updateMany({
          where: { id: code.id, status: "ACTIVE" },
          data: {
            status: "USED",
            claimedByAcademyId: academyId,
            claimedByStaffId: staffId,
            claimedAt: new Date(),
            usedAt: new Date(),
          },
        });
        if (moved.count === 0) throw new Error("already_taken");

        const grant = await grantBonusCreditsTx(tx, {
          academyId,
          amount: batch.grantCredits ?? 0,
          description: `실물쿠폰 ${batch.title}`,
          operationType: "PRINTABLE_COUPON_GRANT",
          referenceType: "PRINTABLE_COUPON",
          referenceId: code.id,
          staffId,
          // 캘린더로 고른 절대 만료일 우선(발급~등록 경과와 무관하게 그 날짜 만료),
          // 없으면 레거시 상대일수(grantExpiryDays), 둘 다 없으면 무기한(RIDE).
          expiresAt: batch.grantExpiryAt ?? undefined,
          expiryDays: batch.grantExpiryDays ?? 0,
          metadata: { batchId: batch.id, serialNumber: code.serialNumber },
        });

        // creditTxId 2차 방어(@unique) — 같은 코드의 지급 원장은 하나뿐.
        await tx.printableCouponCode.update({
          where: { id: code.id },
          data: { creditTxId: grant.transactionId },
        });

        // 지급 후 학원 전체 크레딧의 단일 소멸 예정일(등록 결과에 표시).
        const bal = await tx.creditBalance.findUnique({
          where: { academyId },
          select: { expiresAt: true },
        });

        return {
          granted: batch.grantCredits ?? 0,
          balanceAfter: grant.balanceAfter,
          expiresAt: bal?.expiresAt ?? null,
        };
      });

      return {
        ok: true,
        mode: "granted",
        title: batch.title,
        granted: result.granted,
        balanceAfter: result.balanceAfter,
        expiresAt: result.expiresAt ? result.expiresAt.toISOString() : null,
      };
    }

    // DISCOUNT_AMOUNT | DISCOUNT_PERCENT — 보유 등록만.
    await prisma.$transaction(async (tx) => {
      const perAcademy = await tx.printableCouponCode.count({
        where: {
          batchId: code.batchId,
          claimedByAcademyId: academyId,
          status: { in: ["CLAIMED", "USED"] },
        },
      });
      if (perAcademy >= perLimit) throw new Error("per_academy_limit");

      const moved = await tx.printableCouponCode.updateMany({
        where: { id: code.id, status: "ACTIVE" },
        data: {
          status: "CLAIMED",
          claimedByAcademyId: academyId,
          claimedByStaffId: staffId,
          claimedAt: new Date(),
        },
      });
      if (moved.count === 0) throw new Error("already_taken");
    });

    return {
      ok: true,
      mode: "claimed",
      title: batch.title,
      coupon: {
        effectType: batch.effectType,
        discountAmount: batch.discountAmount,
        discountPercent: batch.discountPercent,
        validUntil: batch.validUntil ? batch.validUntil.toISOString() : null,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "already_taken") return { ok: false, reason: "already_taken" };
    if (msg === "per_academy_limit")
      return { ok: false, reason: "per_academy_limit" };
    console.error("[claimPrintableCoupon] failed", {
      academyId,
      staffId,
      codeId: code.id,
      err,
    });
    return { ok: false, reason: "error" };
  }
}
