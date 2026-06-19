"use client";

// ============================================================================
// EngagementTable — 학원별 인게이지먼트 테이블("이 회원은 계속 쓰고 있다" 뷰).
// 세그먼트 칩 필터 + 학원명 검색 + 정렬 가능한 헤더 + 최근 14일 스파크라인.
// AnalyticsSection(bodyClassName="p-0") 안에 렌더되므로 내부 패딩을 직접 둔다.
// ============================================================================

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Search } from "lucide-react";
import { cn, formatNumber, formatRelativeTime } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MiniSparkline } from "./mini-sparkline";
import {
  PLAN_TIER_LABELS,
  SEGMENT_COLORS,
  SEGMENT_LABELS,
  type AcademyEngagement,
  type EngagementSegment,
} from "@/lib/admin-analytics-types";

// 정렬 가능한 컬럼 키.
type SortKey =
  | "totalEvents"
  | "events7"
  | "currentStreak"
  | "signupAt"
  | "lastActivityAt";
type SortDir = "asc" | "desc";

// 세그먼트 표시 순서(우선순위와 동일하게 직관적으로).
const SEGMENT_ORDER: EngagementSegment[] = [
  "POWER",
  "REGULAR",
  "LIGHT",
  "NEW",
  "DORMANT",
  "SIGNUP_ONLY",
];

const ACADEMY_STATUS_LABELS: Record<string, string> = {
  TRIAL: "체험",
  SUSPENDED: "정지",
  DEACTIVATED: "해지",
};

function timestamp(iso: string | null): number {
  if (!iso) return Number.NEGATIVE_INFINITY;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
}

