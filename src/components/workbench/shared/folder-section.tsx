"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  FolderOpen,
  FolderPlus,
  Check,
  X,
  CornerUpLeft,
  Grid3X3,
  List,
  Search,
} from "lucide-react";
import type { CollectionItem } from "./types";
import { FolderChip } from "./folder-chip";
import { FolderCard } from "./folder-card";
import { FolderListRow } from "./folder-list-row";

interface FolderSectionProps {
  childFolders: CollectionItem[];
  activeFolder: string | null;
  dragItemType: "question" | "passage" | "exam";
  dragItemIdKey: string;
  itemCountLabel: string;
  showNewFolder: boolean;
  newFolderName: string;
  onNewFolderNameChange: (name: string) => void;
  onShowNewFolder: (show: boolean) => void;
  onCreateFolder: () => void;
  onNavigateToFolder: (id: string) => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
  onDragToFolder: (itemId: string, folderId: string, copy: boolean) => void;
  onDragToRoot?: (itemId: string, copy: boolean) => void;
  breadcrumbPath?: CollectionItem[];
  onNavigateToRoot?: () => void;
  /** If true, use full FolderCard inside folders, FolderChip at root */
  useCardInsideFolder?: boolean;
  /** Bulk-selection toolbar rendered as the last row of the section. Since
   *  FolderSection is `sticky -top-4`, anything rendered here gets pinned
   *  along with the breadcrumb + folder chips when the user scrolls. Pass
   *  `<SelectionToolbar embedded />` so it inherits the section's chrome. */
  selectionBar?: ReactNode;
  /** Page-specific filters/actions rendered to the right of the folder
   *  title in the header row. Pages should pass their search input + filter
   *  selects + view toggles here so the page-level chrome can stay minimal
   *  (just title + count + primary CTA). */
  toolbar?: ReactNode;
  /** Extra context row that remains pinned with the management bar. Used for
   *  page-specific state such as the active passage in passage-grouped mode. */
  contextBar?: ReactNode;
  /** Page-level identity rendered in the FolderSection header — replaces
   *  the default "폴더 관리" label. Pass `{ icon, title, totalCount }` so
   *  the page can drop its top header bar entirely and let this card serve
   *  as the single chrome surface. */
  pageHeader?: {
    icon: ReactNode;
    title: string;
    totalCount: number;
    itemLabel: string;
    /** Count unit ("개"/"편"/"문항"/"부"…). Defaults to "개". Used to give each
     *  workbench stage a recognizable unit at a glance — see DOMAIN_UNITS in
     *  the task queue constants for the canonical per-stage values. */
    itemUnit?: string;
    description?: string;
  };
  rootLabel?: string;
  /** Opt-in: enables 자료관리-style folder controls (folder search input,
   *  name/date sort, grid/list view toggle, resizable height, and a bottom
   *  collapse handle). When enabled, the previous header collapse button is
   *  replaced by the bottom resize+collapse row. */
  enableFolderControls?: boolean;
  /** Required when `enableFolderControls` is true and the list view is in
   *  use — supplies all folders across all levels so the Miller-column list
   *  view can render parent→child columns. Falls back to `childFolders` when
   *  omitted. */
  allFolders?: CollectionItem[];
  /** Persistence key suffix so each page keeps its own folder UI prefs. */
  storageKey?: string;
  /** Renders inside the same sticky wrapper as the FolderSection card, just
   *  below it. Use this for chrome that must stick with the folder section
   *  (e.g. a page-level filter/toolbar row). */
  stickyFooter?: ReactNode;
}

interface ParentFolderButtonProps {
  dragItemType: "question" | "passage" | "exam";
  dragItemIdKey: string;
  onClick: () => void;
  onFileDrop: (itemId: string, copy: boolean) => void;
}

