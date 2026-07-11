"use client";

import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ManualGroup, ManualSlideEntry } from "@/lib/manual/static-manual";
import { ManualQuestionBookIcon } from "./manual-question-book-icon";
import {
  MANUAL_QUICK_ACCESS_EVENT,
  getManualQuickAccessServerSnapshot,
  readManualQuickAccessEnabled,
  subscribeManualQuickAccess,
} from "./manual-quick-access-preferences";

interface ManualQuickAccessHostProps {
  assetBase: string;
  entries: ManualSlideEntry[];
  groups: ManualGroup[];
}

function clampIndex(index: number, length: number) {
  return Math.min(Math.max(index, 0), Math.max(length - 1, 0));
}

function findGroup(groups: ManualGroup[], slug: string) {
  return groups.find((group) => group.slug === slug);
}

function resolveGroupForPathname(pathname: string, groups: ManualGroup[]) {
  if (pathname === "/director/help/manual") {
    return groups[0];
  }

  const manualMatch = pathname.match(/^\/director\/help\/manual\/([^/]+)/);
  if (manualMatch) {
    const group = findGroup(groups, manualMatch[1]);
    if (group) return group;
  }

  if (
    pathname.startsWith("/director/workbench/questions") ||
    pathname.startsWith("/director/workbench/generate") ||
    pathname.startsWith("/director/questions") ||
    pathname.startsWith("/director/learning-questions")
  ) {
    return findGroup(groups, "01-question-gen");
  }
  if (pathname.startsWith("/director/workbench/exam-report")) {
    return findGroup(groups, "06-exam-report");
  }
  if (pathname.startsWith("/director/workbench/webtoon")) {
    return findGroup(groups, "05-webtoon");
  }
  if (pathname.includes("worksheet") || pathname.includes("study-note")) {
    return findGroup(groups, "03-worksheet-gen");
  }
  if (
    pathname.startsWith("/director/workbench/exams") ||
    pathname.startsWith("/director/workbench/similar-exams") ||
    pathname.startsWith("/director/exams")
  ) {
    return findGroup(groups, "02-exam-gen");
  }
  if (
    pathname.startsWith("/director/workbench/passages/import") ||
    pathname.startsWith("/director/workbench/extraction") ||
    pathname.startsWith("/director/korean/extraction")
  ) {
    return findGroup(groups, "04-extraction");
  }
  if (pathname.startsWith("/director/credits") || pathname.includes("/credits")) {
    return findGroup(groups, "07-credits");
  }
  if (pathname.includes("/rewards")) {
    return findGroup(groups, "08-rewards");
  }
  if (pathname.includes("/settings")) {
    return findGroup(groups, "11-settings");
  }
  if (pathname.includes("/help")) {
    return findGroup(groups, "10-helpcenter");
  }

  return groups[0];
}

