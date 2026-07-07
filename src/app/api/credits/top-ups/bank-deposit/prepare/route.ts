import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStaffAuth } from "@/lib/auth";
import { getActiveCreditTopUpProductByCredits } from "@/lib/credit-top-up-products";
import { PROMO_COOKIE, parsePromoTokens } from "@/lib/promo-link";
import {
  BANK_TRANSFER_PAY_METHOD,
  getBankDepositConfig,
  normalizeDepositorName,
} from "@/lib/bank-deposit";
import { resolveCouponVsPromo } from "@/lib/printable-coupon-discount";

const prepareSchema = z.object({
  credits: z.number().int().positive(),
  depositorName: z.string().trim().min(1).max(40),
  couponCodeId: z.string().optional(),
});

/**
 * Create a 무통장입금(bank transfer) top-up order. No PG involved — we return
 * the company account + exact amount + depositor name for the director to use.
 * Credits are granted automatically when the deposit alert arrives at
 * /api/credits/top-ups/bank-notify.
 */
export async function POST(request: NextRequest) {
  try {
    const config = getBankDepositConfig();
    if (!config.enabled) {
      return NextResponse.json(
        { error: "무통장입금이 아직 활성화되지 않았습니다." },
        { status: 503 },
      );
    }

    const staff = await requireStaffAuth("DIRECTOR");
    const body = await request.json().catch(() => null);
    const parsed = prepareSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "충전 상품과 입금자명을 다시 확인해주세요." },
        { status: 400 },
      );
    }

    // 프로모션 적용 여부는 뷰어(내 학원/링크 토큰) 기준으로 서버가 재검증.
    const linkTokens = parsePromoTokens(request.cookies.get(PROMO_COOKIE)?.value);
    const product = await getActiveCreditTopUpProductByCredits(
      parsed.data.credits,
      { academyId: staff.academyId, linkTokens },
    );
    if (!product) {
      return NextResponse.json(
        { error: "지원하지 않는 충전 상품입니다." },
        { status: 400 },
      );
    }

    const depositorName = parsed.data.depositorName;

    // 실물 할인 쿠폰 ↔ 프로모 비중첩(§9) — 서버 재검증 후 더 저렴한 하나만.
    const applied = await resolveCouponVsPromo({
      academyId: staff.academyId,
      couponCodeId: parsed.data.couponCodeId,
      basePrice: product.basePrice,
      baseCredits: product.creditAmount,
      promoPrice: product.price,
      promoCredits: product.grantedCreditAmount,
    });
    const finalPrice = applied.price;
    const couponApplied = applied.source === "coupon";
    const promoActive = product.isPromotionActive && !couponApplied;

    // 동일 학원 + 동일 입금자명 + 동일 금액의 입금 대기 주문이 시간창 내에 이미
    // 있으면 중복 생성을 막는다(같은 입금 1건이 어느 주문인지 구분 불가해지는 것 방지).
    const windowStart = new Date(
      Date.now() - config.matchWindowMinutes * 60_000,
    );
    const pendingSameAmount = await prisma.creditTopUp.findMany({
      where: {
        academyId: staff.academyId,
        paymentMethod: BANK_TRANSFER_PAY_METHOD,
        status: "WAITING_FOR_DEPOSIT",
        price: finalPrice,
        createdAt: { gte: windowStart },
      },
      select: { customData: true },
    });
    const wantedName = normalizeDepositorName(depositorName);
    const hasDuplicate = pendingSameAmount.some((order) => {
      const cd = order.customData;
      const stored =
        cd && typeof cd === "object" && !Array.isArray(cd)
          ? (cd as Record<string, unknown>).depositorName
          : null;
      return (
        typeof stored === "string" &&
        normalizeDepositorName(stored) === wantedName
      );
    });
    if (hasDuplicate) {
      return NextResponse.json(
        {
          error:
            "이미 동일한 입금 대기 주문이 있습니다. 기존 주문에 입금하거나 완료 후 다시 시도해주세요.",
        },
        { status: 409 },
      );
    }

    // 지급 크레딧 = 적용된 경로(쿠폰=기본, 프로모=기본+보너스). 결제금액=finalPrice.
    const grantedCredits = applied.credits;
    const couponCustomData = couponApplied
      ? {
          couponCodeId: applied.appliedCouponId,
          couponDiscount: applied.couponDiscount,
          discountSource: "coupon" as const,
        }
      : { discountSource: promoActive ? ("promo" as const) : ("none" as const) };

    const topUp = await prisma.creditTopUp.create({
      data: {
        academyId: staff.academyId,
        creditAmount: grantedCredits,
        price: finalPrice,
        paymentMethod: BANK_TRANSFER_PAY_METHOD,
        orderName: `SMOAT 크레딧 ${grantedCredits.toLocaleString("ko-KR")}C`,
        currency: "KRW",
        status: "WAITING_FOR_DEPOSIT",
        requestedBy: staff.id,
        customData: {
          academyId: staff.academyId,
          staffId: staff.id,
          credits: grantedCredits,
          price: finalPrice,
          productCode: product.code,
          basePrice: product.basePrice,
          discountRate: promoActive ? product.discountRate : 0,
          bonusRate: promoActive ? product.bonusRate : 0,
          flow: "bank_manual",
          depositorName,
          ...couponCustomData,
        },
      },
      select: { id: true, price: true, creditAmount: true, createdAt: true },
    });

    return NextResponse.json({
      topUpId: topUp.id,
      amount: topUp.price,
      creditAmount: topUp.creditAmount,
      depositorName,
      account: {
        bankName: config.bankName,
        accountNumber: config.accountNumber,
        accountHolder: config.accountHolder,
      },
      windowMinutes: config.matchWindowMinutes,
      createdAt: topUp.createdAt.toISOString(),
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }
    if (err instanceof Error && err.message === "Forbidden") {
      return NextResponse.json(
        { error: "크레딧 충전 권한이 없습니다." },
        { status: 403 },
      );
    }
    console.error("[credits/top-ups/bank-deposit/prepare] failed", err);
    return NextResponse.json(
      { error: "입금 안내 생성 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
