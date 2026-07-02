import { getBanners } from "@/actions/admin-banners";
import { BannersAdminClient } from "@/components/admin/banners/banners-admin-client";

export const dynamic = "force-dynamic";

export default async function AdminBannersPage() {
  const banners = await getBanners();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold text-gray-900">배너 관리</h1>
        <p className="text-[13px] text-gray-400 mt-1">
          로그인 사용자에게 뜨는 진입 배너를 만들고 우선순위·노출 기간을 관리합니다. 위쪽
          배너부터 먼저 노출되고, 하나를 닫으면 다음 배너가 열립니다.
        </p>
      </div>
      <BannersAdminClient initialBanners={banners} />
    </div>
  );
}
