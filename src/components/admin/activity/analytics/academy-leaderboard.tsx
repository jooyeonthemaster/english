"use client";

// ============================================================================
// AcademyLeaderboard — Top 학원 리더보드 ("이 회원들이 제일 많이 쓴다").
// 지표 칩(활동량 / 연속일 / 최근 7일)으로 정렬 후 상위 10곳만 표로 노출.
// 각 행은 클릭 가능(onSelect) — 순위·학원명·플랜 뱃지·세그먼트 점·
// 선택 지표 값·최근 14일 스파크라인. 호버 상세는 행에 붙는다(클릭은 드릴다운 유지).
// ============================================================================

import { useMemo, useState } from "react";
import { cn, formatNumber } from "@/lib/utils";
import {
  AdminEmptyState,
  DataTable,
  DataTableBody,
  DataTableHeader,
  FilterChipGroup,
  StatusBadge,
  Td,
  Th,
  Tr,
} from "@/components/admin/kit";
import { MiniSparkline } from "./mini-sparkline";
import { AdminHoverDetail } from "@/components/admin/hover-detail/admin-hover-detail";
import {
  engagementRowDetail,
  planTierMeta,
} from "./engagement-table-parts/engagement-hover-detail";
import {
  SEGMENT_COLORS,
  SEGMENT_LABELS,
  type AcademyEngagement,
} from "@/lib/admin-analytics-types";

// 정렬 기준 지표.
type Metric = "totalEvents" | "currentStreak" | "events7";

const METRICS: ReadonlyArray<{ key: Metric; label: string }> = [
  { key: "totalEvents", label: "활동량" },
  { key: "currentStreak", label: "연속일" },
  { key: "events7", label: "최근 7일" },
];

const TOP_N = 10;

// 상위 3위 강조 색.
const RANK_TEXT: Record<number, string> = {
  1: "text-blue-600",
  2: "text-blue-500",
  3: "text-blue-400",
};

// 선택 지표 값을 사람이 읽는 문구로.
function metricDisplay(
  metric: Metric,
  row: AcademyEngagement,
): { value: number; prefix: string; suffix: string } {
  switch (metric) {
    case "currentStreak":
      return { value: row.currentStreak, prefix: "연속 ", suffix: "일" };
    case "events7":
      return { value: row.events7, prefix: "최근7일 ", suffix: "건" };
    case "totalEvents":
    default:
      return { value: row.totalEvents, prefix: "총 활동 ", suffix: "건" };
  }
}

export function AcademyLeaderboard({
  rows,
  onSelect,
}: {
  rows: AcademyEngagement[];
  onSelect: (academyId: string) => void;
}) {
  const [metric, setMetric] = useState<Metric>("totalEvents");

  // 선택 지표 내림차순 → 상위 N. 동률은 총 활동 → 최근 7일 → 연속일 순.
  const top = useMemo(() => {
    return [...rows]
      .sort((a, b) => {
        const diff = b[metric] - a[metric];
        if (diff !== 0) return diff;
        if (b.totalEvents !== a.totalEvents) return b.totalEvents - a.totalEvents;
        if (b.events7 !== a.events7) return b.events7 - a.events7;
        return b.currentStreak - a.currentStreak;
      })
      .slice(0, TOP_N);
  }, [rows, metric]);

  const metricLabel = METRICS.find((m) => m.key === metric)?.label ?? "";

  return (
    <div>
      <div className="flex items-center justify-end px-5 py-3">
        <FilterChipGroup
          options={METRICS}
          value={metric}
          onChange={setMetric}
          ariaLabel="리더보드 정렬 지표"
        />
      </div>

      {top.length === 0 ? (
        <AdminEmptyState compact title="표시할 학원이 없습니다" />
      ) : (
        <DataTable bare>
          <DataTableHeader>
            <Tr>
              <Th align="center" className="w-14">
                순위
              </Th>
              <Th>학원</Th>
              <Th align="right">{metricLabel}</Th>
              <Th className="w-28">최근 14일</Th>
            </Tr>
          </DataTableHeader>
          <DataTableBody>
            {top.map((row, idx) => {
              const rank = idx + 1;
              const segColor = SEGMENT_COLORS[row.segment];
              const topThree = rank <= 3;
              const { value, prefix, suffix } = metricDisplay(metric, row);
              const name = row.academyName || "이름 없음";
              return (
                <AdminHoverDetail
                  key={row.academyId}
                  title={name}
                  detail={engagementRowDetail(row)}
                  click="none"
                >
                  <Tr
                    clickable
                    role="button"
                    tabIndex={0}
                    aria-label={`${name} 상세 보기`}
                    onClick={() => onSelect(row.academyId)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelect(row.academyId);
                      }
                    }}
                    className="focus-visible:bg-gray-50/70 focus-visible:outline-none"
                  >
                    <Td align="center">
                      <span
                        className={cn(
                          "tabular-nums",
                          topThree
                            ? cn("text-[15px] font-bold", RANK_TEXT[rank])
                            : "font-semibold text-gray-300",
                        )}
                      >
                        {rank}
                      </span>
                    </Td>
                    <Td>
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ backgroundColor: segColor }}
                          title={SEGMENT_LABELS[row.segment]}
                          aria-hidden
                        />
                        <span
                          className={cn(
                            "truncate font-medium",
                            topThree ? "text-gray-900" : "text-gray-700",
                          )}
                        >
                          {name}
                        </span>
                        <StatusBadge status={planTierMeta(row.planTier)} />
                      </div>
                    </Td>
                    <Td align="right">
                      <span className="whitespace-nowrap">
                        <span className="text-[11px] font-normal text-gray-400">{prefix}</span>
                        <span className={cn("text-[15px] font-bold", value === 0 && "text-gray-300")}>
                          {formatNumber(value)}
                        </span>
                        <span className="text-[11px] font-normal text-gray-400">{suffix}</span>
                      </span>
                    </Td>
                    <Td>
                      <MiniSparkline data={row.sparkline} stroke={segColor} width={72} height={22} />
                    </Td>
                  </Tr>
                </AdminHoverDetail>
              );
            })}
          </DataTableBody>
        </DataTable>
      )}
    </div>
  );
}
