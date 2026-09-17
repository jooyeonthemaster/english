"use client";

// ============================================================================
// EngagementTable — 학원별 인게이지먼트 표("이 회원은 계속 쓰고 있다" 뷰).
// 세그먼트 칩 필터 + 학원명 검색(메모리 필터) + 정렬 헤더 + 최근 14일 스파크라인.
// AnalyticsSection(padded=false) 안에 렌더되므로 컨트롤 줄 여백을 직접 둔다.
// ============================================================================

import { useMemo, useState } from "react";
import { cn, formatNumber, formatRelativeTime } from "@/lib/utils";
import {
  AdminEmptyState,
  DataTable,
  DataTableBody,
  DataTableEmpty,
  DataTableHeader,
  FilterChipGroup,
  SearchInput,
  SortHeader,
  StatusBadge,
  Td,
  Th,
  Tr,
} from "@/components/admin/kit";
import { ACADEMY_STATUS } from "@/lib/admin-labels";
import { MiniSparkline } from "./mini-sparkline";
import { AdminHoverDetail } from "@/components/admin/hover-detail/admin-hover-detail";
import {
  ENGAGEMENT_SEGMENT,
  engagementRowDetail,
  planTierMeta,
} from "./engagement-table-parts/engagement-hover-detail";
import {
  SEGMENT_COLORS,
  SEGMENT_LABELS,
  type AcademyEngagement,
  type EngagementSegment,
} from "@/lib/admin-analytics-types";

// 정렬 가능한 컬럼 키.
type SortKey = "totalEvents" | "events7" | "currentStreak" | "signupAt" | "lastActivityAt";
type SortDir = "asc" | "desc";
type SegmentFilter = EngagementSegment | "all";

// 세그먼트 표시 순서(우선순위와 동일하게 직관적으로).
const SEGMENT_ORDER: EngagementSegment[] = [
  "POWER",
  "REGULAR",
  "LIGHT",
  "NEW",
  "DORMANT",
  "SIGNUP_ONLY",
];

