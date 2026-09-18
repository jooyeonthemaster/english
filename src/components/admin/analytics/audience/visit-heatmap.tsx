"use client";

// 요일×시간 방문 히트맵 (KST) — 7행(일~토) × 24열 CSS 그리드. 진하기 = 방문(세션) 수.
// 셀 hover(터치는 탭) 툴팁 "화요일 21시 · 12방문". 좁은 화면은 가로 스크롤.

import { useMemo } from "react";
import type { AudienceReport } from "@/lib/analytics/reports/audience";
import { DOW_LABELS, fmtInt } from "@/lib/analytics/format";
import { cn } from "@/lib/utils";
import { ReportEmpty } from "../shared/report-states";
import { DensityLegend, densityColor } from "./color-scale";
import { HoverTip, useHoverTip } from "./hover-tip";
import { dowTone, pctOf } from "./audience-utils";

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const GRID_COLUMNS = "30px repeat(24, minmax(18px, 1fr)) 48px";

export function heatmapPeak(heatmap: AudienceReport["heatmap"]) {
  let peak: AudienceReport["heatmap"][number] | null = null;
  for (const c of heatmap) if (c.sessions > 0 && (!peak || c.sessions > peak.sessions)) peak = c;
  return peak;
}

export function VisitHeatmap({ heatmap }: { heatmap: AudienceReport["heatmap"] }) {
  const { tip, show, hide } = useHoverTip();

  const { matrix, max, total, dowTotals } = useMemo(() => {
    const m = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
    let mx = 0;
    let sum = 0;
    for (const c of heatmap) {
      if (c.dow < 0 || c.dow > 6 || c.hour < 0 || c.hour > 23) continue;
      m[c.dow][c.hour] = c.sessions;
      mx = Math.max(mx, c.sessions);
      sum += c.sessions;
    }
    return { matrix: m, max: mx, total: sum, dowTotals: m.map((row) => row.reduce((a, b) => a + b, 0)) };
  }, [heatmap]);

  if (total === 0) return <ReportEmpty message="이 기간에 방문이 없습니다" />;

  return (
    <div>
      <div className="overflow-x-auto pb-1">
        <div
          role="img"
          aria-label={`요일×시간대 방문 히트맵, 총 ${fmtInt(total)}방문`}
          className="grid min-w-[600px] gap-[3px]"
          style={{ gridTemplateColumns: GRID_COLUMNS }}
          onMouseLeave={hide}
        >
          <div aria-hidden />
          {HOURS.map((h) => (
            <div key={`h${h}`} className="pb-0.5 text-center text-[10px] leading-none text-gray-400 tabular-nums" aria-hidden>
              {h}
            </div>
          ))}
          <div className="pb-0.5 text-right text-[10px] leading-none text-gray-400" aria-hidden>
            합계
          </div>

          {matrix.map((row, dow) => (
            <HeatmapRow
              key={dow}
              dow={dow}
              row={row}
              max={max}
              total={dowTotals[dow]}
              onShow={(el, hour, n) => show(el, `${DOW_LABELS[dow]}요일 ${hour}시 · ${fmtInt(n)}방문`, heatDetail(n, total))}
              onHide={hide}
            />
          ))}
        </div>
      </div>
      <div className="mt-3">
        <DensityLegend note={`칸 최대 ${fmtInt(max)}방문`} />
      </div>
      <HoverTip tip={tip} />
    </div>
  );
}

function heatDetail(n: number, total: number): string {
  return `기간 전체 방문의 ${pctOf(n, total)}%`;
}

function HeatmapRow({
  dow,
  row,
  max,
  total,
  onShow,
  onHide,
}: {
  dow: number;
  row: number[];
  max: number;
  total: number;
  onShow: (el: Element, hour: number, n: number) => void;
  onHide: () => void;
}) {
  return (
    <>
      <div className={cn("flex items-center justify-end pr-1 text-[11px] font-medium", dowTone(dow))}>
        {DOW_LABELS[dow]}
      </div>
      {row.map((n, hour) => (
        <div
          key={hour}
          className="h-6 rounded-[4px] ring-gray-900/30 transition-shadow hover:ring-2"
          style={{ background: densityColor(n, max) }}
          onMouseEnter={(e) => onShow(e.currentTarget, hour, n)}
          onClick={(e) => onShow(e.currentTarget, hour, n)}
          onMouseLeave={onHide}
        />
      ))}
      <div className="flex items-center justify-end text-[11px] tabular-nums text-gray-500">{fmtInt(total)}</div>
    </>
  );
}
