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
import { useIsMobile } from "@/hooks/use-is-mobile";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

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
  /** Renders the trigger as an icon-only square button with tooltip. */
  compact?: boolean;
  /** M-11 문맥 어휘 — 트리거 라벨. 기본값은 현행 워크벤치 표기(무회귀). */
  triggerLabel?: string;
  /** M-11 문맥 어휘 — 옮기는 대상 명사(예: 「자료」·「학생」). 본문 설명에 쓰인다. */
  itemNoun?: string;
  /** M-11 문맥 어휘 — 목적지 명사(예: 「폴더」·「반」). 설명·검색·빈 상태에 쓰인다. */
  targetNoun?: string;
}

const DROPDOWN_WIDTH = 320;
const DROPDOWN_GAP = 4;
const VIEWPORT_MARGIN = 8;

// ── 한글 조사 결합(M-11) — 명사 prop 이 어떤 받침이든 문장이 깨지지 않게 ──────
// 기본값(「자료」·「폴더」)에서는 현행 문구와 바이트 동일해야 한다(무회귀).

/** 받침 유무 — 한글 음절이 아니면 받침 없음으로 간주 */
function hasBatchim(word: string): boolean {
  const code = word.charCodeAt(word.length - 1);
  if (Number.isNaN(code) || code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 > 0;
}

/** 「자료를」·「학생을」 */
function eulReul(word: string): string {
  return `${word}${hasBatchim(word) ? "을" : "를"}`;
}

/** 「폴더로」·「반으로」 (받침 ㄹ은 「로」) */
function euro(word: string): string {
  const code = word.charCodeAt(word.length - 1);
  const jong = code >= 0xac00 && code <= 0xd7a3 ? (code - 0xac00) % 28 : 0;
  return `${word}${jong > 0 && jong !== 8 ? "으로" : "로"}`;
}

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
 * Presentation is viewport-aware and the two paths share the SAME body
 * (mode toggle + list + search) so behavior can't drift:
 *   - Desktop: a fixed dropdown portalled to `document.body` so it escapes
 *     any `overflow: hidden` ancestor (e.g. the FolderSection card).
 *   - Mobile (<1024px): a bottom sheet (Drawer). Drag-to-folder doesn't exist
 *     on touch, so this picker is the primary way to move/copy there; a
 *     thumb-reachable sheet with larger tap targets replaces the tiny dropdown.
 */
export function MoveOrCopyFolderPicker({
  collections,
  activeFolder,
  selectedCount,
  onCopy,
  onMove,
  disabled = false,
  compact = false,
  triggerLabel = "이동 / 복사",
  itemNoun = "자료",
  targetNoun = "폴더",
}: MoveOrCopyFolderPickerProps) {
  const isMobile = useIsMobile();
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
  // below the trigger by default; flips above if there's no room. Desktop-only.
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

  // The three effects below drive the DESKTOP dropdown only. On mobile the
  // Drawer manages its own overlay dismiss / scroll lock / escape, so we gate
  // them off to avoid double-handling (an outside-mousedown inside the sheet
  // would otherwise close it immediately).

  // Keep position correct during scroll/resize.
  useEffect(() => {
    if (!open || isMobile) return;
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
  }, [open, isMobile, computePosition]);

  // Outside-click handler. Because the dropdown is portalled, we need to
  // check both the trigger AND the dropdown — a click on either is "inside".
  useEffect(() => {
    if (!open || isMobile) return;
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      closePicker();
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open, isMobile, closePicker]);

  // Close on Escape for keyboard parity with the trigger.
  useEffect(() => {
    if (!open || isMobile) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closePicker();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, isMobile, closePicker]);

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

  // Shared body. `forMobile` only tunes a few sizing/affordance classes so the
  // sheet has comfortable touch targets and a taller list; when false the
  // classes are byte-identical to the original desktop dropdown (no PC change).
  const renderBody = (forMobile: boolean) => {
    const toggleH = forMobile ? "h-9 text-[13px]" : "h-7 text-[11.5px]";
    const descText = forMobile ? "text-[12px]" : "text-[10.5px]";
    const searchH = forMobile ? "h-10 text-[13px]" : "h-7 text-[11px]";
    const listMaxH = forMobile ? "max-h-[55vh]" : "max-h-64";
    const rowPad = forMobile ? "px-3 py-2.5" : "px-2 py-1.5";
    const leafText = forMobile ? "text-[13.5px]" : "text-[12px]";

    return (
      <>
        {/* Mode toggle */}
        <div className="flex gap-1 p-1.5 border-b border-slate-100 bg-slate-50/80">
          <button
            type="button"
            onClick={() => setMode("copy")}
            className={
              `flex-1 flex items-center justify-center gap-1.5 rounded font-bold transition-all ${toggleH} ` +
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
              `flex-1 flex items-center justify-center gap-1.5 rounded font-bold transition-all ${toggleH} ` +
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
        <p
          className={`px-3 py-2 ${descText} text-slate-500 leading-relaxed bg-blue-50/30 border-b border-blue-100/40`}
        >
          {mode === "copy"
            ? `선택한 ${eulReul(itemNoun)} 대상 ${targetNoun}에도 추가합니다. 다른 ${targetNoun}에 그대로 남습니다.`
            : `선택한 ${eulReul(itemNoun)} 대상 ${euro(targetNoun)} 이동합니다. 현재 속한 다른 ${targetNoun}에서는 제거됩니다.`}
        </p>

        {/* Search (auto-shown when more than 4 folders) */}
        {collections.length > 4 ? (
          <div className="px-2 pt-2">
            <input
              type="text"
              placeholder={`${targetNoun} 검색...`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className={`w-full px-2.5 ${searchH} rounded-md border border-slate-200 bg-slate-50 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 placeholder:text-slate-400`}
            />
          </div>
        ) : null}

        {/* Folder list */}
        <div className={`${listMaxH} overflow-y-auto p-1`}>
          {collections.length === 0 ? (
            <div className="px-3 py-4 text-xs text-slate-400 text-center">
              먼저 {eulReul(targetNoun)} 만들어주세요.
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
                    `flex w-full items-center gap-2 rounded ${rowPad} text-left transition-colors ` +
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
                      <span
                        className={`${leafText} text-slate-700 font-semibold truncate`}
                      >
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

        {/* Footer hint — the drag tip only applies to desktop pointer DnD. */}
        {forMobile ? null : (
          <div className="px-3 py-1.5 text-[10px] text-slate-400 bg-slate-50 border-t border-slate-100">
            팁: {euro(targetNoun)} 직접 드래그하면 이동·복사를 그 자리에서 고를 수 있어요.
          </div>
        )}
      </>
    );
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (open) {
            closePicker();
            return;
          }
          // Mobile opens the sheet directly (no anchor math); desktop measures
          // the trigger and positions the dropdown.
          if (isMobile) setOpen(true);
          else openPicker();
        }}
        disabled={disabled}
        title={compact ? triggerLabel : undefined}
        aria-label={compact ? triggerLabel : undefined}
        className={
          compact
            ? "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-blue-200 bg-white text-blue-700 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
            : "inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-blue-200 bg-white px-2.5 text-[11px] font-medium text-blue-700 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
        }
      >
        <ArrowRightLeft className="w-3.5 h-3.5" />
        {compact ? null : triggerLabel}
      </button>

      {/* Desktop: portalled anchored dropdown. */}
      {!isMobile && open && pos && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={dropdownRef}
              className="fixed z-[1000] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl"
              style={{ top: pos.top, left: pos.left, width: DROPDOWN_WIDTH }}
              role="dialog"
              aria-label={`이동 또는 복사할 ${targetNoun} 선택`}
            >
              {renderBody(false)}
            </div>,
            document.body,
          )
        : null}

      {/* Mobile: bottom sheet with the same body. */}
      {isMobile ? (
        <Drawer
          open={open}
          onOpenChange={(next) => (next ? setOpen(true) : closePicker())}
        >
          <DrawerContent className="max-h-[calc(100dvh-1rem)]">
            <div className="mx-auto mt-2 mb-1 h-1.5 w-10 shrink-0 rounded-full bg-slate-300" />
            <DrawerHeader className="px-4 pb-2 pt-1 text-left">
              <DrawerTitle className="text-base">{euro(targetNoun)} 이동 · 복사</DrawerTitle>
              <DrawerDescription className="text-[12px] text-slate-500">
                {selectedCount > 0
                  ? `선택한 ${selectedCount}개를 옮길 ${eulReul(targetNoun)} 고르세요.`
                  : "먼저 카드를 선택해 주세요."}
              </DrawerDescription>
            </DrawerHeader>
            {renderBody(true)}
          </DrawerContent>
        </Drawer>
      ) : null}
    </>
  );
}
