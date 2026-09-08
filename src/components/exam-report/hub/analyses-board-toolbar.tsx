"use client";

// ============================================================================
// 학생 시험 리포트 — 분석 현황 보드 툴바 팝오버(필터·검색)
//
// analyses-board.tsx 에서 **자구 그대로** 이사(26-09-02, 파일 500줄 상한 — v4
// 2그룹 렌더가 들어오며 컨테이너가 넘쳤다). 상태 필터 칩·검색 입력의 마크업과
// 클래스는 이전과 동일하며 상태(query·filter)는 여전히 컨테이너가 소유한다.
// 허브·스튜디오 양쪽이 이 툴바를 그대로 쓴다(시각 무회귀).
// ============================================================================

import { ListFilter, Search, X } from "lucide-react";
import type { ExamAnalysisStatus } from "@/lib/exam-report/types";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export type StatusFilter = "all" | "analyzing" | "analyzed" | "failed" | "draft";

export const FILTER_CHIPS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "analyzing", label: "분석 중" },
  { key: "analyzed", label: "완료" },
  { key: "failed", label: "실패" },
  { key: "draft", label: "임시" },
];

export const FILTER_STATUS: Record<
  Exclude<StatusFilter, "all">,
  ExamAnalysisStatus
> = {
  analyzing: "ANALYZING",
  analyzed: "ANALYZED",
  failed: "FAILED",
  draft: "DRAFT",
};

const TRIGGER_CLASS =
  "relative flex size-7 shrink-0 items-center justify-center rounded-md border border-input bg-transparent text-slate-700 shadow-xs transition-[color,box-shadow] outline-none hover:bg-slate-50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=open]:border-blue-200 data-[state=open]:bg-blue-50 data-[state=open]:text-blue-700";

/** 필터 — 상태 선택(개수 포함) */
export function BoardFilterPopover({
  filter,
  counts,
  onChange,
}: {
  filter: StatusFilter;
  counts: Record<StatusFilter, number>;
  onChange: (next: StatusFilter) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger
        title="필터"
        aria-label="필터"
        className={cn(TRIGGER_CLASS, filter !== "all" && "border-blue-200 bg-blue-50 text-blue-700")}
      >
        <ListFilter className="size-3.5 shrink-0" />
        {filter !== "all" ? (
          <span
            aria-hidden="true"
            className="absolute top-1 right-1 inline-block size-1.5 rounded-full bg-blue-500"
          />
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-medium text-slate-600">
            상태
          </label>
          <div className="flex flex-wrap gap-1.5">
            {FILTER_CHIPS.map((chip) => {
              const active = filter === chip.key;
              return (
                <button
                  key={chip.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onChange(chip.key)}
                  className={cn(
                    "flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-medium transition-colors",
                    active
                      ? "border-slate-800 bg-slate-800 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800",
                  )}
                >
                  {chip.label}
                  <span
                    className={cn(
                      "text-[10px] tabular-nums",
                      active ? "text-slate-300" : "text-slate-400",
                    )}
                  >
                    {counts[chip.key]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** 검색 — 제목·학교(로컬 즉시 필터) */
export function BoardSearchPopover({
  query,
  onChange,
}: {
  query: string;
  onChange: (next: string) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger
        title="검색"
        aria-label="검색"
        className={cn(TRIGGER_CLASS, query && "border-blue-200 bg-blue-50 text-blue-700")}
      >
        <Search className="size-3.5 shrink-0" />
        {query ? (
          <span
            aria-hidden="true"
            className="absolute top-1 right-1 inline-block size-1.5 rounded-full bg-blue-500"
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
              className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              autoFocus
              placeholder="제목 · 학교 검색"
              value={query}
              onChange={(e) => onChange(e.target.value)}
              className="h-8 w-full rounded-md border border-slate-200 bg-white pr-7 pl-7 text-[12px] text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10"
            />
            {query ? (
              <button
                type="button"
                onClick={() => onChange("")}
                className="absolute top-1/2 right-1.5 inline-flex size-4 -translate-y-1/2 cursor-pointer items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="검색 지우기"
              >
                <X className="size-3" />
              </button>
            ) : null}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
