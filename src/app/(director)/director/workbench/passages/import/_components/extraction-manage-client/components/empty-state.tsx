"use client";

import type { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex min-h-[460px] flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/70 text-center">
      <div className="text-slate-400">{icon}</div>
      <div className="mt-3 text-[14px] font-bold text-slate-700">{title}</div>
      {description ? <div className="mt-1 text-[12px] text-slate-400">{description}</div> : null}
    </div>
  );
}
