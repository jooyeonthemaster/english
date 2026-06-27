import type { ReactNode } from "react";
import type { BaseTask, TaskDomain, TaskStatus } from "./types";
export type InlineListLayout = "horizontal" | "grid";

export type GridViewMode = "grid-3" | "grid-2" | "list";

export type TaskInlineSortOrder =
  | "newest"
  | "oldest"
  | "name_asc"
  | "name_desc";

export interface TaskQueueInlineListProps {
  /** Domain to filter by. Inline list always shows a single domain. */
  domain: TaskDomain;
  /** Optional title override (defaults to "{domain label} 작업 목록"). */
  title?: string;
  /** Optional small helper text shown beside the header actions. */
  headerNote?: string;
  /** Optional empty-state message override. */
  emptyMessage?: string;
  /** Cap the number of rendered cards. Defaults to 20. */
  limit?: number;
  /** Horizontal thumbnail rail or workbench-style card grid. */
  layout?: InlineListLayout;
  /** Strip the header + outer section chrome. Renders only the card grid. */
  bare?: boolean;
  /** Intercept card clicks (e.g., to open a side drawer instead of navigating). */
  onTaskClick?: (task: BaseTask) => void;
  /** Controlled grid view mode. When provided, overrides internal state. */
  viewMode?: GridViewMode;
  /** Notified when the user picks a different view mode. */
  onViewModeChange?: (mode: GridViewMode) => void;
  /** Disable 3-column grid mode, usually while a right-side drawer is open. */
  grid3Disabled?: boolean;
  /** Free-text search applied to task title/subtitle. */
  searchQuery?: string;
  /** Restrict to a single task status; "ALL" / undefined disables. */
  statusFilter?: TaskStatus | "ALL";
  /** Sort order for the visible cards. Defaults to newest first. */
  sortOrder?: TaskInlineSortOrder;
  /** Notified whenever the filtered+capped task count changes. */
  onVisibleCountChange?: (count: number) => void;
  /** Notified whenever the filtered+capped task list changes. */
  onVisibleTasksChange?: (tasks: BaseTask[]) => void;
  /** Per-task checkbox state. When provided, each card renders a checkbox. */
  isTaskChecked?: (task: BaseTask) => boolean | "indeterminate";
  /** Toggle handler invoked when the checkbox is clicked. */
  onToggleTaskCheck?: (task: BaseTask) => void;
  /**
   * Drag payload provider for the whole task card. When provided, cards
   * become draggable using `@atlaskit/pragmatic-drag-and-drop`. Return `null`
   * to opt a specific task out of being dragged (e.g., if it has no items).
   * The shape mirrors `draft-card.tsx`: callers typically return
   * `{ type: "draft-bulk", draftIds: string[] }` so existing folder drop
   * targets can accept the payload unchanged.
   */
  getTaskDragData?: (task: BaseTask) => Record<string, unknown> | null;
  /**
   * Optional count of items inside the task. When > 1, the drag preview
   * renders a "+N" badge styled like the draft-card bulk preview.
   */
  getTaskDragCount?: (task: BaseTask) => number;
  /**
   * Optional rename handler. When provided, the task title becomes inline-
   * editable (click → input → blur/Enter commits). Receive the new label —
   * pass an empty string to clear back to the auto-derived name. The handler
   * should persist the change server-side and refresh the list so the new
   * title is reflected.
   */
  onRenameTask?: (task: BaseTask, nextTitle: string) => void | Promise<void>;
  /**
   * When provided, the section gains a header collapse/expand button and (by
   * default) a vertical resize handle at the bottom. State is persisted to
   * localStorage under `${storageKey}:collapsed` and `${storageKey}:height`.
   * Set `resizable: false` to drop the grab handle and let the body grow with
   * its content instead of being height-clamped. Ignored when `bare` is true.
   */
  collapsible?: {
    storageKey: string;
    resizable?: boolean;
    defaultHeight?: number;
    minHeight?: number;
    maxHeight?: number;
  };
  /**
   * Optimistic placeholder cards prepended to the fetched list — e.g. a job
   * that was just submitted but isn't in the server snapshot yet. Any pending
   * task whose `id` later matches a fetched task is dropped automatically.
   */
  pendingTasks?: BaseTask[];
  /**
   * External refresh signal. When this number changes, the list refetches
   * immediately instead of waiting for the next poll. Defaults to 0.
   */
  refreshSignal?: number;
  /**
   * 마키(영역 드래그) 선택을 켠다. `marqueeSelectedTaskIds`(현재 선택된 task id 집합)와
   * `onMarqueeChange`(새 집합)를 함께 넘기면 카드 그리드/목록을 DragSelect 로 감싸고
   * 각 카드에 식별자를 부여한다. `marqueeBoundaryRef` 로 드래그 시작 영역(자료 관리 패널
   * 등)을 지정할 수 있다. 셋 다 없으면 기존 동작(체크박스 선택만).
   */
  marqueeSelectedTaskIds?: Set<string>;
  onMarqueeChange?: (next: Set<string>) => void;
  marqueeBoundaryRef?: React.RefObject<HTMLElement | null>;
  /**
   * Optional per-domain extra actions rendered next to each card's 상세보기
   * button (grid + list layouts). Receives the task; return null to skip a
   * given task. Additive — domains that don't pass it are unaffected.
   */
  renderTaskActions?: (task: BaseTask) => ReactNode;
}