function ParentFolderButton({
  dragItemType,
  dragItemIdKey,
  onClick,
  onFileDrop,
}: ParentFolderButtonProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const dropRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const el = dropRef.current;
    if (!el) return;
    return dropTargetForElements({
      element: el,
      canDrop: ({ source }) => source.data.type === dragItemType,
      onDragEnter: () => setIsDragOver(true),
      onDragLeave: () => setIsDragOver(false),
      onDrop: ({ source }) => {
        setIsDragOver(false);
        const itemId = source.data[dragItemIdKey] as string;
        const isCopy = (window.event as DragEvent | null)?.shiftKey ?? false;
        onFileDrop(itemId, isCopy);
      },
    });
  }, [dragItemIdKey, dragItemType, onFileDrop]);

  return (
    <button
      ref={dropRef}
      type="button"
      onClick={onClick}
      className={
        "flex size-[72px] cursor-pointer flex-col items-center justify-center rounded-xl border bg-white text-slate-500 shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:text-blue-600 hover:shadow-md " +
        (isDragOver
          ? "scale-105 border-blue-400 bg-blue-50 text-blue-700 shadow-md ring-2 ring-blue-200/60"
          : "border-slate-200")
      }
    >
      <CornerUpLeft className="mb-0.5 size-5" aria-hidden="true" />
      <span className="text-[10.5px] font-semibold">상위</span>
    </button>
  );
}

