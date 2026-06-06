"use client";

import { Loader2, ScanText } from "lucide-react";
import type { PendingExtraction } from "./use-generate-extraction";

/**
 * Per-passage loading cards shown at the top of the 내 지문 list while image/PDF
 * extraction runs. One card per expected passage (crop region) per in-flight
 * job — so the user watches the extraction queue land directly in the passage
 * list, and the cards are replaced by real passage cards on completion.
 */
export function ExtractionLoadingCards({
  pending,
}: {
  pending: PendingExtraction[];
}) {
  if (pending.length === 0) return null;

  const cards: { key: string; index: number }[] = [];
  pending.forEach((p) => {
    const count = Math.max(1, p.count);
    for (let i = 0; i < count; i += 1) {
      cards.push({ key: `${p.jobId}-${i}`, index: cards.length });
    }
  });

  return (
    <div className="mb-3">
      <div className="mb-2 flex items-center gap-1.5 px-0.5">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" aria-hidden="true" />
        <span className="text-[12px] font-semibold text-blue-700">
          이미지·PDF에서 지문 {cards.length}개 추출 중…
        </span>
        <span className="text-[11px] text-slate-400">
          완료되면 목록에 자동으로 추가됩니다
        </span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
        {cards.map((c) => (
          <div
            key={c.key}
            className="relative overflow-hidden rounded-xl border border-blue-200 bg-white p-3.5 shadow-sm"
          >
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-50 text-blue-600">
                <ScanText className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <span className="text-[12.5px] font-bold text-slate-700">
                지문 추출 중
              </span>
              <Loader2
                className="ml-auto h-3.5 w-3.5 animate-spin text-blue-500"
                aria-hidden="true"
              />
            </div>

            {/* skeleton text lines */}
            <div className="mt-3 space-y-2">
              <div className="h-2.5 w-3/4 animate-pulse rounded bg-slate-100" />
              <div className="h-2.5 w-full animate-pulse rounded bg-slate-100" />
              <div className="h-2.5 w-5/6 animate-pulse rounded bg-slate-100" />
            </div>

            {/* indeterminate progress bar */}
            <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-blue-100">
              <div className="h-full w-1/3 animate-pulse rounded-full bg-blue-400" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
