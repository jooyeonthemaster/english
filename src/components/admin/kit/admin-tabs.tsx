"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type AdminTab<K extends string = string> = {
  key: K;
  label: string;
  icon?: LucideIcon;
  /** 옅은 건수 표시 */
  count?: number;
  /** 처리 필요 건수 — 빨간 배지 */
  badge?: number;
  /** 서버 페이지가 ?view= 로 다시 렌더하는 탭이면 링크로 동작(onChange 대신) */
  href?: string;
};

/**
 * 페이지 탭 한 종류 — 흰 테두리 컨테이너 안의 진한 알약. 필터 칩(둥근 회색)과 구분된다.
 * 탭 상태를 URL 에 남기려면 useUrlTab 과 함께 쓴다.
 */
export function AdminTabs<K extends string>({
  tabs,
  value,
  onChange,
  ariaLabel,
  size = "md",
  className,
}: {
  tabs: ReadonlyArray<AdminTab<K>>;
  value: K;
  onChange?: (key: K) => void;
  ariaLabel: string;
  size?: "md" | "sm";
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-gray-200 bg-white p-1",
        className,
      )}
    >
      {tabs.map(({ key, label, icon: Icon, count, badge, href }) => {
        const active = key === value;
        const className = cn(
          "inline-flex shrink-0 items-center gap-1.5 rounded-lg font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40",
          size === "md" ? "h-8 px-3.5 text-[13px]" : "h-7 px-3 text-[12px]",
          active
            ? "bg-gray-900 text-white"
            : "text-gray-500 hover:bg-gray-50 hover:text-gray-900",
        );
        const inner = (
          <>
            {Icon && <Icon className="size-4" strokeWidth={2} />}
            {label}
            {count !== undefined && (
              <span className={cn("tabular-nums text-[11px]", active ? "text-white/60" : "text-gray-400")}>
                {count.toLocaleString("ko-KR")}
              </span>
            )}
            {badge !== undefined && badge > 0 && (
              <span className="rounded-full bg-rose-500 px-1.5 text-[11px] font-semibold leading-[18px] text-white">
                {badge}
              </span>
            )}
          </>
        );
        if (href) {
          return (
            <Link key={key} href={href} role="tab" aria-selected={active} className={className}>
              {inner}
            </Link>
          );
        }
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange?.(key)}
            className={className}
          >
            {inner}
          </button>
        );
      })}
    </div>
  );
}

/**
 * 탭 상태를 ?param= 에 보존한다(새로고침·링크 공유 시 같은 탭). 히스토리는 쌓지 않는다.
 * 서버 페이지가 searchParams 로 읽은 초기값을 넘겨야 첫 렌더부터 맞는 탭이 보인다.
 */
export function useUrlTab<K extends string>(
  param: string,
  initial: K,
  options: { defaultKey?: K; clearParams?: string[] } = {},
): [K, (key: K) => void] {
  const [value, setValue] = useState<K>(initial);
  const set = useCallback(
    (key: K) => {
      setValue(key);
      if (typeof window === "undefined") return;
      const url = new URL(window.location.href);
      if (key === options.defaultKey) url.searchParams.delete(param);
      else url.searchParams.set(param, key);
      for (const p of options.clearParams ?? []) url.searchParams.delete(p);
      window.history.replaceState(window.history.state, "", url);
    },
    [param, options.defaultKey, options.clearParams],
  );
  return [value, set];
}

