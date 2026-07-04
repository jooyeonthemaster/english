import { requireAdminAuth } from "@/lib/auth-admin";
import { getAdminCreditProductsWithPromotions } from "@/lib/credit-top-up-products";
import { CreditTopUpsAdminClient } from "@/components/admin/credit-topups-admin-client";

export const dynamic = "force-dynamic";

export default async function AdminProductsPage() {
  await requireAdminAuth();

  const products = await getAdminCreditProductsWithPromotions();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold text-gray-900">상품 관리</h1>
        <p className="mt-1 text-[13px] text-gray-400">
          충전 상품을 설정합니다. 정가·크레딧 지급은 고객 결제 화면과 상품
          정보에 즉시 반영되며, 프로모션은 프로모션 관리에서 편집합니다.
        </p>
      </div>

      <CreditTopUpsAdminClient mode="products" initialProducts={products} hideTitle />
    </div>
  );
}
