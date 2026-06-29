import type { BuilderQuestion } from "../paper-builder/types";
import { formatDateInput } from "../paper-builder/paper-item-utils";
import type { ExamPaperBuilderDraftState } from "../paper-builder/indexeddb-drafts";
import { resolveDropIndicatorPartKey } from "../paper-builder/drop-indicator-dom";
import { DIFFICULTY_RANK, LEFT_PANEL_COLLAPSED_STORAGE_KEY, PANEL_DEFAULT_WIDTHS, PANEL_LIMITS, PANEL_MIN_CENTER, PANEL_TOGGLE_HANDLE_WIDTH, PANEL_WIDTH_STORAGE_KEY, RIGHT_PANEL_COLLAPSED_STORAGE_KEY, THUMBNAILS_COLLAPSED_STORAGE_KEY, THUMBNAILS_WIDTH_DEFAULT, THUMBNAILS_WIDTH_MAX, THUMBNAILS_WIDTH_MIN, THUMBNAILS_WIDTH_STORAGE_KEY } from "./builder-constants";
import type { PanelWidths, QuestionDropInsertion } from "./builder-types";
export function clampNumber(value: number, min: number, max: number) {
  const normalizedMax = Math.max(min, max);
  return Math.min(Math.max(value, min), normalizedMax);
}

export function asAutoPointTotal(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 1) return null;
  return Math.min(999, Math.max(1, Math.round(numeric)));
}

export function hasMeaningfulBuilderDraft(state: ExamPaperBuilderDraftState): boolean {
  return state.dirty || (!state.savedExamId && state.paperItems.length > 0);
}

export function formatBuilderDraftUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "저장 시각 알 수 없음";

  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", // 배포 서버(UTC) SSR에서도 한국시간으로 고정 표시
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function buildDefaultSaveAsTitle(currentTitle: string): string {
  const baseTitle = currentTitle.trim() || `새 시험지 ${formatDateInput(new Date())}`;
  return `${baseTitle} (사본)`;
}

export function toTimestamp(value: Date | string): number {
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export function sortBuilderQuestions(
  questions: BuilderQuestion[],
  sort: string,
): BuilderQuestion[] {
  const sorted = [...questions];
  switch (sort) {
    case "oldest":
      return sorted.sort(
        (a, b) => toTimestamp(a.createdAt) - toTimestamp(b.createdAt),
      );
    case "difficulty_desc":
      return sorted.sort(
        (a, b) =>
          (DIFFICULTY_RANK[b.difficulty] ?? 0) -
          (DIFFICULTY_RANK[a.difficulty] ?? 0),
      );
    case "difficulty_asc":
      return sorted.sort(
        (a, b) =>
          (DIFFICULTY_RANK[a.difficulty] ?? 0) -
          (DIFFICULTY_RANK[b.difficulty] ?? 0),
      );
    case "starred":
      return sorted.sort(
        (a, b) => Number(b.starred) - Number(a.starred),
      );
    case "newest":
    default:
      return sorted.sort(
        (a, b) => toTimestamp(b.createdAt) - toTimestamp(a.createdAt),
      );
  }
}

export function sanitizeStoredPanelWidths(input: unknown): PanelWidths | null {
  if (!input || typeof input !== "object") return null;
  const candidate = input as Partial<Record<keyof PanelWidths, unknown>>;
  if (
    typeof candidate.left !== "number" ||
    typeof candidate.right !== "number"
  ) {
    return null;
  }
  return {
    left: candidate.left,
    right: candidate.right,
  };
}

export function readStoredPanelWidths(): PanelWidths {
  if (typeof window === "undefined") return PANEL_DEFAULT_WIDTHS;
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(PANEL_WIDTH_STORAGE_KEY) || "",
    );
    return sanitizeStoredPanelWidths(parsed) ?? PANEL_DEFAULT_WIDTHS;
  } catch {
    return PANEL_DEFAULT_WIDTHS;
  }
}

