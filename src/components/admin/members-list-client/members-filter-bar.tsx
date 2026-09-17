"use client";

// 회원 목록 필터 줄 — 검색(즉시 필터) + 축별 토글 드롭다운 + 전체 초기화.

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterBar, FilterChip, SearchInput } from "@/components/admin/kit";
import { AUTH_PROVIDER, activeFlag, labelOf } from "@/lib/admin-labels";
import type { ActiveFilter, ProviderFilter } from "@/actions/admin-members";
import { FilterDropdown, DropdownOptions } from "./filter-dropdown";
import type { OperationalFilters } from "./filter-model";
import {
  LOW_BALANCE_THRESHOLD,
  type ClientFilters,
  type MemberCounts,
} from "./member-list-model";

const PROVIDER_TABS: Array<{ key: ProviderFilter; label: string }> = [
  { key: "all", label: "전체" },
  { key: "google", label: labelOf(AUTH_PROVIDER, "google") },
  { key: "kakao", label: labelOf(AUTH_PROVIDER, "kakao") },
  { key: "other", label: "기타" },
];

const ACTIVE_TABS: Array<{ key: ActiveFilter; label: string }> = [
  { key: "all", label: "전체" },
  { key: "active", label: activeFlag(true, ["활성", "비활성"]).label },
  { key: "inactive", label: activeFlag(false, ["활성", "비활성"]).label },
];

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

export function MembersFilterBar({
  searchInput,
  onSearchChange,
  onSearchEnter,
  filters,
  onFilterChange,
  op,
  onOpChange,
  counts,
  productOptions,
  hasNoPurchaseMembers,
  hasActiveFilter,
  onReset,
}: {
  searchInput: string;
  onSearchChange: (value: string) => void;
  onSearchEnter: () => void;
  filters: ClientFilters;
  onFilterChange: <K extends keyof ClientFilters>(key: K, value: ClientFilters[K]) => void;
  op: OperationalFilters;
  onOpChange: <K extends keyof OperationalFilters>(key: K, value: OperationalFilters[K]) => void;
  counts: MemberCounts;
  productOptions: string[];
  hasNoPurchaseMembers: boolean;
  hasActiveFilter: boolean;
  onReset: () => void;
}) {
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

  const providerSummary = PROVIDER_TABS.find((t) => t.key === filters.provider)?.label;
  const activeSummary = ACTIVE_TABS.find((t) => t.key === filters.active)?.label;

  return (
    <FilterBar
      right={
        hasActiveFilter ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-[12px] text-gray-500 hover:text-rose-600"
            onClick={onReset}
          >
            <X className="size-3.5" strokeWidth={2} aria-hidden />
            전체 초기화
          </Button>
        ) : undefined
      }
    >
      <SearchInput
        value={searchInput}
        onChange={onSearchChange}
        onEnter={onSearchEnter}
        placeholder="이름·이메일·학원·메모 검색"
        ariaLabel="회원 검색"
      />

      <FilterDropdown
        label="가입경로"
        active={filters.provider !== "all"}
        summary={filters.provider !== "all" ? providerSummary : undefined}
      >
        <DropdownOptions>
          {PROVIDER_TABS.map((t) => (
            <FilterChip
              key={t.key}
              active={filters.provider === t.key}
              onClick={() => onFilterChange("provider", t.key)}
              label={t.label}
              count={t.key === "all" ? undefined : providerCount(t.key)}
            />
          ))}
        </DropdownOptions>
      </FilterDropdown>

      <FilterDropdown
        label="상태"
        active={filters.active !== "all"}
        summary={filters.active !== "all" ? activeSummary : undefined}
      >
        <DropdownOptions>
          {ACTIVE_TABS.map((t) => (
            <FilterChip
              key={t.key}
              active={filters.active === t.key}
              onClick={() => onFilterChange("active", t.key)}
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
          <FilterChip
            active={op.purchase === "all"}
            onClick={() => onOpChange("purchase", "all")}
            label="전체"
          />
          <FilterChip
            active={op.purchase === "has"}
            onClick={() => onOpChange("purchase", "has")}
            label="구입함"
          />
          {hasNoPurchaseMembers && (
            <FilterChip
              active={op.purchase === "none"}
              onClick={() => onOpChange("purchase", "none")}
              label="미구입"
            />
          )}
          {productOptions.length > 0 && <div className="my-1 h-px w-full bg-gray-100" />}
          {productOptions.map((name) => (
            <FilterChip
              key={name}
              active={op.purchase === name}
              onClick={() => onOpChange("purchase", name)}
              label={name}
            />
          ))}
        </DropdownOptions>
      </FilterDropdown>

      <FilterDropdown label="크레딧" active={op.lowBalance} summary="저잔고">
        <DropdownOptions>
          <FilterChip
            active={!op.lowBalance}
            onClick={() => onOpChange("lowBalance", false)}
            label="전체"
          />
          <FilterChip
            active={op.lowBalance}
            onClick={() => onOpChange("lowBalance", true)}
            label={`저잔고 (${LOW_BALANCE_THRESHOLD} 미만)`}
          />
        </DropdownOptions>
      </FilterDropdown>

      <FilterDropdown
        label="마케팅 동의"
        active={op.marketing !== "all"}
        summary={
          op.marketing === "consented" ? "동의" : op.marketing === "none" ? "미동의" : undefined
        }
      >
        <DropdownOptions>
          <FilterChip
            active={op.marketing === "all"}
            onClick={() => onOpChange("marketing", "all")}
            label="전체"
          />
          <FilterChip
            active={op.marketing === "consented"}
            onClick={() => onOpChange("marketing", "consented")}
            label="동의"
          />
          <FilterChip
            active={op.marketing === "none"}
            onClick={() => onOpChange("marketing", "none")}
            label="미동의"
          />
        </DropdownOptions>
      </FilterDropdown>

      <FilterDropdown
        label="문자 발송"
        active={op.sms !== "all"}
        summary={
          op.sms === "included" ? "발송 가능" : op.sms === "excluded" ? "발송 제외" : undefined
        }
      >
        <DropdownOptions>
          <FilterChip
            active={op.sms === "all"}
            onClick={() => onOpChange("sms", "all")}
            label="전체"
          />
          <FilterChip
            active={op.sms === "included"}
            onClick={() => onOpChange("sms", "included")}
            label="발송 가능"
          />
          <FilterChip
            active={op.sms === "excluded"}
            onClick={() => onOpChange("sms", "excluded")}
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
          <span className="text-[11px] font-semibold text-gray-500">가입일 범위</span>
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={op.signupFrom}
              max={op.signupTo || undefined}
              onChange={(e) => onOpChange("signupFrom", e.target.value)}
              className="h-9 flex-1 text-[12px]"
              aria-label="가입일 시작"
            />
            <span className="text-[12px] text-gray-400">~</span>
            <Input
              type="date"
              value={op.signupTo}
              min={op.signupFrom || undefined}
              onChange={(e) => onOpChange("signupTo", e.target.value)}
              className="h-9 flex-1 text-[12px]"
              aria-label="가입일 종료"
            />
          </div>
          {(op.signupFrom || op.signupTo) && (
            <Button
              variant="ghost"
              size="xs"
              className="self-start text-gray-400 hover:text-rose-600"
              onClick={() => {
                onOpChange("signupFrom", "");
                onOpChange("signupTo", "");
              }}
            >
              범위 지우기
            </Button>
          )}
        </div>
      </FilterDropdown>
    </FilterBar>
  );
}
