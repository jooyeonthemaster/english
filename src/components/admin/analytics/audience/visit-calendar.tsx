"use client";

// 최근 90일 일별 방문자 캘린더 — 깃허브 잔디형. 열 = 주(일요일 시작), 행 = 요일.
// 조회 기간과 무관하게 항상 최근 90일(필터는 적용). 셀 hover(터치는 탭) 툴팁.

import { useMemo } from "react";
import type { AudienceReport } from "@/lib/analytics/reports/audience";
import { DOW_LABELS, fmtInt } from "@/lib/analytics/format";
import { DensityLegend, densityColor } from "./color-scale";
import { HoverTip, useHoverTip } from "./hover-tip";
import { dowOf, fmtDayLong } from "./audience-utils";

type Day = AudienceReport["calendar"][number];

const ROW_LABELS = new Set([1, 3, 5]); // 월·수·금만 표기

export function VisitCalendar({ calendar }: { calendar: AudienceReport["calendar"] }) {
  const { tip, show, hide } = useHoverTip();

  const { weeks, monthLabels, max, activeDays, best } = useMemo(() => {
    const cells: Array<Day | null> = [];
    if (calendar.length) for (let i = 0; i < dowOf(calendar[0].day); i++) cells.push(null);
    cells.push(...calendar);
    const w: Array<Array<Day | null>> = [];
    for (let i = 0; i < cells.length; i += 7) w.push(cells.slice(i, i + 7));
    // 월 라벨: 그 주 첫 날짜의 월이 직전 주와 달라지는 열에만
    const labels: string[] = [];
    let prevMonth = "";
    for (const week of w) {
      const first = week.find((d): d is Day => d !== null);
      const month = first ? first.day.slice(5, 7) : prevMonth;
      labels.push(month !== prevMonth ? `${Number(month)}월` : "");
      prevMonth = month;
    }
    let mx = 0;
    let active = 0;
    let top: Day | null = null;
    for (const d of calendar) {
      if (d.visitors > 0) active++;
      if (d.visitors > mx) {
        mx = d.visitors;
        top = d;
      }
    }
    return { weeks: w, monthLabels: labels, max: mx, activeDays: active, best: top };
  }, [calendar]);

  if (!calendar.length) return null;

  const cols = `24px repeat(${weeks.length}, minmax(11px, 30px))`;

  return (
    <div>
      <div className="overflow-x-auto pb-1">
        <div
          role="img"
          aria-label={`최근 90일 일별 방문자 캘린더, 방문 있는 날 ${activeDays}일`}
          className="grid gap-[3px]"
          style={{ gridTemplateColumns: cols }}
          onMouseLeave={hide}
        >
          <div aria-hidden />
          {monthLabels.map((label, i) => (
            <div key={`m${i}`} className="h-4 overflow-visible whitespace-nowrap text-[10px] leading-4 text-gray-400" aria-hidden>
              {label}
            </div>
          ))}
          {Array.from({ length: 7 }, (_, dow) => (
            <CalendarRow
              key={dow}
              dow={dow}
              weeks={weeks}
              max={max}
              onShow={(el, d) => show(el, fmtDayLong(d.day), d.visitors > 0 ? `방문자 ${fmtInt(d.visitors)}명` : "방문 없음")}
              onHide={hide}
            />
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11.5px] text-gray-400 tabular-nums">
          방문 있는 날 {fmtInt(activeDays)}/{fmtInt(calendar.length)}일
          {best && (
            <>
              {" "}· 최다 {fmtDayLong(best.day)} {fmtInt(best.visitors)}명
            </>
          )}
        </p>
        <DensityLegend />
      </div>
      <HoverTip tip={tip} />
    </div>
  );
}

function CalendarRow({
  dow,
  weeks,
  max,
  onShow,
  onHide,
}: {
  dow: number;
  weeks: Array<Array<Day | null>>;
  max: number;
  onShow: (el: Element, d: Day) => void;
  onHide: () => void;
}) {
  return (
    <>
      <div className="flex items-center text-[10px] leading-none text-gray-400" aria-hidden>
        {ROW_LABELS.has(dow) ? DOW_LABELS[dow] : ""}
      </div>
      {weeks.map((week, wi) => {
        const d = week[dow] ?? null;
        if (!d) return <div key={wi} className="aspect-square" aria-hidden />;
        return (
          <div
            key={wi}
            className="aspect-square rounded-[3px] ring-gray-900/30 hover:ring-2"
            style={{ background: densityColor(d.visitors, max) }}
            onMouseEnter={(e) => onShow(e.currentTarget, d)}
            onClick={(e) => onShow(e.currentTarget, d)}
            onMouseLeave={onHide}
          />
        );
      })}
    </>
  );
}
