"use client";

import { useRouter } from "next/navigation";
import {
  ArrowUpDown,
  Copy,
  CopyMinus,
  Layers3,
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

import type { SortOrder, StatusFilter } from "./manage-header";

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

  // Duplicate detection controls
  pageMode: "list" | "duplicates";
  onTogglePageMode: () => void;
  hideDuplicates: boolean;
  onToggleHideDuplicates: () => void;
  duplicateGroupCount: number;
  totalDuplicateCount: number;
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
  pageMode,
  onTogglePageMode,
  hideDuplicates,
  onToggleHideDuplicates,
  duplicateGroupCount,
  totalDuplicateCount,
}: ManageFiltersBarProps) {
  const router = useRouter();

  return (
    <div className="flex min-w-0 items-center gap-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-300" />
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
        <SelectTrigger className="h-7 w-[88px] px-2.5 text-[11.5px]">
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
        <SelectTrigger className="h-7 w-[108px] px-2.5 text-[11.5px]">
          <ArrowUpDown className="mr-1 size-3 shrink-0" />
          <SelectValue placeholder="정렬" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="newest">최신순</SelectItem>
          <SelectItem value="oldest">오래된순</SelectItem>
          <SelectItem value="page_asc">페이지 순</SelectItem>
        </SelectContent>
      </Select>

      {/* ─── Duplicate-hide toggle (acts on flat list) ─── */}
      <button
        type="button"
        onClick={onToggleHideDuplicates}
        disabled={totalDuplicateCount === 0 || pageMode === "duplicates"}
        aria-pressed={hideDuplicates}
        title={
          totalDuplicateCount === 0
            ? "중복 자료가 없습니다"
            : hideDuplicates
              ? "중복 자료 숨김 해제"
              : "중복 자료 숨기기 (같은 내용은 1개만 표시)"
        }
        className={
          "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-[11.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 " +
          (hideDuplicates
            ? "border-blue-300 bg-blue-50 text-blue-700"
            : totalDuplicateCount === 0 || pageMode === "duplicates"
              ? "border-slate-200 text-slate-300 cursor-not-allowed"
              : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-slate-50")
        }
      >
        {hideDuplicates ? (
          <CopyMinus className="size-3.5" aria-hidden="true" />
        ) : (
          <Copy className="size-3.5" aria-hidden="true" />
        )}
        {hideDuplicates ? "중복 숨김" : "중복 숨기기"}
        {totalDuplicateCount > 0 ? (
          <span
            className={
              "tabular-nums text-[10px] font-semibold px-1 rounded " +
              (hideDuplicates
                ? "bg-blue-100 text-blue-700"
                : "bg-slate-100 text-slate-500")
            }
          >
            {totalDuplicateCount}
          </span>
        ) : null}
      </button>

      {/* ─── Duplicate cluster view toggle ─── */}
      <button
        type="button"
        onClick={onTogglePageMode}
        disabled={duplicateGroupCount === 0}
        aria-pressed={pageMode === "duplicates"}
        title={
          duplicateGroupCount === 0
            ? "중복 그룹이 없습니다"
            : pageMode === "duplicates"
              ? "목록으로 돌아가기"
              : "중복 그룹 모아보기"
        }
        className={
          "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-[11.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 " +
          (pageMode === "duplicates"
            ? "border-blue-300 bg-blue-50 text-blue-700"
            : duplicateGroupCount === 0
              ? "border-slate-200 text-slate-300 cursor-not-allowed"
              : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-slate-50")
        }
      >
        <Layers3 className="size-3.5" aria-hidden="true" />
        {pageMode === "duplicates" ? "목록 보기" : "중복 모아보기"}
        {duplicateGroupCount > 0 ? (
          <span
            className={
              "tabular-nums text-[10px] font-semibold px-1 rounded " +
              (pageMode === "duplicates"
                ? "bg-blue-100 text-blue-700"
                : "bg-slate-100 text-slate-500")
            }
          >
            {duplicateGroupCount}
          </span>
        ) : null}
      </button>

      <button
        type="button"
        onClick={onRefresh}
        className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-[11.5px] font-medium text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <RefreshCw className="size-3.5" aria-hidden="true" />
        새로고침
      </button>

      <button
        type="button"
        onClick={onToggleQueue}
        aria-pressed={queueOpen}
        className={
          "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-[11.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 " +
          (queueOpen
            ? "border-blue-300 bg-blue-50 text-blue-700"
            : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-slate-50")
        }
      >
        <PanelBottomOpen className="size-3.5" aria-hidden="true" />
        작업 목록
      </button>

      <button
        type="button"
        onClick={() => router.push("/director/workbench/extraction")}
        className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md bg-blue-600 px-2.5 text-[11.5px] font-bold text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
      >
        <UploadCloud className="size-3.5" aria-hidden="true" />
        자료 추출
      </button>
    </div>
  );
}
