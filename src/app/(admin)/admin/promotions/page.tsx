import { requireAdminAuth } from "@/lib/auth-admin";
import { getAdminCreditProductsWithPromotions } from "@/lib/credit-top-up-products";
import { listAcademiesForPromoPicker } from "@/actions/admin/credit-products";
import { getBundles } from "@/actions/admin/credit-promotion-bundles";
import { getPromotionMonitoring } from "@/actions/admin/credit-promotion-monitoring";
import { PromotionsAdminClient } from "@/components/admin/promotions-admin-client";

export const dynamic = "force-dynamic";

export default async function AdminPromotionsPage() {
  await requireAdminAuth();

  const [products, academies, bundles, monitoring] = await Promise.all([
    getAdminCreditProductsWithPromotions(),
    listAcademiesForPromoPicker(),
    getBundles(),
    getPromotionMonitoring(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold text-gray-900">프로모션 관리</h1>
        <p className="mt-1 text-[13px] text-gray-400">
          충전 상품에 걸리는 프로모션(할인·크레딧 보너스·링크)과 여러 프로모션을
          한 링크로 묶는 번들을 관리합니다. 변경은 고객 결제 화면에 즉시
          반영됩니다.
        </p>
      </div>

      <PromotionsAdminClient
        initialProducts={products}
        academies={academies}
        initialBundles={bundles}
        initialMonitoring={monitoring}
      />
    </div>
  );
}
