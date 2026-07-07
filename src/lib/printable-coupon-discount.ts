// ============================================================================
// 실물 할인 쿠폰의 충전 결제 적용(§9) — 서버 재검증·재계산 + 결제 상태전이 훅.
//   · resolveCouponVsPromo : 프리페어에서 소유권·상태·만료 재검증 후, 프로모 할인가와
//       실물 쿠폰 할인가를 각각 계산해 "더 저렴한 하나만" 적용(비중첩). 미적용 쿠폰은 소진 안 함.
//   · markCouponUsedTx      : 결제완료 트랜잭션에서 CLAIMED→USED (멱등, usedTopUpId 링크).
//   · rollbackCouponByTopUpTx: 결제 취소/환불 시 USED→CLAIMED 원복.
// ============================================================================

import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeCouponDiscount } from "@/lib/printable-coupon-format";

export interface HeldCoupon {
  id: string;
  title: string;
  effectType: string;
  discountAmount: number | null;
  discountPercent: number | null;
  validUntil: string | null;
}

/**
 * 학원이 보유(CLAIMED)한, 아직 유효한 할인 쿠폰 목록. 충전 패널의 쿠폰 선택 UI용.
 * batch.isActive=false(킬스위치)·만료된 것은 제외한다.
 */
export async function listHeldCoupons(academyId: string): Promise<HeldCoupon[]> {
  const now = new Date();
  const codes = await prisma.printableCouponCode.findMany({
    where: {
      claimedByAcademyId: academyId,
      status: "CLAIMED",
      batch: {
        isActive: true,
        effectType: { in: ["DISCOUNT_AMOUNT", "DISCOUNT_PERCENT"] },
      },
    },
    include: { batch: true },
    orderBy: { claimedAt: "desc" },
  });
  return codes
    .filter((c) => {
      const deadline = c.expiresAt ?? c.batch.validUntil;
      return !deadline || deadline.getTime() > now.getTime();
    })
    .map((c) => ({
      id: c.id,
      title: c.batch.title,
      effectType: c.batch.effectType,
      discountAmount: c.batch.discountAmount,
      discountPercent: c.batch.discountPercent,
      validUntil: c.batch.validUntil ? c.batch.validUntil.toISOString() : null,
    }));
}

export interface CouponVsPromoInput {
  academyId: string;
  couponCodeId?: string | null;
  basePrice: number; // 프로모 이전 정가
  baseCredits: number; // 프로모 이전 기본 지급 크레딧
  promoPrice: number; // 프로모 적용가(없으면 basePrice)
  promoCredits: number; // 프로모 적용 지급 크레딧(없으면 baseCredits)
}

export interface CouponVsPromoResult {
  price: number;
  credits: number;
  source: "coupon" | "promo";
  appliedCouponId: string | null;
  couponDiscount: number; // 실물 쿠폰이 깎은 금액(적용된 경우)
}

/**
 * 비중첩 정책: 프로모 경로(price=promoPrice)와 쿠폰 경로(price=basePrice-couponDiscount)를
 * 각각 계산해 더 저렴한 쪽 하나만 적용한다. 쿠폰이 이겨야 usedTopUpId로 소진된다.
 * 쿠폰이 무효(미보유/만료/타학원/비할인)면 조용히 무시하고 프로모 경로를 쓴다.
 */
export async function resolveCouponVsPromo(
  input: CouponVsPromoInput,
): Promise<CouponVsPromoResult> {
  const promoPath: CouponVsPromoResult = {
    price: input.promoPrice,
    credits: input.promoCredits,
    source: "promo",
    appliedCouponId: null,
    couponDiscount: 0,
  };

  if (!input.couponCodeId) return promoPath;

  const code = await prisma.printableCouponCode.findUnique({
    where: { id: input.couponCodeId },
    include: { batch: true },
  });
  // 소유권·상태·만료·효과 서버 재검증(클라이언트 값 불신).
  if (
    !code ||
    code.status !== "CLAIMED" ||
    code.claimedByAcademyId !== input.academyId ||
    !code.batch.isActive ||
    (code.batch.effectType !== "DISCOUNT_AMOUNT" &&
      code.batch.effectType !== "DISCOUNT_PERCENT")
  ) {
    return promoPath;
  }
  const deadline = code.expiresAt ?? code.batch.validUntil;
  if (deadline && deadline.getTime() <= Date.now()) return promoPath;

  const couponDiscount = computeCouponDiscount(code.batch, input.basePrice);
  const couponPrice = Math.max(0, input.basePrice - couponDiscount);

  // 더 저렴한 쪽만. 프로모가 같거나 더 싸면 쿠폰은 CLAIMED 유지(소진 안 함).
  if (couponPrice < input.promoPrice) {
    return {
      price: couponPrice,
      credits: input.baseCredits,
      source: "coupon",
      appliedCouponId: code.id,
      couponDiscount,
    };
  }
  return promoPath;
}

/**
 * 결제완료 트랜잭션 내: 보유(CLAIMED) 쿠폰을 USED로 확정하고 usedTopUpId를 링크한다.
 * 조건부 UPDATE(status='CLAIMED')가 멱등 가드 — 0행이면 이미 처리된 것으로 보고 무시.
 */
export async function markCouponUsedTx(
  tx: Prisma.TransactionClient,
  couponCodeId: string,
  topUpId: string,
): Promise<void> {
  await tx.$executeRaw`
    UPDATE printable_coupon_codes
    SET status = 'USED', "usedTopUpId" = ${topUpId}, "usedAt" = NOW(), "updatedAt" = NOW()
    WHERE id = ${couponCodeId} AND status = 'CLAIMED'
  `;
}

/**
 * 결제 취소/환불 트랜잭션 내: 이 충전이 소진한 쿠폰을 CLAIMED로 원복(usedTopUpId/usedAt 해제).
 * usedTopUpId로 역참조하므로 어느 쿠폰이 쓰였는지 별도 조회 없이 롤백된다.
 */
export async function rollbackCouponByTopUpTx(
  tx: Prisma.TransactionClient,
  topUpId: string,
): Promise<void> {
  await tx.$executeRaw`
    UPDATE printable_coupon_codes
    SET status = 'CLAIMED', "usedTopUpId" = NULL, "usedAt" = NULL, "updatedAt" = NOW()
    WHERE "usedTopUpId" = ${topUpId} AND status = 'USED'
  `;
}
