import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { CREDIT_COSTS, TOP_UP_PACKS } from "@/lib/credit-costs";

// ============================================================================
// 충전 상품 + 다중 프로모션.
//   한 상품에 여러 프로모션(CreditPromotion)이 동시에 걸릴 수 있고, 뷰어마다
//   "적용되는 하나"를 우선순위로 고른다:
//     ① 링크로 들어온 프로모션 → ② 관리자 priority 높은 것 →
//     ③ 구매자에게 더 유리한(할인+보너스 합) 것 → ④ 마감 임박 순.
// ============================================================================

export type CreditTopUpProductView = {
  id: string;
  code: string;
  name: string;
  label: string;
  creditAmount: number;
  basePrice: number;
  price: number;
  discountRate: number;
  discountAmount: number;
  /** 크레딧 추가 지급률(%). 0 = 없음. */
  bonusRate: number;
  /** 적용 프로모션 반영 실제 지급 크레딧(기본 + 보너스). 없으면 = creditAmount. */
  grantedCreditAmount: number;
  bonusCredits: number;
  perCredit: number;
  expiryDays: number | null;
  estimatedAutoQuestionCount: number;
  perAutoQuestion: number;
  promotionName: string | null;
  promotionStartsAt: string | null;
  promotionEndsAt: string | null;
  /** 이 뷰어에게 프로모션이 실제 적용되는가. */
  isPromotionActive: boolean;
  /** 활성(기간 무관) 프로모션이 하나라도 설정돼 있는가(정가 취소선 노출 판단 등). */
  hasScheduledPromotion: boolean;
  /** 적용된 프로모션 id(없으면 null). */
  activePromotionId: string | null;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type PromoValueType = "PERCENT" | "AMOUNT";

/** 관리자 편집용 개별 프로모션 뷰. */
export type AdminPromotionView = {
  id: string;
  name: string | null;
  discountType: PromoValueType;
  discountValue: number;
  bonusType: PromoValueType;
  bonusValue: number;
  startsAt: string | null;
  endsAt: string | null;
  audience: string; // "ALL" | "TARGETED"
  linkToken: string | null;
  priority: number;
  isActive: boolean;
  targetAcademyIds: string[];
  /** 지금 기간 내 유효한가(활성 + 할인/보너스 존재 + 기간 내). */
  isInWindow: boolean;
};

export type AdminCreditProductView = CreditTopUpProductView & {
  promotions: AdminPromotionView[];
};

/**
 * 프로모션 노출/적용 판정 뷰어 컨텍스트.
 *  - academyId: 로그인 원장의 학원(지정 대상 판정).
 *  - linkTokens: 프로모션 링크 쿠키로 제시된 토큰들(링크 해금 판정).
 *  - asAdmin: 관리자 프리뷰 — 대상 무관하게 적용된 것처럼 계산.
 */
export type PromoViewerContext = {
  academyId?: string | null;
  linkTokens?: string[];
  asAdmin?: boolean;
};

type CreditPromotionRecord = {
  id: string;
  name: string | null;
  discountType: string;
  discountValue: number;
  bonusType: string;
  bonusValue: number;
  startsAt: Date;
  endsAt: Date;
  audience: string;
  linkToken: string | null;
  priority: number;
  isActive: boolean;
  targets?: Array<{ academyId: string }>;
};

type CreditTopUpProductRecord = {
  id: string;
  code: string;
  name: string;
  creditAmount: number;
  basePrice: number;
  expiryDays: number | null;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  promotions?: CreditPromotionRecord[];
};

function getEstimatedAutoQuestionCount(credits: number) {
  return Math.floor(credits / CREDIT_COSTS.AUTO_GEN_BATCH);
}

export const DEFAULT_CREDIT_TOP_UP_PRODUCTS = TOP_UP_PACKS.map((pack, index) => {
  const estimatedQuestions = getEstimatedAutoQuestionCount(pack.credits);
  return {
    code: `CREDIT_${pack.credits}`,
    name: pack.label,
    creditAmount: pack.credits,
    basePrice: pack.price,
    expiryDays: pack.expiryDays,
    description: `자동출제 약 ${estimatedQuestions.toLocaleString("ko-KR")}문항을 생성할 수 있는 SMOAT AI 크레딧 디지털 이용권입니다.`,
    isActive: true,
    sortOrder: (index + 1) * 10,
  };
});

/**
 * 할인 적용가. PERCENT면 value=할인율%(>=100은 0원), AMOUNT면 value=할인 금액(원).
 */
export function calculateDiscountedPrice(
  basePrice: number,
  type: string,
  value: number,
): number {
  if (basePrice <= 0 || value <= 0) return basePrice;
  if (type === "AMOUNT") return Math.max(0, basePrice - value);
  if (value >= 100) return 0;
  return Math.round((basePrice * (100 - value)) / 100);
}

/**
 * 지급 크레딧. PERCENT면 value=추가 지급률%(예 50→총150%), AMOUNT면 value=추가 크레딧 수.
 */
export function calculateGrantedCredits(
  creditAmount: number,
  type: string,
  value: number,
): number {
  if (value <= 0) return creditAmount;
  if (type === "AMOUNT") return creditAmount + value;
  return Math.round((creditAmount * (100 + value)) / 100);
}

function promotionHasBenefit(
  p: Pick<CreditPromotionRecord, "discountValue" | "bonusValue">,
) {
  return p.discountValue > 0 || p.bonusValue > 0;
}

/** 활성 + 할인/보너스 존재 + 지금 기간 내. */
function promotionInWindow(
  p: Pick<
    CreditPromotionRecord,
    "isActive" | "discountValue" | "bonusValue" | "startsAt" | "endsAt"
  >,
  now: Date,
): boolean {
  return (
    p.isActive &&
    promotionHasBenefit(p) &&
    p.startsAt <= now &&
    now < p.endsAt
  );
}

/** 기간 내 + 대상(전체/지정/링크) 판정까지 통과한 "이 뷰어에게 유효한" 프로모션? */
function promotionEligible(
  p: CreditPromotionRecord,
  ctx: PromoViewerContext,
  now: Date,
): boolean {
  if (!promotionInWindow(p, now)) return false;
  if (ctx.asAdmin) return true;
  if (p.audience !== "TARGETED") return true; // "ALL"
  if (
    ctx.academyId &&
    (p.targets ?? []).some((t) => t.academyId === ctx.academyId)
  ) {
    return true;
  }
  if (p.linkToken && (ctx.linkTokens ?? []).includes(p.linkToken)) return true;
  return false;
}

/** 프로모션이 이 상품에서 주는 실제 혜택(원 할인 + 보너스 크레딧). 우선순위 tie-break용. */
function promotionBenefit(
  p: CreditPromotionRecord,
  basePrice: number,
  creditAmount: number,
): number {
  const discountAmt =
    basePrice - calculateDiscountedPrice(basePrice, p.discountType, p.discountValue);
  const bonusC =
    calculateGrantedCredits(creditAmount, p.bonusType, p.bonusValue) - creditAmount;
  return Math.max(0, discountAmt) + Math.max(0, bonusC);
}

/**
 * 여러 프로모션이 동시에 유효할 때 적용할 하나를 우선순위로 고른다.
 * 링크 매칭 → priority(내림) → 혜택 큰 순(원 할인 + 보너스 크레딧) → 마감 임박(오름).
 */
export function pickEffectivePromotion(
  promotions: CreditPromotionRecord[] | undefined,
  ctx: PromoViewerContext,
  now: Date,
  basePrice: number,
  creditAmount: number,
): CreditPromotionRecord | null {
  const eligible = (promotions ?? []).filter((p) =>
    promotionEligible(p, ctx, now),
  );
  if (eligible.length === 0) return null;
  const tokens = new Set(ctx.linkTokens ?? []);
  eligible.sort((a, b) => {
    const al = a.linkToken && tokens.has(a.linkToken) ? 1 : 0;
    const bl = b.linkToken && tokens.has(b.linkToken) ? 1 : 0;
    if (al !== bl) return bl - al;
    if (a.priority !== b.priority) return b.priority - a.priority;
    const sa = promotionBenefit(a, basePrice, creditAmount);
    const sb = promotionBenefit(b, basePrice, creditAmount);
    if (sa !== sb) return sb - sa;
    return a.endsAt.getTime() - b.endsAt.getTime();
  });
  return eligible[0];
}

export function toCreditTopUpProductView(
  product: CreditTopUpProductRecord,
  options: { ctx?: PromoViewerContext; now?: Date } = {},
): CreditTopUpProductView {
  const now = options.now ?? new Date();
  const ctx = options.ctx ?? {};
  const promo = pickEffectivePromotion(
    product.promotions,
    ctx,
    now,
    product.basePrice,
    product.creditAmount,
  );

  const isPromotionActive = promo != null;

  const price = isPromotionActive
    ? calculateDiscountedPrice(product.basePrice, promo.discountType, promo.discountValue)
    : product.basePrice;
  const grantedCreditAmount = isPromotionActive
    ? calculateGrantedCredits(product.creditAmount, promo.bonusType, promo.bonusValue)
    : product.creditAmount;
  const bonusCredits = Math.max(grantedCreditAmount - product.creditAmount, 0);
  const discountAmount = Math.max(product.basePrice - price, 0);
  // 뷰의 discountRate/bonusRate 는 타입 무관 "실효 %"로 노출(기존 표시 호환).
  const discountRate =
    product.basePrice > 0 ? Math.round((discountAmount / product.basePrice) * 100) : 0;
  const bonusRate =
    product.creditAmount > 0
      ? Math.round((bonusCredits / product.creditAmount) * 100)
      : 0;
  const estimatedAutoQuestionCount =
    getEstimatedAutoQuestionCount(grantedCreditAmount);

  // "예약된 프로모션 존재" = 활성 + 혜택 있는 프로모션이 하나라도 있음(기간 무관).
  const hasScheduledPromotion = (product.promotions ?? []).some(
    (p) => p.isActive && promotionHasBenefit(p),
  );

  return {
    id: product.id,
    code: product.code,
    name: product.name,
    label: product.name,
    creditAmount: product.creditAmount,
    basePrice: product.basePrice,
    price,
    discountRate,
    discountAmount,
    bonusRate,
    grantedCreditAmount,
    bonusCredits,
    perCredit:
      grantedCreditAmount > 0 ? Math.round(price / grantedCreditAmount) : 0,
    expiryDays: product.expiryDays,
    estimatedAutoQuestionCount,
    perAutoQuestion:
      estimatedAutoQuestionCount > 0
        ? Math.round(price / estimatedAutoQuestionCount)
        : 0,
    promotionName: promo?.name ?? null,
    promotionStartsAt: promo?.startsAt.toISOString() ?? null,
    promotionEndsAt: promo?.endsAt.toISOString() ?? null,
    isPromotionActive,
    hasScheduledPromotion,
    activePromotionId: promo?.id ?? null,
    description: product.description,
    isActive: product.isActive,
    sortOrder: product.sortOrder,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

function toAdminPromotionView(
  p: CreditPromotionRecord,
  now: Date,
): AdminPromotionView {
  return {
    id: p.id,
    name: p.name,
    discountType: (p.discountType === "AMOUNT" ? "AMOUNT" : "PERCENT"),
    discountValue: p.discountValue,
    bonusType: (p.bonusType === "AMOUNT" ? "AMOUNT" : "PERCENT"),
    bonusValue: p.bonusValue,
    startsAt: p.startsAt.toISOString(),
    endsAt: p.endsAt.toISOString(),
    audience: p.audience,
    linkToken: p.linkToken,
    priority: p.priority,
    isActive: p.isActive,
    targetAcademyIds: (p.targets ?? []).map((t) => t.academyId),
    isInWindow: promotionInWindow(p, now),
  };
}

const PRODUCT_INCLUDE = {
  promotions: {
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    include: { targets: { select: { academyId: true } } },
  },
} satisfies Prisma.CreditTopUpProductInclude;

export async function ensureDefaultCreditTopUpProducts() {
  const count = await prisma.creditTopUpProduct.count();
  if (count > 0) return;
  await prisma.creditTopUpProduct.createMany({
    data: DEFAULT_CREDIT_TOP_UP_PRODUCTS,
    skipDuplicates: true,
  });
}

export async function getCreditTopUpProducts(options?: {
  includeInactive?: boolean;
  ctx?: PromoViewerContext;
}) {
  await ensureDefaultCreditTopUpProducts();
  const products = await prisma.creditTopUpProduct.findMany({
    where: options?.includeInactive ? undefined : { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { creditAmount: "asc" }],
    include: PRODUCT_INCLUDE,
  });
  return products.map((product) =>
    toCreditTopUpProductView(product, { ctx: options?.ctx }),
  );
}

/** 관리자 콘솔용 — 각 상품 + 프로모션 목록 전체(편집용). */
export async function getAdminCreditProductsWithPromotions(): Promise<
  AdminCreditProductView[]
> {
  await ensureDefaultCreditTopUpProducts();
  const now = new Date();
  const products = await prisma.creditTopUpProduct.findMany({
    orderBy: [{ sortOrder: "asc" }, { creditAmount: "asc" }],
    include: PRODUCT_INCLUDE,
  });
  return products.map((product) => ({
    ...toCreditTopUpProductView(product, { ctx: { asAdmin: true }, now }),
    promotions: (product.promotions ?? []).map((p) =>
      toAdminPromotionView(p, now),
    ),
  }));
}

/** 관리자 콘솔용 — 단일 상품 + 프로모션 목록(액션이 저장 후 갱신 반환에 사용). */
export async function getAdminCreditProduct(
  productId: string,
): Promise<AdminCreditProductView | null> {
  const now = new Date();
  const product = await prisma.creditTopUpProduct.findUnique({
    where: { id: productId },
    include: PRODUCT_INCLUDE,
  });
  if (!product) return null;
  return {
    ...toCreditTopUpProductView(product, { ctx: { asAdmin: true }, now }),
    promotions: (product.promotions ?? []).map((p) =>
      toAdminPromotionView(p, now),
    ),
  };
}

export async function getActiveCreditTopUpProductByCredits(
  credits: number,
  ctx?: PromoViewerContext,
) {
  await ensureDefaultCreditTopUpProducts();
  const product = await prisma.creditTopUpProduct.findUnique({
    where: { creditAmount: credits },
    include: PRODUCT_INCLUDE,
  });
  if (!product || !product.isActive) return null;
  return toCreditTopUpProductView(product, { ctx });
}

/**
 * 프로모션 링크 토큰 → 해당 프로모션 검증(링크 라우트/claim용). 상품 id + 지금
 * 유효한지 + 종료시각을 돌려준다. 없거나 만료면 valid=false.
 */
export async function getCreditProductByPromoLink(token: string): Promise<{
  productId: string;
  promotionId: string;
  valid: boolean;
  promotionEndsAt: Date | null;
} | null> {
  const promo = await prisma.creditPromotion.findUnique({
    where: { linkToken: token },
    select: {
      id: true,
      productId: true,
      isActive: true,
      discountValue: true,
      bonusValue: true,
      startsAt: true,
      endsAt: true,
      audience: true,
      linkToken: true,
      priority: true,
    },
  });
  if (!promo) return null;
  const valid = promotionInWindow(promo, new Date());
  return {
    productId: promo.productId,
    promotionId: promo.id,
    valid,
    promotionEndsAt: promo.endsAt,
  };
}

/** 프로모션 링크 랜딩(공개) 표시용 — 링크가 가리키는 프로모션이 적용된 상품 뷰. */
export async function getPromoLandingProduct(token: string): Promise<{
  valid: boolean;
  endsAt: string | null;
  promotionName: string | null;
  product: CreditTopUpProductView;
} | null> {
  const promo = await prisma.creditPromotion.findUnique({
    where: { linkToken: token },
    include: {
      product: { include: PRODUCT_INCLUDE },
    },
  });
  if (!promo || !promo.product) return null;
  const now = new Date();
  const valid = promotionInWindow(promo, now);
  // 링크 토큰으로 계산하면 링크 매칭 우선순위로 이 프로모션이 선택된다.
  const view = toCreditTopUpProductView(promo.product, {
    ctx: { linkTokens: [token] },
    now,
  });
  return {
    valid,
    endsAt: promo.endsAt.toISOString(),
    promotionName: promo.name,
    product: view,
  };
}
