import { getBanners } from "@/actions/admin-banners";
import { getLandingBannersSetting, getLandingPopupsSetting } from "@/actions/admin-settings";
import { PageHeader } from "@/components/admin/kit";
import { BannersAdminClient } from "@/components/admin/banners/banners-admin-client";
import { BannersTabs, type BannersTabKey } from "@/components/admin/banners/banners-tabs";
import { LandingBannersAdminClient } from "@/components/admin/banners/landing-banners-admin-client";
import { LandingPopupsAdminClient } from "@/components/admin/banners/landing-popups-admin-client";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ tab?: string; prefill?: string }>;
};

export default async function AdminBannersPage({ searchParams }: PageProps) {
  const { tab, prefill } = await searchParams;
  // 공지 → "배너로 띄우기"(?prefill=announcement)로 들어오면 앱 탭이 열려야 편집기가 보인다.
  const initialTab: BannersTabKey = prefill === "announcement" || tab === "app" ? "app" : "landing";

  const [banners, landingBanners, landingPopups] = await Promise.all([
    getBanners(),
    getLandingBannersSetting(),
    getLandingPopupsSetting(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="배너 관리"
        description="랜딩페이지 공개 배너와 앱(로그인 사용자) 진입 배너를 탭으로 나눠 관리합니다."
      />
      <BannersTabs
        initialTab={initialTab}
        landing={
          <>
            <LandingBannersAdminClient initial={landingBanners} />
            <LandingPopupsAdminClient initial={landingPopups} />
          </>
        }
        app={<BannersAdminClient initialBanners={banners} />}
      />
    </div>
  );
}
