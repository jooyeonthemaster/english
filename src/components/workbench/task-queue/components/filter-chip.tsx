"use client";

import type { ReactNode } from "react";

export function FilterChip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "cursor-pointer rounded-full px-2.5 py-1 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 " +
        (active
          ? "bg-emerald-600 text-white"
          : "border border-slate-200 bg-white text-slate-500 hover:bg-slate-50")
      }
    >
      {children}
    </button>
  );
}
