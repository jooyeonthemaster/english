"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  MemberListItem,
  ProviderFilter,
  ActiveFilter,
  MemberSortKey,
  SortOrder,
} from "@/actions/admin-members";
import { MemberRow } from "./members-list-client/member-row";
import { MembersExportButtons } from "./members-list-client/export-button";
import {
  EmptyState,
  SegmentedTabs,
  SortHeader,
  StatChip,
} from "./members-list-client/subcomponents";

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

// First-click default direction per column. Asc on balance highlights low
// credit (intervention candidates); desc on time columns highlights newest.
const SORT_DEFAULT_DIRECTION: Record<MemberSortKey, SortOrder> = {
  createdAt: "desc",
  lastActiveAt: "desc",
  balance: "asc",
};

interface ClientFilters {
  provider: ProviderFilter;
  active: ActiveFilter;
  search: string;
  sortKey: MemberSortKey;
  sortOrder: SortOrder;
}

const INITIAL_FILTERS: ClientFilters = {
  provider: "all",
  active: "all",
  search: "",
  sortKey: "createdAt",
  sortOrder: "desc",
};

export function MembersListClient({ members }: MembersListClientProps) {
  const [filters, setFilters] = useState<ClientFilters>(INITIAL_FILTERS);
  const deferredSearch = useDeferredValue(filters.search);
  // Single timestamp for the entire render so all relative-times are coherent.
  const renderNow = useMemo(() => Date.now(), [filters, members]);

  const filtered = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
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
      if (q) {
        const hay =
          `${m.name} ${m.email} ${m.academy.name} ${m.academy.memo ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [members, filters.provider, filters.active, deferredSearch]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = filters.sortOrder === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      if (filters.sortKey === "balance") {
        const av = a.creditBalance?.balance ?? 0;
        const bv = b.creditBalance?.balance ?? 0;
        return (av - bv) * dir;
      }
      if (filters.sortKey === "lastActiveAt") {
        const av = a.lastActiveAt ? new Date(a.lastActiveAt).getTime() : 0;
        const bv = b.lastActiveAt ? new Date(b.lastActiveAt).getTime() : 0;
        return (av - bv) * dir;
      }
      const av = new Date(a.createdAt).getTime();
      const bv = new Date(b.createdAt).getTime();
      return (av - bv) * dir;
    });
    return arr;
  }, [filtered, filters.sortKey, filters.sortOrder]);

  function setFilter<K extends keyof ClientFilters>(
    key: K,
    value: ClientFilters[K],
  ) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function toggleSort(key: MemberSortKey) {
    setFilters((prev) =>
      prev.sortKey === key
        ? { ...prev, sortOrder: prev.sortOrder === "desc" ? "asc" : "desc" }
        : { ...prev, sortKey: key, sortOrder: SORT_DEFAULT_DIRECTION[key] },
    );
  }

  const counts = useMemo(() => {
    const total = members.length;
    const google = members.filter((m) => m.authProvider === "google").length;
    const kakao = members.filter((m) => m.authProvider === "kakao").length;
    const other = total - google - kakao;
    const active = members.filter((m) => m.isActive).length;
    return { total, google, kakao, other, active };
  }, [members]);

  const hasActiveFilter =
    filters.search.length > 0 ||
    filters.provider !== "all" ||
    filters.active !== "all";

  return (
    <div className="space-y-4">
      {/* Aggregate strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <StatChip label="전체 회원" value={counts.total} accent="slate" />
        <StatChip label="활성" value={counts.active} accent="emerald" />
        <StatChip label="Google" value={counts.google} accent="blue" />
        <StatChip label="Kakao" value={counts.kakao} accent="slate-dark" />
        <StatChip label="기타" value={counts.other} accent="slate" />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400"
              strokeWidth={1.8}
              aria-hidden="true"
            />
            <Input
              value={filters.search}
              onChange={(e) => setFilter("search", e.target.value)}
              placeholder="이름·이메일·학원·메모 검색"
              className="pl-9 h-9 text-[13px] bg-gray-50 border-gray-100 focus-visible:bg-white"
              aria-label="회원 검색"
            />
          </div>
          {/* Reserve fixed space to avoid layout shift when reset shows/hides */}
          <div className="h-9 flex items-center min-w-[88px] justify-end">
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-8 text-[12px] text-gray-500 transition-opacity",
                filters.search ? "opacity-100" : "opacity-0 pointer-events-none",
              )}
              onClick={() => setFilter("search", "")}
              aria-hidden={!filters.search}
              tabIndex={filters.search ? 0 : -1}
            >
              검색 초기화
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <SegmentedTabs
            label="가입 경로"
            options={PROVIDER_TABS}
            value={filters.provider}
            onChange={(v) => setFilter("provider", v)}
          />
          <span className="hidden md:inline-block w-px h-5 bg-gray-200" aria-hidden />
          <SegmentedTabs
            label="상태"
            options={ACTIVE_TABS}
            value={filters.active}
            onChange={(v) => setFilter("active", v)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-gray-50">
          <span className="text-[12px] text-gray-500">
            <span className="font-semibold text-gray-800 tabular-nums">
              {sorted.length}
            </span>
            명{" "}
            <span className="text-gray-400">
              · 전체 {members.length}명 중
            </span>
          </span>
          <MembersExportButtons />
        </div>

        {sorted.length === 0 ? (
          <EmptyState hasFilters={hasActiveFilter} />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-b border-gray-50">
                  <TableHead className="text-[11px] text-gray-400 font-medium h-9 pl-5 min-w-[260px]">
                    회원
                  </TableHead>
                  <TableHead className="text-[11px] text-gray-400 font-medium h-9 w-[120px]">
                    가입 경로
                  </TableHead>
                  <TableHead className="text-[11px] text-gray-400 font-medium h-9 min-w-[180px]">
                    학원
                  </TableHead>
                  <TableHead className="text-[11px] text-gray-400 font-medium h-9 w-[120px]">
                    플랜
                  </TableHead>
                  <TableHead
                    className="text-[11px] text-gray-400 font-medium h-9 w-[110px] text-right"
                    aria-sort={
                      filters.sortKey === "balance"
                        ? filters.sortOrder === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                  >
                    <SortHeader
                      label="크레딧"
                      active={filters.sortKey === "balance"}
                      order={filters.sortOrder}
                      onClick={() => toggleSort("balance")}
                    />
                  </TableHead>
                  <TableHead
                    className="text-[11px] text-gray-400 font-medium h-9 w-[110px]"
                    aria-sort={
                      filters.sortKey === "createdAt"
                        ? filters.sortOrder === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                  >
                    <SortHeader
                      label="가입일"
                      active={filters.sortKey === "createdAt"}
                      order={filters.sortOrder}
                      onClick={() => toggleSort("createdAt")}
                    />
                  </TableHead>
                  <TableHead
                    className="text-[11px] text-gray-400 font-medium h-9 w-[120px]"
                    aria-sort={
                      filters.sortKey === "lastActiveAt"
                        ? filters.sortOrder === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                  >
                    <SortHeader
                      label="최근 활동"
                      active={filters.sortKey === "lastActiveAt"}
                      order={filters.sortOrder}
                      onClick={() => toggleSort("lastActiveAt")}
                    />
                  </TableHead>
                  <TableHead className="text-[11px] text-gray-400 font-medium h-9 w-[88px]">
                    문자
                  </TableHead>
                  <TableHead className="text-[11px] text-gray-400 font-medium h-9 w-[60px] pr-5" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((m) => (
                  <MemberRow key={m.id} member={m} now={renderNow} />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
