"use client";

import { AlertOctagon, Loader2 } from "lucide-react";

export function RestorationBadge({ status }: { status: string }) {
  if (status === "PENDING") {
    return (
      <span className="relative inline-flex items-center gap-1 rounded-full bg-slate-100 px-1.5 py-0 text-[10px] font-bold text-slate-600">
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full bg-slate-400/30 motion-safe:animate-ping"
        />
        <Loader2 className="relative size-2.5 motion-safe:animate-spin" aria-hidden="true" />
        <span className="relative">복원 중</span>
      </span>
    );
  }
  if (status === "NO_RESTORATION_NEEDED") {
    return (
      <span className="inline-flex items-center rounded-full bg-gradient-to-b from-slate-50 to-slate-100/70 px-1.5 py-0 text-[10px] font-bold text-slate-600 ring-1 ring-slate-200/60">
        복원 불필요
      </span>
    );
  }
  if (status === "RESTORED") {
    return (
      <span className="inline-flex items-center rounded-full bg-gradient-to-b from-sky-50 to-sky-100/70 px-1.5 py-0 text-[10px] font-bold text-sky-700 ring-1 ring-sky-200/60">
        복원됨
      </span>
    );
  }
  if (status === "FAILED") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-b from-red-50 to-red-100/70 px-1.5 py-0 text-[10px] font-bold text-red-700 ring-1 ring-red-200/70">
        <AlertOctagon className="size-2.5" aria-hidden="true" />
        복원 실패
      </span>
    );
  }
  // PARTIAL or any unknown status — restoration *was* attempted but the
  // outcome wasn't clean. Render the 복원됨 outcome alongside an orthogonal
  // 확인 필요 flag so reviewers see both: "it was restored, but verify it."
  return (
    <>
      <span className="inline-flex items-center rounded-full bg-gradient-to-b from-sky-50 to-sky-100/70 px-1.5 py-0 text-[10px] font-bold text-sky-700 ring-1 ring-sky-200/60">
        복원됨
      </span>
      <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-b from-amber-50 to-amber-100/70 px-1.5 py-0 text-[10px] font-bold text-amber-800 ring-1 ring-amber-200/70">
        <span
          aria-hidden="true"
          className="size-1.5 rounded-full bg-amber-500 motion-safe:animate-pulse"
        />
        확인 필요
      </span>
    </>
  );
}
