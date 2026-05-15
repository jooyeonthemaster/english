"use client";

import { Clock3 } from "lucide-react";

export function TaskEmptyState({ message }: { message: string }) {
  return (
    <div className="flex min-h-[150px] flex-col items-center justify-center rounded-md border border-dashed border-slate-200 bg-white py-8 text-center text-xs text-slate-400">
      <Clock3 className="mb-2 size-6 text-slate-300" aria-hidden="true" />
      {message}
    </div>
  );
}
