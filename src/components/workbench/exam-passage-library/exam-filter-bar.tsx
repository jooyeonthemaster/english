"use client";

import { Search, X, ChevronDown, Check } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { reconLabel, examLabel } from "@/lib/exam-passages/format";
import type { ExamPassageLibraryApi } from "./use-exam-passage-library";

const DEFAULT_EXAMS = ["수능", "9월", "6월", "예비"];

type Opt<T> = { value: T; label: string; count?: number };

/**
 * 통일된 facet 드롭다운 — 라벨 + 선택 개수 배지 + 셰브론. 열면 체크리스트(또는 연도
 * 그리드)와 개수를 보여준다. 적용된 선택은 아래 '적용된 필터' 칩으로도 노출된다.
 */
function FilterMenu<T extends string | number>({
  label,
  options,
  selected,
  onToggle,
  onClear,
  variant = "list",
}: {
  label: string;
  options: Opt<T>[];
  selected: Set<T>;
  onToggle: (v: T) => void;
  onClear: () => void;
  variant?: "list" | "grid";
}) {
  const count = selected.size;
  const active = count > 0;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={active ? `${label} 필터, ${count}개 선택됨` : `${label} 필터`}
          className={
            "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 " +
            (active
              ? "border-blue-600 bg-blue-50 text-blue-700 shadow-sm"
              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50")
          }
        >
          {label}
          {active ? (
            <span
              aria-hidden="true"
              className="flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-bold text-white"
            >
              {count}
            </span>
          ) : null}
          <ChevronDown className="size-3.5 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={variant === "grid" ? "w-[264px] p-2.5" : "w-60 p-1.5"}
      >
        <div className="mb-1 flex items-center justify-between px-1.5 pt-0.5">
          <span className="text-[11px] font-bold text-slate-500">{label}</span>
          {active ? (
            <button
              type="button"
              onClick={onClear}
              className="rounded px-1 text-[10.5px] font-semibold text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            >
              해제
            </button>
          ) : null}
        </div>

        {variant === "grid" ? (
          <div className="grid grid-cols-4 gap-1">
            {options.map((o) => {
              const on = selected.has(o.value);
              return (
                <button
                  key={String(o.value)}
                  type="button"
                  onClick={() => onToggle(o.value)}
                  aria-pressed={on}
                  className={
                    "h-7 rounded-md border text-[11.5px] font-semibold transition " +
                    (on
                      ? "border-blue-600 bg-blue-50 text-blue-700"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")
                  }
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="max-h-72 overflow-y-auto">
            {options.map((o) => {
              const on = selected.has(o.value);
              return (
                <button
                  key={String(o.value)}
                  type="button"
                  onClick={() => onToggle(o.value)}
                  aria-pressed={on}
                  className={
                    "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[12px] font-medium transition " +
                    (on
                      ? "bg-blue-50 text-blue-700"
                      : "text-slate-600 hover:bg-slate-50")
                  }
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span
                      className={
                        "flex size-4 shrink-0 items-center justify-center rounded border transition " +
                        (on
                          ? "border-blue-600 bg-blue-600 text-white"
                          : "border-slate-300 text-transparent")
                      }
                    >
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                    <span className="truncate">{o.label}</span>
                  </span>
                  {typeof o.count === "number" ? (
                    <span className="shrink-0 text-[10.5px] tabular-nums text-slate-400">
                      {o.count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** 적용된 필터 제거형 칩. */
function ActiveChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-md border border-blue-200 bg-blue-50 pl-2 pr-1 text-[11px] font-semibold text-blue-700">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`${label} 필터 제거`}
        className="flex size-4 items-center justify-center rounded text-blue-500 transition hover:bg-blue-100 hover:text-blue-700"
      >
        <X className="size-3" strokeWidth={2.5} />
      </button>
    </span>
  );
}

export function ExamFilterBar({ api }: { api: ExamPassageLibraryApi }) {
  const { facets, filters } = api;
  const exams = facets?.exams ?? DEFAULT_EXAMS;
  const examCounts = facets?.counts.exam ?? {};
  const typeGroups = facets?.typeGroups ?? [];
  const typeCounts = facets?.counts.typeGroup ?? {};
  const years = facets?.years ?? [];
  const reconKinds = facets?.reconKinds ?? [];
  const reconCounts = facets?.counts.reconstructionKind ?? {};

  // '적용된 필터' 칩 — 어떤 조건이 걸렸는지 한눈에 보고 개별 제거.
  const activeChips: { key: string; label: string; remove: () => void }[] = [
    ...[...filters.exams].map((v) => ({
      key: `exam-${v}`,
      label: examLabel(v),
      remove: () => api.toggleExam(v),
    })),
    ...[...filters.types].map((v) => ({
      key: `type-${v}`,
      label: v,
      remove: () => api.toggleType(v),
    })),
    ...[...filters.years]
      .sort((a, b) => b - a)
      .map((v) => ({
        key: `year-${v}`,
        label: `${v}학년도`,
        remove: () => api.toggleYear(v),
      })),
    ...[...filters.recons].map((v) => ({
      key: `recon-${v}`,
      label: reconLabel(v),
      remove: () => api.toggleRecon(v),
    })),
  ];

  return (
    <div className="shrink-0 space-y-2 border-b border-slate-100 bg-white px-3 py-2.5">
      {/* 검색 */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <input
          value={api.searchInput}
          onChange={(e) => api.setSearchInput(e.target.value)}
          placeholder="지문 내용·연도·유형 검색 (예: climate, 2024, 빈칸)"
          className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-8 text-[12.5px] text-slate-700 placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/10"
        />
        {api.searchInput ? (
          <button
            type="button"
            onClick={() => api.setSearchInput("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="검색어 지우기"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>

      {/* facet 드롭다운 행 */}
      <div className="flex flex-wrap items-center gap-1.5">
        <FilterMenu
          label="회차"
          options={exams.map((ex) => ({
            value: ex,
            label: examLabel(ex),
            count: examCounts[ex],
          }))}
          selected={filters.exams}
          onToggle={api.toggleExam}
          onClear={() => filters.exams.forEach((v) => api.toggleExam(v))}
        />
        <FilterMenu
          label="유형"
          options={typeGroups.map((tg) => ({
            value: tg,
            label: tg,
            count: typeCounts[tg],
          }))}
          selected={filters.types}
          onToggle={api.toggleType}
          onClear={() => filters.types.forEach((v) => api.toggleType(v))}
        />
        <FilterMenu
          label="연도"
          variant="grid"
          options={years.map((y) => ({ value: y, label: String(y) }))}
          selected={filters.years}
          onToggle={api.toggleYear}
          onClear={() => filters.years.forEach((v) => api.toggleYear(v))}
        />
        <FilterMenu
          label="복원"
          options={reconKinds.map((rk) => ({
            value: rk,
            label: reconLabel(rk),
            count: reconCounts[rk],
          }))}
          selected={filters.recons}
          onToggle={api.toggleRecon}
          onClear={() => filters.recons.forEach((v) => api.toggleRecon(v))}
        />
      </div>

      {/* 적용된 필터 칩 */}
      {activeChips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10.5px] font-bold uppercase tracking-wide text-slate-400">
            적용된 필터
          </span>
          {activeChips.map((chip) => (
            <ActiveChip key={chip.key} label={chip.label} onRemove={chip.remove} />
          ))}
          <button
            type="button"
            onClick={api.clearFilters}
            className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] font-semibold text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="size-3" />
            모두 지우기
          </button>
        </div>
      ) : null}
    </div>
  );
}
