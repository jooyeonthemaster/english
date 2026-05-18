"use client";

import { useEffect, useRef, useState } from "react";
import { draggable } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { CheckCircle2, Copy, FileText, Layers } from "lucide-react";

import type { M1PassageDraftWithJob } from "../types";
import {
  getDraftSourceFileNames,
  getDraftSourceLabel,
} from "../utils/draft-source";
import { getDraftDisplayTitle } from "../utils/title";
import { RestorationBadge } from "./restoration-badge";
import { RestorationMethodBadge } from "./restoration-method-badge";

interface DraftCardProps {
  draft: M1PassageDraftWithJob;
  index: number;
  selected: boolean;
  active: boolean;
  checked: boolean;
  onClick: () => void;
  onToggleCheck: () => void;
  /** Optional. When this draft is part of a duplicate cluster, the number
   *  of *other* drafts that share its normalized content. */
  dupCount?: number;
}

export function DraftCard({
  draft,
  index,
  active,
  checked,
  onClick,
  onToggleCheck,
  dupCount,
}: DraftCardProps) {
  const dragRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const el = dragRef.current;
    if (!el) return;
    return draggable({
      element: el,
      getInitialData: () => ({ draftId: draft.id, type: "draft" }),
      onDragStart: () => setIsDragging(true),
      onDrop: () => setIsDragging(false),
    });
  }, [draft.id]);

  const preview = draft.rawText
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);

  const isPromoted =
    draft.savedPassageId != null || draft.reviewStatus === "COMMITTED";

  const fileNames = getDraftSourceFileNames(draft);
  const primaryFile =
    fileNames[0] ?? draft.job?.originalFileName ?? null;
  const extraFileCount = Math.max(0, fileNames.length - 1);
  // Prefer the booklet's own page number (examMeta.pageNumber). Falls back
  // to upload-order pageIndex+1 when OCR didn't capture the page footer.
  const examPageNumberByIndex = new Map(
    (draft.job?.pages ?? [])
      .filter((p) => typeof p.examPageNumber === "number")
      .map((p) => [p.pageIndex, p.examPageNumber as number] as const),
  );
  const pageLabel = draft.sourcePageIndex.length > 0
    ? `${draft.sourcePageIndex
        .map((p) => examPageNumberByIndex.get(p) ?? p + 1)
        .join(", ")}p`
    : null;

  return (
    <div
      ref={dragRef}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={
        "relative flex h-full min-h-[176px] min-w-0 flex-col gap-3 overflow-hidden rounded-xl border bg-white p-4 shadow-sm motion-safe:transition-colors motion-safe:duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 " +
        (isDragging
          ? "cursor-grabbing opacity-50"
          : "cursor-grab active:cursor-grabbing") +
        " " +
        (active
          ? "border-blue-300 bg-blue-50/40 ring-1 ring-blue-100"
          : "border-slate-200 hover:border-slate-300 hover:bg-slate-50/60")
      }
    >
      {active ? (
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-blue-500 to-blue-600"
        />
      ) : null}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="-m-1 flex shrink-0 cursor-pointer items-center p-1"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onToggleCheck();
            }}
          >
            <input
              type="checkbox"
              checked={checked}
              readOnly
              tabIndex={-1}
              className="size-4 cursor-pointer rounded border-slate-300 text-blue-600 focus-visible:ring-2 focus-visible:ring-blue-500"
              aria-label="자료 선택"
            />
          </div>
          <span className="shrink-0 text-xs font-bold tabular-nums text-slate-400">
            #{index + 1}
          </span>
          <span className="truncate text-sm font-bold text-slate-900">
            {getDraftDisplayTitle(draft)}
          </span>
        </div>
      </div>

      {primaryFile ? (
        <div
          className="flex min-w-0 items-center gap-1.5 rounded-md bg-slate-100/80 px-2 py-1 ring-1 ring-slate-200/70"
          title={getDraftSourceLabel(draft)}
        >
          <FileText className="size-3.5 shrink-0 text-slate-500" aria-hidden="true" />
          <span className="truncate text-xs font-semibold text-slate-700">
            {primaryFile}
          </span>
          {extraFileCount > 0 ? (
            <span className="shrink-0 rounded bg-white px-1 py-0.5 text-[10px] font-bold text-slate-500 ring-1 ring-slate-200">
              +{extraFileCount}
            </span>
          ) : null}
          {pageLabel ? (
            <span className="shrink-0 text-[11px] font-bold tabular-nums text-slate-400">
              · {pageLabel}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5">
        <RestorationBadge status={draft.restorationStatus} />
        <RestorationMethodBadge draft={draft} />
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold tabular-nums text-slate-600">
          <Layers className="size-3" aria-hidden="true" />
          {draft.sourcePageIndex.length}p
        </span>
        {dupCount && dupCount > 0 ? (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 ring-1 ring-slate-200"
            title={`동일한 내용의 자료 ${dupCount}개가 더 존재합니다`}
          >
            <Copy className="size-3" aria-hidden="true" />
            {dupCount} 중복
          </span>
        ) : null}
        {isPromoted ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200">
            <CheckCircle2 className="size-3" aria-hidden="true" />
            지문 등록 완료
          </span>
        ) : null}
      </div>

      <p className="line-clamp-3 text-[13px] leading-6 text-slate-600">
        {preview || "추출된 본문이 비어있습니다."}
      </p>
    </div>
  );
}
