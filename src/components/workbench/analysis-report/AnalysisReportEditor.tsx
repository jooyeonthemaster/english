"use client";

import NextImage from "next/image";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bookmark,
  Bold,
  ChevronDown,
  BookImage,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Eye,
  EyeOff,
  FileQuestion,
  FileText,
  GripVertical,
  ImagePlus,
  Languages,
  Loader2,
  LogOut,
  Minus,
  Plus,
  Printer,
  Redo2,
  RotateCcw,
  Rows3,
  Save,
  Trash2,
  Type,
  Undo2,
} from "lucide-react";
import {
  Children,
  cloneElement,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
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
  deleteCustomBlock,
  deleteItem,
  deleteSection,
  hideOrDeleteIds,
  moveIdBy,
  newCustomBlockId,
  reorderIds,
  setBlockMeta,
  setCustomBlock,
  setMeta,
  setSection,
  setVocabularyTestLayout,
  setVocabularyTestMode,
  setVocabularyTestOnly,
  toggleTableCol,
} from "./editor-mutations";
import { ANALYSIS_REPORT_EDIT_CSS } from "./report-edit-styles";

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
const PANEL_SECTION_ORDER_STORAGE_KEY =
  "smoat.analysisReportEditor.propertiesPanel.sectionOrder.v1";
const PANEL_SECTION_COLLAPSED_STORAGE_KEY =
  "smoat.analysisReportEditor.propertiesPanel.sectionCollapsed.v1";
const REPORT_LOGO_SETTINGS_STORAGE_KEY =
  "smoat.analysisReportEditor.logoSettings.v1";
const PANEL_SECTION_IDS = [
  "cover",
  "logo",
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
  "vocab-test",
  "theme",
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

type ReportLogoSettings = {
  logoDataUrl?: string;
  showLogo: boolean;
  logoAlign: NonNullable<ReportCover["logoAlign"]>;
  logoHeightMm: number;
  savedAt: string;
};

const DEFAULT_LOGO_SETTINGS: ReportLogoSettings = {
  showLogo: true,
  logoAlign: "center",
  logoHeightMm: 14,
  savedAt: "",
};

function isLogoAlign(value: unknown): value is ReportLogoSettings["logoAlign"] {
  return value === "left" || value === "center" || value === "right";
}

function normalizeLogoSettings(input: unknown): ReportLogoSettings | null {
  if (!input || typeof input !== "object") return null;
  const candidate = input as Partial<ReportLogoSettings>;
  return {
    logoDataUrl: typeof candidate.logoDataUrl === "string" ? candidate.logoDataUrl : undefined,
    showLogo: typeof candidate.showLogo === "boolean" ? candidate.showLogo : true,
    logoAlign: isLogoAlign(candidate.logoAlign) ? candidate.logoAlign : "center",
    logoHeightMm: Math.min(60, Math.max(6, Number(candidate.logoHeightMm) || 14)),
    savedAt: typeof candidate.savedAt === "string" ? candidate.savedAt : "",
  };
}

function readSavedLogoSettings(): ReportLogoSettings | null {
  if (typeof window === "undefined") return null;
  try {
    return normalizeLogoSettings(
      JSON.parse(window.localStorage.getItem(REPORT_LOGO_SETTINGS_STORAGE_KEY) || ""),
    );
  } catch {
    return null;
  }
}

function writeSavedLogoSettings(settings: ReportLogoSettings): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(
      REPORT_LOGO_SETTINGS_STORAGE_KEY,
      JSON.stringify({ ...settings, savedAt: new Date().toISOString() }),
    );
    return true;
  } catch {
    return false;
  }
}

function clearSavedLogoSettings(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(REPORT_LOGO_SETTINGS_STORAGE_KEY);
}

function logoSettingsFromCover(cover?: ReportCover): ReportLogoSettings {
  return {
    logoDataUrl: cover?.logoDataUrl,
    showLogo: cover?.showLogo ?? true,
    logoAlign: cover?.logoAlign ?? "center",
    logoHeightMm: cover?.logoHeightMm ?? 14,
    savedAt: "",
  };
}

