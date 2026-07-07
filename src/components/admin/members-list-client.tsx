"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useSearchDebounce } from "@/hooks/use-search-debounce";
import type {
  MemberListItem,
  ProviderFilter,
  ActiveFilter,
  MemberSortKey,
  SortOrder,
} from "@/actions/admin-members";
import { MemberRow, MemberCard } from "./members-list-client/member-row";
import { BulkActionsBar } from "./members-list-client/bulk-actions-bar";
import {
  EmptyState,
  FilterPill,
  SortHeader,
  SegmentedTabs,
  ColumnResizeHandle,
} from "./members-list-client/subcomponents";
import {
  AcademyGroupedTable,
  type AcademyGroup,
} from "./members-list-client/academy-grouped-table";
import { MoveMemberModal } from "./members-list-client/move-member-modal";
import {
  FilterDropdown,
  DropdownOptions,
} from "./members-list-client/filter-dropdown";
import {
  countOperational,
  INITIAL_OPERATIONAL,
  type OperationalFilters,
} from "./members-list-client/filter-model";

// 저잔고 기준 — member-row 의 BalanceCell 강조 임계값과 동일하게 맞춘다.
const LOW_BALANCE_THRESHOLD = 50;

interface MembersListClientProps {
  members: MemberListItem[];
}

const PROVIDER_TABS: Array<{ key: ProviderFilter; label: string }> = [
  { key: "all", label: "전체" },
  { key: "google", label: "Google" },
  { key: "kakao", label: "Kakao" },
  { key: "other", label: "기타" },
];

const ACTIVE_TABS: Array<{ key: ActiveFilter; label: string }> = [
  { key: "all", label: "전체" },
  { key: "active", label: "활성" },
  { key: "inactive", label: "비활성" },
];

// 드롭다운 트리거 요약에 쓰는 라벨(선택된 값 표시용).
const PROVIDER_LABEL: Record<Exclude<ProviderFilter, "all">, string> = {
  google: "Google",
  kakao: "Kakao",
  other: "기타",
};
const STATUS_LABEL: Record<Exclude<ActiveFilter, "all">, string> = {
  active: "활성",
  inactive: "비활성",
};

/** "2026-07-01" → "07.01" (가입일 범위 요약용). */
function shortDate(s: string): string {
  const parts = s.split("-");
  return parts.length === 3 ? `${parts[1]}.${parts[2]}` : s;
}
function signupSummary(from: string, to: string): string | undefined {
  if (from && to) return `${shortDate(from)}~${shortDate(to)}`;
  if (from) return `${shortDate(from)}~`;
  if (to) return `~${shortDate(to)}`;
  return undefined;
}

// 정렬은 헤더 클릭 시 오름차순 → 내림차순 → 해제(기본순) 3단계로 순환한다.
// 해제 상태(sortKey=null)에서는 가입일 최신순으로 정렬되고 활성 컬럼 표시가 없다.

// 문자 상태 순위: 내부(0) → 발송 제외(1) → 발송 가능(2).
function smsRank(m: { isInternal: boolean; smsOptOut: boolean }): number {
  if (m.isInternal) return 0;
  if (m.smsOptOut) return 1;
  return 2;
}

// ── 리사이즈 가능한 데이터 컬럼 정의 (체크박스/화살표 열은 고정) ──────────────
// 회원별·학원별 두 보기의 컬럼을 하나의 너비 맵(colWidths)으로 관리한다.
type ColumnId =
  // 회원별 보기
  | "name"
  | "academyName"
  | "plan"
  | "balance"
  | "expiresAt"
  | "createdAt"
  | "lastActiveAt"
  | "sms"
  // 학원별 보기
  | "acaName"
  | "acaMembers"
  | "acaPlan"
  | "acaBalance"
  | "acaExpiry";

export interface ResizableColumnDef {
  id: ColumnId;
  label: string;
  sortKey: MemberSortKey;
  defaultWidth: number;
  responsive?: string;
  align?: "right";
  headPad?: string;
}

