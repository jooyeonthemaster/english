export type PlanPromotion = {
  name: string;
  discountRate: number;
  startsAt: string;
  endsAt: string;
};

export type SubscriptionPlanFeatures = Record<string, unknown> & {
  promotion?: PlanPromotion;
};

export type PlanPricingPreview = {
  originalPrice: number;
  finalPrice: number;
  discountAmount: number;
  promotion: PlanPromotion | null;
  isPromotionActive: boolean;
  hasScheduledPromotion: boolean;
};

export function parseSubscriptionPlanFeatures(
  features: string | null | undefined,
): SubscriptionPlanFeatures {
  if (!features) return {};

  try {
    const parsed = JSON.parse(features) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed as SubscriptionPlanFeatures;
  } catch {
    return {};
  }
}

export function serializeSubscriptionPlanFeatures(
  features: SubscriptionPlanFeatures,
): string {
  return JSON.stringify(features);
}

export function normalizePromotion(
  promotion: Partial<PlanPromotion> | null | undefined,
): PlanPromotion | null {
  if (!promotion) return null;

  const discountRate = Number(promotion.discountRate);
  const name = String(promotion.name ?? "").trim();
  const startsAt = String(promotion.startsAt ?? "").trim();
  const endsAt = String(promotion.endsAt ?? "").trim();

  if (!discountRate || discountRate <= 0 || !startsAt || !endsAt) {
    return null;
  }

  return {
    name: name || `${discountRate}% 할인`,
    discountRate,
    startsAt,
    endsAt,
  };
}

export function calculateDiscountedPrice(
  price: number,
  discountRate: number,
): number {
  if (price <= 0 || discountRate <= 0) return price;
  if (discountRate >= 100) return 0;
  return Math.round(price * (100 - discountRate) / 100);
}

export function getPlanPricingPreview(
  plan: { monthlyPrice: number; features?: string | null },
  now = new Date(),
): PlanPricingPreview {
  const features = parseSubscriptionPlanFeatures(plan.features);
  const promotion = normalizePromotion(features.promotion);

  const startsAt = promotion ? new Date(promotion.startsAt) : null;
  const endsAt = promotion ? new Date(promotion.endsAt) : null;
  const isPromotionActive = Boolean(
    promotion &&
      startsAt &&
      endsAt &&
      !Number.isNaN(startsAt.getTime()) &&
      !Number.isNaN(endsAt.getTime()) &&
      startsAt <= now &&
      now < endsAt,
  );
  const finalPrice = isPromotionActive
    ? calculateDiscountedPrice(plan.monthlyPrice, promotion?.discountRate ?? 0)
    : plan.monthlyPrice;

  return {
    originalPrice: plan.monthlyPrice,
    finalPrice,
    discountAmount: Math.max(plan.monthlyPrice - finalPrice, 0),
    promotion,
    isPromotionActive,
    hasScheduledPromotion: Boolean(promotion),
  };
}
