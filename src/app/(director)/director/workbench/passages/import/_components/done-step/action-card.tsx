"use client";

import { useId } from "react";
import { ArrowRight, type LucideIcon } from "lucide-react";

export interface ActionCardProps {
  icon: LucideIcon;
  iconTone: "sky" | "emerald";
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
  disabled?: boolean;
  disabledReason?: string;
  ariaLabel: string;
  /** Emphasized (primary sky button). */
  primary?: boolean;
  /** Progress bar value (0.0 – 1.0) when an async task is running. */
  progress?: number | null;
}

export function ActionCard({
  icon: Icon,
  iconTone,
  title,
  description,
  actionLabel,
  onAction,
  disabled = false,
  disabledReason,
  ariaLabel,
  primary = false,
  progress = null,
}: ActionCardProps) {
  // Unique id so we can wire disabled reasons to SR via aria-describedby.
  const reactId = useId();
  const reasonId = `${reactId}-reason`;

  const iconBoxCls =
    iconTone === "emerald"
      ? "bg-emerald-50 text-emerald-600"
      : "bg-sky-50 text-sky-600";

  const buttonCls = primary
    ? "bg-sky-600 text-white hover:bg-sky-700 disabled:bg-slate-200 disabled:text-slate-400"
    : "border border-slate-200 bg-white text-slate-700 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400";

  const hasReason = disabled && !!disabledReason;
  const showProgress =
    typeof progress === "number" && progress >= 0 && progress <= 1;

  return (
    <div
      className="group flex h-full min-h-0 flex-col rounded-2xl border border-slate-200 bg-white p-4 transition-all hover:border-slate-300 hover:shadow-sm"
      aria-label={ariaLabel}
    >
      <div className="flex items-start gap-3">
        <div
          className={
            "flex size-9 shrink-0 items-center justify-center rounded-lg " +
            iconBoxCls
          }
          aria-hidden
        >
          <Icon className="size-[18px]" strokeWidth={1.8} />
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-[13px] font-bold leading-tight text-slate-900">
            {title}
          </h4>
          <p className="mt-1 line-clamp-2 text-[11.5px] leading-relaxed text-slate-500">
            {description}
          </p>
        </div>
      </div>

      {hasReason ? (
        <p
          id={reasonId}
          className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[10.5px] leading-snug text-slate-500"
          role="note"
        >
          {disabledReason}
        </p>
      ) : null}

      {showProgress ? (
        <div
          className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round((progress ?? 0) * 100)}
          aria-label={`${title} 진행률`}
        >
          <div
            className="h-full bg-sky-500 transition-all"
            style={{ width: `${Math.round((progress ?? 0) * 100)}%` }}
          />
        </div>
      ) : null}

      <div className="mt-auto pt-3">
        <button
          type="button"
          onClick={onAction}
          disabled={disabled}
          aria-label={`${title} — ${actionLabel}`}
          aria-describedby={hasReason ? reasonId : undefined}
          title={hasReason ? disabledReason : undefined}
          className={
            "inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-semibold transition-colors disabled:cursor-not-allowed " +
            buttonCls
          }
        >
          <span>{actionLabel}</span>
          <ArrowRight className="size-3.5" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
