"use client";

// 기간 선택 + 내부 트래픽 토글 + 활성 필터 칩. 모든 리포트 상단 공용.

import { useEffect, useState } from "react";
import { CalendarRange, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { RANGE_LABELS, resolvePeriod, type RangeKey } from "@/lib/analytics/time";
import { FILTER_KEY_LABELS, filterValueLabel } from "./filter-labels";
import { FILTER_KEYS, useAnalyticsParams } from "./use-analytics-params";

const QUICK_RANGES: RangeKey[] = ["today", "yesterday", "7d", "30d", "90d"];

export function AnalyticsToolbar({ hidePeriod = false }: { hidePeriod?: boolean }) {
  const { range, from, to, includeInternal, filters, update } = useAnalyticsParams();
  const period = resolvePeriod({ range, from, to });
  const [customOpen, setCustomOpen] = useState(range === "custom");
  const [draftFrom, setDraftFrom] = useState(period.fromDay);
  const [draftTo, setDraftTo] = useState(period.toDay);

  useEffect(() => {
    setDraftFrom(period.fromDay);
    setDraftTo(period.toDay);
  }, [period.fromDay, period.toDay]);

  const activeFilters = FILTER_KEYS.filter((k) => !!filters[k]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {!hidePeriod && (
          <>
            <div className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-gray-100 bg-white p-1 shadow-sm">
              {QUICK_RANGES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    setCustomOpen(false);
                    update({ range: r === "7d" ? null : r, from: null, to: null });
                  }}
                  className={cn(
                    "h-8 rounded-lg px-3 text-[12px] font-semibold transition-colors",
                    period.range === r ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-50 hover:text-gray-900",
                  )}
                >
                  {RANGE_LABELS[r]}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setCustomOpen((v) => !v)}
                className={cn(
                  "inline-flex h-8 items-center gap-1 rounded-lg px-3 text-[12px] font-semibold transition-colors",
                  period.range === "custom" ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-50 hover:text-gray-900",
                )}
              >
                <CalendarRange className="size-3.5" aria-hidden />
                기간 지정
              </button>
            </div>
            {customOpen && (
              <form
                className="inline-flex flex-wrap items-center gap-1.5 rounded-xl border border-gray-100 bg-white p-1.5 shadow-sm"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (draftFrom && draftTo && draftFrom <= draftTo) {
                    update({ range: "custom", from: draftFrom, to: draftTo });
                  }
                }}
              >
                <input
                  type="date"
                  value={draftFrom}
                  max={draftTo}
                  onChange={(e) => setDraftFrom(e.target.value)}
                  className="h-8 rounded-lg border border-gray-200 px-2 text-[12px] text-gray-700"
                  aria-label="시작일"
                />
                <span className="text-[12px] text-gray-400">~</span>
                <input
                  type="date"
                  value={draftTo}
                  min={draftFrom}
                  onChange={(e) => setDraftTo(e.target.value)}
                  className="h-8 rounded-lg border border-gray-200 px-2 text-[12px] text-gray-700"
                  aria-label="종료일"
                />
                <button type="submit" className="h-8 rounded-lg bg-gray-900 px-3 text-[12px] font-semibold text-white">
                  적용
                </button>
              </form>
            )}
            <span className="text-[12px] tabular-nums text-gray-400">
              {period.fromDay === period.toDay ? period.fromDay : `${period.fromDay} ~ ${period.toDay}`} (KST)
            </span>
          </>
        )}
        <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-[12px] text-gray-500">
          <input
            type="checkbox"
            checked={includeInternal}
            onChange={(e) => update({ internal: e.target.checked ? "include" : null })}
            className="size-3.5 accent-blue-600"
          />
          내부 트래픽 포함(관리자·로컬)
        </label>
      </div>

      {activeFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-gray-400">필터</span>
          {activeFilters.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => update({ [k]: null })}
              className="inline-flex h-7 items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 text-[12px] font-semibold text-blue-700 hover:bg-blue-100"
              title="필터 해제"
            >
              <span className="text-blue-400">{FILTER_KEY_LABELS[k]}</span>
              {filterValueLabel(k, filters[k]!, filters)}
              <X className="size-3" aria-hidden />
            </button>
          ))}
          <button
            type="button"
            onClick={() => update(Object.fromEntries(activeFilters.map((k) => [k, null])))}
            className="h-7 rounded-full px-2 text-[12px] text-gray-400 hover:text-gray-700"
          >
            전체 해제
          </button>
        </div>
      )}
    </div>
  );
}
