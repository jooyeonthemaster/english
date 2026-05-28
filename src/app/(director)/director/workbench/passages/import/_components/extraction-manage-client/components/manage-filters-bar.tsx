"use client";

import {
  ArrowUpDown,
  Copy,
  Layers3,
  Search,
} from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { SortOrder, StatusFilter } from "./manage-header";

interface ManageFiltersBarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  onSearchSubmit: () => void;

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

  compact?: boolean;
}

export function ManageFiltersBar({
  searchValue,
  onSearchChange,
  onSearchSubmit,
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
  compact = false,
}: ManageFiltersBarProps) {
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
    <div
      className={
        compact
          ? "flex min-w-0 flex-1 items-center justify-end gap-1"
          : "flex min-w-0 flex-wrap items-center justify-end gap-2"
      }
    >
      <Select
        value={statusFilter}
        onValueChange={(v) => onStatusFilterChange(v as StatusFilter)}
      >
        <SelectTrigger
          title={compact ? "상태 필터" : undefined}
          className={
            "h-7 shrink-0 " +
            (compact
              ? "w-[78px] px-1.5 text-[10.5px]"
              : "w-max min-w-[112px] px-2.5 text-[11.5px]")
          }
        >
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

      <Select
        value={sortOrder}
        onValueChange={(v) => onSortOrderChange(v as SortOrder)}
      >
        <SelectTrigger
          title={compact ? "정렬" : undefined}
          className={
            "h-7 shrink-0 " +
            (compact
              ? "w-[86px] px-1.5 text-[10.5px]"
              : "w-[136px] px-2.5 text-[11.5px]")
          }
        >
          <ArrowUpDown
            className={
              (compact ? "mr-0.5 size-2.5" : "mr-1 size-3") + " shrink-0"
            }
          />
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

      <Select
        value={duplicateMode}
        onValueChange={handleDuplicateModeChange}
      >
        <SelectTrigger
          title={compact ? "중복 보기" : undefined}
          className={
            "h-7 shrink-0 " +
            (compact
              ? "w-[68px] px-1.5 text-[10.5px]"
              : "w-[136px] px-2.5 text-[11.5px]")
          }
        >
          {duplicateMode === "grouped" ? (
            <Layers3
              className={
                (compact ? "mr-0.5 size-2.5" : "mr-1 size-3") + " shrink-0"
              }
              aria-hidden="true"
            />
          ) : (
            <Copy
              className={
                (compact ? "mr-0.5 size-2.5" : "mr-1 size-3") + " shrink-0"
              }
              aria-hidden="true"
            />
          )}
          <SelectValue placeholder="중복" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">중복 표시</SelectItem>
          <SelectItem
            value="hidden"
            disabled={totalDuplicateCount === 0}
          >
            중복 숨기기
            {totalDuplicateCount > 0 ? ` ${totalDuplicateCount}` : ""}
          </SelectItem>
          <SelectItem
            value="grouped"
            disabled={duplicateGroupCount === 0}
          >
            중복 모아보기
            {duplicateGroupCount > 0 ? ` ${duplicateGroupCount}` : ""}
          </SelectItem>
        </SelectContent>
      </Select>

      <div className={"relative " + (compact ? "min-w-0 flex-1" : "")}>
        <Search
          className={
            "absolute top-1/2 -translate-y-1/2 text-slate-300 " +
            (compact ? "left-1.5 size-3" : "left-2.5 size-3.5")
          }
        />
        <input
          placeholder={compact ? "검색" : "자료 검색"}
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSearchSubmit()}
          className={
            "h-7 rounded-md border border-slate-200 bg-slate-50 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 " +
            (compact
              ? "w-full min-w-0 pl-6 pr-1.5 text-[10.5px]"
              : "w-40 pl-7 pr-2.5 text-[11.5px]")
          }
        />
      </div>
    </div>
  );
}
