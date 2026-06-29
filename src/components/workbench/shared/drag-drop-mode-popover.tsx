"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { Copy, FolderInput, Scissors, X } from "lucide-react";

/** The folder a card was just dropped onto, plus where on screen the drop
 *  happened so the choice popover can anchor itself to the cursor. */
export interface DropChoiceTarget {
  /** The dragged item id(s). Single string normally; string[] for bulk
   *  (draft-bulk) drops where multiple items are dragged at once. */
  itemId: string | string[];
  folderId: string;
  folderName: string;
  /** Drop point in viewport coordinates (clientX/clientY). */
  anchor: { x: number; y: number };
  /** Folders the dragged item(s) currently belong to, EXCLUDING the target.
   *  Shown as context; move only removes from the folder being viewed
   *  (`sourceFolderName`), so the rest are kept. */
  currentFolders: { id: string; name: string }[];
  /** Name of the folder currently being viewed (the only one move removes
   *  from). undefined at root — there move just adds to the target. */
  sourceFolderName?: string;
}

interface DragDropModePopoverProps {
  pending: DropChoiceTarget | null;
  /** Item noun for the copy, e.g. "지문" / "문제" / "시험지". */
  itemLabel: string;
  /** copy=true keeps the item in every folder it's already in and adds it to the
   *  target. copy=false moves: removes the item ONLY from the folder being viewed
   *  (the source), then adds to the target — copies in other folders are kept.
   *  `keepFolderIds` is always empty now (kept for caller compatibility). */
  onChoose: (result: { copy: boolean; keepFolderIds: string[] }) => void;
  onCancel: () => void;
}

const WIDTH = 280;
const GAP = 10;
const MARGIN = 8;
const EST_HEIGHT = 168;

/**
 * Drop-time chooser shown right where a card is dropped onto a folder.
 *
 *  - 복사: add to the target, keep the item in every folder it's already in.
 *  - 이동: add to the target and remove it from every other folder.
 *
 * Portalled to `document.body` so it escapes folder-section `overflow:hidden`.
 */
export function DragDropModePopover({
  pending,
  itemLabel,
  onChoose,
  onCancel,
}: DragDropModePopoverProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  const currentFolders = pending?.currentFolders ?? [];
  const hasCurrent = currentFolders.length > 0;
  // 이동은 "지금 보고 있는 폴더"에서만 빼낸다. 그 폴더가 있을 때(=폴더 안에서
  // 드래그)만 "빼고 옮김"이고, 루트(전체 문제)에선 빼낼 현재 폴더가 없다 →
  // 이동이 복사와 동일해지므로 단일 "담기" 액션만 보여준다.
  const sourceFolderName = pending?.sourceFolderName;
  const isRoot = !sourceFolderName;

  // Anchor to the drop point; flip above when there's no room below, clamp
  // horizontally.
  const pos = useMemo(() => {
    if (!pending || typeof window === "undefined") return null;
    const { x, y } = pending.anchor;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let top = y + GAP;
    let left = x - WIDTH / 2;
    if (top + EST_HEIGHT > vh - MARGIN) top = Math.max(MARGIN, y - GAP - EST_HEIGHT);
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
  const chooseMove = useCallback(
    () => onChoose({ copy: false, keepFolderIds: [] }),
    [onChoose],
  );

  if (!pending || !pos || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={cardRef}
      className="fixed z-[1000] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
      style={{ top: pos.top, left: pos.left, width: WIDTH }}
      role="dialog"
      aria-label={
        isRoot
          ? `"${pending.folderName}" 폴더에 담기`
          : `"${pending.folderName}" 폴더로 복사 또는 이동`
      }
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/80 px-3 py-2">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600">
          <FolderInput className="size-3.5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-bold text-slate-800">
            {pending.folderName}
          </p>
          <p className="text-[10px] leading-tight text-slate-400">
            {isRoot ? "이 폴더에 담을까요?" : "폴더로 어떻게 담을까요?"}
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

      <div className="p-1.5">
        <button
          type="button"
          onClick={chooseCopy}
          className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2.5 text-left transition-colors hover:bg-blue-50"
        >
          <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-blue-600">
            {isRoot ? (
              <FolderInput className="size-3.5" aria-hidden="true" />
            ) : (
              <Copy className="size-3.5" aria-hidden="true" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[12.5px] font-bold text-slate-800">
              {isRoot ? "이 폴더에 담기" : "복사"}
            </span>
            <span className="block text-[10.5px] leading-snug text-slate-500">
              {isRoot
                ? `이 ${itemLabel}을(를) 「${pending.folderName}」 폴더에 담습니다.`
                : `다른 폴더엔 그대로 두고 이 폴더에도 ${itemLabel}을(를) 추가합니다.`}
            </span>
          </span>
        </button>

        {isRoot ? null : (
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
                <span className="max-w-[140px] truncate rounded bg-slate-100 px-1 py-0.5 text-[9px] font-semibold text-slate-500">
                  「{sourceFolderName}」에서
                </span>
              </span>
              <span className="block text-[10.5px] leading-snug text-slate-500">
                「{sourceFolderName}」에서만 빼고 이 폴더로 옮깁니다.
                {hasCurrent ? " 다른 폴더의 사본은 그대로 둡니다." : ""}
              </span>
            </span>
          </button>
        )}
      </div>
      {isRoot ? null : (
        <div className="border-t border-slate-100 px-3 py-1.5 text-[9.5px] leading-snug text-slate-400">
          팁: <span className="font-semibold text-slate-500">⌥(Option)</span> 또는{" "}
          <span className="font-semibold text-slate-500">Ctrl</span>을 누른 채 드롭하면 바로 복사돼요.
        </div>
      )}
    </div>,
    document.body,
  );
}
