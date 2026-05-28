"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { draggable } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { setCustomNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview";
import { FileText, Pencil } from "lucide-react";

import type { M1PassageDraftWithJob } from "../types";
import {
  getDraftSourceFileNames,
  getDraftSourceLabel,
} from "../utils/draft-source";
import { getDraftDisplayTitle } from "../utils/title";
import { RestorationBadge } from "./restoration-badge";

interface DraftCardProps {
  draft: M1PassageDraftWithJob;
  index: number;
  selected: boolean;
  active: boolean;
  checked: boolean;
  onClick: () => void;
  onToggleCheck: () => void;
  /** Optional. All currently-checked draft IDs in the surrounding view. If
   *  the user drags this card while it's checked and the group has 2+ ids,
   *  the drag payload becomes a bulk move covering every checked draft —
   *  one drag, many drafts. */
  bulkDragIds?: string[];
  /** True when this card was the most recently opened in the detail modal.
   *  Renders a subtle shading so users can quickly find where they were
   *  after closing the popup. Overridden by `active` when both are true. */
  recentlyViewed?: boolean;
  /** Hide the selection checkbox. Used by contexts (e.g., the extraction
   *  page preview drawer) that don't expose folder/bulk operations the
   *  checkbox feeds into. */
  hideCheckbox?: boolean;
  /** Persist a new title for this draft. When omitted, the title becomes
   *  read-only (e.g., in read-only preview contexts). */
  onTitleChange?: (id: string, value: string | null) => void;
}

