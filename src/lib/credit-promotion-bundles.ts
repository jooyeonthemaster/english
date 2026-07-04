import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  toCreditTopUpProductView,
  type CreditTopUpProductView,
} from "@/lib/credit-top-up-products";

// ============================================================================
// 프로모션 번들(공개 랜딩/claim 용 읽기 전용 도메인).
//   번들 = 여러 프로모션을 한 링크(/credits/promo/b/{slug})로 묶은 것.
//   각 구성원 프로모션은 자기 linkToken 을 갖고, claim 시 그 토큰들이 모두
//   쿠키에 심긴다. 가격 계산은 기존 엔진(linkTokens[] 기반)을 그대로 쓴다.
// ============================================================================

// lib/credit-top-up-products.ts 의 PRODUCT_INCLUDE/promotionInWindow 와 동일
// (해당 파일은 변경 금지라 비공개 항목을 재정의).
const PRODUCT_INCLUDE = {
  promotions: {
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    include: { targets: { select: { academyId: true } } },
  },
} satisfies Prisma.CreditTopUpProductInclude;

function promotionInWindow(
  p: {
    isActive: boolean;
    discountValue: number;
    bonusValue: number;
    startsAt: Date;
    endsAt: Date;
  },
  now: Date,
): boolean {
  return (
    p.isActive &&
    (p.discountValue > 0 || p.bonusValue > 0) &&
    p.startsAt <= now &&
    now < p.endsAt
  );
}

export type PromoBundleLandingItem = {
  /** 구성원 프로모션의 링크 토큰(쿠키 seed 용). */
  token: string;
  promotionName: string | null;
  endsAt: string;
  /** 이 프로모션이 적용된 상품 뷰(단일 랜딩과 동일 계산). */
  product: CreditTopUpProductView;
};

export type PromoBundleLanding = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  /** 지금 유효한(활성+기간 내+링크 보유) 구성원 프로모션 카드들. sortOrder 순. */
  items: PromoBundleLandingItem[];
};

/**
 * slug → 활성 번들 + 지금 유효한 구성원 프로모션 카드들.
 * 번들이 없거나 비활성이면 null. 유효 구성원이 0개면 items 가 빈 배열
 * (랜딩은 만료 UI, claim 은 expired 리다이렉트 처리).
 */
export async function getPromoBundleLanding(
  slug: string,
): Promise<PromoBundleLanding | null> {
  const bundle = await prisma.creditPromotionBundle.findUnique({
    where: { slug },
    include: {
      items: {
        orderBy: { sortOrder: "asc" },
        include: {
          promotion: {
            include: { product: { include: PRODUCT_INCLUDE } },
          },
        },
      },
    },
  });
  if (!bundle || !bundle.isActive) return null;

  const now = new Date();
  const items: PromoBundleLandingItem[] = [];
  for (const item of bundle.items) {
    const promo = item.promotion;
    if (!promo.linkToken || !promotionInWindow(promo, now)) continue;
    // 링크 토큰을 컨텍스트로 주면 링크 매칭 우선순위로 이 프로모션이 선택된다
    // (단일 랜딩 getPromoLandingProduct 와 같은 계산).
    items.push({
      token: promo.linkToken,
      promotionName: promo.name,
      endsAt: promo.endsAt.toISOString(),
      product: toCreditTopUpProductView(promo.product, {
        ctx: { linkTokens: [promo.linkToken] },
        now,
      }),
    });
  }

  return {
    id: bundle.id,
    slug: bundle.slug,
    name: bundle.name,
    description: bundle.description,
    items,
  };
}
