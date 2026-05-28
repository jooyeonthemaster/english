"use client";

import { ArrowUpDown, Search } from "lucide-react";

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

  return (
    <div
      className={
        compact
          ? "flex min-w-0 flex-1 items-center justify-end gap-1"
          : "flex min-w-0 flex-wrap items-center justify-end gap-2"
      }
    >
      {showFilters ? (
        <>
          <Select
            value={statusFilter}
            onValueChange={(v) => onStatusFilterChange(v as TaskStatusFilter)}
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
              <SelectItem value="processing">진행중</SelectItem>
              <SelectItem value="pending">대기중</SelectItem>
              <SelectItem value="completed">완료</SelectItem>
              <SelectItem value="partial">부분완료</SelectItem>
              <SelectItem value="failed">실패</SelectItem>
              <SelectItem value="cancelled">취소</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={sortOrder}
            onValueChange={(v) => onSortOrderChange(v as TaskSortOrder)}
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
            </SelectContent>
          </Select>
        </>
      ) : null}

      {showSearch ? (
        <div
          className={
            "relative " + (compact ? "min-w-0 flex-1" : "")
          }
        >
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
      ) : null}
    </div>
  );
}
