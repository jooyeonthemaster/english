// @ts-nocheck
"use client";

import React from "react";
import { ChevronRight, Loader2, Search } from "lucide-react";
import type { FilterOptions, PassageItem } from "./types";

interface Props {
  passages: PassageItem[];
  loading: boolean;
  filterOptions: FilterOptions;
  passageSearch: string;
  setPassageSearch: (v: string) => void;
  filterSchool: string;
  setFilterSchool: (v: string) => void;
  filterGrade: string;
  setFilterGrade: (v: string) => void;
  filterSemester: string;
  setFilterSemester: (v: string) => void;
  onSelect: (p: PassageItem) => void;
}

export function PassageSelectStep({
  passages,
  loading,
  filterOptions,
  passageSearch,
  setPassageSearch,
  filterSchool,
  setFilterSchool,
  filterGrade,
  setFilterGrade,
  filterSemester,
  setFilterSemester,
  onSelect,
}: Props) {
  const filteredPassages = passages.filter((p) => {
    if (passageSearch) {
      const q = passageSearch.toLowerCase();
      if (!p.title.toLowerCase().includes(q) && !p.content.toLowerCase().includes(q)) return false;
    }
    if (filterSchool && p.school?.id !== filterSchool) return false;
    if (filterGrade && p.grade !== Number(filterGrade)) return false;
    if (filterSemester && p.semester !== filterSemester) return false;
    return true;
  });

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
        <input
          placeholder="지문 제목 또는 내용으로 검색..."
          value={passageSearch}
          onChange={(e) => setPassageSearch(e.target.value)}
          className="w-full h-10 pl-10 pr-4 text-[13px] rounded-xl border border-slate-200 bg-slate-50 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 placeholder:text-slate-300"
          autoFocus
        />
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        {/* School filter */}
        {filterOptions.schools.length > 0 && (
          <select
            value={filterSchool}
            onChange={(e) => setFilterSchool(e.target.value)}
            className={`h-8 px-3 pr-7 rounded-full text-[12px] font-medium border appearance-none cursor-pointer transition-all ${
              filterSchool ? "bg-blue-50 text-blue-700 border-blue-300" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
            }`}
            style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239CA3AF' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 8px center" }}
          >
            <option value="">학교 전체</option>
            {filterOptions.schools.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}

        {/* Grade filter */}
        {filterOptions.grades.length > 0 && (
          <select
            value={filterGrade}
            onChange={(e) => setFilterGrade(e.target.value)}
            className={`h-8 px-3 pr-7 rounded-full text-[12px] font-medium border appearance-none cursor-pointer transition-all ${
              filterGrade ? "bg-blue-50 text-blue-700 border-blue-300" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
            }`}
            style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239CA3AF' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 8px center" }}
          >
            <option value="">학년 전체</option>
            {filterOptions.grades.map((g) => (
              <option key={g} value={g}>{g}학년</option>
            ))}
          </select>
        )}

        {/* Semester filter */}
        <div className="flex gap-1">
          {[
            { value: "", label: "전체" },
            { value: "FIRST", label: "1학기" },
            { value: "SECOND", label: "2학기" },
          ].map((s) => (
            <button
              key={s.value}
              onClick={() => setFilterSemester(s.value)}
              className={`h-8 px-3 rounded-full text-[12px] font-medium border transition-all ${
                filterSemester === s.value
                  ? "bg-blue-50 text-blue-700 border-blue-300"
                  : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Result count */}
        <span className="text-[11px] text-slate-400 ml-auto">
          {filteredPassages.length}개 지문
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
        </div>
      ) : filteredPassages.length === 0 ? (
        <div className="text-center py-12 text-sm text-slate-400">
          등록된 지문이 없습니다. 먼저 지문을 등록해주세요.
        </div>
      ) : (
        <div className="space-y-1.5 max-h-[380px] overflow-y-auto">
          {filteredPassages.map((p) => (
            <button
              key={p.id}
              onClick={() => onSelect(p)}
              className="w-full text-left px-3 py-2.5 rounded-lg border border-transparent hover:border-blue-200 hover:bg-blue-50/40 transition-all group"
            >
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold text-slate-800 group-hover:text-blue-700 transition-colors flex-1 truncate">
                  {p.title}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  {p.school && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-medium">
                      {p.school.name}
                    </span>
                  )}
                  {p.grade && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-medium">
                      {p.grade}학년
                    </span>
                  )}
                  {p.semester && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-medium">
                      {p.semester === "FIRST" ? "1학기" : "2학기"}
                    </span>
                  )}
                  {p.unit && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-500 font-medium">
                      {p.unit}
                    </span>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-slate-200 group-hover:text-blue-400 shrink-0" />
              </div>
              <p className="text-[11px] text-slate-400 mt-1 line-clamp-1">
                {p.content.slice(0, 150)}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