const COLUMN_DEFS: ResizableColumnDef[] = [
  { id: "name", label: "회원", sortKey: "name", defaultWidth: 240, headPad: "pl-3" },
  { id: "academyName", label: "학원", sortKey: "academyName", defaultWidth: 200, responsive: "hidden xl:table-cell" },
  { id: "plan", label: "최근 구입 상품", sortKey: "plan", defaultWidth: 180 },
  { id: "balance", label: "크레딧", sortKey: "balance", defaultWidth: 120, align: "right" },
  { id: "expiresAt", label: "소멸시효", sortKey: "expiresAt", defaultWidth: 140 },
  { id: "createdAt", label: "가입일", sortKey: "createdAt", defaultWidth: 120, responsive: "hidden xl:table-cell" },
  { id: "lastActiveAt", label: "최근 활동", sortKey: "lastActiveAt", defaultWidth: 130, responsive: "hidden 2xl:table-cell" },
  { id: "sms", label: "문자", sortKey: "sms", defaultWidth: 96, responsive: "hidden lg:table-cell" },
];

// 학원별 보기 컬럼. sortKey는 회원 정렬 파이프라인(sorted)을 재사용한다:
// academyName/name/plan/balance/expiresAt로 정렬하면 그룹 순서가 그대로 따라온다.
const ACADEMY_COLUMN_DEFS: ResizableColumnDef[] = [
  { id: "acaName", label: "학원", sortKey: "academyName", defaultWidth: 280, headPad: "pl-3" },
  { id: "acaMembers", label: "소속 회원", sortKey: "name", defaultWidth: 280 },
  { id: "acaPlan", label: "최근 구입 상품", sortKey: "plan", defaultWidth: 180 },
  { id: "acaBalance", label: "크레딧", sortKey: "balance", defaultWidth: 120, align: "right" },
  { id: "acaExpiry", label: "소멸시효", sortKey: "expiresAt", defaultWidth: 140 },
];

const ALL_COLUMN_DEFS = [...COLUMN_DEFS, ...ACADEMY_COLUMN_DEFS];

const COLUMN_WIDTH_STORAGE_KEY = "admin.members.columnWidths.v1";
// 드래그로 줄일 수 있는 하한(핸들·아이콘이 눌릴 최소 폭). 이보다 아래로는 표가
// 깨지므로 막는다. 상한은 넉넉히 둔다.
const MIN_COLUMN_WIDTH = 48;
const MAX_COLUMN_WIDTH = 1200;

type ColumnWidths = Record<ColumnId, number>;

const DEFAULT_COLUMN_WIDTHS = Object.fromEntries(
  ALL_COLUMN_DEFS.map((c) => [c.id, c.defaultWidth]),
) as ColumnWidths;

interface ClientFilters {
  provider: ProviderFilter;
  active: ActiveFilter;
  sortKey: MemberSortKey | null; // null = 해제(기본 정렬)
  sortOrder: SortOrder;
}

const INITIAL_FILTERS: ClientFilters = {
  provider: "all",
  active: "all",
  sortKey: null,
  sortOrder: "desc",
};

type ViewMode = "academy" | "member";

