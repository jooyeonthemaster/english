// @ts-nocheck
"use client";

import React, { useEffect, useState } from "react";
import {
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  ListFilter,
  Search,
  Star,
  X,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
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
import { TYPE_SUBTYPE_MAP } from "../question-type-filter";

interface Filters {
  type?: string;
  subType?: string;
  difficulty?: string;
  approved?: boolean;
  starred?: boolean;
  sort?: string;
}

interface Props {
  filters: Filters;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onSearchSubmit: () => void;
  updateFilter: (key: string, value: string) => void;
  updateFilters: (updates: Record<string, string>) => void;
}

export function QuestionFiltersToolbar({
  filters,
  searchValue,
  onSearchChange,
  onSearchSubmit,
  updateFilter,
  updateFilters,
}: Props) {
  const currentSubTypes = filters.subType?.split(",").filter(Boolean) || [];

  const [open, setOpen] = useState(false);
  const [typeSelected, setTypeSelected] = useState<Set<string>>(
    new Set(currentSubTypes),
  );
  const [collapsed, setCollapsed] = useState<Set<string>>(
    new Set(TYPE_SUBTYPE_MAP.map((g) => g.type)),
  );

  // Sync local type selection when the URL-driven filter changes externally.
  useEffect(() => {
    setTypeSelected(new Set(currentSubTypes));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSubTypes.join(",")]);

  function toggleSub(value: string) {
    setTypeSelected((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  function toggleGroup(group: (typeof TYPE_SUBTYPE_MAP)[number]) {
    const groupSubs = group.subtypes.map((s) => s.value);
    const allSelected = groupSubs.every((s) => typeSelected.has(s));
    setTypeSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) groupSubs.forEach((s) => next.delete(s));
      else groupSubs.forEach((s) => next.add(s));
      return next;
    });
  }

  function toggleCollapse(type: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  // Batch-apply the type selection (mirrors the old "적용" button) so each
  // checkbox toggle doesn't trigger a navigation. Committed when the popover
  // closes.
  function commitTypes(selectedSubs: string[]) {
    if (selectedSubs.length === 0) {
      updateFilters({ type: "ALL", subType: "ALL" });
      return;
    }
    const types = new Set<string>();
    for (const sub of selectedSubs) {
      const group = TYPE_SUBTYPE_MAP.find((g) =>
        g.subtypes.some((s) => s.value === sub),
      );
      if (group) types.add(group.type);
    }
    updateFilters({
      type: types.size > 0 ? [...types].join(",") : "ALL",
      subType: selectedSubs.join(","),
    });
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      const sel = [...typeSelected].sort().join(",");
      const cur = [...currentSubTypes].sort().join(",");
      if (sel !== cur) commitTypes([...typeSelected]);
    }
  }

  // 검수 상태(approved)는 별도 세그먼트 컨트롤이 소유하므로 팝오버의 활성
  // 표시에서는 제외한다.
  const hasActiveFilter =
    currentSubTypes.length > 0 ||
    Boolean(filters.difficulty) ||
    filters.starred === true ||
    (Boolean(filters.sort) && filters.sort !== "newest");

  return (
    <>
      <Popover open={open} onOpenChange={handleOpenChange}>
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
        <PopoverContent align="end" className="w-72 p-0">
          <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto p-3">
            {/* 유형 */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-medium text-slate-600">
                  유형
                </label>
                {typeSelected.size > 0 ? (
                  <button
                    type="button"
                    onClick={() => setTypeSelected(new Set())}
                    className="text-[10.5px] text-slate-400 transition-colors hover:text-red-500"
                  >
                    전체 해제
                  </button>
                ) : null}
              </div>
              <div className="max-h-[200px] overflow-y-auto rounded-md border border-slate-200 py-1">
                {TYPE_SUBTYPE_MAP.map((group) => {
                  const groupSubs = group.subtypes.map((s) => s.value);
                  const groupSelectedCount = groupSubs.filter((s) =>
                    typeSelected.has(s),
                  ).length;
                  const allGroupSelected =
                    groupSelectedCount === groupSubs.length;
                  const someGroupSelected = groupSelectedCount > 0;
                  const isCollapsed = collapsed.has(group.type);

                  return (
                    <div key={group.type}>
                      <div className="flex items-center gap-1.5 px-2 py-1.5 hover:bg-slate-50">
                        <button
                          type="button"
                          onClick={() => toggleCollapse(group.type)}
                          className="flex h-4 w-4 shrink-0 items-center justify-center"
                        >
                          {isCollapsed ? (
                            <ChevronRight className="h-3 w-3 text-slate-400" />
                          ) : (
                            <ChevronDown className="h-3 w-3 text-slate-400" />
                          )}
                        </button>
                        <Checkbox
                          checked={
                            allGroupSelected
                              ? true
                              : someGroupSelected
                                ? "indeterminate"
                                : false
                          }
                          onCheckedChange={() => toggleGroup(group)}
                          className="shrink-0"
                        />
                        <span
                          onClick={() => toggleGroup(group)}
                          className="flex-1 cursor-pointer select-none text-[12px] font-semibold text-slate-800"
                        >
                          {group.label}
                        </span>
                        {someGroupSelected ? (
                          <span className="text-[10px] font-medium text-blue-500">
                            {groupSelectedCount}/{groupSubs.length}
                          </span>
                        ) : null}
                      </div>

                      {!isCollapsed ? (
                        <div className="ml-5">
                          {group.subtypes.map((sub) => (
                            <label
                              key={sub.value}
                              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-slate-50"
                            >
                              <Checkbox
                                checked={typeSelected.has(sub.value)}
                                onCheckedChange={() => toggleSub(sub.value)}
                                className="shrink-0"
                              />
                              <span
                                className={`select-none text-[12px] ${
                                  typeSelected.has(sub.value)
                                    ? "font-medium text-blue-700"
                                    : "text-slate-600"
                                }`}
                              >
                                {sub.label}
                              </span>
                            </label>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 난이도 */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium text-slate-600">
                난이도
              </label>
              <Select
                value={filters.difficulty || "ALL"}
                onValueChange={(v) => updateFilter("difficulty", v)}
              >
                <SelectTrigger className="h-8 w-full px-2.5 text-[12px]">
                  <SelectValue placeholder="난이도" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">전체 난이도</SelectItem>
                  <SelectItem value="BASIC">기본</SelectItem>
                  <SelectItem value="INTERMEDIATE">중급</SelectItem>
                  <SelectItem value="KILLER">킬러</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* 정렬 */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium text-slate-600">
                정렬
              </label>
              <Select
                value={filters.sort || "newest"}
                onValueChange={(v) =>
                  updateFilter("sort", v === "newest" ? "ALL" : v)
                }
              >
                <SelectTrigger className="h-8 w-full px-2.5 text-[12px]">
                  <ArrowUpDown className="mr-1 size-3 shrink-0" />
                  <SelectValue placeholder="정렬" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">최신순</SelectItem>
                  <SelectItem value="oldest">오래된순</SelectItem>
                  <SelectItem value="difficulty_desc">난이도 높은순</SelectItem>
                  <SelectItem value="difficulty_asc">난이도 낮은순</SelectItem>
                  <SelectItem value="starred">중요 문제 먼저</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* 중요 */}
            <button
              type="button"
              onClick={() =>
                updateFilter(
                  "starred",
                  filters.starred === true ? "ALL" : "true",
                )
              }
              aria-label="중요 문제 필터"
              aria-pressed={filters.starred === true}
              className={`flex h-8 items-center justify-center gap-1.5 rounded-md border text-[12px] font-medium transition-colors ${
                filters.starred === true
                  ? "border-yellow-300 bg-yellow-50 text-yellow-700"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800"
              }`}
            >
              <Star
                className={`h-3.5 w-3.5 ${
                  filters.starred === true
                    ? "fill-yellow-400 text-yellow-500"
                    : ""
                }`}
              />
              중요 문제만
            </button>
          </div>
        </PopoverContent>
      </Popover>

      {/* 검색 */}
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
              검색
            </label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                autoFocus
                placeholder="검색..."
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
    </>
  );
}
