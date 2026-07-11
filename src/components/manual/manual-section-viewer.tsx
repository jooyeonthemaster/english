"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ListTree } from "lucide-react";
import { ManualFullscreenButton } from "@/components/manual/manual-fullscreen-button";
import type { ManualGroup, ManualSlideEntry } from "@/lib/manual/static-manual";

interface ManualSectionViewerProps {
  assetBase: string;
  entries: ManualSlideEntry[];
  groups: ManualGroup[];
  group: ManualGroup;
  slides: ManualSlideEntry[];
  initialIndex: number;
}

function clampIndex(index: number, length: number) {
  return Math.min(Math.max(index, 0), Math.max(length - 1, 0));
}

function sectionHref(slug: string) {
  return `/director/help/manual/${slug}`;
}

export function ManualSectionViewer({
  assetBase,
  entries,
  groups,
  group,
  slides,
  initialIndex,
}: ManualSectionViewerProps) {
  const router = useRouter();
  // window.setTimeout 은 number 를 반환한다 — ReturnType<typeof window.setTimeout> 은
  // @types/node 오버로드에 걸려 NodeJS.Timeout 으로 풀려 빌드가 깨진다.
  const overlayTimeoutRef = useRef<number | null>(null);
  const [activeGroupSlug, setActiveGroupSlug] = useState(group.slug);
  const [index, setIndex] = useState(() => clampIndex(initialIndex, slides.length));
  const currentGroup = groups.find((item) => item.slug === activeGroupSlug) ?? group;
  const currentSlides = useMemo(
    () => entries.slice(currentGroup.start, currentGroup.start + currentGroup.count),
    [currentGroup.count, currentGroup.start, entries],
  );
  const [sectionToast, setSectionToast] = useState<{ id: number; title: string; eyebrow: string } | null>(null);
  const current = currentSlides[index] ?? currentSlides[0];
  const currentSrc = current ? `${assetBase}/${current.file}` : "";
  const groupIndex = groups.findIndex((item) => item.slug === currentGroup.slug);
  const prevGroup = groupIndex > 0 ? groups[groupIndex - 1] : null;
  const nextGroup = groupIndex >= 0 && groupIndex < groups.length - 1 ? groups[groupIndex + 1] : null;
  const hasPrev = index > 0 || Boolean(prevGroup);
  const hasNext = index < currentSlides.length - 1 || Boolean(nextGroup);

  const progress = useMemo(() => {
    if (currentSlides.length <= 0) return 0;
    return Math.round(((index + 1) / currentSlides.length) * 100);
  }, [currentSlides.length, index]);

  const showSectionToast = useCallback((targetGroup: ManualGroup) => {
    if (overlayTimeoutRef.current) {
      window.clearTimeout(overlayTimeoutRef.current);
    }
    setSectionToast({
      id: Date.now(),
      title: targetGroup.name,
      eyebrow: targetGroup.no !== "0" ? targetGroup.no : "START",
    });
    overlayTimeoutRef.current = window.setTimeout(() => setSectionToast(null), 1000);
  }, []);

  const goToGroup = useCallback(
    (targetGroup: ManualGroup, targetIndex: number) => {
      const nextIndex = clampIndex(targetIndex, targetGroup.count);
      const isManualViewerFullscreen = document.fullscreenElement?.matches("[data-manual-viewer]");

      if (isManualViewerFullscreen) {
        setActiveGroupSlug(targetGroup.slug);
        setIndex(nextIndex);
        showSectionToast(targetGroup);
        return;
      }

      router.push(`${sectionHref(targetGroup.slug)}?slide=${nextIndex + 1}`);
    },
    [router, showSectionToast],
  );

  const goPrev = useCallback(() => {
    if (index > 0) {
      setIndex((value) => clampIndex(value - 1, currentSlides.length));
      return;
    }
    if (prevGroup) {
      goToGroup(prevGroup, prevGroup.count - 1);
    }
  }, [currentSlides.length, goToGroup, index, prevGroup]);

  const goNext = useCallback(() => {
    if (index < currentSlides.length - 1) {
      setIndex((value) => clampIndex(value + 1, currentSlides.length));
      return;
    }
    if (nextGroup) {
      goToGroup(nextGroup, 0);
    }
  }, [currentSlides.length, goToGroup, index, nextGroup]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (event.key === "ArrowRight" || event.key === " ") {
        event.preventDefault();
        goNext();
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPrev();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goNext, goPrev]);

  useEffect(() => {
    return () => {
      if (overlayTimeoutRef.current) {
        window.clearTimeout(overlayTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    function onFullscreenChange() {
      const isManualViewerFullscreen = document.fullscreenElement?.matches("[data-manual-viewer]");
      if (!isManualViewerFullscreen && activeGroupSlug !== group.slug) {
        router.replace(`${sectionHref(activeGroupSlug)}?slide=${index + 1}`);
      }
    }

    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, [activeGroupSlug, group.slug, index, router]);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("slide", String(index + 1));
    window.history.replaceState(null, "", url.toString());
  }, [index]);

  if (!current) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-10 text-center text-sm font-semibold text-slate-500">
        이 섹션에 등록된 슬라이드가 없습니다.
      </div>
    );
  }

  return (
    <div
      data-manual-viewer
      className="relative grid min-h-[calc(100vh-120px)] gap-3 lg:grid-cols-[180px_minmax(0,1fr)] xl:grid-cols-[200px_minmax(0,1fr)]"
    >
      {sectionToast ? (
        <div
          key={sectionToast.id}
          data-manual-section-toast
          className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center"
        >
          <div className="rounded-2xl border border-white/70 bg-slate-950/86 px-12 py-8 text-center text-white shadow-[0_28px_90px_rgba(15,23,42,0.5)] backdrop-blur-md">
            <div className="text-[36px] font-black leading-none text-blue-200">{sectionToast.eyebrow}</div>
            <div className="mt-2 text-[48px] font-black tracking-tight">{sectionToast.title}</div>
          </div>
        </div>
      ) : null}
      <aside className="hidden min-h-0 rounded-lg border border-slate-200 bg-white lg:block">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          <ListTree className="size-4 text-blue-600" />
          <span className="text-[13px] font-bold text-slate-900">목차</span>
        </div>
        <nav className="max-h-[calc(100vh-190px)] overflow-y-auto p-2">
          {groups.map((item) => {
            const active = item.slug === currentGroup.slug;
            return (
              <Link
                key={item.slug}
                href={sectionHref(item.slug)}
                className={`flex items-center justify-between gap-2 rounded-md px-3 py-2 text-[12px] font-semibold transition ${
                  active
                    ? "bg-blue-50 text-blue-700"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <span className="min-w-0 truncate">
                  {item.no !== "0" ? `${item.no} ` : ""}
                  {item.name}
                </span>
                <span className="shrink-0 text-[11px] text-slate-400">{item.count}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      <main data-manual-viewer-main className="min-w-0 space-y-4">
        <div data-manual-slide-card className="rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-2">
            <span className="shrink-0 text-[12px] font-black text-slate-700">
              {index + 1} / {currentSlides.length}
            </span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-blue-600" style={{ width: `${progress}%` }} />
            </div>
          </div>

          <div data-manual-slide-stage className="relative bg-slate-100 p-1.5 sm:p-2 lg:p-3">
            <div className="absolute right-4 top-4 z-20">
              <ManualFullscreenButton />
            </div>
            <button
              type="button"
              onClick={goPrev}
              disabled={!hasPrev}
              aria-label="이전 슬라이드"
              className="absolute left-4 top-1/2 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="size-5" />
            </button>
            <div
              data-manual-slide-frame
              className="mx-auto flex w-full max-w-[1600px] items-center justify-center overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={currentSrc} alt={current.title} className="block aspect-video w-full object-contain" />
            </div>
            <button
              type="button"
              onClick={goNext}
              disabled={!hasNext}
              aria-label="다음 슬라이드"
              className="absolute right-4 top-1/2 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight className="size-5" />
            </button>
          </div>
        </div>

      </main>
    </div>
  );
}
