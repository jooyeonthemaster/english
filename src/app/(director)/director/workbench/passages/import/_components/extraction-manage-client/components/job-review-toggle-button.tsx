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
  // 일부 자료만 검수완료된 상태(= 검수 진행 중). 버튼은 아직 '미검수'로 두되
  // 라벨 옆에 (검수중)을 덧붙여 부분 진행 상태를 드러낸다. 단일 자료(drawer
  // per-draft)는 0개 아니면 전부라 항상 false → 표시되지 않는다.
  const inReview = !allCommitted && pending.length < drafts.length;

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
          : inReview
            ? "검수 진행 중 — 누르면 나머지도 검수완료로 표시합니다"
            : "검수필요 — 누르면 검수완료로 표시합니다"
      }
      className={
        "inline-flex h-7 flex-1 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md border bg-white px-2 text-[12px] font-semibold transition-all outline-none focus-visible:ring-[3px] focus-visible:ring-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-60 " +
        (allCommitted
          ? "border-emerald-500 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
          : "border-red-200/80 text-red-300 hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-600")
      }
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      <span className="inline-flex items-baseline gap-1">
        <span>{allCommitted ? "검수완료" : "미검수"}</span>
        {inReview ? (
          <span className="text-[11px] font-medium text-slate-400">
            (검수중)
          </span>
        ) : null}
      </span>
    </button>
  );
}

/**
 * 복원된 자료(draft)가 없는 작업(취소·실패)에서 검수완료 토글이 들어갈
 * 자리를 비워두지 않도록 같은 크기로 표시하는 비활성 버튼. 검수할 대상이
 * 없으므로 회색·disabled 상태로 작업 상태(취소/실패)만 라벨로 보여준다.
 */
export function JobReviewDisabledButton({
  status,
}: {
  status: "cancelled" | "failed";
}) {
  const label = status === "cancelled" ? "취소됨" : "실패됨";
  return (
    <button
      type="button"
      disabled
      aria-disabled="true"
      title={`${label}된 작업이라 검수할 항목이 없습니다`}
      className="inline-flex h-7 flex-1 cursor-not-allowed items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-slate-200 bg-slate-50 px-2 text-[12px] font-semibold text-slate-400 outline-none"
    >
      {label}
    </button>
  );
}
