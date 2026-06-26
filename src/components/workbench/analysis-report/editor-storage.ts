import type { ReportThemeId, ReportCover } from "@/lib/passage-report/analysis-report/schema";

// 여백(spacer) 블록의 최소 세로 높이(mm). 너무 얇아져 잡기 힘든 것을 방지.
export const SPACER_MIN_MM = 10;

export const DESIGN_TEMPLATE_LABELS: Record<ReportThemeId, string> = {
  "black-white": "블랙.화이트",
  "veritas-navy": "네이비 · 골드",
  "scholar-ink": "잉크 · 버건디",
  "fresh-teal": "틸 · 슬레이트",
};

// ── 좌(페이지)·우(편집) 패널 폭 — exam paper builder 와 동일하게 드래그 리사이즈 + localStorage 보존 ──
export const RAIL_WIDTH_STORAGE_KEY = "smoat.analysisReportEditor.railWidth.v1";
export const PANEL_WIDTH_STORAGE_KEY = "smoat.analysisReportEditor.panelWidth.v1";
export const ACTIVITY_WIDTH_STORAGE_KEY = "smoat.analysisReportEditor.activityWidth.v1";
export const RAIL_WIDTH_DEFAULT = 112;
export const RAIL_WIDTH_MIN = 88;
export const RAIL_WIDTH_MAX = 220;
export const PANEL_WIDTH_DEFAULT = 304;
export const PANEL_WIDTH_MIN = 260;
export const PANEL_WIDTH_MAX = 460;
export const ACTIVITY_WIDTH_DEFAULT = 264;
export const ACTIVITY_WIDTH_MIN = 220;
export const ACTIVITY_WIDTH_MAX = 420;

export const clampRailWidth = (w: number) => Math.min(RAIL_WIDTH_MAX, Math.max(RAIL_WIDTH_MIN, Math.round(w)));
export const clampPanelWidth = (w: number) => Math.min(PANEL_WIDTH_MAX, Math.max(PANEL_WIDTH_MIN, Math.round(w)));
export const clampActivityWidth = (w: number) => Math.min(ACTIVITY_WIDTH_MAX, Math.max(ACTIVITY_WIDTH_MIN, Math.round(w)));

export function readStoredWidth(key: string, fallback: number, clamp: (n: number) => number): number {
  if (typeof window === "undefined") return fallback;
  const raw = Number(window.localStorage.getItem(key));
  return Number.isFinite(raw) && raw > 0 ? clamp(raw) : fallback;
}

export const PANEL_SECTION_ORDER_STORAGE_KEY =
  "smoat.analysisReportEditor.propertiesPanel.sectionOrder.v1";
export const PANEL_SECTION_COLLAPSED_STORAGE_KEY =
  "smoat.analysisReportEditor.propertiesPanel.sectionCollapsed.v1";
const PANEL_SECTION_IDS = [
  "cover",
  "logo",
  "english-page",
  "block-edit",
  "cover-edit",
  "guide",
  "selected",
  "activity-edit",
  "vocab-test-edit",
  "spacer-height",
  "format",
  "table-cols",
  "worksheet",
  "layout",
  "order",
  "section",
  "custom",
  "delete",
  "insert",
  "theme",
  "saved-settings",
] as const;

export type PanelSectionId = (typeof PANEL_SECTION_IDS)[number];

export function isPanelSectionId(value: unknown): value is PanelSectionId {
  return typeof value === "string" && (PANEL_SECTION_IDS as readonly string[]).includes(value);
}

