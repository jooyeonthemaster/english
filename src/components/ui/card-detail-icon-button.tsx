"use client";

import type { ButtonHTMLAttributes } from "react";
import { Maximize2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type CardDetailIconButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> & {
  icon?: LucideIcon;
  iconClassName?: string;
};

export function CardDetailIconButton({
  icon: Icon = Maximize2,
  className,
  iconClassName,
  type = "button",
  title = "상세보기",
  "aria-label": ariaLabel = "상세보기",
  ...props
}: CardDetailIconButtonProps) {
  return (
    <button
      type={type}
      title={title}
      aria-label={ariaLabel}
      data-card-click-ignore="true"
        data-drag-select-ignore="true"
        {...props}
        className={cn(
          "inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white/95 text-slate-500 shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-300 disabled:shadow-none",
          className,
        )}
      >
      <Icon className={cn("size-4", iconClassName)} aria-hidden="true" />
    </button>
  );
}
