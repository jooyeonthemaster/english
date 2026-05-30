"use client";

import { ArrowUpDown, ListFilter, Search, X } from "lucide-react";

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

export type TaskStatusFilter =
  | "ALL"
  | "pending"
  | "processing"
  | "completed"
  | "partial"
  | "failed"
  | "cancelled";

export type TaskSortOrder =
  | "newest"
  | "oldest"
  | "name_asc"
  | "name_desc";

interface ManageFiltersBarTasksProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  onSearchSubmit: () => void;

  statusFilter: TaskStatusFilter;
  onStatusFilterChange: (value: TaskStatusFilter) => void;

  sortOrder: TaskSortOrder;
  onSortOrderChange: (value: TaskSortOrder) => void;

  variant?: "all" | "filters-only" | "search-only";
  compact?: boolean;
}

export function ManageFiltersBarTasks({
  searchValue,
  onSearchChange,
  onSearchSubmit,
  statusFilter,
  onStatusFilterChange,
  sortOrder,
  onSortOrderChange,
  variant = "all",
  compact = false,
}: ManageFiltersBarTasksProps) {
  const showSearch = variant !== "filters-only";
  const showFilters = variant !== "search-only";
  const hasActiveFilter =
    statusFilter !== "ALL" || sortOrder !== "newest";

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
            title="필터"
            aria-label="필터"
            className="relative flex size-7 shrink-0 items-center justify-center rounded-md border border-input bg-transparent shadow-xs transition-[color,box-shadow] outline-none hover:bg-slate-50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <ListFilter className="size-3.5 shrink-0" />
            {hasActiveFilter ? (
              <span
                aria-hidden="true"
                className="absolute right-1 top-1 inline-block size-1.5 rounded-full bg-blue-500"
              />
            ) : null}
          </PopoverTrigger>
          <PopoverContent align="end" className="w-56 p-3">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-medium text-slate-600">
                  상태
                </label>
                <Select
                  value={statusFilter}
                  onValueChange={(v) =>
                    onStatusFilterChange(v as TaskStatusFilter)
                  }
                >
                  <SelectTrigger className="h-8 w-full px-2.5 text-[12px]">
                    <SelectValue placeholder="상태" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">전체 상태</SelectItem>
                    <SelectItem value="processing">진행중</SelectItem>
                    <SelectItem value="pending">대기중</SelectItem>
                    <SelectItem value="completed">완료</SelectItem>
                    <SelectItem value="partial">부분완료</SelectItem>
                    <SelectItem value="failed">실패</SelectItem>
                    <SelectItem value="cancelled">취소</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-medium text-slate-600">
                  정렬
                </label>
                <Select
                  value={sortOrder}
                  onValueChange={(v) =>
                    onSortOrderChange(v as TaskSortOrder)
                  }
                >
                  <SelectTrigger className="h-8 w-full px-2.5 text-[12px]">
                    <ArrowUpDown className="mr-1 size-3 shrink-0" />
                    <SelectValue placeholder="정렬" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">최신순</SelectItem>
                    <SelectItem value="oldest">오래된순</SelectItem>
                    <SelectItem value="name_asc">이름 오름차순</SelectItem>
                    <SelectItem value="name_desc">이름 내림차순</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      ) : null}

      {showSearch ? (
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
                  onChange={(e) => onSearchChange(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && onSearchSubmit()}
                  className="h-8 w-full rounded-md border border-slate-200 bg-white pl-7 pr-7 text-[12px] text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10"
                />
                {searchValue ? (
                  <button
                    type="button"
                    onClick={() => onSearchChange("")}
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
      ) : null}
    </div>
  );
}
