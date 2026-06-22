"use client";

import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

import type { M1PassageDraftWithJob } from "../types";

/**
 * 자료 카드(작업 단위) 하단의 "검수완료" 토글 버튼.
 *
 * 작업에 속한 모든 복원 자료(draft)의 검수 상태를 한 번에 뒤집는다.
 *  - 검수 필요한 자료가 하나라도 있으면 → 누르면 모두 검수완료(promote).
 *  - 이미 전부 검수완료면(aria-pressed) → 누르면 검수를 취소(unpromote).
 * 실제 처리는 상위에서 내려주는 draft 단위 핸들러(자료 관리와 동일한 경로)를
 * 재사용한다 — 별도 API 경로를 새로 만들지 않는다.
 */
export function JobReviewToggleButton({
  drafts,
  onPromote,
  onUnpromote,
}: {
  drafts: M1PassageDraftWithJob[];
  onPromote: (draft: M1PassageDraftWithJob) => Promise<void>;
  onUnpromote: (draft: M1PassageDraftWithJob) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  if (drafts.length === 0) return null;

  const pending = drafts.filter((d) => d.reviewStatus !== "COMMITTED");
  const allCommitted = pending.length === 0;

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      if (allCommitted) {
        for (const d of drafts) await onUnpromote(d);
      } else {
        for (const d of pending) await onPromote(d);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      aria-pressed={allCommitted}
      title={
        allCommitted
          ? "검수완료 — 누르면 검수를 취소합니다"
          : "검수필요 — 누르면 검수완료로 표시합니다"
      }
      className={
        "inline-flex h-7 flex-1 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md border bg-white px-2 text-[11px] font-semibold transition-all outline-none focus-visible:ring-[3px] focus-visible:ring-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-60 " +
        (allCommitted
          ? "border-emerald-500 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
          : "border-red-200/80 text-red-300 hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-600")
      }
    >
      {busy ? (
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
      ) : (
        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
      )}
      검수완료
    </button>
  );
}
