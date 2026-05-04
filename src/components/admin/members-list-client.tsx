"use client";

import { useCallback, useDeferredValue, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  ArrowUpDown,
  ArrowDown,
  ArrowUp,
  ChevronRight,
  CircleSlash,
  Users,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ProviderBadge } from "@/components/admin/provider-badge";
import type {
  MemberListItem,
  ProviderFilter,
  ActiveFilter,
  MemberSortKey,
  SortOrder,
} from "@/actions/admin-members";

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
  lastLoginAt: "desc",
  balance: "asc",
};

const LOW_BALANCE_THRESHOLD = 50;

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

// ─── Formatters ─────────────────────────────────────────────────────────────

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatRelative(
  d: Date | string | null | undefined,
  now: number,
): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  const diffMs = now - date.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}일 전`;
  if (day < 30) return `${Math.floor(day / 7)}주 전`;
  if (day < 365) return `${Math.floor(day / 30)}개월 전`;
  return `${Math.floor(day / 365)}년 전`;
}

function getInitials(name: string): string {
  if (!name) return "?";
  const trimmed = name.trim();
  if (/^[A-Za-z]/.test(trimmed)) {
    const parts = trimmed.split(/\s+/).slice(0, 2);
    return parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
  }
  return trimmed.slice(0, 1);
}

// ─── Main component ─────────────────────────────────────────────────────────

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
        const hay = `${m.name} ${m.email} ${m.academy.name}`.toLowerCase();
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
      if (filters.sortKey === "lastLoginAt") {
        const av = a.lastLoginAt ? new Date(a.lastLoginAt).getTime() : 0;
        const bv = b.lastLoginAt ? new Date(b.lastLoginAt).getTime() : 0;
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
              placeholder="이름·이메일·학원 검색"
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
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-50">
          <span className="text-[12px] text-gray-500">
            <span className="font-semibold text-gray-800 tabular-nums">
              {sorted.length}
            </span>
            명{" "}
            <span className="text-gray-400">
              · 전체 {members.length}명 중
            </span>
          </span>
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
                      filters.sortKey === "lastLoginAt"
                        ? filters.sortOrder === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                  >
                    <SortHeader
                      label="최근 로그인"
                      active={filters.sortKey === "lastLoginAt"}
                      order={filters.sortOrder}
                      onClick={() => toggleSort("lastLoginAt")}
                    />
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

// ─── Subcomponents ──────────────────────────────────────────────────────────

function MemberRow({ member, now }: { member: MemberListItem; now: number }) {
  const router = useRouter();
  const href = `/admin/members/${member.id}`;

  // Row-level click navigation: matches enterprise SaaS row affordance while
  // the first-cell <Link> remains the keyboard/SR entry point. Guards against
  // hijacking when the user is selecting text or clicking on an inner link.
  const handleRowClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("a, button")) return;
      if (window.getSelection()?.toString()) return;
      router.push(href);
    },
    [router, href],
  );

  return (
    <TableRow
      onClick={handleRowClick}
      className="group hover:bg-gray-50/60 border-b border-gray-50/60 last:border-0 cursor-pointer"
    >
      <TableCell className="py-3 pl-5">
        <Link
          href={href}
          className="flex items-center gap-3 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 rounded-md -m-1 p-1"
        >
          <Avatar name={member.name} avatarUrl={member.avatarUrl} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[13px] font-medium text-gray-900 truncate">
                {member.name}
              </span>
              {!member.isActive && (
                <Badge
                  variant="secondary"
                  className="bg-gray-100 text-gray-500 border-0 text-[11px] px-1.5 h-4 font-medium shrink-0"
                >
                  비활성
                </Badge>
              )}
            </div>
            <div className="text-[11px] text-gray-400 truncate">
              {member.email}
            </div>
          </div>
        </Link>
      </TableCell>
      <TableCell>
        <ProviderBadge provider={member.authProvider} size="sm" />
      </TableCell>
      <TableCell>
        <div className="min-w-0">
          <div className="text-[12px] text-gray-700 truncate">
            {member.academy.name}
          </div>
          <div className="text-[11px] text-gray-400 truncate">
            /{member.academy.slug}
          </div>
        </div>
      </TableCell>
      <TableCell>
        {member.subscription ? (
          <Badge
            variant="secondary"
            className={cn(
              "text-[11px] font-medium border-0 px-2",
              tierBadgeClass(member.subscription.planTier),
            )}
          >
            {member.subscription.planName}
          </Badge>
        ) : (
          <span className="text-[11px] text-gray-300">—</span>
        )}
      </TableCell>
      <TableCell className="text-right">
        <BalanceCell balance={member.creditBalance?.balance ?? null} />
      </TableCell>
      <TableCell className="text-[12px] text-gray-600 tabular-nums">
        {formatDate(member.createdAt)}
      </TableCell>
      <TableCell className="text-[12px] text-gray-600 tabular-nums">
        {member.lastLoginAt ? (
          <span title={formatDate(member.lastLoginAt)}>
            {formatRelative(member.lastLoginAt, now)}
          </span>
        ) : (
          <span className="text-gray-300">로그인 없음</span>
        )}
      </TableCell>
      <TableCell className="pr-5 text-right">
        <ChevronRight
          className="size-4 text-gray-300 group-hover:text-gray-500 transition-colors inline-block"
          strokeWidth={2}
          aria-hidden="true"
        />
      </TableCell>
    </TableRow>
  );
}

function Avatar({
  name,
  avatarUrl,
}: {
  name: string;
  avatarUrl: string | null | undefined;
}) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt=""
        className="size-9 rounded-full object-cover bg-gray-100 shrink-0"
      />
    );
  }
  return (
    <div
      className="size-9 rounded-full bg-blue-50 text-blue-700 text-[13px] font-semibold flex items-center justify-center shrink-0"
      aria-hidden="true"
    >
      {getInitials(name)}
    </div>
  );
}

function BalanceCell({ balance }: { balance: number | null }) {
  if (balance === null) {
    return <span className="text-[11px] text-gray-300">미생성</span>;
  }
  const isLow = balance < LOW_BALANCE_THRESHOLD;
  return (
    <span
      className={cn(
        "inline-flex items-center justify-end gap-1 tabular-nums",
        isLow ? "text-rose-600" : "text-gray-800",
      )}
      title={isLow ? "잔고가 낮습니다" : undefined}
    >
      {isLow && (
        <AlertTriangle
          className="size-3 text-rose-500 shrink-0"
          strokeWidth={2}
          aria-hidden="true"
        />
      )}
      <span className="text-[14px] font-semibold leading-none">
        {balance.toLocaleString("ko-KR")}
      </span>
      <span className="text-[11px] text-gray-400 font-normal">C</span>
    </span>
  );
}

function tierBadgeClass(tier: string): string {
  switch (tier) {
    case "ENTERPRISE":
      return "bg-slate-900 text-white";
    case "PREMIUM":
      return "bg-blue-600 text-white";
    case "STANDARD":
      return "bg-blue-100 text-blue-800";
    case "STARTER":
      return "bg-slate-100 text-slate-700";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

function SortHeader({
  label,
  active,
  order,
  onClick,
}: {
  label: string;
  active: boolean;
  order: SortOrder;
  onClick: () => void;
}) {
  const Icon = !active ? ArrowUpDown : order === "desc" ? ArrowDown : ArrowUp;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 rounded px-1 -mx-1 transition-colors",
        active ? "text-gray-700" : "text-gray-400 hover:text-gray-600",
      )}
    >
      {label}
      <Icon className="size-3" strokeWidth={2} aria-hidden="true" />
    </button>
  );
}

function SegmentedTabs<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ key: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
        {label}
      </span>
      <div
        role="tablist"
        aria-label={label}
        className="inline-flex items-center bg-gray-100 rounded-lg p-0.5 gap-0.5"
      >
        {options.map((opt) => (
          <button
            key={opt.key}
            type="button"
            role="tab"
            aria-selected={value === opt.key}
            onClick={() => onChange(opt.key)}
            className={cn(
              "px-2.5 py-1 rounded-md text-[12px] font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40",
              value === opt.key
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-800",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function StatChip({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: "slate" | "blue" | "emerald" | "slate-dark";
}) {
  const dot =
    accent === "blue"
      ? "bg-blue-500"
      : accent === "emerald"
        ? "bg-emerald-500"
        : accent === "slate-dark"
          ? "bg-slate-800"
          : "bg-slate-400";

  return (
    <div className="bg-white rounded-lg border border-gray-100 px-3 py-2.5 flex items-center justify-between">
      <div className="flex items-center gap-2 min-w-0">
        <span className={cn("size-1.5 rounded-full shrink-0", dot)} aria-hidden />
        <span className="text-[11px] text-gray-500 truncate">{label}</span>
      </div>
      <span className="text-[14px] font-semibold text-gray-900 tabular-nums shrink-0">
        {value.toLocaleString("ko-KR")}
      </span>
    </div>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  if (hasFilters) {
    return (
      <div className="px-5 py-16 flex flex-col items-center justify-center text-center">
        <div className="size-10 rounded-full bg-gray-50 flex items-center justify-center mb-3">
          <CircleSlash
            className="size-5 text-gray-300"
            strokeWidth={1.8}
            aria-hidden="true"
          />
        </div>
        <p className="text-[13px] text-gray-500 font-medium">
          조건에 맞는 회원이 없습니다
        </p>
        <p className="text-[11px] text-gray-400 mt-1">
          필터나 검색어를 조정해 보세요
        </p>
      </div>
    );
  }
  return (
    <div className="px-5 py-16 flex flex-col items-center justify-center text-center">
      <div className="size-10 rounded-full bg-gray-50 flex items-center justify-center mb-3">
        <Users
          className="size-5 text-gray-300"
          strokeWidth={1.8}
          aria-hidden="true"
        />
      </div>
      <p className="text-[13px] text-gray-500 font-medium">
        아직 가입한 회원이 없습니다
      </p>
      <p className="text-[11px] text-gray-400 mt-1">
        첫 가입이 발생하면 여기에 표시됩니다
      </p>
    </div>
  );
}
