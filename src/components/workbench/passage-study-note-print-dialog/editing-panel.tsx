"use client";

import React, { useCallback } from "react";
import { Eye, EyeOff, GripVertical, RotateCcw } from "lucide-react";
import {
  CATEGORY_META,
  type PageCategory,
  type StudyNoteBlock,
} from "./types";
import type { EditingAction, EditingState } from "./editing-state";
import { useBlockDrag, type DropPlacement } from "./use-block-drag";

const CATEGORY_ORDER: PageCategory[] = [
  "summary",
  "body",
  "vocab",
  "grammar",
  "syntax",
  "exam",
];

interface EditingPanelProps {
  state: EditingState;
  dispatch: React.Dispatch<EditingAction>;
  effectiveBlocks: StudyNoteBlock[];
  hiddenBlocks: StudyNoteBlock[];
}

export function EditingPanel({
  state,
  dispatch,
  effectiveBlocks,
  hiddenBlocks,
}: EditingPanelProps) {
  const handleMove = useCallback(
    (sourceId: string, targetId: string, placement: DropPlacement) => {
      dispatch({ type: "moveBlock", sourceId, targetId, placement });
    },
    [dispatch],
  );
  const { dragState, startDrag } = useBlockDrag({ onMove: handleMove });

  return (
    <aside className="study-note-no-print flex h-full min-h-0 w-[380px] shrink-0 flex-col border-l border-slate-200 bg-white">
      <div className="shrink-0 border-b border-slate-100 px-4 py-3">
        <h3 className="text-[13px] font-bold text-slate-900">편집</h3>
        <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
          카테고리 ON/OFF, 블록 숨김·복원, 드래그로 순서 변경
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        <section className="border-b border-slate-100 px-4 py-3">
          <h4 className="mb-2 text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
            카테고리
          </h4>
          <div className="grid grid-cols-3 gap-1.5">
            {CATEGORY_ORDER.map((cat) => (
              <CategoryToggle
                key={cat}
                category={cat}
                enabled={state.categoriesEnabled[cat]}
                onToggle={() =>
                  dispatch({ type: "toggleCategory", category: cat })
                }
              />
            ))}
          </div>
        </section>

        <section className="border-b border-slate-100 px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
              블록 ({effectiveBlocks.length})
            </h4>
          </div>
          {effectiveBlocks.length === 0 ? (
            <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-[11px] text-slate-400">
              표시할 블록이 없습니다.
            </p>
          ) : (
            <div className="space-y-1">
              {effectiveBlocks.map((block) => (
                <BlockRow
                  key={block.id}
                  block={block}
                  dragging={dragState.draggingId === block.id}
                  dragOver={
                    dragState.dragOverId === block.id ? dragState.placement : null
                  }
                  onStartDrag={startDrag(block.id)}
                  onHide={() =>
                    dispatch({ type: "toggleHidden", blockId: block.id })
                  }
                />
              ))}
            </div>
          )}
        </section>

        {hiddenBlocks.length > 0 && (
          <section className="px-4 py-3">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
                숨김 ({hiddenBlocks.length})
              </h4>
              <button
                type="button"
                onClick={() => dispatch({ type: "restoreAll" })}
                className="text-[11px] font-semibold text-blue-600 hover:underline"
              >
                모두 보이기
              </button>
            </div>
            <div className="space-y-1">
              {hiddenBlocks.map((block) => (
                <HiddenBlockRow
                  key={block.id}
                  block={block}
                  onRestore={() =>
                    dispatch({ type: "toggleHidden", blockId: block.id })
                  }
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </aside>
  );
}

function CategoryToggle({
  category,
  enabled,
  onToggle,
}: {
  category: PageCategory;
  enabled: boolean;
  onToggle: () => void;
}) {
  const meta = CATEGORY_META[category];
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={enabled}
      className={
        "inline-flex h-7 items-center justify-center gap-1 rounded-md border text-[11px] font-bold transition-colors " +
        (enabled
          ? `${meta.bg} ${meta.fg} ${meta.border}`
          : "border-slate-200 bg-slate-50 text-slate-400")
      }
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${enabled ? meta.dot : "bg-slate-300"}`}
      />
      {meta.label}
    </button>
  );
}

function BlockRow({
  block,
  dragging,
  dragOver,
  onStartDrag,
  onHide,
}: {
  block: StudyNoteBlock;
  dragging: boolean;
  dragOver: DropPlacement | null;
  onStartDrag: (e: React.PointerEvent<HTMLElement>) => void;
  onHide: () => void;
}) {
  const meta = CATEGORY_META[block.category];
  return (
    <div
      data-editing-block-id={block.id}
      className={
        "relative flex items-center gap-1.5 rounded-md border bg-white px-2 py-1.5 transition " +
        (dragging ? "opacity-40 " : "") +
        (dragOver === "before"
          ? "border-blue-400 shadow-[0_-2px_0_0_rgb(59,130,246)] "
          : dragOver === "after"
          ? "border-blue-400 shadow-[0_2px_0_0_rgb(59,130,246)] "
          : "border-slate-200")
      }
    >
      <span
        onPointerDown={onStartDrag}
        className="inline-flex size-5 cursor-grab items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 active:cursor-grabbing"
        aria-label="드래그해서 이동"
        title="드래그해서 이동"
      >
        <GripVertical className="size-3.5" aria-hidden="true" />
      </span>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      <span className="flex-1 truncate text-[11.5px] font-semibold text-slate-700">
        {block.label}
      </span>
      {block.pointCount > 0 && (
        <span className="text-[10px] font-medium tabular-nums text-slate-400">
          {block.pointCount}
        </span>
      )}
      <button
        type="button"
        onClick={onHide}
        title="숨기기"
        aria-label="숨기기"
        className="inline-flex size-5 cursor-pointer items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
      >
        <EyeOff className="size-3.5" />
      </button>
    </div>
  );
}

function HiddenBlockRow({
  block,
  onRestore,
}: {
  block: StudyNoteBlock;
  onRestore: () => void;
}) {
  const meta = CATEGORY_META[block.category];
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-dashed border-slate-200 bg-slate-50 px-2 py-1.5">
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot} opacity-40`} />
      <span className="flex-1 truncate text-[11.5px] font-medium text-slate-400 line-through">
        {block.label}
      </span>
      <button
        type="button"
        onClick={onRestore}
        title="다시 보이기"
        aria-label="다시 보이기"
        className="inline-flex size-5 cursor-pointer items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-blue-600"
      >
        <Eye className="size-3.5" />
      </button>
    </div>
  );
}
