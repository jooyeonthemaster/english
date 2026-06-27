import type { PaperItem } from "../../types";

export const BLOCK_LABELS: Record<PaperItem["blockType"], string> = {
  question: "문항",
  text: "텍스트",
  section: "섹션",
  divider: "구분선",
  spacer: "여백",
  image: "이미지",
};

export const PANEL_SECTION_ORDER_STORAGE_KEY =
  "smoat.examPaperBuilder.propertiesPanel.sectionOrder.v2";

export const PANEL_SECTION_COLLAPSED_STORAGE_KEY =
  "smoat.examPaperBuilder.propertiesPanel.sectionCollapsed.v1";

export const QUESTION_PREVIEW_HEIGHT_STORAGE_KEY =
  "smoat.examPaperBuilder.propertiesPanel.questionPreviewHeight.v2";

const PANEL_SECTION_IDS = [
  "outline",
  "insert",
  "inspector",
  "shuffle",
] as const;

export const QUESTION_PREVIEW_HEIGHT_MIN = 44;

export const QUESTION_PREVIEW_HEIGHT_DEFAULT = 72;

export const QUESTION_PREVIEW_HEIGHT_MAX_FLOOR = 260;

export type PanelSectionId = (typeof PANEL_SECTION_IDS)[number];

export function isPanelSectionId(value: unknown): value is PanelSectionId {
  return (
    value === "outline" ||
    value === "insert" ||
    value === "inspector" ||
    value === "shuffle"
  );
}

function normalizePanelSectionOrder(input: unknown): PanelSectionId[] {
  if (!Array.isArray(input)) return [...PANEL_SECTION_IDS];
  const seen = new Set<PanelSectionId>();
  const normalized: PanelSectionId[] = [];

  for (const value of input) {
    if (!isPanelSectionId(value) || seen.has(value)) continue;
    seen.add(value);
    normalized.push(value);
  }

  for (const sectionId of PANEL_SECTION_IDS) {
    if (!seen.has(sectionId)) normalized.push(sectionId);
  }

  return normalized;
}

export function readStoredPanelSectionOrder(): PanelSectionId[] {
  if (typeof window === "undefined") return [...PANEL_SECTION_IDS];
  try {
    return normalizePanelSectionOrder(
      JSON.parse(window.localStorage.getItem(PANEL_SECTION_ORDER_STORAGE_KEY) || ""),
    );
  } catch {
    return [...PANEL_SECTION_IDS];
  }
}

export function readStoredCollapsedPanelSections(): PanelSectionId[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(PANEL_SECTION_COLLAPSED_STORAGE_KEY) || "",
    );
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isPanelSectionId);
  } catch {
    return [];
  }
}

export function readStoredQuestionPreviewHeight(): number {
  if (typeof window === "undefined") return QUESTION_PREVIEW_HEIGHT_DEFAULT;
  const stored = Number(window.localStorage.getItem(QUESTION_PREVIEW_HEIGHT_STORAGE_KEY));
  if (!Number.isFinite(stored)) return QUESTION_PREVIEW_HEIGHT_DEFAULT;
  return Math.max(QUESTION_PREVIEW_HEIGHT_MIN, Math.round(stored));
}
