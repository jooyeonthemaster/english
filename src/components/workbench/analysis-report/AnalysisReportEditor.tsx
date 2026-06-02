"use client";

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  BookImage,
  BookOpen,
  ChevronDown,
  Check,
  Eye,
  EyeOff,
  FileQuestion,
  ImageUp,
  Languages,
  Loader2,
  Minus,
  Plus,
  Printer,
  RotateCcw,
  RotateCw,
  Rows3,
  Trash2,
  Type,
} from "lucide-react";
import { type CSSProperties, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { usePaperItemDrag } from "@/components/exams/paper-builder/components/a4-paper-page-parts/use-paper-item-drag";
import { REPORT_THEMES } from "@/lib/passage-report/analysis-report/design-tokens";
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
  ReportPageThumbnails,
  enumerateItems,
  type ItemDescriptor,
  type DropPlacement,
  type ReportEdit,
} from "./report-pages";
import { TABLE_COLUMNS } from "./report-sections";
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
  setVocabularyTestOnly,
  setVocabularyTestMode,
  toggleTableCol,
} from "./editor-mutations";
import { ANALYSIS_REPORT_EDIT_CSS } from "./report-edit-styles";

const THEME_LABELS: Record<ReportThemeId, string> = {
  "veritas-navy": "네이비 · 골드",
  "scholar-ink": "잉크 · 버건디",
  "fresh-teal": "틸 · 슬레이트",
};

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
  enabled: true,
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
  const [report, setReport] = useState<AnalysisReport>(initialReport);
  const [baseline, setBaseline] = useState<AnalysisReport>(initialReport);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [placement, setPlacement] = useState<DropPlacement>("before");

  const dirty = report !== baseline;
  const [history, setHistory] = useState<{ past: AnalysisReport[]; future: AnalysisReport[] }>({
    past: [],
    future: [],
  });
  const historyModeRef = useRef<"track" | "silent">("track");
  const previousReportRef = useRef(report);
  const reportRef = useRef(report);
  const historyRef = useRef(history);

  useEffect(() => {
    reportRef.current = report;
  }, [report]);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    const previous = previousReportRef.current;
    if (previous === report) {
      if (historyModeRef.current === "silent") historyModeRef.current = "track";
      return;
    }
    if (historyModeRef.current === "silent") {
      historyModeRef.current = "track";
      previousReportRef.current = report;
      return;
    }
    setHistory((h) => ({
      past: [...h.past, previous].slice(-80),
      future: [],
    }));
    previousReportRef.current = report;
  }, [report]);

  const replaceReportSilently = useCallback((next: AnalysisReport, resetHistory = false) => {
    historyModeRef.current = "silent";
    previousReportRef.current = next;
    reportRef.current = next;
    setReport(next);
    if (resetHistory) setHistory({ past: [], future: [] });
  }, []);

  const undo = useCallback(() => {
    const currentHistory = historyRef.current;
    const previous = currentHistory.past[currentHistory.past.length - 1];
    if (!previous) return;
    const current = reportRef.current;
    setHistory({
      past: currentHistory.past.slice(0, -1),
      future: [current, ...currentHistory.future].slice(0, 80),
    });
    replaceReportSilently(previous);
  }, [replaceReportSilently]);

  const redo = useCallback(() => {
    const currentHistory = historyRef.current;
    const next = currentHistory.future[0];
    if (!next) return;
    const current = reportRef.current;
    setHistory({
      past: [...currentHistory.past, current].slice(-80),
      future: currentHistory.future.slice(1),
    });
    replaceReportSilently(next);
  }, [replaceReportSilently]);

  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  // 콘텐츠 편집 콜백 (안정적)
  const med = useMemo(() => ({ commit: (next: ReportMeta) => setReport((r) => setMeta(r, next)) }), []);
  const sectionEdit = useCallback(
    (index: number) => ({ commit: (next: AnalysisSection) => setReport((r) => setSection(r, index, next)) }),
    [],
  );

  const onReorder = useCallback((sourceId: string, targetId: string, place: DropPlacement) => {
    setReport((r) => {
      const ids = applyBlockOrder(enumerateItems(r).map((b) => b.id), r.blockOrder);
      return { ...r, blockOrder: reorderIds(ids, sourceId, targetId, place) };
    });
  }, []);

  const onBlockMeta = useCallback((id: string, patch: Partial<BlockMeta>) => {
    setReport((r) => setBlockMeta(r, id, patch));
  }, []);

  const setCustom = useCallback((id: string, patch: Partial<CustomBlock>) => {
    setReport((r) => setCustomBlock(r, id, patch));
  }, []);

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
  }, []);

  // ── 표지(Cover) ──
  const [coverError, setCoverError] = useState<string | null>(null);
  const ced = useMemo(() => ({ commit: (next: ReportCover) => setReport((r) => ({ ...r, cover: next })) }), []);
  const setCoverPatch = useCallback((patch: Partial<ReportCover>) => {
    setReport((r) => ({ ...r, cover: { ...COVER_DEFAULTS, ...(r.cover ?? {}), ...patch } }));
  }, []);
  const onLogoFile = useCallback(
    async (file?: File | null) => {
      if (!file) return;
      setCoverError(null);
      try {
        const url = await downscaleImage(file);
        if (url.length > 900_000) {
          setCoverError("로고 용량이 큽니다. 더 작거나 단순한 이미지를 사용하세요.");
          return;
        }
        setCoverPatch({ logoDataUrl: url, showLogo: true });
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
    [activeId],
  );

  const [pageList, setPageList] = useState<string[][]>([]);
  const [activePageIndex, setActivePageIndex] = useState(0);
  const paperScrollRef = useRef<HTMLDivElement | null>(null);
  const thumbScrollRef = useRef<HTMLDivElement | null>(null);
  const deleteActive = useCallback((id: string) => {
    setReport((r) => deleteItem(r, id));
    setActiveId(null);
  }, []);
  const deletePage = useCallback((ids: string[]) => {
    if (!ids.length) return;
    if (!window.confirm(`이 페이지의 블록 ${ids.length}개를 삭제할까요?`)) return;
    setReport((r) => hideOrDeleteIds(r, ids));
  }, []);
  const onToggleCol = useCallback((si: number, key: string) => {
    setReport((r) => toggleTableCol(r, si, key));
  }, []);
  const scrollToBlock = useCallback((id: string) => {
    window.setTimeout(() => {
      const root = document.getElementById("exam-paper-print-root");
      const el =
        root?.querySelector<HTMLElement>(`[data-paper-item-id="${id}"]`) ??
        root?.querySelector<HTMLElement>(`.par-root-edit > .par-sheet [data-mid="${id}"]`);
      if (root && el) {
        const rootRect = root.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        root.scrollTo({
          top: Math.max(0, root.scrollTop + elRect.top - rootRect.top - 18),
          behavior: "smooth",
        });
      }
      const pageEl = el?.closest<HTMLElement>("[data-page-index]");
      const pageIndex = Number(pageEl?.dataset.pageIndex);
      if (Number.isFinite(pageIndex)) setActivePageIndex(pageIndex);
      setActiveId(id);
    }, 160);
  }, []);
  const onVocabTestMode = useCallback((si: number, mode: VocabTestMode) => {
    setReport((r) => setVocabularyTestMode(r, si, mode));
    scrollToBlock(mode === "study" ? `s${si}-head` : `s${si}-vocab-test-head`);
  }, [scrollToBlock]);
  const onVocabTestLayout = useCallback((si: number, layout: VocabTestLayout) => {
    setReport((r) => setVocabularyTestLayout(r, si, layout));
    scrollToBlock(`s${si}-vocab-test-head`);
  }, [scrollToBlock]);
  const onVocabTestOnly = useCallback(
    (si: number, enabled: boolean, mode: Exclude<VocabTestMode, "study"> = "hide-meaning") => {
      setReport((r) => setVocabularyTestOnly(r, si, enabled, mode));
      scrollToBlock(enabled ? `s${si}-vocab-test-head` : `s${si}-head`);
    },
    [scrollToBlock],
  );
  const onRestoreVocabTestRows = useCallback((si: number) => {
    setReport((r) => {
      const sec = r.sections[si];
      if (!sec || sec.kind !== "vocabulary") return r;
      return setSection(r, si, { ...sec, vocabTestExcludedKeys: undefined });
    });
    scrollToBlock(`s${si}-vocab-test-head`);
  }, [scrollToBlock]);
  const onToggleWorksheetAnswers = useCallback((si: number) => {
    setReport((r) => {
      const sec = r.sections[si];
      if (!sec || sec.kind !== "learning-worksheet") return r;
      return setSection(r, si, { ...sec, hiddenAnswers: !worksheetAnswersAreHidden(sec) });
    });
    scrollToBlock(`s${si}-ws-title`);
  }, [scrollToBlock]);
  const selectPage = useCallback((pageIndex: number) => {
    setActivePageIndex(pageIndex);
    const root = paperScrollRef.current;
    const page = root?.querySelector<HTMLElement>(`[data-page-index="${pageIndex}"]`);
    if (!root || !page) return;
    const rootRect = root.getBoundingClientRect();
    const pageRect = page.getBoundingClientRect();
    root.scrollTo({
      top: Math.max(0, root.scrollTop + pageRect.top - rootRect.top),
      behavior: "smooth",
    });
  }, []);

  useEffect(() => {
    const root = paperScrollRef.current;
    if (!root || pageList.length === 0) return;

    let frame = 0;
    const updateVisiblePage = () => {
      frame = 0;
      const rootRect = root.getBoundingClientRect();
      const sheets = Array.from(root.querySelectorAll<HTMLElement>("[data-page-index]"));
      let bestIndex = -1;
      let bestVisible = -1;

      sheets.forEach((sheet) => {
        const pageIndex = Number(sheet.dataset.pageIndex);
        if (!Number.isFinite(pageIndex)) return;
        const rect = sheet.getBoundingClientRect();
        const visible = Math.max(0, Math.min(rect.bottom, rootRect.bottom) - Math.max(rect.top, rootRect.top));
        const fallback = -Math.abs(rect.top - rootRect.top);
        const score = visible > 0 ? visible : fallback;
        if (score > bestVisible) {
          bestVisible = score;
          bestIndex = pageIndex;
        }
      });

      if (bestIndex >= 0) {
        setActivePageIndex((prev) => (prev === bestIndex ? prev : bestIndex));
      }
    };

    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(updateVisiblePage);
    };

    updateVisiblePage();
    root.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      root.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [pageList.length]);

  useEffect(() => {
    const pane = thumbScrollRef.current;
    if (!pane || pageList.length === 0) return;
    const activeThumb = pane.querySelector<HTMLElement>(`[data-page-thumb-index="${activePageIndex}"]`);
    if (!activeThumb) return;
    const paneRect = pane.getBoundingClientRect();
    const thumbRect = activeThumb.getBoundingClientRect();
    const outside = thumbRect.top < paneRect.top + 36 || thumbRect.bottom > paneRect.bottom - 16;
    if (outside) activeThumb.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activePageIndex, pageList.length]);

  useEffect(() => {
    if (pageList.length === 0) return;
    if (activePageIndex >= pageList.length) setActivePageIndex(pageList.length - 1);
  }, [activePageIndex, pageList.length]);

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const ae = document.activeElement as HTMLElement | null;
      if (ae && (ae.isContentEditable || ae.tagName === "INPUT" || ae.tagName === "TEXTAREA")) return;
      const key = e.key.toLowerCase();
      if (key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (key === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [redo, undo]);

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
      replaceReportSilently(saved, true);
      setBaseline(saved);
      onSaved?.(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [passageId, report, onSaved, replaceReportSilently]);

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

  // 페이지 확대/축소 (화면 편집용 — .par-sheet 에만 zoom 적용, 측정/인쇄에는 영향 없음)
  const ZOOM_MIN = 0.5;
  const ZOOM_MAX = 1.6;
  const [zoom, setZoom] = useState(1);
  const stepZoom = useCallback((delta: number) => {
    setZoom((z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((z + delta) * 20) / 20)));
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        stepZoom(0.1);
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        stepZoom(-0.1);
      } else if (e.key === "0") {
        e.preventDefault();
        setZoom(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stepZoom]);

  return (
    <div className="are-shell flex h-full flex-col bg-slate-100">
      <style dangerouslySetInnerHTML={{ __html: ANALYSIS_REPORT_EDIT_CSS }} />

      {/* 상단 바 */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-200 bg-white shrink-0">
        <span className="text-[12px] font-semibold text-slate-700">레이아웃 편집</span>
        <span className="text-[11px] text-slate-400 hidden md:inline">
          블록 클릭→우측에서 서식/페이지 · ⠿ 드래그로 이동 · 텍스트 클릭해 바로 수정
        </span>
        <div className="flex-1" />
        {error ? <span className="text-[11px] text-red-500 max-w-[240px] truncate">{error}</span> : null}
        {dirty ? <span className="text-[11px] text-amber-600">● 저장 안 됨</span> : null}
        {canToggleToolbarVocabTestOnly ? (
          <button
            type="button"
            data-vocab-test-only-toolbar={report.vocabTestOnly ? "restore" : "only"}
            onClick={toggleToolbarVocabTestOnly}
            className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-md border text-[12px] font-medium transition-colors ${
              report.vocabTestOnly
                ? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                : "border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            <FileQuestion className={`w-3.5 h-3.5 ${report.vocabTestOnly ? "text-blue-600" : "text-amber-500"}`} />
            {report.vocabTestOnly ? "전체 자료 보기" : "단어 시험지만"}
          </button>
        ) : null}
        <div className="inline-flex items-center rounded-md border border-slate-200 overflow-hidden" role="group" aria-label="페이지 확대/축소">
          <button
            type="button"
            onClick={() => stepZoom(-0.1)}
            disabled={zoom <= ZOOM_MIN}
            className="inline-flex items-center justify-center h-8 w-8 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            title="축소 (Ctrl -)"
            aria-label="축소"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setZoom(1)}
            className="h-8 min-w-[46px] px-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 border-x border-slate-200 tabular-nums"
            title="100%로 맞춤 (Ctrl 0)"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            onClick={() => stepZoom(0.1)}
            disabled={zoom >= ZOOM_MAX}
            className="inline-flex items-center justify-center h-8 w-8 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            title="확대 (Ctrl +)"
            aria-label="확대"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        <button
          type="button"
          onClick={undo}
          disabled={!canUndo || saving}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-slate-200 text-[12px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          title="되돌리기 (Ctrl+Z)"
          aria-label="되돌리기"
        >
          <RotateCcw className="w-3.5 h-3.5" /> 되돌리기
        </button>
        <button
          type="button"
          onClick={redo}
          disabled={!canRedo || saving}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-slate-200 text-[12px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          title="다시 실행 (Ctrl+Y)"
          aria-label="다시 실행"
        >
          <RotateCw className="w-3.5 h-3.5" /> 다시 실행
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-slate-200 text-[12px] font-medium text-slate-600 hover:bg-slate-50"
        >
          <Printer className="w-3.5 h-3.5" /> 인쇄
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-blue-600 text-[12px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          저장
        </button>
        {onExit ? (
          <button
            type="button"
            onClick={() => {
              if (dirty && !window.confirm("저장하지 않은 편집이 있습니다. 보기로 나갈까요?")) return;
              onExit();
            }}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-slate-200 text-[12px] font-medium text-slate-600 hover:bg-slate-50"
          >
            <Eye className="w-3.5 h-3.5" /> 보기
          </button>
        ) : null}
      </div>

      <div className="flex flex-1 min-h-0">
        {/* 좌측 — 페이지 인디케이터 */}
        <div ref={thumbScrollRef} className="w-[92px] flex-shrink-0 border-r border-slate-200 bg-white overflow-auto py-3">
          <div className="text-[10px] text-slate-400 text-center mb-2">페이지</div>
          <ReportPageThumbnails
            report={report}
            pages={pageList}
            activePageIndex={activePageIndex}
            onSelect={selectPage}
            onDelete={deletePage}
          />
        </div>

        {/* 중앙 — A4 캔버스 (자연 크기, 드래그 autoscroll 용 id) */}
        <div
          ref={paperScrollRef}
          id="exam-paper-print-root"
          className="par-scroll flex-1 overflow-auto px-6 py-6"
          style={{ "--par-zoom": zoom } as CSSProperties}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setActiveId(null);
          }}
        >
          <ReportPages report={report} edit={edit} onPagesChange={setPageList} />
        </div>

        {/* 우측 — 속성 패널 */}
        <aside className="w-[280px] flex-shrink-0 border-l border-slate-200 bg-white overflow-auto">
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
            onApplyCover={(cv) => setReport((r) => ({ ...r, cover: { ...cv, enabled: true } }))}
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
        </aside>
      </div>
    </div>
  );
}

// ─── 우측 속성 패널 ───────────────────────────────────────────────────────────
function PanelSection({
  title,
  children,
  defaultOpen = true,
  summary,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  summary?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-blue-100/70">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center gap-2 border-l-2 px-4 py-3 text-left transition-colors ${
          open
            ? "border-blue-400 bg-blue-50 hover:bg-blue-50"
            : "border-transparent bg-sky-50/60 hover:bg-sky-100/70"
        }`}
        aria-expanded={open}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[10.5px] font-bold uppercase tracking-wider text-blue-700">{title}</span>
          {summary ? <span className="mt-0.5 block truncate text-[10.5px] text-blue-500/75">{summary}</span> : null}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 text-blue-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? <div className="px-4 pt-2.5 pb-3.5">{children}</div> : null}
    </section>
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
    <CoverPanel
      key={isCover ? "cover-active" : "cover-idle"}
      report={report}
      cover={cover}
      coverError={coverError}
      onPatch={onCoverPatch}
      onLogoFile={onLogoFile}
      onApplyCover={onApplyCover}
      defaultOpen={isCover}
    />
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
  const vocabMode: VocabTestMode =
    vocabularyTarget?.section.vocabTestMode ?? "study";
  const vocabTestLayout: VocabTestLayout =
    vocabularyTarget?.section.vocabTestLayout ?? "table";
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
    <PanelSection title="블록 추가" defaultOpen={false} summary="여백과 자유 텍스트">
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
    <div>
      {coverPanel}
      {isCover ? (
        <PanelSection title="표지 편집" summary="문구는 종이 위에서 직접 수정">
          <p className="text-[12px] text-slate-400 leading-relaxed">
            표지 텍스트(제목·부제·학원명 등)는 보고서에서 <b className="text-slate-500">직접 클릭</b>해 수정해요.
            <br />
            <span className="text-slate-300">템플릿·로고·정렬은 위 표지 패널에서 변경합니다.</span>
          </p>
        </PanelSection>
      ) : !active ? (
        <>
          <PanelSection title="블록 편집" summary="종이에서 블록을 선택하세요">
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
          <PanelSection title="선택한 블록" summary={blockLabel}>
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
            <PanelSection title="여백 높이" summary={`${Math.round(activeCustom.heightMm)}mm`}>
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
          <PanelSection title="서식" summary={`${Math.round(fontScale * 100)}%`}>
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
            <PanelSection title="표 열 표시" defaultOpen={false} summary="원본 단어장/표 열 관리">
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
              title="학습지 출력"
              defaultOpen={false}
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

          <PanelSection title="페이지 조판" defaultOpen={false} summary="분리 금지와 새 페이지 시작">
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

          <PanelSection title="순서 / 표시" defaultOpen={false} summary="위치 이동과 숨김">
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
            <PanelSection title="섹션" defaultOpen={false} summary="섹션 전체 삭제">
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
            <PanelSection title={activeCustom?.kind === "spacer" ? "여백 블록" : "텍스트 블록"} defaultOpen={false} summary="블록 삭제">
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
            <PanelSection title="이 블록" defaultOpen={false} summary="선택 블록 삭제">
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

      <PanelSection title="테마" defaultOpen={false} summary={THEME_LABELS[report.themeId]}>
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
                <span className="min-w-0 flex-1">{THEME_LABELS[t]}</span>
              </button>
            );
          })}
        </div>
      </PanelSection>
    </div>
  );
}

// ─── 표지 패널 (템플릿 갤러리 + 로고 + 실시간 미리보기) ──────────────────────
interface CoverPresetRow {
  id: string;
  name: string;
  cover: ReportCover;
  updatedAt: string;
}

function CoverPanel({
  report,
  cover,
  coverError,
  onPatch,
  onLogoFile,
  onApplyCover,
  defaultOpen = false,
}: {
  report: AnalysisReport;
  cover: ReportCover | undefined;
  coverError: string | null;
  onPatch: (patch: Partial<ReportCover>) => void;
  onLogoFile: (file?: File | null) => void;
  onApplyCover: (cover: ReportCover) => void;
  defaultOpen?: boolean;
}) {
  const enabled = !!cover?.enabled;
  const tpl = (cover?.templateId ?? "classic-center") as CoverTemplateId;
  const logoAlign = cover?.logoAlign ?? "center";

  const [presets, setPresets] = useState<CoverPresetRow[]>([]);
  const [presetName, setPresetName] = useState("");
  const [presetBusy, setPresetBusy] = useState(false);
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
    const name = presetName.trim();
    if (!name || !cover) return;
    setPresetBusy(true);
    try {
      const res = await fetch("/api/workbench/cover-presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, cover }),
      });
      const j = await res.json();
      if (res.ok && j?.preset) {
        setPresets((p) => [j.preset as CoverPresetRow, ...p]);
        setPresetName("");
      }
    } finally {
      setPresetBusy(false);
    }
  }, [presetName, cover]);
  const deletePreset = useCallback(async (id: string) => {
    setPresets((p) => p.filter((x) => x.id !== id));
    await fetch(`/api/workbench/cover-presets/${id}`, { method: "DELETE" }).catch(() => {});
  }, []);
  return (
    <PanelSection title="표지" defaultOpen={defaultOpen} summary={enabled ? "표지 페이지 사용 중" : "표지 페이지 꺼짐"}>
      <ToggleRow label="표지 페이지 사용" on={enabled} onClick={() => onPatch({ enabled: !enabled })} icon={<BookImage className="w-3.5 h-3.5" />} />
      {!enabled ? (
        <p className="mt-2 text-[10.5px] text-slate-400 leading-relaxed">
          켜면 첫 페이지에 표지가 생깁니다. <b className="text-slate-500">끄면 설정은 보존</b>돼요(페이지 번호에는 미포함).
        </p>
      ) : (
        <div className="mt-3 space-y-3.5">
          {/* 실시간 미리보기 */}
          <div className="flex justify-center">
            <CoverPreview report={report} widthPx={150} />
          </div>

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

          {/* 로고 */}
          <div>
            <div className="text-[11px] text-slate-400 mb-1.5">로고</div>
            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-1.5 text-[12px] px-2.5 py-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer">
                <ImageUp className="w-3.5 h-3.5" /> {cover?.logoDataUrl ? "변경" : "업로드"}
                <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => onLogoFile(e.target.files?.[0])} />
              </label>
              {cover?.logoDataUrl ? (
                <button type="button" onClick={() => onPatch({ logoDataUrl: undefined })} className="text-[11px] text-red-500 hover:underline">
                  제거
                </button>
              ) : null}
            </div>
            {coverError ? <p className="text-[11px] text-red-500 mt-1">{coverError}</p> : null}
            {cover?.logoDataUrl ? (
              <div className="mt-2 space-y-2">
                <div className="flex items-center gap-1.5">
                  {(["left", "center", "right"] as const).map((a) => {
                    const Icon = a === "left" ? AlignLeft : a === "center" ? AlignCenter : AlignRight;
                    return (
                      <button
                        key={a}
                        type="button"
                        onClick={() => onPatch({ logoAlign: a })}
                        className={`flex-1 inline-flex justify-center items-center h-7 rounded-md border ${
                          logoAlign === a ? "border-blue-500 bg-blue-50 text-blue-600" : "border-slate-200 text-slate-500 hover:bg-slate-50"
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
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
                  <span className="text-[11px] w-10 text-right">{Math.round(cover.logoHeightMm ?? 14)}mm</span>
                </div>
                <p className="text-[10.5px] text-slate-400">표지 위 로고를 <b className="text-slate-500">드래그</b>해 자유롭게 옮길 수 있어요.</p>
                {typeof cover.logoX === "number" ? (
                  <button
                    type="button"
                    onClick={() => onPatch({ logoX: undefined, logoY: undefined })}
                    className="w-full text-[12px] px-2 py-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
                  >
                    로고 위치 초기화 (정렬로)
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          <ToggleRow label="메타 정보(분류·난이도) 표시" on={!!cover?.showMeta} onClick={() => onPatch({ showMeta: !cover?.showMeta })} />

          {/* 프리셋 — 학원 공용 저장·재사용 */}
          <div className="pt-3 border-t border-slate-100">
            <div className="text-[11px] text-slate-400 mb-1.5">프리셋 (학원 공용)</div>
            <div className="flex gap-1.5 mb-2">
              <input
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="이 표지를 프리셋으로 저장"
                className="flex-1 min-w-0 text-[12px] px-2 py-1.5 rounded-md border border-slate-200 focus:border-blue-400 outline-none"
              />
              <button
                type="button"
                onClick={savePreset}
                disabled={presetBusy || !presetName.trim()}
                className="text-[12px] px-2.5 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
              >
                저장
              </button>
            </div>
            {presets.length ? (
              <div className="grid grid-cols-3 gap-1.5">
                {presets.map((p) => (
                  <div key={p.id} className="relative group">
                    <button
                      type="button"
                      onClick={() => onApplyCover(p.cover)}
                      title={`${p.name} — 적용`}
                      className="rounded-md p-0.5 border border-slate-200 hover:border-blue-400 w-full"
                    >
                      <CoverPreview report={report} coverOverride={p.cover} widthPx={56} />
                      <div className="text-[8.5px] text-slate-500 truncate mt-0.5 text-center">{p.name}</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => deletePreset(p.id)}
                      title="프리셋 삭제"
                      className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-white border border-red-200 text-red-500 text-[11px] leading-none opacity-0 group-hover:opacity-100 hover:bg-red-50"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[10.5px] text-slate-300">저장한 프리셋이 여기에 모여 다른 지문에서도 재사용돼요.</p>
            )}
          </div>

          <p className="text-[10.5px] text-slate-400 leading-relaxed">표지 텍스트는 보고서에서 직접 클릭해 수정해요.</p>
        </div>
      )}
    </PanelSection>
  );
}
