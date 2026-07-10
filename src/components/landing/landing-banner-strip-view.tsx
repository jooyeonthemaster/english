import { ArrowRight, Megaphone } from "lucide-react";
import type { LandingBannerConfig } from "@/lib/platform-settings";

/** 헤더 배너 스트립의 내부 내용(메가폰 + 문구 + CTA 알약). 실제 스트립과 미리보기가 공유. */
export function LandingBannerStripInner({
  banner,
  placeholder = false,
}: {
  banner: Pick<LandingBannerConfig, "text" | "ctaLabel">;
  /** 미리보기에서 문구가 비었을 때 안내 텍스트를 보여준다. */
  placeholder?: boolean;
}) {
  return (
    <>
      <Megaphone className="size-4 shrink-0 text-blue-300" />
      <span className="truncate text-[13px] font-semibold sm:text-sm">
        {banner.text?.trim() || (placeholder ? "배너 문구를 입력하세요" : "")}
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/15 px-2.5 py-0.5 text-[12px] font-bold">
        {banner.ctaLabel?.trim() || "신청하기"}
        <ArrowRight className="size-3.5" />
      </span>
    </>
  );
}

/** 관리자 미리보기용 정지 스트립 바(고정/링크 없이 h-11 바 형태). */
export function LandingBannerStripPreview({
  banner,
}: {
  banner: Pick<LandingBannerConfig, "text" | "ctaLabel">;
}) {
  return (
    <div className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-white">
      <LandingBannerStripInner banner={banner} placeholder />
    </div>
  );
}
