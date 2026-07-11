import Link from "next/link";
import type { LandingBannerConfig } from "@/lib/platform-settings";
import { LandingBannerStripInner } from "./landing-banner-strip-view";

/**
 * 랜딩 최상단 고정 배너 스트립 — 관리자 "배너 관리 → 랜딩 헤더 배너"에서 설정.
 * 랜딩 진입 즉시 맨 위에 노출된다(주로 단체 세미나 모집 안내 → /seminar).
 */
export function LandingBannerStrip({ banner }: { banner: LandingBannerConfig }) {
  return (
    <Link
      href={banner.href}
      data-landing-banner
      // h-[44px]: 헤더 top-11 / main pt-11(=44px)과 정확히 맞춘다. h-11 을 쓰면
      // 모바일 compact 컨트롤 remap(a.h-11→38px)에 걸려 6px 빈 틈이 생긴다.
      className="fixed inset-x-0 top-0 z-[60] flex h-[44px] items-center justify-center gap-2 bg-slate-950 px-4 text-white transition-colors hover:bg-blue-600"
    >
      <LandingBannerStripInner banner={banner} />
    </Link>
  );
}
