"use client";

import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpDown,
  Database,
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
import { BreadcrumbNav } from "@/components/workbench/shared/breadcrumb-nav";
import type { CollectionItem } from "@/components/workbench/shared/types";

export type StatusFilter = "ALL" | "RESTORED" | "PENDING" | "PARTIAL" | "FAILED" | "NO_RESTORATION_NEEDED";
export type SortOrder = "newest" | "oldest" | "page_asc";

interface ManageHeaderProps {
  totalCount: number;
  selectedJobId: string | null;
  resultScope: "all" | "job";
  activeFolder: string | null;
  breadcrumbPath: CollectionItem[];

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

  onBackToAllResults: () => void;
  onNavigateUp: () => void;
  onNavigateToFolder: (id: string | null) => void;
}

export function ManageHeader({
  totalCount,
  selectedJobId,
  resultScope,
  activeFolder,
  breadcrumbPath,
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
  onBackToAllResults,
  onNavigateUp,
  onNavigateToFolder,
}: ManageHeaderProps) {
  const router = useRouter();
  void selectedJobId;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-6 py-2.5 shrink-0">
      {/* Left: back/icon + title + breadcrumb */}
      <div className="flex items-center gap-2 shrink-0">
        {activeFolder ? (
          <button
            type="button"
            onClick={onNavigateUp}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="상위 폴더로"
          >
            <ArrowLeft className="w-4 h-4 text-slate-500" />
          </button>
        ) : (
          <Database className="w-[18px] h-[18px] text-emerald-600 shrink-0" />
        )}
        <h1 className="text-[15px] font-bold text-slate-900">자료 관리</h1>
        <span className="text-[12px] text-slate-400">{totalCount}개</span>
        <BreadcrumbNav
          activeFolder={activeFolder}
          breadcrumbPath={breadcrumbPath}
          onNavigateToFolder={onNavigateToFolder}
          rootLabel="전체 자료"
        />
        {resultScope === "job" ? (
          <button
            type="button"
            onClick={onBackToAllResults}
            className="ml-1 cursor-pointer rounded-md border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
          >
            전체 결과로
          </button>
        ) : null}
      </div>

      <div className="flex-1" />

      {/* Right: search + filters + actions */}
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300" />
          <input
            placeholder="검색..."
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSearchSubmit()}
            className="w-44 h-8 pl-8 pr-3 text-[12px] rounded-lg border border-slate-200 bg-slate-50 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10"
          />
        </div>

        <Select value={statusFilter} onValueChange={(v) => onStatusFilterChange(v as StatusFilter)}>
          <SelectTrigger className="w-28 h-8 text-[12px]">
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

        <Select value={sortOrder} onValueChange={(v) => onSortOrderChange(v as SortOrder)}>
          <SelectTrigger className="w-32 h-8 text-[12px]">
            <ArrowUpDown className="w-3 h-3 mr-1 shrink-0" />
            <SelectValue placeholder="정렬" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">최신순</SelectItem>
            <SelectItem value="oldest">오래된순</SelectItem>
            <SelectItem value="page_asc">페이지 순</SelectItem>
          </SelectContent>
        </Select>

        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-[12px] font-semibold text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-label="새로고침"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          새로고침
        </button>

        <button
          type="button"
          onClick={onToggleQueue}
          aria-pressed={queueOpen}
          className={
            "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 " +
            (queueOpen
              ? "border-blue-300 bg-blue-50 text-blue-700"
              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800")
          }
        >
          <PanelBottomOpen className="w-3.5 h-3.5" />
          작업 목록
        </button>

        <button
          type="button"
          onClick={() => router.push("/director/workbench/passages/import")}
          className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-[12px] font-bold text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
        >
          <UploadCloud className="w-3.5 h-3.5" />
          자료 추출
        </button>
      </div>
    </div>
  );
}
