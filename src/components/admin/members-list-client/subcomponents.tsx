"use client";

import {
  ArrowUpDown,
  ArrowDown,
  ArrowUp,
  CircleSlash,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SortOrder } from "@/actions/admin-members";

/** 헤더 셀 우측의 열 너비 조절 핸들(드래그). 회원별·학원별 표 공용. */
export function ColumnResizeHandle({
  onPointerDown,
}: {
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label="열 너비 조절"
      onPointerDown={onPointerDown}
      onClick={(e) => e.stopPropagation()}
      className="group/resize absolute right-0 top-0 z-10 flex h-full w-2 translate-x-1/2 cursor-col-resize touch-none items-center justify-center"
    >
      <span className="h-4 w-px bg-gray-200 transition-colors group-hover/resize:bg-blue-400" />
    </span>
  );
}

export function SortHeader({
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

/**
 * 어드민 공용 필터 칩(Toss형 rounded-full pill). 활성=진한 슬레이트, 비활성=연회색.
 * 오른쪽에 회원 수 등 카운트를 옅게 덧붙일 수 있다(선택). 피드백·세미나·튜터 툴바와
 * 같은 톤이라 어드민 전반의 필터 칩을 이 컴포넌트로 통일한다.
 */
export function FilterPill({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40",
        active
          ? "bg-slate-900 text-white"
          : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-800",
      )}
    >
      {label}
      {count !== undefined && (
        <span
          className={cn(
            "tabular-nums text-[11px]",
            active ? "text-white/70" : "text-slate-400",
          )}
        >
          {count.toLocaleString("ko-KR")}
        </span>
      )}
    </button>
  );
}

export function SegmentedTabs<T extends string>({
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

export function StatChip({
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

export function EmptyState({ hasFilters }: { hasFilters: boolean }) {
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
