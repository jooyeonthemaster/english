"use client";

// 영역(area) 비중 — 페이지뷰 100% 누적 막대 + 분해 표(행 클릭 = 영역 필터).

import type { AreaRow } from "@/lib/analytics/reports/pages";
import { areaLabel } from "@/lib/analytics/channels";
import { fmtInt, fmtPct } from "@/lib/analytics/format";
import { BreakdownTable } from "../shared/breakdown-table";
import { share } from "./path-label";

/** 영역 색 — 이 화면 전용(공개 페이지 = 파란 포인트). */
const AREA_COLORS: Record<string, string> = {
  marketing: "#2563eb",
  auth: "#0891b2",
  director: "#16a34a",
  teacher: "#ca8a04",
  student: "#db2777",
  parent: "#7c3aed",
  tutor: "#ea580c",
  drill: "#dc2626",
};

function areaColor(area: string): string {
  return AREA_COLORS[area] ?? "#94a3b8";
}

export function AreaShare({ rows }: { rows: AreaRow[] }) {
  const total = rows.reduce((s, r) => s + r.pageviews, 0);

  return (
    <div className="space-y-4">
      {total > 0 && (
        <div
          className="flex h-3 w-full overflow-hidden rounded-full bg-gray-100"
          role="img"
          aria-label={rows.map((r) => `${areaLabel(r.area)} ${fmtPct(share(r.pageviews, total))}`).join(", ")}
        >
          {rows.map((r) => (
            <div
              key={r.area}
              className="h-full"
              style={{ width: `${(r.pageviews / total) * 100}%`, background: areaColor(r.area) }}
              title={`${areaLabel(r.area)} ${fmtPct(share(r.pageviews, total))}`}
            />
          ))}
        </div>
      )}
      <BreakdownTable
        rows={rows}
        rowKey={(r) => r.area}
        labelHeader="영역"
        label={(r) => (
          <span className="inline-flex items-center gap-2">
            <span className="size-2 rounded-full" style={{ background: areaColor(r.area) }} aria-hidden />
            {areaLabel(r.area)}
          </span>
        )}
        barValue={(r) => r.pageviews}
        columns={[
          { key: "pv", label: "PV", render: (r) => fmtInt(r.pageviews) },
          { key: "v", label: "방문자", render: (r) => fmtInt(r.visitors) },
          { key: "sh", label: "비중", render: (r) => fmtPct(share(r.pageviews, total)) },
        ]}
        filterKey="area"
        filterValue={(r) => r.area}
      />
    </div>
  );
}
