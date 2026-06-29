"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Check, Copy, Folder, FolderInput, Scissors, X } from "lucide-react";

/** The folder a card was just dropped onto, plus where on screen the drop
 *  happened so the choice popover can anchor itself to the cursor. */
export interface DropChoiceTarget {
  /** The dragged item id (the surface expands this to the full selection). */
  itemId: string;
  folderId: string;
  folderName: string;
  /** Drop point in viewport coordinates (clientX/clientY). */
  anchor: { x: number; y: number };
  /** Folders the dragged item(s) currently belong to, EXCLUDING the target.
   *  When moving, the user can tick any of these to keep the item there
   *  instead of removing it. Empty → move is a plain add (nothing to remove). */
  currentFolders: { id: string; name: string }[];
}

interface DragDropModePopoverProps {
  pending: DropChoiceTarget | null;
  /** Item noun for the copy, e.g. "지문" / "문제" / "시험지". */
  itemLabel: string;
  /** copy=true keeps the item everywhere and adds to target. copy=false moves:
   *  removes from current folders EXCEPT `keepFolderIds`, then adds to target. */
  onChoose: (result: { copy: boolean; keepFolderIds: string[] }) => void;
  onCancel: () => void;
}

const WIDTH = 280;
const GAP = 10;
const MARGIN = 8;

/**
 * Drop-time chooser shown right where a card is dropped onto a folder.
 *
 *  - 복사: add to the target, keep the item in every folder it's already in.
 *  - 이동: add to the target and remove it from its other folders — but first
 *    show those folders so the user can tick the ones to KEEP (the silent
 *    "move removes from everywhere" behaviour confused teachers reusing the
 *    same passage across students).
 *
 * The component holds transient view/keep state, so callers must remount it per
 * drop with a changing `key` (cheap; the parent already toggles `pending`).
 * Portalled to `document.body` so it escapes folder-section `overflow:hidden`.
 */
