/**
 * 학습자료 편집기(AnalysisReportEditor)의 localStorage 상수·접근자 모음.
 *
 * [E21/U4 — 26-08-17] `docs/class-studio-spec.md` §3.10.21 E21-3 「전역 오염 차단」이 요구한
 * **네임스페이스 접근자**를 additive 로 얹었다. 학습지 조판 표면은 이 편집기를 임베드해
 * 마운트하므로, 임베드에서 만진 UI 선호값(패널 폭 3키·패널 섹션 순서/접힘 2키·기본 템플릿
 * 적용 기록)이 독립 라우트(지문 스튜디오·학습지 생성 모달)로 **영구 누수**하면 안 된다.
 *
 * 설계 원칙 2가지 — 어기면 기존 소비처 5곳이 즉시 회귀한다:
 *  1) **ns 미전달 = 현행 키 그대로.** 아래 접근자들은 ns 가 없으면 기존 상수 객체를 그대로
 *     돌려준다(문자열을 재조립하지 않는다). 상수 값이 미래에 바뀌어도 두 경로가 갈라질 수 없다.
 *  2) **기존 export 는 하나도 지우지 않는다.** `use-panel-widths.ts` · `panel-section.tsx` ·
 *     `AnalysisReportEditor.tsx` 가 지금 그대로 컴파일·동작해야 한다.
 */
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

// ─────────────────────────────────────────────────────────────────────────────
// [E21/U4] 임베드 네임스페이스 접근자 — §3.10.21 E21-3
// ─────────────────────────────────────────────────────────────────────────────

/** 편집기 localStorage 키의 공통 접두. 위 상수들과 문자열이 반드시 일치해야 한다. */
const EDITOR_STORAGE_PREFIX = "smoat.analysisReportEditor";

/**
 * ns → 키 중간 세그먼트(`"sheetCompose."`). 빈 문자열/공백은 **없는 것으로 취급**해
 * 현행 키로 되돌린다(호출부가 `embed?.storageNamespace` 를 그대로 넘겨도 안전).
 * 키 구분자인 `.` 를 ns 가 품으면 세그먼트 경계가 깨져 다른 ns 와 충돌할 수 있으므로
 * `[A-Za-z0-9_-]` 밖 문자는 전부 `_` 로 접는다(docKey 문자셋 규약과 같은 계열 — §3.10.21 E21-1).
 */
function nsSegment(ns?: string): string {
  const trimmed = (ns ?? "").trim();
  if (!trimmed) return "";
  return `${trimmed.replace(/[^A-Za-z0-9_-]/g, "_")}.`;
}

/**
 * 좌(페이지)·우(편집)·활동 패널 폭 3키. ns 없으면 **현행 상수 객체 그대로**,
 * 있으면 `smoat.analysisReportEditor.{ns}.railWidth.v1` 형태.
 * 임베드(조판 표면)에서 좁게 줄인 폭이 지문 스튜디오 편집기로 새는 것을 막는 유일한 관문이다.
 */
export function reportEditorWidthKeys(ns?: string): { rail: string; panel: string; activity: string } {
  const seg = nsSegment(ns);
  if (!seg) {
    return {
      rail: RAIL_WIDTH_STORAGE_KEY,
      panel: PANEL_WIDTH_STORAGE_KEY,
      activity: ACTIVITY_WIDTH_STORAGE_KEY,
    };
  }
  return {
    rail: `${EDITOR_STORAGE_PREFIX}.${seg}railWidth.v1`,
    panel: `${EDITOR_STORAGE_PREFIX}.${seg}panelWidth.v1`,
    activity: `${EDITOR_STORAGE_PREFIX}.${seg}activityWidth.v1`,
  };
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

/**
 * [E21/U4] 속성 패널 섹션 순서/접힘 2키. ns 없으면 현행 상수 그대로.
 * 조판 표면은 폭이 좁아 접힘 선호가 독립 라우트와 전혀 다르게 굳는데, 같은 키를 공유하면
 * 임베드에서 접은 카드가 지문 스튜디오에서도 접힌 채로 남는다.
 */
export function reportEditorPanelSectionKeys(ns?: string): { order: string; collapsed: string } {
  const seg = nsSegment(ns);
  if (!seg) {
    return {
      order: PANEL_SECTION_ORDER_STORAGE_KEY,
      collapsed: PANEL_SECTION_COLLAPSED_STORAGE_KEY,
    };
  }
  return {
    order: `${EDITOR_STORAGE_PREFIX}.${seg}propertiesPanel.sectionOrder.v1`,
    collapsed: `${EDITOR_STORAGE_PREFIX}.${seg}propertiesPanel.sectionCollapsed.v1`,
  };
}

// ns 는 전부 **옵셔널 후행 인자**다(미전달 = 현행 키, 파일 상단 원칙 1).
//
// [E21/U4 정정 — 26-08-18] 이전 주석은 "panel-section 이 이 함수를 lazy initializer 로 직접
// 넘기므로 ns 는 자연히 undefined" 라고 적혀 있었으나, 그건 **격리 미배선 상태를 서술한
// 낡은 문장**이었고 지금은 사실이 아니다. 현재 배선(실측):
//   `panel-section.tsx:124,140` ns prop → `:153-158` **화살표로 감싼** lazy initializer
//   (`() => readStoredPanelSectionOrder(ns)`) → `:167-173` 쓰기 effect 2개가
//   `writeStoredPanelSectionOrder(sectionOrder, ns)` / `writeStoredCollapsedPanelSections(...)`.
//   상류는 `properties-panel.tsx:148 storageNamespace` → `:248`·`:289` 의 SortablePanelStack
//   **두 곳 모두** `ns=`, 그 상류는 `AnalysisReportEditor.tsx:645 storageNs` → `:2170-2173`.
// 함정 주의: `useState(readStoredPanelSectionOrder)` 처럼 **함수 참조를 그대로** 넘기면
// React 가 initializer 를 인자 없이 호출해 ns 가 조용히 유실된다(오염이 되살아나되 타입
// 에러는 안 난다). 반드시 화살표로 감싸 인자를 명시할 것.
export function readStoredPanelSectionOrder(ns?: string): PanelSectionId[] {
  if (typeof window === "undefined") return [...PANEL_SECTION_IDS];
  try {
    return normalizePanelSectionOrder(
      JSON.parse(window.localStorage.getItem(reportEditorPanelSectionKeys(ns).order) || ""),
    );
  } catch {
    return [...PANEL_SECTION_IDS];
  }
}

export function readStoredCollapsedPanelSections(ns?: string): PanelSectionId[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(reportEditorPanelSectionKeys(ns).collapsed) || "",
    );
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isPanelSectionId);
  } catch {
    return [];
  }
}

