"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Maximize2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type CardDetailIconButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> & {
  icon?: LucideIcon;
  iconClassName?: string;
  /** 있으면 아이콘 오른쪽에 텍스트 라벨을 함께 보여주고 정사각형 대신 폭을 가진 버튼이 된다. */
  label?: ReactNode;
};

export function CardDetailIconButton({
  icon: Icon = Maximize2,
  className,
  iconClassName,
  label,
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
          "inline-flex shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white/95 text-slate-500 shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-300 disabled:shadow-none",
          label ? "h-8 gap-1.5 px-2.5 text-[12px] font-semibold" : "size-8",
          className,
        )}
      >
      <Icon className={cn("size-4", iconClassName)} aria-hidden="true" />
      {label ? <span>{label}</span> : null}
    </button>
  );
}
