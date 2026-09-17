"use client";

// ============================================================================
// 학원 · 회원 관리 목록 — 학원별(기본) / 회원별 보기.
//   · 데이터는 전체 회원을 한 번에 받고(검색이 전 범위를 훑도록) 클라이언트에서
//     필터·정렬·묶기·페이지(50건) 처리한다.
//   · 선택 집합의 의미는 보기 모드에 따라 다르다(학원별=academyId, 회원별=memberId).
//     "전체 선택"은 현재 페이지에만 적용된다.
//   · 일괄 크레딧 조정은 학원별 보기에서만 활성(학원당 1행 → 이중 적용 원천 차단).
// ============================================================================

import { useCallback, useMemo, useState } from "react";
import { CircleSlash, Users } from "lucide-react";
import { AdminEmptyState, AdminTabs, useUrlTab } from "@/components/admin/kit";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { useSearchDebounce } from "@/hooks/use-search-debounce";
import type { MemberListItem, MemberSortKey } from "@/actions/admin-members";
import { MemberTable } from "./members-list-client/member-table";
import { BulkActionsBar } from "./members-list-client/bulk-actions-bar";
import { AcademyGroupedTable } from "./members-list-client/academy-grouped-table";
import { MembersFilterBar } from "./members-list-client/members-filter-bar";
import { MoveMemberModal } from "./members-list-client/move-member-modal";
import { ACADEMY_COLUMN_DEFS } from "./members-list-client/columns";
import { useColumnWidths } from "./members-list-client/use-column-widths";
import { useMemberListModel } from "./members-list-client/use-member-list-model";
import {
  countOperational,
  INITIAL_OPERATIONAL,
  type OperationalFilters,
} from "./members-list-client/filter-model";
import { INITIAL_FILTERS, type ClientFilters } from "./members-list-client/member-list-model";

const PAGE_SIZE = 50;

export type MembersViewMode = "academy" | "member";

const VIEW_TABS = [
  { key: "academy", label: "학원별" },
  { key: "member", label: "회원별" },
] as const satisfies ReadonlyArray<{ key: MembersViewMode; label: string }>;

interface MembersListClientProps {
  members: MemberListItem[];
  /** ?search= 로 진입했을 때의 초기 검색어 */
  initialSearch?: string;
  /** ?view= 로 진입했을 때의 초기 보기(서버가 searchParams 로 읽어 넘긴다) */
  initialView?: MembersViewMode;
}

