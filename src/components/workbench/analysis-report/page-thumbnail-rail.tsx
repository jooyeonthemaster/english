import { ChevronLeft, ChevronRight, GripVertical, Trash2 } from "lucide-react";
import { useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";

import { cn } from "@/lib/utils";
import type { AnalysisReport } from "@/lib/passage-report/analysis-report/schema";

import { PageMiniPreview } from "./page-mini-preview";
import type { FlowItem } from "./report-sections";

type ThumbPageInfo = {
  coverFlags: boolean[];
  bodyNumbers: number[];
  bodyTotal: number;
};

type Props = {
  collapsed: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  railWidth: number;
  pageList: string[][];
  scrollerRef: RefObject<HTMLDivElement | null>;
  activePageIndex: number;
  onSelectPage: (index: number) => void;
  report: AnalysisReport;
  itemsById: Map<string, FlowItem>;
  pageInfo: ThumbPageInfo;
  onDeletePage: (ids: string[]) => void;
  onStartRailDrag: (event: ReactPointerEvent<HTMLDivElement>) => void;
  /** 페이지를 드래그해 최종 위치(인덱스)로 재정렬한다. */
  onReorderPages?: (fromIndex: number, toIndex: number) => void;
};

export function PageThumbnailRail({
  collapsed,
  onExpand,
  onCollapse,
  railWidth,
  pageList,
  scrollerRef,
  activePageIndex,
  onSelectPage,
  report,
  itemsById,
  pageInfo,
  onDeletePage,
  onStartRailDrag,
  onReorderPages,
}: Props) {
  // 페이지 드래그 재정렬 상태 — 시각 표시(드래그 중/드롭 위치)용.
  const [dragPi, setDragPi] = useState<number | null>(null);
  const [overPi, setOverPi] = useState<number | null>(null);
  const [placement, setPlacement] = useState<"before" | "after">("before");
  const dragRef = useRef<{
    from: number;
    to: number | null;
    placement: "before" | "after";
  } | null>(null);

  const pageCount = pageList.length;

  const autoScroll = (clientY: number) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const rect = scroller.getBoundingClientRect();
    const edge = 48;
    if (clientY < rect.top + edge) scroller.scrollTop -= 14;
    else if (clientY > rect.bottom - edge) scroller.scrollTop += 14;
  };

  const startPageDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    from: number,
  ) => {
    if (!onReorderPages || pageCount < 2) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = { from, to: null, placement: "before" };
    setDragPi(from);
    setOverPi(null);

    const move = (ev: PointerEvent) => {
      ev.preventDefault();
      autoScroll(ev.clientY);
      const el = document
        .elementFromPoint(ev.clientX, ev.clientY)
        ?.closest<HTMLElement>("[data-thumb-index]");
      if (!el) return;
      const idx = Number(el.dataset.thumbIndex);
      if (Number.isNaN(idx)) return;
      const rect = el.getBoundingClientRect();
      const place: "before" | "after" =
        ev.clientY > rect.top + rect.height / 2 ? "after" : "before";
      dragRef.current = { from, to: idx, placement: place };
      setOverPi(idx);
      setPlacement(place);
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      document.body.classList.remove("par-page-dragging");
      setDragPi(null);
      setOverPi(null);
    };
    const finish = () => {
      const d = dragRef.current;
      dragRef.current = null;
      cleanup();
      if (!d || d.to === null || !onReorderPages) return;
      // 드롭 슬롯(0..pageCount) → 제거 후 최종 인덱스로 변환.
      const slot = d.placement === "before" ? d.to : d.to + 1;
      let dest = slot > d.from ? slot - 1 : slot;
      dest = Math.max(0, Math.min(pageCount - 1, dest));
      if (dest !== d.from) onReorderPages(d.from, dest);
    };
    const cancel = () => {
      dragRef.current = null;
      cleanup();
    };
    document.body.classList.add("par-page-dragging");
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", cancel, { once: true });
  };

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onExpand}
        title="페이지 목록 열기"
        aria-label="페이지 목록 열기"
        aria-expanded={false}
        className="no-print hidden h-full min-h-0 w-5 shrink-0 select-none flex-col items-center justify-center gap-1 border-r border-slate-200 bg-white/80 py-2 text-[11px] font-semibold text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600 lg:flex"
      >
        <ChevronRight className="h-3.5 w-3.5" />
        <span style={{ writingMode: "vertical-rl" }}>페이지</span>
      </button>
    );
  }
  return (
    <>
      <aside style={{ width: railWidth }} className="no-print flex shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-white">
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-slate-200 px-3">
          <div>
            <p className="text-[11px] font-black text-slate-700">페이지</p>
            <p className="text-[10px] font-semibold text-slate-400">{pageList.length || 1}장</p>
          </div>
          <button
            type="button"
            onClick={onCollapse}
            title="페이지 목록 닫기"
            aria-label="페이지 목록 닫기"
            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
        </div>
        <div
          ref={scrollerRef}
          className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2.5 [scrollbar-gutter:stable]"
        >
          {pageList.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-2 py-4 text-center text-[11px] font-semibold text-slate-400">
              페이지 계산 중
            </div>
          ) : (
            pageList.map((ids, pi) => {
              const selected = activePageIndex === pi;
              const isDragging = dragPi === pi;
              const showOver = dragPi !== null && overPi === pi && dragPi !== pi;
              return (
                <div
                  key={pi}
                  data-thumb-index={pi}
                  className={cn(
                    "group/page relative transition-opacity",
                    isDragging && "opacity-40",
                  )}
                >
                  {/* 드롭 위치 표시선 */}
                  {showOver ? (
                    <span
                      aria-hidden
                      className={cn(
                        "pointer-events-none absolute inset-x-1 z-10 h-0.5 rounded-full bg-blue-500",
                        placement === "before" ? "-top-1" : "-bottom-1",
                      )}
                    />
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onSelectPage(pi)}
                    className={cn(
                      "flex w-full flex-col items-center rounded-lg border bg-white p-1.5 text-left shadow-sm transition-colors",
                      selected
                        ? "border-blue-300 bg-blue-50/70 shadow-[0_0_0_2px_rgba(59,130,246,0.10)]"
                        : "border-slate-200 hover:border-blue-200 hover:bg-slate-50",
                    )}
                    title={`${pi + 1}페이지로 이동`}
                    aria-current={selected ? "page" : undefined}
                  >
                    <PageMiniPreview
                      ids={ids}
                      report={report}
                      itemsById={itemsById}
                      isCover={pageInfo.coverFlags[pi]}
                      bodyNumber={pageInfo.bodyNumbers[pi]}
                      bodyTotal={pageInfo.bodyTotal}
                      selected={selected}
                    />
                  </button>
                  {/* 드래그 핸들 — 페이지 순서 변경 */}
                  {onReorderPages && pageList.length > 1 ? (
                    <button
                      type="button"
                      draggable={false}
                      onPointerDown={(e) => startPageDrag(e, pi)}
                      onClick={(e) => e.stopPropagation()}
                      title="드래그해 페이지 순서 변경"
                      aria-label={`${pi + 1}페이지 순서 변경`}
                      className="absolute left-0.5 top-0.5 flex h-6 w-6 cursor-grab touch-none items-center justify-center rounded-md bg-white/85 text-slate-400 opacity-0 shadow-sm transition hover:bg-white hover:text-slate-700 active:cursor-grabbing group-hover/page:opacity-100"
                    >
                      <GripVertical className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onDeletePage(ids)}
                    title="이 페이지 삭제"
                    aria-label="이 페이지 삭제"
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-red-200 bg-white text-red-500 opacity-0 shadow-sm transition hover:bg-red-50 group-hover/page:opacity-100"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </aside>
      <div
        onPointerDown={onStartRailDrag}
        title="페이지 목록 폭 조절"
        aria-hidden
        className="no-print hidden w-1.5 shrink-0 cursor-col-resize touch-none bg-slate-100 transition-colors hover:bg-blue-200 active:bg-blue-300 lg:block"
      />
    </>
  );
}
