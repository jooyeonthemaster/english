"use client";

// 방문 많은 날 TOP 10 — 방문자 순. 행 클릭 = 조회 기간을 그 날짜 하루로.

import type { AudienceReport } from "@/lib/analytics/reports/audience";
import { DOW_LABELS, fmtInt } from "@/lib/analytics/format";
import { cn } from "@/lib/utils";
import { BreakdownTable } from "../shared/breakdown-table";
import { useAnalyticsParams } from "../shared/use-analytics-params";
import { dowTone, fmtDayLong } from "./audience-utils";

export function TopDaysTable({ topDays }: { topDays: AudienceReport["topDays"] }) {
  const { update } = useAnalyticsParams();
  const rankOf = new Map(topDays.map((r, i) => [r.day, i + 1]));
  const multiYear = new Set(topDays.map((r) => r.day.slice(0, 4))).size > 1;

  return (
    <BreakdownTable
      rows={topDays}
      rowKey={(r) => r.day}
      labelHeader="날짜"
      label={(r) => {
        const [, m, d] = r.day.split("-").map(Number);
        return (
          <span className="inline-flex items-center gap-2" title={`${fmtDayLong(r.day)} — 클릭하면 이 날짜만 보기`}>
            <span className="w-5 text-right text-[11.5px] font-semibold text-gray-400 tabular-nums">{rankOf.get(r.day)}</span>
            <span className="tabular-nums">
              {m}월 {d}일
            </span>
            <span className={cn("text-[12px] font-semibold", dowTone(r.dow))}>{DOW_LABELS[r.dow]}</span>
            {multiYear && <span className="text-[11px] text-gray-400 tabular-nums">{r.day.slice(0, 4)}</span>}
          </span>
        );
      }}
      barValue={(r) => r.visitors}
      columns={[
        { key: "v", label: "방문자", render: (r) => <span className="font-semibold text-gray-800">{fmtInt(r.visitors)}</span> },
        { key: "s", label: "방문", render: (r) => fmtInt(r.sessions) },
        { key: "pv", label: "PV", render: (r) => fmtInt(r.pageviews) },
      ]}
      onRowClick={(r) => update({ range: "custom", from: r.day, to: r.day })}
      emptyMessage="이 기간에 방문이 없습니다"
    />
  );
}