const COLUMN_COUNT = 8;

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
  const [activeSegment, setActiveSegment] = useState<SegmentFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("lastActivityAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // 세그먼트별 개수(필터 칩 카운트) — 검색과 무관하게 전체 기준.
  const segmentCounts = useMemo(() => {
    const counts: Partial<Record<SegmentFilter, number>> = { all: rows.length };
    for (const row of rows) counts[row.segment] = (counts[row.segment] ?? 0) + 1;
    return counts;
  }, [rows]);

  const segmentOptions = useMemo(
    () => [
      { key: "all" as SegmentFilter, label: "전체" },
      ...SEGMENT_ORDER.filter((s) => segmentCounts[s]).map((s) => ({
        key: s as SegmentFilter,
        label: SEGMENT_LABELS[s],
      })),
    ],
    [segmentCounts],
  );

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      if (activeSegment !== "all" && row.segment !== activeSegment) return false;
      if (q && !(row.academyName ?? "").toLowerCase().includes(q)) return false;
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

  const sortable = (key: SortKey, label: string) => (
    <SortHeader
      label={label}
      active={sortKey === key}
      order={sortDir}
      onClick={() => toggleSort(key)}
    />
  );
  const ariaSort = (key: SortKey) =>
    sortKey === key ? (sortDir === "asc" ? "ascending" : "descending") : "none";

  return (
    <div>
      {/* 컨트롤 줄: 좌측 세그먼트 칩 · 우측 학원명 검색 */}
      <div className="flex flex-col gap-2 border-b border-gray-100 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
        <FilterChipGroup
          options={segmentOptions}
          value={activeSegment}
          onChange={(key) => setActiveSegment((cur) => (cur === key && key !== "all" ? "all" : key))}
          counts={segmentCounts}
          ariaLabel="세그먼트 필터"
        />
        <SearchInput
          value={search}
          onChange={(v) => setSearch(v.slice(0, 100))}
          placeholder="학원명 검색"
          ariaLabel="학원명 검색"
          className="sm:w-56"
        />
      </div>

      {/* 표 — 스티키 헤더가 붙도록 안쪽 table-container 의 overflow 를 풀어 바깥 div 를 스크롤 컨텍스트로 */}
      <DataTable
        bare
        stickyHeader
        maxHeight={600}
        className="[&_[data-slot=table-container]]:overflow-visible [&_thead]:bg-gray-50"
      >
        <DataTableHeader>
          <Tr>
            <Th>학원</Th>
            <Th>세그먼트</Th>
            <Th aria-sort={ariaSort("signupAt")}>{sortable("signupAt", "가입")}</Th>
            <Th aria-sort={ariaSort("lastActivityAt")}>{sortable("lastActivityAt", "최근 활동")}</Th>
            <Th align="right" aria-sort={ariaSort("totalEvents")}>
              {sortable("totalEvents", "총 활동")}
            </Th>
            <Th align="right" aria-sort={ariaSort("events7")}>
              {sortable("events7", "최근 7일")}
            </Th>
            <Th align="right" aria-sort={ariaSort("currentStreak")}>
              {sortable("currentStreak", "연속")}
            </Th>
            <Th>최근 14일</Th>
          </Tr>
        </DataTableHeader>
        <DataTableBody>
          {visibleRows.length === 0 ? (
            <DataTableEmpty colSpan={COLUMN_COUNT}>
              <AdminEmptyState compact title="조건에 맞는 학원이 없습니다" />
            </DataTableEmpty>
          ) : (
            visibleRows.map((row) => {
              const segColor = SEGMENT_COLORS[row.segment];
              const name = row.academyName || "이름 없음";
              const streakHot = row.currentStreak >= 3;
              return (
                <AdminHoverDetail
                  key={row.academyId}
                  title={name}
                  detail={engagementRowDetail(row)}
                  click={onSelectAcademy ? "none" : "dialog"}
                >
                  <Tr
                    clickable={Boolean(onSelectAcademy)}
                    className={cn(
                      onSelectAcademy && "focus-visible:bg-gray-50/70 focus-visible:outline-none",
                    )}
                    tabIndex={onSelectAcademy ? 0 : undefined}
                    role={onSelectAcademy ? "button" : undefined}
                    aria-label={onSelectAcademy ? `${name} 상세 보기` : undefined}
                    onClick={onSelectAcademy ? () => onSelectAcademy(row.academyId) : undefined}
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
                    <Td className="max-w-[260px]">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate font-medium text-gray-900">{name}</span>
                        <StatusBadge status={planTierMeta(row.planTier)} />
                        {row.academyStatus && row.academyStatus !== "ACTIVE" && (
                          <StatusBadge map={ACADEMY_STATUS} value={row.academyStatus} />
                        )}
                      </div>
                    </Td>

                    {/* 세그먼트 */}
                    <Td>
                      <StatusBadge map={ENGAGEMENT_SEGMENT} value={row.segment} />
                    </Td>

                    {/* 가입 */}
                    <Td className="whitespace-nowrap text-[12px] text-gray-500">
                      {formatRelativeTime(row.signupAt)}
                      <span className="ml-1 text-[11px] tabular-nums text-gray-300">
                        {row.daysSinceSignup}일차
                      </span>
                    </Td>

                    {/* 최근 활동 (hover: 첫 활동 시점) */}
                    <Td
                      className="whitespace-nowrap text-[12px]"
                      title={
                        row.firstActivityAt
                          ? `첫 활동 ${formatRelativeTime(row.firstActivityAt)}`
                          : undefined
                      }
                    >
                      {row.lastActivityAt ? (
                        <span className="text-gray-500">{formatRelativeTime(row.lastActivityAt)}</span>
                      ) : (
                        <span className="text-gray-300">활동 없음</span>
                      )}
                    </Td>

                    <Td align="right">{formatNumber(row.totalEvents)}</Td>
                    <Td align="right" className={cn(row.events7 === 0 && "text-gray-300")}>
                      {formatNumber(row.events7)}
                    </Td>

                    {/* 연속 (hover: 최장 연속) */}
                    <Td
                      align="right"
                      className={cn(streakHot ? "text-violet-600" : "text-gray-400")}
                      title={`최장 ${row.longestStreak}일 연속`}
                    >
                      {formatNumber(row.currentStreak)}
                      <span className="text-[11px] font-normal">일</span>
                    </Td>

                    {/* 최근 14일 스파크라인 */}
                    <Td>
                      <MiniSparkline data={row.sparkline} stroke={segColor} />
                    </Td>
                  </Tr>
                </AdminHoverDetail>
              );
            })
          )}
        </DataTableBody>
      </DataTable>

      {/* 푸터: 표시된 행 수 */}
      <div className="border-t border-gray-100 px-5 py-2.5 text-[11px] tabular-nums text-gray-400">
        {formatNumber(visibleRows.length)}곳 표시 · 전체 {formatNumber(rows.length)}곳
        <span className="ml-1.5 text-gray-300">· 기준 {todayKst} (KST)</span>
      </div>
    </div>
  );
}
