import { requireAdminAuth } from "@/lib/auth-admin";
import { getAdminCreditProductsWithPromotions } from "@/lib/credit-top-up-products";
import { listAcademiesForPromoPicker } from "@/actions/admin/credit-products";
import { getBundles } from "@/actions/admin/credit-promotion-bundles";
import { getPromotionMonitoring } from "@/actions/admin/credit-promotion-monitoring";
import { PromotionsAdminClient } from "@/components/admin/promotions-admin-client";
import {
  DEFAULT_PROMOTION_TAB,
  PROMOTION_TAB_KEYS,
  type PromotionTabKey,
} from "@/components/admin/promotions-admin-client-parts/tabs";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ tab?: string }>;
};

export default async function AdminPromotionsPage({ searchParams }: PageProps) {
  await requireAdminAuth();

  const [products, academies, bundles, monitoring, { tab }] = await Promise.all([
    getAdminCreditProductsWithPromotions(),
    listAcademiesForPromoPicker(),
    getBundles(),
    getPromotionMonitoring(),
    searchParams,
  ]);

  // kit 의 resolveTab 은 "use client" 모듈이라 서버에서 호출할 수 없어 같은 규칙을 여기서 적용한다.
  const initialTab: PromotionTabKey =
    tab && (PROMOTION_TAB_KEYS as readonly string[]).includes(tab)
      ? (tab as PromotionTabKey)
      : DEFAULT_PROMOTION_TAB;

  return (
    <PromotionsAdminClient
      initialProducts={products}
      academies={academies}
      initialBundles={bundles}
      initialMonitoring={monitoring}
      initialTab={initialTab}
    />
  );
}
