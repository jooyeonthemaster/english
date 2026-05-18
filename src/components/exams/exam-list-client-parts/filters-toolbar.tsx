"use client";

import Link from "next/link";
import { Grid2x2, List, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ClassOption } from "./types";

// ---------------------------------------------------------------------------
// FolderSection 의 toolbar 영역에 들어가는 검색/필터/뷰 토글 묶음
// ---------------------------------------------------------------------------

interface FiltersToolbarProps {
  search: string;
  setSearch: (v: string) => void;
  typeFilter: string;
  setTypeFilter: (v: string) => void;
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  classFilter: string;
  setClassFilter: (v: string) => void;
  viewType: "grid" | "list";
  setViewType: (v: "grid" | "list") => void;
  classes: ClassOption[];
}

export function FiltersToolbar({
  search,
  setSearch,
  typeFilter,
  setTypeFilter,
  statusFilter,
  setStatusFilter,
  classFilter,
  setClassFilter,
  viewType,
  setViewType,
  classes,
}: FiltersToolbarProps) {
  return (
    <>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300" />
        <input
          placeholder="검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setSearch("")}
          className="w-40 h-7 pl-7 pr-2.5 text-[11.5px] rounded-md border border-slate-200 bg-slate-50 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10"
        />
      </div>

      <Select value={typeFilter} onValueChange={setTypeFilter}>
        <SelectTrigger className="w-[88px] h-7 text-[11.5px] px-2.5">
          <SelectValue placeholder="유형" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">전체 유형</SelectItem>
          <SelectItem value="OFFLINE">오프라인</SelectItem>
          <SelectItem value="ONLINE">온라인</SelectItem>
          <SelectItem value="VOCAB">단어</SelectItem>
          <SelectItem value="MOCK">모의</SelectItem>
        </SelectContent>
      </Select>

      <Select value={statusFilter} onValueChange={setStatusFilter}>
        <SelectTrigger className="w-[88px] h-7 text-[11.5px] px-2.5">
          <SelectValue placeholder="상태" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">전체 상태</SelectItem>
          <SelectItem value="DRAFT">초안</SelectItem>
          <SelectItem value="PUBLISHED">배포됨</SelectItem>
          <SelectItem value="IN_PROGRESS">진행중</SelectItem>
          <SelectItem value="COMPLETED">완료</SelectItem>
          <SelectItem value="ARCHIVED">보관</SelectItem>
        </SelectContent>
      </Select>

      <Select value={classFilter} onValueChange={setClassFilter}>
        <SelectTrigger className="w-[96px] h-7 text-[11.5px] px-2.5">
          <SelectValue placeholder="반" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">전체 반</SelectItem>
          {classes.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-0.5 p-0.5 bg-slate-100 rounded-md">
        <button
          onClick={() => setViewType("grid")}
          className={cn(
            "w-6 h-6 rounded flex items-center justify-center transition-colors",
            viewType === "grid"
              ? "bg-white shadow-sm"
              : "text-slate-400 hover:text-slate-600",
          )}
          aria-label="그리드 보기"
        >
          <Grid2x2 className="w-3 h-3" />
        </button>
        <button
          onClick={() => setViewType("list")}
          className={cn(
            "w-6 h-6 rounded flex items-center justify-center transition-colors",
            viewType === "list"
              ? "bg-white shadow-sm"
              : "text-slate-400 hover:text-slate-600",
          )}
          aria-label="목록 보기"
        >
          <List className="w-3 h-3" />
        </button>
      </div>

      <span className="h-5 w-px bg-slate-200" />

      <Link href="/director/exams/create">
        <Button
          size="sm"
          className="h-7 text-[11.5px] px-2.5 bg-blue-600 hover:bg-blue-700"
        >
          <Plus className="w-3 h-3 mr-1" />
          시험 만들기
        </Button>
      </Link>
    </>
  );
}
