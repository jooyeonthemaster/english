"use client";

import type { ExtractionJobStatus } from "@/lib/extraction/types";

export function JobStatusBadge({ status }: { status: ExtractionJobStatus }) {
  const label =
    status === "PROCESSING"
      ? "진행중"
      : status === "PENDING"
        ? "대기중"
        : status === "COMPLETED"
          ? "완료"
          : status === "PARTIAL"
            ? "부분완료"
            : status === "FAILED"
              ? "실패"
              : "취소";
  return (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-bold text-slate-600">
      {label}
    </span>
  );
}
