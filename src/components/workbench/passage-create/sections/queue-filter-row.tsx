"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface QueueFilterRowProps {
  filterSchool: string;
  setFilterSchool: (v: string) => void;
  filterGrade: string;
  setFilterGrade: (v: string) => void;
  filterSemester: string;
  setFilterSemester: (v: string) => void;
  filterPublisher: string;
  setFilterPublisher: (v: string) => void;
  filterOptions: {
    schoolNames: string[];
    grades: number[];
    publishers: string[];
  };
  hasActiveFilters: boolean;
  onResetFilters: () => void;
}

export function QueueFilterRow({
  filterSchool,
  setFilterSchool,
  filterGrade,
  setFilterGrade,
  filterSemester,
  setFilterSemester,
  filterPublisher,
  setFilterPublisher,
  filterOptions,
  hasActiveFilters,
  onResetFilters,
}: QueueFilterRowProps) {
  return (
    <div className="flex items-center gap-3 mb-3 px-3 py-2.5 rounded-lg bg-slate-50 border border-slate-200">
      <Select value={filterSchool} onValueChange={(v) => setFilterSchool(v === "ALL" ? "" : v)}>
        <SelectTrigger className="w-36 h-8 text-[12px] bg-white"><SelectValue placeholder="학교" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">전체 학교</SelectItem>
          {filterOptions.schoolNames.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={filterGrade} onValueChange={(v) => setFilterGrade(v === "ALL" ? "" : v)}>
        <SelectTrigger className="w-28 h-8 text-[12px] bg-white"><SelectValue placeholder="학년" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">전체 학년</SelectItem>
          {filterOptions.grades.map((g) => <SelectItem key={g} value={String(g)}>{g}학년</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={filterSemester} onValueChange={(v) => setFilterSemester(v === "ALL" ? "" : v)}>
        <SelectTrigger className="w-28 h-8 text-[12px] bg-white"><SelectValue placeholder="학기" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">전체 학기</SelectItem>
          <SelectItem value="FIRST">1학기</SelectItem>
          <SelectItem value="SECOND">2학기</SelectItem>
        </SelectContent>
      </Select>
      <Select value={filterPublisher} onValueChange={(v) => setFilterPublisher(v === "ALL" ? "" : v)}>
        <SelectTrigger className="w-32 h-8 text-[12px] bg-white"><SelectValue placeholder="출판사" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">전체 출판사</SelectItem>
          {filterOptions.publishers.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
        </SelectContent>
      </Select>
      {hasActiveFilters && (
        <button
          onClick={onResetFilters}
          className="text-[11px] text-blue-600 font-medium hover:text-blue-700"
        >
          필터 초기화
        </button>
      )}
    </div>
  );
}
