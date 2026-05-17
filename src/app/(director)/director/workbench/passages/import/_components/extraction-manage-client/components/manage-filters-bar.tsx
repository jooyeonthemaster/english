"use client";

import { useRouter } from "next/navigation";
import {
  ArrowUpDown,
  PanelBottomOpen,
  RefreshCw,
  Search,
  UploadCloud,
} from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type StatusFilter =
  | "ALL"
  | "RESTORED"
  | "PENDING"
  | "PARTIAL"
  | "FAILED"
  | "NO_RESTORATION_NEEDED";
export type SortOrder = "newest" | "oldest" | "page_asc";

interface ManageFiltersBarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  onSearchSubmit: () => void;

  statusFilter: StatusFilter;
  onStatusFilterChange: (value: StatusFilter) => void;

  sortOrder: SortOrder;
  onSortOrderChange: (value: SortOrder) => void;

  queueOpen: boolean;
  onToggleQueue: () => void;
  onRefresh: () => void;
}

export function ManageFiltersBar({
  searchValue,
  onSearchChange,
  onSearchSubmit,
  statusFilter,
  onStatusFilterChange,
  sortOrder,
  onSortOrderChange,
  queueOpen,
  onToggleQueue,
  onRefresh,
}: ManageFiltersBarProps) {
  const router = useRouter();

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-slate-300" />
        <input
          placeholder="검색..."
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSearchSubmit()}
          className="h-7 w-40 rounded-md border border-slate-200 bg-slate-50 pl-7 pr-2.5 text-[11.5px] outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10"
        />
      </div>

      <Select
        value={statusFilter}
        onValueChange={(v) => onStatusFilterChange(v as StatusFilter)}
      >
        <SelectTrigger className="h-7 w-[112px] px-2.5 text-[11.5px]">
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
        <SelectTrigger className="h-7 w-[104px] px-2.5 text-[11.5px]">
          <ArrowUpDown className="mr-1 size-3 shrink-0" />
          <SelectValue placeholder="정렬" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="newest">최신순</SelectItem>
          <SelectItem value="oldest">오래된순</SelectItem>
          <SelectItem value="page_asc">페이지 순</SelectItem>
        </SelectContent>
      </Select>

      <span className="mx-0.5 hidden h-4 w-px bg-slate-200 sm:inline-block" />

      <button
        type="button"
        onClick={onRefresh}
        className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-[11.5px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <RefreshCw className="size-3" aria-hidden="true" />
        새로고침
      </button>

      <button
        type="button"
        onClick={onToggleQueue}
        aria-pressed={queueOpen}
        className={
          "inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border px-2.5 text-[11.5px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 " +
          (queueOpen
            ? "border-blue-300 bg-blue-50 text-blue-700"
            : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-slate-50")
        }
      >
        <PanelBottomOpen className="size-3" aria-hidden="true" />
        작업 목록
      </button>

      <button
        type="button"
        onClick={() => router.push("/director/workbench/extraction")}
        className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md bg-blue-600 px-2.5 text-[11.5px] font-bold text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
      >
        <UploadCloud className="size-3" aria-hidden="true" />
        자료 추출
      </button>
    </div>
  );
}
