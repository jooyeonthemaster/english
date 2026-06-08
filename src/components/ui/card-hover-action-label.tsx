"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type CardHoverActionLabelProps = {
  children?: ReactNode;
  className?: string;
};

export function CardHoverActionLabel({
  children = "상세보기",
  className,
}: CardHoverActionLabelProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute bottom-2 right-2 z-20 whitespace-nowrap text-[11px] font-bold text-sky-500 opacity-0 drop-shadow-sm transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100",
        className,
      )}
    >
      {children}
    </span>
  );
}
