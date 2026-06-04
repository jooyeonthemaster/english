"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const DETAIL_ACTION_BUTTON_CLASS =
  "flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-blue-200 bg-white px-2 text-[11px] font-semibold text-blue-700 shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200";

export const DETAIL_ACTION_BUTTON_ICON_CLASS = "h-3 w-3 shrink-0";

type DetailActionButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  children?: ReactNode;
  iconClassName?: string;
};

export function DetailActionButton({
  children = "상세 보기",
  className,
  iconClassName,
  type = "button",
  ...props
}: DetailActionButtonProps) {
  return (
    <button
      type={type}
      className={cn(DETAIL_ACTION_BUTTON_CLASS, className)}
      {...props}
    >
      <span className="truncate">{children}</span>
      <Maximize2 className={cn(DETAIL_ACTION_BUTTON_ICON_CLASS, iconClassName)} />
    </button>
  );
}
