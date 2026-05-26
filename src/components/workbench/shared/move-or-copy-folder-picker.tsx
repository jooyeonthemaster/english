"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRightLeft,
  ChevronRight,
  Copy,
  Folder,
  Scissors,
} from "lucide-react";
import type { CollectionItem } from "./types";

interface MoveOrCopyFolderPickerProps {
  collections: CollectionItem[];
  /** The folder the user is currently inside (null = root). Highlighted as
   *  "현재" and disabled in 이동 mode so they don't move into themselves. */
  activeFolder: string | null;
  /** Total selected items — gates clickability. Buttons inside still call
   *  onCopy/onMove when >0; parent should also guard. */
  selectedCount: number;
  /** Adds items to a collection without removing them from others (copy). */
  onCopy: (collectionId: string) => Promise<unknown> | void;
  /** Removes items from all current collections and adds to the target. */
  onMove: (collectionId: string) => Promise<unknown> | void;
  /** Disables the trigger entirely (e.g. another bulk action in flight). */
  disabled?: boolean;
}

const DROPDOWN_WIDTH = 320;
const DROPDOWN_GAP = 4;
const VIEWPORT_MARGIN = 8;

/**
 * Drop-in replacement for the legacy "폴더에 추가" dropdown used in
 * selection toolbars across exam/question/passage/draft management pages.
 *
 * Adds three things over the old UI:
 *   1. 복사 vs 이동 toggle so the user can choose cut+paste semantics
 *      explicitly (instead of only "add to" which left duplicates).
 *   2. Full folder path labels (e.g. "한영고 › 심화") so picking a parent
 *      folder from inside a deeply nested child is unambiguous.
 *   3. Search box (auto-shown when >4 folders).
 *
 * Dropdown is rendered to `document.body` via portal so it escapes any
 * `overflow: hidden` ancestor (e.g. the FolderSection card it lives in).
 */
