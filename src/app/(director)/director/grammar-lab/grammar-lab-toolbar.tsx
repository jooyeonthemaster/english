"use client";

// ============================================================================
// 어법 훈련 현황 툴바 — 검색 · 이력/정체 토글 · 반/학년 칩 · 선택 액션 · CSV.
//
// 필터 상태는 부모(grammar-lab-list-client)가 소유한다(클라 필터 — 서버
// 재조회 없음). 반/학년 칩은 rows 에 실존하는 값만 도출해 렌더한다.
// ============================================================================

import { type ReactNode } from "react";
import { Download, Search } from "lucide-react";

import type { GrammarLabStudentRow } from "@/actions/grammar-drill-admin";
import { cn } from "@/lib/utils";

/** 반 필터 값 — null=전체, "UNASSIGNED"=미배정, 그 외 class id */
export type ClassFilter = string | null;
export const UNASSIGNED_CLASS = "UNASSIGNED";

export interface ClassOption {
  id: string;
  name: string;
  count: number;
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "h-7 whitespace-nowrap rounded-full border px-3 text-[12px] font-semibold transition-colors",
        active
          ? "border-blue-600 bg-blue-50/40 text-blue-700 shadow-sm"
          : "border-transparent text-slate-400 hover:bg-slate-50 hover:text-slate-600",
      )}
    >
      {children}
    </button>
  );
}

