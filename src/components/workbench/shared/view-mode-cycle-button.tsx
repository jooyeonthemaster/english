"use client";

import type { ComponentType, ReactNode } from "react";

import { cn } from "@/lib/utils";

export type ViewModeCycleOption<T extends string | number> = {
  value: T;
  label: string;
  /** Icon-only rendering. Omit to render `content` (or the label text) instead. */
  Icon?: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  /** Custom inline content (e.g. label + count) shown when there is no Icon. */
  content?: ReactNode;
  disabled?: boolean;
  disabledTitle?: string;
};

interface ViewModeCycleButtonProps<T extends string | number> {
  value: T;
  options: ReadonlyArray<ViewModeCycleOption<T>>;
  onChange: (value: T) => void;
  /** Show the label text next to the icon (auto-width pill instead of a square). */
  showLabel?: boolean;
  className?: string;
}

export function ViewModeCycleButton<T extends string | number>({
  value,
  options,
  onChange,
  showLabel = false,
  className,
}: ViewModeCycleButtonProps<T>) {
  const currentIndex = options.findIndex((option) => option.value === value);
  const current = options[currentIndex >= 0 ? currentIndex : 0];
  const enabledCount = options.filter((option) => !option.disabled).length;
  const clickDisabled = enabledCount <= 1;

  if (!current) return null;

  const Icon = current.Icon;
  // Square icon-only button only when there's a bare icon and no label/content.
  const isCompact = Boolean(Icon) && !showLabel && current.content == null;

  function cycleViewMode() {
    if (clickDisabled) return;

    const startIndex = currentIndex >= 0 ? currentIndex : -1;
    for (let offset = 1; offset <= options.length; offset += 1) {
      const next = options[(startIndex + offset) % options.length];
      if (next && !next.disabled) {
        onChange(next.value);
        return;
      }
    }
  }

  return (
    <button
      type="button"
      onClick={cycleViewMode}
      disabled={clickDisabled}
      aria-label={current.label}
      title={
        current.disabled && current.disabledTitle
          ? current.disabledTitle
          : `${current.label} · 클릭하여 전환`
      }
      className={cn(
        "flex shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-800",
        isCompact
          ? "size-7"
          : "h-7 gap-1 px-2.5 text-[11px] font-medium",
        clickDisabled && "cursor-not-allowed opacity-40 hover:bg-white hover:text-slate-600",
        className,
      )}
    >
      {current.content != null ? (
        current.content
      ) : (
        <>
          {Icon ? <Icon className={isCompact ? "size-4" : "size-3.5"} aria-hidden /> : null}
          {(showLabel || !Icon) && <span>{current.label}</span>}
        </>
      )}
    </button>
  );
}
