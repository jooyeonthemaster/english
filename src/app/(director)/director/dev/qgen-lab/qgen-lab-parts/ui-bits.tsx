"use client";

// qgen-lab 공용 소품 — 상태 배지·패널·계기 칩. 잉크/종이 팔레트, 신호색(주황)은 실행 중에만.

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { STATUS_LABEL, STATUS_TONE, type UiStatus } from "./format-utils";

export function StatusBadge({ status, className }: { status: UiStatus; className?: string }) {
  return (
    <span
      data-status={status}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-[1px] text-[0.6875rem] font-semibold whitespace-nowrap",
        STATUS_TONE[status],
        className,
      )}
    >
      {status === "running" && (
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-orange-500 opacity-60" />
          <span className="relative inline-flex size-1.5 rounded-full bg-orange-600" />
        </span>
      )}
      {STATUS_LABEL[status]}
    </span>
  );
}

export function Panel({
  title,
  aside,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("rounded-lg border border-stone-300 bg-[#fffefa]", className)}>
      {(title || aside) && (
        <header className="flex items-center justify-between gap-3 border-b border-stone-200 px-3 py-2">
          <h3 className="text-[0.6875rem] font-bold tracking-[0.12em] text-stone-500 uppercase">{title}</h3>
          {aside}
        </header>
      )}
      <div className={cn("p-3", bodyClassName)}>{children}</div>
    </section>
  );
}

/** 계기 칩 — 라벨 + 모노 수치. tone=live 면 신호색. */
export function Gauge({
  label,
  value,
  sub,
  tone = "idle",
  title,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "idle" | "live" | "muted" | "good" | "warn";
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-baseline gap-1.5 rounded-md border px-2 py-[3px] text-[0.6875rem] whitespace-nowrap",
        tone === "live" && "border-orange-300 bg-orange-50 text-orange-800",
        tone === "idle" && "border-stone-300 bg-white text-stone-700",
        tone === "muted" && "border-dashed border-stone-300 bg-transparent text-stone-400",
        tone === "good" && "border-emerald-300 bg-emerald-50/60 text-emerald-900",
        tone === "warn" && "border-amber-300 bg-amber-50 text-amber-900",
      )}
    >
      <span className="font-medium opacity-70">{label}</span>
      <span className="font-mono text-[0.75rem] font-semibold tabular-nums">{value}</span>
      {sub && <span className="font-mono text-[0.6875rem] tabular-nums opacity-70">{sub}</span>}
    </span>
  );
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("font-mono tabular-nums", className)}>{children}</span>;
}

export function SourceBadge({ source }: { source: "gichul" | "prod" | "custom" }) {
  const label = source === "gichul" ? "기출" : source === "prod" ? "운영" : "직접";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-[4px] border px-1 text-[0.625rem] font-bold leading-4",
        source === "gichul" && "border-stone-800 bg-stone-900 text-[#fffefa]",
        source === "prod" && "border-stone-400 bg-white text-stone-700",
        source === "custom" && "border-dashed border-stone-400 text-stone-500",
      )}
    >
      {label}
    </span>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-stone-300 px-4 py-8 text-center text-[0.8125rem] text-stone-500">
      {children}
    </div>
  );
}

export function IssueList({ issues, tone = "warn" }: { issues: string[]; tone?: "warn" | "error" | "muted" }) {
  if (!issues.length) return null;
  return (
    <ul
      className={cn(
        "space-y-0.5 rounded-md border px-2.5 py-1.5 text-[0.75rem] leading-5",
        tone === "warn" && "border-amber-200 bg-amber-50/70 text-amber-900",
        tone === "error" && "border-red-200 bg-red-50/70 text-red-800",
        tone === "muted" && "border-stone-200 bg-stone-50 text-stone-600",
      )}
    >
      {issues.map((it, i) => (
        <li key={i} className="flex gap-1.5">
          <span className="select-none opacity-50">–</span>
          <span className="break-words">{it}</span>
        </li>
      ))}
    </ul>
  );
}
