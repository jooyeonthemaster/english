"use client";

import { Loader2 } from "lucide-react";

export function RestorationBadge({ status }: { status: string }) {
  if (status === "PENDING") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-bold text-slate-600">
        <Loader2 className="size-3 animate-spin" aria-hidden="true" />
        복원 중
      </span>
    );
  }
  if (status === "NO_RESTORATION_NEEDED") {
    return (
      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-bold text-emerald-700">
        복원 불필요
      </span>
    );
  }
  if (status === "PARTIAL" || status === "FAILED") {
    return (
      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-bold text-amber-700">
        확인 필요
      </span>
    );
  }
  return (
    <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10.5px] font-bold text-sky-700">
      복원됨
    </span>
  );
}
