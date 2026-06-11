"use client";

import { createPortal } from "react-dom";
import NextImage from "next/image";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  BookImage,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Eye,
  EyeOff,
  FileQuestion,
  FileText,
  GripVertical,
  ImagePlus,
  Italic,
  Languages,
  Loader2,
  Minus,
  Plus,
  Printer,
  Redo2,
  RotateCcw,
  Save,
  Settings,
  Star,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import {
  Children,
  cloneElement,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  isValidElement,
  memo,
  type ReactElement,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";

import {
  PreviewZoomControls,
  PREVIEW_ZOOM_MAX,
  PREVIEW_ZOOM_MIN,
  PREVIEW_ZOOM_STEP,
} from "@/components/exams/exam-paper-builder-client-parts/preview-zoom-controls";
import { usePaperItemDrag } from "@/components/exams/paper-builder/components/a4-paper-page-parts/use-paper-item-drag";
import { REPORT_THEMES } from "@/lib/passage-report/analysis-report/design-tokens";
import { cn } from "@/lib/utils";
import {
  COVER_TEMPLATE_LABELS,
  NUMBERED_SECTION_LABELS,
  coverTemplateIdSchema,
  reportThemeIdSchema,
  type AnalysisReport,
  type AnalysisSection,
  type BlockMeta,
  type CoverTemplateId,
  type CustomBlock,
  type ReportCover,
  type ReportMeta,
  type ReportThemeId,
  type VocabTestLayout,
  type VocabTestMode,
} from "@/lib/passage-report/analysis-report/schema";
import { worksheetAnswersAreHidden } from "@/lib/passage-report/analysis-report/worksheet-surface";

import {
  ReportPages,
  ReportThumbnailSheet,
  enumerateItems,
  type ItemDescriptor,
  type DropPlacement,
  type ReportEdit,
} from "./report-pages";
import { TABLE_COLUMNS, reportFlowItems, type FlowItem } from "./report-sections";
import { CoverPreview } from "./cover-templates";
import {
  applyBlockOrder,
  blankExamRow,
  blankGrammarRow,
  blankVocabRow,
  deleteItem,
  deleteSection,
  hideOrDeleteIds,
  moveIdBy,
  newCustomBlockId,
  reorderIds,
  setBlockMeta,
  setTableColWidths,
  setCustomBlock,
  setMeta,
  setSection,
  setVocabularyTestLayout,
  setVocabularyTestMode,
  setVocabularyTestOnly,
  toggleTableCol,
} from "./editor-mutations";
import { ANALYSIS_REPORT_EDIT_CSS } from "./report-edit-styles";

// 여백(spacer) 블록의 최소 세로 높이(mm). 너무 얇아져 잡기 힘든 것을 방지.
const SPACER_MIN_MM = 10;

const DESIGN_TEMPLATE_LABELS: Record<ReportThemeId, string> = {
  "black-white": "블랙.화이트",
  "veritas-navy": "네이비 · 골드",
  "scholar-ink": "잉크 · 버건디",
  "fresh-teal": "틸 · 슬레이트",
};

const REPORT_A4_WIDTH_PX = Math.round((210 * 96) / 25.4);
const REPORT_A4_HEIGHT_PX = Math.round((297 * 96) / 25.4);
const REPORT_PAGE_GAP_PX = Math.round((9 * 96) / 25.4);
const LOGO_FILE_MAX_BYTES = 1.5 * 1024 * 1024;

// ── 좌(페이지)·우(편집) 패널 폭 — exam paper builder 와 동일하게 드래그 리사이즈 + localStorage 보존 ──
const RAIL_WIDTH_STORAGE_KEY = "smoat.analysisReportEditor.railWidth.v1";
const PANEL_WIDTH_STORAGE_KEY = "smoat.analysisReportEditor.panelWidth.v1";
const RAIL_WIDTH_DEFAULT = 112;
const RAIL_WIDTH_MIN = 88;
const RAIL_WIDTH_MAX = 220;
const PANEL_WIDTH_DEFAULT = 304;
const PANEL_WIDTH_MIN = 260;
const PANEL_WIDTH_MAX = 460;

const clampRailWidth = (w: number) => Math.min(RAIL_WIDTH_MAX, Math.max(RAIL_WIDTH_MIN, Math.round(w)));
const clampPanelWidth = (w: number) => Math.min(PANEL_WIDTH_MAX, Math.max(PANEL_WIDTH_MIN, Math.round(w)));

function readStoredWidth(key: string, fallback: number, clamp: (n: number) => number): number {
  if (typeof window === "undefined") return fallback;
  const raw = Number(window.localStorage.getItem(key));
  return Number.isFinite(raw) && raw > 0 ? clamp(raw) : fallback;
}

const PANEL_SECTION_ORDER_STORAGE_KEY =
  "smoat.analysisReportEditor.propertiesPanel.sectionOrder.v1";
const PANEL_SECTION_COLLAPSED_STORAGE_KEY =
  "smoat.analysisReportEditor.propertiesPanel.sectionCollapsed.v1";
const PANEL_SECTION_IDS = [
  "cover",
  "logo",
  "english-page",
  "block-edit",
  "cover-edit",
  "guide",
  "selected",
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

type PanelSectionId = (typeof PANEL_SECTION_IDS)[number];

function isPanelSectionId(value: unknown): value is PanelSectionId {
  return typeof value === "string" && (PANEL_SECTION_IDS as readonly string[]).includes(value);
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

function readStoredPanelSectionOrder(): PanelSectionId[] {
  if (typeof window === "undefined") return [...PANEL_SECTION_IDS];
  try {
    return normalizePanelSectionOrder(
      JSON.parse(window.localStorage.getItem(PANEL_SECTION_ORDER_STORAGE_KEY) || ""),
    );
  } catch {
    return [...PANEL_SECTION_IDS];
  }
}

function readStoredCollapsedPanelSections(): PanelSectionId[] {
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

type SavedReportSettings = ReportSettingsPayload & {
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

function writeSavedReportSettingsList(list: SavedReportSettings[]): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(REPORT_SETTINGS_LIST_STORAGE_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

function readSavedReportSettingsList(): SavedReportSettings[] {
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

function addSavedReportSettings(
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

function deleteSavedReportSettings(id: string): SavedReportSettings[] {
  const next = readSavedReportSettingsList().filter((s) => s.id !== id);
  writeSavedReportSettingsList(next);
  return next;
}

function persistAppliedReportSettings(entry: SavedReportSettings): SavedReportSettings[] {
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

function toggleDefaultReportSettings(id: string): SavedReportSettings[] {
  const list = readSavedReportSettingsList();
  const willEnable = !list.find((s) => s.id === id)?.isDefault;
  const next = list.map((s) => ({ ...s, isDefault: willEnable && s.id === id }));
  writeSavedReportSettingsList(next);
  return next;
}

function getDefaultReportSettings(): SavedReportSettings | null {
  return readSavedReportSettingsList().find((s) => s.isDefault) ?? null;
}

function hasAppliedDefaultFor(passageId: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    const arr = JSON.parse(window.localStorage.getItem(REPORT_SETTINGS_DEFAULT_APPLIED_KEY) || "[]");
    return Array.isArray(arr) && arr.includes(passageId);
  } catch {
    return false;
  }
}

function markAppliedDefaultFor(passageId: string): void {
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

/**
 * 설정 템플릿 팝오버 — 학습자료 설정 헤더(닫기 X 버튼 왼쪽)의 저장 아이콘 버튼.
 * 클릭하면 현재 설정 저장 / 저장된 템플릿 골라 적용·삭제 / 현재 설정 초기화 기능이
 * 작은 팝오버로 펼쳐진다.
 */
function SettingsTemplatePopover({
  onSave,
  onApply,
  onDelete,
  onReset,
}: {
  onSave: (name: string) => SavedReportSettings[];
  onApply: (entry: SavedReportSettings) => SavedReportSettings[];
  onDelete: (id: string) => SavedReportSettings[];
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [savedTemplates, setSavedTemplates] = useState<SavedReportSettings[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [notice, setNotice] = useState("");
  // 팝오버는 패널의 overflow-hidden 에 잘리지 않도록 body 로 포털 + fixed 배치한다.
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const dragIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // 버튼 위치 기준으로 팝오버 좌표(우측 정렬) 계산
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      setCoords({ top: rect.bottom + 6, right: Math.max(8, window.innerWidth - rect.right) });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  // 팝오버를 열 때마다 최신 목록을 다시 읽는다(다른 보고서에서 저장한 것 반영).
  useEffect(() => {
    if (open) setSavedTemplates(readSavedReportSettingsList());
  }, [open]);

  // 바깥 클릭 / ESC 로 닫기 (트리거 버튼·포털된 팝오버 둘 다 '안쪽'으로 친다)
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 1800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const handleSave = () => {
    const next = onSave(templateName);
    setSavedTemplates(next);
    setTemplateName("");
    setNotice("현재 설정을 템플릿으로 저장했어요.");
  };

  // 손잡이 드래그로 템플릿 순서 변경 — 새 순서를 그대로 저장한다.
  const handleReorder = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return;
    setSavedTemplates((prev) => {
      if (from >= prev.length || to >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      writeSavedReportSettingsList(next);
      return next;
    });
  };

  return (
    <div className="shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="설정 템플릿"
        aria-label="설정 템플릿"
        aria-expanded={open}
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-md border transition-colors",
          open
            ? "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100"
            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800",
        )}
      >
        <Save className="h-4 w-4" />
      </button>

      {open && coords
        ? createPortal(
        <div
          ref={popoverRef}
          style={{ position: "fixed", top: coords.top, right: coords.right }}
          className="z-[60] w-72 rounded-lg border border-slate-200 bg-white p-3 shadow-xl">
          <p className="text-[12px] font-black text-slate-800">설정 템플릿</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
            지금의 <b className="text-slate-600">표지·로고·학원명·영어 원문·디자인</b> 설정을 이름을 붙여 저장해 두고, 나중에 골라서 적용할 수 있어요. <Star className="inline h-3 w-3 -mt-0.5 fill-amber-400 text-amber-500" /> 별표로 지정한 <b className="text-slate-600">기본 템플릿</b>은 새 보고서를 열 때 자동 적용돼요.
          </p>

          {/* 새 템플릿 저장 — 이름 입력 + 저장 */}
          <div className="mt-2 flex items-center gap-1.5">
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                handleSave();
              }}
              placeholder="템플릿 이름 (예: 기본형, A반용)"
              className="h-8 min-w-0 flex-1 rounded-md border border-slate-200 px-2 text-[11.5px] text-slate-700 placeholder:text-slate-300 focus:border-slate-400 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-md border border-slate-200 px-2.5 text-[11.5px] font-semibold text-slate-600 hover:bg-slate-50"
            >
              <Save className="h-3.5 w-3.5" /> 저장
            </button>
          </div>

          {/* 저장된 템플릿 목록 — 이름을 클릭하면 바로 적용 / 손잡이로 순서 변경 / 삭제 */}
          {savedTemplates.length === 0 ? (
            <p className="mt-2 rounded-md border border-dashed border-slate-200 px-2 py-2.5 text-center text-[10.5px] text-slate-400">
              저장된 템플릿이 아직 없어요.
            </p>
          ) : (
            <ul className="mt-2 flex max-h-56 flex-col gap-1 overflow-y-auto">
              {savedTemplates.map((tpl, index) => (
                <li
                  key={tpl.id}
                  onDragOver={(e) => {
                    if (dragIndexRef.current === null) return;
                    e.preventDefault();
                    setDragOverIndex(index);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragIndexRef.current !== null) handleReorder(dragIndexRef.current, index);
                    dragIndexRef.current = null;
                    setDragOverIndex(null);
                  }}
                  className={cn(
                    "flex items-center gap-1 rounded-md border px-1.5 py-1.5 transition-colors",
                    dragOverIndex === index ? "border-blue-300 bg-blue-50/60" : "border-slate-200",
                  )}
                >
                  <span
                    draggable
                    onDragStart={(e) => {
                      dragIndexRef.current = index;
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={() => {
                      dragIndexRef.current = null;
                      setDragOverIndex(null);
                    }}
                    title="드래그해서 순서 변경"
                    aria-label="순서 변경 손잡이"
                    className="flex h-7 w-5 shrink-0 cursor-grab items-center justify-center text-slate-300 hover:text-slate-500 active:cursor-grabbing"
                  >
                    <GripVertical className="h-3.5 w-3.5" />
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const next = onApply(tpl);
                      setSavedTemplates(next);
                      setNotice(`'${tpl.name}' 템플릿을 적용하고 저장했어요.`);
                    }}
                    title={`'${tpl.name}' 적용`}
                    className="flex min-w-0 flex-1 items-center gap-1 rounded px-1 py-0.5 text-left text-[11.5px] font-semibold text-slate-700 hover:bg-slate-50 hover:text-blue-700"
                  >
                    <span className="min-w-0 truncate">{tpl.name}</span>
                    {tpl.isDefault ? (
                      <span className="shrink-0 rounded bg-amber-100 px-1 text-[9px] font-bold text-amber-600">기본</span>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const next = toggleDefaultReportSettings(tpl.id);
                      setSavedTemplates(next);
                      const nowDefault = next.find((s) => s.id === tpl.id)?.isDefault;
                      setNotice(
                        nowDefault
                          ? `'${tpl.name}'을(를) 기본으로 지정했어요. 새 보고서에 자동 적용돼요.`
                          : "기본 템플릿 지정을 해제했어요.",
                      );
                    }}
                    title={tpl.isDefault ? "기본 지정 해제" : "기본 템플릿으로 지정 (새 보고서에 자동 적용)"}
                    aria-label={tpl.isDefault ? "기본 지정 해제" : "기본 템플릿으로 지정"}
                    aria-pressed={!!tpl.isDefault}
                    className={cn(
                      "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition-colors",
                      tpl.isDefault
                        ? "border-amber-300 bg-amber-50 text-amber-500 hover:bg-amber-100"
                        : "border-slate-200 text-slate-300 hover:bg-slate-50 hover:text-amber-400",
                    )}
                  >
                    <Star className={cn("h-3.5 w-3.5", tpl.isDefault && "fill-amber-400")} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const next = onDelete(tpl.id);
                      setSavedTemplates(next);
                      setNotice(`'${tpl.name}' 템플릿을 삭제했어요.`);
                    }}
                    title="템플릿 삭제"
                    aria-label={`'${tpl.name}' 템플릿 삭제`}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-400 hover:bg-red-50 hover:text-red-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* 현재 보고서 설정만 기본값으로 되돌림(저장된 템플릿은 유지) */}
          <button
            type="button"
            onClick={() => {
              onReset();
              setNotice("현재 설정을 기본값으로 되돌렸어요.");
            }}
            className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-md border border-slate-200 px-2 py-1.5 text-[11.5px] font-semibold text-slate-500 hover:bg-slate-50"
          >
            <RotateCcw className="h-3.5 w-3.5" /> 현재 설정 초기화
          </button>

          {notice ? <p className="mt-1.5 text-[10.5px] font-semibold text-blue-500">{notice}</p> : null}
        </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function VocabTestOptions({
  sectionIndex,
  vocabMode,
  vocabTestLayout,
  vocabTestOnly,
  excludedVocabTestCount,
  onVocabTestMode,
  onVocabTestLayout,
  onVocabTestOnly,
  onRestoreVocabTestRows,
}: {
  sectionIndex: number;
  vocabMode: VocabTestMode;
  vocabTestLayout: VocabTestLayout;
  vocabTestOnly: boolean;
  excludedVocabTestCount: number;
  onVocabTestMode: (sectionIndex: number, mode: VocabTestMode) => void;
  onVocabTestLayout: (sectionIndex: number, layout: VocabTestLayout) => void;
  onVocabTestOnly: (sectionIndex: number, enabled: boolean, mode?: Exclude<VocabTestMode, "study">) => void;
  onRestoreVocabTestRows: (sectionIndex: number) => void;
}) {
  return (
    <div>
      {/* '추가 안 함'(study)은 상단 ON/OFF 스위치와 기능이 중복되어 제외. */}
      <div className="grid grid-cols-2 gap-1.5">
        {([
          { mode: "hide-meaning", label: "뜻 쓰기", icon: Languages },
          { mode: "hide-headword", label: "단어 쓰기", icon: FileQuestion },
        ] as const).map(({ mode, label, icon: Icon }) => (
          <button
            key={mode}
            type="button"
            data-vocab-mode={mode}
            onClick={() => onVocabTestMode(sectionIndex, mode)}
            className={`flex h-14 flex-col items-center justify-center gap-1 rounded-md border text-[11px] font-semibold ${
              vocabMode === mode
                ? "border-blue-500 bg-blue-50 text-blue-700"
                : "border-slate-200 text-slate-500 hover:bg-slate-50"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <div className="mt-2.5">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[11px] font-semibold text-slate-500">시험지 레이아웃</span>
          <span className="text-[10.5px] text-slate-400">{vocabTestLayout === "two-column" ? "2열 카드" : "1열 표"}</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {([
            { layout: "table", label: "1열 표" },
            { layout: "two-column", label: "2열 카드" },
          ] as const).map(({ layout, label }) => (
            <button
              key={layout}
              type="button"
              data-vocab-test-layout={layout}
              onClick={() => onVocabTestLayout(sectionIndex, layout)}
              className={`h-8 rounded-md border text-[12px] font-semibold transition-colors ${
                vocabTestLayout === layout
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        data-vocab-test-only={vocabTestOnly ? "restore" : "only"}
        onClick={() => {
          if (vocabTestOnly) {
            onVocabTestOnly(sectionIndex, false);
            return;
          }
          onVocabTestOnly(
            sectionIndex,
            true,
            vocabMode === "hide-headword" ? "hide-headword" : "hide-meaning",
          );
        }}
        className={`mt-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-[12px] font-semibold transition-colors ${
          vocabTestOnly
            ? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
        }`}
      >
        <FileQuestion className={`h-3.5 w-3.5 ${vocabTestOnly ? "text-blue-600" : "text-amber-500"}`} />
        {vocabTestOnly ? "전체 자료 다시 보이기" : "단어 시험지만 만들기"}
      </button>

      {excludedVocabTestCount > 0 ? (
        <button
          type="button"
          onClick={() => onRestoreVocabTestRows(sectionIndex)}
          className="mt-1.5 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11.5px] font-medium text-slate-600 transition-colors hover:bg-slate-50"
        >
          제외한 단어 다시 포함 ({excludedVocabTestCount})
        </button>
      ) : null}
    </div>
  );
}

function VocabTestToolbarPopover({
  sectionIndex,
  vocabMode,
  vocabTestLayout,
  vocabTestOnly,
  excludedVocabTestCount,
  onVocabTestMode,
  onVocabTestLayout,
  onVocabTestOnly,
  onRestoreVocabTestRows,
}: {
  sectionIndex: number;
  vocabMode: VocabTestMode;
  vocabTestLayout: VocabTestLayout;
  vocabTestOnly: boolean;
  excludedVocabTestCount: number;
  onVocabTestMode: (sectionIndex: number, mode: VocabTestMode) => void;
  onVocabTestLayout: (sectionIndex: number, layout: VocabTestLayout) => void;
  onVocabTestOnly: (sectionIndex: number, enabled: boolean, mode?: Exclude<VocabTestMode, "study">) => void;
  onRestoreVocabTestRows: (sectionIndex: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null);
  const controlRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = controlRef.current?.getBoundingClientRect();
      if (!rect) return;
      setCoords({ top: rect.bottom + 8, right: Math.max(8, window.innerWidth - rect.right) });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (controlRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const vocabTestEnabled = vocabTestOnly || vocabMode !== "study";
  const vocabSummary =
    vocabTestOnly
      ? "단어 시험지만 표시"
      : vocabMode === "study"
        ? "추가 안 함"
        : vocabMode === "hide-meaning"
          ? "뜻 쓰기 시험지"
          : "단어 쓰기 시험지";

  return (
    <div className="shrink-0">
      <div
        ref={controlRef}
        className={`inline-flex h-8 overflow-hidden rounded-md border transition-colors ${
          open || vocabTestEnabled
            ? "border-blue-200 bg-blue-50 text-blue-700"
            : "border-slate-200 bg-white text-slate-600"
        }`}
      >
        <button
          type="button"
          role="switch"
          aria-checked={vocabTestEnabled}
          data-vocab-test-toolbar={vocabTestEnabled ? "on" : "off"}
          onClick={() => onVocabTestMode(sectionIndex, vocabTestEnabled ? "study" : "hide-meaning")}
          title="단어 시험지 포함"
          className={`inline-flex h-full items-center gap-1.5 px-2.5 text-[11.5px] font-semibold transition-colors ${
            open || vocabTestEnabled ? "hover:bg-blue-100" : "hover:bg-slate-50"
          }`}
        >
          <FileQuestion className={`h-3.5 w-3.5 ${vocabTestEnabled ? "text-blue-600" : "text-amber-500"}`} />
          <span className="hidden sm:inline">단어 시험지</span>
          <span className="sm:hidden">단어</span>
          {vocabTestOnly ? (
            <span className="hidden rounded bg-blue-100 px-1 text-[9.5px] font-bold text-blue-600 sm:inline">
              시험지만
            </span>
          ) : null}
          <span
            className={`relative h-4 w-7 rounded-full transition-colors ${
              vocabTestEnabled ? "bg-blue-500" : "bg-slate-300"
            }`}
            aria-hidden="true"
          >
            <span
              className={`absolute left-0 top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${
                vocabTestEnabled ? "translate-x-3.5" : "translate-x-0.5"
              }`}
            />
          </span>
          <span className={`text-[10px] font-bold ${vocabTestEnabled ? "text-blue-700" : "text-slate-400"}`}>
            {vocabTestEnabled ? "ON" : "OFF"}
          </span>
        </button>
        <button
          type="button"
          data-vocab-test-only-toolbar={vocabTestOnly ? "restore" : "only"}
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          title="단어 시험지 세부 설정"
          className={`flex h-full w-8 items-center justify-center border-l transition-colors ${
            open || vocabTestEnabled
              ? "border-blue-200 text-blue-600 hover:bg-blue-100"
              : "border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-slate-600"
          }`}
        >
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      {open && coords
        ? createPortal(
            <div
              ref={popoverRef}
              style={{ position: "fixed", top: coords.top, right: coords.right }}
              className="z-[70] w-[320px] max-w-[calc(100vw-16px)] rounded-lg border border-slate-200 bg-white p-3 shadow-xl"
            >
              <span className="absolute -top-1.5 right-8 h-3 w-3 rotate-45 border-l border-t border-slate-200 bg-white" />
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[12px] font-black text-slate-800">단어 시험지</p>
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                  {vocabSummary}
                </span>
              </div>
              <VocabTestOptions
                sectionIndex={sectionIndex}
                vocabMode={vocabMode}
                vocabTestLayout={vocabTestLayout}
                vocabTestOnly={vocabTestOnly}
                excludedVocabTestCount={excludedVocabTestCount}
                onVocabTestMode={onVocabTestMode}
                onVocabTestLayout={onVocabTestLayout}
                onVocabTestOnly={onVocabTestOnly}
                onRestoreVocabTestRows={onRestoreVocabTestRows}
              />
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

/**
 * 인라인 텍스트 편집용 떠다니는 서식 툴바(버블 메뉴).
 * `.par-edit-field` 에 포커스가 들어오면 그 필드가 속한 블록 위에 떠서,
 * 블록 단위 서식(글자 크기·굵게·이탤릭·정렬)을 blockMeta 로 적용한다.
 * - 위치는 RAF 로 블록을 추종(스크롤·리페이지네이션·줌에도 따라감).
 * - 리포트/툴바 바깥 클릭 또는 ESC 로 닫힌다(필드 재포커스는 focusin 이 갱신).
 */
// 선택 영역(없으면 필드 전체)에만 글자 크기(pt)를 입힌다. <font size=7> 로 감싼 뒤
// span[data-fs][style=font-size:Npt] 로 변환. blur 시 Field 가 DOM 에서 런을 읽어 저장.
function applyFontPtToSelection(field: HTMLElement, pt: number) {
  const sel = window.getSelection();
  if (!sel) return;
  let range = sel.rangeCount ? sel.getRangeAt(0) : null;
  const inField = !!range && field.contains(range.commonAncestorContainer);
  if (!range || sel.isCollapsed || !inField) {
    range = document.createRange();
    range.selectNodeContents(field);
    sel.removeAllRanges();
    sel.addRange(range);
  }
  document.execCommand("styleWithCSS", false, "false");
  document.execCommand("fontSize", false, "7");
  field.querySelectorAll('font[size="7"]').forEach((f) => {
    const span = document.createElement("span");
    span.setAttribute("data-fs", String(pt));
    span.style.fontSize = `${pt}pt`;
    while (f.firstChild) span.appendChild(f.firstChild);
    // 중첩된 이전 크기 span 은 제거(바깥 크기가 우선).
    span.querySelectorAll<HTMLElement>("[data-fs]").forEach((inner) => {
      const parent = inner.parentNode;
      if (!parent) return;
      while (inner.firstChild) parent.insertBefore(inner.firstChild, inner);
      parent.removeChild(inner);
    });
    f.replaceWith(span);
  });
}

function FloatingFormatToolbar({
  blockMeta,
  onBlockMeta,
}: {
  blockMeta?: Record<string, BlockMeta>;
  onBlockMeta: (id: string, patch: Partial<BlockMeta>) => void;
}) {
  const [blockId, setBlockId] = useState<string | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLElement | null>(null);
  const fieldRef = useRef<HTMLElement | null>(null);
  const ptLabelRef = useRef<HTMLSpanElement>(null);

  // 편집 필드 포커스 → 해당 블록을 서식 대상으로 잡는다.
  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      const field = target?.closest<HTMLElement>(".par-edit-field");
      const block = field?.closest<HTMLElement>("[data-paper-item-id]");
      if (!block) return;
      anchorRef.current = block;
      fieldRef.current = field ?? block;
      setBlockId(block.getAttribute("data-paper-item-id"));
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, []);

  // 현재 편집 중인 텍스트의 '실제' 글자 크기(pt) — 블록마다 기준 크기가 달라
  // fontScale(배율)만으로는 pt 를 알 수 없으므로 렌더된 px 를 읽어 pt 로 환산한다.
  const readFontPt = (): number | null => {
    let field = fieldRef.current;
    if (!field || !field.isConnected) {
      field = anchorRef.current?.querySelector<HTMLElement>(".par-edit-field") ?? anchorRef.current ?? null;
      fieldRef.current = field;
    }
    if (!field) return null;
    // 선택이 이 필드 안에 있으면 '선택한 글자'의 크기를 우선 표시.
    const sel = window.getSelection();
    if (sel && sel.focusNode && field.contains(sel.focusNode)) {
      const el =
        sel.focusNode.nodeType === Node.ELEMENT_NODE
          ? (sel.focusNode as HTMLElement)
          : sel.focusNode.parentElement;
      if (el) {
        const spx = parseFloat(window.getComputedStyle(el).fontSize);
        if (spx) return (spx * 72) / 96;
      }
    }
    const px = parseFloat(window.getComputedStyle(field).fontSize);
    return px ? (px * 72) / 96 : null; // px → pt
  };

  // 리포트/툴바 바깥 클릭 또는 ESC 로 닫기.
  useEffect(() => {
    if (!blockId) return;
    const onDown = (e: MouseEvent) => {
      const node = e.target as HTMLElement;
      if (toolbarRef.current?.contains(node)) return;
      // 편집 필드 클릭은 유지(같은 필드면 그대로, 다른 필드면 focusin 이 대상 갱신).
      // 페이지 여백·페이지 밖·그 외 비편집 영역을 클릭하면 닫는다.
      if (node.closest?.(".par-edit-field")) return;
      setBlockId(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setBlockId(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [blockId]);

  // 위치: '실제로 수정 중인' 편집 필드(.par-edit-field) 바로 위·왼쪽에 고정.
  // 블록 전체가 아니라 편집 필드를 기준점으로 삼아, 키 큰 블록에서도 툴바가
  // 멀리 떨어진 블록 최상단이 아니라 편집 지점 근처에 뜨도록 한다.
  // RAF 로 매 프레임 추종(상태 변경 없이 DOM 직접 갱신).
  useEffect(() => {
    if (!blockId) return;
    let raf = 0;
    const tick = () => {
      const bar = toolbarRef.current;
      let anchor = anchorRef.current;
      if (!anchor || !anchor.isConnected) {
        anchor = document.querySelector<HTMLElement>(`[data-paper-item-id="${CSS.escape(blockId)}"]`);
        anchorRef.current = anchor;
      }
      // 편집 필드를 우선 기준점으로 사용하고, 없으면 블록으로 폴백.
      let field = fieldRef.current;
      if (!field || !field.isConnected) {
        field =
          anchor?.querySelector<HTMLElement>(".par-edit-field") ?? anchor ?? null;
        fieldRef.current = field;
      }
      const target = field ?? anchor;
      if (bar && target) {
        const r = target.getBoundingClientRect();
        const top = Math.max(8, r.top - bar.offsetHeight - 8);
        const left = Math.min(Math.max(8, r.left), window.innerWidth - bar.offsetWidth - 8);
        bar.style.top = `${top}px`;
        bar.style.left = `${left}px`;
        bar.style.visibility = "visible";
      } else if (bar) {
        bar.style.visibility = "hidden";
      }
      // pt 라벨은 리렌더 없이 매 프레임 직접 갱신(서식 변경·줌에도 즉시 반영).
      const ptEl = ptLabelRef.current;
      if (ptEl) {
        const pt = readFontPt();
        ptEl.textContent = pt ? `${Math.round(pt)}pt` : "—";
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [blockId]);

  if (!blockId) return null;
  const meta = blockMeta?.[blockId] ?? {};
  // 선택한 글자(없으면 현재 필드 전체)에만 pt 를 1pt 씩 조절. 블록 전체 배율이 아니라
  // 범위 메타로 저장되도록, 선택 영역을 span 으로 감싼다(blur 시 Field 가 읽어 커밋).
  const stepFontPt = (delta: number) => {
    const field =
      fieldRef.current && fieldRef.current.isConnected ? fieldRef.current : null;
    if (!field) return;
    const cur = readFontPt() ?? 12;
    const targetPt = Math.min(60, Math.max(5, Math.round(cur) + delta));
    applyFontPtToSelection(field, targetPt);
  };
  const btnCls = (active: boolean) =>
    cn(
      "flex h-7 min-w-[28px] items-center justify-center rounded px-1.5 transition-colors",
      active ? "bg-blue-100 text-blue-700" : "text-slate-600 hover:bg-slate-100",
    );

  return createPortal(
    <div
      ref={toolbarRef}
      style={{ position: "fixed", top: 0, left: 0, visibility: "hidden" }}
      className="no-print z-[70] flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-1 shadow-xl"
      // 필드 포커스를 잃지 않도록(클릭 시 blur 방지) — 버튼 onClick 은 그대로 동작
      onMouseDown={(e) => e.preventDefault()}
    >
      <button type="button" className={btnCls(false)} onClick={() => stepFontPt(-1)} title="글자 작게">
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span ref={ptLabelRef} className="w-10 text-center text-[11px] font-semibold tabular-nums text-slate-500">—</span>
      <button type="button" className={btnCls(false)} onClick={() => stepFontPt(1)} title="글자 크게">
        <Plus className="h-3.5 w-3.5" />
      </button>
      <span className="mx-0.5 h-5 w-px bg-slate-200" />
      <button type="button" className={btnCls(!!meta.bold)} onClick={() => onBlockMeta(blockId, { bold: !meta.bold })} title="굵게">
        <Bold className="h-3.5 w-3.5" />
      </button>
      <button type="button" className={btnCls(!!meta.italic)} onClick={() => onBlockMeta(blockId, { italic: !meta.italic })} title="이탤릭">
        <Italic className="h-3.5 w-3.5" />
      </button>
      <span className="mx-0.5 h-5 w-px bg-slate-200" />
      <button type="button" className={btnCls(!meta.align || meta.align === "left")} onClick={() => onBlockMeta(blockId, { align: "left" })} title="왼쪽 정렬">
        <AlignLeft className="h-3.5 w-3.5" />
      </button>
      <button type="button" className={btnCls(meta.align === "center")} onClick={() => onBlockMeta(blockId, { align: "center" })} title="가운데 정렬">
        <AlignCenter className="h-3.5 w-3.5" />
      </button>
      <button type="button" className={btnCls(meta.align === "right")} onClick={() => onBlockMeta(blockId, { align: "right" })} title="오른쪽 정렬">
        <AlignRight className="h-3.5 w-3.5" />
      </button>
    </div>,
    document.body,
  );
}

type ReportHistoryState = {
  present: AnalysisReport;
  past: AnalysisReport[];
  future: AnalysisReport[];
};

type ReportHistoryAction =
  | { type: "set"; updater: SetStateAction<AnalysisReport>; record?: boolean }
  | { type: "replace"; report: AnalysisReport; clearHistory?: boolean }
  | { type: "undo" }
  | { type: "redo" };

function resolveReportUpdate(
  current: AnalysisReport,
  updater: SetStateAction<AnalysisReport>,
): AnalysisReport {
  return typeof updater === "function"
    ? (updater as (current: AnalysisReport) => AnalysisReport)(current)
    : updater;
}

function reportHistoryReducer(
  state: ReportHistoryState,
  action: ReportHistoryAction,
): ReportHistoryState {
  if (action.type === "undo") {
    const previous = state.past[state.past.length - 1];
    if (!previous) return state;
    return {
      present: previous,
      past: state.past.slice(0, -1),
      future: [state.present, ...state.future],
    };
  }

  if (action.type === "redo") {
    const next = state.future[0];
    if (!next) return state;
    return {
      present: next,
      past: [...state.past, state.present].slice(-50),
      future: state.future.slice(1),
    };
  }

  if (action.type === "replace") {
    return {
      present: action.report,
      past: action.clearHistory ? [] : state.past,
      future: action.clearHistory ? [] : state.future,
    };
  }

  const next = resolveReportUpdate(state.present, action.updater);
  if (next === state.present) return state;
  if (action.record === false) return { ...state, present: next };
  return {
    present: next,
    past: [...state.past, state.present].slice(-50),
    future: [],
  };
}

/** 업로드 이미지 → 640px 다운스케일 data URL (용량 폭증/무음 누락 방지, 검증 P0). */
async function downscaleImage(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result as string);
    fr.onerror = () => rej(new Error("read"));
    fr.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error("img"));
    im.src = dataUrl;
  });
  const maxEdge = 640;
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, w, h);
  const hasAlpha = file.type === "image/png" || file.type === "image/webp" || file.type === "image/gif";
  let out = hasAlpha ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.85);
  if (out.length > 880_000) out = canvas.toDataURL("image/jpeg", 0.7);
  return out;
}

const COVER_DEFAULTS: ReportCover = {
  enabled: false,
  templateId: "classic-center",
  showLogo: true,
  logoAlign: "center",
  logoHeightMm: 14,
  showMeta: false,
};

interface Props {
  passageId: string;
  initialReport: AnalysisReport;
  onDraftChange?: (report: AnalysisReport, state: { dirty: boolean }) => void;
  onSaved?: (report: AnalysisReport) => void;
  onExit?: () => void;
}

export function AnalysisReportEditor({
  passageId,
  initialReport,
  onDraftChange,
  onSaved,
  onExit,
}: Props) {
  const [history, dispatchReport] = useReducer(reportHistoryReducer, {
    present: initialReport,
    past: [],
    future: [],
  });
  const report = history.present;
  const setReport = useCallback(
    (updater: SetStateAction<AnalysisReport>, options?: { record?: boolean }) => {
      dispatchReport({ type: "set", updater, record: options?.record });
    },
    [],
  );
  const [baseline, setBaseline] = useState<AnalysisReport>(initialReport);
  const [activeId, setActiveId] = useState<string | null>(null);
  // 토글/삽입/삭제 후 미리보기를 해당 블록으로 스크롤하기 위한 참조들.
  // (정의 순서상 뒤에 오는 scrollToBlock/orderedIds 를 앞쪽 핸들러에서 쓰기 위해 ref 경유)
  const scrollToBlockRef = useRef<(id: string) => void>(() => {});
  const orderedIdsRef = useRef<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [placement, setPlacement] = useState<DropPlacement>("before");

  const dirty = report !== baseline;
  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  useEffect(() => {
    onDraftChange?.(report, { dirty });
  }, [dirty, onDraftChange, report]);

  // 콘텐츠 편집 콜백 (안정적)
  const med = useMemo(() => ({ commit: (next: ReportMeta) => setReport((r) => setMeta(r, next)) }), [setReport]);
  const sectionEdit = useCallback(
    (index: number) => ({ commit: (next: AnalysisSection) => setReport((r) => setSection(r, index, next)) }),
    [setReport],
  );

  const onReorder = useCallback((sourceId: string, targetId: string, place: DropPlacement) => {
    setReport((r) => {
      const ids = applyBlockOrder(enumerateItems(r).map((b) => b.id), r.blockOrder);
      return { ...r, blockOrder: reorderIds(ids, sourceId, targetId, place) };
    });
  }, [setReport]);

  const onBlockMeta = useCallback((id: string, patch: Partial<BlockMeta>) => {
    setReport((r) => setBlockMeta(r, id, patch));
  }, [setReport]);

  // 워드프로세서식: 텍스트 블록 끝에서 Enter → 바로 아래에 빈 텍스트 블록 생성.
  // 생성된 블록은 렌더 후 effect 가 본문에 포커스를 넣어 곧바로 이어 쓸 수 있다.
  const pendingFocusRef = useRef<string | null>(null);
  // anchorId 기준 앞/뒤에 빈 텍스트 블록 삽입. anchorId === null 이면 맨 앞에.
  const insertBlockAt = useCallback(
    (
      kind: "text" | "spacer",
      anchorId: string | null,
      place: "before" | "after",
    ) => {
      const id = newCustomBlockId();
      setReport((r) => {
        const cb: CustomBlock =
          kind === "spacer"
            ? { kind: "spacer", id, heightMm: 16 }
            : { kind: "text", id, text: "" };
        const withBlock = { ...r, customBlocks: [...(r.customBlocks ?? []), cb] };
        const naturalIds = enumerateItems(withBlock).map((d) => d.id);
        const fullOrder = applyBlockOrder(naturalIds, withBlock.blockOrder);
        const anchor = anchorId ?? fullOrder.find((x) => x !== id) ?? null;
        const blockOrder = anchor
          ? reorderIds(fullOrder, id, anchor, anchorId ? place : "before")
          : fullOrder;
        return { ...withBlock, blockOrder };
      });
      setActiveId(id);
      if (kind === "text") pendingFocusRef.current = id;
      scrollToBlockRef.current(id);
    },
    [setReport],
  );
  const insertTextAfter = useCallback(
    (anchorId: string) => insertBlockAt("text", anchorId, "after"),
    [insertBlockAt],
  );

  // 빈 영역 클릭 시 "여백/텍스트" 중 무엇을 넣을지 고르는 작은 메뉴.
  const [insertMenu, setInsertMenu] = useState<
    { x: number; y: number; anchorId: string | null } | null
  >(null);

  // 새로 삽입된 텍스트 블록이 렌더되면 본문 필드에 캐럿을 놓는다.
  useEffect(() => {
    const id = pendingFocusRef.current;
    if (!id) return;
    const raf = requestAnimationFrame(() => {
      const body = document.querySelector<HTMLElement>(
        `[data-paper-item-id="${CSS.escape(id)}"] .par-customtext-b`,
      );
      if (!body) return;
      pendingFocusRef.current = null;
      body.focus({ preventScroll: true });
      const range = document.createRange();
      range.selectNodeContents(body);
      range.collapse(true);
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(range);
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [report.customBlocks, report.blockOrder]);

  // 삽입 메뉴: Esc 또는 스크롤 시 닫기.
  useEffect(() => {
    if (!insertMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setInsertMenu(null);
    };
    const onScroll = () => setInsertMenu(null);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [insertMenu]);

  const onColWidths = useCallback((group: string, widths: Record<string, number>) => {
    setReport((r) => setTableColWidths(r, group, widths));
  }, [setReport]);

  const setCustom = useCallback((id: string, patch: Partial<CustomBlock>) => {
    setReport((r) => setCustomBlock(r, id, patch));
  }, [setReport]);

  const onResize = useCallback((id: string, mm: number) => {
    setReport((r) => {
      const cb = r.customBlocks?.find((b) => b.id === id);
      if (cb?.kind === "spacer") {
        // 여백 블록은 heightMm 로 직접 반영 + 잔여 minHeight 제거(이중 높이 방지)
        const r2 = setCustomBlock(r, id, { heightMm: Math.min(237, Math.max(SPACER_MIN_MM, mm)) });
        return setBlockMeta(r2, id, { minHeight: undefined });
      }
      return setBlockMeta(r, id, { minHeight: mm > 0 ? Math.min(237, mm) : undefined });
    });
  }, [setReport]);

  // ── 표지(Cover) ──
  const [coverError, setCoverError] = useState<string | null>(null);
  const ced = useMemo(() => ({ commit: (next: ReportCover) => setReport((r) => ({ ...r, cover: next })) }), [setReport]);
  const setCoverPatch = useCallback((patch: Partial<ReportCover>) => {
    setReport((r) => ({ ...r, cover: { ...COVER_DEFAULTS, ...(r.cover ?? {}), ...patch } }));
  }, [setReport]);

  // 학습자료 설정 템플릿 — 현재 설정을 이름 붙여 저장 / 골라서 적용 / 삭제 / 현재 보고서 초기화
  const onSaveReportSettings = useCallback(
    (name: string) =>
      addSavedReportSettings(
        {
          brand: report.brand,
          themeId: report.themeId,
          englishOnlyPage: !!report.englishOnlyPage,
          cover: report.cover,
        },
        name,
      ),
    [report.brand, report.themeId, report.englishOnlyPage, report.cover],
  );
  const onApplyReportSettings = useCallback(
    (entry: SavedReportSettings) => {
      setReport((r) => ({
        ...r,
        brand: entry.brand ?? r.brand,
        themeId: entry.themeId ?? r.themeId,
        englishOnlyPage: entry.englishOnlyPage ?? r.englishOnlyPage,
        cover: entry.cover ? { ...COVER_DEFAULTS, ...entry.cover } : r.cover,
      }));
      return persistAppliedReportSettings(entry);
    },
    [setReport],
  );
  const onDeleteReportSettings = useCallback((id: string) => deleteSavedReportSettings(id), []);
  const onResetReportSettings = useCallback(() => {
    setReport((r) => ({ ...r, themeId: "black-white", englishOnlyPage: false, cover: { ...COVER_DEFAULTS } }));
  }, [setReport]);

  // 기본 템플릿 자동 적용 — 이 지문의 보고서를 '처음' 열 때 딱 한 번. 이후(편집한 뒤)에는
  // 다시 덮어쓰지 않도록 passageId 를 기록해 둔다. 기본 템플릿이 없으면 적용은 건너뛰되
  // '열어 봤다'는 기록은 남겨, 이미 본 보고서가 나중 기본 지정에 끌려가지 않게 한다.
  useEffect(() => {
    if (hasAppliedDefaultFor(passageId)) return;
    const def = getDefaultReportSettings();
    markAppliedDefaultFor(passageId);
    if (def) onApplyReportSettings(def);
  }, [passageId, onApplyReportSettings]);
  const onLogoFile = useCallback(
    async (file?: File | null) => {
      if (!file) return;
      setCoverError(null);
      if (!file.type.startsWith("image/")) {
        setCoverError("이미지 파일만 로고로 넣을 수 있습니다.");
        return;
      }
      if (file.size > LOGO_FILE_MAX_BYTES) {
        setCoverError("로고 이미지는 1.5MB 이하로 올려주세요.");
        return;
      }
      try {
        const url = await downscaleImage(file);
        if (url.length > 900_000) {
          setCoverError("로고 용량이 큽니다. 더 작거나 단순한 이미지를 사용하세요.");
          return;
        }
        setCoverPatch({ logoDataUrl: url, showLogo: true, logoX: undefined, logoY: undefined });
      } catch {
        setCoverError("로고를 불러오지 못했습니다. PNG/JPG 파일을 사용하세요.");
      }
    },
    [setCoverPatch],
  );

  const [pageList, setPageList] = useState<string[][]>([]);
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [pagesPanelCollapsed, setPagesPanelCollapsed] = useState(false);
  const [propertiesPanelCollapsed, setPropertiesPanelCollapsed] = useState(false);
  const [materialSettingsOpen, setMaterialSettingsOpen] = useState(false);
  // 블록을 선택하면 학습자료 설정에서 편집 패널로 자동 전환(그 블록 도구를 바로 보여주기 위해)
  useEffect(() => {
    if (activeId) setMaterialSettingsOpen(false);
  }, [activeId]);
  const [railWidth, setRailWidth] = useState(() =>
    readStoredWidth(RAIL_WIDTH_STORAGE_KEY, RAIL_WIDTH_DEFAULT, clampRailWidth),
  );
  const [panelWidth, setPanelWidth] = useState(() =>
    readStoredWidth(PANEL_WIDTH_STORAGE_KEY, PANEL_WIDTH_DEFAULT, clampPanelWidth),
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(RAIL_WIDTH_STORAGE_KEY, String(railWidth));
    } catch {
      // 편의 설정이라 실패해도 현재 세션 동작엔 영향 없음.
    }
  }, [railWidth]);
  useEffect(() => {
    try {
      window.localStorage.setItem(PANEL_WIDTH_STORAGE_KEY, String(panelWidth));
    } catch {
      // 편의 설정이라 실패해도 현재 세션 동작엔 영향 없음.
    }
  }, [panelWidth]);

  // 좌/우 패널 폭 드래그 — 포인터 이벤트로 col-resize (exam paper builder 와 동일한 UX).
  const startWidthDrag = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>, side: "rail" | "panel") => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.preventDefault();
      const startX = event.clientX;
      const startRail = railWidth;
      const startPanel = panelWidth;
      const prevCursor = document.body.style.cursor;
      const prevSelect = document.body.style.userSelect;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const move = (moveEvent: PointerEvent) => {
        moveEvent.preventDefault();
        const delta = moveEvent.clientX - startX;
        if (side === "rail") setRailWidth(clampRailWidth(startRail + delta));
        else setPanelWidth(clampPanelWidth(startPanel - delta));
      };
      const finish = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
        document.body.style.cursor = prevCursor;
        document.body.style.userSelect = prevSelect;
      };
      window.addEventListener("pointermove", move, { passive: false });
      window.addEventListener("pointerup", finish, { once: true });
      window.addEventListener("pointercancel", finish, { once: true });
    },
    [railWidth, panelWidth],
  );
  const previewScrollerRef = useRef<HTMLDivElement>(null);
  // 좌측 페이지 썸네일 목록 스크롤러 — 본문 스크롤을 따라 활성 페이지를 보이게 한다.
  const pagesPanelScrollerRef = useRef<HTMLDivElement>(null);
  const [fitZoom, setFitZoom] = useState(1);
  const [manualZoom, setManualZoom] = useState<number | null>(null);
  const [zoomControlsPos, setZoomControlsPos] = useState({ top: 12, right: 12 });
  const zoom = manualZoom ?? fitZoom;
  const previewPageCount = Math.max(pageList.length, 1);
  const previewContentHeight = previewPageCount * (REPORT_A4_HEIGHT_PX + REPORT_PAGE_GAP_PX);

  useEffect(() => {
    const scroller = previewScrollerRef.current;
    if (!scroller) return;

    let lastFitWidth = 0;
    const updateFitZoom = () => {
      const styles = window.getComputedStyle(scroller);
      const paddingX = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
      const availableWidth = Math.max(320, scroller.clientWidth - paddingX);
      if (lastFitWidth > 0 && Math.abs(availableWidth - lastFitWidth) < 24) return;
      lastFitWidth = availableWidth;
      const nextFit = Math.min(1, Math.max(PREVIEW_ZOOM_MIN, availableWidth / REPORT_A4_WIDTH_PX));
      setFitZoom(Math.round(nextFit * 100) / 100);
    };

    updateFitZoom();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(updateFitZoom);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const scroller = previewScrollerRef.current;
    if (!scroller) return;

    const updateActivePage = () => {
      const scrollerRect = scroller.getBoundingClientRect();
      const pageNodes = Array.from(scroller.querySelectorAll<HTMLElement>("[data-page-index]"));
      let nextIndex = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      pageNodes.forEach((node) => {
        const rawIndex = Number(node.dataset.pageIndex);
        const top = node.getBoundingClientRect().top - scrollerRect.top;
        const distance = Math.abs(top - 24);
        if (Number.isFinite(rawIndex) && distance < bestDistance) {
          nextIndex = rawIndex;
          bestDistance = distance;
        }
      });
      setActivePageIndex(nextIndex);
    };

    updateActivePage();
    const frame = window.requestAnimationFrame(updateActivePage);
    scroller.addEventListener("scroll", updateActivePage, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      scroller.removeEventListener("scroll", updateActivePage);
    };
  }, [pageList.length, zoom]);

  // 본문 미리보기를 스크롤하면(activePageIndex 변경) 좌측 썸네일 목록도 따라와
  // 현재 보고 있는 페이지 썸네일이 항상 보이게 한다. 이미 보이면 움직이지 않는다.
  useEffect(() => {
    const scroller = pagesPanelScrollerRef.current;
    if (!scroller) return;
    const el = scroller.querySelector<HTMLElement>(
      `[data-thumb-index="${activePageIndex}"]`,
    );
    if (!el) return;
    const sRect = scroller.getBoundingClientRect();
    const eRect = el.getBoundingClientRect();
    if (eRect.top >= sRect.top && eRect.bottom <= sRect.bottom) return;
    const target =
      scroller.scrollTop +
      (eRect.top - sRect.top) -
      (scroller.clientHeight - eRect.height) / 2;
    scroller.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
  }, [activePageIndex]);

  const scrollToPage = useCallback((index: number) => {
    const scroller = previewScrollerRef.current;
    const node = scroller?.querySelector<HTMLElement>(`[data-page-index="${index}"]`);
    if (!scroller || !node) return;
    const scrollerRect = scroller.getBoundingClientRect();
    const targetRect = node.getBoundingClientRect();
    scroller.scrollTo({
      top: scroller.scrollTop + targetRect.top - scrollerRect.top - 20,
      behavior: "smooth",
    });
    setActivePageIndex(index);
  }, []);

  // 단어 시험지/학습지 편집 후 영향을 받은 블록으로 스크롤·선택을 옮긴다.
  const scrollToBlock = useCallback((id: string) => {
    window.setTimeout(() => {
      const scroller = previewScrollerRef.current;
      const el =
        scroller?.querySelector<HTMLElement>(`[data-paper-item-id="${id}"]`) ??
        scroller?.querySelector<HTMLElement>(`.par-root-edit .par-sheet [data-mid="${id}"]`);
      if (scroller && el) {
        const scrollerRect = scroller.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        scroller.scrollTo({
          top: Math.max(0, scroller.scrollTop + elRect.top - scrollerRect.top - 18),
          behavior: "smooth",
        });
      }
      const pageEl = el?.closest<HTMLElement>("[data-page-index]");
      const pageIndex = Number(pageEl?.dataset.pageIndex);
      if (Number.isFinite(pageIndex)) setActivePageIndex(pageIndex);
      setActiveId(id);
    }, 160);
  }, []);
  scrollToBlockRef.current = scrollToBlock;

  // id 를 정적으로 알 수 없는 블록(예: 정답·해설 키 — 내용에 따라 키가 달라짐)을
  // CSS 선택자로 찾아 스크롤. 첫 매칭 요소로 이동하고 활성 블록도 그 블록으로.
  const scrollToSelector = useCallback((selector: string) => {
    window.setTimeout(() => {
      const scroller = previewScrollerRef.current;
      const el = scroller?.querySelector<HTMLElement>(selector);
      if (!scroller || !el) return;
      const scrollerRect = scroller.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      scroller.scrollTo({
        top: Math.max(0, scroller.scrollTop + elRect.top - scrollerRect.top - 18),
        behavior: "smooth",
      });
      const pageEl = el.closest<HTMLElement>("[data-page-index]");
      const pageIndex = Number(pageEl?.dataset.pageIndex);
      if (Number.isFinite(pageIndex)) setActivePageIndex(pageIndex);
      const id = el.getAttribute("data-paper-item-id");
      if (id) setActiveId(id);
    }, 160);
  }, []);

  // 어떤 기능 블록(접두사로 식별)의 '바로 윗 블록' id. 기능을 끄기 전 현재 순서에서
  // 계산해, 끈 뒤 사라진 자리 바로 위로 스크롤하는 데 쓴다.
  const blockAbovePrefix = useCallback((prefix: string): string | null => {
    const order = orderedIdsRef.current;
    const idx = order.findIndex((bid) => bid.startsWith(prefix));
    return idx > 0 ? order[idx - 1] : null;
  }, []);

  // 기능을 끌 때 '튕김' 방지: 먼저 위(targetId, 아직 존재하는 블록)로 부드럽게 스크롤한
  // 뒤, 스크롤이 끝나고 나서 콘텐츠를 제거(apply)한다. 제거는 화면 아래쪽에서 일어나므로
  // 스크롤 위치가 순간 보정되며 튕기는 일이 없다.
  const scrollUpThenApply = useCallback(
    (targetId: string | null, apply: () => void) => {
      const scroller = previewScrollerRef.current;
      const el = targetId
        ? scroller?.querySelector<HTMLElement>(`[data-paper-item-id="${targetId}"]`)
        : null;
      if (!scroller || !el) {
        apply();
        return;
      }
      if (targetId) setActiveId(targetId);
      const sRect = scroller.getBoundingClientRect();
      const eRect = el.getBoundingClientRect();
      const top = Math.max(0, scroller.scrollTop + eRect.top - sRect.top - 18);
      const pageEl = el.closest<HTMLElement>("[data-page-index]");
      const pageIndex = Number(pageEl?.dataset.pageIndex);
      if (Number.isFinite(pageIndex)) setActivePageIndex(pageIndex);
      if (Math.abs(top - scroller.scrollTop) < 4) {
        apply(); // 이미 그 위치 → 곧장 제거
        return;
      }
      scroller.scrollTo({ top, behavior: "smooth" });
      window.setTimeout(apply, 450); // 부드러운 스크롤이 끝난 뒤 제거
    },
    [],
  );

  const zoomPreviewIn = useCallback(() => {
    setManualZoom((current) =>
      Math.min(PREVIEW_ZOOM_MAX, Math.round(((current ?? zoom) + PREVIEW_ZOOM_STEP) * 100) / 100),
    );
  }, [zoom]);

  const zoomPreviewOut = useCallback(() => {
    setManualZoom((current) =>
      Math.max(PREVIEW_ZOOM_MIN, Math.round(((current ?? zoom) - PREVIEW_ZOOM_STEP) * 100) / 100),
    );
  }, [zoom]);

  const resetPreviewZoom = useCallback(() => setManualZoom(null), []);

  const fitPreviewToScreen = useCallback(() => {
    const scroller = previewScrollerRef.current;
    if (!scroller) return;
    const styles = window.getComputedStyle(scroller);
    const paddingX = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
    const paddingY = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
    const availableWidth = Math.max(1, scroller.clientWidth - paddingX);
    const availableHeight = Math.max(1, scroller.clientHeight - paddingY);
    const next = Math.min(availableWidth / REPORT_A4_WIDTH_PX, availableHeight / REPORT_A4_HEIGHT_PX);
    const clamped = Math.min(PREVIEW_ZOOM_MAX, Math.max(PREVIEW_ZOOM_MIN, next));
    setManualZoom(Math.round(clamped * 100) / 100);
  }, []);

  const handlePreviewZoomControlsDragStart = useCallback(
    (event: ReactMouseEvent<HTMLSpanElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();

      const startMouseX = event.clientX;
      const startMouseY = event.clientY;
      const startTop = zoomControlsPos.top;
      const startRight = zoomControlsPos.right;
      const prevCursor = document.body.style.cursor;
      const prevUserSelect = document.body.style.userSelect;
      document.body.style.cursor = "grabbing";
      document.body.style.userSelect = "none";

      const handleMove = (moveEvent: MouseEvent) => {
        setZoomControlsPos({
          top: Math.max(0, startTop + (moveEvent.clientY - startMouseY)),
          right: Math.max(0, startRight - (moveEvent.clientX - startMouseX)),
        });
      };
      const handleUp = () => {
        document.removeEventListener("mousemove", handleMove);
        document.removeEventListener("mouseup", handleUp);
        document.body.style.cursor = prevCursor;
        document.body.style.userSelect = prevUserSelect;
      };

      document.addEventListener("mousemove", handleMove);
      document.addEventListener("mouseup", handleUp);
    },
    [zoomControlsPos],
  );

  const deleteActive = useCallback((id: string) => {
    const order = orderedIdsRef.current;
    const idx = order.indexOf(id);
    const prev = idx > 0 ? order[idx - 1] : null;
    setReport((r) => deleteItem(r, id));
    setActiveId(null);
    if (prev) scrollToBlock(prev);
    else scrollToPage(0);
  }, [setReport, scrollToBlock, scrollToPage]);
  const deletePage = useCallback((ids: string[]) => {
    if (!ids.length) return;
    if (!window.confirm(`이 페이지의 블록 ${ids.length}개를 삭제할까요?`)) return;
    setReport((r) => hideOrDeleteIds(r, ids));
  }, [setReport]);
  const onToggleCol = useCallback((si: number, key: string) => {
    setReport((r) => toggleTableCol(r, si, key));
  }, [setReport]);

  // ── 단어 시험지 / 학습지 출력 ──
  const onVocabTestMode = useCallback((si: number, mode: VocabTestMode) => {
    const apply = () => setReport((r) => setVocabularyTestMode(r, si, mode));
    if (mode === "study") {
      // 끄기 → 단어시험이 사라지므로 그 위로 부드럽게 올라간 뒤 제거.
      scrollUpThenApply(blockAbovePrefix(`s${si}-vocab-test`) ?? `s${si}-head`, apply);
    } else {
      apply();
      scrollToBlock(`s${si}-vocab-test-head`);
    }
  }, [blockAbovePrefix, scrollToBlock, scrollUpThenApply, setReport]);
  const onVocabTestLayout = useCallback((si: number, layout: VocabTestLayout) => {
    setReport((r) => setVocabularyTestLayout(r, si, layout));
    scrollToBlock(`s${si}-vocab-test-head`);
  }, [scrollToBlock, setReport]);
  const onVocabTestOnly = useCallback(
    (si: number, enabled: boolean, mode: Exclude<VocabTestMode, "study"> = "hide-meaning") => {
      const apply = () => setReport((r) => setVocabularyTestOnly(r, si, enabled, mode));
      if (enabled) {
        apply();
        scrollToBlock(`s${si}-vocab-test-head`);
      } else {
        // 끄기 → 단어시험이 사라지므로 그 위로 부드럽게 올라간 뒤 제거.
        scrollUpThenApply(blockAbovePrefix(`s${si}-vocab-test`) ?? `s${si}-head`, apply);
      }
    },
    [blockAbovePrefix, scrollToBlock, scrollUpThenApply, setReport],
  );
  const onRestoreVocabTestRows = useCallback((si: number) => {
    setReport((r) => {
      const sec = r.sections[si];
      if (!sec || sec.kind !== "vocabulary") return r;
      return setSection(r, si, { ...sec, vocabTestExcludedKeys: undefined });
    });
    scrollToBlock(`s${si}-vocab-test-head`);
  }, [scrollToBlock, setReport]);
  const onToggleWorksheetAnswers = useCallback((si: number) => {
    const sec = report.sections[si];
    // 현재 숨김 상태면 이번 토글로 '포함'이 된다 → 새로 나타나는 정답·해설로 스크롤.
    const willInclude =
      sec?.kind === "learning-worksheet" ? worksheetAnswersAreHidden(sec) : false;
    const apply = () =>
      setReport((r) => {
        const s2 = r.sections[si];
        if (!s2 || s2.kind !== "learning-worksheet") return r;
        return setSection(r, si, { ...s2, hiddenAnswers: !worksheetAnswersAreHidden(s2) });
      });
    if (willInclude) {
      apply();
      // 정답·해설 키 블록은 내용에 따라 id 가 달라 선택자로 첫 블록을 찾는다.
      scrollToSelector(`[data-paper-item-id^="s${si}-ws-answer"]`);
    } else {
      // 포함 해제 → 정답·해설이 사라지므로 그 위로 부드럽게 올라간 뒤 제거.
      scrollUpThenApply(blockAbovePrefix(`s${si}-ws-answer`) ?? `s${si}-ws-title`, apply);
    }
  }, [report, blockAbovePrefix, scrollToSelector, scrollUpThenApply, setReport]);

  // Delete 키로 선택 블록 삭제. 텍스트 편집 중이라도 필드가 '비어 있으면' 블록을
  // 지운다(방금 삽입한 빈 텍스트/여백 블록을 클릭 후 바로 삭제할 수 있도록).
  // 내용이 있는 필드를 편집 중일 때만 글자 삭제로 두고 블록은 보존한다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete" || !activeId) return;
      const ae = document.activeElement as HTMLElement | null;
      if (ae && (ae.isContentEditable || ae.tagName === "INPUT" || ae.tagName === "TEXTAREA")) {
        const text =
          ae.tagName === "INPUT" || ae.tagName === "TEXTAREA"
            ? (ae as HTMLInputElement | HTMLTextAreaElement).value
            : ae.textContent ?? "";
        if (text.trim().length > 0) return; // 실제 텍스트 편집 중 → 블록 보존
      }
      e.preventDefault();
      deleteActive(activeId);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeId, deleteActive]);

  // Cmd/Ctrl+Enter: 편집 중인 블록 앞에서 페이지 넘김(breakBefore 토글).
  // 텍스트의 Enter(줄바꿈)와 짝을 이루는 '페이지 단위 줄바꿈' 느낌의 동작.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey)) return;
      const ae = document.activeElement as HTMLElement | null;
      const field = ae?.closest?.(".par-edit-field") as HTMLElement | null;
      if (!field) return;
      const id = field
        .closest<HTMLElement>("[data-paper-item-id]")
        ?.getAttribute("data-paper-item-id");
      if (!id) return;
      e.preventDefault();
      const current = !!report.blockMeta?.[id]?.breakBefore;
      onBlockMeta(id, { breakBefore: !current });
      scrollToBlock(id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [report.blockMeta, onBlockMeta, scrollToBlock]);

  // 워드프로세서처럼: 블록의 왼쪽 여백/빈 영역을 클릭하면, 클릭한 줄에 해당하는
  // 편집 필드에 캐럿을 놓는다(필드 바깥이라 기본적으로는 커서가 안 잡히는 문제 보완).
  // 이렇게 들어간 커서에서 Enter(줄바꿈)·Cmd/Ctrl+Enter(페이지 넘김)를 바로 칠 수 있다.
  useEffect(() => {
    const caretRangeAt = (x: number, y: number): Range | null => {
      const doc = document as Document & {
        caretRangeFromPoint?: (x: number, y: number) => Range | null;
        caretPositionFromPoint?: (
          x: number,
          y: number,
        ) => { offsetNode: Node; offset: number } | null;
      };
      if (doc.caretRangeFromPoint) return doc.caretRangeFromPoint(x, y);
      const pos = doc.caretPositionFromPoint?.(x, y);
      if (!pos) return null;
      const r = document.createRange();
      r.setStart(pos.offsetNode, pos.offset);
      r.collapse(true);
      return r;
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      // 삽입 메뉴 자체 클릭은 버튼 onClick 에 맡긴다.
      if (target.closest("[data-insert-menu]")) return;
      // 그 외 어디를 누르든 열려있는 삽입 메뉴는 닫는다(빈 영역이면 아래서 다시 연다).
      setInsertMenu(null);
      if (!target.closest(".par-root-edit")) return;
      // 텍스트/인터랙티브 요소를 직접 클릭한 경우는 브라우저 기본 동작에 맡긴다.
      if (target.closest(".par-edit-field")) return;
      if (
        target.closest(
          "button, a, input, textarea, select, [role='button'], .par-edit-chrome, .par-egrip2",
        )
      )
        return;
      const block = target.closest<HTMLElement>(".par-eline[data-paper-item-id]");
      if (!block) {
        // 빈 영역(블록 사이/페이지 여백) 클릭 → 그 위치에 빈 텍스트 블록 생성.
        // 시트 본문(.par-sheet-body) 안일 때만 동작(회색 배경·패널 클릭은 무시).
        if (!target.closest(".par-sheet-body")) return;
        const blocks = Array.from(
          document.querySelectorAll<HTMLElement>(
            ".par-root-edit .par-eline[data-paper-item-id]",
          ),
        );
        let anchorId: string | null = null;
        let bestBottom = -Infinity;
        for (const b of blocks) {
          const br = b.getBoundingClientRect();
          if (br.bottom <= e.clientY && br.bottom > bestBottom) {
            bestBottom = br.bottom;
            anchorId = b.getAttribute("data-paper-item-id");
          }
        }
        e.preventDefault();
        // 즉시 삽입하지 않고, 클릭 위치에 "여백/텍스트" 선택 메뉴를 띄운다.
        setInsertMenu({ x: e.clientX, y: e.clientY, anchorId });
        return;
      }
      const fields = Array.from(
        block.querySelectorAll<HTMLElement>(".par-edit-field"),
      );
      if (fields.length === 0) return;

      const { clientX: x, clientY: y } = e;
      // 클릭한 줄(세로 위치)을 포함하는 필드 → 없으면 Y 기준 가장 가까운 필드.
      let field =
        fields.find((f) => {
          const r = f.getBoundingClientRect();
          return y >= r.top && y <= r.bottom;
        }) ?? null;
      if (!field) {
        let bestDist = Infinity;
        for (const f of fields) {
          const r = f.getBoundingClientRect();
          const d = Math.abs((r.top + r.bottom) / 2 - y);
          if (d < bestDist) {
            bestDist = d;
            field = f;
          }
        }
      }
      if (!field) return;
      const fld = field;
      const r = fld.getBoundingClientRect();
      const atStart = x <= r.left + r.width / 2; // 왼쪽 여백 → 줄 시작, 오른쪽 → 줄 끝
      e.preventDefault();
      // rAF 로 네이티브 포커스/선택 처리 이후에 캐럿을 확정한다.
      requestAnimationFrame(() => {
        fld.focus();
        const px = atStart ? r.left + 1 : r.right - 1;
        const py = Math.min(Math.max(y, r.top + 1), r.bottom - 1);
        let range = caretRangeAt(px, py);
        if (!range || !fld.contains(range.startContainer)) {
          range = document.createRange();
          range.selectNodeContents(fld);
          range.collapse(atStart);
        }
        const sel = window.getSelection();
        if (sel) {
          sel.removeAllRanges();
          sel.addRange(range);
        }
      });
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);
  const { startDrag } = usePaperItemDrag({
    setActiveItemId: setActiveId,
    setDraggingItemId: setDraggingId,
    setDragOverItemId: setDragOverId,
    setDragOverPartKey: () => {},
    setDragPlacement: setPlacement,
    onMoveItemToDropTarget: onReorder,
  });

  const edit: ReportEdit = useMemo(
    () => ({
      med,
      sectionEdit,
      activeId,
      setActiveId,
      onReorder,
      onBlockMeta,
      setCustom,
      insertTextAfter,
      ced,
      onResize,
      onColWidths,
      onDeletePage: deletePage,
      drag: { startDrag, draggingId, dragOverId, placement },
    }),
    [med, sectionEdit, activeId, onReorder, onBlockMeta, setCustom, insertTextAfter, ced, onResize, onColWidths, deletePage, startDrag, draggingId, dragOverId, placement],
  );

  const descriptors = useMemo(() => enumerateItems(report), [report]);
  // ─── 페이지 썸네일용 데이터 ───
  // 실제 블록 노드를 한 번만 계산해 모든 썸네일이 공유. 타이핑 중 썸네일
  // 재렌더가 입력을 끊지 않도록 deferred 값으로 낮은 우선순위로 갱신한다.
  const deferredReport = useDeferredValue(report);
  const thumbItemsById = useMemo(() => {
    const map = new Map<string, FlowItem>();
    for (const it of reportFlowItems(deferredReport)) map.set(it.id, it);
    return map;
  }, [deferredReport]);
  // 표지를 제외한 본문 페이지 번호/총수 (중앙 캔버스의 푸터 번호와 일치).
  const thumbPageInfo = useMemo(() => {
    const coverFlags = pageList.map(
      (ids) => ids.length === 1 && thumbItemsById.get(ids[0])?.wrap === "cover",
    );
    const bodyTotal = coverFlags.filter((c) => !c).length;
    let bodyNo = 0;
    const bodyNumbers = coverFlags.map((isCover) => (isCover ? 0 : ++bodyNo));
    return { coverFlags, bodyTotal, bodyNumbers };
  }, [pageList, thumbItemsById]);
  const orderedIds = useMemo(
    () => applyBlockOrder(descriptors.map((d) => d.id), report.blockOrder),
    [descriptors, report.blockOrder],
  );
  orderedIdsRef.current = orderedIds;
  const blockAbove = useCallback(
    (id: string) => {
      const i = orderedIds.indexOf(id);
      return i > 0 ? orderedIds[i - 1] : null;
    },
    [orderedIds],
  );
  const active: ItemDescriptor | null = useMemo(
    () => descriptors.find((d) => d.id === activeId) ?? null,
    [descriptors, activeId],
  );
  const activeMeta: BlockMeta = (activeId && report.blockMeta?.[activeId]) || {};
  const activePos = activeId ? orderedIds.indexOf(activeId) : -1;

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/workbench/passage-reports/prime/${passageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "저장에 실패했습니다.");
      const saved = (j.report as AnalysisReport) ?? report;
      dispatchReport({ type: "replace", report: saved, clearHistory: true });
      setBaseline(saved);
      onSaved?.(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [passageId, report, onSaved]);

  const revert = useCallback(() => {
    if (dirty && !window.confirm("저장하지 않은 편집을 모두 되돌릴까요?")) return;
    dispatchReport({ type: "replace", report: baseline, clearHistory: true });
    setActiveId(null);
  }, [dirty, baseline]);

  const undo = useCallback(() => {
    dispatchReport({ type: "undo" });
    setActiveId(null);
  }, []);

  const redo = useCallback(() => {
    dispatchReport({ type: "redo" });
    setActiveId(null);
  }, []);

  const fontScale = activeMeta.fontScale ?? 1;
  const setMetaPatch = (patch: Partial<BlockMeta>) => activeId && onBlockMeta(activeId, patch);
  const moveActive = (dir: -1 | 1) =>
    activeId && setReport((r) => ({ ...r, blockOrder: moveIdBy(orderedIds, activeId, dir) }));
  const addRow = (sectionIndex: number) =>
    setReport((r) => {
      const sec = r.sections[sectionIndex];
      if (!sec) return r;
      if (sec.kind === "passage") {
        const nextN = (sec.sentences.reduce((m, x) => Math.max(m, x.n), 0) || 0) + 1;
        return setSection(r, sectionIndex, { ...sec, sentences: [...sec.sentences, { n: nextN, en: "", ko: "" }] });
      }
      if (sec.kind === "vocabulary") return setSection(r, sectionIndex, { ...sec, rows: [...sec.rows, blankVocabRow()] });
      if (sec.kind === "grammar") return setSection(r, sectionIndex, { ...sec, rows: [...sec.rows, blankGrammarRow()] });
      if (sec.kind === "exam-focus") return setSection(r, sectionIndex, { ...sec, rows: [...sec.rows, blankExamRow()] });
      if (sec.kind === "summary") return setSection(r, sectionIndex, { ...sec, sentences: [...sec.sentences, ""] });
      return r;
    });

  // 상단 바 — 정답·해설지 포함 / 단어 시험지만 토글
  const toolbarWorksheetIndex = useMemo(
    () => report.sections.findIndex((section) => section.kind === "learning-worksheet"),
    [report.sections],
  );
  const toolbarWorksheetSection = toolbarWorksheetIndex >= 0 ? report.sections[toolbarWorksheetIndex] : null;
  const toolbarAnswerKeyIncluded =
    toolbarWorksheetSection?.kind === "learning-worksheet" ? !worksheetAnswersAreHidden(toolbarWorksheetSection) : false;

  // 첫 단어장 섹션 대상
  const toolbarVocabularyIndex = useMemo(
    () => report.sections.findIndex((section) => section.kind === "vocabulary"),
    [report.sections],
  );
  const toolbarVocabularySection = toolbarVocabularyIndex >= 0 ? report.sections[toolbarVocabularyIndex] : null;
  const toolbarVocabMode: VocabTestMode =
    toolbarVocabularySection?.kind === "vocabulary" ? toolbarVocabularySection.vocabTestMode ?? "study" : "study";
  const toolbarVocabTestLayout: VocabTestLayout =
    toolbarVocabularySection?.kind === "vocabulary" ? toolbarVocabularySection.vocabTestLayout ?? "table" : "table";
  const toolbarExcludedVocabTestCount =
    toolbarVocabularySection?.kind === "vocabulary" ? toolbarVocabularySection.vocabTestExcludedKeys?.length ?? 0 : 0;
  const canToggleToolbarVocabTestOnly =
    toolbarVocabularySection?.kind === "vocabulary" && toolbarVocabularySection.rows.length > 0;

  return (
    <div className="are-shell flex h-full min-h-0 flex-col overflow-hidden bg-[#F4F6F9]">
      <style dangerouslySetInnerHTML={{ __html: ANALYSIS_REPORT_EDIT_CSS }} />

      {/* 상단 바 */}
      <div className="no-print flex h-11 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4">
        <div className="flex min-w-0 items-center gap-2">
          <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="truncate text-[12px] font-bold text-slate-600">지문 학습자료 편집</span>
          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
            {pageList.length || 1}페이지
          </span>
          <span className="hidden shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 sm:inline-flex">
            {DESIGN_TEMPLATE_LABELS[report.themeId]}
          </span>
        </div>

        <div className="flex min-w-0 items-center justify-end gap-2">
          {error ? <span className="max-w-[260px] truncate text-[11px] text-red-500">{error}</span> : null}
          {dirty ? (
            <span className="hidden rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 sm:inline-flex">
              저장 필요
            </span>
          ) : null}
          {toolbarWorksheetSection?.kind === "learning-worksheet" ? (
            <button
              type="button"
              role="switch"
              aria-checked={toolbarAnswerKeyIncluded}
              data-answer-key-toolbar={toolbarAnswerKeyIncluded ? "include" : "exclude"}
              onClick={() => onToggleWorksheetAnswers(toolbarWorksheetIndex)}
              title="정답지·해설지 포함"
              className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-[11.5px] font-semibold transition-colors ${
                toolbarAnswerKeyIncluded
                  ? "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              <span className="hidden sm:inline">정답지·해설지 포함</span>
              <span className="sm:hidden">정답·해설</span>
              <span
                className={`relative h-4 w-7 rounded-full transition-colors ${
                  toolbarAnswerKeyIncluded ? "bg-sky-500" : "bg-slate-300"
                }`}
                aria-hidden="true"
              >
                <span
                  className={`absolute left-0 top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${
                    toolbarAnswerKeyIncluded ? "translate-x-3.5" : "translate-x-0.5"
                  }`}
                />
              </span>
              <span className={`text-[10px] font-bold ${toolbarAnswerKeyIncluded ? "text-sky-700" : "text-slate-400"}`}>
                {toolbarAnswerKeyIncluded ? "ON" : "OFF"}
              </span>
            </button>
          ) : null}
          {canToggleToolbarVocabTestOnly ? (
            <VocabTestToolbarPopover
              sectionIndex={toolbarVocabularyIndex}
              vocabMode={toolbarVocabMode}
              vocabTestLayout={toolbarVocabTestLayout}
              vocabTestOnly={!!report.vocabTestOnly}
              excludedVocabTestCount={toolbarExcludedVocabTestCount}
              onVocabTestMode={onVocabTestMode}
              onVocabTestLayout={onVocabTestLayout}
              onVocabTestOnly={onVocabTestOnly}
              onRestoreVocabTestRows={onRestoreVocabTestRows}
            />
          ) : null}
          <button
            type="button"
            onClick={undo}
            disabled={!canUndo || saving}
            title="되돌리기"
            aria-label="되돌리기"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Undo2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!canRedo || saving}
            title="앞으로 가기"
            aria-label="앞으로 가기"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Redo2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={revert}
            disabled={!dirty || saving}
            title="저장 전 상태로 되돌리기"
            aria-label="저장 전 상태로 되돌리기"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !dirty}
            className="flex h-8 min-w-[64px] items-center justify-center gap-1 rounded-md bg-slate-900 px-2 text-[11px] font-bold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            저장
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="flex h-8 min-w-[64px] items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-50"
          >
            <Printer className="h-3.5 w-3.5" />
            인쇄
          </button>
          {onExit ? (
            <button
              type="button"
              onClick={onExit}
              title="이전 단계로 돌아가기"
              aria-label="이전 단계로 돌아가기"
              className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden bg-white">
        {/* 좌측 — 페이지 인디케이터 */}
        {pagesPanelCollapsed ? (
          <button
            type="button"
            onClick={() => setPagesPanelCollapsed(false)}
            title="페이지 목록 열기"
            aria-label="페이지 목록 열기"
            aria-expanded={false}
            className="no-print hidden h-full min-h-0 w-5 shrink-0 select-none flex-col items-center justify-center gap-1 border-r border-slate-200 bg-white/80 py-2 text-[11px] font-semibold text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600 lg:flex"
          >
            <ChevronRight className="h-3.5 w-3.5" />
            <span style={{ writingMode: "vertical-rl" }}>페이지</span>
          </button>
        ) : (
          <>
          <aside style={{ width: railWidth }} className="no-print flex shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-white">
            <div className="flex h-11 shrink-0 items-center justify-between border-b border-slate-200 px-3">
              <div>
                <p className="text-[11px] font-black text-slate-700">페이지</p>
                <p className="text-[10px] font-semibold text-slate-400">{pageList.length || 1}장</p>
              </div>
              <button
                type="button"
                onClick={() => setPagesPanelCollapsed(true)}
                title="페이지 목록 닫기"
                aria-label="페이지 목록 닫기"
                className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
            </div>
            <div
              ref={pagesPanelScrollerRef}
              className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2.5 [scrollbar-gutter:stable]"
            >
              {pageList.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-2 py-4 text-center text-[11px] font-semibold text-slate-400">
                  페이지 계산 중
                </div>
              ) : (
                pageList.map((ids, pi) => {
                  const selected = activePageIndex === pi;
                  return (
                    <div key={pi} data-thumb-index={pi} className="group/page relative">
                      <button
                        type="button"
                        onClick={() => scrollToPage(pi)}
                        className={cn(
                          "flex w-full flex-col items-center rounded-lg border bg-white p-1.5 text-left shadow-sm transition-colors",
                          selected
                            ? "border-blue-300 bg-blue-50/70 shadow-[0_0_0_2px_rgba(59,130,246,0.10)]"
                            : "border-slate-200 hover:border-blue-200 hover:bg-slate-50",
                        )}
                        title={`${pi + 1}페이지로 이동`}
                        aria-current={selected ? "page" : undefined}
                      >
                        <PageMiniPreview
                          ids={ids}
                          report={deferredReport}
                          itemsById={thumbItemsById}
                          isCover={thumbPageInfo.coverFlags[pi]}
                          bodyNumber={thumbPageInfo.bodyNumbers[pi]}
                          bodyTotal={thumbPageInfo.bodyTotal}
                          selected={selected}
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => deletePage(ids)}
                        title="이 페이지 삭제"
                        aria-label="이 페이지 삭제"
                        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-red-200 bg-white text-red-500 opacity-0 shadow-sm transition hover:bg-red-50 group-hover/page:opacity-100"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </aside>
            <div
              onPointerDown={(event) => startWidthDrag(event, "rail")}
              title="페이지 목록 폭 조절"
              aria-hidden
              className="no-print hidden w-1.5 shrink-0 cursor-col-resize touch-none bg-slate-100 transition-colors hover:bg-blue-200 active:bg-blue-300 lg:block"
            />
          </>
        )}

        {/* 중앙 — A4 캔버스 (자연 크기, 드래그 autoscroll 용 id) */}
        <section className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-slate-100/70">
          <div className="relative min-h-0 flex-1 overflow-hidden">
            {pageList.length > 0 ? (
              <PreviewZoomControls
                zoom={zoom}
                position={zoomControlsPos}
                onZoomIn={zoomPreviewIn}
                onZoomOut={zoomPreviewOut}
                onReset={resetPreviewZoom}
                onFit={fitPreviewToScreen}
                onDragStart={handlePreviewZoomControlsDragStart}
              />
            ) : null}
            <div
              id="exam-paper-print-root"
              ref={previewScrollerRef}
              className="par-scroll h-full min-h-0 overflow-auto overscroll-contain px-5 py-5 [scrollbar-gutter:stable]"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) setActiveId(null);
              }}
            >
              <div
                className="mx-auto"
                style={{
                  width: REPORT_A4_WIDTH_PX * zoom,
                  height: previewContentHeight * zoom,
                }}
              >
                <div
                  style={{
                    width: REPORT_A4_WIDTH_PX,
                    transform: `scale(${zoom})`,
                    transformOrigin: "top left",
                  }}
                >
                  <ReportPages report={report} edit={edit} onPagesChange={setPageList} />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 인라인 텍스트 편집용 떠다니는 서식 툴바 */}
        <FloatingFormatToolbar blockMeta={report.blockMeta} onBlockMeta={onBlockMeta} />

        {/* 빈 영역 클릭 시 뜨는 블록 삽입 메뉴(여백/텍스트) */}
        {insertMenu
          ? createPortal(
              <div
                data-insert-menu
                role="menu"
                style={{
                  position: "fixed",
                  left: insertMenu.x,
                  top: insertMenu.y - 10,
                  transform: "translate(-50%, -100%)",
                }}
                className="no-print z-[80] flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 text-[12px] shadow-xl"
              >
                <span className="px-1.5 text-[11px] font-semibold text-slate-400">
                  여기에 추가
                </span>
                <button
                  type="button"
                  onClick={() => {
                    insertBlockAt("text", insertMenu.anchorId, "after");
                    setInsertMenu(null);
                  }}
                  className="rounded px-2 py-1 font-medium text-slate-600 hover:bg-blue-50 hover:text-blue-700"
                >
                  텍스트
                </button>
                <button
                  type="button"
                  onClick={() => {
                    insertBlockAt("spacer", insertMenu.anchorId, "after");
                    setInsertMenu(null);
                  }}
                  className="rounded px-2 py-1 font-medium text-slate-600 hover:bg-blue-50 hover:text-blue-700"
                >
                  여백
                </button>
                <span
                  aria-hidden="true"
                  className="absolute left-1/2 -bottom-1 size-2 -translate-x-1/2 rotate-45 border-b border-r border-slate-200 bg-white"
                />
              </div>,
              document.body,
            )
          : null}

        {/* 우측 — 속성 패널 */}
        {propertiesPanelCollapsed ? (
          <button
            type="button"
            onClick={() => setPropertiesPanelCollapsed(false)}
            title="편집 패널 열기"
            aria-label="편집 패널 열기"
            aria-expanded={false}
            className="no-print hidden h-full min-h-0 w-5 shrink-0 select-none flex-col items-center justify-center gap-1 border-l border-slate-200 bg-white/80 py-2 text-[11px] font-semibold text-sky-400 transition-colors hover:bg-sky-50 hover:text-sky-600 lg:flex"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            <span style={{ writingMode: "vertical-rl" }}>편집 패널</span>
          </button>
        ) : (
          <>
            <div
              onPointerDown={(event) => startWidthDrag(event, "panel")}
              title="편집 패널 폭 조절"
              aria-hidden
              className="no-print hidden w-1.5 shrink-0 cursor-col-resize touch-none bg-slate-100 transition-colors hover:bg-blue-200 active:bg-blue-300 lg:block"
            />
            <button
              type="button"
              onClick={() => setPropertiesPanelCollapsed(true)}
              title="편집 패널 닫기"
              aria-label="편집 패널 닫기"
              aria-expanded
              className="no-print hidden h-full min-h-0 w-5 shrink-0 select-none flex-col items-center justify-center gap-1 border-l border-slate-200 bg-white/80 py-2 text-[11px] font-semibold text-sky-400 transition-colors hover:bg-sky-50 hover:text-sky-600 lg:flex"
            >
              <ChevronRight className="h-3.5 w-3.5" />
              <span style={{ writingMode: "vertical-rl" }}>편집 패널</span>
            </button>
            <aside style={{ width: panelWidth }} className="no-print flex shrink-0 flex-col overflow-hidden border-l border-slate-200 bg-slate-50/80">
              <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3.5">
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-black text-slate-800">
                    {materialSettingsOpen ? "학습자료 설정" : "편집 패널"}
                  </p>
                  <p className="truncate text-[10.5px] font-semibold text-slate-400">
                    {materialSettingsOpen ? "표지·로고·디자인·템플릿" : active ? "선택 블록 조정" : "문서 설정"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {materialSettingsOpen ? (
                    <SettingsTemplatePopover
                      onSave={onSaveReportSettings}
                      onApply={onApplyReportSettings}
                      onDelete={onDeleteReportSettings}
                      onReset={onResetReportSettings}
                    />
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setMaterialSettingsOpen((v) => !v)}
                    title={materialSettingsOpen ? "편집 패널로 돌아가기" : "학습자료 설정"}
                    aria-label={materialSettingsOpen ? "편집 패널로 돌아가기" : "학습자료 설정"}
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition-colors",
                      materialSettingsOpen
                        ? "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800",
                    )}
                  >
                    {materialSettingsOpen ? <X className="h-4 w-4" /> : <Settings className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-2.5 [scrollbar-gutter:stable]">
                <PropertiesPanel
                  report={report}
                  active={active}
                  activeMeta={activeMeta}
                  activeCustom={(activeId && report.customBlocks?.find((b) => b.id === activeId)) || null}
                  activePos={activePos}
                  total={orderedIds.length}
                  fontScale={fontScale}
                  coverError={coverError}
                  onCoverPatch={setCoverPatch}
                  onLogoFile={onLogoFile}
                  onTheme={(t) => setReport((r) => ({ ...r, themeId: t }))}
                  onToggleEnglishPage={() => {
                    const turningOn = !report.englishOnlyPage;
                    setReport((r) => ({ ...r, englishOnlyPage: !r.englishOnlyPage }));
                    if (turningOn) scrollToBlock("english-only-0");
                    else scrollToPage(0);
                  }}
                  onBrand={(v) => setReport((r) => ({ ...r, brand: v }))}
                  settingsOpen={materialSettingsOpen}
                  onMetaPatch={setMetaPatch}
                  onMove={moveActive}
                  onAddRow={addRow}
                  onSetCustom={setCustom}
                  onDeleteItem={deleteActive}
                  onToggleCol={onToggleCol}
                  onToggleWorksheetAnswers={onToggleWorksheetAnswers}
                  onScrollToBlock={scrollToBlock}
                  onDeleteCustom={(id) => deleteActive(id)}
                  onDeleteSection={(si) => {
                    if (window.confirm("이 섹션 전체를 삭제할까요?")) {
                      const prev = blockAbove(`s${si}-head`);
                      setReport((r) => deleteSection(r, si));
                      setActiveId(null);
                      if (prev) scrollToBlock(prev);
                      else scrollToPage(0);
                    }
                  }}
                />
              </div>
            </aside>
          </>
        )}
      </div>
    </div>
  );
}

// ─── 우측 속성 패널 ───────────────────────────────────────────────────────────
const PAGE_THUMB_WIDTH_PX = 76;

const PageMiniPreview = memo(function PageMiniPreview({
  ids,
  report,
  itemsById,
  isCover,
  bodyNumber,
  bodyTotal,
  selected,
}: {
  ids: string[];
  report: AnalysisReport;
  itemsById: Map<string, FlowItem>;
  isCover: boolean;
  bodyNumber: number;
  bodyTotal: number;
  selected: boolean;
}) {
  return (
    <span
      className={cn(
        "relative inline-block overflow-hidden rounded-[3px] border bg-white shadow-sm",
        selected ? "border-blue-300" : "border-slate-200",
      )}
    >
      <ReportThumbnailSheet
        report={report}
        ids={ids}
        itemsById={itemsById}
        bodyNumber={bodyNumber}
        bodyTotal={bodyTotal}
        width={PAGE_THUMB_WIDTH_PX}
      />
      <span className="absolute bottom-1 right-1 rounded bg-white/90 px-1 text-[8px] font-black text-slate-500 shadow-sm">
        {isCover ? "C" : bodyNumber}
      </span>
    </span>
  );
});

/** 한 카드 안에서 도구를 묶는 소제목 그룹 (카드 분할 대신 내부 구획). */
function PanelGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-3 border-t border-slate-100 pt-3 first:mt-0 first:border-t-0 first:pt-0">
      <div className="mb-1.5 text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</div>
      {children}
    </div>
  );
}

type PanelSectionProps = {
  sectionId?: PanelSectionId;
  title: string;
  /** 스크롤 타겟용 DOM id (선택 시 이 카드로 자동 스크롤). */
  anchorId?: string;
  /** 헤더에 보조 표시할 현재 상태 요약(로컬 vocab/worksheet 패널에서 사용). */
  summary?: ReactNode;
  children: ReactNode;
  collapsed?: boolean;
  dragging?: boolean;
  dragOver?: boolean;
  onToggle?: (id: PanelSectionId) => void;
  onDragStart?: (event: DragEvent<HTMLButtonElement>, id: PanelSectionId) => void;
  onDragOver?: (event: DragEvent<HTMLElement>, id: PanelSectionId) => void;
  onDrop?: (event: DragEvent<HTMLElement>, id: PanelSectionId) => void;
  onDragEnd?: () => void;
};

function PanelSection({
  sectionId,
  title,
  anchorId,
  summary,
  children,
  collapsed = false,
  dragging = false,
  dragOver = false,
  onToggle,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: PanelSectionProps) {
  return (
    <section
      id={anchorId}
      onDragOver={(event) => sectionId && onDragOver?.(event, sectionId)}
      onDrop={(event) => sectionId && onDrop?.(event, sectionId)}
      className={cn(
        "mb-2.5 overflow-hidden rounded-lg border bg-white shadow-sm transition-all last:mb-0",
        dragOver ? "border-blue-300 shadow-[0_0_0_2px_rgba(59,130,246,0.12)]" : "border-slate-200",
        dragging && "opacity-50",
      )}
    >
      <div className="flex items-center gap-1 border-b border-slate-100 bg-slate-50/70 px-2 py-1.5">
        {sectionId ? (
          <button
            type="button"
            draggable
            onDragStart={(event) => onDragStart?.(event, sectionId)}
            onDragEnd={onDragEnd}
            className="flex h-6 w-6 cursor-grab items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white hover:text-slate-700 active:cursor-grabbing"
            title={`${title} 섹션 드래그`}
            aria-label={`${title} 섹션 드래그`}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => sectionId && onToggle?.(sectionId)}
          aria-expanded={!collapsed}
          className="flex min-w-0 flex-1 flex-col items-start gap-0.5 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-white"
          title={`${title} ${collapsed ? "펼치기" : "접기"}`}
        >
          <h4 className="w-full truncate text-[10.5px] font-black uppercase tracking-wide text-slate-500">{title}</h4>
          {summary ? (
            <span className="w-full truncate text-[10px] font-medium text-slate-400">{summary}</span>
          ) : null}
        </button>
        {sectionId ? (
          <button
            type="button"
            onClick={() => onToggle?.(sectionId)}
            className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white hover:text-slate-700"
            title={`${title} ${collapsed ? "펼치기" : "접기"}`}
            aria-label={`${title} ${collapsed ? "펼치기" : "접기"}`}
          >
            {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          </button>
        ) : null}
      </div>
      {!collapsed ? <div className="px-3 py-3">{children}</div> : null}
    </section>
  );
}

function SortablePanelStack({ children, blockSelected = false }: { children: ReactNode; blockSelected?: boolean }) {
  const [sectionOrder, setSectionOrder] = useState<PanelSectionId[]>(
    readStoredPanelSectionOrder,
  );
  const [collapsedSectionIds, setCollapsedSectionIds] = useState<PanelSectionId[]>(
    readStoredCollapsedPanelSections,
  );
  const [draggingSectionId, setDraggingSectionId] = useState<PanelSectionId | null>(null);
  const [dragOverSectionId, setDragOverSectionId] = useState<PanelSectionId | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(PANEL_SECTION_ORDER_STORAGE_KEY, JSON.stringify(sectionOrder));
    } catch {
      // Convenience setting only.
    }
  }, [sectionOrder]);

  useEffect(() => {
    try {
      window.localStorage.setItem(PANEL_SECTION_COLLAPSED_STORAGE_KEY, JSON.stringify(collapsedSectionIds));
    } catch {
      // Convenience setting only.
    }
  }, [collapsedSectionIds]);

  const togglePanelSection = useCallback(
    (id: PanelSectionId) => {
      // 블록 편집 중에는 다른 카드들이 강제로 접혀 있으므로(아래 collapsed 계산), 저장된 토글 선호값을
      // 건드리지 않도록 'block-edit' 외의 토글은 무시한다 → 선택 해제 시 원래 열림/접힘 상태가 그대로 복구.
      if (blockSelected && id !== "block-edit") return;
      setCollapsedSectionIds((current) =>
        current.includes(id) ? current.filter((sectionId) => sectionId !== id) : [...current, id],
      );
    },
    [blockSelected],
  );

  const reorderPanelSection = useCallback((sourceId: PanelSectionId, targetId: PanelSectionId) => {
    if (sourceId === targetId) return;
    setSectionOrder((current) => {
      const normalized = normalizePanelSectionOrder(current);
      const withoutSource = normalized.filter((sectionId) => sectionId !== sourceId);
      const targetIndex = withoutSource.indexOf(targetId);
      if (targetIndex < 0) return current;
      const next = [...withoutSource];
      next.splice(targetIndex, 0, sourceId);
      return next;
    });
  }, []);

  const handlePanelSectionDragStart = useCallback(
    (event: DragEvent<HTMLButtonElement>, id: PanelSectionId) => {
      setDraggingSectionId(id);
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", id);
    },
    [],
  );

  const handlePanelSectionDragOver = useCallback(
    (event: DragEvent<HTMLElement>, id: PanelSectionId) => {
      const sourceId = draggingSectionId;
      if (!sourceId || sourceId === id) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setDragOverSectionId(id);
    },
    [draggingSectionId],
  );

  const handlePanelSectionDrop = useCallback(
    (event: DragEvent<HTMLElement>, id: PanelSectionId) => {
      event.preventDefault();
      const data = event.dataTransfer.getData("text/plain");
      const sourceId = isPanelSectionId(data) ? data : draggingSectionId;
      if (sourceId) reorderPanelSection(sourceId, id);
      setDraggingSectionId(null);
      setDragOverSectionId(null);
    },
    [draggingSectionId, reorderPanelSection],
  );

  const handlePanelSectionDragEnd = useCallback(() => {
    setDraggingSectionId(null);
    setDragOverSectionId(null);
  }, []);

  const collectPanels = (node: ReactNode): ReactElement<PanelSectionProps>[] => {
    const out: ReactElement<PanelSectionProps>[] = [];
    Children.forEach(node, (child) => {
      if (!isValidElement(child)) return;
      const props = child.props as Partial<PanelSectionProps> & { children?: ReactNode };
      if (props.sectionId) out.push(child as ReactElement<PanelSectionProps>);
      else if (props.children) out.push(...collectPanels(props.children));
    });
    return out;
  };

  const panels = collectPanels(children);
  const panelById = new Map<PanelSectionId, ReactElement<PanelSectionProps>>();
  for (const panel of panels) {
    const id = panel.props.sectionId;
    if (id) panelById.set(id, panel);
  }

  const orderedIds = normalizePanelSectionOrder(sectionOrder).filter((id) => panelById.has(id));
  const collapsedSections = new Set(collapsedSectionIds);

  return (
    <div>
      {orderedIds.map((id) => {
        const panel = panelById.get(id);
        if (!panel) return null;
        // 블록 선택 중에는 '블록 편집' 카드만 자기 토글 상태를 따르고, 나머지는 모두 접는다.
        // (저장된 collapsedSectionIds 는 그대로 두므로 선택 해제 시 원상 복구됨)
        const collapsed = blockSelected && id !== "block-edit" ? true : collapsedSections.has(id);
        return cloneElement(panel, {
          collapsed,
          dragging: draggingSectionId === id,
          dragOver: dragOverSectionId === id,
          onToggle: togglePanelSection,
          onDragStart: handlePanelSectionDragStart,
          onDragOver: handlePanelSectionDragOver,
          onDrop: handlePanelSectionDrop,
          onDragEnd: handlePanelSectionDragEnd,
        });
      })}
    </div>
  );
}

function ToggleRow({
  label,
  on,
  onClick,
  icon,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      title={label}
      onClick={onClick}
      className={`inline-flex h-8 w-full items-center gap-1.5 rounded-md border px-2.5 text-[11.5px] font-semibold transition-colors ${
        on
          ? "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100"
          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      }`}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      <span
        className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${
          on ? "bg-sky-500" : "bg-slate-300"
        }`}
        aria-hidden="true"
      >
        <span
          className={`absolute left-0 top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${
            on ? "translate-x-3.5" : "translate-x-0.5"
          }`}
        />
      </span>
      <span className={`shrink-0 text-[10px] font-bold ${on ? "text-sky-700" : "text-slate-400"}`}>
        {on ? "ON" : "OFF"}
      </span>
    </button>
  );
}

const ADD_LABEL: Partial<Record<string, string>> = {
  passage: "문장",
  vocabulary: "단어",
  grammar: "문법 행",
  "exam-focus": "유형 행",
  summary: "요약문",
};

function PropertiesPanel({
  report,
  active,
  activeMeta,
  activeCustom,
  activePos,
  total,
  fontScale,
  onTheme,
  onMetaPatch,
  onMove,
  onAddRow,
  onSetCustom,
  onDeleteItem,
  onToggleCol,
  onToggleWorksheetAnswers,
  onScrollToBlock,
  onDeleteCustom,
  onDeleteSection,
  coverError,
  onCoverPatch,
  onLogoFile,
  onToggleEnglishPage,
  onBrand,
  settingsOpen,
}: {
  report: AnalysisReport;
  active: ItemDescriptor | null;
  activeMeta: BlockMeta;
  activeCustom: CustomBlock | null;
  activePos: number;
  total: number;
  fontScale: number;
  coverError: string | null;
  onCoverPatch: (patch: Partial<ReportCover>) => void;
  onLogoFile: (file?: File | null) => void;
  onToggleEnglishPage: () => void;
  onBrand: (value: string) => void;
  settingsOpen: boolean;
  onTheme: (t: ReportThemeId) => void;
  onMetaPatch: (patch: Partial<BlockMeta>) => void;
  onMove: (dir: -1 | 1) => void;
  onAddRow: (sectionIndex: number) => void;
  onSetCustom: (id: string, patch: Partial<CustomBlock>) => void;
  onDeleteItem: (id: string) => void;
  onToggleCol: (sectionIndex: number, key: string) => void;
  onToggleWorksheetAnswers: (sectionIndex: number) => void;
  onScrollToBlock: (id: string) => void;
  onDeleteCustom: (id: string) => void;
  onDeleteSection: (sectionIndex: number) => void;
}) {
  // 블록을 선택하면 '블록 편집' 카드가 화면 위쪽으로 자연스레 스크롤되어 도구가 최대한 보이게.
  const activeId = active?.id ?? null;
  useEffect(() => {
    if (!activeId) return;
    const el = document.getElementById("panel-block-edit");
    if (!el) return;
    const raf = requestAnimationFrame(() => el.scrollIntoView({ block: "start", behavior: "smooth" }));
    return () => cancelAnimationFrame(raf);
  }, [activeId]);
  const align = activeMeta.align ?? "left";
  const isCover = !!active && active.id === "cover";
  const isCustom = !!active && active.id.startsWith("c-");
  const isTitleMeta = !!active && (active.id === "title" || active.id === "meta");
  const isSectionItem = !!active && !isCustom && !isTitleMeta && !isCover;
  const cover = report.cover;
  const coverPanel = (
    <PanelSection sectionId="cover" title="표지 (Cover)">
      <CoverPanel
        report={report}
        cover={cover}
        onPatch={onCoverPatch}
      />
    </PanelSection>
  );
  const logoPanel = (
    <PanelSection sectionId="logo" title="학원 로고">
      <LogoPanel
        cover={cover}
        coverEnabled={!!cover?.enabled}
        error={coverError}
        onPatch={onCoverPatch}
        onLogoFile={onLogoFile}
        brand={report.brand}
        onBrand={onBrand}
      />
    </PanelSection>
  );
  const englishPagePanel = (
    <PanelSection sectionId="english-page" title="영어 원문 페이지">
      <ToggleRow
        label="표지 다음 영어 원문 페이지"
        on={!!report.englishOnlyPage}
        onClick={onToggleEnglishPage}
        icon={<FileText className="w-3.5 h-3.5" />}
      />
      <p className="mt-2 text-[10.5px] text-slate-400 leading-relaxed">
        켜면 표지 다음에 <b className="text-slate-500">제목 + 영어 원문</b>(해석·필기 없음)만 있는 페이지가 추가돼요.
      </p>
    </PanelSection>
  );
  const activeSection = active && active.sectionIndex >= 0 ? report.sections[active.sectionIndex] : null;
  const activeWorksheet = activeSection?.kind === "learning-worksheet" ? activeSection : null;
  const tableGroup =
    activeSection?.kind === "vocabulary"
      ? "vocab"
      : activeSection?.kind === "grammar"
        ? "grammar"
        : activeSection?.kind === "exam-focus"
          ? "exam"
          : null;
  const hiddenCols = new Set(
    activeSection && "hiddenCols" in activeSection ? (activeSection.hiddenCols as string[] | undefined) ?? [] : [],
  );
  const blockLabel = !active
    ? ""
    : isCustom
      ? activeCustom?.kind === "spacer"
        ? "여백 블록"
        : "텍스트 블록"
      : isTitleMeta
        ? "표지 / 메타"
        : NUMBERED_SECTION_LABELS[active.kind as AnalysisSection["kind"]];
  const addLabel = isSectionItem ? ADD_LABEL[(active as ItemDescriptor).kind] : undefined;

  if (settingsOpen) {
    return (
      <SortablePanelStack>
        {coverPanel}
        {englishPagePanel}
        {logoPanel}
        <PanelSection sectionId="theme" title="디자인 템플릿" summary={DESIGN_TEMPLATE_LABELS[report.themeId]}>
          <div className="flex flex-col gap-1.5">
            {reportThemeIdSchema.options.map((t) => {
              const theme = REPORT_THEMES[t];
              const selected = report.themeId === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => onTheme(t)}
                  className={`flex items-center gap-2 text-left text-[12px] px-2.5 py-1.5 rounded-md border transition-colors ${
                    selected ? "font-semibold" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                  style={selected ? { borderColor: theme.ink, backgroundColor: theme.tint, color: theme.ink } : undefined}
                >
                  <span className="flex h-4 w-8 overflow-hidden rounded border border-white shadow-sm" aria-hidden>
                    <span className="flex-1" style={{ backgroundColor: theme.ink }} />
                    <span className="flex-1" style={{ backgroundColor: theme.gold }} />
                  </span>
                  <span className="min-w-0 flex-1">{DESIGN_TEMPLATE_LABELS[t]}</span>
                </button>
              );
            })}
          </div>
        </PanelSection>
      </SortablePanelStack>
    );
  }

  return (
    <SortablePanelStack blockSelected={!!active && !isCover}>
      {isCover ? (
        <PanelSection sectionId="cover-edit" title="표지 편집">
          <p className="text-[12px] text-slate-400 leading-relaxed">
            표지 텍스트(제목·부제·학원명 등)는 보고서에서 <b className="text-slate-500">직접 클릭</b>해 수정해요.
            <br />
            <span className="text-slate-300">표지 템플릿은 표지 패널에서, 로고는 학원 로고 패널에서 변경합니다.</span>
          </p>
        </PanelSection>
      ) : !active ? (
        <>
          <PanelSection sectionId="guide" title="블록 편집">
            <p className="text-[12px] text-slate-400 leading-relaxed">
              보고서에서 <b className="text-slate-500">블록을 클릭</b>하면 여기에서
              글자 크기·굵게·정렬·페이지 분할·순서·숨김을 조정할 수 있어요.
              <br />
              <span className="text-slate-300">⠿ 핸들 드래그로 순서 변경 · 블록 하단 드래그로 높이 조절.</span>
            </p>
          </PanelSection>
        </>
      ) : (
        <>
          <PanelSection sectionId="block-edit" title="블록 편집" anchorId="panel-block-edit">
          <PanelGroup label="선택한 블록">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-slate-700">{blockLabel}</span>
              {isSectionItem && !active.isSectionStart ? (
                <span className="text-[10px] text-slate-400">이어지는 블록</span>
              ) : null}
            </div>
            <div className="mt-1 text-[11px] text-slate-400">
              순서 {activePos + 1} / {total}
            </div>
            {addLabel ? (
              <button
                type="button"
                onClick={() => onAddRow(active.sectionIndex)}
                className="mt-2.5 w-full inline-flex items-center justify-center gap-1.5 text-[12px] px-2 py-1.5 rounded-md border border-dashed border-blue-300 text-blue-600 hover:bg-blue-50"
              >
                <Plus className="w-3.5 h-3.5" /> {addLabel} 추가
              </button>
            ) : null}
          </PanelGroup>

          {activeCustom?.kind === "spacer" ? (
            <PanelGroup label="여백 높이">
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={SPACER_MIN_MM}
                  max={120}
                  value={activeCustom.heightMm}
                  onChange={(e) => onSetCustom(activeCustom.id, { heightMm: Number(e.target.value) })}
                  className="flex-1 accent-blue-600"
                />
                <span className="text-[11px] font-semibold text-slate-500 w-12 text-right">{Math.round(activeCustom.heightMm)}mm</span>
              </div>
            </PanelGroup>
          ) : null}

          {activeCustom?.kind !== "spacer" ? (
          <PanelGroup label="서식">
            {/* 글자 크기 */}
            <div className="mb-2.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[12px] text-slate-600">글자 크기</span>
                <span className="text-[11px] font-semibold text-slate-500">{Math.round(fontScale * 100)}%</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onMetaPatch({ fontScale: Math.max(0.7, Math.round((fontScale - 0.1) * 10) / 10) })}
                  className="flex-1 inline-flex justify-center items-center h-8 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onMetaPatch({ fontScale: 1 })}
                  className="px-2.5 h-8 rounded-md border border-slate-200 text-[11px] text-slate-500 hover:bg-slate-50"
                >
                  100%
                </button>
                <button
                  type="button"
                  onClick={() => onMetaPatch({ fontScale: Math.min(1.4, Math.round((fontScale + 0.1) * 10) / 10) })}
                  className="flex-1 inline-flex justify-center items-center h-8 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            {/* 굵게 */}
            <div className="mb-2.5">
              <ToggleRow
                label="굵게"
                on={!!activeMeta.bold}
                onClick={() => onMetaPatch({ bold: !activeMeta.bold })}
                icon={<Bold className="w-3.5 h-3.5" />}
              />
            </div>
            {/* 정렬 */}
            <div className="flex items-center gap-1.5">
              {(["left", "center", "right"] as const).map((a) => {
                const Icon = a === "left" ? AlignLeft : a === "center" ? AlignCenter : AlignRight;
                return (
                  <button
                    key={a}
                    type="button"
                    onClick={() => onMetaPatch({ align: a })}
                    className={`flex-1 inline-flex justify-center items-center h-8 rounded-md border ${
                      align === a ? "border-blue-500 bg-blue-50 text-blue-600" : "border-slate-200 text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </button>
                );
              })}
            </div>
          </PanelGroup>
          ) : null}

          {tableGroup ? (
            <PanelGroup label="표 열 표시">
              <div className="flex flex-col gap-1">
                {TABLE_COLUMNS[tableGroup].map((c) => {
                  const shown = !hiddenCols.has(c.key);
                  return (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => active && onToggleCol(active.sectionIndex, c.key)}
                      className={`flex items-center justify-between px-2.5 py-1.5 rounded-md border text-[12px] ${
                        shown ? "border-slate-200 text-slate-600 hover:bg-slate-50" : "border-slate-200 bg-slate-50 text-slate-300 line-through"
                      }`}
                    >
                      <span>{c.label}</span>
                      {shown ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[10.5px] text-slate-400">불필요한 열(예: 동의어·발음)을 표 전체에서 끌 수 있어요.</p>
            </PanelGroup>
          ) : null}

          {activeWorksheet ? (
            <PanelGroup label="학습지 출력">
              <ToggleRow
                label="정답·오답 분석 숨김"
                on={worksheetAnswersAreHidden(activeWorksheet)}
                onClick={() => onToggleWorksheetAnswers(active.sectionIndex)}
              />
              <p className="mt-2 text-[10.5px] text-slate-400 leading-relaxed">
                학생 배포용으로 쓸 때는 정답과 오답 분석을 숨기고, 해설지로 쓸 때는 다시 켜면 돼요.
              </p>
            </PanelGroup>
          ) : null}

          <PanelGroup label="페이지 조판">
            <div className="space-y-2">
              <ToggleRow
                label="앞 블록과 한 페이지에 (분리 금지)"
                on={!!activeMeta.keepWithPrev}
                onClick={() => {
                  onMetaPatch({ keepWithPrev: !activeMeta.keepWithPrev });
                  if (active) onScrollToBlock(active.id);
                }}
              />
              <ToggleRow
                label="새 페이지에서 시작"
                on={!!activeMeta.breakBefore}
                onClick={() => {
                  onMetaPatch({ breakBefore: !activeMeta.breakBefore });
                  if (active) onScrollToBlock(active.id);
                }}
              />
            </div>
            <p className="mt-2 text-[10.5px] text-slate-400 leading-relaxed">
              아래로 넘어간 블록은 <b className="text-slate-500">분리 금지</b>를 켜면 앞 블록과 함께 위로 끌어올려져요.
            </p>
            {activeMeta.minHeight ? (
              <button
                type="button"
                onClick={() => onMetaPatch({ minHeight: undefined })}
                className="mt-2 w-full text-[12px] px-2 py-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                높이 초기화 ({Math.round(activeMeta.minHeight)}mm)
              </button>
            ) : null}
          </PanelGroup>

          <PanelGroup label="순서 / 표시">
            <div className="grid grid-cols-2 gap-1.5 mb-2">
              <button
                type="button"
                onClick={() => onMove(-1)}
                disabled={activePos <= 0}
                className="text-[12px] px-2 py-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                ↑ 위로
              </button>
              <button
                type="button"
                onClick={() => onMove(1)}
                disabled={activePos >= total - 1}
                className="text-[12px] px-2 py-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                ↓ 아래로
              </button>
            </div>
            {!isTitleMeta ? (
              <ToggleRow
                label={activeMeta.hidden ? "숨김 (인쇄 제외)" : "표시 중"}
                on={!!activeMeta.hidden}
                onClick={() => onMetaPatch({ hidden: !activeMeta.hidden })}
                icon={activeMeta.hidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              />
            ) : null}
          </PanelGroup>

          {isSectionItem && active.isSectionStart ? (
            <PanelGroup label="섹션">
              <button
                type="button"
                onClick={() => onDeleteSection(active.sectionIndex)}
                className="w-full inline-flex items-center justify-center gap-1.5 text-[12px] px-2 py-2 rounded-md border border-red-200 text-red-600 hover:bg-red-50"
              >
                <Trash2 className="w-3.5 h-3.5" /> 섹션 전체 삭제
              </button>
            </PanelGroup>
          ) : null}

          {isCustom ? (
            <PanelGroup label={activeCustom?.kind === "spacer" ? "여백 블록" : "텍스트 블록"}>
              <button
                type="button"
                onClick={() => onDeleteCustom(active.id)}
                className="w-full inline-flex items-center justify-center gap-1.5 text-[12px] px-2 py-2 rounded-md border border-red-200 text-red-600 hover:bg-red-50"
              >
                <Trash2 className="w-3.5 h-3.5" /> 블록 삭제
              </button>
            </PanelGroup>
          ) : null}

          {isSectionItem && !active.isSectionStart ? (
            <PanelGroup label="이 블록">
              <button
                type="button"
                onClick={() => onDeleteItem(active.id)}
                className="w-full inline-flex items-center justify-center gap-1.5 text-[12px] px-2 py-2 rounded-md border border-red-200 text-red-600 hover:bg-red-50"
              >
                <Trash2 className="w-3.5 h-3.5" /> 삭제 <span className="text-[10px] text-red-300">(Del)</span>
              </button>
            </PanelGroup>
          ) : null}
          </PanelSection>

        </>
      )}

    </SortablePanelStack>
  );
}

// ─── 표지 / 로고 패널 ────────────────────────────────────────────────────────

function LogoPanel({
  cover,
  coverEnabled,
  error,
  onPatch,
  onLogoFile,
  brand,
  onBrand,
}: {
  cover: ReportCover | undefined;
  coverEnabled: boolean;
  error: string | null;
  onPatch: (patch: Partial<ReportCover>) => void;
  onLogoFile: (file?: File | null) => void;
  brand: string;
  onBrand: (value: string) => void;
}) {
  const logoAlign = cover?.logoAlign ?? "center";
  const [brandDraft, setBrandDraft] = useState(brand);
  useEffect(() => setBrandDraft(brand), [brand]);
  const [logoDropActive, setLogoDropActive] = useState(false);
  const logoDragDepthRef = useRef(0);

  const handleLogoDragEnter = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    logoDragDepthRef.current += 1;
    event.dataTransfer.dropEffect = "copy";
    setLogoDropActive(true);
  }, []);

  const handleLogoDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  const handleLogoDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    logoDragDepthRef.current = Math.max(0, logoDragDepthRef.current - 1);
    if (logoDragDepthRef.current === 0) setLogoDropActive(false);
  }, []);

  const handleLogoDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      logoDragDepthRef.current = 0;
      setLogoDropActive(false);
      onLogoFile(event.dataTransfer.files?.[0] || null);
    },
    [onLogoFile],
  );

  return (
    <div>
      <div className="mb-2.5">
        <label className="mb-1 block text-[11px] font-bold text-slate-500">학원명 (머리말·꼬리말)</label>
        <input
          type="text"
          value={brandDraft}
          onChange={(e) => setBrandDraft(e.target.value)}
          onBlur={() => {
            const v = brandDraft.trim();
            if (v && v !== brand) onBrand(v);
            else if (!v) setBrandDraft(brand);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          placeholder="예: ENGLISH READING LAB"
          className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-[12px] font-semibold text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
        <p className="mt-1 text-[10px] leading-snug text-slate-400">모든 페이지 머리말·꼬리말의 학원명이 한 번에 바뀌어요.</p>
      </div>
      <div
        onDragEnter={handleLogoDragEnter}
        onDragOver={handleLogoDragOver}
        onDragLeave={handleLogoDragLeave}
        onDrop={handleLogoDrop}
        title="이미지 파일을 드래그해서 놓기"
        className={cn(
          "relative rounded-lg border bg-white p-2 transition-colors",
          logoDropActive ? "border-blue-300 bg-blue-50/70 ring-2 ring-blue-100" : "border-slate-200",
        )}
      >
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-slate-50 transition-colors",
              logoDropActive ? "border-blue-300 bg-white" : "border-slate-200",
            )}
          >
            {cover?.logoDataUrl ? (
              <NextImage
                src={cover.logoDataUrl}
                alt="학원 로고 미리보기"
                width={56}
                height={56}
                unoptimized
                className="h-full w-full object-contain p-1"
              />
            ) : (
              <ImagePlus className="h-5 w-5 text-slate-300" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <label className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 text-[12px] font-bold text-blue-700 hover:bg-blue-100">
              <ImagePlus className="h-3.5 w-3.5" />
              로고 넣기
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(event) => {
                  onLogoFile(event.target.files?.[0] || null);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            <p className="mt-1 text-[10px] leading-snug text-slate-400">PNG/JPG 권장, 1.5MB 이하</p>
          </div>
          {cover?.logoDataUrl ? (
            <button
              type="button"
              onClick={() => onPatch({ logoDataUrl: undefined, logoX: undefined, logoY: undefined })}
              className="h-7 rounded-md border border-slate-200 px-2 text-[11px] font-bold text-slate-500 hover:bg-slate-50"
            >
              삭제
            </button>
          ) : null}
        </div>
      </div>

      {error ? <p className="mt-1 text-[11px] text-red-500">{error}</p> : null}

      {cover?.logoDataUrl ? (
        <div className="mt-2 space-y-2">
          <ToggleRow
            label="보고서에 로고 표시"
            on={cover.showLogo !== false}
            onClick={() => onPatch({ showLogo: cover.showLogo === false })}
            icon={cover.showLogo === false ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          />
          <div className="flex items-center gap-1.5">
            {(["left", "center", "right"] as const).map((a) => {
              const Icon = a === "left" ? AlignLeft : a === "center" ? AlignCenter : AlignRight;
              return (
                <button
                  key={a}
                  type="button"
                  onClick={() => onPatch({ logoAlign: a })}
                  title={`표지 로고 ${a === "left" ? "왼쪽" : a === "center" ? "가운데" : "오른쪽"} 정렬`}
                  className={`inline-flex h-7 flex-1 items-center justify-center rounded-md border ${
                    logoAlign === a ? "border-blue-500 bg-blue-50 text-blue-600" : "border-slate-200 text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-500">크기</span>
            <input
              type="range"
              min={6}
              max={60}
              value={cover.logoHeightMm ?? 14}
              onChange={(e) => onPatch({ logoHeightMm: Number(e.target.value) })}
              className="flex-1 accent-blue-600"
            />
            <span className="w-10 text-right text-[11px]">{Math.round(cover.logoHeightMm ?? 14)}mm</span>
          </div>
          {coverEnabled ? (
            <>
              <p className="text-[10.5px] text-slate-400">표지 위 로고를 <b className="text-slate-500">드래그</b>해 현재 보고서에서만 위치를 조정할 수 있어요.</p>
              {typeof cover.logoX === "number" ? (
                <button
                  type="button"
                  onClick={() => onPatch({ logoX: undefined, logoY: undefined })}
                  className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-[12px] text-slate-600 hover:bg-slate-50"
                >
                  로고 위치 초기화 (정렬로)
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function CoverPanel({
  report,
  cover,
  onPatch,
}: {
  report: AnalysisReport;
  cover: ReportCover | undefined;
  onPatch: (patch: Partial<ReportCover>) => void;
}) {
  const enabled = !!cover?.enabled;
  const tpl = (cover?.templateId ?? "classic-center") as CoverTemplateId;

  return (
    <>
      <ToggleRow label="표지 페이지 사용" on={enabled} onClick={() => onPatch({ enabled: !enabled })} icon={<BookImage className="w-3.5 h-3.5" />} />
      {!enabled ? (
        <p className="mt-2 text-[10.5px] text-slate-400 leading-relaxed">
          켜면 첫 페이지에 표지가 생깁니다. <b className="text-slate-500">끄면 설정은 보존</b>돼요(페이지 번호에는 미포함).
        </p>
      ) : (
        <div className="mt-3 space-y-3.5">
          {/* 템플릿 갤러리 (실제 축소 렌더) */}
          <div>
            <div className="text-[11px] text-slate-400 mb-1.5">템플릿</div>
            <div className="grid grid-cols-3 gap-1.5">
              {coverTemplateIdSchema.options.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => onPatch({ templateId: t })}
                  title={COVER_TEMPLATE_LABELS[t]}
                  className={`rounded-md p-0.5 border ${tpl === t ? "border-blue-500 ring-1 ring-blue-300" : "border-slate-200 hover:border-slate-300"}`}
                >
                  <CoverPreview report={report} templateId={t} widthPx={62} />
                  <div className="text-[8.5px] text-slate-500 truncate mt-0.5 text-center">{COVER_TEMPLATE_LABELS[t]}</div>
                </button>
              ))}
            </div>
          </div>

          <ToggleRow label="메타 정보(분류·난이도) 표시" on={!!cover?.showMeta} onClick={() => onPatch({ showMeta: !cover?.showMeta })} />

          <p className="text-[10.5px] text-slate-400 leading-relaxed">표지 텍스트는 보고서에서 직접 클릭해 수정해요.</p>
        </div>
      )}
    </>
  );
}