/**
 * [E21/U4] 쓰기 짝. 원래 쓰기는 panel-section 이 `PANEL_SECTION_*_STORAGE_KEY` 를
 * **인라인 setItem** 하던 자리였다 — 그 상태에서는 읽기만 ns 를 타고 쓰기는 전역 키로 나가서
 * 격리가 반쪽이 된다(임베드에서 접은 카드가 독립 라우트 키를 덮어씀). 현재는
 * `panel-section.tsx:167-173` 이 이 두 함수로 교체되어 읽기/쓰기 키 규약이 이 파일 한 곳이다.
 * (실패 무시 정책은 기존 호출부와 동일 — 편의 설정이라 저장 실패로 UI 를 막지 않는다.)
 */
export function writeStoredPanelSectionOrder(order: PanelSectionId[], ns?: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(reportEditorPanelSectionKeys(ns).order, JSON.stringify(order));
  } catch {
    // Convenience setting only.
  }
}

export function writeStoredCollapsedPanelSections(ids: PanelSectionId[], ns?: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(reportEditorPanelSectionKeys(ns).collapsed, JSON.stringify(ids));
  } catch {
    // Convenience setting only.
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

/**
 * [E21/U4] 기본 템플릿 「1회 적용」 기록 키. ns 없으면 현행 키 그대로.
 *
 * 이 키를 임베드와 공유하면 안 되는 이유(§3.10.21 E21-3 표 4행) — 값이 **passageId 배열**이고
 * `AnalysisReportEditor.tsx:535-540` 의 1회 적용 effect 가
 *   `if (hasAppliedDefaultFor(passageId)) return;` → `markAppliedDefaultFor(passageId)` 순서라,
 * 기본 템플릿이 **없어도 '열어 봤다'는 기록만 남긴다**(:533-534 주석의 의도된 동작).
 * 즉 학습지 조판 표면이 어떤 지문을 먼저 부착해 열기만 해도 그 passageId 가 배열에 들어가고,
 * 나중에 사용자가 독립 라우트(지문 스튜디오·학습지 생성 모달)에서 그 지문을 처음 열 때
 * 기본 템플릿이 **영영 자동 적용되지 않는다**. 조판은 자기 ns 배열에만 기록해야 한다.
 */
export function reportEditorDefaultAppliedKey(ns?: string): string {
  const seg = nsSegment(ns);
  return seg ? `${EDITOR_STORAGE_PREFIX}.${seg}defaultApplied.v1` : REPORT_SETTINGS_DEFAULT_APPLIED_KEY;
}

export function hasAppliedDefaultFor(passageId: string, ns?: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    const arr = JSON.parse(window.localStorage.getItem(reportEditorDefaultAppliedKey(ns)) || "[]");
    return Array.isArray(arr) && arr.includes(passageId);
  } catch {
    return false;
  }
}

export function markAppliedDefaultFor(passageId: string, ns?: string): void {
  if (typeof window === "undefined") return;
  const key = reportEditorDefaultAppliedKey(ns);
  try {
    const arr = JSON.parse(window.localStorage.getItem(key) || "[]");
    const set = new Set<string>(Array.isArray(arr) ? arr : []);
    set.add(passageId);
    window.localStorage.setItem(key, JSON.stringify([...set]));
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
