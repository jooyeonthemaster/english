"use client";

// ============================================================================
// AcademyLeaderboard — Top 학원 리더보드 ("이 회원들이 제일 많이 쓴다").
// 지표 토글(활동량 / 연속일 / 최근 7일)로 정렬 후 상위 10곳만 노출.
// 각 행은 클릭 가능(onSelect) — 순위·학원명·플랜 배지·세그먼트 점·
// 선택 지표 값·최근 14일 스파크라인. AnalyticsSection 안에 렌더되므로
// 내부 패딩을 직접 둔다.
// ============================================================================

import { useMemo, useState } from "react";
import { cn, formatNumber } from "@/lib/utils";
import { MiniSparkline } from "./mini-sparkline";
import {
  PLAN_TIER_LABELS,
  SEGMENT_COLORS,
  SEGMENT_LABELS,
  type AcademyEngagement,
} from "@/lib/admin-analytics-types";

// 정렬 기준 지표.
type Metric = "totalEvents" | "currentStreak" | "events7";

const METRICS: Array<{ key: Metric; label: string }> = [
  { key: "totalEvents", label: "활동량" },
  { key: "currentStreak", label: "연속일" },
  { key: "events7", label: "최근 7일" },
];

const TOP_N = 10;

// 상위 3위 강조 색 (인디고 계열, 주황·앰버 금지).
const RANK_TEXT: Record<number, string> = {
  1: "text-indigo-600",
  2: "text-indigo-500",
  3: "text-indigo-400",
};

// 선택 지표 값을 사람이 읽는 문구로.
function metricDisplay(metric: Metric, row: AcademyEngagement): {
  value: number;
  prefix: string;
  suffix: string;
} {
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
        if (b.totalEvents !== a.totalEvents) {
          return b.totalEvents - a.totalEvents;
        }
        if (b.events7 !== a.events7) return b.events7 - a.events7;
        return b.currentStreak - a.currentStreak;
      })
      .slice(0, TOP_N);
  }, [rows, metric]);

  return (
    <div>
      {/* 지표 토글 */}
      <div className="flex items-center justify-end px-5 pt-1 pb-3">
        <div
          role="tablist"
          aria-label="리더보드 정렬 지표"
          className="inline-flex items-center gap-1 rounded-full bg-gray-50 p-0.5"
        >
          {METRICS.map((m) => {
            const active = metric === m.key;
            return (
              <button
                key={m.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setMetric(m.key)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                  active
                    ? "bg-white text-indigo-600 shadow-sm"
                    : "text-gray-500 hover:text-gray-700",
                )}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      {top.length === 0 ? (
        <div className="px-5 py-12 text-center text-[12px] text-gray-300">
          표시할 학원이 없습니다
        </div>
      ) : (
        <ol className="grid grid-cols-1 gap-1.5 px-3 pb-4 lg:grid-cols-2">
          {top.map((row, idx) => {
            const rank = idx + 1;
            const segColor = SEGMENT_COLORS[row.segment];
            const topThree = rank <= 3;
            const { value, prefix, suffix } = metricDisplay(metric, row);
            return (
              <li key={row.academyId}>
                <button
                  type="button"
                  onClick={() => onSelect(row.academyId)}
                  className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-gray-50"
                >
                  {/* 순위 */}
                  <span
                    className={cn(
                      "w-6 shrink-0 text-center tabular-nums",
                      topThree
                        ? cn("text-[15px] font-bold", RANK_TEXT[rank])
                        : "text-[13px] font-semibold text-gray-300",
                    )}
                    aria-hidden
                  >
                    {rank}
                  </span>

                  {/* 학원명 + 플랜 배지 + 세그먼트 점 */}
                  <span className="flex min-w-0 flex-1 items-center gap-1.5">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: segColor }}
                      title={SEGMENT_LABELS[row.segment]}
                      aria-hidden
                    />
                    <span
                      className={cn(
                        "truncate text-[13px] font-medium",
                        topThree ? "text-gray-900" : "text-gray-700",
                      )}
                    >
                      {row.academyName || "이름 없음"}
                    </span>
                    <span
                      className="inline-flex shrink-0 items-center rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500"
                      title={
                        row.planStatus
                          ? `구독 상태: ${row.planStatus}`
                          : "구독 없음"
                      }
                    >
                      {PLAN_TIER_LABELS[row.planTier]}
                    </span>
                  </span>

                  {/* 선택 지표 값 (강조) */}
                  <span className="flex shrink-0 items-baseline gap-0.5 tabular-nums whitespace-nowrap">
                    <span className="text-[10px] text-gray-400">{prefix}</span>
                    <span
                      className={cn(
                        "text-[14px] font-bold",
                        value > 0 ? "text-gray-900" : "text-gray-300",
                      )}
                    >
                      {formatNumber(value)}
                    </span>
                    <span className="text-[10px] text-gray-400">{suffix}</span>
                  </span>

                  {/* 최근 14일 스파크라인 */}
                  <span className="hidden shrink-0 sm:block">
                    <MiniSparkline
                      data={row.sparkline}
                      stroke={segColor}
                      width={72}
                      height={22}
                    />
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
