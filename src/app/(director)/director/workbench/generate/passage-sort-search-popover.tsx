"use client";

import { Check, ListFilter, Search, X } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { PassageSortOrder } from "./generate-page-types";

interface PassageSortSearchPopoverProps {
  passageSortOrder: PassageSortOrder;
  setPassageSortOrder?: (v: PassageSortOrder) => void;
  passageSearch: string;
  setPassageSearch: (v: string) => void;
}

/**
 * 폴더 헤더 우측의 정렬·검색 팝오버 2개. (passage-card-grid 에서 추출 — 동작 동일)
 * setPassageSortOrder 가 없으면 렌더하지 않는다(원본 안쪽 게이트 보존).
 */
export function PassageSortSearchPopover({
  passageSortOrder,
  setPassageSortOrder,
  passageSearch,
  setPassageSearch,
}: PassageSortSearchPopoverProps) {
  return setPassageSortOrder ? (
    <>
      <Popover>
        <PopoverTrigger
          title="정렬"
          aria-label="정렬"
          className="relative flex size-7 shrink-0 items-center justify-center rounded-md border border-input bg-transparent text-slate-700 shadow-xs transition-[color,box-shadow] outline-none hover:bg-slate-50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=open]:border-blue-200 data-[state=open]:bg-blue-50 data-[state=open]:text-blue-700"
        >
          <ListFilter className="size-3.5 shrink-0" aria-hidden="true" />
          {passageSortOrder !== "newest" ? (
            <span
              aria-hidden="true"
              className="absolute right-1 top-1 inline-block size-1.5 rounded-full bg-blue-500"
            />
          ) : null}
        </PopoverTrigger>
        <PopoverContent align="end" className="w-44 p-1.5">
          <div className="flex flex-col gap-0.5">
            <span className="px-2 py-1 text-[11px] font-medium text-slate-400">
              정렬
            </span>
            {(
              [
                { value: "newest", label: "최신순" },
                { value: "oldest", label: "오래된순" },
                { value: "name_asc", label: "이름 오름차순" },
                { value: "name_desc", label: "이름 내림차순" },
              ] as { value: PassageSortOrder; label: string }[]
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPassageSortOrder?.(opt.value)}
                className={
                  "flex items-center justify-between rounded-md px-2 py-1.5 text-left text-[12px] transition-colors " +
                  (passageSortOrder === opt.value
                    ? "bg-blue-50 font-medium text-blue-700"
                    : "text-slate-600 hover:bg-slate-50")
                }
              >
                {opt.label}
                {passageSortOrder === opt.value ? (
                  <Check className="size-3.5 shrink-0" aria-hidden="true" />
                ) : null}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger
          title="검색"
          aria-label="검색"
          className={
            "relative flex size-7 shrink-0 items-center justify-center rounded-md border shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=open]:border-blue-200 data-[state=open]:bg-blue-50 data-[state=open]:text-blue-700 " +
            (passageSearch
              ? "border-blue-200 bg-blue-50 text-blue-700"
              : "border-input bg-transparent text-slate-700 hover:bg-slate-50")
          }
        >
          <Search className="size-3.5 shrink-0" aria-hidden="true" />
          {passageSearch ? (
            <span
              aria-hidden="true"
              className="absolute right-1 top-1 inline-block size-1.5 rounded-full bg-blue-500"
            />
          ) : null}
        </PopoverTrigger>
        <PopoverContent align="end" className="w-60 p-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-slate-600">
              지문 검색
            </label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                autoFocus
                placeholder="지문 제목 또는 내용 검색..."
                value={passageSearch}
                onChange={(e) => setPassageSearch(e.target.value)}
                className="h-8 w-full rounded-md border border-slate-200 bg-white pl-7 pr-7 text-[12px] text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10"
              />
              {passageSearch ? (
                <button
                  type="button"
                  onClick={() => setPassageSearch("")}
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
  ) : null;
}