export function FolderSection({
  childFolders,
  activeFolder,
  dragItemType,
  dragItemIdKey,
  itemCountLabel,
  showNewFolder,
  newFolderName,
  onNewFolderNameChange,
  onShowNewFolder,
  onCreateFolder,
  onNavigateToFolder,
  onRenameFolder,
  onDeleteFolder,
  onDragToFolder,
  onDragToRoot,
  breadcrumbPath = [],
  onNavigateToRoot,
  useCardInsideFolder = false,
  selectionBar,
  toolbar,
  contextBar,
  pageHeader,
  rootLabel = "전체 문제",
  enableFolderControls = false,
  allFolders,
  storageKey = "default",
  stickyFooter,
}: FolderSectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const useCards = useCardInsideFolder && activeFolder;
  const currentFolder = activeFolder
    ? breadcrumbPath[breadcrumbPath.length - 1]
    : null;
  const parentFolderId = currentFolder?.parentId ?? null;
  const navigateToParent = () => {
    if (parentFolderId) onNavigateToFolder(parentFolderId);
    else onNavigateToRoot?.();
  };
  const handleDropToParent = (itemId: string, copy: boolean) => {
    if (parentFolderId) onDragToFolder(itemId, parentFolderId, copy);
    else onDragToRoot?.(itemId, copy);
  };

  // ─── Enhanced controls state (only used when enableFolderControls=true) ───
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "date">("name");

  const COLUMN_WIDTH_KEY = `smoat:folder-section:${storageKey}:column-widths`;
  const SUB_COLUMN_WIDTH_KEY = `smoat:folder-section:${storageKey}:sub-column-widths`;
  const LIST_HEIGHT_KEY = `smoat:folder-section:${storageKey}:list-height`;
  const MIN_COLUMN_WIDTH = 140;
  const MIN_SUB_COLUMN_WIDTH = 28;
  const MIN_LIST_HEIGHT = 40;
  const MAX_LIST_HEIGHT = 800;
  const DEFAULT_LIST_HEIGHT = 156;

  const [listHeight, setListHeight] = useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT_LIST_HEIGHT;
    try {
      const raw = window.localStorage.getItem(LIST_HEIGHT_KEY);
      if (!raw) return DEFAULT_LIST_HEIGHT;
      const n = parseInt(raw, 10);
      if (Number.isNaN(n)) return DEFAULT_LIST_HEIGHT;
      return Math.min(MAX_LIST_HEIGHT, Math.max(MIN_LIST_HEIGHT, n));
    } catch {
      return DEFAULT_LIST_HEIGHT;
    }
  });

  const beginListHeightResize = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const startHeight = listHeight;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    const onMove = (ev: PointerEvent) => {
      const next = Math.min(
        MAX_LIST_HEIGHT,
        Math.max(MIN_LIST_HEIGHT, startHeight + (ev.clientY - startY)),
      );
      setListHeight((prev) => (prev === next ? prev : next));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setListHeight((prev) => {
        try {
          window.localStorage.setItem(LIST_HEIGHT_KEY, String(prev));
        } catch {
          /* ignore */
        }
        return prev;
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const [subColumnWidths, setSubColumnWidths] = useState<{
    date: number;
    count: number;
  }>(() => {
    if (typeof window === "undefined") return { date: 58, count: 40 };
    try {
      const raw = window.localStorage.getItem(SUB_COLUMN_WIDTH_KEY);
      if (!raw) return { date: 58, count: 40 };
      const parsed = JSON.parse(raw) as { date?: number; count?: number };
      return {
        date: Math.max(MIN_SUB_COLUMN_WIDTH, parsed.date ?? 58),
        count: Math.max(MIN_SUB_COLUMN_WIDTH, parsed.count ?? 40),
      };
    } catch {
      return { date: 58, count: 40 };
    }
  });

  const persistSubColumnWidths = (widths: { date: number; count: number }) => {
    try {
      window.localStorage.setItem(
        SUB_COLUMN_WIDTH_KEY,
        JSON.stringify(widths),
      );
    } catch {
      /* ignore */
    }
  };

  const beginNameDateResize = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startDate = subColumnWidths.date;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const onMove = (ev: PointerEvent) => {
      const next = Math.max(
        MIN_SUB_COLUMN_WIDTH,
        startDate - (ev.clientX - startX),
      );
      setSubColumnWidths((prev) =>
        prev.date === next ? prev : { ...prev, date: next },
      );
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setSubColumnWidths((prev) => {
        persistSubColumnWidths(prev);
        return prev;
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const beginDateCountResize = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startDate = subColumnWidths.date;
    const startCount = subColumnWidths.count;
    const total = startDate + startCount;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const onMove = (ev: PointerEvent) => {
      const delta = ev.clientX - startX;
      const nextDate = Math.min(
        total - MIN_SUB_COLUMN_WIDTH,
        Math.max(MIN_SUB_COLUMN_WIDTH, startDate + delta),
      );
      const nextCount = total - nextDate;
      setSubColumnWidths((prev) =>
        prev.date === nextDate && prev.count === nextCount
          ? prev
          : { date: nextDate, count: nextCount },
      );
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setSubColumnWidths((prev) => {
        persistSubColumnWidths(prev);
        return prev;
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const listScrollRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(
    () => {
      if (typeof window === "undefined") return {};
      try {
        const raw = window.localStorage.getItem(COLUMN_WIDTH_KEY);
        return raw ? (JSON.parse(raw) as Record<string, number>) : {};
      } catch {
        return {};
      }
    },
  );

  useEffect(() => {
    if (collapsed || viewMode !== "list" || !enableFolderControls) return;
    const el = listScrollRef.current;
    if (!el) return;
    const update = () => setContainerWidth(el.clientWidth);
    update();
    const obs = new ResizeObserver(update);
    obs.observe(el);
    return () => obs.disconnect();
  }, [collapsed, viewMode, enableFolderControls]);

  const defaultColumnWidth = Math.max(
    MIN_COLUMN_WIDTH,
    containerWidth > 0 ? Math.floor(containerWidth / 3) : 240,
  );

  const beginColumnResize = (columnKey: string) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = columnWidths[columnKey] ?? defaultColumnWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const onMove = (ev: PointerEvent) => {
      const next = Math.max(MIN_COLUMN_WIDTH, startWidth + (ev.clientX - startX));
      setColumnWidths((prev) =>
        prev[columnKey] === next ? prev : { ...prev, [columnKey]: next },
      );
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setColumnWidths((prev) => {
        try {
          window.localStorage.setItem(COLUMN_WIDTH_KEY, JSON.stringify(prev));
        } catch {
          /* ignore */
        }
        return prev;
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const sortAndFilter = (list: CollectionItem[]) => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = query
      ? list.filter((c) => c.name.toLowerCase().includes(query))
      : list;
    return [...filtered].sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name, "ko");
      return b.id.localeCompare(a.id);
    });
  };

  const visibleChildFolders = useMemo(
    () => (enableFolderControls ? sortAndFilter(childFolders) : childFolders),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [childFolders, searchQuery, sortBy, enableFolderControls],
  );

  const listColumns = useMemo(() => {
    if (!enableFolderControls) return [];
    const source = allFolders ?? childFolders;
    const cols: Array<{
      key: string;
      parentId: string | null;
      selectedId: string | null;
      folders: CollectionItem[];
    }> = [];
    const rootFolders = source.filter((f) => f.parentId === null);
    cols.push({
      key: "__root__",
      parentId: null,
      selectedId: breadcrumbPath[0]?.id ?? null,
      folders: sortAndFilter(rootFolders),
    });
    breadcrumbPath.forEach((folder, i) => {
      const children = source.filter((f) => f.parentId === folder.id);
      cols.push({
        key: folder.id,
        parentId: folder.id,
        selectedId: breadcrumbPath[i + 1]?.id ?? null,
        folders: sortAndFilter(children),
      });
    });
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allFolders, childFolders, breadcrumbPath, searchQuery, sortBy, enableFolderControls]);

  const prevColumnCountRef = useRef(0);
  useEffect(() => {
    if (!enableFolderControls || viewMode !== "list") {
      prevColumnCountRef.current = listColumns.length;
      return;
    }
    const el = listScrollRef.current;
    if (!el) return;
    if (listColumns.length > prevColumnCountRef.current) {
      requestAnimationFrame(() => {
        el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
      });
    }
    prevColumnCountRef.current = listColumns.length;
  }, [listColumns.length, viewMode, enableFolderControls]);

  const childCountByParent = useMemo(() => {
    const map = new Map<string, number>();
    if (!enableFolderControls) return map;
    const source = allFolders ?? childFolders;
    for (const f of source) {
      if (f.parentId) map.set(f.parentId, (map.get(f.parentId) ?? 0) + 1);
    }
    return map;
  }, [allFolders, childFolders, enableFolderControls]);

  return (
    <div
      className="sticky top-0 z-30 -mx-6 px-6 pt-2 pb-2.5"
      style={{
        background: "rgba(244, 246, 249, 0.92)",
        backdropFilter: "blur(16px) saturate(180%)",
        borderBottom: "1px solid rgba(0,0,0,0.06)",
      }}
    >
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-1.5 border-b border-slate-100 px-4 py-1.5">
          {/* Header row: page/folder identity (left) + page-specific filters/actions (right) */}
          <div className="flex items-center gap-3 min-w-0">
            {pageHeader ? (
              <>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  {pageHeader.icon}
                </span>
                <div className="min-w-0 flex items-center gap-2">
                  <h3 className="truncate text-[13px] font-bold text-slate-900">
                    {currentFolder ? currentFolder.name : pageHeader.title}
                  </h3>
                  {currentFolder ? (
                    <span className="shrink-0 rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-600">
                      현재 폴더
                    </span>
                  ) : null}
                  <span className="shrink-0 text-[11px] font-medium text-slate-400 tabular-nums">
                    · {pageHeader.itemLabel} {pageHeader.totalCount}
                    {pageHeader.itemUnit ?? "개"}
                    {childFolders.length > 0
                      ? ` · 폴더 ${childFolders.length}개`
                      : ""}
                  </span>
                </div>
              </>
            ) : (
              <>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <FolderOpen className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex items-center gap-2">
                  <h3 className="truncate text-[12px] font-bold text-slate-800">
                    {currentFolder ? currentFolder.name : "폴더 관리"}
                  </h3>
                  {currentFolder ? (
                    <span className="shrink-0 rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-600">
                      현재 폴더
                    </span>
                  ) : null}
                  <span className="shrink-0 text-[10.5px] font-medium text-slate-400">
                    · 하위 폴더 {childFolders.length}개
                  </span>
                </div>
              </>
            )}

            {enableFolderControls && !collapsed ? (
              <div className="flex shrink-0 items-center gap-1.5">
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-slate-400"
                    aria-hidden="true"
                  />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="폴더 검색"
                    className="h-7 w-36 rounded-md border border-slate-200 bg-white pl-7 pr-2 text-[11.5px] text-slate-700 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10"
                    aria-label="폴더 검색"
                  />
                  {searchQuery ? (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-1.5 top-1/2 inline-flex size-4 -translate-y-1/2 cursor-pointer items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                      aria-label="검색 지우기"
                    >
                      <X className="size-3" />
                    </button>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center overflow-hidden rounded-md border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setSortBy("name")}
                    aria-pressed={sortBy === "name"}
                    className={
                      "h-7 cursor-pointer px-2 text-[11.5px] font-semibold transition-colors " +
                      (sortBy === "name"
                        ? "bg-blue-50 text-blue-700"
                        : "bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700")
                    }
                  >
                    이름순
                  </button>
                  <button
                    type="button"
                    onClick={() => setSortBy("date")}
                    aria-pressed={sortBy === "date"}
                    className={
                      "h-7 cursor-pointer border-l border-slate-200 px-2 text-[11.5px] font-semibold transition-colors " +
                      (sortBy === "date"
                        ? "bg-blue-50 text-blue-700"
                        : "bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700")
                    }
                  >
                    날짜순
                  </button>
                </div>
              </div>
            ) : null}

            {enableFolderControls && pageHeader?.description ? (
              <span className="hidden min-w-0 truncate text-[11px] text-slate-400 xl:block">
                {pageHeader.description}
              </span>
            ) : null}

            {toolbar ? (
              <div className="ml-auto flex items-center gap-2 shrink-0">
                {toolbar}
              </div>
            ) : null}

            {enableFolderControls ? (
              !collapsed ? (
                <div
                  className={`${toolbar ? "ml-1" : "ml-auto"} flex shrink-0 items-center overflow-hidden rounded-md border border-slate-200`}
                >
                  <button
                    type="button"
                    onClick={() => setViewMode("grid")}
                    aria-pressed={viewMode === "grid"}
                    aria-label="그리드 보기"
                    className={
                      "p-2 cursor-pointer transition-colors " +
                      (viewMode === "grid"
                        ? "bg-slate-800 text-white"
                        : "text-slate-400 hover:bg-slate-50 hover:text-slate-600")
                    }
                  >
                    <Grid3X3 className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("list")}
                    aria-pressed={viewMode === "list"}
                    aria-label="목록 보기"
                    className={
                      "p-2 cursor-pointer transition-colors border-l border-slate-200 " +
                      (viewMode === "list"
                        ? "bg-slate-800 text-white"
                        : "text-slate-400 hover:bg-slate-50 hover:text-slate-600")
                    }
                  >
                    <List className="size-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setCollapsed(false)}
                  aria-expanded={false}
                  title="관리 바 펼치기"
                  className="ml-auto inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 text-[11.5px] font-medium text-slate-400 transition-colors hover:text-slate-600"
                >
                  <ChevronDown className="size-3.5" aria-hidden="true" />
                  <span>펼치기</span>
                </button>
              )
            ) : (
              <button
                type="button"
                onClick={() => setCollapsed((value) => !value)}
                aria-expanded={!collapsed}
                title={collapsed ? "관리 바 펼치기" : "관리 바 접기"}
                className={`${toolbar ? "ml-1" : "ml-auto"} inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-[11.5px] font-semibold text-slate-600 shadow-sm transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500`}
              >
                {collapsed ? (
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span>{collapsed ? "펼치기" : "접기"}</span>
              </button>
            )}
          </div>

          {contextBar}

          {!collapsed ? <div className="flex min-h-6 min-w-0 items-center gap-1.5 rounded-lg border border-blue-100 bg-blue-50/60 px-2.5 py-1 text-[11px]">
            <span className="shrink-0 font-semibold text-blue-500">
              현재 위치
            </span>
            <span className="h-3 w-px shrink-0 bg-blue-200" />
            {currentFolder ? (
              <button
                type="button"
                onClick={onNavigateToRoot}
                className="shrink-0 cursor-pointer font-medium text-slate-500 hover:text-blue-700"
              >
                {rootLabel}
              </button>
            ) : (
              <span className="shrink-0 font-bold text-blue-700">
                {rootLabel}
              </span>
            )}
            {breadcrumbPath.map((folder, index) => {
              const isLast = index === breadcrumbPath.length - 1;
              return (
                <span
                  key={folder.id}
                  className="flex min-w-0 items-center gap-1"
                >
                  <ChevronRight className="h-3 w-3 shrink-0 text-blue-300" />
                  {isLast ? (
                    <span className="truncate font-bold text-blue-700">
                      {folder.name}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onNavigateToFolder(folder.id)}
                      className="truncate cursor-pointer font-medium text-slate-500 hover:text-blue-700"
                    >
                      {folder.name}
                    </button>
                  )}
                </span>
              );
            })}
          </div> : null}
        </div>

        {!collapsed && (!enableFolderControls || viewMode === "grid") ? (
          <div
            style={enableFolderControls ? { height: listHeight } : undefined}
            className={
              enableFolderControls
                ? "overflow-y-auto bg-slate-50/70 px-4 py-2"
                : "bg-slate-50/70 px-4 py-3"
            }
          >
            <div className="flex items-center gap-2.5 flex-wrap">
              {currentFolder ? (
                <ParentFolderButton
                  dragItemType={dragItemType}
                  dragItemIdKey={dragItemIdKey}
                  onClick={navigateToParent}
                  onFileDrop={handleDropToParent}
                />
              ) : null}
              {useCards
                ? visibleChildFolders.map((c) => (
                    <FolderCard
                      key={c.id}
                      collection={c}
                      dragItemType={dragItemType}
                      dragItemIdKey={dragItemIdKey}
                      itemCountLabel={itemCountLabel}
                      selected={false}
                      onClick={() => onNavigateToFolder(c.id)}
                      onRename={onRenameFolder}
                      onDelete={onDeleteFolder}
                      onFileDrop={onDragToFolder}
                    />
                  ))
                : visibleChildFolders.map((c) => (
                    <FolderChip
                      key={c.id}
                      collection={c}
                      dragItemType={dragItemType}
                      dragItemIdKey={dragItemIdKey}
                      itemCountLabel={itemCountLabel}
                      onClick={() => onNavigateToFolder(c.id)}
                      onRename={onRenameFolder}
                      onDelete={onDeleteFolder}
                      onFileDrop={onDragToFolder}
                    />
                  ))}
              {showNewFolder ? (
                <div className="flex w-full min-w-[160px] max-w-[200px] items-center gap-2.5 rounded-xl border border-blue-200 bg-white px-2.5 py-2 shadow-sm ring-2 ring-blue-100/70 sm:w-[176px]">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                    <FolderPlus className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <input
                      autoFocus
                      placeholder="폴더 이름"
                      value={newFolderName}
                      onChange={(e) => onNewFolderNameChange(e.target.value)}
                      onKeyDown={(e) => {
                        const nativeEvent = e.nativeEvent as KeyboardEvent;
                        if (e.key === "Enter") {
                          if (nativeEvent.isComposing || nativeEvent.keyCode === 229 || e.repeat) return;
                          e.preventDefault();
                          e.stopPropagation();
                          onCreateFolder();
                        }
                        if (e.key === "Escape") {
                          e.preventDefault();
                          onShowNewFolder(false);
                          onNewFolderNameChange("");
                        }
                      }}
                      className="h-7 w-full rounded-md border border-blue-200 bg-blue-50/40 px-2 text-[11px] font-semibold text-slate-700 outline-none transition-all placeholder:text-blue-300 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-500/10"
                    />
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={onCreateFolder}
                        className="inline-flex h-6 flex-1 items-center justify-center gap-1 rounded-md bg-blue-600 px-2 text-[11px] font-bold text-white transition-colors hover:bg-blue-700"
                      >
                        <Check className="w-3 h-3" />
                        생성
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onShowNewFolder(false);
                          onNewFolderNameChange("");
                        }}
                        className="inline-flex h-6 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600"
                        aria-label="취소"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => onShowNewFolder(true)}
                  className="flex flex-col items-center justify-center w-[72px] h-[72px] rounded-xl border border-dashed border-blue-200 bg-white text-blue-500 shadow-sm hover:border-blue-300 hover:bg-blue-50/70 transition-all"
                >
                  <FolderPlus className="w-5 h-5 mb-1" />
                  <span className="text-[10px] font-semibold">추가</span>
                </button>
              )}
            </div>
          </div>
        ) : null}

        {!collapsed && enableFolderControls && viewMode === "list" ? (
          <div
            style={{ height: listHeight }}
            className="flex flex-col bg-slate-50/70 px-3 py-2"
          >
            <div
              ref={listScrollRef}
              className="flex min-h-0 flex-1 gap-px overflow-x-auto overflow-y-hidden rounded-md border border-slate-200 bg-slate-200/60 scroll-smooth"
            >
              {listColumns.map((column, columnIndex) => {
                const isLastColumn = columnIndex === listColumns.length - 1;
                const columnWidth = columnWidths[column.key] ?? defaultColumnWidth;
                return (
                  <div
                    key={column.key}
                    style={{ width: columnWidth }}
                    className="relative flex h-full shrink-0 flex-col bg-white"
                  >
                    <div className="relative flex h-6 shrink-0 items-center gap-2 border-b border-slate-200 bg-slate-50/80 px-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      <span className="size-4 shrink-0" aria-hidden="true" />
                      <button
                        type="button"
                        onClick={() => setSortBy("name")}
                        aria-pressed={sortBy === "name"}
                        className={
                          "min-w-0 flex-1 cursor-pointer truncate text-left transition-colors hover:text-slate-700 " +
                          (sortBy === "name" ? "text-blue-600" : "")
                        }
                      >
                        이름{sortBy === "name" ? " ↓" : ""}
                      </button>
                      <div
                        style={{ width: subColumnWidths.date }}
                        className="relative shrink-0"
                      >
                        <button
                          type="button"
                          onClick={() => setSortBy("date")}
                          aria-pressed={sortBy === "date"}
                          className={
                            "block w-full cursor-pointer truncate text-left transition-colors hover:text-slate-700 " +
                            (sortBy === "date" ? "text-blue-600" : "")
                          }
                        >
                          날짜{sortBy === "date" ? " ↓" : ""}
                        </button>
                        <div
                          onPointerDown={beginNameDateResize}
                          title="드래그하여 너비 조절"
                          className="group/subhandle absolute -left-2 top-0 z-10 h-full w-3 cursor-col-resize"
                        >
                          <div className="mx-auto h-full w-px bg-transparent transition-colors group-hover/subhandle:bg-blue-400 group-active/subhandle:bg-blue-500" />
                        </div>
                      </div>
                      <div
                        style={{ width: subColumnWidths.count }}
                        className="relative shrink-0"
                      >
                        <span className="block w-full truncate text-left">수</span>
                        <div
                          onPointerDown={beginDateCountResize}
                          title="드래그하여 너비 조절"
                          className="group/subhandle absolute -left-2 top-0 z-10 h-full w-3 cursor-col-resize"
                        >
                          <div className="mx-auto h-full w-px bg-transparent transition-colors group-hover/subhandle:bg-blue-400 group-active/subhandle:bg-blue-500" />
                        </div>
                      </div>
                      <span className="size-5 shrink-0" aria-hidden="true" />
                      <span className="size-3.5 shrink-0" aria-hidden="true" />
                    </div>
                    <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-1.5">
                      {column.folders.length === 0 && !isLastColumn ? (
                        <div className="px-2 py-1 text-[11px] text-slate-400">
                          하위 폴더 없음
                        </div>
                      ) : null}
                      {column.folders.map((c) => (
                        <FolderListRow
                          key={c.id}
                          collection={c}
                          dragItemType={dragItemType}
                          dragItemIdKey={dragItemIdKey}
                          onClick={() => onNavigateToFolder(c.id)}
                          onRename={onRenameFolder}
                          onDelete={onDeleteFolder}
                          onFileDrop={onDragToFolder}
                          selected={column.selectedId === c.id}
                          showChevron={(childCountByParent.get(c.id) ?? 0) > 0}
                          dateWidth={subColumnWidths.date}
                          countWidth={subColumnWidths.count}
                        />
                      ))}
                      {isLastColumn && showNewFolder ? (
                        <div className="flex h-7 items-center gap-2 rounded-md border border-blue-300 bg-white px-2 ring-2 ring-blue-100/70">
                          <FolderPlus className="size-4 shrink-0 text-blue-500" />
                          <input
                            autoFocus
                            placeholder="폴더 이름"
                            value={newFolderName}
                            onChange={(e) =>
                              onNewFolderNameChange(e.target.value)
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                if (e.nativeEvent.isComposing) return;
                                e.preventDefault();
                                e.stopPropagation();
                                onCreateFolder();
                              }
                              if (e.key === "Escape") {
                                e.preventDefault();
                                onShowNewFolder(false);
                                onNewFolderNameChange("");
                              }
                            }}
                            className="min-w-0 flex-1 bg-transparent text-[12px] font-semibold text-slate-700 outline-none placeholder:text-blue-300"
                          />
                          <button
                            type="button"
                            onClick={onCreateFolder}
                            className="inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded bg-blue-600 text-white transition-colors hover:bg-blue-700"
                            aria-label="생성"
                          >
                            <Check className="size-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              onShowNewFolder(false);
                              onNewFolderNameChange("");
                            }}
                            className="inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded border border-slate-200 bg-white text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600"
                            aria-label="취소"
                          >
                            <X className="size-3" />
                          </button>
                        </div>
                      ) : null}
                      {isLastColumn && !showNewFolder ? (
                        <button
                          type="button"
                          onClick={() => onShowNewFolder(true)}
                          className="group flex h-7 cursor-pointer items-center gap-2 rounded-md border border-dashed border-blue-200 px-2 text-blue-500 transition-colors hover:border-blue-300 hover:bg-blue-50/70"
                        >
                          <FolderPlus className="size-4 shrink-0" />
                          <span className="text-[12px] font-semibold">추가</span>
                        </button>
                      ) : null}
                    </div>
                    <div
                      onPointerDown={beginColumnResize(column.key)}
                      onDoubleClick={() =>
                        setColumnWidths((prev) => {
                          if (!(column.key in prev)) return prev;
                          const next = { ...prev };
                          delete next[column.key];
                          try {
                            window.localStorage.setItem(
                              COLUMN_WIDTH_KEY,
                              JSON.stringify(next),
                            );
                          } catch {
                            /* ignore */
                          }
                          return next;
                        })
                      }
                      title="드래그하여 칸 너비 조절 · 더블 클릭하여 초기화"
                      className="group/handle absolute -right-px top-0 z-10 h-full w-1.5 cursor-col-resize select-none"
                    >
                      <div className="ml-px h-full w-px bg-transparent transition-colors group-hover/handle:bg-blue-400 group-active/handle:bg-blue-500" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {!collapsed && enableFolderControls ? (
          <div className="relative flex items-center justify-end px-4 pb-0 pt-0">
            <div
              onPointerDown={beginListHeightResize}
              onDoubleClick={() => {
                setListHeight(DEFAULT_LIST_HEIGHT);
                try {
                  window.localStorage.setItem(
                    LIST_HEIGHT_KEY,
                    String(DEFAULT_LIST_HEIGHT),
                  );
                } catch {
                  /* ignore */
                }
              }}
              title="드래그하여 높이 조절 · 더블 클릭하여 초기화"
              className="group/vhandle absolute left-1/2 top-1/2 inline-flex h-3 w-[200px] -translate-x-1/2 -translate-y-1/2 cursor-row-resize items-center justify-center px-1 select-none"
            >
              <div className="h-0.5 w-full rounded-full bg-slate-200 transition-colors group-hover/vhandle:bg-blue-400 group-active/vhandle:bg-blue-500" />
            </div>
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              aria-expanded
              title="관리 바 접기"
              className="inline-flex cursor-pointer items-center gap-1 text-[11.5px] font-medium text-slate-400 transition-colors hover:text-slate-600"
            >
              <ChevronUp className="size-3.5" aria-hidden="true" />
              <span>접기</span>
            </button>
          </div>
        ) : null}

        {!collapsed && selectionBar ? (
          <div className="border-t border-slate-100 bg-white px-2 py-1.5">
            {selectionBar}
          </div>
        ) : null}
      </section>
      {stickyFooter ? <div className="mt-2.5">{stickyFooter}</div> : null}
    </div>
  );
}