function logoSettingsToCoverPatch(settings: ReportLogoSettings): Partial<ReportCover> {
  return {
    logoDataUrl: settings.logoDataUrl,
    showLogo: settings.showLogo,
    logoAlign: settings.logoAlign,
    logoHeightMm: settings.logoHeightMm,
    logoX: undefined,
    logoY: undefined,
  };
}

function coverWithoutLogoSettings(cover: ReportCover): Partial<ReportCover> {
  const next: Partial<ReportCover> = { ...cover };
  delete next.logoDataUrl;
  delete next.showLogo;
  delete next.logoAlign;
  delete next.logoHeightMm;
  delete next.logoX;
  delete next.logoY;
  return next;
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
  onSaved?: (report: AnalysisReport) => void;
  onExit?: () => void;
}

export function AnalysisReportEditor({ passageId, initialReport, onSaved, onExit }: Props) {
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [placement, setPlacement] = useState<DropPlacement>("before");

  const dirty = report !== baseline;
  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

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

  const setCustom = useCallback((id: string, patch: Partial<CustomBlock>) => {
    setReport((r) => setCustomBlock(r, id, patch));
  }, [setReport]);

  const onResize = useCallback((id: string, mm: number) => {
    setReport((r) => {
      const cb = r.customBlocks?.find((b) => b.id === id);
      if (cb?.kind === "spacer") {
        // 여백 블록은 heightMm 로 직접 반영 + 잔여 minHeight 제거(이중 높이 방지)
        const r2 = setCustomBlock(r, id, { heightMm: Math.min(237, Math.max(2, mm)) });
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

  // 여백 / 자유 텍스트 블록을 선택 블록 뒤(없으면 끝)에 삽입
  const insertCustom = useCallback(
    (kind: "spacer" | "text") => {
      setReport((r) => {
        const id = newCustomBlockId();
        const cb: CustomBlock = kind === "spacer" ? { kind: "spacer", id, heightMm: 16 } : { kind: "text", id, text: "" };
        const withBlock = { ...r, customBlocks: [...(r.customBlocks ?? []), cb] };
        const naturalIds = enumerateItems(withBlock).map((d) => d.id);
        const anchorId = activeId ?? naturalIds[naturalIds.length - 2] ?? naturalIds[naturalIds.length - 1];
        const fullOrder = applyBlockOrder(naturalIds, withBlock.blockOrder);
        const blockOrder = anchorId ? reorderIds(fullOrder, id, anchorId, "after") : fullOrder;
        return { ...withBlock, blockOrder };
      });
      setActiveId(null);
    },
    [activeId, setReport],
  );

  const [pageList, setPageList] = useState<string[][]>([]);
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [pagesPanelCollapsed, setPagesPanelCollapsed] = useState(false);
  const [propertiesPanelCollapsed, setPropertiesPanelCollapsed] = useState(false);
  const previewScrollerRef = useRef<HTMLDivElement>(null);
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
    setReport((r) => deleteItem(r, id));
    setActiveId(null);
  }, [setReport]);
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
    setReport((r) => setVocabularyTestMode(r, si, mode));
    scrollToBlock(mode === "study" ? `s${si}-head` : `s${si}-vocab-test-head`);
  }, [scrollToBlock, setReport]);
  const onVocabTestLayout = useCallback((si: number, layout: VocabTestLayout) => {
    setReport((r) => setVocabularyTestLayout(r, si, layout));
    scrollToBlock(`s${si}-vocab-test-head`);
  }, [scrollToBlock, setReport]);
  const onVocabTestOnly = useCallback(
    (si: number, enabled: boolean, mode: Exclude<VocabTestMode, "study"> = "hide-meaning") => {
      setReport((r) => setVocabularyTestOnly(r, si, enabled, mode));
      scrollToBlock(enabled ? `s${si}-vocab-test-head` : `s${si}-head`);
    },
    [scrollToBlock, setReport],
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
    setReport((r) => {
      const sec = r.sections[si];
      if (!sec || sec.kind !== "learning-worksheet") return r;
      return setSection(r, si, { ...sec, hiddenAnswers: !worksheetAnswersAreHidden(sec) });
    });
    scrollToBlock(`s${si}-ws-title`);
  }, [scrollToBlock, setReport]);

  // Delete 키로 선택 블록 삭제 (텍스트 편집 중이면 무시)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete" || !activeId) return;
      const ae = document.activeElement as HTMLElement | null;
      if (ae && (ae.isContentEditable || ae.tagName === "INPUT" || ae.tagName === "TEXTAREA")) return;
      e.preventDefault();
      deleteActive(activeId);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeId, deleteActive]);

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
      ced,
      onResize,
      onDeletePage: deletePage,
      drag: { startDrag, draggingId, dragOverId, placement },
    }),
    [med, sectionEdit, activeId, onReorder, onBlockMeta, setCustom, ced, onResize, deletePage, startDrag, draggingId, dragOverId, placement],
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

  // 상단 바 — 단어 시험지만/전체 자료 보기 토글 (첫 단어장 섹션 대상)
  const toolbarVocabularyIndex = useMemo(
    () => report.sections.findIndex((section) => section.kind === "vocabulary"),
    [report.sections],
  );
  const toolbarVocabularySection = toolbarVocabularyIndex >= 0 ? report.sections[toolbarVocabularyIndex] : null;
  const toolbarVocabMode: VocabTestMode =
    toolbarVocabularySection?.kind === "vocabulary" ? toolbarVocabularySection.vocabTestMode ?? "study" : "study";
  const canToggleToolbarVocabTestOnly =
    toolbarVocabularySection?.kind === "vocabulary" && toolbarVocabularySection.rows.length > 0;
  const toggleToolbarVocabTestOnly = useCallback(() => {
    if (!canToggleToolbarVocabTestOnly || toolbarVocabularyIndex < 0) return;
    if (report.vocabTestOnly) {
      onVocabTestOnly(toolbarVocabularyIndex, false);
      return;
    }
    onVocabTestOnly(
      toolbarVocabularyIndex,
      true,
      toolbarVocabMode === "hide-headword" ? "hide-headword" : "hide-meaning",
    );
  }, [canToggleToolbarVocabTestOnly, onVocabTestOnly, report.vocabTestOnly, toolbarVocabMode, toolbarVocabularyIndex]);

  return (
    <div className="are-shell flex h-full min-h-0 flex-col overflow-hidden bg-[#F4F6F9]">
      <style dangerouslySetInnerHTML={{ __html: ANALYSIS_REPORT_EDIT_CSS }} />

      {/* 상단 바 */}
      <div className="no-print flex h-11 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4">
        <div className="flex min-w-0 items-center gap-2">
          <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="truncate text-[12px] font-bold text-slate-600">A4 보고서 편집</span>
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
          {canToggleToolbarVocabTestOnly ? (
            <button
              type="button"
              data-vocab-test-only-toolbar={report.vocabTestOnly ? "restore" : "only"}
              onClick={toggleToolbarVocabTestOnly}
              className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-[12px] font-medium transition-colors ${
                report.vocabTestOnly
                  ? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              <FileQuestion className={`h-3.5 w-3.5 ${report.vocabTestOnly ? "text-blue-600" : "text-amber-500"}`} />
              {report.vocabTestOnly ? "전체 자료 보기" : "단어 시험지만"}
            </button>
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
              onClick={() => {
                if (dirty && !window.confirm("저장하지 않은 편집이 있습니다. 보기 모드로 나갈까요?")) return;
                onExit();
              }}
              className="flex h-8 min-w-[64px] items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-50"
              title="보기 모드로 나가기"
            >
              <LogOut className="h-3.5 w-3.5" />
              보기
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
          <aside className="no-print flex w-[112px] shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-white">
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
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2.5 [scrollbar-gutter:stable]">
              {pageList.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-2 py-4 text-center text-[11px] font-semibold text-slate-400">
                  페이지 계산 중
                </div>
              ) : (
                pageList.map((ids, pi) => {
                  const selected = activePageIndex === pi;
                  return (
                    <div key={pi} className="group/page relative">
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
            <aside className="no-print flex w-[304px] shrink-0 flex-col overflow-hidden border-l border-slate-200 bg-slate-50/80">
              <div className="flex h-11 shrink-0 items-center border-b border-slate-200 bg-white px-3.5">
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-black text-slate-800">편집 패널</p>
                  <p className="truncate text-[10.5px] font-semibold text-slate-400">
                    {active ? "선택 블록 조정" : "문서 설정"}
                  </p>
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
                  onApplyCover={(cv) =>
                    setReport((r) => ({
                      ...r,
                      cover: {
                        ...COVER_DEFAULTS,
                        ...(r.cover ?? {}),
                        ...coverWithoutLogoSettings(cv),
                        enabled: true,
                      },
                    }))
                  }
                  onTheme={(t) => setReport((r) => ({ ...r, themeId: t }))}
                  onMetaPatch={setMetaPatch}
                  onMove={moveActive}
                  onAddRow={addRow}
                  onInsertCustom={insertCustom}
                  onSetCustom={setCustom}
                  onDeleteItem={deleteActive}
                  onToggleCol={onToggleCol}
                  onVocabTestLayout={onVocabTestLayout}
                  onVocabTestOnly={onVocabTestOnly}
                  onVocabTestMode={onVocabTestMode}
                  onRestoreVocabTestRows={onRestoreVocabTestRows}
                  onToggleWorksheetAnswers={onToggleWorksheetAnswers}
                  onDeleteCustom={(id) => {
                    setReport((r) => deleteCustomBlock(r, id));
                    setActiveId(null);
                  }}
                  onDeleteSection={(si) => {
                    if (window.confirm("이 섹션 전체를 삭제할까요?")) {
                      setReport((r) => deleteSection(r, si));
                      setActiveId(null);
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

type PanelSectionProps = {
  sectionId?: PanelSectionId;
  title: string;
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

function SortablePanelStack({ children }: { children: ReactNode }) {
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

  const togglePanelSection = useCallback((id: PanelSectionId) => {
    setCollapsedSectionIds((current) =>
      current.includes(id) ? current.filter((sectionId) => sectionId !== id) : [...current, id],
    );
  }, []);

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
        return cloneElement(panel, {
          collapsed: collapsedSections.has(id),
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
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-2.5 py-2 rounded-md border text-[12px] font-medium transition-colors ${
        on ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"
      }`}
    >
      {icon}
      <span className="flex-1 text-left">{label}</span>
      <span className={`text-[10px] ${on ? "text-blue-600" : "text-slate-300"}`}>{on ? "ON" : "OFF"}</span>
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
  onInsertCustom,
  onSetCustom,
  onDeleteItem,
  onToggleCol,
  onVocabTestLayout,
  onVocabTestOnly,
  onVocabTestMode,
  onRestoreVocabTestRows,
  onToggleWorksheetAnswers,
  onDeleteCustom,
  onDeleteSection,
  coverError,
  onCoverPatch,
  onLogoFile,
  onApplyCover,
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
  onApplyCover: (cover: ReportCover) => void;
  onTheme: (t: ReportThemeId) => void;
  onMetaPatch: (patch: Partial<BlockMeta>) => void;
  onMove: (dir: -1 | 1) => void;
  onAddRow: (sectionIndex: number) => void;
  onInsertCustom: (kind: "spacer" | "text") => void;
  onSetCustom: (id: string, patch: Partial<CustomBlock>) => void;
  onDeleteItem: (id: string) => void;
  onToggleCol: (sectionIndex: number, key: string) => void;
  onVocabTestLayout: (sectionIndex: number, layout: VocabTestLayout) => void;
  onVocabTestOnly: (sectionIndex: number, enabled: boolean, mode?: Exclude<VocabTestMode, "study">) => void;
  onVocabTestMode: (sectionIndex: number, mode: VocabTestMode) => void;
  onRestoreVocabTestRows: (sectionIndex: number) => void;
  onToggleWorksheetAnswers: (sectionIndex: number) => void;
  onDeleteCustom: (id: string) => void;
  onDeleteSection: (sectionIndex: number) => void;
}) {
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
        onApplyCover={onApplyCover}
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
      />
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
  const fallbackVocabularyIndex = report.sections.findIndex((section) => section.kind === "vocabulary");
  const fallbackVocabularySection = fallbackVocabularyIndex >= 0 ? report.sections[fallbackVocabularyIndex] : null;
  const vocabularyTarget =
    active && activeSection?.kind === "vocabulary"
      ? { section: activeSection, index: active.sectionIndex }
      : fallbackVocabularySection?.kind === "vocabulary"
        ? { section: fallbackVocabularySection, index: fallbackVocabularyIndex }
        : null;
  const vocabMode: VocabTestMode = vocabularyTarget?.section.vocabTestMode ?? "study";
  const vocabTestLayout: VocabTestLayout = vocabularyTarget?.section.vocabTestLayout ?? "table";
  const excludedVocabTestCount = vocabularyTarget?.section.vocabTestExcludedKeys?.length ?? 0;
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

  const InsertSection = (
    <PanelSection sectionId="insert" title="블록 삽입">
      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={() => onInsertCustom("spacer")}
          className="inline-flex items-center justify-center gap-1.5 text-[12px] px-2 py-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
        >
          <Rows3 className="w-3.5 h-3.5" /> 여백
        </button>
        <button
          type="button"
          onClick={() => onInsertCustom("text")}
          className="inline-flex items-center justify-center gap-1.5 text-[12px] px-2 py-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
        >
          <Type className="w-3.5 h-3.5" /> 텍스트
        </button>
      </div>
      <p className="mt-2 text-[10.5px] text-slate-400 leading-relaxed">
        선택한 블록 <b className="text-slate-500">뒤</b>에 삽입돼요. 여백은 하단을 드래그해 높이를 조절할 수 있어요.
      </p>
    </PanelSection>
  );

  const VocabTestSection = vocabularyTarget ? (
    <PanelSection
      sectionId="vocab-test"
      title="단어 시험지"
      summary={
        report.vocabTestOnly
          ? "단어 시험지만 표시"
          : vocabMode === "study"
            ? "추가 안 함"
            : vocabMode === "hide-meaning"
              ? "뜻 쓰기 시험지 추가"
              : "단어 쓰기 시험지 추가"
      }
    >
      <div className="grid grid-cols-3 gap-1.5">
        {([
          { mode: "study", label: "추가 안 함", icon: BookOpen },
          { mode: "hide-meaning", label: "뜻 쓰기", icon: Languages },
          { mode: "hide-headword", label: "단어 쓰기", icon: FileQuestion },
        ] as const).map(({ mode, label, icon: Icon }) => (
          <button
            key={mode}
            type="button"
            data-vocab-mode={mode}
            onClick={() => onVocabTestMode(vocabularyTarget.index, mode)}
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
              onClick={() => onVocabTestLayout(vocabularyTarget.index, layout)}
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
        data-vocab-test-only={report.vocabTestOnly ? "restore" : "only"}
        onClick={() => {
          if (report.vocabTestOnly) {
            onVocabTestOnly(vocabularyTarget.index, false);
            return;
          }
          onVocabTestOnly(
            vocabularyTarget.index,
            true,
            vocabMode === "hide-headword" ? "hide-headword" : "hide-meaning",
          );
        }}
        className={`mt-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-[12px] font-semibold transition-colors ${
          report.vocabTestOnly
            ? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
        }`}
      >
        <FileQuestion className={`h-3.5 w-3.5 ${report.vocabTestOnly ? "text-blue-600" : "text-amber-500"}`} />
        {report.vocabTestOnly ? "전체 자료 다시 보이기" : "단어 시험지만 만들기"}
      </button>
      {excludedVocabTestCount > 0 ? (
        <button
          type="button"
          onClick={() => onRestoreVocabTestRows(vocabularyTarget.index)}
          className="mt-1.5 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11.5px] font-medium text-slate-600 transition-colors hover:bg-slate-50"
        >
          제외한 단어 다시 포함 ({excludedVocabTestCount})
        </button>
      ) : null}
      <p className="mt-2 text-[10.5px] leading-relaxed text-slate-400">
        단어장 블록을 따로 선택하지 않아도 여기에서 바로 시험지만 추가하거나 끌 수 있습니다.
      </p>
    </PanelSection>
  ) : null;

  return (
    <SortablePanelStack>
      {coverPanel}
      {logoPanel}
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
          {InsertSection}
        </>
      ) : (
        <>
          <PanelSection sectionId="selected" title="선택한 블록">
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
          </PanelSection>

          {activeCustom?.kind === "spacer" ? (
            <PanelSection sectionId="spacer-height" title="여백 높이">
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={2}
                  max={120}
                  value={activeCustom.heightMm}
                  onChange={(e) => onSetCustom(activeCustom.id, { heightMm: Number(e.target.value) })}
                  className="flex-1 accent-blue-600"
                />
                <span className="text-[11px] font-semibold text-slate-500 w-12 text-right">{Math.round(activeCustom.heightMm)}mm</span>
              </div>
            </PanelSection>
          ) : null}

          {activeCustom?.kind !== "spacer" ? (
          <PanelSection sectionId="format" title="서식">
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
          </PanelSection>
          ) : null}

          {tableGroup ? (
            <PanelSection sectionId="table-cols" title="표 열 표시">
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
            </PanelSection>
          ) : null}

          {activeWorksheet ? (
            <PanelSection
              sectionId="worksheet"
              title="학습지 출력"
              summary={worksheetAnswersAreHidden(activeWorksheet) ? "정답·오답 분석 숨김" : "정답·오답 분석 표시"}
            >
              <ToggleRow
                label="정답·오답 분석 숨김"
                on={worksheetAnswersAreHidden(activeWorksheet)}
                onClick={() => onToggleWorksheetAnswers(active.sectionIndex)}
              />
              <p className="mt-2 text-[10.5px] text-slate-400 leading-relaxed">
                학생 배포용으로 쓸 때는 정답과 오답 분석을 숨기고, 해설지로 쓸 때는 다시 켜면 돼요.
              </p>
            </PanelSection>
          ) : null}

          <PanelSection sectionId="layout" title="페이지 조판">
            <div className="space-y-2">
              <ToggleRow
                label="앞 블록과 한 페이지에 (분리 금지)"
                on={!!activeMeta.keepWithPrev}
                onClick={() => onMetaPatch({ keepWithPrev: !activeMeta.keepWithPrev })}
              />
              <ToggleRow
                label="새 페이지에서 시작"
                on={!!activeMeta.breakBefore}
                onClick={() => onMetaPatch({ breakBefore: !activeMeta.breakBefore })}
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
          </PanelSection>

          <PanelSection sectionId="order" title="순서 / 표시">
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
          </PanelSection>

          {isSectionItem && active.isSectionStart ? (
            <PanelSection sectionId="section" title="섹션">
              <button
                type="button"
                onClick={() => onDeleteSection(active.sectionIndex)}
                className="w-full inline-flex items-center justify-center gap-1.5 text-[12px] px-2 py-2 rounded-md border border-red-200 text-red-600 hover:bg-red-50"
              >
                <Trash2 className="w-3.5 h-3.5" /> 섹션 전체 삭제
              </button>
            </PanelSection>
          ) : null}

          {isCustom ? (
            <PanelSection sectionId="custom" title={activeCustom?.kind === "spacer" ? "여백 블록" : "텍스트 블록"}>
              <button
                type="button"
                onClick={() => onDeleteCustom(active.id)}
                className="w-full inline-flex items-center justify-center gap-1.5 text-[12px] px-2 py-2 rounded-md border border-red-200 text-red-600 hover:bg-red-50"
              >
                <Trash2 className="w-3.5 h-3.5" /> 블록 삭제
              </button>
            </PanelSection>
          ) : null}

          {isSectionItem && !active.isSectionStart ? (
            <PanelSection sectionId="delete" title="이 블록">
              <button
                type="button"
                onClick={() => onDeleteItem(active.id)}
                className="w-full inline-flex items-center justify-center gap-1.5 text-[12px] px-2 py-2 rounded-md border border-red-200 text-red-600 hover:bg-red-50"
              >
                <Trash2 className="w-3.5 h-3.5" /> 삭제 <span className="text-[10px] text-red-300">(Del)</span>
              </button>
            </PanelSection>
          ) : null}

          {InsertSection}
        </>
      )}

      {VocabTestSection}

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

// ─── 표지 / 로고 패널 ────────────────────────────────────────────────────────
interface CoverPresetRow {
  id: string;
  name: string;
  cover: ReportCover;
  updatedAt: string;
}

function LogoPanel({
  cover,
  coverEnabled,
  error,
  onPatch,
  onLogoFile,
}: {
  cover: ReportCover | undefined;
  coverEnabled: boolean;
  error: string | null;
  onPatch: (patch: Partial<ReportCover>) => void;
  onLogoFile: (file?: File | null) => void;
}) {
  const logoAlign = cover?.logoAlign ?? "center";
  const [logoDropActive, setLogoDropActive] = useState(false);
  const [savedSettingsAvailable, setSavedSettingsAvailable] = useState(
    () => Boolean(readSavedLogoSettings()),
  );
  const [settingsNotice, setSettingsNotice] = useState("");
  const logoDragDepthRef = useRef(0);

  useEffect(() => {
    if (!settingsNotice) return;
    const timer = window.setTimeout(() => setSettingsNotice(""), 1800);
    return () => window.clearTimeout(timer);
  }, [settingsNotice]);

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

  const saveLogoSettings = useCallback(() => {
    const saved = writeSavedLogoSettings(logoSettingsFromCover(cover));
    setSavedSettingsAvailable(saved);
    setSettingsNotice(saved ? "현재 로고 설정을 저장했어요." : "저장하지 못했어요.");
  }, [cover]);

  const applySavedLogoSettings = useCallback(() => {
    const settings = readSavedLogoSettings();
    if (!settings) {
      setSavedSettingsAvailable(false);
      setSettingsNotice("저장된 로고 설정이 없어요.");
      return;
    }
    onPatch(logoSettingsToCoverPatch(settings));
    setSavedSettingsAvailable(true);
    setSettingsNotice("저장된 로고 설정을 적용했어요.");
  }, [onPatch]);

  const resetLogoSettings = useCallback(() => {
    clearSavedLogoSettings();
    onPatch(logoSettingsToCoverPatch(DEFAULT_LOGO_SETTINGS));
    setSavedSettingsAvailable(false);
    setSettingsNotice("로고 설정을 기본값으로 되돌렸어요.");
  }, [onPatch]);

  return (
    <div>
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

      <div className="mt-3 border-t border-slate-100 pt-3">
        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={saveLogoSettings}
            className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 text-[11px] font-bold text-blue-700 hover:bg-blue-100"
          >
            <Save className="h-3.5 w-3.5" />
            저장
          </button>
          <button
            type="button"
            onClick={applySavedLogoSettings}
            disabled={!savedSettingsAvailable}
            className="h-8 rounded-md border border-slate-200 px-2 text-[11px] font-bold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            적용
          </button>
          <button
            type="button"
            onClick={resetLogoSettings}
            className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-slate-200 px-2 text-[11px] font-bold text-slate-500 hover:bg-slate-50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            기본값
          </button>
        </div>
        <p className="mt-1.5 min-h-[14px] text-[10.5px] font-semibold leading-snug text-slate-400">
          {settingsNotice || "저장한 로고 설정은 다른 보고서에서 적용할 수 있어요."}
        </p>
      </div>
    </div>
  );
}

function CoverPanel({
  report,
  cover,
  onPatch,
  onApplyCover,
}: {
  report: AnalysisReport;
  cover: ReportCover | undefined;
  onPatch: (patch: Partial<ReportCover>) => void;
  onApplyCover: (cover: ReportCover) => void;
}) {
  const enabled = !!cover?.enabled;
  const tpl = (cover?.templateId ?? "classic-center") as CoverTemplateId;

  const [presets, setPresets] = useState<CoverPresetRow[]>([]);
  const [presetName, setPresetName] = useState("");
  const [presetBusy, setPresetBusy] = useState(false);
  const [presetsOpen, setPresetsOpen] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/workbench/cover-presets")
      .then((r) => r.json())
      .then((j) => !cancelled && Array.isArray(j?.presets) && setPresets(j.presets as CoverPresetRow[]))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  const savePreset = useCallback(async () => {
    const name = presetName.trim() || `표지 저장본 ${presets.length + 1}`;
    if (!cover) return;
    setPresetBusy(true);
    try {
      const res = await fetch("/api/workbench/cover-presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, cover: coverWithoutLogoSettings(cover) }),
      });
      const j = await res.json();
      if (res.ok && j?.preset) {
        setPresets((p) => [j.preset as CoverPresetRow, ...p]);
        setPresetName("");
        setPresetsOpen(true);
      }
    } finally {
      setPresetBusy(false);
    }
  }, [presetName, cover, presets.length]);
  const deletePreset = useCallback(async (id: string) => {
    setPresets((p) => p.filter((x) => x.id !== id));
    await fetch(`/api/workbench/cover-presets/${id}`, { method: "DELETE" }).catch(() => {});
  }, []);
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

          {/* 프리셋 — 학원 공용 저장·재사용 */}
          <div className="pt-3 border-t border-slate-100">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <div className="text-[11px] text-slate-400">프리셋 (학원 공용)</div>
              <button
                type="button"
                onClick={() => setPresetsOpen((open) => !open)}
                disabled={!presets.length}
                className="flex items-center gap-1 rounded-md border border-blue-100 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                title="저장본 목록"
                aria-expanded={presetsOpen}
              >
                <Bookmark className="h-2.5 w-2.5" />
                저장본
                <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-blue-600 text-[9px] font-bold leading-none text-white">
                  {presets.length}
                </span>
                <ChevronDown className={cn("h-2.5 w-2.5 transition-transform", presetsOpen && "rotate-180")} />
              </button>
            </div>
            <div className="flex gap-1.5 mb-2">
              <input
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder={`표지 저장본 ${presets.length + 1}`}
                className="flex-1 min-w-0 text-[12px] px-2 py-1.5 rounded-md border border-slate-200 focus:border-blue-400 outline-none"
              />
              <button
                type="button"
                onClick={savePreset}
                disabled={presetBusy || !cover}
                className="text-[12px] px-2.5 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
              >
                저장
              </button>
            </div>
            {presetsOpen && presets.length ? (
              <div className="rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
                <div className="max-h-[260px] space-y-1.5 overflow-y-auto pr-1">
                {presets.map((p) => (
                  <div key={p.id} className="group flex items-center gap-2 rounded-md border border-slate-100 p-1.5 transition-colors hover:border-blue-200 hover:bg-blue-50/40">
                    <button
                      type="button"
                      onClick={() => onApplyCover(p.cover)}
                      title={`${p.name} — 적용`}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <CoverPreview report={report} coverOverride={p.cover} widthPx={34} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] font-bold text-slate-700">{p.name}</span>
                        <span className="block text-[10px] text-slate-400">클릭해서 불러오기</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => deletePreset(p.id)}
                      title="프리셋 삭제"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-red-100 bg-white text-red-400 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                </div>
              </div>
            ) : !presets.length ? (
              <p className="text-[10.5px] text-slate-300">저장한 프리셋이 여기에 모여 다른 지문에서도 재사용돼요.</p>
            ) : null}
          </div>

          <p className="text-[10.5px] text-slate-400 leading-relaxed">표지 텍스트는 보고서에서 직접 클릭해 수정해요.</p>
        </div>
      )}
    </>
  );
}
