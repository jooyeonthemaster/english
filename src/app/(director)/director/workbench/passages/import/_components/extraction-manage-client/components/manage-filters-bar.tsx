"use client";

import {
  ArrowUpDown,
  Copy,
  Layers3,
  ListFilter,
  Search,
  X,
} from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useSearchDebounce } from "@/hooks/use-search-debounce";

import type { SortOrder, StatusFilter } from "./manage-header";

interface ManageFiltersBarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  onSearchSubmit: (value?: string) => void;

  // Filter toggle — controlled by the parent so the expanded panel can be
  // rendered full-width below the header (see ManageFiltersPanel).
  showFilters: boolean;
  onToggleFilters: () => void;
  hasActiveFilter: boolean;

  compact?: boolean;
}

export function ManageFiltersBar({
  searchValue,
  onSearchChange,
  onSearchSubmit,
  showFilters,
  onToggleFilters,
  hasActiveFilter,
  compact = false,
}: ManageFiltersBarProps) {
  // 타이핑 즉시(라이브) 검색 — 입력 멈추면 커밋, Enter·지우기는 즉시 커밋.
  const { schedule, flush } = useSearchDebounce((v) => onSearchSubmit(v));

  return (
    <div
      className={
        compact
          ? "flex min-w-0 flex-1 items-center justify-end gap-1"
          : "flex min-w-0 flex-wrap items-center justify-end gap-2"
      }
    >
      <button
        type="button"
        onClick={onToggleFilters}
        aria-expanded={showFilters}
        title="필터"
        aria-label="필터"
        className={`relative flex size-7 shrink-0 items-center justify-center rounded-md border shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
          showFilters || hasActiveFilter
            ? "border-blue-200 bg-blue-50 text-blue-700"
            : "border-input bg-transparent text-slate-700 hover:bg-slate-50"
        }`}
      >
        <ListFilter className="size-3.5 shrink-0" aria-hidden="true" />
        {hasActiveFilter ? (
          <span
            aria-hidden="true"
            className="absolute right-1 top-1 inline-block size-1.5 rounded-full bg-blue-500"
          />
        ) : null}
      </button>

      <Popover>
        <PopoverTrigger
          title="검색"
          aria-label="검색"
          className="relative flex size-7 shrink-0 items-center justify-center rounded-md border border-input bg-transparent shadow-xs transition-[color,box-shadow] outline-none hover:bg-slate-50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <Search className="size-3.5 shrink-0" />
          {searchValue ? (
            <span
              aria-hidden="true"
              className="absolute right-1 top-1 inline-block size-1.5 rounded-full bg-blue-500"
            />
          ) : null}
        </PopoverTrigger>
        <PopoverContent align="end" className="w-60 p-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-slate-600">
              자료 검색
            </label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                autoFocus
                placeholder="자료 검색"
                value={searchValue}
                onChange={(e) => {
                  onSearchChange(e.target.value);
                  schedule(e.target.value);
                }}
                onKeyDown={(e) => e.key === "Enter" && flush(searchValue)}
                className="h-8 w-full rounded-md border border-slate-200 bg-white pl-7 pr-7 text-[12px] text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10"
              />
              {searchValue ? (
                <button
                  type="button"
                  onClick={() => {
                    onSearchChange("");
                    flush("");
                  }}
                  className="absolute right-1.5 top-1/2 inline-flex size-4 -translate-y-1/2 cursor-pointer items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  aria-label="검색 지우기"
                >
                  <X className="size-3" />
                </button>
              ) : null}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

interface ManageFiltersPanelProps {
  statusFilter: StatusFilter;
  onStatusFilterChange: (value: StatusFilter) => void;

  sortOrder: SortOrder;
  onSortOrderChange: (value: SortOrder) => void;

  // Duplicate detection controls
  pageMode: "list" | "duplicates";
  onTogglePageMode: () => void;
  hideDuplicates: boolean;
  onToggleHideDuplicates: () => void;
  duplicateGroupCount: number;
  totalDuplicateCount: number;
}

/**
 * Inline sub-filter panel. Rendered full-width directly below the toolbar
 * header (mirrors the 문제 생성 page) instead of inside a floating popover.
 */
export function ManageFiltersPanel({
  statusFilter,
  onStatusFilterChange,
  sortOrder,
  onSortOrderChange,
  pageMode,
  onTogglePageMode,
  hideDuplicates,
  onToggleHideDuplicates,
  duplicateGroupCount,
  totalDuplicateCount,
}: ManageFiltersPanelProps) {
  const duplicateMode = pageMode === "duplicates"
    ? "grouped"
    : hideDuplicates
      ? "hidden"
      : "all";
  const handleDuplicateModeChange = (value: string) => {
    if (value === duplicateMode) return;

    if (value === "all") {
      if (pageMode === "duplicates") onTogglePageMode();
      if (hideDuplicates) onToggleHideDuplicates();
      return;
    }

    if (value === "hidden") {
      if (pageMode === "duplicates") onTogglePageMode();
      if (!hideDuplicates) onToggleHideDuplicates();
      return;
    }

    if (value === "grouped") {
      if (hideDuplicates) onToggleHideDuplicates();
      if (pageMode !== "duplicates") onTogglePageMode();
    }
  };

  return (
    <div className="mt-1.5 flex flex-wrap items-end justify-end gap-2 border-t border-slate-100 pt-2">
      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-medium text-slate-600">상태</label>
        <Select
          value={statusFilter}
          onValueChange={(v) => onStatusFilterChange(v as StatusFilter)}
        >
          <SelectTrigger className="h-8 w-36 px-2.5 text-[12px]">
            <SelectValue placeholder="상태" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">전체 상태</SelectItem>
            <SelectItem value="RESTORED">복원됨</SelectItem>
            <SelectItem value="PENDING">복원 중</SelectItem>
            <SelectItem value="PARTIAL">확인 필요</SelectItem>
            <SelectItem value="FAILED">실패</SelectItem>
            <SelectItem value="NO_RESTORATION_NEEDED">복원 불필요</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-medium text-slate-600">정렬</label>
        <Select
          value={sortOrder}
          onValueChange={(v) => onSortOrderChange(v as SortOrder)}
        >
          <SelectTrigger className="h-8 w-36 px-2.5 text-[12px]">
            <ArrowUpDown className="mr-1 size-3 shrink-0" />
            <SelectValue placeholder="정렬" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">최신순</SelectItem>
            <SelectItem value="oldest">오래된순</SelectItem>
            <SelectItem value="name_asc">이름 오름차순</SelectItem>
            <SelectItem value="name_desc">이름 내림차순</SelectItem>
            <SelectItem value="page_asc">페이지 순</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-medium text-slate-600">
          중복 보기
        </label>
        <Select value={duplicateMode} onValueChange={handleDuplicateModeChange}>
          <SelectTrigger className="h-8 w-40 px-2.5 text-[12px]">
            {duplicateMode === "grouped" ? (
              <Layers3 className="mr-1 size-3 shrink-0" aria-hidden="true" />
            ) : (
              <Copy className="mr-1 size-3 shrink-0" aria-hidden="true" />
            )}
            <SelectValue placeholder="중복" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">중복 표시</SelectItem>
            <SelectItem value="hidden" disabled={totalDuplicateCount === 0}>
              중복 숨기기
              {totalDuplicateCount > 0 ? ` ${totalDuplicateCount}` : ""}
            </SelectItem>
            <SelectItem value="grouped" disabled={duplicateGroupCount === 0}>
              중복 모아보기
              {duplicateGroupCount > 0 ? ` ${duplicateGroupCount}` : ""}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
