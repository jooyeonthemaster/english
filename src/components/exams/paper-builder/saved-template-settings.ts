import { DEFAULT_SHOW_PASSAGE_TITLE } from "./constants";
import {
  DEFAULT_PAPER_COVER,
  type Density,
  type PaperCover,
  type PaperCoverTemplate,
  type PaperSize,
  type PaperTemplate,
  type PassageStyle,
} from "./types";

export const SAVED_TEMPLATE_SETTINGS_STORAGE_KEY =
  "smoat.examPaperBuilder.savedTemplateSettings.v1";

export type SavedTemplateSettings = {
  template: PaperTemplate;
  academyLogoDataUrl: string | null;
  paperSize: PaperSize;
  columns: 1 | 2;
  density: Density;
  passageStyle: PassageStyle;
  showPassageTitle: boolean;
  showQuestionMeta: boolean;
  autoPointTotal: number | null;
  cover: PaperCover;
  savedAt: string;
};

export const DEFAULT_TEMPLATE_SETTINGS: SavedTemplateSettings = {
  template: "clean",
  academyLogoDataUrl: null,
  paperSize: "A4",
  columns: 2,
  density: "comfortable",
  passageStyle: "plain",
  showPassageTitle: DEFAULT_SHOW_PASSAGE_TITLE,
  showQuestionMeta: false,
  autoPointTotal: null,
  cover: DEFAULT_PAPER_COVER,
  savedAt: "",
};

function asPaperTemplate(value: unknown): PaperTemplate {
  const templates: PaperTemplate[] = [
    "clean",
    "mock",
    "worksheet",
    "minimal",
    "academy",
    "modern",
    "classic",
    "colorband",
  ];
  return templates.includes(value as PaperTemplate)
    ? (value as PaperTemplate)
    : DEFAULT_TEMPLATE_SETTINGS.template;
}

function asPaperSize(value: unknown): PaperSize {
  return value === "B4" ? "B4" : DEFAULT_TEMPLATE_SETTINGS.paperSize;
}

function asDensity(value: unknown): Density {
  return value === "compact" ? "compact" : DEFAULT_TEMPLATE_SETTINGS.density;
}

function asPassageStyle(value: unknown): PassageStyle {
  void value;
  return "plain";
}

function asAutoPointTotal(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 1) return null;
  return Math.min(999, Math.max(1, Math.round(numeric)));
}

function asPaperCoverTemplate(value: unknown): PaperCoverTemplate {
  return value === "band" || value === "minimal" || value === "classic"
    ? value
    : DEFAULT_PAPER_COVER.template;
}

export function normalizePaperCover(input: unknown): PaperCover {
  const candidate =
    input && typeof input === "object" ? (input as Partial<PaperCover>) : {};
  return {
    enabled:
      typeof candidate.enabled === "boolean"
        ? candidate.enabled
        : DEFAULT_PAPER_COVER.enabled,
    template: asPaperCoverTemplate(candidate.template),
    eyebrow: typeof candidate.eyebrow === "string" ? candidate.eyebrow : "",
    footnote: typeof candidate.footnote === "string" ? candidate.footnote : "",
    showLogo:
      typeof candidate.showLogo === "boolean"
        ? candidate.showLogo
        : DEFAULT_PAPER_COVER.showLogo,
    showInfo:
      typeof candidate.showInfo === "boolean"
        ? candidate.showInfo
        : DEFAULT_PAPER_COVER.showInfo,
  };
}

export function normalizeSavedTemplateSettings(input: unknown): SavedTemplateSettings {
  const candidate = input && typeof input === "object"
    ? (input as Partial<SavedTemplateSettings>)
    : {};
  return {
    template: asPaperTemplate(candidate.template),
    academyLogoDataUrl:
      typeof candidate.academyLogoDataUrl === "string"
        ? candidate.academyLogoDataUrl
        : null,
    paperSize: asPaperSize(candidate.paperSize),
    columns: candidate.columns === 1 ? 1 : 2,
    density: asDensity(candidate.density),
    passageStyle: asPassageStyle(candidate.passageStyle),
    showPassageTitle:
      typeof candidate.showPassageTitle === "boolean"
        ? candidate.showPassageTitle
        : DEFAULT_TEMPLATE_SETTINGS.showPassageTitle,
    showQuestionMeta:
      typeof candidate.showQuestionMeta === "boolean"
        ? candidate.showQuestionMeta
        : DEFAULT_TEMPLATE_SETTINGS.showQuestionMeta,
    autoPointTotal: asAutoPointTotal(candidate.autoPointTotal),
    cover: normalizePaperCover(candidate.cover),
    savedAt: typeof candidate.savedAt === "string" ? candidate.savedAt : "",
  };
}

export function readSavedTemplateSettings(): SavedTemplateSettings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SAVED_TEMPLATE_SETTINGS_STORAGE_KEY);
    if (!raw) return null;
    return normalizeSavedTemplateSettings(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeSavedTemplateSettings(
  settings: SavedTemplateSettings,
): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(
      SAVED_TEMPLATE_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        ...normalizeSavedTemplateSettings(settings),
        savedAt: new Date().toISOString(),
      }),
    );
    return true;
  } catch {
    return false;
  }
}

export function clearSavedTemplateSettings() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SAVED_TEMPLATE_SETTINGS_STORAGE_KEY);
}
