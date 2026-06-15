"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { draggable } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { setCustomNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview";
import { CheckCircle2, FileText, Pencil, Maximize2, type LucideIcon } from "lucide-react";

import type { M1PassageDraftWithJob } from "../types";
import {
  getDraftSourceFileNames,
  getDraftSourceLabel,
} from "../utils/draft-source";
import { isDraftAnalysisComplete } from "../utils/analysis-status";
import { getDraftDisplayTitle } from "../utils/title";
import { RestorationBadge } from "./restoration-badge";
import { DetailActionButton } from "@/components/ui/detail-action-button";
import { DragHandle } from "@/components/ui/drag-handle";

export type DraftCardStatusBadgeMode = "review" | "analysis";
export type DraftCardActionVariant = {
  label?: string;
  icon?: LucideIcon;
};

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
  /** True when this draft is already loaded into the embedder's workspace
   *  (학습지 생성 우측 지문 스택). Renders a subtle blue tint + '불러옴' chip so
   *  the teacher can see at a glance which 자료 are in the current session. */
  loadedInWorkspace?: boolean;
  /** Hide the selection checkbox. Used by contexts (e.g., the extraction
   *  page preview drawer) that don't expose folder/bulk operations the
   *  checkbox feeds into. */
  hideCheckbox?: boolean;
  /** Persist a new title for this draft. When omitted, the title becomes
   *  read-only (e.g., in read-only preview contexts). */
  onTitleChange?: (id: string, value: string | null) => void;
  /** Which workflow status the circular stamp should express. */
  statusBadgeMode?: DraftCardStatusBadgeMode;
  /** 영역 선택(마키) 우선 모드: 체크된 카드만 네이티브 드래그를 허용한다.
   *  (미선택 카드는 draggable 미등록 → 카드 위에서 영역 드래그가 동작) */
  dragRequiresSelection?: boolean;
  detailAction?: DraftCardActionVariant;
  /** Optional secondary action — opens the 복원 근거 detail modal, shown as a
   *  "지문 전체 보기" button next to the primary action. Used by the 학습지 생성
   *  embed where the primary action picks the draft into the editor. */
  onOpenDetail?: () => void;
}

