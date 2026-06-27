"use client";

import { ListFilter, X } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type {
  FilterOptions,
  PassageAnalysisStatusFilter,
} from "./generate-page-types";

interface PassageFilterPopoverProps {
  activeFilterCount: number;
  filterOptions: FilterOptions;
  filterSchool: string;
  setFilterSchool: (v: string) => void;
  filterGrade: string;
  setFilterGrade: (v: string) => void;
  filterSemester: string;
  setFilterSemester: (v: string) => void;
  analysisStatusFilter: PassageAnalysisStatusFilter;
  setAnalysisStatusFilter: (v: PassageAnalysisStatusFilter) => void;
  passageStatusCounts: { all: number; analyzed: number; unanalyzed: number };
}

/**
 * 지문 필터 팝오버(학교·학년·학기·분석상태). (passage-card-grid 에서 추출 — 동작 동일)
 */
export function PassageFilterPopover({
  activeFilterCount,
  filterOptions,
  filterSchool,
  setFilterSchool,
  filterGrade,
  setFilterGrade,
  filterSemester,
  setFilterSemester,
  analysisStatusFilter,
  setAnalysisStatusFilter,
  passageStatusCounts,
}: PassageFilterPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger
        title={
          activeFilterCount > 0 ? `필터 ${activeFilterCount}개 적용` : "필터"
        }
        aria-label="필터"
        className={`relative flex size-7 shrink-0 items-center justify-center rounded-md border shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=open]:border-blue-200 data-[state=open]:bg-blue-50 data-[state=open]:text-blue-700 ${
          activeFilterCount > 0
            ? "border-blue-200 bg-blue-50 text-blue-700"
            : "border-input bg-transparent text-slate-700 hover:bg-slate-50"
        }`}
      >
        <ListFilter className="size-3.5 shrink-0" aria-hidden="true" />
        {activeFilterCount > 0 ? (
          <span
            aria-hidden="true"
            className="absolute right-1 top-1 inline-block size-1.5 rounded-full bg-blue-500"
          />
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 p-3">
        <div className="flex flex-col gap-3">
          {filterOptions.schools.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium text-slate-600">
                학교
              </label>
              <select
                value={filterSchool}
                onChange={(e) => setFilterSchool(e.target.value)}
                className={`h-8 px-2.5 pr-6 rounded-md text-[12px] font-medium border appearance-none cursor-pointer transition-all ${
                  filterSchool
                    ? "bg-blue-50 text-blue-700 border-blue-300"
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                }`}
              >
                <option value="">학교 전체</option>
                {filterOptions.schools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {filterOptions.grades.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium text-slate-600">
                학년
              </label>
              <select
                value={filterGrade}
                onChange={(e) => setFilterGrade(e.target.value)}
                className={`h-8 px-2.5 pr-6 rounded-md text-[12px] font-medium border appearance-none cursor-pointer transition-all ${
                  filterGrade
                    ? "bg-blue-50 text-blue-700 border-blue-300"
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                }`}
              >
                <option value="">학년 전체</option>
                {filterOptions.grades.map((g) => (
                  <option key={g} value={g}>
                    {g}학년
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-slate-600">
              학기
            </label>
            <div className="flex gap-1 rounded-lg border border-slate-200 p-0.5 bg-slate-50">
              {[
                { value: "", label: "전체" },
                { value: "FIRST", label: "1학기" },
                { value: "SECOND", label: "2학기" },
              ].map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setFilterSemester(s.value)}
                  className={`h-6 flex-1 rounded-md text-[11px] font-medium transition-all ${
                    filterSemester === s.value
                      ? "bg-white text-blue-700 shadow-sm"
                      : "text-slate-400 hover:text-slate-600"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-slate-600">
              분석 상태
            </label>
            <div className="flex gap-1 rounded-lg border border-slate-200 p-0.5 bg-slate-50">
              {[
                {
                  value: "all" as const,
                  label: "전체",
                  count: passageStatusCounts.all,
                },
                {
                  value: "analyzed" as const,
                  label: "분석 완료",
                  count: passageStatusCounts.analyzed,
                },
                {
                  value: "unanalyzed" as const,
                  label: "미분석",
                  count: passageStatusCounts.unanalyzed,
                },
              ].map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setAnalysisStatusFilter(s.value)}
                  className={`h-6 flex-1 rounded-md text-[11px] font-medium transition-all ${
                    analysisStatusFilter === s.value
                      ? "bg-white text-blue-700 shadow-sm"
                      : "text-slate-400 hover:text-slate-600"
                  }`}
                >
                  {s.label}{" "}
                  <span className="text-[10px] opacity-70">
                    {s.count}
                  </span>
                </button>
              ))}
            </div>
          </div>
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={() => {
                setFilterSchool("");
                setFilterGrade("");
                setFilterSemester("");
                setAnalysisStatusFilter("all");
              }}
              className="flex items-center justify-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-700"
            >
              <X className="w-3 h-3" />
              초기화
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
