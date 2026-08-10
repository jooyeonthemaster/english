"use client";

// ============================================================================
// 어법 훈련 현황 툴바 — 검색 · 이력/정체 토글 · 반/학년 칩 · 선택 액션 · CSV.
//
// 필터 상태는 부모(grammar-lab-list-client)가 소유한다(클라 필터 — 서버
// 재조회 없음). 반/학년 칩은 rows 에 실존하는 값만 도출해 렌더한다.
// ============================================================================

import { type ReactNode } from "react";
import { Download, ListFilter, Search } from "lucide-react";

import type { GrammarLabStudentRow } from "@/actions/grammar-drill-admin";
import { CTA_LABELS, METRIC_LABELS } from "@/lib/wording/director-glossary";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** 어드민 공용 아이콘 팝오버 트리거 (analyses-board 등과 동일 규약) */
const ICON_TRIGGER_CLASS =
  "relative flex size-7 shrink-0 items-center justify-center rounded-md border border-input bg-transparent shadow-xs transition-[color,box-shadow] outline-none hover:bg-slate-50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

function ActiveDot() {
  return (
    <span
      aria-hidden="true"
      className="absolute top-1 right-1 inline-block size-1.5 rounded-full bg-blue-500"
    />
  );
}

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
    `${METRIC_LABELS.WEAK} 개념`,
    `${METRIC_LABELS.WEAK} 개념 ${METRIC_LABELS.MASTERY}`,
    METRIC_LABELS.INCOMPLETE_TASKS,
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
  const filterActive =
    onlyActive || stalledOnly || classFilter !== null || gradeFilter !== null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-100 px-4 py-2.5">
      {selectedCount > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] font-semibold tabular-nums text-blue-700">
            {selectedCount}명 선택
          </span>
          <button
            type="button"
            onClick={onAssignSelected}
            className="inline-flex h-7 items-center rounded-md bg-blue-600 px-2.5 text-[12px] font-semibold text-white transition-colors hover:bg-blue-700"
          >
            {CTA_LABELS.SEND_GRAMMAR_TASK}
          </button>
          <button
            type="button"
            onClick={onClearSelection}
            className="text-[12px] font-medium text-slate-400 transition-colors hover:text-slate-600"
          >
            선택 해제
          </button>
        </div>
      ) : null}

      {/* 우측 끝 고정: 카운트 · CSV · 필터 · 검색 */}
      <div className="ml-auto flex items-center gap-1.5">
        <span className="mr-1 text-[12px] tabular-nums text-slate-400">
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

        <Popover>
          <PopoverTrigger title="필터" aria-label="필터" className={ICON_TRIGGER_CLASS}>
            <ListFilter className="size-3.5 shrink-0" />
            {filterActive ? <ActiveDot /> : null}
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 p-3">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-medium text-slate-600">학습 상태</span>
                <div className="flex flex-wrap gap-1.5">
                  <FilterChip
                    active={onlyActive}
                    onClick={() => onOnlyActiveChange(!onlyActive)}
                  >
                    학습 이력 있는 학생만
                  </FilterChip>
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
                </div>
              </div>

              {classOptions.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-medium text-slate-600">반</span>
                  <div className="flex flex-wrap gap-1">
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
                </div>
              ) : null}

              {grades.length >= 2 ? (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-medium text-slate-600">학년</span>
                  <div className="flex flex-wrap gap-1">
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
                </div>
              ) : null}
            </div>
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger title="검색" aria-label="검색" className={ICON_TRIGGER_CLASS}>
            <Search className="size-3.5 shrink-0" />
            {query ? <ActiveDot /> : null}
          </PopoverTrigger>
          <PopoverContent align="end" className="w-60 p-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium text-slate-600">검색</span>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => onQueryChange(e.target.value)}
                  placeholder="이름 · 학생코드 검색"
                  className="h-8 w-full rounded-md border border-slate-200 bg-white pl-7 pr-2.5 text-[13px] text-slate-700 outline-none placeholder:text-slate-300 focus:border-blue-400"
                />
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