export function EngagementTable({
  rows,
  todayKst,
  onSelectAcademy,
}: {
  rows: AcademyEngagement[];
  todayKst: string;
  onSelectAcademy?: (academyId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [activeSegment, setActiveSegment] = useState<EngagementSegment | "all">(
    "all",
  );
  const [sortKey, setSortKey] = useState<SortKey>("lastActivityAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // 세그먼트별 개수(필터 칩 카운트) — 검색과 무관하게 전체 기준.
  const segmentCounts = useMemo(() => {
    const counts = new Map<EngagementSegment, number>();
    for (const row of rows) {
      counts.set(row.segment, (counts.get(row.segment) ?? 0) + 1);
    }
    return counts;
  }, [rows]);

  const presentSegments = useMemo(
    () => SEGMENT_ORDER.filter((s) => segmentCounts.has(s)),
    [segmentCounts],
  );

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      if (activeSegment !== "all" && row.segment !== activeSegment) {
        return false;
      }
      if (q) {
        const name = (row.academyName ?? "").toLowerCase();
        if (!name.includes(q)) return false;
      }
      return true;
    });

    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === "lastActivityAt" || sortKey === "signupAt") {
        const ta = timestamp(a[sortKey]);
        const tb = timestamp(b[sortKey]);
        // 활동 없음(null) 행은 방향과 무관하게 항상 맨 아래.
        const aNull = ta === Number.NEGATIVE_INFINITY;
        const bNull = tb === Number.NEGATIVE_INFINITY;
        if (aNull && bNull) return b.totalEvents - a.totalEvents;
        if (aNull) return 1;
        if (bNull) return -1;
        if (ta !== tb) return (ta - tb) * dir;
        return b.totalEvents - a.totalEvents;
      }
      const va = a[sortKey];
      const vb = b[sortKey];
      if (va !== vb) return (va - vb) * dir;
      // 동률 → 총 활동 내림차순.
      return b.totalEvents - a.totalEvents;
    });
  }, [rows, search, activeSegment, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  return (
    <div>
      {/* 컨트롤 바: 좌측 세그먼트 칩 · 우측 학원명 검색 */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-5 py-3 border-b border-gray-50">
        <div className="flex items-center gap-1.5 flex-wrap">
          <SegmentChip
            label="전체"
            count={rows.length}
            active={activeSegment === "all"}
            onClick={() => setActiveSegment("all")}
          />
          {presentSegments.map((seg) => (
            <SegmentChip
              key={seg}
              label={SEGMENT_LABELS[seg]}
              count={segmentCounts.get(seg) ?? 0}
              color={SEGMENT_COLORS[seg]}
              active={activeSegment === seg}
              onClick={() =>
                setActiveSegment((cur) => (cur === seg ? "all" : seg))
              }
            />
          ))}
        </div>

        <div className="relative shrink-0">
          <Search
            className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-gray-400"
            strokeWidth={2}
            aria-hidden
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="학원명 검색"
            className="h-8 w-full sm:w-[200px] pl-8 text-[12px]"
            maxLength={100}
            aria-label="학원명 검색"
          />
        </div>
      </div>

      {/* 테이블 — 스크롤 컨테이너가 곧 스티키 컨텍스트가 되도록 raw <table> 사용
          (shadcn Table 은 내부에 overflow-x-auto 래퍼를 둬서 스티키 헤더가 풀림). */}
      <div className="max-h-[600px] overflow-auto">
        <table className="w-full caption-bottom text-sm text-[13px]">
          <TableHeader className="sticky top-0 bg-white z-10 [&_tr]:border-b [&_tr]:border-gray-100">
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-9 px-3 text-[11px] font-medium text-gray-400">
                학원
              </TableHead>
              <TableHead className="h-9 px-3 text-[11px] font-medium text-gray-400">
                세그먼트
              </TableHead>
              <SortHeader
                label="가입"
                sortableKey="signupAt"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
              />
              <SortHeader
                label="최근 활동"
                sortableKey="lastActivityAt"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
              />
              <SortHeader
                label="총 활동"
                sortableKey="totalEvents"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
                className="text-right [&_button]:justify-end [&_button]:w-full"
              />
              <SortHeader
                label="최근 7일"
                sortableKey="events7"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
                className="text-right [&_button]:justify-end [&_button]:w-full"
              />
              <SortHeader
                label="연속"
                sortableKey="currentStreak"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
                className="text-right [&_button]:justify-end [&_button]:w-full"
              />
              <TableHead className="h-9 px-3 text-[11px] font-medium text-gray-400">
                최근 14일
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={8}
                  className="py-12 text-center text-[12px] text-gray-300"
                >
                  조건에 맞는 학원이 없습니다
                </TableCell>
              </TableRow>
            ) : (
              visibleRows.map((row) => {
                const segColor = SEGMENT_COLORS[row.segment];
                const statusLabel =
                  row.academyStatus && row.academyStatus !== "ACTIVE"
                    ? ACADEMY_STATUS_LABELS[row.academyStatus] ??
                      row.academyStatus
                    : null;
                const streakHot = row.currentStreak >= 3;
                return (
                  <TableRow
                    key={row.academyId}
                    className={cn(
                      "border-gray-50",
                      onSelectAcademy &&
                        "cursor-pointer hover:bg-gray-50/70 focus-visible:bg-gray-50/70 focus-visible:outline-none",
                    )}
                    tabIndex={onSelectAcademy ? 0 : undefined}
                    role={onSelectAcademy ? "button" : undefined}
                    aria-label={
                      onSelectAcademy
                        ? `${row.academyName ?? "학원"} 상세 보기`
                        : undefined
                    }
                    onClick={
                      onSelectAcademy
                        ? () => onSelectAcademy(row.academyId)
                        : undefined
                    }
                    onKeyDown={
                      onSelectAcademy
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              onSelectAcademy(row.academyId);
                            }
                          }
                        : undefined
                    }
                  >
                    {/* 학원 */}
                    <TableCell className="px-3 py-2.5 max-w-[260px]">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="truncate text-[13px] font-medium text-gray-800">
                          {row.academyName || "이름 없음"}
                        </span>
                        <span
                          className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-500 shrink-0"
                          title={
                            row.planStatus
                              ? `구독 상태: ${row.planStatus}`
                              : "구독 없음"
                          }
                        >
                          {PLAN_TIER_LABELS[row.planTier]}
                        </span>
                        {statusLabel && (
                          <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-rose-50 text-rose-500 shrink-0">
                            {statusLabel}
                          </span>
                        )}
                      </div>
                    </TableCell>

                    {/* 세그먼트 */}
                    <TableCell className="px-3 py-2.5">
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap"
                        style={{
                          backgroundColor: `${segColor}1A`,
                          color: segColor,
                        }}
                      >
                        {SEGMENT_LABELS[row.segment]}
                      </span>
                    </TableCell>

                    {/* 가입 */}
                    <TableCell className="px-3 py-2.5 text-[12px] text-gray-500 whitespace-nowrap">
                      {formatRelativeTime(row.signupAt)}
                      <span className="ml-1 text-[11px] text-gray-300 tabular-nums">
                        {row.daysSinceSignup}일차
                      </span>
                    </TableCell>

                    {/* 최근 활동 (hover: 첫 활동 시점) */}
                    <TableCell
                      className="px-3 py-2.5 text-[12px] whitespace-nowrap"
                      title={
                        row.firstActivityAt
                          ? `첫 활동 ${formatRelativeTime(row.firstActivityAt)}`
                          : undefined
                      }
                    >
                      {row.lastActivityAt ? (
                        <span className="text-gray-500">
                          {formatRelativeTime(row.lastActivityAt)}
                        </span>
                      ) : (
                        <span className="text-gray-300">활동 없음</span>
                      )}
                    </TableCell>

                    {/* 총 활동 */}
                    <TableCell className="px-3 py-2.5 text-right text-[12px] text-gray-700 tabular-nums">
                      {formatNumber(row.totalEvents)}
                    </TableCell>

                    {/* 최근 7일 */}
                    <TableCell className="px-3 py-2.5 text-right text-[12px] tabular-nums">
                      <span
                        className={cn(
                          row.events7 > 0 ? "text-gray-700" : "text-gray-300",
                        )}
                      >
                        {formatNumber(row.events7)}
                      </span>
                    </TableCell>

                    {/* 연속 (hover: 최장 연속) */}
                    <TableCell
                      className="px-3 py-2.5 text-right text-[12px] tabular-nums"
                      title={`최장 ${row.longestStreak}일 연속`}
                    >
                      <span
                        className={cn(
                          "font-medium",
                          streakHot ? "text-indigo-600" : "text-gray-400",
                        )}
                      >
                        {formatNumber(row.currentStreak)}
                        <span className="text-[11px] font-normal">일</span>
                      </span>
                    </TableCell>

                    {/* 최근 14일 스파크라인 */}
                    <TableCell className="px-3 py-2.5">
                      <MiniSparkline data={row.sparkline} stroke={segColor} />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </table>
      </div>

      {/* 푸터: 표시된 행 수 */}
      <div className="px-5 py-2.5 border-t border-gray-50 text-[11px] text-gray-400 tabular-nums">
        {formatNumber(visibleRows.length)}곳 표시 · 전체 {formatNumber(rows.length)}곳
        <span className="ml-1.5 text-gray-300">· 기준 {todayKst} (KST)</span>
      </div>
    </div>
  );
}

function SortHeader({
  label,
  sortableKey,
  sortKey,
  sortDir,
  onSort,
  className,
}: {
  label: string;
  sortableKey: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = sortKey === sortableKey;
  return (
    <TableHead
      className={cn(
        "h-9 px-3 text-[11px] font-medium text-gray-400 select-none cursor-pointer hover:text-gray-600 transition-colors",
        className,
      )}
      aria-sort={
        active ? (sortDir === "asc" ? "ascending" : "descending") : "none"
      }
    >
      <button
        type="button"
        onClick={() => onSort(sortableKey)}
        className="inline-flex items-center gap-1 tabular-nums"
      >
        {label}
        {active &&
          (sortDir === "asc" ? (
            <ChevronUp className="size-3 text-gray-500" strokeWidth={2.2} aria-hidden />
          ) : (
            <ChevronDown className="size-3 text-gray-500" strokeWidth={2.2} aria-hidden />
          ))}
      </button>
    </TableHead>
  );
}

function SegmentChip({
  label,
  count,
  color,
  active,
  onClick,
}: {
  label: string;
  count: number;
  color?: string;
  active: boolean;
  onClick: () => void;
}) {
  const activeStyle =
    active && color
      ? { backgroundColor: `${color}1A`, color }
      : undefined;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
        active
          ? color
            ? ""
            : "bg-gray-800 text-white"
          : "bg-gray-50 text-gray-500 hover:bg-gray-100",
      )}
      style={activeStyle}
    >
      {label}
      <span
        className={cn(
          "tabular-nums",
          active ? "opacity-70" : "text-gray-400",
        )}
      >
        {formatNumber(count)}
      </span>
    </button>
  );
}