export function MembersListClient({
  members,
  initialSearch = "",
  initialView = "academy",
}: MembersListClientProps) {
  // 기본은 학원별 보기. 크레딧이 학원 단위 지갑이라 학원별이 자연스러운 기본이며,
  // 일괄 크레딧 조정도 학원별 보기에서만 활성화된다(이중 적용 방지).
  const [viewMode, setViewMode] = useUrlTab<MembersViewMode>("view", initialView, {
    defaultKey: "academy",
  });
  const [filters, setFilters] = useState<ClientFilters>(INITIAL_FILTERS);
  const [op, setOp] = useState<OperationalFilters>(INITIAL_OPERATIONAL);
  const [page, setPage] = useState(1);

  // 검색: 표시값(searchInput)은 즉시 갱신, 실제 필터 커밋(searchQuery)은 앱 공용
  // useSearchDebounce(250ms)로 통일 — 라이브 필터링·Enter/지우기 즉시 반영.
  const [searchInput, setSearchInput] = useState(initialSearch);
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const commitSearch = useCallback((value: string) => {
    setSearchQuery(value);
    setPage(1);
  }, []);
  const { schedule, flush } = useSearchDebounce(commitSearch);

  // 한 렌더 안의 상대 시간이 모두 같은 기준을 쓰도록 타임스탬프 하나를 고정.
  const renderNow = useMemo(() => Date.now(), [filters, op, searchQuery, members]);

  const {
    sorted,
    academyGroups,
    totalAcademies,
    academyOptions,
    academyToRep,
    counts,
    productOptions,
    hasNoPurchaseMembers,
  } = useMemberListModel(members, filters, op, searchQuery);

  // ── 페이지(50건) — 필터·검색·정렬·보기 전환 시 1페이지로 ──────────────────
  const totalItems = viewMode === "academy" ? academyGroups.length : sorted.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageGroups = useMemo(
    () => academyGroups.slice(pageStart, pageStart + PAGE_SIZE),
    [academyGroups, pageStart],
  );
  const pageMembers = useMemo(
    () => sorted.slice(pageStart, pageStart + PAGE_SIZE),
    [sorted, pageStart],
  );

  function setFilter<K extends keyof ClientFilters>(key: K, value: ClientFilters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }

  function opChange<K extends keyof OperationalFilters>(key: K, value: OperationalFilters[K]) {
    setOp((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }

  function handleSearchChange(value: string) {
    setSearchInput(value);
    if (value === "") flush(""); // 지우면 디바운스 건너뛰고 즉시 빈 검색 커밋
    else schedule(value);
  }

  function resetAll() {
    setFilters(INITIAL_FILTERS);
    setOp(INITIAL_OPERATIONAL);
    setSearchInput("");
    flush("");
  }

  // 3단계 순환: (비활성) → 오름차순 → 내림차순 → 해제(기본순) → 오름차순 …
  function toggleSort(key: MemberSortKey) {
    setFilters((prev) => {
      if (prev.sortKey !== key) return { ...prev, sortKey: key, sortOrder: "asc" };
      if (prev.sortOrder === "asc") return { ...prev, sortOrder: "desc" };
      // 내림차순에서 한 번 더 → 해제(기본 가입일 최신순)
      return { ...prev, sortKey: null, sortOrder: "desc" };
    });
    setPage(1);
  }

  function ariaSortFor(key: MemberSortKey): "ascending" | "descending" | "none" {
    if (filters.sortKey !== key) return "none";
    return filters.sortOrder === "asc" ? "ascending" : "descending";
  }

  // ── 선택 — 학원별=academyId, 회원별=memberId. 모드 전환 시 의미가 달라져 초기화 ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // 학원 이동 모달 대상 회원.
  const [moveTarget, setMoveTarget] = useState<MemberListItem | null>(null);

  function changeViewMode(next: MembersViewMode) {
    if (next === viewMode) return;
    setViewMode(next);
    setSelectedIds(new Set());
    setPage(1);
  }

  const toggleOne = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  // "전체 선택"의 대상 = 현재 페이지에 보이는 행(학원별=academyId, 회원별=memberId).
  const visibleIds = useMemo(
    () =>
      viewMode === "academy" ? pageGroups.map((g) => g.academyId) : pageMembers.map((m) => m.id),
    [viewMode, pageGroups, pageMembers],
  );
  const selectedVisibleCount = useMemo(
    () => visibleIds.reduce((n, id) => n + (selectedIds.has(id) ? 1 : 0), 0),
    [visibleIds, selectedIds],
  );
  const allVisibleSelected = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;
  const headerCheckState: boolean | "indeterminate" = allVisibleSelected
    ? true
    : selectedVisibleCount > 0
      ? "indeterminate"
      : false;

  function toggleAllVisible() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) for (const id of visibleIds) next.delete(id);
      else for (const id of visibleIds) next.add(id);
      return next;
    });
  }

  // 일괄 액션(크레딧 조정·소멸기한·발송/엑셀)에 넘길 memberId 목록.
  // 학원별 보기에선 선택된 학원의 대표 원장 memberId로 변환 → 학원당 1건만 적용.
  const bulkMemberIds = useMemo(() => {
    if (viewMode === "member") return [...selectedIds];
    return [...selectedIds]
      .map((academyId) => academyToRep.get(academyId))
      .filter((id): id is string => Boolean(id));
  }, [viewMode, selectedIds, academyToRep]);

  const { tableWrapRef, columnCssVars, startColumnResize } = useColumnWidths();

  const hasActiveFilter =
    searchQuery.length > 0 ||
    filters.provider !== "all" ||
    filters.active !== "all" ||
    countOperational(op) > 0;

  return (
    <div className="space-y-4">
      {/* 보기 전환: 학원별(기본) / 회원별 — ?view= 에 보존 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <AdminTabs
          tabs={VIEW_TABS}
          value={viewMode}
          onChange={changeViewMode}
          ariaLabel="보기"
          size="sm"
        />
        <span className="text-[12px] text-gray-400">
          {viewMode === "academy"
            ? "학원 단위로 묶어 봅니다 · 크레딧 일괄 조정 가능"
            : "원장 개인 단위로 봅니다 · 발송/엑셀 대상 선택용"}
        </span>
      </div>

      <MembersFilterBar
        searchInput={searchInput}
        onSearchChange={handleSearchChange}
        onSearchEnter={() => flush(searchInput)}
        filters={filters}
        onFilterChange={setFilter}
        op={op}
        onOpChange={opChange}
        counts={counts}
        productOptions={productOptions}
        hasNoPurchaseMembers={hasNoPurchaseMembers}
        hasActiveFilter={hasActiveFilter}
        onReset={resetAll}
      />

      <div className="overflow-hidden rounded-xl border border-gray-100 bg-white">
        <BulkActionsBar
          selectedIds={bulkMemberIds}
          onClear={clearSelection}
          filteredCount={totalItems}
          totalCount={viewMode === "academy" ? totalAcademies : members.length}
          page={currentPage}
          totalPages={totalPages}
          creditEnabled={viewMode === "academy"}
          unitLabel={viewMode === "academy" ? "학원" : "명"}
        />

        {totalItems === 0 ? (
          <AdminEmptyState
            icon={hasActiveFilter ? CircleSlash : Users}
            title={hasActiveFilter ? "조건에 맞는 회원이 없습니다" : "아직 가입한 회원이 없습니다"}
            description={
              hasActiveFilter ? "필터나 검색어를 조정해 보세요" : "첫 가입이 발생하면 여기에 표시됩니다"
            }
          />
        ) : viewMode === "academy" ? (
          <div className="overflow-x-auto" ref={tableWrapRef} style={columnCssVars}>
            <AcademyGroupedTable
              groups={pageGroups}
              columns={ACADEMY_COLUMN_DEFS}
              selectedIds={selectedIds}
              onToggleOne={toggleOne}
              headerCheckState={headerCheckState}
              onToggleAll={toggleAllVisible}
              now={renderNow}
              onMoveMember={setMoveTarget}
              sortKey={filters.sortKey}
              sortOrder={filters.sortOrder}
              onToggleSort={toggleSort}
              ariaSortFor={ariaSortFor}
              onResizeStart={startColumnResize}
            />
          </div>
        ) : (
          <MemberTable
            members={pageMembers}
            selectedIds={selectedIds}
            onToggleOne={toggleOne}
            headerCheckState={headerCheckState}
            onToggleAll={toggleAllVisible}
            now={renderNow}
            sortKey={filters.sortKey}
            sortOrder={filters.sortOrder}
            onToggleSort={toggleSort}
            ariaSortFor={ariaSortFor}
            onResizeStart={startColumnResize}
            wrapRef={tableWrapRef}
            columnCssVars={columnCssVars}
          />
        )}

        <AdminPagination page={currentPage} totalPages={totalPages} onChange={setPage} />
      </div>

      <MoveMemberModal
        open={moveTarget !== null}
        onOpenChange={(next) => {
          if (!next) setMoveTarget(null);
        }}
        member={
          moveTarget
            ? {
                id: moveTarget.id,
                name: moveTarget.name,
                academyId: moveTarget.academy.id,
                academyName: moveTarget.academy.name,
              }
            : null
        }
        academyOptions={academyOptions}
        onDone={() => setMoveTarget(null)}
      />
    </div>
  );
}