export function ManualQuickAccessHost({ assetBase, entries, groups }: ManualQuickAccessHostProps) {
  const pathname = usePathname();
  const enabled = useSyncExternalStore(
    subscribeManualQuickAccess,
    readManualQuickAccessEnabled,
    getManualQuickAccessServerSnapshot,
  );
  const [open, setOpen] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [activeGroupSlug, setActiveGroupSlug] = useState(groups[0]?.slug ?? "");
  const [slideIndex, setSlideIndex] = useState(0);
  const activeTocItemRef = useRef<HTMLButtonElement | null>(null);
  // window.setTimeout 은 number 를 반환한다 — ReturnType<typeof window.setTimeout> 은
  // @types/node 오버로드에 걸려 NodeJS.Timeout 으로 풀려 빌드가 깨진다.
  const overlayTimeoutRef = useRef<number | null>(null);
  const [sectionToast, setSectionToast] = useState<{ id: number; title: string; eyebrow: string } | null>(null);

  const activeGroup = groups.find((group) => group.slug === activeGroupSlug) ?? groups[0];
  const activeSlides = useMemo(() => {
    if (!activeGroup) return [];
    return entries.slice(activeGroup.start, activeGroup.start + activeGroup.count);
  }, [activeGroup, entries]);
  const currentSlide = activeSlides[slideIndex] ?? activeSlides[0];
  const currentSrc = currentSlide ? `${assetBase}/${currentSlide.file}` : "";
  const currentPageGroup = useMemo(() => resolveGroupForPathname(pathname, groups), [groups, pathname]);
  const activeGroupIndex = activeGroup ? groups.findIndex((group) => group.slug === activeGroup.slug) : -1;
  const prevGroup = activeGroupIndex > 0 ? groups[activeGroupIndex - 1] : null;
  const nextGroup = activeGroupIndex >= 0 && activeGroupIndex < groups.length - 1 ? groups[activeGroupIndex + 1] : null;
  const hasPrevSlide = slideIndex > 0 || Boolean(prevGroup);
  const hasNextSlide = slideIndex < activeSlides.length - 1 || Boolean(nextGroup);

  useEffect(() => {
    function handleQuickAccessPreferenceChange(event: Event) {
      const detail = (event as CustomEvent<{ enabled?: boolean }>).detail;
      if (detail?.enabled === false) {
        setOpen(false);
        setViewerOpen(false);
        return;
      }
      if (detail?.enabled === true) {
        const group = currentPageGroup ?? groups[0];
        if (group) {
          setActiveGroupSlug(group.slug);
          setSlideIndex(0);
        }
        setOpen(true);
        setViewerOpen(true);
      }
    }

    window.addEventListener(MANUAL_QUICK_ACCESS_EVENT, handleQuickAccessPreferenceChange);
    return () => window.removeEventListener(MANUAL_QUICK_ACCESS_EVENT, handleQuickAccessPreferenceChange);
  }, [currentPageGroup, groups]);

  useEffect(() => {
    return () => {
      if (overlayTimeoutRef.current) {
        window.clearTimeout(overlayTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    activeTocItemRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeGroupSlug, open]);

  if (!enabled || groups.length <= 0) return null;

  function openGroup(group: ManualGroup) {
    setActiveGroupSlug(group.slug);
    setSlideIndex(0);
    setOpen(true);
    setViewerOpen(true);
  }

  function showSectionToast(group: ManualGroup) {
    if (overlayTimeoutRef.current) {
      window.clearTimeout(overlayTimeoutRef.current);
    }
    setSectionToast({
      id: Date.now(),
      title: group.name,
      eyebrow: group.no !== "0" ? group.no : "START",
    });
    overlayTimeoutRef.current = window.setTimeout(() => setSectionToast(null), 1000);
  }

  function goToGroup(group: ManualGroup, nextSlideIndex: number) {
    setActiveGroupSlug(group.slug);
    setSlideIndex(clampIndex(nextSlideIndex, group.count));
    setOpen(true);
    setViewerOpen(true);
    showSectionToast(group);
  }

  function goPrevSlide() {
    if (slideIndex > 0) {
      setSlideIndex((value) => clampIndex(value - 1, activeSlides.length));
      return;
    }
    if (prevGroup) {
      goToGroup(prevGroup, prevGroup.count - 1);
    }
  }

  function goNextSlide() {
    if (slideIndex < activeSlides.length - 1) {
      setSlideIndex((value) => clampIndex(value + 1, activeSlides.length));
      return;
    }
    if (nextGroup) {
      goToGroup(nextGroup, 0);
    }
  }

  function openCurrentPageManual() {
    const group = currentPageGroup ?? groups[0];
    if (group) {
      setActiveGroupSlug(group.slug);
    }
    setSlideIndex(0);
    setOpen(true);
    setViewerOpen(true);
  }

  function closeAll() {
    setOpen(false);
    setViewerOpen(false);
  }

  const anyOpen = open || viewerOpen;
  const tooltip = anyOpen ? "매뉴얼 닫기" : "매뉴얼 열기";

  return (
    <>
      <div className="pointer-events-none fixed right-0 top-14 z-40 hidden h-14 select-none items-center pr-3 lg:flex">
        <button
          type="button"
          onClick={() => {
            if (anyOpen) {
              closeAll();
              return;
            }
            openCurrentPageManual();
          }}
          aria-pressed={anyOpen}
          aria-label={tooltip}
          title={tooltip}
          className={
            "pointer-events-auto flex size-10 items-center justify-center rounded-xl border shadow-sm active:scale-[0.98] motion-safe:transition-colors motion-safe:duration-150 " +
            (anyOpen
              ? "border-blue-500 bg-blue-600 text-white"
              : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:text-blue-700")
          }
        >
          <ManualQuestionBookIcon className="size-5" />
        </button>
      </div>

      <div className="pointer-events-none fixed right-3 top-28 z-40 hidden select-none justify-end lg:flex">
        <div
          className={
            "w-[min(400px,calc(100vw-40px))] motion-safe:transition-[opacity,transform] motion-safe:duration-150 " +
            (open ? "pointer-events-auto opacity-100" : "pointer-events-none -translate-y-1 opacity-0")
          }
          aria-hidden={!open}
        >
          <div
            className={`relative flex h-[min(520px,calc(100vh-180px))] flex-col overflow-hidden bg-white shadow-2xl ring-1 ring-slate-200/80 ${
              viewerOpen ? "rounded-l-none rounded-r-xl" : "rounded-xl"
            }`}
          >
            <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 pr-12">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <ManualQuestionBookIcon className="size-4" />
              </span>
              <div className="min-w-0">
                <div className="text-[13px] font-black text-slate-950">사용 매뉴얼</div>
                <div className="text-[11px] font-semibold text-slate-400">현재 화면 위에서 바로 보기</div>
              </div>
            </div>
            <button
              type="button"
              onClick={closeAll}
              tabIndex={open ? 0 : -1}
              className="absolute right-3 top-3 z-10 inline-flex size-8 cursor-pointer items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 shadow-sm hover:bg-slate-50 hover:text-slate-900"
              aria-label="매뉴얼 닫기"
            >
              <X className="size-4" aria-hidden="true" />
            </button>

            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              <button
                type="button"
                onClick={() => {
                  if (currentPageGroup) openGroup(currentPageGroup);
                }}
                className="mb-1 flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left text-[13px] font-bold text-blue-700 transition hover:bg-blue-50"
              >
                현재 화면 관련 목차 보기
                <ChevronRight className="size-4" aria-hidden="true" />
              </button>
              {groups.map((group) => {
                const active = activeGroupSlug === group.slug;
                return (
                  <button
                    key={group.slug}
                    ref={active ? activeTocItemRef : undefined}
                    type="button"
                    onClick={() => openGroup(group)}
                    className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2.5 text-left transition ${
                      active ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="mr-2 text-[12px] font-black text-blue-600">
                        {group.no !== "0" ? group.no : "START"}
                      </span>
                      <span className="text-[13px] font-bold">{group.name}</span>
                    </span>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-500">
                      {group.count}장
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="pointer-events-none fixed right-[412px] top-28 z-40 hidden select-none justify-end lg:flex">
        <div
          className={
            "w-[min(760px,calc(100vw-464px))] motion-safe:transition-[opacity,transform] motion-safe:duration-300 motion-safe:ease-out " +
            (viewerOpen ? "pointer-events-auto translate-x-0 opacity-100" : "pointer-events-none translate-x-[calc(100%+1rem)] opacity-0")
          }
          aria-hidden={!viewerOpen}
        >
          <div className="relative h-[min(520px,calc(100vh-180px))] min-h-0 overflow-hidden rounded-l-xl rounded-r-none bg-white shadow-2xl ring-1 ring-slate-200/80">
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
            <section className="flex h-full min-h-0 min-w-0 flex-col">
              <header className="flex min-h-[48px] items-center justify-between gap-3 border-b border-slate-100 px-4 py-2 pr-14">
                <div className="min-w-0">
                  <div className="text-[11px] font-black text-blue-600">
                    {activeGroup?.no !== "0" ? activeGroup?.no : "START"}
                  </div>
                  <h2 className="truncate text-[15px] font-black text-slate-950">{activeGroup?.name}</h2>
                </div>
                <div className="shrink-0 text-[12px] font-black text-slate-500">
                  {slideIndex + 1} / {activeSlides.length}
                </div>
              </header>

              <button
                type="button"
                onClick={() => setViewerOpen(false)}
                tabIndex={viewerOpen ? 0 : -1}
                className="absolute right-3 top-3 z-10 inline-flex size-8 cursor-pointer items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 shadow-sm hover:bg-slate-50 hover:text-slate-900"
                aria-label="매뉴얼 닫기"
              >
                <X className="size-4" aria-hidden="true" />
              </button>

              <div className="relative flex min-h-0 flex-1 items-center justify-center bg-slate-100 p-3">
                <button
                  type="button"
                  onClick={goPrevSlide}
                  disabled={!hasPrevSlide}
                  aria-label="이전 슬라이드"
                  className="absolute left-5 top-1/2 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft className="size-5" aria-hidden="true" />
                </button>
                <div className="flex aspect-video w-full max-w-[700px] items-center justify-center overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={currentSrc} alt={currentSlide?.title ?? "사용 매뉴얼"} className="h-full w-full object-contain" />
                </div>
                <button
                  type="button"
                  onClick={goNextSlide}
                  disabled={!hasNextSlide}
                  aria-label="다음 슬라이드"
                  className="absolute right-5 top-1/2 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronRight className="size-5" aria-hidden="true" />
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
