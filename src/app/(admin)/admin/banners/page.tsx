import { getBanners } from "@/actions/admin-banners";
import { getLandingBannersSetting, getLandingPopupsSetting } from "@/actions/admin-settings";
import { BannersAdminClient } from "@/components/admin/banners/banners-admin-client";
import { BannersTabs } from "@/components/admin/banners/banners-tabs";
import { LandingBannersAdminClient } from "@/components/admin/banners/landing-banners-admin-client";
import { LandingPopupsAdminClient } from "@/components/admin/banners/landing-popups-admin-client";

export const dynamic = "force-dynamic";

export default async function AdminBannersPage() {
  const [banners, landingBanners, landingPopups] = await Promise.all([
    getBanners(),
    getLandingBannersSetting(),
    getLandingPopupsSetting(),
  ]);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold text-gray-900">배너 관리</h1>
        <p className="text-[13px] text-gray-400 mt-1">
          랜딩페이지 공개 배너와, 앱(로그인 사용자) 진입 배너를 탭으로 나눠 관리합니다.
        </p>
      </div>

      <BannersTabs
        landing={
          <>
            {/* 랜딩 최상단 헤더 배너 (여러 개 · 우선순위) */}
            <div>
              <h2 className="text-[15px] font-bold text-gray-900">랜딩 헤더 배너</h2>
              <p className="mb-3 mt-0.5 text-[13px] text-gray-400">
                홈(/) 최상단 스트립 배너. 여러 개를 우선순위로 등록하면 맨 위 활성 배너
                하나가 노출됩니다.
              </p>
              <LandingBannersAdminClient initial={landingBanners} />
            </div>
            {/* 랜딩 진입 팝업 배너 (여러 개 · 우선순위) */}
            <div>
              <h2 className="text-[15px] font-bold text-gray-900">랜딩 팝업 배너</h2>
              <p className="mb-3 mt-0.5 text-[13px] text-gray-400">
                홈(/) 진입 시 뜨는 팝업. 여러 개를 우선순위로 등록하면 위에서부터 순서대로
                노출됩니다.
              </p>
              <LandingPopupsAdminClient initial={landingPopups} />
            </div>
          </>
        }
        app={
          <div>
            <h2 className="text-[15px] font-bold text-gray-900">앱 진입 배너</h2>
            <p className="mb-3 mt-0.5 text-[13px] text-gray-400">
              로그인 사용자에게 뜨는 진입 배너. 위쪽 배너부터 먼저 노출되고, 하나를 닫으면
              다음 배너가 열립니다.
            </p>
            <BannersAdminClient initialBanners={banners} />
          </div>
        }
      />
    </div>
  );
}
