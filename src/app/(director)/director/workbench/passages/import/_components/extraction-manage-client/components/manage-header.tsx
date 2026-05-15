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
import type { CollectionItem } from "@/components/workbench/shared/types";

import { DraftBreadcrumbNav } from "./draft-breadcrumb-nav";

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
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-2.5 shrink-0 xl:px-6">
      {/* Left: back/icon + title + breadcrumb */}
      <div className="flex items-center gap-3 min-w-0">
        {activeFolder ? (
          <button
            type="button"
            onClick={onNavigateUp}
            className="flex size-9 cursor-pointer items-center justify-center rounded-lg bg-slate-50 text-slate-500 ring-1 ring-slate-200 transition-colors hover:bg-slate-100"
            aria-label="상위 폴더로"
          >
            <ArrowLeft className="size-4" />
          </button>
        ) : (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
            <Database className="size-4" aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-950">자료 관리</h1>
            <span className="text-sm tabular-nums text-slate-400">{totalCount}개</span>
            <DraftBreadcrumbNav
              activeFolder={activeFolder}
              breadcrumbPath={breadcrumbPath}
              onNavigateToFolder={onNavigateToFolder}
              rootLabel="전체 자료"
            />
            {resultScope === "job" ? (
              <button
                type="button"
                onClick={onBackToAllResults}
                className="ml-1 cursor-pointer rounded-md border border-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
              >
                전체 결과로
              </button>
            ) : null}
          </div>
          <p className="mt-0.5 text-sm text-slate-500">
            추출한 지문을 폴더로 정리하고 복원문을 검수합니다.
          </p>
        </div>
      </div>

      <div className="flex-1" />

      {/* Right: search + filters + actions */}
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-slate-300" />
          <input
            placeholder="검색..."
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSearchSubmit()}
            className="h-9 w-48 rounded-md border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10"
          />
        </div>

        <Select value={statusFilter} onValueChange={(v) => onStatusFilterChange(v as StatusFilter)}>
          <SelectTrigger className="h-9 w-28 text-xs">
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
          <SelectTrigger className="h-9 w-32 text-xs">
            <ArrowUpDown className="mr-1 size-3 shrink-0" />
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
          className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 px-3 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <RefreshCw className="size-3.5" aria-hidden="true" />
          새로고침
        </button>

        <button
          type="button"
          onClick={onToggleQueue}
          aria-pressed={queueOpen}
          className={
            "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 " +
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
          onClick={() => router.push("/director/workbench/passages/import")}
          className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md bg-blue-600 px-3 text-xs font-bold text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
        >
          <UploadCloud className="size-3.5" aria-hidden="true" />
          자료 추출
        </button>
      </div>
    </div>
  );
}
