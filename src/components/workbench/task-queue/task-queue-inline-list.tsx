"use client";

import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Database, RefreshCw } from "lucide-react";
import { ExtractionTaskListIcon } from "@/components/icons/workflow-icons";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { DOMAIN_LABELS, DOMAIN_UNITS } from "./constants";
import { TaskCard } from "./components/task-card";
import { DragSelect } from "@/components/ui/drag-select";
import { TaskEmptyState } from "./components/task-empty-state";
import { useTaskList } from "./hooks/use-task-list";
import type { GridViewMode, TaskQueueInlineListProps } from "./task-queue-inline-list-types";
import { ViewModeToggle } from "./task-queue-inline-list-card-parts";
import { TaskGridCard } from "./task-queue-inline-list-grid-card";
import { TaskListRow } from "./task-queue-inline-list-list-row";

export type {
  GridViewMode,
  TaskInlineSortOrder,
} from "./task-queue-inline-list-types";
/**
 * Always-on, non-modal task list pinned to a page (e.g., below the input panel
 * on the extraction page). The default keeps the legacy horizontal thumbnail
 * rail, while `layout="grid"` renders a full workbench-style card grid.
 */
export function TaskQueueInlineList({
  domain,
  title,
  headerNote,
  emptyMessage = "표시할 작업이 없습니다.",
  limit = 20,
  layout = "horizontal",
  bare = false,
  onTaskClick,
  viewMode: controlledViewMode,
  onViewModeChange,
  grid3Disabled = false,
  searchQuery,
  statusFilter,
  sortOrder,
  onVisibleCountChange,
  onVisibleTasksChange,
  isTaskChecked,
  onToggleTaskCheck,
  getTaskDragData,
  getTaskDragCount,
  onRenameTask,
  collapsible,
  pendingTasks,
  refreshSignal,
  marqueeSelectedTaskIds,
  onMarqueeChange,
  marqueeBoundaryRef,
  renderTaskActions,
}: TaskQueueInlineListProps) {
  const marqueeEnabled = Boolean(marqueeSelectedTaskIds && onMarqueeChange);
  const sectionRef = useRef<HTMLElement | null>(null);
  const {
    tasks: fetchedTasks,
    loading,
    reload,
  } = useTaskList({
    scope: domain,
    refreshKey: refreshSignal ?? 0,
  });
  // 낙관적 placeholder를 앞에 끼워넣되, 실제 잡이 들어오면(같은 id) 자동 제외.
  const tasks = useMemo(() => {
    if (!pendingTasks || pendingTasks.length === 0) return fetchedTasks;
    const realIds = new Set(fetchedTasks.map((t) => t.id));
    const extras = pendingTasks.filter((p) => !realIds.has(p.id));
    return extras.length ? [...extras, ...fetchedTasks] : fetchedTasks;
  }, [pendingTasks, fetchedTasks]);
  const [internalViewMode, setInternalViewMode] =
    usePersistedState<GridViewMode>(
      `smoat:view-mode:task-queue-inline:${domain}`,
      "grid-3",
      (v): v is GridViewMode =>
        v === "grid-3" || v === "grid-2" || v === "list",
    );
  const viewMode = controlledViewMode ?? internalViewMode;
  const setViewMode = (mode: GridViewMode) => {
    if (grid3Blocked && mode === "grid-3") return;
    if (onViewModeChange) onViewModeChange(mode);
    if (controlledViewMode === undefined) setInternalViewMode(mode);
  };

  // Auto-collapse the 3-column grid to 2 columns when the grid itself gets too
  // narrow (sidebar/review drawer open, smaller window). Measured on the grid
  // container, not the viewport, so it reacts to layout changes around it. This
  // single signal drives both the rendered columns AND the view toggle, so the
  // two never disagree.
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [autoGrid3Disabled, setAutoGrid3Disabled] = useState(false);

  useEffect(() => {
    if (layout !== "grid") return;
    const el = bodyRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = (width: number) => {
      // 3 columns need ~900px before cards get thin enough to break.
      setAutoGrid3Disabled(width > 0 && width < 900);
    };
    measure(el.clientWidth);
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) measure(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [layout]);

  const grid3Blocked = grid3Disabled || autoGrid3Disabled;
  const effectiveViewMode =
    grid3Blocked && viewMode === "grid-3" ? "grid-2" : viewMode;

  // Persist the fallback only when grid-3 is *externally* disabled — an auto
  // width-collapse must not overwrite the user's saved preference, so 3 columns
  // come back once there's room again.
  useEffect(() => {
    if (!grid3Disabled || viewMode !== "grid-3") return;
    if (onViewModeChange) onViewModeChange("grid-2");
  }, [grid3Disabled, onViewModeChange, viewMode]);

  const collapseEnabled = Boolean(collapsible) && !bare;
  const resizeEnabled = collapseEnabled && collapsible?.resizable !== false;
  const collapseKey = collapsible ? `${collapsible.storageKey}:collapsed` : "";
  const heightKey = collapsible ? `${collapsible.storageKey}:height` : "";
  const minHeight = collapsible?.minHeight ?? 160;
  const maxHeight = collapsible?.maxHeight ?? 720;
  const defaultHeight = collapsible?.defaultHeight ?? 320;
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (!collapseEnabled || typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(collapseKey) === "1";
    } catch {
      return false;
    }
  });
  const [bodyHeight, setBodyHeight] = useState<number>(() => {
    if (!collapseEnabled || typeof window === "undefined") return defaultHeight;
    try {
      const raw = window.localStorage.getItem(heightKey);
      if (!raw) return defaultHeight;
      const n = parseInt(raw, 10);
      if (Number.isNaN(n)) return defaultHeight;
      return Math.min(maxHeight, Math.max(minHeight, n));
    } catch {
      return defaultHeight;
    }
  });
  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(collapseKey, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, [collapseKey]);
  const beginResize = useCallback(
    (e: ReactPointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startY = e.clientY;
      const startHeight = bodyHeight;
      let latest = startHeight;
      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";
      const onMove = (ev: PointerEvent) => {
        latest = Math.min(
          maxHeight,
          Math.max(minHeight, startHeight + (ev.clientY - startY)),
        );
        setBodyHeight(latest);
      };
      const onUp = () => {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        try {
          window.localStorage.setItem(heightKey, String(latest));
        } catch {
          /* ignore */
        }
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [bodyHeight, heightKey, maxHeight, minHeight],
  );
  const resetHeight = useCallback(() => {
    setBodyHeight(defaultHeight);
    try {
      window.localStorage.setItem(heightKey, String(defaultHeight));
    } catch {
      /* ignore */
    }
  }, [defaultHeight, heightKey]);

  const visible = useMemo(() => {
    let result = tasks;

    const trimmed = searchQuery?.trim().toLowerCase() ?? "";
    if (trimmed) {
      result = result.filter((task) => {
        const title = task.title?.toLowerCase() ?? "";
        const subtitle = task.subtitle?.toLowerCase() ?? "";
        return title.includes(trimmed) || subtitle.includes(trimmed);
      });
    }

    if (statusFilter && statusFilter !== "ALL") {
      result = result.filter((task) => task.status === statusFilter);
    }

    if (sortOrder) {
      const sorted = [...result];
      sorted.sort((a, b) => {
        if (sortOrder === "name_asc") {
          return (a.title ?? "").localeCompare(b.title ?? "", "ko");
        }
        if (sortOrder === "name_desc") {
          return (b.title ?? "").localeCompare(a.title ?? "", "ko");
        }
        const aTime = new Date(a.createdAt).getTime();
        const bTime = new Date(b.createdAt).getTime();
        return sortOrder === "oldest" ? aTime - bTime : bTime - aTime;
      });
      result = sorted;
    }

    return result.slice(0, limit);
  }, [tasks, searchQuery, statusFilter, sortOrder, limit]);

  useEffect(() => {
    onVisibleCountChange?.(visible.length);
  }, [onVisibleCountChange, visible.length]);

  useEffect(() => {
    onVisibleTasksChange?.(visible);
  }, [onVisibleTasksChange, visible]);

  const resolvedTitle = title ?? `${DOMAIN_LABELS[domain]} 작업 목록`;
  const HeaderIcon =
    domain === "extraction" ? ExtractionTaskListIcon : Database;
  const grid = layout === "grid";
  const isList = grid && effectiveViewMode === "list";
  // Column count follows effectiveViewMode, which already accounts for the
  // auto width-collapse above — so grid and toggle stay in sync. 모바일(<lg)은
  // 카드가 가로형(썸네일+정보/버튼)이라 항상 한 줄에 하나씩 세워야 제목·상태·
  // 버튼이 안 눌린다(모바일 우선: base=1열, lg:부터 2/3열). [[tailwind-v4-max-lg-override]]
  const gridColsClass =
    effectiveViewMode === "grid-2"
      ? "grid-cols-1 lg:grid-cols-2"
      : "grid-cols-1 lg:grid-cols-3";

  const bodyPadding = bare ? "" : "p-3";
  const sectionClass = bare
    ? "flex min-w-0 flex-col"
    : "flex min-w-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm";
  const bodyClass = bare
    ? "min-w-0"
    : grid
      ? "min-w-0 overflow-visible bg-[#F4F6F9]"
      : "min-w-0 overflow-x-auto overflow-y-hidden";
  const effectiveMarqueeBoundaryRef = marqueeBoundaryRef ?? sectionRef;

  return (
    <section ref={sectionRef} className={sectionClass}>
      {bare ? null : (
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-slate-50 text-slate-500 ring-1 ring-slate-200">
              <HeaderIcon className="size-4" aria-hidden="true" />
            </span>
            <h3 className="truncate text-[13px] font-bold text-slate-900">
              {resolvedTitle}
            </h3>
            <span
              aria-hidden="true"
              className="shrink-0 text-[11px] font-medium text-slate-300"
            >
              ·
            </span>
            <span className="shrink-0 text-[11px] font-medium tabular-nums text-slate-400">
              {tasks.length}
              {DOMAIN_UNITS[domain]}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {headerNote ? (
              <span className="shrink-0 text-[11px] font-medium text-slate-400">
                {headerNote}
              </span>
            ) : null}
            <button
              type="button"
              onClick={reload}
              className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              aria-label="작업 목록 새로고침"
            >
              <RefreshCw
                className={loading ? "size-4 animate-spin" : "size-4"}
                aria-hidden="true"
              />
            </button>
            {grid ? (
              <ViewModeToggle
                value={effectiveViewMode}
                onChange={setViewMode}
                grid3Disabled={grid3Blocked}
              />
            ) : null}
            {collapseEnabled && collapsed ? (
              <button
                type="button"
                onClick={toggleCollapsed}
                aria-expanded={false}
                title="작업 목록 펼치기"
                className="inline-flex h-8 cursor-pointer items-center gap-1 px-1 text-[11.5px] font-medium text-slate-400 transition-colors hover:text-slate-600"
              >
                <ChevronDown className="size-3.5" aria-hidden="true" />
                <span>펼치기</span>
              </button>
            ) : null}
          </div>
        </div>
      )}
      {collapseEnabled && collapsed ? null : (
        <>
          <div
            ref={bodyRef}
            className={bodyClass}
            style={
              resizeEnabled
                ? { height: bodyHeight, overflowY: "auto" }
                : undefined
            }
          >
            {visible.length === 0 ? (
              <div className={bodyPadding || "p-3"}>
                <TaskEmptyState message={emptyMessage} />
              </div>
            ) : grid ? (
              isList ? (
                (() => {
                  const rows = visible.map((task) => (
                    <TaskListRow
                      key={`${task.domain}:${task.id}`}
                      task={task}
                      onAfterDelete={() => reload()}
                      onClick={onTaskClick}
                      checked={isTaskChecked?.(task) ?? false}
                      onToggleCheck={
                        onToggleTaskCheck
                          ? () => onToggleTaskCheck(task)
                          : undefined
                      }
                      getDragData={
                        getTaskDragData
                          ? () => getTaskDragData(task)
                          : undefined
                      }
                      dragCount={getTaskDragCount?.(task)}
                      onRename={
                        onRenameTask
                          ? async (next) => {
                              await onRenameTask(task, next);
                              reload();
                            }
                          : undefined
                      }
                      dragItemId={marqueeEnabled ? task.id : undefined}
                      renderActions={renderTaskActions?.(task)}
                    />
                  ));
                  const cls = `flex flex-col gap-2 ${bodyPadding}`.trim();
                  return marqueeEnabled ? (
                    <DragSelect deferCommit
                      className={cls}
                      value={marqueeSelectedTaskIds!}
                      onChange={onMarqueeChange!}
                      boundaryRef={effectiveMarqueeBoundaryRef}
                    >
                      {rows}
                    </DragSelect>
                  ) : (
                    <div className={cls}>{rows}</div>
                  );
                })()
              ) : (
                (() => {
                  const cards = visible.map((task) => (
                    <TaskGridCard
                      key={`${task.domain}:${task.id}`}
                      task={task}
                      onAfterDelete={() => reload()}
                      onClick={onTaskClick}
                      checked={isTaskChecked?.(task) ?? false}
                      onToggleCheck={
                        onToggleTaskCheck
                          ? () => onToggleTaskCheck(task)
                          : undefined
                      }
                      getDragData={
                        getTaskDragData
                          ? () => getTaskDragData(task)
                          : undefined
                      }
                      dragCount={getTaskDragCount?.(task)}
                      onRename={
                        onRenameTask
                          ? async (next) => {
                              await onRenameTask(task, next);
                              reload();
                            }
                          : undefined
                      }
                      dragItemId={marqueeEnabled ? task.id : undefined}
                      renderActions={renderTaskActions?.(task)}
                    />
                  ));
                  const cls =
                    `grid gap-3 ${bodyPadding} ${gridColsClass}`.trim();
                  return marqueeEnabled ? (
                    <DragSelect deferCommit
                      className={cls}
                      value={marqueeSelectedTaskIds!}
                      onChange={onMarqueeChange!}
                      boundaryRef={effectiveMarqueeBoundaryRef}
                    >
                      {cards}
                    </DragSelect>
                  ) : (
                    <div className={cls}>{cards}</div>
                  );
                })()
              )
            ) : (
              <div className="flex items-start gap-2.5 p-2.5">
                {visible.map((task) => (
                  <TaskCard
                    key={`${task.domain}:${task.id}`}
                    task={task}
                    onAfterDelete={() => reload()}
                  />
                ))}
              </div>
            )}
          </div>
          {collapseEnabled ? (
            <div className="relative flex items-center justify-end px-4 pb-1 pt-1">
              {resizeEnabled ? (
                <div
                  onPointerDown={beginResize}
                  onDoubleClick={resetHeight}
                  title="드래그하여 높이 조절 · 더블 클릭하여 초기화"
                  className="group/jhandle absolute left-1/2 top-1/2 inline-flex h-3 w-[200px] -translate-x-1/2 -translate-y-1/2 cursor-row-resize items-center justify-center px-1 select-none"
                >
                  <div className="h-0.5 w-full rounded-full bg-slate-200 transition-colors group-hover/jhandle:bg-blue-400 group-active/jhandle:bg-blue-500" />
                </div>
              ) : null}
              <button
                type="button"
                onClick={toggleCollapsed}
                aria-expanded
                title="작업 목록 접기"
                className="inline-flex cursor-pointer items-center gap-1 text-[11.5px] font-medium text-blue-400 transition-colors hover:text-blue-600"
              >
                <ChevronUp className="size-3.5" aria-hidden="true" />
                <span>접기</span>
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
