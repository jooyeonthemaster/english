"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { CheckCircle2, FileText, Loader2, Trash2, X } from "lucide-react";

import { MoveOrCopyFolderPicker } from "@/components/workbench/shared/move-or-copy-folder-picker";
import type { CollectionItem } from "@/components/workbench/shared/types";
import { useReviewDrawer } from "@/components/layout/review-drawer-context";
import { DragSelect } from "@/components/ui/drag-select";
import { useIsMobile } from "@/hooks/use-is-mobile";

import type { M1PassageDraftWithJob } from "../types";
import type { JobMetaSnapshot } from "../drafts-cache";
import { compareDraftAnalysisPriority } from "../utils/analysis-status";
import {
  DraftCard,
  type DraftCardActionVariant,
  type DraftCardStatusBadgeMode,
} from "./draft-card";
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
  onPromoteDrafts?: (
    draftIds: Set<string>,
    clearSelection: () => void,
  ) => Promise<void> | void;
  /** Per-draft 검수완료/검수취소 토글 핸들러 — 카드 푸터의 "검수완료" 버튼에
   *  쓰인다. 둘 다 주어질 때만 카드에 버튼이 렌더된다. */
  onPromoteDraft?: (draft: M1PassageDraftWithJob) => Promise<void>;
  onUnpromoteDraft?: (draft: M1PassageDraftWithJob) => Promise<void>;
  onDeleteDrafts?: (
    draftIds: Set<string>,
    clearSelection: () => void,
  ) => Promise<void> | void;
  bulkActionRunning?: "delete" | "rerestore" | "promote" | null;
  dupCountById?: Map<string, number>;
  /** Persist a new title for a draft surfaced inside the modal. */
  onRenameDraft?: (draftId: string, title: string | null) => void;
  /**
   * When supplied, the modal mirrors the parent's selection instead of owning
   * a private one. This lets "전체 선택" on the page toolbar drive the per-draft
   * checkboxes inside the side panel.
   */
  externalSelectedIds?: Set<string>;
  externalSetSelectedIds?: Dispatch<SetStateAction<Set<string>>>;
  /** When provided, clicking a draft inside the drawer calls this callback
   *  (instead of opening DraftDetailModal) so an embedder can route the click
   *  to its own editor. */
  onSelectDraftExternal?: (draft: M1PassageDraftWithJob) => void;
  /** Highlighted draft id when an external picker controls selection — shows
   *  the active blue stripe on the corresponding card. */
  externalSelectedDraftId?: string | null;
  statusBadgeMode?: DraftCardStatusBadgeMode;
  detailAction?: DraftCardActionVariant;
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
  onPromoteDrafts,
  onPromoteDraft,
  onUnpromoteDraft,
  onDeleteDrafts,
  bulkActionRunning = null,
  onRenameDraft,
  externalSelectedIds,
  externalSetSelectedIds,
  onSelectDraftExternal,
  externalSelectedDraftId = null,
  statusBadgeMode = "review",
  detailAction,
}: JobReviewModalProps) {
  const externallyPicking = typeof onSelectDraftExternal === "function";
  const [pages, setPages] = useState<PageImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overlayEl, setOverlayEl] = useState<HTMLDivElement | null>(null);
  const [internalCheckedIds, setInternalCheckedIds] = useState<Set<string>>(
    () => new Set(),
  );
  const isControlled =
    externalSelectedIds !== undefined && externalSetSelectedIds !== undefined;
  const checkedIds = isControlled ? externalSelectedIds : internalCheckedIds;
  const setCheckedIds = isControlled
    ? externalSetSelectedIds
    : setInternalCheckedIds;
  // 마키(영역 선택)의 시작 영역 겸 카드 탐색 루트 — 드로어의 카드 리스트 스크롤
  // 컨테이너. 이 ref 를 DragSelect 의 boundary 로 넘겨, 메인 그리드 마키와 시작
  // 영역이 겹치지 않게 격리하고(드로어 안에서 시작한 드래그만 드로어 마키), 선택도
  // 이 컨테이너 안의 카드로만 한정한다.
  const draftListRef = useRef<HTMLDivElement>(null);
  const orderedDrafts = useMemo(() => {
    if (statusBadgeMode !== "analysis") return drafts;
    return drafts
      .map((draft, index) => ({ draft, index }))
      .sort(
        (a, b) =>
          compareDraftAnalysisPriority(a.draft, b.draft) || a.index - b.index,
      )
      .map((item) => item.draft);
  }, [drafts, statusBadgeMode]);

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
  // 모바일(<lg)에서는 우측 드로어 대신 가운데 팝업으로 띄운다. 드로어처럼 본문을
  // 밀지 않고(오버레이) 좌우/상하 여백 있는 카드로 표시한다.
  const isMobile = useIsMobile();
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
    // 모바일 팝업 모드에서는 width 0으로 열어 본문을 밀지 않게 한다(오버레이).
    reviewDrawer.setOpen({ isOpen: true, width: isMobile ? 0 : drawerWidth });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawerWidth, isMobile]);

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

  // ─── Image / drafts split (horizontal drag handle between them) ───
  const IMAGE_HEIGHT_KEY = "smoat:job-review-drawer:image-height";
  const IMAGE_MIN_HEIGHT = 120;
  const SECTION_MIN_HEIGHT = 120;
  const IMAGE_DEFAULT_HEIGHT = 360;
  const splitContainerRef = useRef<HTMLDivElement | null>(null);
  const [imageHeight, setImageHeight] = useState<number>(() => {
    if (typeof window === "undefined") return IMAGE_DEFAULT_HEIGHT;
    try {
      const raw = window.localStorage.getItem(IMAGE_HEIGHT_KEY);
      if (!raw) return IMAGE_DEFAULT_HEIGHT;
      const n = parseInt(raw, 10);
      if (Number.isNaN(n)) return IMAGE_DEFAULT_HEIGHT;
      return Math.max(IMAGE_MIN_HEIGHT, n);
    } catch {
      return IMAGE_DEFAULT_HEIGHT;
    }
  });

  const beginSplitResize = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startY = e.clientY;
      const startHeight = imageHeight;
      let latest = startHeight;
      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";
      const onMove = (ev: PointerEvent) => {
        const containerH =
          splitContainerRef.current?.getBoundingClientRect().height ??
          window.innerHeight;
        const max = Math.max(IMAGE_MIN_HEIGHT, containerH - SECTION_MIN_HEIGHT);
        latest = Math.min(
          max,
          Math.max(IMAGE_MIN_HEIGHT, startHeight + (ev.clientY - startY)),
        );
        setImageHeight(latest);
      };
      const onUp = () => {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        try {
          window.localStorage.setItem(IMAGE_HEIGHT_KEY, String(latest));
        } catch {
          /* ignore */
        }
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [imageHeight],
  );

  const resetSplit = useCallback(() => {
    setImageHeight(IMAGE_DEFAULT_HEIGHT);
    try {
      window.localStorage.setItem(IMAGE_HEIGHT_KEY, String(IMAGE_DEFAULT_HEIGHT));
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

  const allIds = useMemo(
    () => orderedDrafts.map((d) => d.id),
    [orderedDrafts],
  );
  const allChecked =
    allIds.length > 0 && allIds.every((id) => checkedIds.has(id));
  // Restrict the "selected count" and folder-action payloads to drafts visible
  // in this modal — even when controlled by a parent selection that may also
  // hold ids outside this job.
  const modalCheckedIds = useMemo(() => {
    const next = new Set<string>();
    for (const id of allIds) if (checkedIds.has(id)) next.add(id);
    return next;
  }, [allIds, checkedIds]);
  const bulkDragIds = useMemo(
    () => Array.from(modalCheckedIds),
    [modalCheckedIds],
  );
  // 마키 결과를 이 작업(job)의 드래프트 범위로만 반영한다. 부모가 제어하는 선택
  // 집합이 다른 작업의 id 까지 들고 있을 수 있으므로, 그냥 드래그(치환)로 그 선택을
  // 지우지 않도록 allIds 만 갈아끼우고 나머지는 보존한다.
  const handleMarqueeChange = useCallback(
    (next: Set<string>) => {
      setCheckedIds((prev) => {
        const merged = new Set(prev);
        for (const id of allIds) merged.delete(id);
        for (const id of next) merged.add(id);
        return merged;
      });
    },
    [setCheckedIds, allIds],
  );
  const hasModalSelection = modalCheckedIds.size > 0;
  const selectAllCheckboxRef = useRef<HTMLInputElement>(null);
  const selectAllIndeterminate = modalCheckedIds.size > 0 && !allChecked;
  const anyBulkRunning = bulkActionRunning !== null;
  const isPromoting = bulkActionRunning === "promote";
  const isDeleting = bulkActionRunning === "delete";
  const [reviewToggleBusy, setReviewToggleBusy] = useState(false);

  // 선택된 자료의 검수 상태 — 카드의 검수완료 버튼과 같은 토글 매커니즘.
  // 하나라도 미검수면 누르면 검수완료, 전부 검수완료면 누르면 검수취소.
  const checkedDrafts = useMemo(
    () => orderedDrafts.filter((d) => modalCheckedIds.has(d.id)),
    [orderedDrafts, modalCheckedIds],
  );
  const pendingReviewCount = checkedDrafts.filter(
    (d) => d.reviewStatus !== "COMMITTED",
  ).length;
  const allCheckedReviewed = hasModalSelection && pendingReviewCount === 0;

  useEffect(() => {
    if (!selectAllCheckboxRef.current) return;
    selectAllCheckboxRef.current.indeterminate = selectAllIndeterminate;
  }, [selectAllIndeterminate]);

  function toggleCheck(id: string) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (allChecked) {
        for (const id of allIds) next.delete(id);
      } else {
        for (const id of allIds) next.add(id);
      }
      return next;
    });
  }

  function clearModalChecks() {
    setCheckedIds((prev) => {
      if (allIds.length === 0) return prev;
      const next = new Set(prev);
      for (const id of allIds) next.delete(id);
      return next;
    });
  }

  async function handleAdd(collectionId: string) {
    if (modalCheckedIds.size === 0) return;
    await onAddToFolder(collectionId, modalCheckedIds);
    clearModalChecks();
  }

  async function handleMove(collectionId: string) {
    if (modalCheckedIds.size === 0) return;
    await onMoveToFolder(collectionId, modalCheckedIds);
    clearModalChecks();
  }

  async function handlePromote() {
    if (!onPromoteDrafts || modalCheckedIds.size === 0) return;
    await onPromoteDrafts(new Set(modalCheckedIds), clearModalChecks);
  }

  async function handleReviewToggle() {
    if (!hasModalSelection) return;
    if (allCheckedReviewed) {
      if (!onUnpromoteDraft) return;
      setReviewToggleBusy(true);
      try {
        for (const draft of checkedDrafts) await onUnpromoteDraft(draft);
        clearModalChecks();
      } finally {
        setReviewToggleBusy(false);
      }
    } else {
      await handlePromote();
    }
  }

  async function handleDelete() {
    if (!onDeleteDrafts || modalCheckedIds.size === 0) return;
    await onDeleteDrafts(new Set(modalCheckedIds), clearModalChecks);
  }

  return (
    <>
      {/* 모바일: 팝업 뒤 백드롭(클릭하면 닫힘). 데스크톱 드로어에는 없음. */}
      {isMobile ? (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
          onClick={onClose}
          aria-hidden="true"
        />
      ) : null}
      <aside
        role="dialog"
        aria-label={`${jobLabel} 검수 패널`}
        style={isMobile ? undefined : { width: drawerWidth }}
        className={
          isMobile
            ? "fixed inset-0 z-50 m-4 flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-[#F8FAFB] shadow-2xl"
            : "fixed inset-y-0 right-0 z-40 flex flex-col overflow-hidden border-l border-slate-200 bg-[#F8FAFB] shadow-2xl"
        }
      >
        {/* Left-edge drag handle to resize the drawer — 데스크톱 전용 */}
        {!isMobile ? (
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
        ) : null}
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

      {/* Body: image (top) + drafts (bottom) stacked so each gets full drawer width.
          모바일 팝업에서는 이 본문 하나만 스크롤하고(단일 스크롤), 이미지 영역은
          리사이즈 없이 이미지 크기에 맞춰 자동 높이로 표시한다. 데스크톱은 기존처럼
          이미지/목록 각각 스크롤 + 가운데 그랩바로 높이 조절. */}
      <div
        ref={splitContainerRef}
        className={
          isMobile
            ? "flex flex-1 flex-col overflow-y-auto"
            : "flex min-h-0 flex-1 flex-col"
        }
      >
        {/* Image preview — 데스크톱은 리사이즈 가능한 고정 높이, 모바일은 자동 높이 */}
        <div
          style={isMobile ? undefined : { height: imageHeight }}
          className="relative shrink-0 overflow-y-auto bg-white p-3"
        >
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

        {/* Horizontal drag handle between preview and drafts list — 데스크톱 전용
            (모바일은 이미지 자동 높이라 그랩바 없음) */}
        {!isMobile ? (
          <div
            onPointerDown={beginSplitResize}
            onDoubleClick={resetSplit}
            title="드래그하여 높이 조절 · 더블 클릭하여 초기화"
            aria-label="미리보기 영역 높이 조절"
            role="separator"
            aria-orientation="horizontal"
            className="group/hhandle relative z-10 flex h-1.5 shrink-0 cursor-row-resize items-center justify-center border-y border-slate-200 bg-slate-50 transition-colors hover:bg-blue-50 select-none"
          >
            <div className="h-0.5 w-32 rounded-full bg-slate-300 transition-colors group-hover/hhandle:bg-blue-400 group-active/hhandle:bg-blue-500" />
          </div>
        ) : null}

        {/* Drafts list */}
        <div
          className={
            isMobile
              ? "flex flex-col bg-[#F8FAFB]"
              : "flex min-h-0 flex-1 flex-col bg-[#F8FAFB]"
          }
        >
          <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-4 py-2">
            <label
              className={`flex size-7 shrink-0 items-center justify-center ${
                allIds.length === 0
                  ? "cursor-not-allowed opacity-50"
                  : "cursor-pointer"
              }`}
            >
              <input
                ref={selectAllCheckboxRef}
                type="checkbox"
                checked={allChecked}
                onChange={toggleAll}
                disabled={allIds.length === 0}
                aria-label="전체 선택"
                className="size-4 cursor-pointer rounded border-slate-300 accent-blue-600 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed"
              />
            </label>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              {onPromoteDrafts ? (
                <button
                  type="button"
                  onClick={() => void handleReviewToggle()}
                  disabled={
                    anyBulkRunning || reviewToggleBusy || !hasModalSelection
                  }
                  aria-pressed={allCheckedReviewed}
                  title={
                    allCheckedReviewed
                      ? "검수완료 — 누르면 검수를 취소합니다"
                      : pendingReviewCount > 0
                        ? `미검수 ${pendingReviewCount}개 검수완료`
                        : "검수완료"
                  }
                  aria-label="검수완료"
                  className={
                    "flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md border bg-white shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 " +
                    (allCheckedReviewed
                      ? "border-emerald-500 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
                      : "border-red-200/80 text-red-300 hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-600")
                  }
                >
                  {isPromoting || reviewToggleBusy ? (
                    <Loader2
                      className="h-3.5 w-3.5 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <CheckCircle2
                      className="h-3.5 w-3.5"
                      aria-hidden="true"
                    />
                  )}
                </button>
              ) : null}

              <MoveOrCopyFolderPicker
                collections={collections}
                activeFolder={activeFolder}
                selectedCount={modalCheckedIds.size}
                onCopy={handleAdd}
                onMove={handleMove}
                disabled={anyBulkRunning || !hasModalSelection}
                compact
              />

              {onDeleteDrafts ? (
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  disabled={anyBulkRunning || !hasModalSelection}
                  title="삭제"
                  aria-label="삭제"
                  className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-red-200 bg-white text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isDeleting ? (
                    <Loader2
                      className="h-3.5 w-3.5 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                </button>
              ) : null}
            </div>
          </div>

          <div
            ref={draftListRef}
            className={isMobile ? "p-3" : "min-h-0 flex-1 overflow-y-auto p-3"}
          >
            {orderedDrafts.length === 0 ? (
              <p className="py-12 text-center text-[12px] text-slate-400">
                추출된 자료가 없습니다.
              </p>
            ) : (
              <DragSelect
                className="grid grid-cols-1 gap-2"
                value={modalCheckedIds}
                onChange={handleMarqueeChange}
                itemScopeRef={draftListRef}
                allowCardDescendantDragStart
              >
                {orderedDrafts.map((draft, index) => (
                  <DraftCard
                    key={draft.id}
                    draft={draft}
                    index={index}
                    selected={false}
                    active={
                      externallyPicking
                        ? externalSelectedDraftId === draft.id
                        : false
                    }
                    checked={checkedIds.has(draft.id)}
                    onClick={() => {
                      if (externallyPicking) {
                        onSelectDraftExternal!(draft);
                      } else {
                        onOpenDraft(draft.id);
                      }
                    }}
                    onToggleCheck={() => toggleCheck(draft.id)}
                    bulkDragIds={bulkDragIds}
                    onTitleChange={onRenameDraft}
                    statusBadgeMode={statusBadgeMode}
                    detailAction={detailAction}
                    onPromote={onPromoteDraft}
                    onUnpromote={onUnpromoteDraft}
                  />
                ))}
              </DragSelect>
            )}
          </div>
        </div>
      </div>
      </aside>
    </>
  );
}
