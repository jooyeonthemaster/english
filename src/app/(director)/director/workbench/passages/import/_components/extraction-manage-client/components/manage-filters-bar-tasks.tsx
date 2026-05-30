"use client";

import type { ReactNode } from "react";
import { ListFilter, RotateCcw, Search, X } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export type TaskStatusFilter =
  | "ALL"
  | "pending"
  | "processing"
  | "completed"
  | "partial"
  | "failed"
  | "cancelled";

export type TaskSortOrder = "newest" | "oldest" | "name_asc" | "name_desc";

export type TaskAnalysisFilter = "all" | "analyzed" | "pending";

const STATUS_OPTIONS: { value: TaskStatusFilter; label: string }[] = [
  { value: "ALL", label: "전체" },
  { value: "completed", label: "완료" },
  { value: "partial", label: "부분완료" },
  { value: "processing", label: "진행중" },
  { value: "failed", label: "실패" },
];

const ANALYSIS_OPTIONS: { value: TaskAnalysisFilter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "analyzed", label: "분석완료" },
  { value: "pending", label: "미분석" },
];

const SORT_OPTIONS: { value: TaskSortOrder; label: string }[] = [
  { value: "newest", label: "최신순" },
  { value: "oldest", label: "오래된순" },
  { value: "name_asc", label: "가나다순" },
  { value: "name_desc", label: "역순" },
];

interface ManageFiltersBarTasksProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  /** Optional — search is applied live, so this is only an Enter convenience. */
  onSearchSubmit?: () => void;
  /** Number of items currently matching, surfaced inside the search popover. */
  resultCount?: number;

  statusFilter: TaskStatusFilter;
  onStatusFilterChange: (value: TaskStatusFilter) => void;

  sortOrder: TaskSortOrder;
  onSortOrderChange: (value: TaskSortOrder) => void;

  /** Analysis-progress facet. Only rendered when both are provided. */
  analysisFilter?: TaskAnalysisFilter;
  onAnalysisFilterChange?: (value: TaskAnalysisFilter) => void;

  variant?: "all" | "filters-only" | "search-only";
  compact?: boolean;
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        "inline-flex h-7 cursor-pointer items-center rounded-full px-2.5 text-[11.5px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-500/40 " +
        (active
          ? "bg-blue-600 text-white shadow-sm"
          : "bg-slate-50 text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-100 hover:text-slate-900")
      }
    >
      {children}
    </button>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[10.5px] font-bold uppercase tracking-wide text-slate-400">
      {children}
    </p>
  );
}

