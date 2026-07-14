"use client";

// ============================================================================
// 학생 시험 리포트 — 정오표 필터바(유형·정오 상태·난이도·지문, AI 0콜)
//
// 문항 메타(유형라벨·정오 상태·난이도·지문)로 정오표 행을 필터한다. 전부 이미
// 클라에 있는(또는 재조회된) 데이터의 순수 필터다. 색은 STATUS_STYLE 계약 준수.
// ============================================================================

import { Check, ChevronDown, ListFilter, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ResponseStatus } from "@/lib/exam-report/types";
import { STATUS_STYLE, VERDICT_ORDER } from "./grading-shared";
import {
  DIFFICULTY_LABEL,
  DIFFICULTY_RANK,
  type AnalysisRowMeta,
} from "./grading-weakness";

// ── 필터 상태 + 순수 로직 ────────────────────────────────────────────────────

export interface VerdictFilterState {
  types: string[];
  statuses: ResponseStatus[];
  /** "BASIC" | "INTERMEDIATE" | "KILLER" */
  difficulties: string[];
  passageIds: string[];
}

export const EMPTY_VERDICT_FILTER: VerdictFilterState = {
  types: [],
  statuses: [],
  difficulties: [],
  passageIds: [],
};

/** 필터 대상 행의 메타(verdict-board 가 examMap·responses·reviewItems 에서 조립). */
export interface VerdictRowMeta {
  number: string;
  typeLabel: string;
  status: ResponseStatus;
  difficultyKey: string | null;
  passageId: string | null;
}

export function isVerdictFilterActive(f: VerdictFilterState): boolean {
  return (
    f.types.length > 0 ||
    f.statuses.length > 0 ||
    f.difficulties.length > 0 ||
    f.passageIds.length > 0
  );
}

export function matchesVerdictFilter(
  meta: VerdictRowMeta,
  f: VerdictFilterState,
): boolean {
  if (f.types.length > 0 && !f.types.includes(meta.typeLabel)) return false;
  if (f.statuses.length > 0 && !f.statuses.includes(meta.status)) return false;
  if (f.difficulties.length > 0) {
    if (!meta.difficultyKey || !f.difficulties.includes(meta.difficultyKey)) return false;
  }
  if (f.passageIds.length > 0) {
    if (!meta.passageId || !f.passageIds.includes(meta.passageId)) return false;
  }
  return true;
}

