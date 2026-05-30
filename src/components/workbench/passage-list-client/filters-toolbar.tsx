// @ts-nocheck
"use client";

import React from "react";
import {
  ArrowUpDown,
  Copy,
  Grid2X2,
  Grid3X3,
  Layers3,
  List,
  ListFilter,
  Loader2,
  Search,
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

interface School {
  id: string;
  name: string;
  type: string;
  publisher: string | null;
}

interface Filters {
  schoolId?: string;
  grade?: number;
}

export type PassageSortOrder =
  | "newest"
  | "oldest"
  | "name_asc"
  | "name_desc";

export type PassageGridCols = "grid3" | "grid2" | "list";

interface Props {
  filters: Filters;
  schools: School[];
  searchValue: string;
  onSearchChange: (v: string) => void;
  onSearchSubmit: () => void;
  updateFilter: (key: string, value: string) => void;

  sortOrder: PassageSortOrder;
  onSortOrderChange: (v: PassageSortOrder) => void;

  // Duplicate controls — mirrors ManageFiltersBar's combined "중복 보기"
  // dropdown. pageMode === "duplicates" → grouped view; hideDuplicates → hide
  // non-first members from list view.
  pageMode: "list" | "duplicates";
  onTogglePageMode: () => void;
  hideDuplicates: boolean;
  onToggleHideDuplicates: () => void;
  duplicateGroupCount: number;
  totalDuplicateCount: number;
  duplicatesLoading?: boolean;

  gridCols: PassageGridCols;
  setGridCols: (v: PassageGridCols) => void;
}

function ViewToggleButton({
  active,
  middle,
  label,
  onClick,
  children,
}: {
  active: boolean;
  middle?: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={
        "p-2 cursor-pointer transition-colors " +
        (middle ? "border-x border-slate-200 " : "") +
        (active
          ? "bg-slate-800 text-white"
          : "text-slate-400 hover:bg-slate-50 hover:text-slate-600")
      }
    >
      {children}
    </button>
  );
}

export function PassageFiltersToolbar({
  filters,
  schools,
  searchValue,
  onSearchChange,
  onSearchSubmit,
  updateFilter,
  sortOrder,
  onSortOrderChange,
  pageMode,
  onTogglePageMode,
  hideDuplicates,
  onToggleHideDuplicates,
  duplicateGroupCount,
  totalDuplicateCount,
  duplicatesLoading = false,
  gridCols,
  setGridCols,
}: Props) {
  const duplicateMode =
    pageMode === "duplicates" ? "grouped" : hideDuplicates ? "hidden" : "all";

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

  const hasActiveFilter =
    (filters.schoolId && filters.schoolId !== "ALL") ||
    Boolean(filters.grade) ||
    sortOrder !== "newest" ||
    duplicateMode !== "all";

  return (
    <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
      <Popover>
        <PopoverTrigger
          title="필터"
          className="relative flex h-7 shrink-0 items-center gap-1 rounded-md border border-input bg-transparent px-2.5 text-[11.5px] shadow-xs transition-[color,box-shadow] outline-none hover:bg-slate-50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <ListFilter className="size-3 shrink-0" />
          <span>필터</span>
          {hasActiveFilter ? (
            <span
              aria-hidden="true"
              className="ml-0.5 inline-block size-1.5 rounded-full bg-blue-500"
            />
          ) : null}
        </PopoverTrigger>
        <PopoverContent align="end" className="w-56 p-3">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium text-slate-600">
                학교
              </label>
              <Select
                value={filters.schoolId || "ALL"}
                onValueChange={(v) => updateFilter("schoolId", v)}
              >
                <SelectTrigger className="h-8 w-full px-2.5 text-[12px]">
                  <SelectValue placeholder="학교" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">전체 학교</SelectItem>
                  {schools.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium text-slate-600">
                학년
              </label>
              <Select
                value={filters.grade ? String(filters.grade) : "ALL"}
                onValueChange={(v) => updateFilter("grade", v)}
              >
                <SelectTrigger className="h-8 w-full px-2.5 text-[12px]">
                  <SelectValue placeholder="학년" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">전체 학년</SelectItem>
                  <SelectItem value="1">1학년</SelectItem>
                  <SelectItem value="2">2학년</SelectItem>
                  <SelectItem value="3">3학년</SelectItem>
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
                  onSortOrderChange(v as PassageSortOrder)
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

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium text-slate-600">
                중복 보기
              </label>
              <Select
                value={duplicateMode}
                onValueChange={handleDuplicateModeChange}
              >
                <SelectTrigger className="h-8 w-full px-2.5 text-[12px]">
                  {duplicatesLoading ? (
                    <Loader2 className="mr-1 size-3 shrink-0 animate-spin" />
                  ) : duplicateMode === "grouped" ? (
                    <Layers3
                      className="mr-1 size-3 shrink-0"
                      aria-hidden="true"
                    />
                  ) : (
                    <Copy
                      className="mr-1 size-3 shrink-0"
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
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* 검색 */}
      <div className="relative shrink-0">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-300" />
        <input
          placeholder="지문 검색"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSearchSubmit()}
          className="h-7 w-40 rounded-md border border-slate-200 bg-slate-50 pl-7 pr-2.5 text-[11.5px] outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10"
        />
      </div>

      {/* 3-mode 뷰 토글 — matches ExtractionManage */}
      <div className="flex shrink-0 items-center overflow-hidden rounded-md border border-slate-200">
        <ViewToggleButton
          active={gridCols === "grid3"}
          label="3열 보기"
          onClick={() => setGridCols("grid3")}
        >
          <Grid3X3 className="size-4" />
        </ViewToggleButton>
        <ViewToggleButton
          active={gridCols === "grid2"}
          label="2열 보기"
          middle
          onClick={() => setGridCols("grid2")}
        >
          <Grid2X2 className="size-4" />
        </ViewToggleButton>
        <ViewToggleButton
          active={gridCols === "list"}
          label="목록 보기"
          onClick={() => setGridCols("list")}
        >
          <List className="size-4" />
        </ViewToggleButton>
      </div>

    </div>
  );
}
