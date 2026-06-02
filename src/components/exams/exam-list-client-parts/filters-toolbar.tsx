"use client";

import { ListFilter, Search, X } from "lucide-react";
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
import type { ClassOption } from "./types";

// ---------------------------------------------------------------------------
// 시험 관리 툴바 우측의 필터/검색 묶음.
// 문제 관리(question-bank-client/filters-toolbar)와 동일하게 아이콘 팝오버로
// 통일한다 — 필터 아이콘 팝오버 안에 유형/상태/반 셀렉트, 검색 아이콘 팝오버
// 안에 검색 입력을 담는다. 활성 상태일 때 아이콘 우상단에 파란 점 표시.
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
  classes,
}: FiltersToolbarProps) {
  const hasActiveFilter =
    typeFilter !== "ALL" || statusFilter !== "ALL" || classFilter !== "ALL";

  return (
    <>
      {/* 필터 */}
      <Popover>
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
        <PopoverContent align="end" className="w-64 p-3">
          <div className="flex flex-col gap-3">
            {/* 유형 */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium text-slate-600">
                유형
              </label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="h-8 w-full px-2.5 text-[12px]">
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
            </div>

            {/* 상태 */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium text-slate-600">
                상태
              </label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-8 w-full px-2.5 text-[12px]">
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
            </div>

            {/* 반 */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium text-slate-600">
                반
              </label>
              <Select value={classFilter} onValueChange={setClassFilter}>
                <SelectTrigger className="h-8 w-full px-2.5 text-[12px]">
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
            </div>

            {hasActiveFilter ? (
              <button
                type="button"
                onClick={() => {
                  setTypeFilter("ALL");
                  setStatusFilter("ALL");
                  setClassFilter("ALL");
                }}
                className="self-end text-[10.5px] text-slate-400 transition-colors hover:text-red-500"
              >
                필터 초기화
              </button>
            ) : null}
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
          {search ? (
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
                placeholder="제목으로 검색..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setSearch("")}
                className="h-8 w-full rounded-md border border-slate-200 bg-white pl-7 pr-7 text-[12px] text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10"
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch("")}
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
