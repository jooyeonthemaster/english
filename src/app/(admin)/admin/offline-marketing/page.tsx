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
  // 제목·액션(홍보 등록)은 클라이언트가 PageHeader 로 그린다.
  return <OfflineMarketingClient initial={campaigns} initialCategories={categories} />;
}