export function normalizePanelSectionOrder(input: unknown): PanelSectionId[] {
  if (!Array.isArray(input)) return [...PANEL_SECTION_IDS];
  const seen = new Set<PanelSectionId>();
  const normalized: PanelSectionId[] = [];

  for (const value of input) {
    if (!isPanelSectionId(value) || seen.has(value)) continue;
    seen.add(value);
    normalized.push(value);
  }

  for (const sectionId of PANEL_SECTION_IDS) {
    if (seen.has(sectionId)) continue;
    const canonicalIndex = PANEL_SECTION_IDS.indexOf(sectionId);
    const anchorId = [...PANEL_SECTION_IDS]
      .slice(0, canonicalIndex)
      .reverse()
      .find((candidate) => seen.has(candidate));
    const anchorIndex = anchorId ? normalized.indexOf(anchorId) : -1;
    normalized.splice(anchorIndex + 1, 0, sectionId);
    seen.add(sectionId);
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

// ─── 학습자료 설정 템플릿 (표지·로고·학원명·영어원문·디자인을 통째로 저장/적용) ───
// v1: 단일 슬롯 객체였음. v2: 이름 붙인 여러 템플릿 배열 — 저장해 두고 나중에 골라 적용.
// 첫 읽기 때 v1 단일 슬롯이 있으면 v2 배열로 자동 이관한다.
const REPORT_SETTINGS_STORAGE_KEY = "smoat.analysisReportEditor.materialSettings.v1";
const REPORT_SETTINGS_LIST_STORAGE_KEY = "smoat.analysisReportEditor.materialSettings.v2";

type ReportSettingsPayload = {
  brand?: string;
  themeId?: ReportThemeId;
  englishOnlyPage?: boolean;
  cover?: ReportCover;
};

export type SavedReportSettings = ReportSettingsPayload & {
  id: string;
  name: string;
  savedAt: string;
  isDefault?: boolean;
};

function newReportSettingsId(): string {
  return globalThis.crypto && "randomUUID" in globalThis.crypto
    ? globalThis.crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function writeSavedReportSettingsList(list: SavedReportSettings[]): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(REPORT_SETTINGS_LIST_STORAGE_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export function readSavedReportSettingsList(): SavedReportSettings[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(REPORT_SETTINGS_LIST_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (entry): entry is SavedReportSettings => !!entry && typeof entry === "object",
        );
      }
    }
  } catch {
    /* fall through to legacy migration */
  }
  // v1 단일 슬롯 → v2 배열 자동 이관
  try {
    const legacy = JSON.parse(window.localStorage.getItem(REPORT_SETTINGS_STORAGE_KEY) || "");
    if (legacy && typeof legacy === "object") {
      const migrated: SavedReportSettings[] = [
        {
          id: newReportSettingsId(),
          name: "기본 설정",
          brand: legacy.brand,
          themeId: legacy.themeId,
          englishOnlyPage: legacy.englishOnlyPage,
          cover: legacy.cover,
          savedAt: legacy.savedAt || new Date().toISOString(),
        },
      ];
      writeSavedReportSettingsList(migrated);
      window.localStorage.removeItem(REPORT_SETTINGS_STORAGE_KEY);
      return migrated;
    }
  } catch {
    /* ignore */
  }
  return [];
}

export function addSavedReportSettings(
  payload: ReportSettingsPayload,
  name: string,
): SavedReportSettings[] {
  const list = readSavedReportSettingsList();
  const cleanName = name.trim() || `설정 ${list.length + 1}`;
  const entry: SavedReportSettings = {
    id: newReportSettingsId(),
    name: cleanName,
    ...payload,
    savedAt: new Date().toISOString(),
  };
  // 같은 이름이면 덮어쓰기 — 동일 이름 템플릿이 난립하지 않게 한다.
  const next = [...list.filter((s) => s.name !== cleanName), entry];
  writeSavedReportSettingsList(next);
  return next;
}

export function deleteSavedReportSettings(id: string): SavedReportSettings[] {
  const next = readSavedReportSettingsList().filter((s) => s.id !== id);
  writeSavedReportSettingsList(next);
  return next;
}

export function persistAppliedReportSettings(entry: SavedReportSettings): SavedReportSettings[] {
  const list = readSavedReportSettingsList();
  const applied: SavedReportSettings = {
    ...entry,
    savedAt: new Date().toISOString(),
  };
  const exists = list.some((s) => s.id === entry.id);
  const next = exists
    ? list.map((s) => (s.id === entry.id ? { ...applied, isDefault: s.isDefault } : s))
    : [...list.filter((s) => s.name !== entry.name), applied];
  writeSavedReportSettingsList(next);
  return next;
}

// 기본 템플릿 — 새 보고서를 처음 열 때 자동 적용할 한 개. 한 번에 하나만 지정된다.
const REPORT_SETTINGS_DEFAULT_APPLIED_KEY = "smoat.analysisReportEditor.defaultApplied.v1";

export function toggleDefaultReportSettings(id: string): SavedReportSettings[] {
  const list = readSavedReportSettingsList();
  const willEnable = !list.find((s) => s.id === id)?.isDefault;
  const next = list.map((s) => ({ ...s, isDefault: willEnable && s.id === id }));
  writeSavedReportSettingsList(next);
  return next;
}

export function getDefaultReportSettings(): SavedReportSettings | null {
  return readSavedReportSettingsList().find((s) => s.isDefault) ?? null;
}

export function hasAppliedDefaultFor(passageId: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    const arr = JSON.parse(window.localStorage.getItem(REPORT_SETTINGS_DEFAULT_APPLIED_KEY) || "[]");
    return Array.isArray(arr) && arr.includes(passageId);
  } catch {
    return false;
  }
}

export function markAppliedDefaultFor(passageId: string): void {
  if (typeof window === "undefined") return;
  try {
    const arr = JSON.parse(window.localStorage.getItem(REPORT_SETTINGS_DEFAULT_APPLIED_KEY) || "[]");
    const set = new Set<string>(Array.isArray(arr) ? arr : []);
    set.add(passageId);
    window.localStorage.setItem(REPORT_SETTINGS_DEFAULT_APPLIED_KEY, JSON.stringify([...set]));
  } catch {
    /* ignore */
  }
}

export const COVER_DEFAULTS: ReportCover = {
  enabled: false,
  templateId: "classic-center",
  showLogo: true,
  logoAlign: "center",
  logoHeightMm: 14,
  showMeta: false,
};
