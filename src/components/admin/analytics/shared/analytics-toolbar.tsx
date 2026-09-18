"use client";

// 기간 선택 + 내부 트래픽 토글 + 활성 필터 칩. 모든 리포트 상단 공용.
// 규약(docs/ADMIN-UI-CONVENTION.md §3): 필터 줄은 FilterBar, 칩은 FilterChip/FilterChipGroup,
// 토글은 ui/switch, 버튼·입력은 ui/button·ui/input 으로 만든다. 동작(URL 파라미터 갱신)은 그대로다 —
// 기간·필터는 useAnalyticsParams.update 를 통해서만 바뀌고, 탭 이동 시 그 쿼리가 유지된다.

import { useEffect, useState } from "react";
import { FilterBar, FilterChip, FilterChipGroup } from "@/components/admin/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { RANGE_LABELS, resolvePeriod, type RangeKey } from "@/lib/analytics/time";
import { FILTER_KEY_LABELS, filterValueLabel } from "./filter-labels";
import { FILTER_KEYS, useAnalyticsParams } from "./use-analytics-params";

const QUICK_RANGES: RangeKey[] = ["today", "yesterday", "7d", "30d", "90d"];
const QUICK_RANGE_OPTIONS = QUICK_RANGES.map((key) => ({ key, label: RANGE_LABELS[key] }));
const INTERNAL_TOGGLE_ID = "analytics-include-internal";
const INTERNAL_TOGGLE_LABEL = "내부 트래픽 포함(관리자·로컬)";

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
      <FilterBar
        right={
          <span className="inline-flex items-center gap-2 text-[12px] text-gray-500">
            <label htmlFor={INTERNAL_TOGGLE_ID} className="cursor-pointer">
              {INTERNAL_TOGGLE_LABEL}
            </label>
            <Switch
              id={INTERNAL_TOGGLE_ID}
              checked={includeInternal}
              onCheckedChange={(checked) => update({ internal: checked ? "include" : null })}
              aria-label={INTERNAL_TOGGLE_LABEL}
            />
          </span>
        }
      >
        {!hidePeriod && (
          <>
            <FilterChipGroup
              ariaLabel="집계 기간"
              options={QUICK_RANGE_OPTIONS}
              value={period.range}
              onChange={(r) => {
                setCustomOpen(false);
                update({ range: r === "7d" ? null : r, from: null, to: null });
              }}
            />
            <FilterChip
              active={period.range === "custom"}
              onClick={() => setCustomOpen((v) => !v)}
              label="기간 지정"
            />
            {customOpen && (
              <form
                className="inline-flex flex-wrap items-center gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (draftFrom && draftTo && draftFrom <= draftTo) {
                    update({ range: "custom", from: draftFrom, to: draftTo });
                  }
                }}
              >
                <Input
                  type="date"
                  value={draftFrom}
                  max={draftTo}
                  onChange={(e) => setDraftFrom(e.target.value)}
                  className="h-8 w-auto rounded-lg border-gray-200 px-2 text-[12px] text-gray-700 shadow-none"
                  aria-label="시작일"
                />
                <span className="text-[12px] text-gray-400">~</span>
                <Input
                  type="date"
                  value={draftTo}
                  min={draftFrom}
                  onChange={(e) => setDraftTo(e.target.value)}
                  className="h-8 w-auto rounded-lg border-gray-200 px-2 text-[12px] text-gray-700 shadow-none"
                  aria-label="종료일"
                />
                <Button type="submit" size="sm">
                  적용
                </Button>
              </form>
            )}
            <span className="text-[12px] tabular-nums text-gray-400">
              {period.fromDay === period.toDay ? period.fromDay : `${period.fromDay} ~ ${period.toDay}`} (KST)
            </span>
          </>
        )}
      </FilterBar>

      {activeFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-gray-400">필터</span>
          {activeFilters.map((k) => {
            const clear = () => update({ [k]: null });
            return (
              <FilterChip
                key={k}
                active
                onClick={clear}
                onRemove={clear}
                removeLabel={`${FILTER_KEY_LABELS[k]} 필터 해제`}
                label={`${FILTER_KEY_LABELS[k]} ${filterValueLabel(k, filters[k]!, filters)}`}
              />
            );
          })}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => update(Object.fromEntries(activeFilters.map((k) => [k, null])))}
            className="h-8 rounded-full px-2.5 text-[12px] font-medium text-gray-400 hover:text-gray-700"
          >
            전체 해제
          </Button>
        </div>
      )}
    </div>
  );
}