export function ManageFiltersBarTasks({
  searchValue,
  onSearchChange,
  onSearchSubmit,
  resultCount,
  statusFilter,
  onStatusFilterChange,
  sortOrder,
  onSortOrderChange,
  analysisFilter,
  onAnalysisFilterChange,
  variant = "all",
  compact = false,
}: ManageFiltersBarTasksProps) {
  const showSearch = variant !== "filters-only";
  const showFilters = variant !== "search-only";
  const showAnalysis =
    analysisFilter !== undefined && onAnalysisFilterChange !== undefined;

  const activeCount =
    (statusFilter !== "ALL" ? 1 : 0) +
    (sortOrder !== "newest" ? 1 : 0) +
    (showAnalysis && analysisFilter !== "all" ? 1 : 0);
  const hasActiveFilter = activeCount > 0;

  const resetAll = () => {
    onStatusFilterChange("ALL");
    onSortOrderChange("newest");
    onAnalysisFilterChange?.("all");
  };

  return (
    <div
      className={
        compact
          ? "flex min-w-0 flex-1 items-center justify-end gap-1"
          : "flex min-w-0 flex-wrap items-center justify-end gap-2"
      }
    >
      {showFilters ? (
        <Popover>
          <PopoverTrigger
            title="필터 · 정렬"
            aria-label="필터 · 정렬"
            className={
              "relative flex size-7 shrink-0 items-center justify-center rounded-md border shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 " +
              (hasActiveFilter
                ? "border-blue-300 bg-blue-50 text-blue-700"
                : "border-input bg-transparent text-slate-600 hover:bg-slate-50")
            }
          >
            <ListFilter className="size-3.5 shrink-0" />
            {hasActiveFilter ? (
              <span
                aria-hidden="true"
                className="absolute -right-1.5 -top-1.5 inline-flex min-w-[15px] items-center justify-center rounded-full bg-blue-600 px-1 text-[9px] font-bold leading-[15px] text-white ring-2 ring-white"
              >
                {activeCount}
              </span>
            ) : null}
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[272px] overflow-hidden p-0">
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
              <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-slate-800">
                <ListFilter className="size-3.5 text-slate-500" aria-hidden="true" />
                필터 · 정렬
              </span>
              {hasActiveFilter ? (
                <button
                  type="button"
                  onClick={resetAll}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
                >
                  <RotateCcw className="size-3" aria-hidden="true" />
                  초기화
                </button>
              ) : null}
            </div>

            <div className="space-y-3 p-3">
              <section>
                <SectionLabel>상태</SectionLabel>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {STATUS_OPTIONS.map((opt) => (
                    <Pill
                      key={opt.value}
                      active={statusFilter === opt.value}
                      onClick={() => onStatusFilterChange(opt.value)}
                    >
                      {opt.label}
                    </Pill>
                  ))}
                </div>
              </section>

              {showAnalysis ? (
                <section>
                  <SectionLabel>분석</SectionLabel>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {ANALYSIS_OPTIONS.map((opt) => (
                      <Pill
                        key={opt.value}
                        active={analysisFilter === opt.value}
                        onClick={() => onAnalysisFilterChange?.(opt.value)}
                      >
                        {opt.label}
                      </Pill>
                    ))}
                  </div>
                </section>
              ) : null}

              <section>
                <SectionLabel>정렬</SectionLabel>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {SORT_OPTIONS.map((opt) => (
                    <Pill
                      key={opt.value}
                      active={sortOrder === opt.value}
                      onClick={() => onSortOrderChange(opt.value)}
                    >
                      {opt.label}
                    </Pill>
                  ))}
                </div>
              </section>
            </div>
          </PopoverContent>
        </Popover>
      ) : null}

      {showSearch ? (
        <Popover>
          <PopoverTrigger
            title="검색"
            aria-label="검색"
            className={
              "relative flex size-7 shrink-0 items-center justify-center rounded-md border shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 " +
              (searchValue
                ? "border-blue-300 bg-blue-50 text-blue-700"
                : "border-input bg-transparent text-slate-600 hover:bg-slate-50")
            }
          >
            <Search className="size-3.5 shrink-0" />
            {searchValue ? (
              <span
                aria-hidden="true"
                className="absolute -right-1 -top-1 inline-block size-2 rounded-full bg-blue-600 ring-2 ring-white"
              />
            ) : null}
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[284px] overflow-hidden p-0">
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
              <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-slate-800">
                <Search className="size-3.5 text-slate-500" aria-hidden="true" />
                자료 검색
              </span>
              {searchValue && resultCount !== undefined ? (
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10.5px] font-bold tabular-nums text-blue-700">
                  {resultCount}건
                </span>
              ) : null}
            </div>
            <div className="p-3">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  autoFocus
                  placeholder="제목 · 내용으로 검색"
                  value={searchValue}
                  onChange={(e) => onSearchChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onSearchSubmit?.();
                  }}
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-8 text-[12.5px] text-slate-700 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10"
                />
                {searchValue ? (
                  <button
                    type="button"
                    onClick={() => onSearchChange("")}
                    className="absolute right-2 top-1/2 inline-flex size-5 -translate-y-1/2 cursor-pointer items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    aria-label="검색 지우기"
                  >
                    <X className="size-3.5" />
                  </button>
                ) : null}
              </div>
              <p className="mt-2 text-[10.5px] leading-relaxed text-slate-400">
                제목 · 파일명은 물론 <span className="font-semibold text-slate-500">자료 본문 내용</span>까지 한 번에 찾습니다.
              </p>
            </div>
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
}
