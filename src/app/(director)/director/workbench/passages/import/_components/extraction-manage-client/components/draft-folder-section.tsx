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

import type { CollectionItem } from "@/components/workbench/shared/types";

import { DraftFolderCard } from "./draft-folder-card";
import { DraftFolderChip } from "./draft-folder-chip";
import { DraftFolderListRow } from "./draft-folder-list-row";
import { ViewToggleButton } from "./view-toggle-button";

const DRAG_TYPE = "draft" as const;
const BULK_DRAG_TYPE = "draft-bulk" as const;

interface DraftFolderSectionProps {
  childFolders: CollectionItem[];
  /** All folders across all levels — used by the Miller-column list view */
  allFolders?: CollectionItem[];
  activeFolder: string | null;
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
  onDragToFolder: (
    itemId: string | string[],
    folderId: string,
    copy: boolean,
  ) => void;
  onDragToRoot?: (itemId: string | string[], copy: boolean) => void;
  breadcrumbPath?: CollectionItem[];
  onNavigateToRoot?: () => void;
  /** If true, use full FolderCard inside folders, FolderChip at root */
  useCardInsideFolder?: boolean;
  selectionBar?: ReactNode;
  toolbar?: ReactNode;
  pageHeader?: {
    icon: ReactNode;
    title: string;
    totalCount: number;
    itemLabel: string;
    description?: string;
  };
  resultScope?: "all" | "job";
  onBackToAllResults?: () => void;
  /** When true, drop the outer card chrome (border/shadow/rounded) so a
   *  parent wrapper can own the box. Used to visually unify this section
   *  with the file preview area below it. */
  embedded?: boolean;
}

interface ParentFolderButtonProps {
  dragItemIdKey: string;
  onClick: () => void;
  onFileDrop: (itemId: string | string[], copy: boolean) => void;
}

function ParentFolderButton({
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
      canDrop: ({ source }) =>
        source.data.type === DRAG_TYPE || source.data.type === BULK_DRAG_TYPE,
      onDragEnter: () => setIsDragOver(true),
      onDragLeave: () => setIsDragOver(false),
      onDrop: ({ source }) => {
        setIsDragOver(false);
        const itemId =
          source.data.type === BULK_DRAG_TYPE
            ? (source.data.draftIds as string[])
            : (source.data[dragItemIdKey] as string);
        const isCopy = (window.event as DragEvent | null)?.shiftKey ?? false;
        onFileDrop(itemId, isCopy);
      },
    });
  }, [dragItemIdKey, onFileDrop]);

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

