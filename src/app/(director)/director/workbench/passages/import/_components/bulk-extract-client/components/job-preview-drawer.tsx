"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, FileText, Loader2, Trash2, X } from "lucide-react";

import { useReviewDrawer } from "@/components/layout/review-drawer-context";
import { MoveOrCopyFolderPicker } from "@/components/workbench/shared/move-or-copy-folder-picker";
import type { CollectionItem } from "@/components/workbench/shared/types";
import { useFolderManager } from "@/hooks/use-folder-manager";
import type { M1PassageDraftSnapshot } from "@/lib/extraction/types";
import {
  addDraftsToCollection,
  createM1DraftCollection,
  deleteM1DraftCollection,
  removeDraftsFromCollection,
  updateM1DraftCollection,
} from "@/actions/workbench";

import { useQueueDrawer } from "../../queue-drawer-context";
import { DraftCard } from "../../extraction-manage-client/components/draft-card";
import { DragSelect } from "@/components/ui/drag-select";
import { DraftDetailModal } from "../../extraction-manage-client/components/draft-detail-modal";
import {
  ImagePages,
  type PageImage,
} from "../../extraction-manage-client/components/image-carousel";
import { useBulkActions } from "../../extraction-manage-client/hooks/use-bulk-actions";
import { useDraftActions } from "../../extraction-manage-client/hooks/use-draft-actions";
import type {
  JobDetailResponse,
  M1DraftJobSummary,
  M1PassageDraftWithJob,
} from "../../extraction-manage-client/types";
import { buildExamPageNumberMap } from "../../extraction-manage-client/utils/exam-page-number";

interface JobPreviewDrawerProps {
  jobId: string;
  onClose: () => void;
  initialCollections: CollectionItem[];
  initialCollectionMembership: Record<string, Set<string>>;
}

const DRAWER_WIDTH_KEY = "smoat:job-review-drawer:width";
const DRAWER_MIN_WIDTH = 360;
const DRAWER_DEFAULT_WIDTH = 760;

const IMAGE_HEIGHT_KEY = "smoat:job-review-drawer:image-height";
const IMAGE_MIN_HEIGHT = 120;
const SECTION_MIN_HEIGHT = 120;
const IMAGE_DEFAULT_HEIGHT = 360;

