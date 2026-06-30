// @ts-nocheck
"use client";

import React, { useEffect, useState } from "react";
import {
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
import { TYPE_SUBTYPE_MAP } from "../question-type-filter";
import { useSearchDebounce } from "@/hooks/use-search-debounce";

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
  /** value 가 주어지면 그 값으로(없으면 현재 입력값으로) 검색을 커밋한다. */
  onSearchSubmit: (value?: string) => void;
  updateFilter: (key: string, value: string) => void;
  updateFilters: (updates: Record<string, string>) => void;
  /** 필터 팝오버 맨 위에 끼워 넣을 추가 컨트롤(전체 선택·검수 상태·보기 등). */
  popoverExtra?: React.ReactNode;
}

export function QuestionFiltersToolbar({
  filters,
  searchValue,
  onSearchChange,
  onSearchSubmit,
  updateFilter,
  updateFilters,
  popoverExtra,
}: Props) {
  const currentSubTypes = filters.subType?.split(",").filter(Boolean) || [];

  // 타이핑 즉시(라이브) 검색 — 입력 멈추면 커밋, Enter·지우기는 즉시 커밋.
  const { schedule, flush } = useSearchDebounce((v) => onSearchSubmit(v));

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
    const next = new Set(typeSelected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    // 즉시 반영: 체크박스 즉답(optimistic) + 필터 커밋을 같은 토글에서 함께 한다.
    setTypeSelected(next);
    commitTypes([...next]);
  }

  function toggleGroup(group: (typeof TYPE_SUBTYPE_MAP)[number]) {
    const groupSubs = group.subtypes.map((s) => s.value);
    const allSelected = groupSubs.every((s) => typeSelected.has(s));
    const next = new Set(typeSelected);
    if (allSelected) groupSubs.forEach((s) => next.delete(s));
    else groupSubs.forEach((s) => next.add(s));
    setTypeSelected(next);
    commitTypes([...next]);
  }

  function toggleCollapse(type: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  // Apply the type selection on each toggle so the filter takes effect
  // immediately (no "적용" button / popover-close required), matching the
  // 난이도·정렬·중요 controls below.
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

  // 유형 선택은 토글 즉시 commitTypes 로 반영되므로, 팝오버 열림/닫힘은
  // 더 이상 커밋 경로가 아니다 — 단순히 열림 상태만 관리한다.
  function handleOpenChange(next: boolean) {
    setOpen(next);
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
            {/* 외부에서 끼워 넣은 추가 컨트롤(전체 선택·검수 상태·보기) */}
            {popoverExtra ? (
              <div className="flex flex-col gap-2 border-b border-slate-100 pb-3">
                {popoverExtra}
              </div>
            ) : null}
            {/* 유형 */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-medium text-slate-600">
                  유형
                </label>
                {typeSelected.size > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      setTypeSelected(new Set());
                      commitTypes([]);
                    }}
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

            {/* 난이도 — 토글 버튼 그룹 */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium text-slate-600">
                난이도
              </label>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    { value: "ALL", label: "전체" },
                    { value: "BASIC", label: "기본" },
                    { value: "INTERMEDIATE", label: "중급" },
                    { value: "KILLER", label: "킬러" },
                  ] as const
                ).map((opt) => {
                  const active = (filters.difficulty || "ALL") === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => updateFilter("difficulty", opt.value)}
                      className={`flex h-7 items-center rounded-md border px-2.5 text-[11px] font-medium transition-colors ${
                        active
                          ? "border-slate-800 bg-slate-800 text-white"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 정렬 — 토글 버튼 그룹 */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium text-slate-600">
                정렬
              </label>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    { value: "newest", label: "최신순" },
                    { value: "oldest", label: "오래된순" },
                    { value: "difficulty_desc", label: "난이도 높은순" },
                    { value: "difficulty_asc", label: "난이도 낮은순" },
                    { value: "starred", label: "중요 먼저" },
                  ] as const
                ).map((opt) => {
                  const currentSort =
                    !filters.sort || filters.sort === "ALL"
                      ? "newest"
                      : filters.sort;
                  const active = currentSort === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        updateFilter(
                          "sort",
                          opt.value === "newest" ? "ALL" : opt.value,
                        )
                      }
                      className={`flex h-7 items-center rounded-md border px-2.5 text-[11px] font-medium transition-colors ${
                        active
                          ? "border-slate-800 bg-slate-800 text-white"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
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
                    // 입력값 비우기 + 빈 검색을 즉시 커밋 — 안 그러면 검색
                    // 결과 목록(URL/필터 구동)이 그대로 남는다.
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
    </>
  );
}
