"use client";

import { Loader2, ScanText } from "lucide-react";

/**
 * In-progress extraction card. Same footprint as a real DraftCard (min-h-112,
 * rounded-lg border, p-2.5) so it sits cleanly inline in the same 자료 grid, but
 * styled as an unmistakable "추출 중" loading state: blue accent, a spinner
 * badge, shimmering body bars, and an indeterminate progress bar at the bottom.
 * Used for the per-passage in-progress placeholders while extraction runs.
 */
export function InProgressDraftCard() {
  return (
    <div className="relative flex h-full min-h-[112px] min-w-0 flex-col gap-1.5 overflow-hidden rounded-lg border border-blue-200 bg-blue-50/30 p-2.5 shadow-sm">
      {/* "추출 중" badge */}
      <span className="pointer-events-none absolute right-1.5 top-1.5 z-10 inline-flex items-center gap-1 rounded-full border border-blue-200 bg-white/95 px-1.5 py-0.5 text-[8.5px] font-bold text-blue-600 shadow-sm">
        <Loader2 className="size-2.5 animate-spin" aria-hidden="true" />
        추출 중
      </span>

      {/* Top: icon + title placeholder */}
      <div className="flex items-center gap-2 pr-14">
        <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-blue-100 text-blue-600">
          <ScanText className="size-3" aria-hidden="true" />
        </span>
        <Bar w="w-28" h="h-3" />
      </div>

      {/* Badge row placeholder */}
      <div className="flex items-center gap-1.5">
        <Bar w="w-14" h="h-4" className="rounded-full" />
      </div>

      {/* Body line placeholders */}
      <div className="space-y-1.5">
        <Bar w="w-full" h="h-2.5" />
        <Bar w="w-[90%]" h="h-2.5" />
        <Bar w="w-[70%]" h="h-2.5" />
      </div>

      {/* Indeterminate progress bar */}
      <div className="mt-auto h-1 w-full overflow-hidden rounded-full bg-blue-100">
        <div className="h-full w-1/3 rounded-full bg-blue-400 motion-safe:animate-[in-progress-slide_1.5s_ease-in-out_infinite]" />
      </div>

      {/* Shimmer sweep */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/55 to-transparent motion-safe:animate-[in-progress-shimmer_1.6s_ease-in-out_infinite]"
      />

      <style jsx>{`
        @keyframes in-progress-shimmer {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }
        @keyframes in-progress-slide {
          0% {
            transform: translateX(-110%);
          }
          50% {
            transform: translateX(130%);
          }
          100% {
            transform: translateX(320%);
          }
        }
      `}</style>
    </div>
  );
}

function Bar({
  w,
  h = "h-2.5",
  className = "",
}: {
  w: string;
  h?: string;
  className?: string;
}) {
  return (
    <span className={`block rounded bg-blue-200/60 ${w} ${h} ${className}`} />
  );
}