export function DraftCard({
  draft,
  index,
  active,
  checked,
  onClick,
  onToggleCheck,
  bulkDragIds,
  recentlyViewed,
  hideCheckbox,
  onTitleChange,
}: DraftCardProps) {
  const dragRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleInput, setTitleInput] = useState(draft.title ?? "");

  useEffect(() => {
    setTitleEditing(false);
    setTitleInput(draft.title ?? "");
  }, [draft.id, draft.title]);

  const commitTitle = useCallback(() => {
    if (!onTitleChange) {
      setTitleEditing(false);
      return;
    }
    const trimmed = titleInput.trim();
    const next = trimmed.length > 0 ? trimmed : null;
    const current = draft.title ?? null;
    if (next !== current) {
      onTitleChange(draft.id, next);
    }
    setTitleEditing(false);
  }, [titleInput, draft.id, draft.title, onTitleChange]);

  const cancelTitleEdit = useCallback(() => {
    setTitleInput(draft.title ?? "");
    setTitleEditing(false);
  }, [draft.title]);
  // Keep latest values in a ref so the draggable callback (registered once
  // per draft id) always reads the current checked/bulk state at drag-start.
  const dragStateRef = useRef({ checked, bulkDragIds });
  dragStateRef.current = { checked, bulkDragIds };

  useEffect(() => {
    const el = dragRef.current;
    if (!el) return;
    return draggable({
      element: el,
      getInitialData: () => {
        const { checked: c, bulkDragIds: ids } = dragStateRef.current;
        if (c && ids && ids.length > 1) {
          return { draftIds: ids, type: "draft-bulk" };
        }
        return { draftId: draft.id, type: "draft" };
      },
      onGenerateDragPreview: ({ nativeSetDragImage }) => {
        const { checked: c, bulkDragIds: ids } = dragStateRef.current;
        const count = c && ids && ids.length > 1 ? ids.length : 1;
        if (count <= 1) return;
        setCustomNativeDragPreview({
          nativeSetDragImage,
          getOffset: ({ container }) => {
            const rect = container.getBoundingClientRect();
            return { x: Math.min(120, rect.width / 2), y: 24 };
          },
          render: ({ container }) => {
            const source = dragRef.current;
            if (!source) return;
            const rect = source.getBoundingClientRect();
            const wrapper = document.createElement("div");
            wrapper.style.position = "relative";
            wrapper.style.width = `${rect.width}px`;
            wrapper.style.height = `${rect.height}px`;
            const backCount = Math.min(2, count - 1);
            for (let i = backCount; i >= 1; i--) {
              const back = document.createElement("div");
              back.style.position = "absolute";
              back.style.inset = "0";
              back.style.transform = `translate(${i * 6}px, ${i * 6}px)`;
              back.style.borderRadius = "12px";
              back.style.background = "white";
              back.style.border = "1px solid rgb(226, 232, 240)";
              back.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)";
              wrapper.appendChild(back);
            }
            const clone = source.cloneNode(true) as HTMLElement;
            clone.style.position = "relative";
            clone.style.width = `${rect.width}px`;
            clone.style.margin = "0";
            clone.style.opacity = "1";
            clone.style.transform = "none";
            wrapper.appendChild(clone);
            const badge = document.createElement("div");
            badge.textContent = String(count);
            badge.style.position = "absolute";
            badge.style.top = "-10px";
            badge.style.right = "-10px";
            badge.style.minWidth = "28px";
            badge.style.height = "28px";
            badge.style.padding = "0 8px";
            badge.style.borderRadius = "14px";
            badge.style.background = "#2563eb";
            badge.style.color = "white";
            badge.style.fontSize = "13px";
            badge.style.fontWeight = "700";
            badge.style.display = "flex";
            badge.style.alignItems = "center";
            badge.style.justifyContent = "center";
            badge.style.boxShadow = "0 4px 12px rgba(37,99,235,0.35)";
            badge.style.fontVariantNumeric = "tabular-nums";
            wrapper.appendChild(badge);
            container.appendChild(wrapper);
          },
        });
      },
      onDragStart: () => setIsDragging(true),
      onDrop: () => setIsDragging(false),
    });
  }, [draft.id]);

  const preview = draft.rawText
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);

  const isReviewed =
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
          : isReviewed
            ? "border-slate-200 hover:border-slate-300 hover:bg-slate-50/60"
            : "border-red-200/80 shadow-[0_0_0_1px_rgba(252,165,165,0.35),0_0_18px_rgba(248,113,113,0.12)] hover:border-red-300/80") +
        // "Just came back from this card" hint — one-shot bg flash. We keep
        // the review-status border intact so 검수필요 카드는 여전히 빨간 테
        // 두리로 식별됩니다.
        (recentlyViewed && !active
          ? " motion-safe:animate-[card-recently-viewed-flash_1.2s_ease-out]"
          : "")
      }
    >
      {active ? (
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-blue-500 to-blue-600"
        />
      ) : null}
      {isReviewed ? (
        <span
          role="img"
          aria-label="검수완료"
          className="pointer-events-none absolute right-2 top-2 z-10 flex size-10 -rotate-12 select-none items-center justify-center rounded-full border-2 border-emerald-600/85 bg-white/70 text-[9px] font-extrabold tracking-tight text-emerald-700 shadow-sm backdrop-blur-[1px]"
        >
          검수완료
        </span>
      ) : (
        <span
          role="img"
          aria-label="검수필요"
          className="pointer-events-none absolute right-2 top-2 z-10 flex size-10 -rotate-12 select-none items-center justify-center rounded-full border border-dashed border-red-300/70 bg-red-50/30 text-[9px] font-bold tracking-tight text-red-400/80"
        >
          검수필요
        </span>
      )}
      {/* Reserve right padding so the title row clears the stamp (size-10 at
          right-2 top-2 ≈ 48px wide). */}
      <div className="flex items-start justify-between gap-2 pr-12">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {hideCheckbox ? null : (
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
          )}
          {titleEditing && onTitleChange ? (
            <input
              autoFocus
              value={titleInput}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setTitleInput(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitTitle();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  cancelTitleEdit();
                }
              }}
              placeholder={getDraftDisplayTitle(draft)}
              maxLength={200}
              className="h-7 w-full min-w-0 flex-1 rounded-md border border-blue-300 bg-white px-2 text-sm font-bold text-slate-900 outline-none ring-2 ring-blue-100 placeholder:font-medium placeholder:text-slate-400"
            />
          ) : onTitleChange ? (
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setTitleInput(draft.title ?? "");
                setTitleEditing(true);
              }}
              className="group flex min-w-0 flex-1 cursor-text items-center gap-1.5 rounded-md text-left"
              title="제목 편집"
            >
              <span className="truncate text-sm font-bold text-slate-900 group-hover:text-blue-700">
                {getDraftDisplayTitle(draft)}
              </span>
              <Pencil
                className="size-3 shrink-0 text-slate-300 transition-colors group-hover:text-blue-500"
                aria-hidden="true"
              />
            </button>
          ) : (
            <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900">
              {getDraftDisplayTitle(draft)}
            </span>
          )}
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
      </div>

      <p className="line-clamp-3 text-[13px] leading-6 text-slate-600">
        {preview || "추출된 본문이 비어있습니다."}
      </p>
    </div>
  );
}
