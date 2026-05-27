// @ts-nocheck
"use client";

import React from "react";
import { ArrowUpDown, Search, Star } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TypeFilterPopover, TYPE_SUBTYPE_MAP } from "../question-type-filter";

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
  return (
    <>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300" />
        <input
          placeholder="검색..."
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSearchSubmit()}
          className="w-40 h-7 pl-7 pr-2.5 text-[11.5px] rounded-md border border-slate-200 bg-slate-50 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10"
        />
      </div>

      <TypeFilterPopover
        currentSubTypes={filters.subType?.split(",").filter(Boolean) || []}
        onApply={(selectedSubs) => {
          if (selectedSubs.length === 0) {
            updateFilters({ type: "ALL", subType: "ALL" });
          } else {
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
        }}
      />

      <Select
        value={filters.difficulty || "ALL"}
        onValueChange={(v) => updateFilter("difficulty", v)}
      >
        <SelectTrigger className="w-[88px] h-7 text-[11.5px] px-2.5">
          <SelectValue placeholder="난이도" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">전체 난이도</SelectItem>
          <SelectItem value="BASIC">기본</SelectItem>
          <SelectItem value="INTERMEDIATE">중급</SelectItem>
          <SelectItem value="KILLER">킬러</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={
          filters.approved === true
            ? "true"
            : filters.approved === false
              ? "false"
              : "ALL"
        }
        onValueChange={(v) => updateFilter("approved", v)}
      >
        <SelectTrigger className="w-[88px] h-7 text-[11.5px] px-2.5">
          <SelectValue placeholder="상태" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">전체 상태</SelectItem>
          <SelectItem value="true">검수완료</SelectItem>
          <SelectItem value="false">미검수</SelectItem>
        </SelectContent>
      </Select>

      <button
        onClick={() => {
          if (filters.starred === true) updateFilter("starred", "ALL");
          else updateFilter("starred", "true");
        }}
        className={`flex items-center gap-1 h-7 px-2 text-[11.5px] font-medium rounded-md border transition-colors ${
          filters.starred === true
            ? "bg-yellow-50 border-yellow-300 text-yellow-700"
            : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
        }`}
        aria-label="중요 문제 필터"
        aria-pressed={filters.starred === true}
      >
        <Star
          className={`w-3 h-3 ${filters.starred === true ? "fill-yellow-400 text-yellow-500" : ""}`}
        />
        중요
      </button>

      <Select
        value={filters.sort || "newest"}
        onValueChange={(v) => updateFilter("sort", v === "newest" ? "ALL" : v)}
      >
        <SelectTrigger className="w-[108px] h-7 text-[11.5px] px-2.5">
          <ArrowUpDown className="w-3 h-3 mr-1 shrink-0" />
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
    </>
  );
}
