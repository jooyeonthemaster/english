"use client";

import { Layers, MoreVertical } from "lucide-react";

import type { M1PassageDraftWithJob } from "../types";
import {
  getDraftSourceLabel,
  getDraftSourceShortLabel,
} from "../utils/draft-source";
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
}

export function DraftCard({
  draft,
  index,
  active,
  checked,
  onClick,
  onToggleCheck,
}: DraftCardProps) {
  const preview = draft.rawText
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "copyMove";
        e.dataTransfer.setData("draftId", draft.id);
        e.dataTransfer.setData("text/plain", draft.id);
      }}
      className={
        "group flex h-full min-w-0 cursor-pointer flex-col gap-2 rounded-lg border bg-white p-3 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 " +
        (active
          ? "border-blue-300 ring-1 ring-blue-200"
          : "border-slate-200 hover:border-blue-200 hover:bg-slate-50")
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <label
            className="flex shrink-0 items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={onToggleCheck}
              className="size-3.5 cursor-pointer rounded border-slate-300 text-blue-600 focus-visible:ring-2 focus-visible:ring-blue-500"
              aria-label="자료 선택"
            />
          </label>
          <span className="shrink-0 text-[11px] font-bold text-slate-400">
            #{index + 1}
          </span>
          <span className="truncate text-[13px] font-bold text-slate-900">
            {draft.title ?? `지문 ${draft.passageOrder + 1}`}
          </span>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
          }}
          className="hidden shrink-0 cursor-pointer rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 group-hover:inline-flex"
          aria-label="추가 옵션"
        >
          <MoreVertical className="size-3.5" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <RestorationBadge status={draft.restorationStatus} />
        <RestorationMethodBadge draft={draft} />
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-bold text-slate-600">
          <Layers className="mr-0.5 inline-block size-2.5 align-[-1px]" />
          {draft.sourcePageIndex.length}p
        </span>
      </div>

      <p className="line-clamp-3 text-[12px] leading-5 text-slate-600">
        {preview || "추출된 본문이 비어있습니다."}
      </p>

      <div
        className="mt-auto truncate text-[11px] text-slate-400"
        title={getDraftSourceLabel(draft)}
      >
        {getDraftSourceShortLabel(draft)}
      </div>
    </div>
  );
}
