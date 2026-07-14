"use client";

// ============================================================================
// 학생 시험 리포트 — 분석 탭 · 문항별 결과 그리드(AI 0콜)
//
// 전 문항을 정오색 타일로 펼치고, 채점 필터바(유형·정오·난이도·지문)를 그대로
// 재사용해 강박적 필터링을 건다. 타일 클릭 → 원본 문항 상세보기 모달.
// ============================================================================

import { useMemo, useState } from "react";
import { LayoutGrid } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ResponseStatus } from "@/lib/exam-report/types";
import { STATUS_STYLE } from "./grading-shared";
import type { AnalysisRowMeta } from "./grading-weakness";
import {
  EMPTY_VERDICT_FILTER,
  VerdictFilterBar,
  buildVerdictFilterOptions,
  isVerdictFilterActive,
  matchesVerdictFilter,
  type VerdictFilterState,
} from "./verdict-filter-bar";

interface AnalysisQuestionGridProps {
  metas: AnalysisRowMeta[];
  detailAvailable: boolean;
  onSelectQuestion: (number: string) => void;
}

/** 타일 상태 스타일 — STATUS_STYLE 4색 계약의 면(面) 변주. */
const TILE_STYLE: Record<ResponseStatus, { box: string; symbol: string }> = {
  CORRECT: {
    box: "border-emerald-200 bg-emerald-50/50 hover:border-emerald-300 hover:bg-emerald-50",
    symbol: "text-emerald-600",
  },
  WRONG: {
    box: "border-rose-200 bg-rose-50/50 hover:border-rose-300 hover:bg-rose-50",
    symbol: "text-rose-600",
  },
  PARTIAL: {
    box: "border-blue-200 bg-blue-50/50 hover:border-blue-300 hover:bg-blue-50",
    symbol: "text-blue-700",
  },
  UNKNOWN: {
    box: "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
    symbol: "text-slate-300",
  },
};

export function AnalysisQuestionGrid({
  metas,
  detailAvailable,
  onSelectQuestion,
}: AnalysisQuestionGridProps) {
  const [filter, setFilter] = useState<VerdictFilterState>(EMPTY_VERDICT_FILTER);

  const options = useMemo(() => buildVerdictFilterOptions(metas), [metas]);
  const filterActive = isVerdictFilterActive(filter);
  const filtered = useMemo(
    () => (filterActive ? metas.filter((m) => matchesVerdictFilter(m, filter)) : metas),
    [metas, filter, filterActive],
  );

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-blue-100">
            <LayoutGrid className="size-4" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-[14px] font-bold text-slate-900">문항별 결과</h2>
            <p className="text-[12px] font-medium text-slate-400 break-keep">
              타일을 누르면 원본 문항·해설·학생답이 열립니다.
            </p>
          </div>
        </div>
        {/* 총계 고정 표기 — 필터 결과(N/M)는 아래 필터바가 담당(이중 표기 방지). */}
        <span className="text-[12px] font-semibold tabular-nums text-slate-400">
          {metas.length}문항
        </span>
      </div>

      <VerdictFilterBar
        filter={filter}
        onChange={setFilter}
        typeOptions={options.typeOptions}
        difficultyOptions={options.difficultyOptions}
        passageOptions={options.passageOptions}
        statusCounts={options.statusCounts}
        filteredCount={filtered.length}
        totalCount={metas.length}
        detailAvailable={detailAvailable}
      />

      <div className="p-4">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 py-10 text-center">
            <p className="text-[13px] font-semibold text-slate-500">
              조건에 맞는 문항이 없습니다.
            </p>
            <button
              type="button"
              onClick={() => setFilter(EMPTY_VERDICT_FILTER)}
              className="mt-1 text-[12px] font-semibold text-blue-600 hover:text-blue-700"
            >
              필터 초기화
            </button>
          </div>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-2">
            {filtered.map((m) => {
              const style = TILE_STYLE[m.status];
              const status = STATUS_STYLE[m.status];
              return (
                <li key={m.number}>
                  <button
                    type="button"
                    onClick={() => onSelectQuestion(m.number)}
                    title={`${m.number}번 · ${m.typeLabel} · ${status.label}`}
                    className={cn(
                      "flex w-full flex-col gap-1 rounded-lg border px-2.5 py-2 text-left transition-colors",
                      style.box,
                    )}
                  >
                    <span className="flex items-center justify-between gap-1">
                      <span className="text-[14px] font-extrabold tabular-nums text-slate-800">
                        {m.number}
                      </span>
                      <span className={cn("text-[13px] font-bold leading-none", style.symbol)}>
                        {status.symbol}
                      </span>
                    </span>
                    <span className="truncate text-[10.5px] font-semibold text-slate-500">
                      {m.typeLabel}
                    </span>
                    <span className="text-[10px] font-medium tabular-nums text-slate-400">
                      {m.points != null ? `${m.points}점` : "—"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
