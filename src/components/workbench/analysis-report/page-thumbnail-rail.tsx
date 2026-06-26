import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";

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
}: Props) {
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
              return (
                <div key={pi} data-thumb-index={pi} className="group/page relative">
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
