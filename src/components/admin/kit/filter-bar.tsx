"use client";

import { Search, X } from "lucide-react";
import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** 목록 위 필터 줄 — 검색·칩·건수·목록용 버튼을 한 카드에 담는다. */
export function FilterBar({
  children,
  right,
  className,
}: {
  children: ReactNode;
  /** 결과 건수·정렬·목록 버튼 등 오른쪽 끝 */
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-xl border border-gray-100 bg-white p-3",
        className,
      )}
    >
      {children}
      {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
    </div>
  );
}

/**
 * 검색창 — 입력 즉시 필터(useSearchDebounce 250ms 권장). 아이콘 겹침 방지로 pl-9!/pr-9!.
 */
export function SearchInput({
  value,
  onChange,
  placeholder = "검색",
  ariaLabel = "검색",
  onEnter,
  className,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  onEnter?: () => void;
  className?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className={cn("relative w-full min-w-[200px] sm:w-72", className)}>
      <Search
        className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400"
        strokeWidth={1.8}
        aria-hidden
      />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoFocus={autoFocus}
        className="h-9 border-gray-100 bg-gray-50 pl-9! pr-9! text-[13px] focus-visible:bg-white"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-2.5 top-1/2 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          aria-label="검색 지우기"
        >
          <X className="size-3.5" strokeWidth={2} aria-hidden />
        </button>
      )}
    </div>
  );
}

/** 필터 칩 — 둥근 회색, 활성=진한 회색. (탭이 아니라 필터에 쓴다) */
export function FilterChip({
  active,
  onClick,
  label,
  count,
  tone,
  onRemove,
  removeLabel,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
  /** 처리 필요 등 강조 건수를 활성 여부와 무관하게 빨갛게 */
  tone?: "alert";
  /** 있으면 호버 시 X 가 나타난다(사용자가 만든 분류 삭제 등) */
  onRemove?: () => void;
  removeLabel?: string;
}) {
  if (onRemove) {
    return (
      <span className="group/chip relative inline-flex">
        <FilterChip active={active} onClick={onClick} label={label} count={count} tone={tone} />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={removeLabel ?? `${label} 삭제`}
          className="absolute -right-1 -top-1 hidden size-4 items-center justify-center rounded-full bg-gray-900 text-white transition group-hover/chip:flex hover:bg-rose-600"
        >
          <X className="size-2.5" strokeWidth={3} aria-hidden />
        </button>
      </span>
    );
  }
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40",
        active
          ? "bg-gray-900 text-white"
          : "bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900",
      )}
    >
      {label}
      {count !== undefined && (
        <span
          className={cn(
            "tabular-nums text-[11px]",
            tone === "alert" && count > 0
              ? active
                ? "text-rose-200"
                : "text-rose-600"
              : active
                ? "text-white/60"
                : "text-gray-400",
          )}
        >
          {count.toLocaleString("ko-KR")}
        </span>
      )}
    </button>
  );
}

/** 단일 선택 칩 묶음(상태 필터 등). */
export function FilterChipGroup<K extends string>({
  options,
  value,
  onChange,
  counts,
  ariaLabel,
}: {
  options: ReadonlyArray<{ key: K; label: string; tone?: "alert" }>;
  value: K;
  onChange: (key: K) => void;
  counts?: Partial<Record<K, number>>;
  ariaLabel: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex flex-wrap items-center gap-1.5">
      {options.map((opt) => (
        <FilterChip
          key={opt.key}
          active={value === opt.key}
          onClick={() => onChange(opt.key)}
          label={opt.label}
          count={counts?.[opt.key]}
          tone={opt.tone}
        />
      ))}
    </div>
  );
}

/** "총 N건 · 1/3 페이지" 같은 결과 요약 */
export function ResultCount({
  total,
  unit = "건",
  page,
  totalPages,
  className,
}: {
  total: number;
  unit?: string;
  page?: number;
  totalPages?: number;
  className?: string;
}) {
  return (
    <span className={cn("text-[12px] text-gray-400", className)}>
      총 <span className="font-semibold tabular-nums text-gray-700">{total.toLocaleString("ko-KR")}</span>
      {unit}
      {page !== undefined && totalPages !== undefined && totalPages > 1 && (
        <>
          {" "}· {page}/{totalPages} 페이지
        </>
      )}
    </span>
  );
}
