/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, BookOpen, Download, ExternalLink, Layers3, Wrench } from "lucide-react";
import { getStaffSession } from "@/lib/auth";
import { ManualQuickAccessToggle } from "@/components/manual/manual-quick-access-toggle";
import {
  getManualSectionHref,
  getManualSlideAssetPath,
  getStaticManualManifest,
  STATIC_MANUAL_PUBLIC_BASE,
} from "@/lib/manual/static-manual";
import { getManualPdf, getManualSectionVisibility } from "@/lib/platform-settings";

export const metadata: Metadata = {
  title: "사용 매뉴얼",
};

export const dynamic = "force-dynamic";

export default async function ManualPage() {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const manifest = getStaticManualManifest();
  if (manifest) {
    const visibility = await getManualSectionVisibility();
    const visibleGroups = manifest.groups.filter((group) => visibility[group.slug] !== false);
    const visibleSlideCount = visibleGroups.reduce((sum, group) => sum + group.count, 0);
    const hasHiddenGroups = visibleGroups.length < manifest.groups.length;

    return (
      <div className="space-y-5">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[12px] font-bold text-blue-700">
                  <BookOpen className="size-3.5" />
                  SMOAT 사용 매뉴얼
                </div>
                <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-500 px-2 py-1 text-[11px] font-black leading-none tracking-wide text-white">
                  BETA
                </span>
              </div>
              <h1 className="mt-3 text-[28px] font-black tracking-tight text-slate-950 sm:text-[34px]">
                필요한 기능만 목차별로 빠르게 확인하세요
              </h1>
              <p className="mt-2 max-w-3xl text-[14px] font-medium leading-6 text-slate-500">
                공개된 {visibleSlideCount}장 매뉴얼을 한 번에 넘기는 대신, 문제 생성부터
                설정까지 섹션별로 나눠 볼 수 있게 준비했습니다.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <ManualQuickAccessToggle />
              {!hasHiddenGroups ? (
                <a
                  href={`${STATIC_MANUAL_PUBLIC_BASE}/review.html`}
                  target="_blank"
                  rel="noreferrer"
                  role="button"
                  className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-[13px] font-bold text-white shadow-sm transition hover:bg-blue-700"
                >
                  <ExternalLink className="size-4" />
                  전체 보기
                </a>
              ) : null}
            </div>
          </div>
        </section>

        {visibleGroups.length > 0 ? (
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleGroups.map((group) => {
              const firstSlide = manifest.entries[group.start];
              const previewSrc = firstSlide ? getManualSlideAssetPath(firstSlide.file) : "";
              const firstSlideNumber = group.start + 1;
              const lastSlideNumber = group.start + group.count;
              const rawTitle = firstSlide?.title ?? "섹션 슬라이드";
              const sectionLabel = rawTitle.split("—").pop()?.trim() || rawTitle;

              return (
                <Link
                  key={group.slug}
                  href={getManualSectionHref(group.slug)}
                  className="group overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
                >
                  <div className="relative overflow-hidden bg-slate-100">
                    {previewSrc ? (
                      <img
                        src={previewSrc}
                        alt=""
                        loading="lazy"
                        className="h-28 w-full object-cover object-top [mask-image:linear-gradient(to_bottom,black_58%,transparent)] [-webkit-mask-image:linear-gradient(to_bottom,black_58%,transparent)]"
                      />
                    ) : (
                      <div className="flex h-28 items-center justify-center">
                        <Layers3 className="size-8 text-slate-300" />
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        {group.no !== "0" ? (
                          <span className="shrink-0 text-[26px] font-black leading-none text-blue-600">
                            {group.no}
                          </span>
                        ) : (
                          <span className="inline-flex shrink-0 items-center rounded-md bg-blue-50 px-2 py-1 text-[12px] font-black text-blue-600">
                            START
                          </span>
                        )}
                        <h2 className="min-w-0 truncate text-[17px] font-black text-slate-950">
                          {group.name}
                        </h2>
                      </div>
                      <span className="inline-flex h-8 shrink-0 items-center rounded-full bg-slate-100 px-3 text-[12px] font-black text-slate-600">
                        {group.count}장
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 min-h-[38px] text-[13px] font-medium leading-5 text-slate-500">
                      {sectionLabel}부터 필요한 화면 흐름만 이어서 확인합니다.
                    </p>
                    <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                      <span className="text-[12px] font-bold text-slate-400">
                        {firstSlideNumber} - {lastSlideNumber}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[12px] font-black text-blue-600">
                        보기
                        <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" />
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </section>
        ) : (
          <section className="rounded-lg border border-dashed border-slate-200 bg-white px-6 py-14 text-center shadow-sm">
            <BookOpen className="mx-auto size-8 text-slate-300" />
            <p className="mt-3 text-[15px] font-bold text-slate-700">
              현재 공개된 매뉴얼 항목이 없습니다
            </p>
            <p className="mt-1 text-[13px] font-medium text-slate-400">
              관리자 페이지에서 목차별 노출 설정을 확인해 주세요.
            </p>
          </section>
        )}
      </div>
    );
  }

  const manual = await getManualPdf();
  if (!manual) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <BookOpen className="size-5" strokeWidth={1.9} />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">사용 매뉴얼</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">스모트의 모든 기능을 안내합니다</p>
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-6 py-14 text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm">
            <Wrench className="size-6" strokeWidth={1.7} />
          </span>
          <p className="mt-4 text-base font-semibold text-slate-700">사용 매뉴얼을 준비하고 있어요</p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            더 정확하고 친절한 안내서를 만들고 있습니다. 곧 이 화면에서 열람하실 수 있어요.
          </p>
        </div>
      </div>
    );
  }

  const manualUrl = manual.url;
  const updatedLabel = new Date(manual.updatedAt).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="space-y-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <BookOpen className="size-5" strokeWidth={1.9} />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">사용 매뉴얼</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              PDF 매뉴얼 · 최근 업데이트 {updatedLabel}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ManualQuickAccessToggle />
          <a
            href={manualUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-blue-200 hover:text-blue-600"
          >
            <ExternalLink className="size-4" />
            새 탭으로 열기
          </a>
          <a
            href={manualUrl}
            download="스모트-사용매뉴얼.pdf"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            <Download className="size-4" />
            다운로드
          </a>
        </div>
      </div>

      <div className="hidden lg:block">
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
          <iframe
            src={`${manualUrl}#view=FitH`}
            title="스모트 사용 매뉴얼 미리보기"
            className="h-[78vh] w-full"
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          미리보기가 보이지 않으면 위의 <span className="font-medium">새 탭으로 열기</span> 또는{" "}
          <span className="font-medium">다운로드</span>를 이용하세요.
        </p>
      </div>

      <div className="lg:hidden">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-blue-50 text-blue-600">
            <BookOpen className="size-6" strokeWidth={1.8} />
          </span>
          <p className="mt-3 text-sm font-medium text-slate-700">
            모바일에서는 새 탭 열기 또는 다운로드로 보시는 것을 권장합니다
          </p>
          <p className="mt-1 text-xs text-muted-foreground">PDF 문서라 큰 화면에서 보시면 더 편합니다.</p>
        </div>
      </div>
    </div>
  );
}
