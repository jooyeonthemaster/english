import React from "react";
import { cn } from "@/lib/utils";

// ─── wrapIcon — consistent icon sizing via cloneElement ──────────────────────

export function wrapIcon(node: React.ReactNode): React.ReactNode {
  // Use React.cloneElement so refs/keys are preserved (React 19 ref-as-prop
  // semantics depend on cloneElement, not spread).
  if (!React.isValidElement(node)) return node;
  const el = node as React.ReactElement<{
    className?: string;
    strokeWidth?: number;
    "aria-hidden"?: boolean | "true" | "false";
  }>;
  return React.cloneElement(el, {
    className: cn("size-4", el.props.className),
    strokeWidth: el.props.strokeWidth ?? 1.8,
    "aria-hidden": true,
  });
}

// ─── Avatar with monogram fallback ───────────────────────────────────────────

function getInitials(name: string): string {
  if (!name) return "?";
  const trimmed = name.trim();
  if (/^[A-Za-z]/.test(trimmed)) {
    const parts = trimmed.split(/\s+/).slice(0, 2);
    return parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
  }
  return trimmed.slice(0, 1);
}

export function Avatar({
  name,
  avatarUrl,
  size = "md",
}: {
  name: string;
  avatarUrl: string | null | undefined;
  size?: "sm" | "md" | "lg";
}) {
  const dim =
    size === "lg" ? "size-14" : size === "sm" ? "size-9" : "size-11";
  const text =
    size === "lg" ? "text-[20px]" : size === "sm" ? "text-[13px]" : "text-[16px]";

  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt=""
        className={cn(dim, "rounded-full object-cover bg-gray-100 shrink-0")}
      />
    );
  }
  return (
    <div
      className={cn(
        dim,
        text,
        "rounded-full bg-blue-50 text-blue-700 font-semibold flex items-center justify-center shrink-0",
      )}
      aria-hidden="true"
    >
      {getInitials(name)}
    </div>
  );
}

// ─── SectionCard — titled panel with icon + optional action ──────────────────

export function SectionCard({
  title,
  icon,
  children,
  action,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-xl border border-gray-100">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-50">
        <div className="flex items-center gap-2 text-gray-700">
          <span className="text-gray-400" aria-hidden>
            {wrapIcon(icon)}
          </span>
          <h3 className="text-[13px] font-semibold text-gray-800">{title}</h3>
        </div>
        {action}
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

// ─── Definition list (label / value rows) ────────────────────────────────────

export function DefList({ children }: { children: React.ReactNode }) {
  return <dl className="divide-y divide-gray-50">{children}</dl>;
}

export function DefRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[88px_1fr] gap-3 py-2 first:pt-0 last:pb-0">
      <dt className="text-[11px] text-gray-400 uppercase tracking-wider font-medium pt-0.5">
        {label}
      </dt>
      <dd className="text-[12px] text-gray-700 min-w-0 truncate">{value}</dd>
    </div>
  );
}

// ─── CountChip — small label/number pill (inside SectionCard footers) ────────

export function CountChip({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center justify-between rounded-md bg-gray-50 px-2.5 py-1.5">
      <div className="flex items-center gap-1.5 text-gray-500">
        <span className="text-gray-400" aria-hidden>
          {icon}
        </span>
        <span className="text-[11px]">{label}</span>
      </div>
      <span className="text-[12px] font-semibold text-gray-800 tabular-nums">
        {value.toLocaleString("ko-KR")}
      </span>
    </div>
  );
}

// ─── CreditKpi — large hero number card ──────────────────────────────────────

export function CreditKpi({
  label,
  value,
  icon,
  accent,
  suffix,
}: {
  label: string;
  value: number | null;
  icon: React.ReactNode;
  accent: "primary" | "emerald" | "rose";
  suffix?: React.ReactNode;
}) {
  const accentClass =
    accent === "primary"
      ? "bg-blue-50 text-blue-600"
      : accent === "emerald"
        ? "bg-emerald-50 text-emerald-600"
        : "bg-rose-50 text-rose-600";

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <div className="flex items-start justify-between mb-2">
        <span className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">
          {label}
        </span>
        <span
          className={cn(
            "size-7 rounded-md flex items-center justify-center",
            accentClass,
          )}
          aria-hidden
        >
          {wrapIcon(icon)}
        </span>
      </div>
      {value === null ? (
        <span className="text-[16px] font-semibold text-gray-300">미생성</span>
      ) : (
        <div className="flex items-baseline gap-1">
          <span className="text-[26px] font-bold text-gray-900 tabular-nums leading-none">
            {value.toLocaleString("ko-KR")}
          </span>
          <span className="text-[12px] text-gray-400 font-medium">C</span>
        </div>
      )}
      {suffix && <div className="mt-2">{suffix}</div>}
    </div>
  );
}

// ─── MiniStat — three-up stat strip below charts ─────────────────────────────

export function MiniStat({
  label,
  value,
  suffix,
}: {
  label: string;
  value: string;
  suffix?: string;
}) {
  return (
    <div>
      <div className="text-[11px] text-gray-400 uppercase tracking-wider mb-1">
        {label}
      </div>
      <div className="text-[13px] font-semibold text-gray-800 tabular-nums">
        {value}
        {suffix && (
          <span className="text-[11px] text-gray-400 font-normal ml-0.5">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}