export function JobPreviewDrawer({
  jobId,
  onClose,
  initialCollections,
  initialCollectionMembership,
}: JobPreviewDrawerProps) {
  const reviewDrawer = useReviewDrawer();
  const queueDrawer = useQueueDrawer();

  const [drafts, setDrafts] = useState<M1PassageDraftWithJob[]>([]);
  const [jobMeta, setJobMeta] = useState<{
    displayName: string | null;
    originalFileName: string | null;
    resultCount: number;
  } | null>(null);
  const [draftsLoading, setDraftsLoading] = useState(true);
  const [draftsError, setDraftsError] = useState<string | null>(null);

  const [pages, setPages] = useState<PageImage[]>([]);
  const [pagesLoading, setPagesLoading] = useState(true);
  const [pagesError, setPagesError] = useState<string | null>(null);

  const [overlayEl, setOverlayEl] = useState<HTMLDivElement | null>(null);

  // Per-draft detail (compare/edit modal) — locally owned so we can drive
  // the same DraftDetailModal that 자료 관리 uses.
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [selectedDraftDetail, setSelectedDraftDetail] =
    useState<M1PassageDraftWithJob | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Bulk selection state for the toolbar.
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set());
  // 마키(영역 드래그) 선택을 드로어 내부로 한정하기 위한 경계(스크롤 영역).
  const draftListRef = useRef<HTMLDivElement | null>(null);

  const folders = useFolderManager({
    initialCollections,
    initialMembership: initialCollectionMembership,
    actions: {
      createCollection: createM1DraftCollection,
      updateCollection: updateM1DraftCollection,
      deleteCollection: deleteM1DraftCollection,
      addToCollection: addDraftsToCollection,
      removeFromCollection: removeDraftsFromCollection,
    },
    itemLabel: "자료",
  });

  const closeDraftDetail = useCallback(() => {
    setSelectedDraftId(null);
    setSelectedDraftDetail(null);
  }, []);

  const openDraftDetail = useCallback(
    async (id: string) => {
      const optimistic = drafts.find((d) => d.id === id) ?? null;
      setSelectedDraftId(id);
      setSelectedDraftDetail(optimistic);
      try {
        const res = await fetch(`/api/extraction/m1-passages/${id}`, {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) throw new Error("자료 상세를 불러오지 못했습니다.");
        const data = (await res.json()) as { draft: M1PassageDraftWithJob };
        setSelectedDraftDetail(data.draft);
        setDrafts((current) =>
          current.map((d) =>
            d.id === data.draft.id ? { ...d, ...data.draft } : d,
          ),
        );
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : "자료 상세를 불러오지 못했습니다.",
        );
        if (!optimistic) closeDraftDetail();
      }
    },
    [drafts, closeDraftDetail],
  );

  const actions = useDraftActions({
    drafts,
    setDrafts,
    setSelectedDraftDetail,
    closeDraftDetail,
    setError: setActionError,
    refreshQueueDrawer: queueDrawer.triggerRefresh,
  });

  const bulk = useBulkActions({
    drafts,
    setDrafts,
    setError: setActionError,
    refreshQueueDrawer: queueDrawer.triggerRefresh,
  });

  useEffect(() => {
    if (actionError) {
      toast.error(actionError);
      setActionError(null);
    }
  }, [actionError]);

  // ─── Drawer width plumbing (matches JobReviewModal so the page compresses) ───
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 성능 계약(resizable-panels 동형): 드래그 중 setState 금지 — 매 pointermove
  // 의 setDrawerWidth 는 (a)드로어 자체 리렌더 (b)위 effect 의
  // reviewDrawer.setOpen({width}) 로 AdminShell 아래 페이지 전체를 프레임마다
  // 리렌더시켰다. 이동 중에는 [data-review-drawer-panel] 의 width 와
  // [data-review-drawer-inset](AdminShell main wrapper) 의 marginRight 를 rAF
  // 코얼레싱으로 함께 직접 기록해 본문 압축 타이밍을 종전과 동일하게 유지하고,
  // 놓을 때 한 번만 setState(=effect 가 컨텍스트 최종 커밋) + 영속한다.
  // 두 앵커 중 하나라도 못 찾으면 종전 setDrawerWidth 경로 폴백(무회귀).
  const beginDrawerResize = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startWidth = drawerWidth;
      let latest = startWidth;

      // 포인터 캡처 — 커서가 얇은 핸들을 벗어나도 드래그가 끊기지 않는다.
      const handle = e.currentTarget as HTMLElement;
      try {
        handle.setPointerCapture(e.pointerId);
      } catch {
        /* 캡처 미지원 브라우저는 window 리스너로 폴백 */
      }

      const asideEl = handle.closest<HTMLElement>("[data-review-drawer-panel]");
      const insetEl = document.querySelector<HTMLElement>(
        "[data-review-drawer-inset]",
      );
      const fastPath = Boolean(asideEl && insetEl);

      const prevCursor = document.body.style.cursor;
      const prevSelect = document.body.style.userSelect;
      const prevPointerEvents = document.body.style.pointerEvents;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      // 드래그 중 hover 스타일 재평가 차단(캡처 덕에 move 수신은 유지).
      document.body.style.pointerEvents = "none";

      // rAF 코얼레싱 — 스타일 기록은 프레임당 1회.
      let rafId: number | null = null;
      const flush = () => {
        rafId = null;
        if (!fastPath || !asideEl || !insetEl) return;
        asideEl.style.width = `${latest}px`;
        insetEl.style.marginRight = `${latest}px`;
      };

      const onMove = (ev: PointerEvent) => {
        const max = Math.max(
          DRAWER_MIN_WIDTH,
          Math.floor(window.innerWidth * 0.8),
        );
        latest = Math.min(
          max,
          Math.max(DRAWER_MIN_WIDTH, startWidth - (ev.clientX - startX)),
        );
        if (fastPath) {
          if (rafId === null) rafId = requestAnimationFrame(flush);
        } else {
          // 폴백(레거시) — 앵커를 못 찾으면 종전대로 상태 갱신
          setDrawerWidth(latest);
        }
      };
      const onUp = () => {
        document.body.style.cursor = prevCursor;
        document.body.style.userSelect = prevSelect;
        document.body.style.pointerEvents = prevPointerEvents;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        if (rafId !== null) cancelAnimationFrame(rafId);
        flush();
        // 커밋은 여기서 한 번 — reviewDrawer 컨텍스트는 drawerWidth effect 가
        // 최종 반영한다. 인라인 값은 React 렌더 결과와 동일한 px 로 남긴다
        // (지우면 시작 폭과 같은 값으로 끝났을 때 setState 가 bail-out 해
        // marginRight 가 빈 채로 남는 회귀가 생긴다).
        setDrawerWidth(latest);
        try {
          handle.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        try {
          window.localStorage.setItem(DRAWER_WIDTH_KEY, String(latest));
        } catch {
          /* ignore */
        }
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [drawerWidth],
  );

  const resetDrawerWidth = useCallback(() => {
    setDrawerWidth(DRAWER_DEFAULT_WIDTH);
    try {
      window.localStorage.setItem(DRAWER_WIDTH_KEY, String(DRAWER_DEFAULT_WIDTH));
    } catch {
      /* ignore */
    }
  }, []);

  // ─── Image / drafts split (horizontal drag handle between them) ───
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

  // 성능 계약: 드래그 중 setState 금지 — 매 pointermove 의 setImageHeight 는
  // 드로어 본문(이미지 캐러셀 + 드래프트 체크리스트) 전체를 프레임마다
  // 리렌더시켰다. 이동 중에는 [data-split-image-pane] 의 style.height 에 rAF
  // 코얼레싱으로 직접 쓰고, 놓을 때 한 번만 setState + 영속. 앵커 미발견 시 폴백.
  const beginSplitResize = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startY = e.clientY;
      const startHeight = imageHeight;
      let latest = startHeight;

      // 포인터 캡처 — 커서가 얇은 핸들을 벗어나도 드래그가 끊기지 않는다.
      const handle = e.currentTarget as HTMLElement;
      try {
        handle.setPointerCapture(e.pointerId);
      } catch {
        /* 캡처 미지원 브라우저는 window 리스너로 폴백 */
      }

      const imgEl =
        splitContainerRef.current?.querySelector<HTMLElement>(
          "[data-split-image-pane]",
        ) ?? null;

      const prevCursor = document.body.style.cursor;
      const prevSelect = document.body.style.userSelect;
      const prevPointerEvents = document.body.style.pointerEvents;
      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";
      // 드래그 중 hover 스타일 재평가 차단(캡처 덕에 move 수신은 유지).
      document.body.style.pointerEvents = "none";

      // rAF 코얼레싱 — 스타일 기록은 프레임당 1회.
      let rafId: number | null = null;
      const flush = () => {
        rafId = null;
        if (imgEl) imgEl.style.height = `${latest}px`;
      };

      const onMove = (ev: PointerEvent) => {
        const containerH =
          splitContainerRef.current?.getBoundingClientRect().height ??
          window.innerHeight;
        const max = Math.max(IMAGE_MIN_HEIGHT, containerH - SECTION_MIN_HEIGHT);
        latest = Math.min(
          max,
          Math.max(IMAGE_MIN_HEIGHT, startHeight + (ev.clientY - startY)),
        );
        if (imgEl) {
          if (rafId === null) rafId = requestAnimationFrame(flush);
        } else {
          // 폴백(레거시) — 앵커를 못 찾으면 종전대로 상태 갱신
          setImageHeight(latest);
        }
      };
      const onUp = () => {
        document.body.style.cursor = prevCursor;
        document.body.style.userSelect = prevSelect;
        document.body.style.pointerEvents = prevPointerEvents;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        if (rafId !== null) cancelAnimationFrame(rafId);
        flush();
        // 커밋은 여기서 한 번 — 드래그 내내 리렌더 0회.
        setImageHeight(latest);
        try {
          handle.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        try {
          window.localStorage.setItem(IMAGE_HEIGHT_KEY, String(latest));
        } catch {
          /* ignore */
        }
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
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

  // ─── Fetch page images ───
  useEffect(() => {
    let cancelled = false;
    setPages([]);
    setPagesLoading(true);
    setPagesError(null);
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
        setPagesError(
          err instanceof Error
            ? err.message
            : "페이지 이미지를 불러오지 못했습니다.",
        );
      } finally {
        if (!cancelled) setPagesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  // ─── Fetch job + drafts ───
  useEffect(() => {
    let cancelled = false;
    setDrafts([]);
    setDraftsLoading(true);
    setDraftsError(null);
    void (async () => {
      try {
        const res = await fetch(`/api/extraction/jobs/${jobId}`, {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) throw new Error("작업 정보를 불러오지 못했습니다.");
        const data = (await res.json()) as JobDetailResponse;
        if (cancelled) return;
        const examPageNumberByPageIndex = buildExamPageNumberMap(data.items);
        const jobSummary: M1DraftJobSummary = {
          id: data.job.id,
          originalFileName: data.job.originalFileName,
          displayName: data.job.displayName ?? null,
          totalPages: data.job.totalPages,
          status: data.job.status,
          createdAt: data.job.createdAt,
          completedAt: data.job.completedAt,
          pages: (data.pages ?? []).map((page) => ({
            pageIndex: page.pageIndex,
            sourceFileName: page.sourceFileName ?? null,
            examPageNumber:
              examPageNumberByPageIndex.get(page.pageIndex) ?? null,
          })),
        };
        setDrafts(
          data.m1PassageDrafts.map((draft) => ({ ...draft, job: jobSummary })),
        );
        setJobMeta({
          displayName: data.job.displayName ?? null,
          originalFileName: data.job.originalFileName ?? null,
          resultCount: data.m1PassageDrafts.length,
        });
      } catch (err) {
        if (cancelled) return;
        setDraftsError(
          err instanceof Error ? err.message : "작업 정보를 불러오지 못했습니다.",
        );
      } finally {
        if (!cancelled) setDraftsLoading(false);
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

  const sortedDrafts = useMemo(
    () => [...drafts].sort((a, b) => a.passageOrder - b.passageOrder),
    [drafts],
  );

  const selectedDraft =
    selectedDraftDetail ??
    drafts.find((draft) => draft.id === selectedDraftId) ??
    null;

  const wrapMutation =
    <T extends M1PassageDraftSnapshot>(handler: (draft: T) => void | Promise<void>) =>
    (draft: T) => {
      void Promise.resolve(handler(draft)).then(() => {
        queueDrawer.triggerRefresh();
      });
    };

  // ─── Bulk-selection helpers (mirrors JobReviewModal) ───
  const allIds = useMemo(() => sortedDrafts.map((d) => d.id), [sortedDrafts]);
  const allChecked =
    allIds.length > 0 && allIds.every((id) => checkedIds.has(id));
  const visibleCheckedIds = useMemo(() => {
    const next = new Set<string>();
    for (const id of allIds) if (checkedIds.has(id)) next.add(id);
    return next;
  }, [allIds, checkedIds]);
  const bulkDragIds = useMemo(
    () => Array.from(visibleCheckedIds),
    [visibleCheckedIds],
  );
  const hasSelection = visibleCheckedIds.size > 0;
  const selectAllCheckboxRef = useRef<HTMLInputElement>(null);
  const selectAllIndeterminate = visibleCheckedIds.size > 0 && !allChecked;
  const anyBulkRunning = bulk.bulkActionRunning !== null;
  const isPromoting = bulk.bulkActionRunning === "promote";
  const isDeleting = bulk.bulkActionRunning === "delete";

  useEffect(() => {
    if (!selectAllCheckboxRef.current) return;
    selectAllCheckboxRef.current.indeterminate = selectAllIndeterminate;
  }, [selectAllIndeterminate]);

  const toggleCheck = useCallback((id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setCheckedIds(() => {
      if (allChecked) return new Set();
      return new Set(allIds);
    });
  }, [allChecked, allIds]);

  const clearChecks = useCallback(() => setCheckedIds(new Set()), []);

  const handleMarqueeChange = useCallback(
    (next: Set<string>) => {
      // next 는 이 드로어 목록 기준의 최종 집합이다. 통째로 갈아끼우면 드로어
      // **바깥**에서 체크해 둔 항목이 마키 한 번에 전부 사라진다 — 마키는 더하기만
      // 한다는 계약(components/ui/drag-select.tsx, 2026-08-20 개편) 위반이다.
      // 그래서 이 목록이 관할하는 id(allIds)만 갈아끼우고 나머지는 보존한다.
      // (자매 표면 extraction-manage-client/components/job-review-modal.tsx 와 동일 규약)
      const visibleIds = new Set(allIds);
      setCheckedIds((prev) => {
        const merged = new Set(prev);
        for (const id of allIds) merged.delete(id);
        for (const id of next) if (visibleIds.has(id)) merged.add(id);
        return merged;
      });
    },
    [allIds],
  );

  const handleAdd = useCallback(
    async (collectionId: string) => {
      if (visibleCheckedIds.size === 0) return;
      await folders.handleAddToFolder(collectionId, visibleCheckedIds);
      clearChecks();
    },
    [folders, visibleCheckedIds, clearChecks],
  );

  const handleMove = useCallback(
    async (collectionId: string) => {
      if (visibleCheckedIds.size === 0) return;
      const anyId = visibleCheckedIds.values().next().value;
      if (!anyId) return;
      await folders.handleDragToFolder(
        anyId,
        collectionId,
        false,
        visibleCheckedIds,
      );
      clearChecks();
    },
    [folders, visibleCheckedIds, clearChecks],
  );

  const handlePromote = useCallback(() => {
    if (visibleCheckedIds.size === 0) return;
    void bulk.bulkPromote(new Set(visibleCheckedIds), clearChecks);
  }, [bulk, visibleCheckedIds, clearChecks]);

  const handleDelete = useCallback(() => {
    if (visibleCheckedIds.size === 0) return;
    void bulk.bulkDelete(new Set(visibleCheckedIds), clearChecks);
  }, [bulk, visibleCheckedIds, clearChecks]);

  return (
    <>
      <aside
        role="dialog"
        aria-label={`${jobLabel} 검수 패널`}
        data-review-drawer-panel
        style={{ width: drawerWidth }}
        className="fixed inset-y-0 right-0 z-40 flex flex-col overflow-hidden border-l border-slate-200 bg-[#F8FAFB] shadow-2xl"
      >
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
                추출된 자료 {sortedDrafts.length}개 · 카드를 드래그해 폴더에 추가
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

        <div ref={splitContainerRef} className="flex min-h-0 flex-1 flex-col">
          <div
            data-split-image-pane
            style={{ height: imageHeight }}
            className="relative shrink-0 overflow-y-auto bg-white p-3"
          >
            <div
              ref={setOverlayEl}
              className="pointer-events-none absolute inset-0 z-20"
            />
            <ImagePages
              pages={pages}
              loading={pagesLoading}
              error={pagesError}
              expectedCount={jobMeta?.resultCount ?? sortedDrafts.length}
              overlayEl={overlayEl}
            />
          </div>

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

          <div className="flex min-h-0 flex-1 flex-col bg-[#F8FAFB]">
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
              <div className="flex shrink-0 items-center gap-2">
                <MoveOrCopyFolderPicker
                  collections={folders.collections}
                  activeFolder={folders.activeFolder}
                  selectedCount={visibleCheckedIds.size}
                  onCopy={handleAdd}
                  onMove={handleMove}
                  disabled={anyBulkRunning || !hasSelection}
                  compact
                />

                <button
                  type="button"
                  onClick={handlePromote}
                  disabled={anyBulkRunning || !hasSelection}
                  title="검수완료"
                  aria-label="검수완료"
                  className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md bg-emerald-600 text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isPromoting ? (
                    <Loader2
                      className="h-3.5 w-3.5 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={anyBulkRunning || !hasSelection}
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
              </div>
            </div>

            <div
              ref={draftListRef}
              className="min-h-0 flex-1 overflow-y-auto p-3"
            >
              {draftsError ? (
                <p className="py-12 text-center text-[12px] text-red-600">
                  {draftsError}
                </p>
              ) : draftsLoading && sortedDrafts.length === 0 ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }, (_, i) => (
                    <div
                      key={i}
                      className="h-32 animate-pulse rounded-xl border border-slate-200 bg-white"
                    />
                  ))}
                </div>
              ) : sortedDrafts.length === 0 ? (
                <p className="py-12 text-center text-[12px] text-slate-400">
                  추출된 자료가 없습니다.
                </p>
              ) : (
                <DragSelect deferCommit
                  className="grid grid-cols-1 gap-2"
                  value={visibleCheckedIds}
                  onChange={handleMarqueeChange}
                  itemScopeRef={draftListRef}
                  allowCardDescendantDragStart
                >
                  {sortedDrafts.map((draft, index) => (
                    <DraftCard
                      key={draft.id}
                      draft={draft}
                      index={index}
                      selected={false}
                      active={selectedDraftId === draft.id}
                      checked={checkedIds.has(draft.id)}
                      onClick={() => void openDraftDetail(draft.id)}
                      onToggleCheck={() => toggleCheck(draft.id)}
                      bulkDragIds={bulkDragIds}
                      onTitleChange={actions.updateDraftTitle}
                      onPromote={actions.promoteDraft}
                      onUnpromote={actions.unpromoteDraft}
                      onDelete={actions.deleteDraft}
                      footerDelete
                      deleting={actions.deletingDraftId === draft.id}
                    />
                  ))}
                </DragSelect>
              )}
            </div>
          </div>
        </div>
      </aside>

      {selectedDraft ? (
        <DraftDetailModal
          draft={selectedDraft}
          savingId={actions.savingId}
          rerestoringId={actions.rerestoringId}
          deletingDraftId={actions.deletingDraftId}
          promotingId={actions.promotingId}
          unpromotingId={actions.unpromotingId}
          onClose={closeDraftDetail}
          onDelete={wrapMutation(actions.deleteDraft)}
          onRerestore={wrapMutation(actions.rerestoreDraft)}
          onSave={wrapMutation(actions.saveDraft)}
          onPromote={wrapMutation(actions.promoteDraft)}
          onUnpromote={wrapMutation(actions.unpromoteDraft)}
          onTextChange={actions.updateDraftText}
          onTitleChange={actions.updateDraftTitle}
        />
      ) : null}
    </>
  );
}