export function MoveOrCopyFolderPicker({
  collections,
  activeFolder,
  selectedCount,
  onCopy,
  onMove,
  disabled = false,
}: MoveOrCopyFolderPickerProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"copy" | "move">("copy");
  const [query, setQuery] = useState("");
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Centralized close that also resets transient UI state (search query +
  // cached position). Reset lives here — not in an effect — to avoid the
  // setState-in-effect anti-pattern.
  const closePicker = useCallback(() => {
    setOpen(false);
    setQuery("");
    setPos(null);
  }, []);

  // Compute dropdown position from the trigger's bounding rect. Anchored
  // below the trigger by default; flips above if there's no room.
  const computePosition = useCallback(():
    | { top: number; left: number }
    | null => {
    const trigger = triggerRef.current;
    if (!trigger) return null;
    const rect = trigger.getBoundingClientRect();
    const viewportH = window.innerHeight;
    const viewportW = window.innerWidth;
    const estimatedH = 360; // upper bound — actual content max-h is similar

    let top = rect.bottom + DROPDOWN_GAP;
    let left = rect.left;

    // Flip above if not enough room below.
    if (top + estimatedH > viewportH - VIEWPORT_MARGIN) {
      top = rect.top - DROPDOWN_GAP - estimatedH;
      if (top < VIEWPORT_MARGIN) top = VIEWPORT_MARGIN;
    }

    // Keep horizontally on-screen.
    if (left + DROPDOWN_WIDTH > viewportW - VIEWPORT_MARGIN) {
      left = viewportW - VIEWPORT_MARGIN - DROPDOWN_WIDTH;
    }
    if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN;

    return { top, left };
  }, []);

  // Open is initiated from a click handler (not an effect), so we can
  // measure the trigger synchronously and set position + open together —
  // no setState-in-effect needed.
  const openPicker = useCallback(() => {
    const next = computePosition();
    if (!next) return;
    setPos(next);
    setOpen(true);
  }, [computePosition]);

  // Keep position correct during scroll/resize. setPos in an event listener
  // callback is fine — the lint rule only flags setState in effect bodies.
  useEffect(() => {
    if (!open) return;
    function reposition() {
      const next = computePosition();
      if (next) setPos(next);
    }
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, computePosition]);

  // Outside-click handler. Because the dropdown is portalled, we need to
  // check both the trigger AND the dropdown — a click on either is "inside".
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      closePicker();
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open, closePicker]);

  // Close on Escape for keyboard parity with the trigger.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closePicker();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, closePicker]);

  // Walk parentId up to root to build "한영고 › 심화" label.
  const folderPathLabel = useCallback(
    (collectionId: string): string => {
      const byId = new Map(collections.map((c) => [c.id, c]));
      const segments: string[] = [];
      let current = byId.get(collectionId);
      const guard = new Set<string>();
      while (current && !guard.has(current.id)) {
        guard.add(current.id);
        segments.unshift(current.name);
        current = current.parentId ? byId.get(current.parentId) : undefined;
      }
      return segments.join(" › ");
    },
    [collections],
  );

  const sorted = useMemo(() => {
    const list = collections.map((c) => {
      const path = folderPathLabel(c.id);
      const segments = path.split(" › ");
      return {
        id: c.id,
        path,
        depth: segments.length - 1,
        leafName: segments[segments.length - 1],
        parentPath: segments.slice(0, -1).join(" › "),
        itemCount: c._count.items,
        isActive: c.id === activeFolder,
      };
    });
    const q = query.trim().toLowerCase();
    const filtered = q
      ? list.filter((c) => c.path.toLowerCase().includes(q))
      : list;
    return filtered.sort((a, b) => a.path.localeCompare(b.path, "ko"));
  }, [collections, folderPathLabel, query, activeFolder]);

  const noSelection = selectedCount === 0;

  const dropdown = open && pos ? (
    <div
      ref={dropdownRef}
      className="fixed z-[1000] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl"
      style={{ top: pos.top, left: pos.left, width: DROPDOWN_WIDTH }}
      role="dialog"
      aria-label="이동 또는 복사할 폴더 선택"
    >
      {/* Mode toggle */}
      <div className="flex gap-1 p-1.5 border-b border-slate-100 bg-slate-50/80">
        <button
          type="button"
          onClick={() => setMode("copy")}
          className={
            "flex-1 flex items-center justify-center gap-1.5 h-7 rounded text-[11.5px] font-bold transition-all " +
            (mode === "copy"
              ? "bg-white text-blue-700 shadow-sm border border-blue-200"
              : "text-slate-500 hover:text-slate-700 hover:bg-slate-100")
          }
        >
          <Copy className="w-3 h-3" />
          복사
        </button>
        <button
          type="button"
          onClick={() => setMode("move")}
          className={
            "flex-1 flex items-center justify-center gap-1.5 h-7 rounded text-[11.5px] font-bold transition-all " +
            (mode === "move"
              ? "bg-white text-blue-700 shadow-sm border border-blue-200"
              : "text-slate-500 hover:text-slate-700 hover:bg-slate-100")
          }
        >
          <Scissors className="w-3 h-3" />
          이동
        </button>
      </div>

      {/* Mode description */}
      <p className="px-3 py-2 text-[10.5px] text-slate-500 leading-relaxed bg-blue-50/30 border-b border-blue-100/40">
        {mode === "copy"
          ? "선택한 자료를 대상 폴더에도 추가합니다. 다른 폴더에 그대로 남습니다."
          : "선택한 자료를 대상 폴더로 이동합니다. 현재 속한 다른 폴더에서는 제거됩니다."}
      </p>

      {/* Search (auto-shown when more than 4 folders) */}
      {collections.length > 4 ? (
        <div className="px-2 pt-2">
          <input
            type="text"
            placeholder="폴더 검색..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full h-7 px-2.5 text-[11px] rounded-md border border-slate-200 bg-slate-50 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 placeholder:text-slate-400"
          />
        </div>
      ) : null}

      {/* Folder list */}
      <div className="max-h-64 overflow-y-auto p-1">
        {collections.length === 0 ? (
          <div className="px-3 py-4 text-xs text-slate-400 text-center">
            먼저 폴더를 만들어주세요.
          </div>
        ) : sorted.length === 0 ? (
          <div className="px-3 py-4 text-xs text-slate-400 text-center">
            검색 결과가 없습니다.
          </div>
        ) : (
          sorted.map((c) => {
            const moveDisabled = mode === "move" && c.isActive;
            const clickDisabled = noSelection || moveDisabled;
            return (
              <button
                key={c.id}
                type="button"
                disabled={clickDisabled}
                onClick={() => {
                  if (clickDisabled) return;
                  if (mode === "copy") void onCopy(c.id);
                  else void onMove(c.id);
                  closePicker();
                }}
                className={
                  "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors " +
                  (clickDisabled
                    ? "cursor-not-allowed opacity-40"
                    : "cursor-pointer hover:bg-blue-50")
                }
                title={c.path}
              >
                <Folder
                  className="w-3.5 h-3.5 shrink-0 text-slate-400"
                  style={{ marginLeft: c.depth * 8 }}
                />
                <div className="min-w-0 flex-1">
                  {c.parentPath ? (
                    <div className="flex items-center gap-0.5 text-[10px] text-slate-400 truncate leading-tight">
                      <span className="truncate">{c.parentPath}</span>
                    </div>
                  ) : null}
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="text-[12px] text-slate-700 font-semibold truncate">
                      {c.leafName}
                    </span>
                    {c.isActive ? (
                      <span className="shrink-0 rounded bg-blue-100 px-1 py-0.5 text-[9px] font-bold text-blue-700">
                        현재
                      </span>
                    ) : null}
                  </div>
                </div>
                <span className="shrink-0 text-[10px] tabular-nums text-slate-400">
                  {c.itemCount}
                </span>
                <ChevronRight className="w-3 h-3 shrink-0 text-slate-300" />
              </button>
            );
          })
        )}
      </div>

      {/* Footer hint */}
      <div className="px-3 py-1.5 text-[10px] text-slate-400 bg-slate-50 border-t border-slate-100">
        팁: 폴더 카드로 직접 드래그하면 이동,{" "}
        <kbd className="px-1 py-0.5 bg-white border border-slate-200 rounded text-[9px]">
          Shift
        </kbd>{" "}
        + 드래그는 복사입니다.
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (open) closePicker();
          else openPicker();
        }}
        disabled={disabled}
        className="inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-blue-200 bg-white px-2.5 text-[11px] font-medium text-blue-700 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <ArrowRightLeft className="w-3.5 h-3.5" />
        이동 / 복사
      </button>
      {dropdown && typeof document !== "undefined"
        ? createPortal(dropdown, document.body)
        : null}
    </>
  );
}