export function DragDropModePopover({
  pending,
  itemLabel,
  onChoose,
  onCancel,
}: DragDropModePopoverProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<"choose" | "move">("choose");
  // Folders to KEEP the item in when moving (default: keep none = move out of all).
  const [keepIds, setKeepIds] = useState<Set<string>>(new Set());

  const currentFolders = pending?.currentFolders ?? [];
  const hasCurrent = currentFolders.length > 0;

  // Anchor to the drop point; flip above when there's no room below, clamp
  // horizontally. Height estimate grows with the (max) folder list.
  const pos = useMemo(() => {
    if (!pending || typeof window === "undefined") return null;
    const { x, y } = pending.anchor;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const estH = Math.min(420, 168 + pending.currentFolders.length * 34);
    let top = y + GAP;
    let left = x - WIDTH / 2;
    if (top + estH > vh - MARGIN) top = Math.max(MARGIN, y - GAP - estH);
    if (left + WIDTH > vw - MARGIN) left = vw - MARGIN - WIDTH;
    if (left < MARGIN) left = MARGIN;
    return { top, left };
  }, [pending]);

  // Close on outside-click / Escape. Registered only while open.
  useEffect(() => {
    if (!pending) return;
    function onMouseDown(e: MouseEvent) {
      if (cardRef.current?.contains(e.target as Node)) return;
      onCancel();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [pending, onCancel]);

  const chooseCopy = useCallback(
    () => onChoose({ copy: true, keepFolderIds: [] }),
    [onChoose],
  );
  const chooseMove = useCallback(() => {
    // Nothing to keep when the item isn't in any other folder — move straight.
    if (!hasCurrent) {
      onChoose({ copy: false, keepFolderIds: [] });
      return;
    }
    setView("move");
  }, [hasCurrent, onChoose]);
  const confirmMove = useCallback(
    () => onChoose({ copy: false, keepFolderIds: [...keepIds] }),
    [onChoose, keepIds],
  );
  const toggleKeep = useCallback((id: string) => {
    setKeepIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  if (!pending || !pos || typeof document === "undefined") return null;

  const removeCount = currentFolders.length - keepIds.size;

  return createPortal(
    <div
      ref={cardRef}
      className="fixed z-[1000] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
      style={{ top: pos.top, left: pos.left, width: WIDTH }}
      role="dialog"
      aria-label={`"${pending.folderName}" 폴더로 복사 또는 이동`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/80 px-3 py-2">
        {view === "move" ? (
          <button
            type="button"
            onClick={() => setView("choose")}
            className="flex size-6 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            aria-label="뒤로"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
          </button>
        ) : (
          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600">
            <FolderInput className="size-3.5" aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-bold text-slate-800">
            {pending.folderName}
          </p>
          <p className="text-[10px] leading-tight text-slate-400">
            {view === "move"
              ? "남겨둘 폴더를 선택하세요"
              : "폴더로 어떻게 담을까요?"}
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          aria-label="취소"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      </div>

      {view === "choose" ? (
        <div className="p-1.5">
          <button
            type="button"
            onClick={chooseCopy}
            className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2.5 text-left transition-colors hover:bg-blue-50"
          >
            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-blue-600">
              <Copy className="size-3.5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] font-bold text-slate-800">
                복사
              </span>
              <span className="block text-[10.5px] leading-snug text-slate-500">
                다른 폴더엔 그대로 두고 이 폴더에도 {itemLabel}을(를) 추가합니다.
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={chooseMove}
            className="mt-0.5 flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2.5 text-left transition-colors hover:bg-slate-100"
          >
            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600">
              <Scissors className="size-3.5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-[12.5px] font-bold text-slate-800">
                이동
                {hasCurrent ? (
                  <span className="rounded bg-slate-100 px-1 py-0.5 text-[9px] font-semibold text-slate-500">
                    현재 {currentFolders.length}개 폴더
                  </span>
                ) : null}
              </span>
              <span className="block text-[10.5px] leading-snug text-slate-500">
                {hasCurrent
                  ? "이 폴더로 옮깁니다. 어떤 폴더에 남길지 다음에서 고릅니다."
                  : "이 폴더로 옮깁니다."}
              </span>
            </span>
          </button>
        </div>
      ) : (
        <>
          <p className="px-3 pb-1 pt-2 text-[10.5px] leading-relaxed text-slate-500">
            체크한 폴더에는 <span className="font-semibold text-slate-700">그대로 남고</span>,
            나머지 폴더에서는 빠집니다.
          </p>
          <div className="max-h-56 overflow-y-auto px-1.5 pb-1">
            {currentFolders.map((f) => {
              const keep = keepIds.has(f.id);
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => toggleKeep(f.id)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-slate-50"
                >
                  <span
                    className={
                      "flex size-4 shrink-0 items-center justify-center rounded border transition-colors " +
                      (keep
                        ? "border-blue-500 bg-blue-500 text-white"
                        : "border-slate-300 bg-white text-transparent")
                    }
                  >
                    <Check className="size-3" aria-hidden="true" />
                  </span>
                  <Folder className="size-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-slate-700">
                    {f.name}
                  </span>
                  <span
                    className={
                      "shrink-0 text-[10px] font-semibold " +
                      (keep ? "text-blue-600" : "text-slate-400")
                    }
                  >
                    {keep ? "남김" : "제거"}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-1.5 border-t border-slate-100 bg-slate-50/80 p-1.5">
            <button
              type="button"
              onClick={() => setView("choose")}
              className="h-8 shrink-0 rounded-md border border-slate-200 bg-white px-2.5 text-[11.5px] font-semibold text-slate-600 transition-colors hover:bg-slate-100"
            >
              뒤로
            </button>
            <button
              type="button"
              onClick={confirmMove}
              className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md bg-blue-600 px-2.5 text-[11.5px] font-bold text-white transition-colors hover:bg-blue-700"
            >
              <Scissors className="size-3.5" aria-hidden="true" />
              {removeCount > 0
                ? `이동 (${removeCount}개 폴더에서 제거)`
                : "이동 (모두 남김)"}
            </button>
          </div>
        </>
      )}
    </div>,
    document.body,
  );
}
