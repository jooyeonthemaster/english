// @ts-nocheck
"use client";

import React from "react";
import Link from "next/link";
import { Grid2x2, List, Plus, Search, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
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

interface Props {
  filters: Filters;
  schools: School[];
  searchValue: string;
  onSearchChange: (v: string) => void;
  onSearchSubmit: () => void;
  updateFilter: (key: string, value: string) => void;
  viewType: "grid" | "list";
  setViewType: (v: "grid" | "list") => void;
  onImportClick: () => void;
}

export function PassageFiltersToolbar({
  filters,
  schools,
  searchValue,
  onSearchChange,
  onSearchSubmit,
  updateFilter,
  viewType,
  setViewType,
  onImportClick,
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

      <Select
        value={filters.schoolId || "ALL"}
        onValueChange={(v) => updateFilter("schoolId", v)}
      >
        <SelectTrigger className="w-[112px] h-7 text-[11.5px] px-2.5">
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

      <Select
        value={filters.grade ? String(filters.grade) : "ALL"}
        onValueChange={(v) => updateFilter("grade", v)}
      >
        <SelectTrigger className="w-[80px] h-7 text-[11.5px] px-2.5">
          <SelectValue placeholder="학년" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">전체</SelectItem>
          <SelectItem value="1">1학년</SelectItem>
          <SelectItem value="2">2학년</SelectItem>
          <SelectItem value="3">3학년</SelectItem>
        </SelectContent>
      </Select>

      <div className="flex items-center gap-0.5 p-0.5 bg-slate-100 rounded-md">
        <button
          onClick={() => setViewType("grid")}
          className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${
            viewType === "grid"
              ? "bg-white shadow-sm"
              : "text-slate-400 hover:text-slate-600"
          }`}
          aria-label="그리드 보기"
        >
          <Grid2x2 className="w-3 h-3" />
        </button>
        <button
          onClick={() => setViewType("list")}
          className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${
            viewType === "list"
              ? "bg-white shadow-sm"
              : "text-slate-400 hover:text-slate-600"
          }`}
          aria-label="목록 보기"
        >
          <List className="w-3 h-3" />
        </button>
      </div>

      <span className="h-5 w-px bg-slate-200" />

      <Button
        variant="outline"
        size="sm"
        onClick={onImportClick}
        className="h-7 text-[11.5px] px-2.5"
      >
        <Upload className="w-3 h-3 mr-1" />
        일괄 등록
      </Button>
      <Link href="/director/workbench/passages/create">
        <Button
          size="sm"
          className="h-7 text-[11.5px] px-2.5 bg-blue-600 hover:bg-blue-700"
        >
          <Plus className="w-3 h-3 mr-1" />
          지문 등록
        </Button>
      </Link>
    </>
  );
}