export function readStoredRightPanelCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.localStorage.getItem(RIGHT_PANEL_COLLAPSED_STORAGE_KEY) === "true"
  );
}

export function readStoredLeftPanelCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.localStorage.getItem(LEFT_PANEL_COLLAPSED_STORAGE_KEY) === "true"
  );
}

export function clampThumbnailsWidth(width: number): number {
  return Math.min(
    THUMBNAILS_WIDTH_MAX,
    Math.max(THUMBNAILS_WIDTH_MIN, Math.round(width)),
  );
}

export function readStoredThumbnailsWidth(): number {
  if (typeof window === "undefined") return THUMBNAILS_WIDTH_DEFAULT;
  const stored = Number(
    window.localStorage.getItem(THUMBNAILS_WIDTH_STORAGE_KEY),
  );
  if (!Number.isFinite(stored) || stored <= 0) return THUMBNAILS_WIDTH_DEFAULT;
  return clampThumbnailsWidth(stored);
}

export function readStoredThumbnailsCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.localStorage.getItem(THUMBNAILS_COLLAPSED_STORAGE_KEY) === "true"
  );
}

export function clampPanelWidths(
  widths: PanelWidths,
  containerWidth: number,
): PanelWidths {
  const availableWidth = Math.max(
    0,
    containerWidth - PANEL_TOGGLE_HANDLE_WIDTH * 2,
  );
  const maxSideWidth = Math.max(0, availableWidth - PANEL_MIN_CENTER);

  let left = clampNumber(
    widths.left,
    PANEL_LIMITS.left.min,
    Math.min(PANEL_LIMITS.left.max, maxSideWidth - PANEL_LIMITS.right.min),
  );
  let right = clampNumber(
    widths.right,
    PANEL_LIMITS.right.min,
    Math.min(PANEL_LIMITS.right.max, maxSideWidth - left),
  );

  const centerWidth = availableWidth - left - right;
  if (centerWidth < PANEL_MIN_CENTER) {
    const overflow = PANEL_MIN_CENTER - centerWidth;
    if (right > PANEL_LIMITS.right.min) {
      right = Math.max(PANEL_LIMITS.right.min, right - overflow);
    } else {
      left = Math.max(PANEL_LIMITS.left.min, left - overflow);
    }
  }

  return {
    left: Math.round(left),
    right: Math.round(right),
  };
}

export function samePanelWidths(a: PanelWidths, b: PanelWidths) {
  return a.left === b.left && a.right === b.right;
}

export function getQuestionDropInsertion(
  scroller: HTMLElement,
  clientX: number,
  clientY: number,
): QuestionDropInsertion {
  const itemElements = Array.from(
    scroller.querySelectorAll<HTMLElement>("[data-paper-item-id]"),
  ).filter((element) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });

  if (itemElements.length === 0) {
    return { targetLocalId: null, targetPartKey: null, placement: "after" };
  }

  let best: {
    element: HTMLElement;
    rect: DOMRect;
    score: number;
  } | null = null;

  for (const element of itemElements) {
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const horizontalDistance =
      clientX < rect.left
        ? rect.left - clientX
        : clientX > rect.right
          ? clientX - rect.right
          : Math.abs(clientX - centerX) * 0.2;
    const verticalDistance =
      clientY < rect.top
        ? rect.top - clientY
        : clientY > rect.bottom
          ? clientY - rect.bottom
          : Math.abs(clientY - centerY) * 0.2;
    const score = verticalDistance + horizontalDistance * 1.4;

    if (!best || score < best.score) {
      best = { element, rect, score };
    }
  }

  if (!best) {
    return { targetLocalId: null, targetPartKey: null, placement: "after" };
  }

  const targetLocalId = best.element.dataset.paperItemId || null;
  const placement =
    clientY < best.rect.top + best.rect.height / 2 ? "before" : "after";
  const targetPartKey = resolveDropIndicatorPartKey(
    scroller,
    targetLocalId,
    placement,
  );
  return { targetLocalId, targetPartKey, placement };
}
