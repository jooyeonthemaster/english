export const STAFF_DISPLAY_TITLES_KEY = "staffDisplayTitles";

type AcademySettings = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseAcademySettings(raw: string | null | undefined): AcademySettings {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function normalizeStaffDisplayTitle(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function getDefaultStaffDisplayTitle(role: string | null | undefined): string {
  return role === "DIRECTOR" ? "원장" : "강사";
}

export function getStaffDisplayTitle(
  settings: AcademySettings | string | null | undefined,
  staffId: string,
  role: string | null | undefined,
): string {
  const parsed = typeof settings === "string" ? parseAcademySettings(settings) : settings ?? {};
  const titles = parsed[STAFF_DISPLAY_TITLES_KEY];

  if (isRecord(titles)) {
    const saved = titles[staffId];
    if (typeof saved === "string") {
      const normalized = normalizeStaffDisplayTitle(saved);
      if (normalized) return normalized;
    }
  }

  return getDefaultStaffDisplayTitle(role);
}

export function setStaffDisplayTitleInSettings(
  settings: AcademySettings,
  staffId: string,
  displayTitle: string,
): AcademySettings {
  const normalized = normalizeStaffDisplayTitle(displayTitle);
  const existingTitles = settings[STAFF_DISPLAY_TITLES_KEY];
  const nextTitles: Record<string, string> = isRecord(existingTitles)
    ? Object.fromEntries(
        Object.entries(existingTitles).filter((entry): entry is [string, string] => {
          const [, value] = entry;
          return typeof value === "string" && normalizeStaffDisplayTitle(value).length > 0;
        }),
      )
    : {};

  if (normalized) {
    nextTitles[staffId] = normalized;
  } else {
    delete nextTitles[staffId];
  }

  const nextSettings: AcademySettings = { ...settings };
  if (Object.keys(nextTitles).length > 0) {
    nextSettings[STAFF_DISPLAY_TITLES_KEY] = nextTitles;
  } else {
    delete nextSettings[STAFF_DISPLAY_TITLES_KEY];
  }

  return nextSettings;
}