export function DraftCard({
  draft,
  active,
  checked,
  onClick,
  onToggleCheck,
  bulkDragIds,
  recentlyViewed,
  loadedInWorkspace = false,
  hideCheckbox,
  onTitleChange,
  statusBadgeMode = "review",
  detailAction,
  onOpenDetail,
}: DraftCardProps) {
  const dragRef = useRef<HTMLDivElement>(null);
  const dragHandleRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [titleEditState, setTitleEditState] = useState<{
    draftId: string;
    value: string;
  } | null>(null);
  const titleEditing = titleEditState?.draftId === draft.id;
  const titleInput = titleEditing ? titleEditState.value : draft.title ?? "";
  const setTitleInput = useCallback(
    (value: string) => setTitleEditState({ draftId: draft.id, value }),
    [draft.id],
  );

  const commitTitle = useCallback(() => {
    if (!onTitleChange) {
      setTitleEditState(null);
      return;
    }
    const trimmed = titleInput.trim();
    const next = trimmed.length > 0 ? trimmed : null;
    const current = draft.title ?? null;
    if (next !== current) {
      onTitleChange(draft.id, next);
    }
    setTitleEditState(null);
  }, [titleInput, draft.id, draft.title, onTitleChange]);

  const cancelTitleEdit = useCallback(() => {
    setTitleEditState(null);
  }, []);
  // Keep latest values in a ref so the draggable callback (registered once
  // per draft id) always reads the current checked/bulk state at drag-start.
  const dragStateRef = useRef({ checked, bulkDragIds });

  useLayoutEffect(() => {
    dragStateRef.current = { checked, bulkDragIds };
  }, [checked, bulkDragIds]);

  useEffect(() => {
    // 네이티브 드래그(폴더 이동)는 손잡이에만 등록 → 카드 본문은 영역 선택용.
    const el = dragHandleRef.current;
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

  // Prefer the restored/teacher-edited text for the snippet so a restored
  // draft's card actually *looks* restored — matching the editor, 가져오기,
  // and 일괄 분석, which all read teacherText || restoredText || rawText.
  // (The list payload blanks restoredText but keeps teacherText, so the
  // teacherText branch is what carries the restored prose here.)
  const preview = (
    draft.teacherText?.trim() ||
    draft.restoredText?.trim() ||
    draft.rawText ||
    ""
  )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);

  const isReviewed = draft.reviewStatus === "COMMITTED";
  const isAnalyzed = isDraftAnalysisComplete(draft);
  const stampDone = statusBadgeMode === "analysis" ? isAnalyzed : isReviewed;
  const stampLabel =
    statusBadgeMode === "analysis"
      ? stampDone
        ? "분석완료"
        : "분석필요"
      : stampDone
        ? "검수완료"
        : "검수필요";
  const stampDoneClass =
    statusBadgeMode === "analysis"
      ? "border-blue-600/85 text-blue-700"
      : "border-emerald-600/85 text-emerald-700";
  const stampNeededClass =
    statusBadgeMode === "analysis"
      ? "border-amber-300/80 bg-amber-50/40 text-amber-500/90"
      : "border-red-300/70 bg-red-50/30 text-red-400/80";

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
      data-drag-item-id={hideCheckbox ? undefined : draft.id}
      role="button"
      tabIndex={0}
      aria-pressed={checked}
      onClick={hideCheckbox ? undefined : onToggleCheck}
      onKeyDown={(e) => {
        if (hideCheckbox) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggleCheck();
        }
      }}
      className={
        "relative flex h-full min-h-[112px] min-w-0 flex-col gap-1.5 overflow-hidden rounded-lg border bg-white p-2.5 shadow-sm motion-safe:transition-colors motion-safe:duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 " +
        (isDragging
          ? "cursor-grabbing opacity-50"
          : hideCheckbox
            ? "cursor-default"
            : "cursor-pointer") +
        " " +
        (active
          ? "border-blue-300 bg-blue-50/40 ring-1 ring-blue-100"
          : checked
            ? "border-blue-300 bg-blue-50/30 ring-1 ring-blue-100"
          : loadedInWorkspace
            ? "border-blue-200/90 bg-blue-50/25 ring-1 ring-blue-100/80 hover:border-blue-300/80"
          : stampDone
            ? "border-slate-200 hover:border-slate-300 hover:bg-slate-50/60"
            : statusBadgeMode === "analysis"
              ? "border-amber-200/90 shadow-[0_0_0_1px_rgba(251,191,36,0.28),0_0_18px_rgba(245,158,11,0.10)] hover:border-amber-300/90"
              : "border-red-200/80 shadow-[0_0_0_1px_rgba(252,165,165,0.35),0_0_18px_rgba(248,113,113,0.12)] hover:border-red-300/80") +
        // "Just came back from this card" hint — one-shot bg flash. We keep
        // the workflow-status border intact so attention-needed cards stay
        // identifiable.
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
      ) : loadedInWorkspace ? (
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-1 bg-blue-300/70"
        />
      ) : null}
      {stampDone ? (
        <span
          role="img"
          aria-label={stampLabel}
          className={
            "pointer-events-none absolute right-1.5 top-1.5 z-10 flex size-7 -rotate-12 select-none items-center justify-center whitespace-nowrap rounded-full border-2 bg-white/70 text-[7px] font-bold tracking-tighter shadow-sm backdrop-blur-[1px] " +
            stampDoneClass
          }
        >
          {stampLabel}
        </span>
      ) : (
        <span
          role="img"
          aria-label={stampLabel}
          className={
            "pointer-events-none absolute right-1.5 top-1.5 z-10 flex size-7 -rotate-12 select-none items-center justify-center rounded-full border border-dashed text-[7.5px] font-bold tracking-tight " +
            stampNeededClass
          }
        >
          {stampLabel}
        </span>
      )}
      <div className="flex items-start justify-between gap-2 pr-8">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <DragHandle ref={dragHandleRef} className="shrink-0" />
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
                className="size-3.5 cursor-pointer rounded border-slate-300 text-blue-600 focus-visible:ring-2 focus-visible:ring-blue-500"
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
              className="h-6 w-full min-w-0 flex-1 rounded-md border border-blue-300 bg-white px-1.5 text-[11.5px] font-bold text-slate-900 outline-none ring-2 ring-blue-100 placeholder:font-medium placeholder:text-slate-400"
            />
          ) : onTitleChange ? (
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setTitleEditState({
                  draftId: draft.id,
                  value: draft.title ?? "",
                });
              }}
              className="group flex min-w-0 flex-1 cursor-text items-center gap-1 rounded-md text-left"
              title="제목 편집"
            >
              <span className="truncate text-[11.5px] font-bold text-slate-900 group-hover:text-blue-700">
                {getDraftDisplayTitle(draft)}
              </span>
              <Pencil
                className="size-2.5 shrink-0 text-slate-300 transition-colors group-hover:text-blue-500"
                aria-hidden="true"
              />
            </button>
          ) : (
            <span className="min-w-0 flex-1 truncate text-[11.5px] font-bold text-slate-900">
              {getDraftDisplayTitle(draft)}
            </span>
          )}
        </div>
      </div>

      {primaryFile ? (
        <div
          className="flex min-w-0 items-center gap-1 rounded bg-slate-100/80 px-1.5 py-0.5 ring-1 ring-slate-200/70"
          title={getDraftSourceLabel(draft)}
        >
          <FileText className="size-3 shrink-0 text-slate-500" aria-hidden="true" />
          <span className="truncate text-[10.5px] font-semibold text-slate-700">
            {primaryFile}
          </span>
          {extraFileCount > 0 ? (
            <span className="shrink-0 rounded bg-white px-1 py-0 text-[9px] font-bold text-slate-500 ring-1 ring-slate-200">
              +{extraFileCount}
            </span>
          ) : null}
          {pageLabel ? (
            <span className="shrink-0 text-[9.5px] font-bold tabular-nums text-slate-400">
              · {pageLabel}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-1">
        <RestorationBadge status={draft.restorationStatus} />
        {loadedInWorkspace ? (
          <span className="inline-flex shrink-0 items-center gap-0.5 rounded border border-blue-200 bg-blue-50 px-1 py-px text-[9.5px] font-bold leading-none text-blue-600">
            <CheckCircle2 className="size-2.5" aria-hidden="true" />
            불러옴
          </span>
        ) : null}
      </div>

      <p className="line-clamp-2 text-[11px] leading-snug text-slate-600">
        {preview || "추출된 본문이 비어있습니다."}
      </p>
      <div className="mt-auto flex flex-wrap items-center justify-end gap-1.5 pt-1">
        {onOpenDetail ? (
          <DetailActionButton
            icon={Maximize2}
            onClick={(e) => {
              e.stopPropagation();
              onOpenDetail();
            }}
          >
            지문 전체 보기
          </DetailActionButton>
        ) : null}
        <DetailActionButton
          icon={detailAction?.icon ?? Maximize2}
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
        >
          {detailAction?.label ?? "상세보기"}
        </DetailActionButton>
      </div>
    </div>
  );
}
