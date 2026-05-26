"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, X } from "lucide-react";

import { MoveOrCopyFolderPicker } from "@/components/workbench/shared/move-or-copy-folder-picker";
import type { CollectionItem } from "@/components/workbench/shared/types";
import { useReviewDrawer } from "@/components/layout/review-drawer-context";

import type { M1PassageDraftWithJob } from "../types";
import type { JobMetaSnapshot } from "../drafts-cache";
import { DraftCard } from "./draft-card";
import { ImagePages, type PageImage } from "./image-carousel";

interface JobReviewModalProps {
  jobId: string;
  jobMeta: JobMetaSnapshot | undefined;
  drafts: M1PassageDraftWithJob[];
  collections: CollectionItem[];
  activeFolder: string | null;
  onClose: () => void;
  onOpenDraft: (id: string) => void;
  onAddToFolder: (
    collectionId: string,
    draftIds: Set<string>,
  ) => Promise<void> | void;
  onMoveToFolder: (
    collectionId: string,
    draftIds: Set<string>,
  ) => Promise<void> | void;
  dupCountById?: Map<string, number>;
}

export function JobReviewModal({
  jobId,
  jobMeta,
  drafts,
  collections,
  activeFolder,
  onClose,
  onOpenDraft,
  onAddToFolder,
  onMoveToFolder,
  dupCountById,
}: JobReviewModalProps) {
  const [pages, setPages] = useState<PageImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overlayEl, setOverlayEl] = useState<HTMLDivElement | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set());

  // ESC to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Drawer leaves the page interactive — no body scroll lock.
  // Width is resizable via a left-edge drag handle; main area gets a matching
  // right margin so the page compresses (not just gets covered) and stays in
  // sync as the user drags.
  const reviewDrawer = useReviewDrawer();
  const DRAWER_WIDTH_KEY = "smoat:job-review-drawer:width";
  const DRAWER_MIN_WIDTH = 360;
  const DRAWER_DEFAULT_WIDTH = 760;
  const [drawerWidth, setDrawerWidth] = useState<number>(() => {
    if (typeof window === "undefined") return DRAWER_DEFAULT_WIDTH;
    try {
      const raw = window.localStorage.getItem(DRAWER_WIDTH_KEY);
      if (!raw) return DRAWER_DEFAULT_WIDTH;
      const n = parseInt(raw, 10);
      if (Number.isNaN(n)) return DRAWER_DEFAULT_WIDTH;
      const max = Math.max(
        DRAWER_MIN_WIDTH,
        Math.floor(window.innerWidth * 0.8),
      );
      return Math.min(max, Math.max(DRAWER_MIN_WIDTH, n));
    } catch {
      return DRAWER_DEFAULT_WIDTH;
    }
  });

  useEffect(() => {
    reviewDrawer.setOpen({ isOpen: true, width: drawerWidth });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawerWidth]);

  useEffect(() => {
    return () => reviewDrawer.setOpen({ isOpen: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const beginDrawerResize = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startWidth = drawerWidth;
      let latest = startWidth;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      const onMove = (ev: PointerEvent) => {
        const max = Math.max(
          DRAWER_MIN_WIDTH,
          Math.floor(window.innerWidth * 0.8),
        );
        // Dragging left (negative delta) widens the drawer
        latest = Math.min(
          max,
          Math.max(DRAWER_MIN_WIDTH, startWidth - (ev.clientX - startX)),
        );
        setDrawerWidth(latest);
      };
      const onUp = () => {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        try {
          window.localStorage.setItem(DRAWER_WIDTH_KEY, String(latest));
        } catch {
          /* ignore */
        }
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [drawerWidth],
  );

  const resetDrawerWidth = useCallback(() => {
    setDrawerWidth(DRAWER_DEFAULT_WIDTH);
    try {
      window.localStorage.setItem(
        DRAWER_WIDTH_KEY,
        String(DRAWER_DEFAULT_WIDTH),
      );
    } catch {
      /* ignore */
    }
  }, []);

  // Fetch all pages for the job
  useEffect(() => {
    let cancelled = false;
    setPages([]);
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = await fetch(`/api/extraction/jobs/${jobId}/pages`, {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) throw new Error("페이지 이미지를 불러오지 못했습니다.");
        const data = (await res.json()) as { pages?: PageImage[] };
        if (cancelled) return;
        const fetched = data.pages ?? [];
        setPages(fetched);
        if (typeof window !== "undefined") {
          for (const p of fetched) {
            if (!p.signedUrl) continue;
            const img = new window.Image();
            img.src = p.signedUrl;
          }
        }
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error
            ? err.message
            : "페이지 이미지를 불러오지 못했습니다.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  const jobLabel = useMemo(() => {
    if (!jobMeta) return "이름 없는 작업";
    return (
      (jobMeta.displayName?.trim() && jobMeta.displayName) ||
      jobMeta.originalFileName ||
      "이름 없는 작업"
    );
  }, [jobMeta]);

  const allIds = useMemo(() => drafts.map((d) => d.id), [drafts]);
  const allChecked =
    allIds.length > 0 && allIds.every((id) => checkedIds.has(id));
  const bulkDragIds = useMemo(() => Array.from(checkedIds), [checkedIds]);

  function toggleCheck(id: string) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allChecked) setCheckedIds(new Set());
    else setCheckedIds(new Set(allIds));
  }

  async function handleAdd(collectionId: string) {
    if (checkedIds.size === 0) return;
    await onAddToFolder(collectionId, checkedIds);
    setCheckedIds(new Set());
  }

  async function handleMove(collectionId: string) {
    if (checkedIds.size === 0) return;
    await onMoveToFolder(collectionId, checkedIds);
    setCheckedIds(new Set());
  }

  return (
    <aside
      role="dialog"
      aria-label={`${jobLabel} 검수 패널`}
      style={{ width: drawerWidth }}
      className="fixed inset-y-0 right-0 z-40 flex flex-col overflow-hidden border-l border-slate-200 bg-[#F8FAFB] shadow-2xl"
    >
      {/* Left-edge drag handle to resize the drawer */}
      <div
        onPointerDown={beginDrawerResize}
        onDoubleClick={resetDrawerWidth}
        title="드래그하여 너비 조절 · 더블 클릭하여 초기화"
        aria-label="검수 패널 너비 조절"
        role="separator"
        className="group/whandle absolute left-0 top-1/2 z-30 inline-flex h-[200px] w-3 -translate-y-1/2 cursor-col-resize items-center justify-center py-1 select-none"
      >
        <div className="h-full w-0.5 rounded-full bg-slate-200 transition-colors group-hover/whandle:bg-blue-400 group-active/whandle:bg-blue-500" />
      </div>
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-3 xl:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-blue-100">
            <FileText className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-bold text-slate-900">
              {jobLabel}
            </h2>
            <p className="mt-0.5 truncate text-[11.5px] text-slate-500">
              추출된 자료 {drafts.length}개 · 카드를 드래그해 폴더에 추가
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Body: image (top) + drafts (bottom) stacked so each gets full drawer width */}
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Image preview — fixed-ish top section */}
        <div className="relative min-h-0 shrink-0 basis-[42%] overflow-y-auto border-b border-slate-200 bg-white p-3">
          <div
            ref={setOverlayEl}
            className="pointer-events-none absolute inset-0 z-20"
          />
          <ImagePages
            pages={pages}
            loading={loading}
            error={error}
            expectedCount={jobMeta?.resultCount ?? drafts.length}
            overlayEl={overlayEl}
          />
        </div>

        {/* Drafts list */}
        <div className="flex min-h-0 flex-1 flex-col bg-[#F8FAFB]">
          <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-4 py-2">
            <button
              type="button"
              onClick={toggleAll}
              disabled={allIds.length === 0}
              className="text-[12px] font-medium text-slate-600 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {allChecked && allIds.length > 0 ? "선택 해제" : "전체 선택"}
            </button>
            <span className="text-[12px] font-medium text-slate-400">
              {checkedIds.size}개 선택
            </span>
            <div className="ml-auto">
              <MoveOrCopyFolderPicker
                collections={collections}
                activeFolder={activeFolder}
                selectedCount={checkedIds.size}
                onCopy={handleAdd}
                onMove={handleMove}
                disabled={checkedIds.size === 0}
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {drafts.length === 0 ? (
              <p className="py-12 text-center text-[12px] text-slate-400">
                추출된 자료가 없습니다.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                {drafts.map((draft, index) => (
                  <DraftCard
                    key={draft.id}
                    draft={draft}
                    index={index}
                    selected={false}
                    active={false}
                    checked={checkedIds.has(draft.id)}
                    onClick={() => onOpenDraft(draft.id)}
                    onToggleCheck={() => toggleCheck(draft.id)}
                    dupCount={dupCountById?.get(draft.id) ?? 0}
                    bulkDragIds={bulkDragIds}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
