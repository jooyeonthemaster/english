import { prisma } from "@/lib/prisma";
import { CREDIT_COSTS, TOP_UP_PACKS } from "@/lib/credit-costs";

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
  perCredit: number;
  estimatedAutoQuestionCount: number;
  perAutoQuestion: number;
  promotionName: string | null;
  promotionStartsAt: string | null;
  promotionEndsAt: string | null;
  isPromotionActive: boolean;
  hasScheduledPromotion: boolean;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

function getEstimatedAutoQuestionCount(credits: number) {
  // 자동 출제는 문제 1개당 AUTO_GEN_BATCH 크레딧 — 크레딧으로 만들 수 있는 문제 수.
  return Math.floor(credits / CREDIT_COSTS.AUTO_GEN_BATCH);
}

export const DEFAULT_CREDIT_TOP_UP_PRODUCTS = TOP_UP_PACKS.map((pack, index) => {
  const estimatedQuestions = getEstimatedAutoQuestionCount(pack.credits);

  return {
    code: `CREDIT_${pack.credits}`,
    name: pack.label,
    creditAmount: pack.credits,
    basePrice: pack.price,
    discountRate: 0,
    promotionName: null,
    promotionStartsAt: null,
    promotionEndsAt: null,
    description: `자동출제 약 ${estimatedQuestions.toLocaleString("ko-KR")}문항을 생성할 수 있는 SMOAT AI 크레딧 디지털 이용권입니다.`,
    isActive: true,
    sortOrder: (index + 1) * 10,
  };
});

type CreditTopUpProductRecord = {
  id: string;
  code: string;
  name: string;
  creditAmount: number;
  basePrice: number;
  discountRate: number;
  promotionName: string | null;
  promotionStartsAt: Date | null;
  promotionEndsAt: Date | null;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

export function calculateCreditProductPrice(
  basePrice: number,
  discountRate: number,
): number {
  if (basePrice <= 0 || discountRate <= 0) return basePrice;
  if (discountRate >= 100) return 0;
  return Math.round(basePrice * (100 - discountRate) / 100);
}

export function isCreditProductPromotionActive(
  product: Pick<
    CreditTopUpProductRecord,
    "discountRate" | "promotionStartsAt" | "promotionEndsAt"
  >,
  now = new Date(),
) {
  if (product.discountRate <= 0) return false;
  if (!product.promotionStartsAt || !product.promotionEndsAt) return false;
  return product.promotionStartsAt <= now && now < product.promotionEndsAt;
}

export function toCreditTopUpProductView(
  product: CreditTopUpProductRecord,
  now = new Date(),
): CreditTopUpProductView {
  const isPromotionActive = isCreditProductPromotionActive(product, now);
  const price = isPromotionActive
    ? calculateCreditProductPrice(product.basePrice, product.discountRate)
    : product.basePrice;
  const estimatedAutoQuestionCount = getEstimatedAutoQuestionCount(
    product.creditAmount,
  );

  return {
    id: product.id,
    code: product.code,
    name: product.name,
    label: product.name,
    creditAmount: product.creditAmount,
    basePrice: product.basePrice,
    price,
    discountRate: product.discountRate,
    discountAmount: Math.max(product.basePrice - price, 0),
    perCredit: product.creditAmount > 0 ? Math.round(price / product.creditAmount) : 0,
    estimatedAutoQuestionCount,
    perAutoQuestion:
      estimatedAutoQuestionCount > 0
        ? Math.round(price / estimatedAutoQuestionCount)
        : 0,
    promotionName: product.promotionName,
    promotionStartsAt: product.promotionStartsAt?.toISOString() ?? null,
    promotionEndsAt: product.promotionEndsAt?.toISOString() ?? null,
    isPromotionActive,
    hasScheduledPromotion: product.discountRate > 0,
    description: product.description,
    isActive: product.isActive,
    sortOrder: product.sortOrder,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

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
}) {
  await ensureDefaultCreditTopUpProducts();

  const products = await prisma.creditTopUpProduct.findMany({
    where: options?.includeInactive ? undefined : { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { creditAmount: "asc" }],
  });

  return products.map((product) => toCreditTopUpProductView(product));
}

export async function getActiveCreditTopUpProductByCredits(credits: number) {
  await ensureDefaultCreditTopUpProducts();

  const product = await prisma.creditTopUpProduct.findUnique({
    where: { creditAmount: credits },
  });

  if (!product || !product.isActive) return null;
  return toCreditTopUpProductView(product);
}