export function MembersListClient({ members }: MembersListClientProps) {
  // 기본은 학원별 보기. 크레딧이 학원 단위 지갑이라 학원별이 자연스러운 기본이며,
  // 일괄 크레딧 조정도 학원별 보기에서만 활성화된다(이중 적용 방지).
  const [viewMode, setViewMode] = useState<ViewMode>("academy");
  const [filters, setFilters] = useState<ClientFilters>(INITIAL_FILTERS);
  const [op, setOp] = useState<OperationalFilters>(INITIAL_OPERATIONAL);

  // 검색: 표시값(searchInput)은 즉시 갱신, 실제 필터 커밋(searchQuery)은 앱 공용
  // useSearchDebounce(250ms)로 통일 — 라이브 필터링·Enter/지우기 즉시 반영.
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const { schedule, flush } = useSearchDebounce(setSearchQuery);

  // Single timestamp for the entire render so all relative-times are coherent.
  const renderNow = useMemo(
    () => Date.now(),
    [filters, op, searchQuery, members],
  );

  function opChange<K extends keyof OperationalFilters>(
    key: K,
    value: OperationalFilters[K],
  ) {
    setOp((prev) => ({ ...prev, [key]: value }));
  }

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    // 가입일 범위 — from 은 그 날 00:00, to 는 그 날 23:59:59.999 로 포함(inclusive).
    const fromTs = op.signupFrom ? new Date(op.signupFrom).setHours(0, 0, 0, 0) : null;
    const toTs = op.signupTo ? new Date(op.signupTo).setHours(23, 59, 59, 999) : null;

    return members.filter((m) => {
      if (filters.provider !== "all") {
        if (filters.provider === "google" && m.authProvider !== "google") return false;
        if (filters.provider === "kakao" && m.authProvider !== "kakao") return false;
        if (
          filters.provider === "other" &&
          (m.authProvider === "google" || m.authProvider === "kakao")
        )
          return false;
      }
      if (filters.active === "active" && !m.isActive) return false;
      if (filters.active === "inactive" && m.isActive) return false;

      // 구입: "has"=구입 있음, "none"=구입 없음, 그 외는 최근 구입 상품명 일치
      if (op.purchase === "has") {
        if (!m.latestPurchase) return false;
      } else if (op.purchase === "none") {
        if (m.latestPurchase) return false;
      } else if (op.purchase !== "all") {
        if (m.latestPurchase?.name !== op.purchase) return false;
      }
      if (op.lowBalance) {
        if ((m.creditBalance?.balance ?? 0) >= LOW_BALANCE_THRESHOLD) return false;
      }
      if (op.marketing === "consented" && !m.marketingConsent) return false;
      if (op.marketing === "none" && m.marketingConsent) return false;
      if (op.sms === "excluded" && !m.smsOptOut) return false;
      if (op.sms === "included" && m.smsOptOut) return false;
      if (fromTs !== null || toTs !== null) {
        const created = new Date(m.createdAt).getTime();
        if (fromTs !== null && created < fromTs) return false;
        if (toTs !== null && created > toTs) return false;
      }

      if (q) {
        const hay =
          `${m.name} ${m.email} ${m.academy.name} ${m.academy.memo ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [members, filters.provider, filters.active, op, searchQuery]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = filters.sortOrder === "asc" ? 1 : -1;
    const key = filters.sortKey;
    arr.sort((a, b) => {
      switch (key) {
        case "balance":
          return ((a.creditBalance?.balance ?? 0) - (b.creditBalance?.balance ?? 0)) * dir;
        case "lastActiveAt":
          return (
            ((a.lastActiveAt ? new Date(a.lastActiveAt).getTime() : 0) -
              (b.lastActiveAt ? new Date(b.lastActiveAt).getTime() : 0)) *
            dir
          );
        case "name":
          return a.name.localeCompare(b.name, "ko") * dir;
        case "academyName":
          return a.academy.name.localeCompare(b.academy.name, "ko") * dir;
        case "plan": {
          // "최근 구입 상품" — 최근 구입일 기준(구입 이력 없으면 맨 뒤).
          const av = a.latestPurchase
            ? new Date(a.latestPurchase.purchasedAt).getTime()
            : 0;
          const bv = b.latestPurchase
            ? new Date(b.latestPurchase.purchasedAt).getTime()
            : 0;
          return (av - bv) * dir;
        }
        case "expiresAt": {
          // 소멸일 없음(무기한 취급)은 항상 맨 뒤로.
          const av = a.creditBalance?.expiresAt
            ? new Date(a.creditBalance.expiresAt).getTime()
            : Infinity;
          const bv = b.creditBalance?.expiresAt
            ? new Date(b.creditBalance.expiresAt).getTime()
            : Infinity;
          if (av === bv) return 0;
          if (av === Infinity) return 1;
          if (bv === Infinity) return -1;
          return (av - bv) * dir;
        }
        case "sms":
          return (smsRank(a) - smsRank(b)) * dir;
        default:
          return (
            (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir
          );
      }
    });
    return arr;
  }, [filtered, filters.sortKey, filters.sortOrder]);

  // 학원별 보기 = 학원(크레딧·플랜의 실제 단위)을 앞·강조로 두고 소속 회원(원장)을
  // 그 옆에 약하게 나열한다. 필터+정렬된 순서를 유지하며 academyId로 묶는다.
  const academyGroups = useMemo<AcademyGroup[]>(() => {
    const map = new Map<string, AcademyGroup>();
    for (const m of sorted) {
      let g = map.get(m.academy.id);
      if (!g) {
        g = {
          academyId: m.academy.id,
          academyName: m.academy.name,
          slug: m.academy.slug,
          status: m.academy.status,
          memo: m.academy.memo,
          latestPurchase: m.latestPurchase,
          creditBalance: m.creditBalance,
          members: [],
        };
        map.set(m.academy.id, g);
      }
      g.members.push(m);
    }
    return [...map.values()];
  }, [sorted]);

  const totalAcademies = useMemo(
    () => new Set(members.map((m) => m.academy.id)).size,
    [members],
  );

  // 학원 이동 모달의 대상 학원 후보 — 로드된 회원의 소속 학원(중복 제거).
  const academyOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string; slug: string }>();
    for (const m of members) {
      if (!map.has(m.academy.id)) {
        map.set(m.academy.id, {
          id: m.academy.id,
          name: m.academy.name,
          slug: m.academy.slug,
        });
      }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }, [members]);

  // academyId → 대표 원장 memberId(일괄 조정 대상, 학원당 1건만 적용).
  const academyToRep = useMemo(
    () => new Map(academyGroups.map((g) => [g.academyId, g.members[0]?.id])),
    [academyGroups],
  );

  // 선택 집합의 의미는 보기 모드에 따라 다르다:
  //   · 학원별 → academyId    · 회원별 → memberId
  // 모드 전환 시 의미가 달라지므로 초기화한다.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // 학원 이동 모달 대상 회원.
  const [moveTarget, setMoveTarget] = useState<MemberListItem | null>(null);

  function changeViewMode(next: ViewMode) {
    if (next === viewMode) return;
    setViewMode(next);
    setSelectedIds(new Set());
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

  // 현재 화면(필터 적용)에 보이는 선택 대상 id. 학원별=academyId, 회원별=memberId.
  const visibleIds = useMemo(
    () =>
      viewMode === "academy"
        ? academyGroups.map((g) => g.academyId)
        : sorted.map((m) => m.id),
    [viewMode, academyGroups, sorted],
  );
  const selectedVisibleCount = useMemo(
    () => visibleIds.reduce((n, id) => n + (selectedIds.has(id) ? 1 : 0), 0),
    [visibleIds, selectedIds],
  );
  const allVisibleSelected =
    visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;
  const headerCheckState: boolean | "indeterminate" = allVisibleSelected
    ? true
    : selectedVisibleCount > 0
      ? "indeterminate"
      : false;

  function toggleAllVisible() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const id of visibleIds) next.delete(id);
      } else {
        for (const id of visibleIds) next.add(id);
      }
      return next;
    });
  }

  function setFilter<K extends keyof ClientFilters>(
    key: K,
    value: ClientFilters[K],
  ) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  // 3단계 순환: (비활성) → 오름차순 → 내림차순 → 해제(기본순) → 오름차순 …
  function toggleSort(key: MemberSortKey) {
    setFilters((prev) => {
      if (prev.sortKey !== key) {
        return { ...prev, sortKey: key, sortOrder: "asc" };
      }
      if (prev.sortOrder === "asc") {
        return { ...prev, sortOrder: "desc" };
      }
      // 내림차순에서 한 번 더 → 해제(기본 가입일 최신순)
      return { ...prev, sortKey: null, sortOrder: "desc" };
    });
  }

  function ariaSortFor(
    key: MemberSortKey,
  ): "ascending" | "descending" | "none" {
    if (filters.sortKey !== key) return "none";
    return filters.sortOrder === "asc" ? "ascending" : "descending";
  }

  // ── 컬럼 너비(드래그 조절 + localStorage 유지) ──────────────────────────────
  const tableWrapRef = useRef<HTMLDivElement>(null);
  const [colWidths, setColWidths] = useState<ColumnWidths>(DEFAULT_COLUMN_WIDTHS);

  // 초기값은 서버/클라 동일(기본값)로 렌더한 뒤, 마운트 후 저장값을 반영해
  // hydration 불일치를 피한다.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLUMN_WIDTH_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<Record<ColumnId, number>>;
      setColWidths((prev) => {
        const next = { ...prev };
        for (const c of ALL_COLUMN_DEFS) {
          const v = saved[c.id];
          if (typeof v === "number" && Number.isFinite(v)) {
            next[c.id] = Math.min(Math.max(v, MIN_COLUMN_WIDTH), MAX_COLUMN_WIDTH);
          }
        }
        return next;
      });
    } catch {
      /* 저장값이 손상됐으면 기본값 유지 */
    }
  }, []);

  const columnCssVars = useMemo(
    () =>
      Object.fromEntries(
        ALL_COLUMN_DEFS.map((c) => [`--mw-${c.id}`, `${colWidths[c.id]}px`]),
      ) as CSSProperties,
    [colWidths],
  );

  // 드래그 중에는 CSS 변수만 즉시 갱신(행 리렌더 없음), 놓을 때 상태 반영 + 저장.
  function startColumnResize(e: React.PointerEvent, id: ColumnId) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = colWidths[id];
    const wrap = tableWrapRef.current;
    let width = startW;
    const onMove = (ev: PointerEvent) => {
      width = Math.min(
        Math.max(startW + (ev.clientX - startX), MIN_COLUMN_WIDTH),
        MAX_COLUMN_WIDTH,
      );
      wrap?.style.setProperty(`--mw-${id}`, `${width}px`);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      setColWidths((prev) => {
        const next = { ...prev, [id]: width };
        try {
          localStorage.setItem(COLUMN_WIDTH_STORAGE_KEY, JSON.stringify(next));
        } catch {
          /* 저장 실패는 무시 */
        }
        return next;
      });
    };
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function clearSearch() {
    setSearchInput("");
    flush(""); // 지우면 디바운스 건너뛰고 즉시 빈 검색 커밋
  }

  function resetAll() {
    setFilters(INITIAL_FILTERS);
    setOp(INITIAL_OPERATIONAL);
    clearSearch();
  }

  const counts = useMemo(() => {
    const total = members.length;
    const google = members.filter((m) => m.authProvider === "google").length;
    const kakao = members.filter((m) => m.authProvider === "kakao").length;
    const other = total - google - kakao;
    const active = members.filter((m) => m.isActive).length;
    const inactive = total - active;
    return { total, google, kakao, other, active, inactive };
  }, [members]);

  // 상세필터 구입 상품 옵션 — 목록에 실제 존재하는 "최근 구입 상품명"만 노출.
  const { productOptions, hasNoPurchaseMembers } = useMemo(() => {
    const names = new Set<string>();
    let noPurchase = false;
    for (const m of members) {
      if (m.latestPurchase?.name) names.add(m.latestPurchase.name);
      else noPurchase = true;
    }
    return {
      productOptions: [...names].sort((a, b) => a.localeCompare(b, "ko")),
      hasNoPurchaseMembers: noPurchase,
    };
  }, [members]);

  const providerCount = (key: ProviderFilter) =>
    key === "google"
      ? counts.google
      : key === "kakao"
        ? counts.kakao
        : key === "other"
          ? counts.other
          : counts.total;
  const activeCount = (key: ActiveFilter) =>
    key === "active" ? counts.active : key === "inactive" ? counts.inactive : counts.total;

  // 일괄 액션(크레딧 조정·소멸기한·발송/엑셀)에 넘길 memberId 목록.
  // 학원별 보기에선 선택된 학원의 대표 원장 memberId로 변환 → 학원당 1건만 적용.
  const bulkMemberIds = useMemo(() => {
    if (viewMode === "member") return [...selectedIds];
    return [...selectedIds]
      .map((academyId) => academyToRep.get(academyId))
      .filter((id): id is string => Boolean(id));
  }, [viewMode, selectedIds, academyToRep]);

  const opActiveCount = countOperational(op);
  const hasActiveFilter =
    searchQuery.length > 0 ||
    filters.provider !== "all" ||
    filters.active !== "all" ||
    opActiveCount > 0;

  return (
    <div className="space-y-4">
      {/* 보기 전환: 학원별(기본) / 회원별 */}
      <div className="flex items-center justify-between gap-3">
        <SegmentedTabs<ViewMode>
          label="보기"
          value={viewMode}
          onChange={changeViewMode}
          options={[
            { key: "academy", label: "학원별" },
            { key: "member", label: "회원별" },
          ]}
        />
        <span className="text-[11.5px] text-gray-400">
          {viewMode === "academy"
            ? "학원 단위로 묶어 봅니다 · 크레딧 일괄 조정 가능"
            : "원장 개인 단위로 봅니다 · 발송/엑셀 대상 선택용"}
        </span>
      </div>

      {/* Toolbar: 검색 + 필터 드롭다운을 한 줄에(좁아지면 자동 줄바꿈) */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full min-w-[200px] sm:w-72">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400"
              strokeWidth={1.8}
              aria-hidden="true"
            />
            <Input
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                schedule(e.target.value);
              }}
              onKeyDown={(e) => e.key === "Enter" && flush(searchInput)}
              placeholder="이름·이메일·학원·메모 검색"
              className="pl-9! pr-9! h-9 text-[13px] bg-gray-50 border-gray-100 focus-visible:bg-white"
              aria-label="회원 검색"
            />
            {searchInput && (
              <button
                type="button"
                onClick={clearSearch}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 inline-flex size-5 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                aria-label="검색 지우기"
              >
                <X className="size-3.5" strokeWidth={2} aria-hidden />
              </button>
            )}
          </div>
          <FilterDropdown
            label="가입경로"
            active={filters.provider !== "all"}
            summary={
              filters.provider !== "all"
                ? PROVIDER_LABEL[filters.provider]
                : undefined
            }
          >
            <DropdownOptions>
              {PROVIDER_TABS.map((t) => (
                <FilterPill
                  key={t.key}
                  active={filters.provider === t.key}
                  onClick={() => setFilter("provider", t.key)}
                  label={t.label}
                  count={t.key === "all" ? undefined : providerCount(t.key)}
                />
              ))}
            </DropdownOptions>
          </FilterDropdown>

          <FilterDropdown
            label="상태"
            active={filters.active !== "all"}
            summary={
              filters.active !== "all" ? STATUS_LABEL[filters.active] : undefined
            }
          >
            <DropdownOptions>
              {ACTIVE_TABS.map((t) => (
                <FilterPill
                  key={t.key}
                  active={filters.active === t.key}
                  onClick={() => setFilter("active", t.key)}
                  label={t.label}
                  count={t.key === "all" ? undefined : activeCount(t.key)}
                />
              ))}
            </DropdownOptions>
          </FilterDropdown>

          <FilterDropdown
            label="구입 상품"
            active={op.purchase !== "all"}
            summary={
              op.purchase === "has"
                ? "구입함"
                : op.purchase === "none"
                  ? "미구입"
                  : op.purchase === "all"
                    ? undefined
                    : op.purchase
            }
          >
            <DropdownOptions>
              <FilterPill
                active={op.purchase === "all"}
                onClick={() => opChange("purchase", "all")}
                label="전체"
              />
              <FilterPill
                active={op.purchase === "has"}
                onClick={() => opChange("purchase", "has")}
                label="구입함"
              />
              {hasNoPurchaseMembers && (
                <FilterPill
                  active={op.purchase === "none"}
                  onClick={() => opChange("purchase", "none")}
                  label="미구입"
                />
              )}
              {productOptions.length > 0 && (
                <div className="my-1 h-px w-full bg-gray-100" />
              )}
              {productOptions.map((name) => (
                <FilterPill
                  key={name}
                  active={op.purchase === name}
                  onClick={() => opChange("purchase", name)}
                  label={name}
                />
              ))}
            </DropdownOptions>
          </FilterDropdown>

          <FilterDropdown
            label="크레딧"
            active={op.lowBalance}
            summary="저잔고"
          >
            <DropdownOptions>
              <FilterPill
                active={!op.lowBalance}
                onClick={() => opChange("lowBalance", false)}
                label="전체"
              />
              <FilterPill
                active={op.lowBalance}
                onClick={() => opChange("lowBalance", true)}
                label={`저잔고 (${LOW_BALANCE_THRESHOLD} 미만)`}
              />
            </DropdownOptions>
          </FilterDropdown>

          <FilterDropdown
            label="마케팅 동의"
            active={op.marketing !== "all"}
            summary={
              op.marketing === "consented"
                ? "동의"
                : op.marketing === "none"
                  ? "미동의"
                  : undefined
            }
          >
            <DropdownOptions>
              <FilterPill
                active={op.marketing === "all"}
                onClick={() => opChange("marketing", "all")}
                label="전체"
              />
              <FilterPill
                active={op.marketing === "consented"}
                onClick={() => opChange("marketing", "consented")}
                label="동의"
              />
              <FilterPill
                active={op.marketing === "none"}
                onClick={() => opChange("marketing", "none")}
                label="미동의"
              />
            </DropdownOptions>
          </FilterDropdown>

          <FilterDropdown
            label="문자 발송"
            active={op.sms !== "all"}
            summary={
              op.sms === "included"
                ? "발송 가능"
                : op.sms === "excluded"
                  ? "발송 제외"
                  : undefined
            }
          >
            <DropdownOptions>
              <FilterPill
                active={op.sms === "all"}
                onClick={() => opChange("sms", "all")}
                label="전체"
              />
              <FilterPill
                active={op.sms === "included"}
                onClick={() => opChange("sms", "included")}
                label="발송 가능"
              />
              <FilterPill
                active={op.sms === "excluded"}
                onClick={() => opChange("sms", "excluded")}
                label="발송 제외"
              />
            </DropdownOptions>
          </FilterDropdown>

          <FilterDropdown
            label="가입일"
            active={Boolean(op.signupFrom || op.signupTo)}
            summary={signupSummary(op.signupFrom, op.signupTo)}
            contentClassName="min-w-[280px]"
          >
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-semibold text-slate-500">
                가입일 범위
              </span>
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={op.signupFrom}
                  max={op.signupTo || undefined}
                  onChange={(e) => opChange("signupFrom", e.target.value)}
                  className="h-9 flex-1 text-[12px]"
                  aria-label="가입일 시작"
                />
                <span className="text-[12px] text-gray-400">~</span>
                <Input
                  type="date"
                  value={op.signupTo}
                  min={op.signupFrom || undefined}
                  onChange={(e) => opChange("signupTo", e.target.value)}
                  className="h-9 flex-1 text-[12px]"
                  aria-label="가입일 종료"
                />
              </div>
              {(op.signupFrom || op.signupTo) && (
                <button
                  type="button"
                  onClick={() => {
                    opChange("signupFrom", "");
                    opChange("signupTo", "");
                  }}
                  className="self-start text-[11px] text-gray-400 transition-colors hover:text-rose-500"
                >
                  범위 지우기
                </button>
              )}
            </div>
          </FilterDropdown>

          {hasActiveFilter && (
            <>
              <span
                className="mx-0.5 hidden h-5 w-px bg-gray-200 sm:inline-block"
                aria-hidden
              />
              <Button
                variant="ghost"
                size="sm"
                className="h-9 gap-1 px-2.5 text-[12px] text-gray-500 hover:text-rose-600"
                onClick={resetAll}
              >
                <X className="size-3.5" strokeWidth={2} aria-hidden />
                전체 초기화
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <BulkActionsBar
          selectedIds={bulkMemberIds}
          onClear={clearSelection}
          filteredCount={viewMode === "academy" ? academyGroups.length : sorted.length}
          totalCount={viewMode === "academy" ? totalAcademies : members.length}
          creditEnabled={viewMode === "academy"}
          unitLabel={viewMode === "academy" ? "학원" : "명"}
        />

        {sorted.length === 0 ? (
          <EmptyState hasFilters={hasActiveFilter} />
        ) : viewMode === "academy" ? (
          <div className="overflow-x-auto" ref={tableWrapRef} style={columnCssVars}>
            <AcademyGroupedTable
              groups={academyGroups}
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
          <>
            {/* 모바일: 가로 스크롤 대신 회원 세로 카드 (트레이 위 분리된 카드) */}
            <ul className="space-y-2 bg-gray-50/60 p-2.5 lg:hidden">
              {sorted.map((m) => (
                <MemberCard
                  key={m.id}
                  member={m}
                  now={renderNow}
                  selected={selectedIds.has(m.id)}
                  onSelectChange={(checked) => toggleOne(m.id, checked)}
                />
              ))}
            </ul>

            {/* 데스크톱/태블릿: 기존 표 (가로 폭 유지) */}
            <div
              className="hidden overflow-x-auto lg:block"
              ref={tableWrapRef}
              style={columnCssVars}
            >
            <Table className="w-max table-fixed">
              <TableHeader>
                <TableRow className="hover:bg-transparent border-b border-gray-50">
                  <TableHead className="h-9 pl-5 pr-0 w-9">
                    <Checkbox
                      checked={headerCheckState}
                      onCheckedChange={toggleAllVisible}
                      aria-label="화면의 회원 전체 선택"
                    />
                  </TableHead>
                  {COLUMN_DEFS.map((col) => (
                    <TableHead
                      key={col.id}
                      className={cn(
                        "relative text-[11px] text-gray-400 font-medium h-9",
                        col.headPad,
                        col.align === "right" && "text-right",
                        col.responsive,
                      )}
                      style={{ width: `var(--mw-${col.id})` }}
                      aria-sort={ariaSortFor(col.sortKey)}
                    >
                      <SortHeader
                        label={col.label}
                        active={filters.sortKey === col.sortKey}
                        order={filters.sortOrder}
                        onClick={() => toggleSort(col.sortKey)}
                      />
                      <ColumnResizeHandle
                        onPointerDown={(e) => startColumnResize(e, col.id)}
                      />
                    </TableHead>
                  ))}
                  <TableHead className="text-[11px] text-gray-400 font-medium h-9 w-[60px] pr-5" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((m) => (
                  <MemberRow
                    key={m.id}
                    member={m}
                    now={renderNow}
                    selected={selectedIds.has(m.id)}
                    onSelectChange={(checked) => toggleOne(m.id, checked)}
                  />
                ))}
              </TableBody>
            </Table>
            </div>
          </>
        )}
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
