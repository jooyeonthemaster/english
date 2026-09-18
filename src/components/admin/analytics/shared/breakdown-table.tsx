"use client";

// 분해 표 — 라벨 + 지표 열들 + 첫 지표 막대. 행 클릭 = 필터 추가(Plausible 식 드릴다운).
// 모든 리포트의 "상위 N" 표는 이 컴포넌트를 쓴다.
//
// 라벨 열 폭(§13 S2 의 좁은 폭 회귀 수리): `w-full max-w-0` 만 주면 열이 8개 이상인 표에서 390px 라벨 셀이
// 12px 로 짓눌려 이름이 통째로 사라졌다(실측). min-w 로 바닥을 두고, 넘치면 <ScrollableX> 로 민다.
// CSV 내보내기는 여기서 처리한다(§14 D19) — 모든 분해표가 별도 작업 없이 얻는다.

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtInt } from "@/lib/analytics/format";
import { resolvePeriod } from "@/lib/analytics/time";
import { csvSafeName, downloadCsv, nodeText, toCsv } from "./csv";
import { ReportEmpty } from "./report-states";
import { ScrollableX } from "./scrollable-x";
import { useAnalyticsParams, type FilterKey } from "./use-analytics-params";

export interface BreakdownColumn<Row> {
  key: string;
  label: string;
  /** 표시 값 */
  render: (row: Row) => ReactNode;
  align?: "left" | "right";
  className?: string;
  /** CSV 에 넣을 원시 값(없으면 render 결과의 텍스트를 쓴다) */
  csvValue?: (row: Row) => string | number;
}

/** 리포트 경로 → CSV 파일명에 쓸 한국어 이름 */
const REPORT_NAMES: Record<string, string> = {
  "": "개요",
  realtime: "실시간",
  acquisition: "유입경로",
  pages: "페이지",
  audience: "방문자",
  conversions: "전환가입",
  sessions: "세션",
  links: "추적링크",
  setup: "설정",
};

export function BreakdownTable<Row>({
  rows,
  rowKey,
  label,
  labelHeader,
  labelText,
  barValue,
  columns,
  filterKey,
  filterValue,
  onRowClick,
  initialLimit = 10,
  emptyMessage,
  labelMinWidthClass = "min-w-[7.5rem] sm:min-w-[9rem]",
  csvName,
}: {
  rows: Row[];
  rowKey: (row: Row) => string;
  label: (row: Row) => ReactNode;
  labelHeader: string;
  /** 라벨의 순수 텍스트(없으면 label(row) 렌더 결과에서 뽑는다) — 셀 title·CSV 에 쓴다 */
  labelText?: (row: Row) => string;
  /** 막대 길이 기준 값 */
  barValue: (row: Row) => number;
  columns: BreakdownColumn<Row>[];
  /** 주어지면 행 클릭 시 이 필터를 건다 */
  filterKey?: FilterKey;
  filterValue?: (row: Row) => string | null;
  onRowClick?: (row: Row) => void;
  initialLimit?: number;
  emptyMessage?: string;
  /** 숫자 열이 많은 표는 라벨 바닥폭을 줄일 수 있다 */
  labelMinWidthClass?: string;
  /** CSV 파일명에 들어갈 표 이름(기본값 labelHeader) */
  csvName?: string;
}) {
  const { setFilter, range, from, to } = useAnalyticsParams();
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(false);

  // 라벨이 <ChannelName .../> 처럼 children 없는 컴포넌트면 노드에서 글자를 못 뽑는다 → 행 키로 되돌린다
  // (빈 title·빈 CSV 칸보다 원시 값이 낫다). 표시명이 필요하면 호출부가 labelText 를 준다.
  const textOf = (row: Row): string => {
    const explicit = labelText?.(row);
    if (explicit) return explicit;
    return nodeText(label(row)).trim() || rowKey(row);
  };

  const exportCsv = () => {
    const header = [labelHeader, ...columns.map((c) => c.label)];
    const body = rows.map((row) => [
      textOf(row),
      ...columns.map((c) => c.csvValue?.(row) ?? nodeText(c.render(row))),
    ]);
    const period = resolvePeriod({ range, from, to });
    const slug = pathname.replace(/^\/admin\/analytics\/?/, "").split("/")[0] ?? "";
    const reportName = REPORT_NAMES[slug] ?? (slug || "개요");
    const days = period.fromDay === period.toDay ? period.fromDay : `${period.fromDay}_${period.toDay}`;
    downloadCsv(`스모트-${csvSafeName(reportName)}-${csvSafeName(csvName ?? labelHeader)}-${days}.csv`, toCsv(header, body));
  };

  if (rows.length === 0) return <ReportEmpty message={emptyMessage} />;

  const max = Math.max(1, ...rows.map(barValue));
  const visible = expanded ? rows : rows.slice(0, initialLimit);
  const clickable = !!onRowClick || (!!filterKey && !!filterValue);

  const activate = (row: Row) => {
    if (onRowClick) onRowClick(row);
    else if (filterKey && filterValue) {
      const fv = filterValue(row);
      if (fv !== null) setFilter(filterKey, fv);
    }
  };

  return (
    <div>
      <div className="mb-1 flex justify-end">
        <button
          type="button"
          onClick={exportCsv}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-700"
          title={`이 표의 ${fmtInt(rows.length)}행을 CSV 로 내려받기 (현재 기간·필터 기준)`}
        >
          <Download className="size-3" aria-hidden />
          CSV
        </button>
      </div>
      <ScrollableX caption="좌우로 밀어 나머지 열 보기">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-gray-50 text-[11px] font-semibold text-gray-400">
              <th className={cn("w-full max-w-0 py-2 pr-3 font-semibold", labelMinWidthClass)}>{labelHeader}</th>
              {columns.map((c) => (
                <th key={c.key} className={cn("px-2 py-2 font-semibold whitespace-nowrap", c.align === "left" ? "text-left" : "text-right")}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const w = Math.max(2, Math.round((barValue(row) / max) * 100));
              return (
                <tr
                  key={rowKey(row)}
                  onClick={clickable ? () => activate(row) : undefined}
                  onKeyDown={
                    clickable
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
                            e.preventDefault();
                            activate(row);
                          }
                        }
                      : undefined
                  }
                  tabIndex={clickable ? 0 : undefined}
                  role={clickable ? "button" : undefined}
                  className={cn(
                    "group border-b border-gray-50 last:border-0",
                    clickable && "cursor-pointer hover:bg-blue-50/40 focus-visible:bg-blue-50/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-500",
                  )}
                  title={clickable && !onRowClick ? "클릭하면 이 값으로 필터" : undefined}
                >
                  <td className={cn("relative w-full max-w-0 py-2 pr-3", labelMinWidthClass)}>
                    <div className="absolute inset-y-1 left-0 rounded-md bg-blue-50 transition-colors group-hover:bg-blue-100/70" style={{ width: `${w}%` }} aria-hidden />
                    <div className="relative truncate px-2 text-[13px] font-medium text-gray-800" title={textOf(row) || undefined}>
                      {label(row)}
                    </div>
                  </td>
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        "px-2 py-2 text-[12.5px] tabular-nums text-gray-600 whitespace-nowrap",
                        c.align === "left" ? "text-left" : "text-right",
                        c.className,
                      )}
                    >
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </ScrollableX>
      {rows.length > initialLimit && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-[12px] font-semibold text-blue-600 hover:underline"
        >
          {expanded ? "접기" : `전체 ${fmtInt(rows.length)}개 보기`}
        </button>
      )}
    </div>
  );
}
