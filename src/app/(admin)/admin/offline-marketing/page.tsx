import {
  getOfflineMarketingCampaigns,
  getOfflineMarketingCategories,
} from "@/actions/admin-offline-marketing";
import { OfflineMarketingClient } from "@/components/admin/offline-marketing/offline-marketing-client";

export const dynamic = "force-dynamic";

export default async function AdminOfflineMarketingPage() {
  const [campaigns, categories] = await Promise.all([
    getOfflineMarketingCampaigns(),
    getOfflineMarketingCategories(),
  ]);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold text-gray-900">오프라인 홍보</h1>
        <p className="mt-1 text-[13px] text-gray-400">
          전단지·세미나 자료·학습지 샘플·캠페인 이미지 등을 폴더별로 관리합니다. PDF는
          바로 인쇄하고, 이미지는 미리보거나 내려받아 홍보에 활용할 수 있습니다.
        </p>
      </div>
      <OfflineMarketingClient initial={campaigns} initialCategories={categories} />
    </div>
  );
}