// ── CSV 내보내기 — 현재 필터 결과(클라 보유 rows) 그대로 ────────────────────

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function exportCsv(rows: GrammarLabStudentRow[]) {
  const header = [
    "이름",
    "학년",
    "학생코드",
    "반",
    "누적 풀이",
    "정답률(%)",
    "마스터 유닛",
    "진입 유닛",
    "취약 개념",
    "취약 개념 숙달도",
    "미완료 배정",
    "최근 학습",
  ];
  const lines = rows.map((s) => [
    s.name,
    String(s.grade),
    s.studentCode,
    s.classes.map((c) => c.name).join(" / "),
    String(s.totalAttempts),
    s.accuracy === null ? "" : String(s.accuracy),
    String(s.unitsMastered),
    String(s.unitsStarted),
    s.weakest?.title ?? "",
    s.weakest ? String(s.weakest.score) : "",
    String(s.openAssignments),
    s.lastActiveAt
      ? new Date(s.lastActiveAt).toLocaleString("ko-KR", {
          timeZone: "Asia/Seoul",
        })
      : "",
  ]);
  const csv = [header, ...lines]
    .map((cols) => cols.map(csvCell).join(","))
    .join("\r\n");
  // 서울 기준 YYMMDD 파일명 — UTF-8 BOM(엑셀 한글 호환)
  const seoul = new Date(Date.now() + 9 * 3600_000);
  const yymmdd = `${String(seoul.getUTCFullYear()).slice(2)}${String(seoul.getUTCMonth() + 1).padStart(2, "0")}${String(seoul.getUTCDate()).padStart(2, "0")}`;
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `어법훈련현황_${yymmdd}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function GrammarLabToolbar({
  query,
  onQueryChange,
  onlyActive,
  onOnlyActiveChange,
  stalledOnly,
  onStalledOnlyChange,
  classOptions,
  unassignedCount,
  classFilter,
  onClassFilterChange,
  grades,
  gradeFilter,
  onGradeFilterChange,
  resultRows,
  selectedCount,
  onAssignSelected,
  onClearSelection,
}: {
  query: string;
  onQueryChange: (v: string) => void;
  onlyActive: boolean;
  onOnlyActiveChange: (v: boolean) => void;
  stalledOnly: boolean;
  onStalledOnlyChange: (v: boolean) => void;
  classOptions: ClassOption[];
  unassignedCount: number;
  classFilter: ClassFilter;
  onClassFilterChange: (v: ClassFilter) => void;
  /** rows 에 실존하는 학년만 — 1종이면 칩 행 미표시 */
  grades: number[];
  gradeFilter: number | null;
  onGradeFilterChange: (v: number | null) => void;
  /** 현재 필터 결과 — 카운트 표시·CSV 내보내기 대상 */
  resultRows: GrammarLabStudentRow[];
  selectedCount: number;
  onAssignSelected: () => void;
  onClearSelection: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 border-b border-slate-100 px-4 py-2.5">
      {/* 검색 · 토글 · 우측 카운트/선택 액션/CSV */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex h-8 w-60 items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 focus-within:border-blue-400">
          <Search className="size-3.5 shrink-0 text-slate-400" aria-hidden />
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="이름 · 학생코드 검색"
            className="w-full bg-transparent text-[13px] text-slate-700 outline-none placeholder:text-slate-300"
          />
        </div>
        <label className="flex cursor-pointer items-center gap-1.5 text-[12.5px] font-medium text-slate-500">
          <input
            type="checkbox"
            checked={onlyActive}
            onChange={(e) => onOnlyActiveChange(e.target.checked)}
            className="size-3.5 accent-blue-600"
          />
          학습 이력 있는 학생만
        </label>
        <button
          type="button"
          onClick={() => onStalledOnlyChange(!stalledOnly)}
          aria-pressed={stalledOnly}
          className={cn(
            "h-7 whitespace-nowrap rounded-full border px-3 text-[12px] font-semibold transition-colors",
            stalledOnly
              ? "border-rose-300 bg-rose-50 text-rose-700 shadow-sm"
              : "border-transparent text-slate-400 hover:bg-slate-50 hover:text-slate-600",
          )}
        >
          정체 학생만
        </button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {selectedCount > 0 ? (
            <>
              <span className="text-[12px] font-semibold tabular-nums text-blue-700">
                {selectedCount}명 선택
              </span>
              <button
                type="button"
                onClick={onAssignSelected}
                className="inline-flex h-7 items-center rounded-md bg-blue-600 px-2.5 text-[12px] font-semibold text-white transition-colors hover:bg-blue-700"
              >
                어법 과제 만들기
              </button>
              <button
                type="button"
                onClick={onClearSelection}
                className="text-[12px] font-medium text-slate-400 transition-colors hover:text-slate-600"
              >
                선택 해제
              </button>
              <div className="h-4 w-px bg-slate-200" aria-hidden />
            </>
          ) : null}
          <span className="text-[12px] tabular-nums text-slate-400">
            {resultRows.length}명
          </span>
          <button
            type="button"
            onClick={() => exportCsv(resultRows)}
            disabled={resultRows.length === 0}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-[12px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Download className="size-3.5" aria-hidden />
            CSV
          </button>
        </div>
      </div>

      {/* 반 칩 필터 — 반이 하나도 없으면 행 자체를 숨긴다 */}
      {classOptions.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-1 text-[11px] font-semibold text-slate-400">반</span>
          <FilterChip
            active={classFilter === null}
            onClick={() => onClassFilterChange(null)}
          >
            전체 반
          </FilterChip>
          <FilterChip
            active={classFilter === UNASSIGNED_CLASS}
            onClick={() =>
              onClassFilterChange(
                classFilter === UNASSIGNED_CLASS ? null : UNASSIGNED_CLASS,
              )
            }
          >
            미배정
            <span className="ml-1 text-[11px] tabular-nums opacity-70">
              {unassignedCount}
            </span>
          </FilterChip>
          {classOptions.map((c) => (
            <FilterChip
              key={c.id}
              active={classFilter === c.id}
              onClick={() =>
                onClassFilterChange(classFilter === c.id ? null : c.id)
              }
            >
              {c.name}
              <span className="ml-1 text-[11px] tabular-nums opacity-70">
                {c.count}
              </span>
            </FilterChip>
          ))}
        </div>
      ) : null}

      {/* 학년 칩 필터 — 실존 학년 1종이면 미표시 */}
      {grades.length >= 2 ? (
        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-1 text-[11px] font-semibold text-slate-400">학년</span>
          <FilterChip
            active={gradeFilter === null}
            onClick={() => onGradeFilterChange(null)}
          >
            전체 학년
          </FilterChip>
          {grades.map((g) => (
            <FilterChip
              key={g}
              active={gradeFilter === g}
              onClick={() => onGradeFilterChange(gradeFilter === g ? null : g)}
            >
              {g}학년
            </FilterChip>
          ))}
        </div>
      ) : null}
    </div>
  );
}