export function DraftFolderSection({
  childFolders,
  allFolders,
  activeFolder,
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
  pageHeader,
  resultScope = "all",
  onBackToAllResults,
  embedded = false,
}: DraftFolderSectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "date">("name");
  const useCards = useCardInsideFolder && Boolean(activeFolder);

  const listScrollRef = useRef<HTMLDivElement>(null);

  // ─── Column widths (resizable + persisted) ────────────────────────────
  const COLUMN_WIDTH_STORAGE_KEY = "smoat:draft-folder-column-widths";
  const SUB_COLUMN_WIDTH_STORAGE_KEY = "smoat:draft-folder-sub-column-widths";
  const LIST_HEIGHT_STORAGE_KEY = "smoat:draft-folder-list-height";
  const MIN_COLUMN_WIDTH = 140;
  const MIN_SUB_COLUMN_WIDTH = 28;
  const MIN_LIST_HEIGHT = 0;
  const MAX_LIST_HEIGHT = 800;
  const DEFAULT_LIST_HEIGHT = 112;

  const [listHeight, setListHeight] = useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT_LIST_HEIGHT;
    try {
      const raw = window.localStorage.getItem(LIST_HEIGHT_STORAGE_KEY);
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
          window.localStorage.setItem(LIST_HEIGHT_STORAGE_KEY, String(prev));
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
      const raw = window.localStorage.getItem(SUB_COLUMN_WIDTH_STORAGE_KEY);
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
        SUB_COLUMN_WIDTH_STORAGE_KEY,
        JSON.stringify(widths),
      );
    } catch {
      /* ignore */
    }
  };

  /**
   * Drag boundary between Name and Date: moving right grows the name area
   * (name is flex-1) and shrinks the date column.
   */
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

  /**
   * Drag boundary between Date and Count: moving right grows date and shrinks
   * count (keeps total date+count constant so the trailing slots stay aligned).
   */
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
  const [containerWidth, setContainerWidth] = useState(0);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(
    () => {
      if (typeof window === "undefined") return {};
      try {
        const raw = window.localStorage.getItem(COLUMN_WIDTH_STORAGE_KEY);
        return raw ? (JSON.parse(raw) as Record<string, number>) : {};
      } catch {
        return {};
      }
    },
  );

  useEffect(() => {
    if (collapsed || viewMode !== "list") return;
    const el = listScrollRef.current;
    if (!el) return;
    const update = () => setContainerWidth(el.clientWidth);
    update();
    const obs = new ResizeObserver(update);
    obs.observe(el);
    return () => obs.disconnect();
  }, [collapsed, viewMode]);

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
          window.localStorage.setItem(
            COLUMN_WIDTH_STORAGE_KEY,
            JSON.stringify(prev),
          );
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
      // cuid prefixes encode creation time — descending ≈ newest first
      return b.id.localeCompare(a.id);
    });
  };

  const visibleChildFolders = useMemo(
    () => sortAndFilter(childFolders),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [childFolders, searchQuery, sortBy],
  );

  /**
   * Miller-column structure for the list view. Each column shows folders at a
   * single hierarchy level; the next column to the right shows the children of
   * the currently-selected folder. Mirrors macOS Finder's column view.
   */
  const listColumns = useMemo(() => {
    if (!allFolders) return [];
    const cols: Array<{
      key: string;
      parentId: string | null;
      selectedId: string | null;
      folders: CollectionItem[];
    }> = [];
    const rootFolders = allFolders.filter((f) => f.parentId === null);
    cols.push({
      key: "__root__",
      parentId: null,
      selectedId: breadcrumbPath[0]?.id ?? null,
      folders: sortAndFilter(rootFolders),
    });
    breadcrumbPath.forEach((folder, i) => {
      const children = allFolders.filter((f) => f.parentId === folder.id);
      cols.push({
        key: folder.id,
        parentId: folder.id,
        selectedId: breadcrumbPath[i + 1]?.id ?? null,
        folders: sortAndFilter(children),
      });
    });
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allFolders, breadcrumbPath, searchQuery, sortBy]);

  // Snap the Miller-column viewport to the right when a new (deeper) column
  // is appended off-screen, so the user always sees the column they just
  // navigated into.
  const prevColumnCountRef = useRef(0);
  useEffect(() => {
    if (viewMode !== "list") {
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
  }, [listColumns.length, viewMode]);

  const childCountByParent = useMemo(() => {
    const map = new Map<string, number>();
    if (!allFolders) return map;
    for (const f of allFolders) {
      if (f.parentId) map.set(f.parentId, (map.get(f.parentId) ?? 0) + 1);
    }
    return map;
  }, [allFolders]);
  const currentFolder = activeFolder
    ? breadcrumbPath[breadcrumbPath.length - 1]
    : null;
  const title = pageHeader?.title ?? "폴더 관리";
  const description = currentFolder
    ? "현재 폴더 안의 자료를 정리하고 검수합니다."
    : pageHeader?.description;
  const parentFolderId = currentFolder?.parentId ?? null;
  const navigateToParent = () => {
    if (parentFolderId) onNavigateToFolder(parentFolderId);
    else onNavigateToRoot?.();
  };
  const handleDropToParent = (itemId: string | string[], copy: boolean) => {
    if (parentFolderId) onDragToFolder(itemId, parentFolderId, copy);
    else onDragToRoot?.(itemId, copy);
  };

  return (
    <section
      className={
        embedded
          ? "overflow-hidden bg-white"
          : "overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
      }
    >
      <div className="border-b border-slate-100 px-4 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            {pageHeader?.icon ?? <FolderOpen className="h-3.5 w-3.5" />}
          </span>
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            {breadcrumbPath.length === 0 ? (
              <h3 className="shrink-0 truncate text-[13px] font-bold text-slate-900">
                {title}
              </h3>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onNavigateToRoot}
                  className="shrink-0 cursor-pointer truncate text-[13px] font-medium text-slate-500 transition-colors hover:text-blue-700"
                  title="전체 자료로 이동"
                >
                  {title}
                </button>
                {breadcrumbPath.slice(0, -1).map((folder) => (
                  <span
                    key={folder.id}
                    className="flex min-w-0 items-center gap-1"
                  >
                    <ChevronRight
                      className="size-3 shrink-0 text-slate-300"
                      aria-hidden="true"
                    />
                    <button
                      type="button"
                      onClick={() => onNavigateToFolder(folder.id)}
                      className="cursor-pointer truncate text-[13px] font-medium text-slate-500 transition-colors hover:text-blue-700"
                    >
                      {folder.name}
                    </button>
                  </span>
                ))}
                <ChevronRight
                  className="size-3 shrink-0 text-slate-300"
                  aria-hidden="true"
                />
                <h3 className="shrink-0 truncate text-[13px] font-bold text-slate-900">
                  {breadcrumbPath[breadcrumbPath.length - 1].name}
                </h3>
              </>
            )}
            {pageHeader ? (
              <span className="shrink-0 text-[11px] font-medium text-slate-400 tabular-nums">
                · {pageHeader.itemLabel} {pageHeader.totalCount}개
                {childFolders.length > 0
                  ? ` · 폴더 ${childFolders.length}개`
                  : ""}
              </span>
            ) : (
              <span className="shrink-0 text-[10.5px] font-medium text-slate-400">
                · 하위 폴더 {childFolders.length}개
              </span>
            )}
            {resultScope === "job" && onBackToAllResults ? (
              <button
                type="button"
                onClick={onBackToAllResults}
                className="shrink-0 cursor-pointer rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
              >
                전체 결과로
              </button>
            ) : null}
          </div>
          {!collapsed ? (
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
          {description ? (
            <span className="hidden min-w-0 truncate text-[11px] text-slate-400 xl:block">
              {description}
            </span>
          ) : null}
          {toolbar ? (
            <div className="ml-auto flex shrink-0 items-center gap-2">
              {toolbar}
            </div>
          ) : null}
          {!collapsed ? (
            <div
              className={`${toolbar ? "ml-1" : "ml-auto"} flex shrink-0 items-center overflow-hidden rounded-md border border-slate-200`}
            >
              <ViewToggleButton
                active={viewMode === "grid"}
                label="그리드 보기"
                onClick={() => setViewMode("grid")}
              >
                <Grid3X3 className="size-4" />
              </ViewToggleButton>
              <ViewToggleButton
                active={viewMode === "list"}
                label="목록 보기"
                onClick={() => setViewMode("list")}
              >
                <List className="size-4" />
              </ViewToggleButton>
            </div>
          ) : null}
          {collapsed ? (
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
          ) : null}
        </div>

      </div>

      {!collapsed && viewMode === "grid" ? (
        <div
          style={{ height: listHeight }}
          className="overflow-y-auto bg-slate-50/70 px-4 py-3"
        >
          <div className="flex flex-wrap items-center gap-2.5">
            {currentFolder ? (
              <ParentFolderButton
                dragItemIdKey={dragItemIdKey}
                onClick={navigateToParent}
                onFileDrop={handleDropToParent}
              />
            ) : null}
            {useCards
              ? visibleChildFolders.map((c) => (
                  <DraftFolderCard
                    key={c.id}
                    collection={c}
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
                  <DraftFolderChip
                    key={c.id}
                    collection={c}
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
                    className="h-7 w-full rounded-md border border-blue-200 bg-blue-50/40 px-2 text-[11px] font-semibold text-slate-700 outline-none transition-all placeholder:text-blue-300 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-500/10"
                  />
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={onCreateFolder}
                      className="inline-flex h-6 flex-1 cursor-pointer items-center justify-center gap-1 rounded-md bg-blue-600 px-2 text-[11px] font-bold text-white transition-colors hover:bg-blue-700"
                    >
                      <Check className="size-3" />
                      생성
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onShowNewFolder(false);
                        onNewFolderNameChange("");
                      }}
                      className="inline-flex h-6 w-7 cursor-pointer items-center justify-center rounded-md border border-slate-200 bg-white text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600"
                      aria-label="취소"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onShowNewFolder(true)}
                className="flex size-[72px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-blue-200 bg-white text-blue-500 shadow-sm transition-all hover:border-blue-300 hover:bg-blue-50/70"
              >
                <FolderPlus className="mb-0.5 size-5" />
                <span className="text-[10.5px] font-semibold">추가</span>
              </button>
            )}
          </div>
        </div>
      ) : null}

      {!collapsed && viewMode === "list" ? (
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
                      <DraftFolderListRow
                        key={c.id}
                        collection={c}
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
                            COLUMN_WIDTH_STORAGE_KEY,
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

      {!collapsed ? (
        <div className="relative flex items-center justify-end px-4 pb-0 pt-0">
          <div
            onPointerDown={beginListHeightResize}
            onDoubleClick={() => {
              setListHeight(DEFAULT_LIST_HEIGHT);
              try {
                window.localStorage.setItem(
                  LIST_HEIGHT_STORAGE_KEY,
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
            className="inline-flex cursor-pointer items-center gap-1 text-[11.5px] font-medium text-blue-400 transition-colors hover:text-blue-600"
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
  );
}