function toggle<T>(arr: T[], value: T): T[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

/** 행 메타 → 필터바 옵션 4종(순수) — 채점 필터바·분석 문항 그리드 공용 조립기. */
export function buildVerdictFilterOptions(metas: AnalysisRowMeta[]): {
  typeOptions: { value: string; count: number }[];
  difficultyOptions: { value: string; label: string; count: number }[];
  passageOptions: { value: string; label: string; count: number }[];
  statusCounts: Record<ResponseStatus, number>;
} {
  const typeCounts = new Map<string, number>();
  const diffCounts = new Map<string, number>();
  const passages = new Map<string, { label: string; count: number }>();
  const statusCounts: Record<ResponseStatus, number> = {
    CORRECT: 0,
    WRONG: 0,
    PARTIAL: 0,
    UNKNOWN: 0,
  };
  for (const m of metas) {
    typeCounts.set(m.typeLabel, (typeCounts.get(m.typeLabel) ?? 0) + 1);
    if (m.difficultyKey) {
      diffCounts.set(m.difficultyKey, (diffCounts.get(m.difficultyKey) ?? 0) + 1);
    }
    if (m.passageId) {
      const cur = passages.get(m.passageId);
      if (cur) cur.count += 1;
      else passages.set(m.passageId, { label: m.passageLabel || "지문", count: 1 });
    }
    statusCounts[m.status] += 1;
  }
  return {
    typeOptions: [...typeCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([value, count]) => ({ value, count })),
    difficultyOptions: [...diffCounts.entries()]
      .sort((a, b) => (DIFFICULTY_RANK[a[0]] ?? 99) - (DIFFICULTY_RANK[b[0]] ?? 99))
      .map(([value, count]) => ({
        value,
        label: DIFFICULTY_LABEL[value] ?? value,
        count,
      })),
    passageOptions: [...passages.entries()].map(([value, { label, count }]) => ({
      value,
      label,
      count,
    })),
    statusCounts,
  };
}

// ── 컴포넌트 ─────────────────────────────────────────────────────────────────

interface VerdictFilterBarProps {
  filter: VerdictFilterState;
  onChange: (next: VerdictFilterState) => void;
  typeOptions: { value: string; count: number }[];
  difficultyOptions: { value: string; label: string; count: number }[];
  passageOptions: { value: string; label: string; count: number }[];
  statusCounts: Record<ResponseStatus, number>;
  filteredCount: number;
  totalCount: number;
  detailAvailable: boolean;
}

export function VerdictFilterBar({
  filter,
  onChange,
  typeOptions,
  difficultyOptions,
  passageOptions,
  statusCounts,
  filteredCount,
  totalCount,
  detailAvailable,
}: VerdictFilterBarProps) {
  const active = isVerdictFilterActive(filter);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-100 bg-white px-4 py-2.5">
      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">
        <ListFilter className="h-3.5 w-3.5" />
        필터
      </span>

      {/* 정오 상태 토글 칩 */}
      <div className="flex items-center gap-1">
        {VERDICT_ORDER.map((s) => {
          const on = filter.statuses.includes(s);
          const style = STATUS_STYLE[s];
          return (
            <button
              key={s}
              type="button"
              onClick={() => onChange({ ...filter, statuses: toggle(filter.statuses, s) })}
              aria-pressed={on}
              className={cn(
                "inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-md border px-2 text-[12px] font-semibold transition-colors",
                on
                  ? s === "UNKNOWN"
                    ? // 미상 on 은 STATUS_STYLE(bg-white·slate-300 링)로는 off 와
                      // 구분되지 않아 전용 강조를 쓴다(분석 분해 패널과 동일).
                      "border-transparent bg-slate-200 text-slate-600 ring-1 ring-inset ring-slate-400"
                    : cn(style.bg, style.text, style.ring, "ring-1 ring-inset border-transparent")
                  : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50",
              )}
            >
              <span>{style.symbol}</span>
              {style.label}
              <span className="tabular-nums opacity-70">{statusCounts[s]}</span>
            </button>
          );
        })}
      </div>

      <Divider />

      {/* 유형 멀티셀렉트 */}
      {typeOptions.length > 0 && (
        <FilterMultiSelect
          label="유형"
          selected={filter.types}
          options={typeOptions.map((o) => ({ value: o.value, label: o.value, count: o.count }))}
          onToggle={(v) => onChange({ ...filter, types: toggle(filter.types, v) })}
          onClear={() => onChange({ ...filter, types: [] })}
        />
      )}

      {/* 난이도 토글 칩 */}
      {difficultyOptions.length > 0 && (
        <div className="flex items-center gap-1">
          {difficultyOptions.map((d) => {
            const on = filter.difficulties.includes(d.value);
            return (
              <button
                key={d.value}
                type="button"
                onClick={() =>
                  onChange({ ...filter, difficulties: toggle(filter.difficulties, d.value) })
                }
                aria-pressed={on}
                className={cn(
                  "inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-md border px-2 text-[12px] font-semibold transition-colors",
                  on
                    ? "border-blue-600 bg-blue-50/60 text-blue-700"
                    : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50",
                )}
              >
                {d.label}
                <span className="tabular-nums opacity-70">{d.count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* 지문 멀티셀렉트(원본 있을 때만) */}
      {detailAvailable && passageOptions.length > 0 && (
        <FilterMultiSelect
          label="지문"
          selected={filter.passageIds}
          options={passageOptions}
          onToggle={(v) => onChange({ ...filter, passageIds: toggle(filter.passageIds, v) })}
          onClear={() => onChange({ ...filter, passageIds: [] })}
          wide
        />
      )}

      {/* 우측: 결과 카운트 + 초기화 */}
      <div className="ml-auto flex items-center gap-2">
        {active && (
          <span className="whitespace-nowrap text-[12px] font-semibold tabular-nums text-slate-500">
            {filteredCount}
            <span className="font-medium text-slate-400"> / {totalCount}</span>
          </span>
        )}
        {active && (
          <button
            type="button"
            onClick={() => onChange(EMPTY_VERDICT_FILTER)}
            className="inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2 text-[11.5px] font-semibold text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
          >
            <X className="h-3 w-3" />
            초기화
          </button>
        )}
      </div>
    </div>
  );
}

function Divider() {
  return <span className="h-5 w-px shrink-0 bg-slate-200" />;
}

/** 체크리스트 팝오버 멀티셀렉트 — 필터바와 분석 분해 패널이 공유하는 프리미티브. */
export function FilterMultiSelect({
  label,
  selected,
  options,
  onToggle,
  onClear,
  wide = false,
}: {
  label: string;
  selected: string[];
  options: { value: string; label: string; count: number }[];
  onToggle: (value: string) => void;
  onClear: () => void;
  wide?: boolean;
}) {
  const count = selected.length;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 text-[12px] font-semibold transition-colors",
            count > 0
              ? "border-blue-600 bg-blue-50/60 text-blue-700"
              : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50",
          )}
        >
          {label}
          {count > 0 && (
            <span className="inline-flex h-4 min-w-4 items-center justify-center rounded bg-blue-600 px-1 text-[10px] font-bold tabular-nums text-white">
              {count}
            </span>
          )}
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className={cn("p-1.5", wide ? "w-80" : "w-64")}>
        <div className="flex items-center justify-between px-1.5 py-1">
          <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
            {label}
          </span>
          {count > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="text-[11px] font-semibold text-slate-400 transition-colors hover:text-slate-600"
            >
              해제
            </button>
          )}
        </div>
        <ul className="max-h-64 overflow-y-auto">
          {options.map((o) => {
            const on = selected.includes(o.value);
            return (
              <li key={o.value}>
                <button
                  type="button"
                  onClick={() => onToggle(o.value)}
                  // 체크 표시는 시각 전용 — 스크린리더에는 pressed 로 선택 상태 전달.
                  aria-pressed={on}
                  className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-slate-50"
                >
                  <span
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                      on
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-slate-300 bg-white",
                    )}
                  >
                    {on && <Check className="size-3" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-slate-700" title={o.label}>
                    {o.label}
                  </span>
                  <span className="shrink-0 text-[11px] tabular-nums text-slate-400">{o.count}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
