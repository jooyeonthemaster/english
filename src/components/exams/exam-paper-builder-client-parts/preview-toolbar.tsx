"use client";

import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  ChevronDown,
  Columns2,
  Download,
  Eye,
  FileType2,
  Loader2,
  Printer,
  Redo2,
  Save,
  Undo2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TEMPLATE_META } from "../paper-builder/templates";
import type { PaperSize, PaperTemplate } from "../paper-builder/types";

// ---------------------------------------------------------------------------
// 용지 미리보기 상단 헤더 툴바
// ---------------------------------------------------------------------------

interface PreviewToolbarProps {
  template: PaperTemplate;
  paperSize: PaperSize;
  dirty: boolean;
  isPending: boolean;
  paperItemsCount: number;
  forceTwoPerPage?: boolean;
  onToggleTwoPerPage?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onPrint: () => void;
  onDownloadPdf: () => void;
  onDownloadDocx: () => void;
  onDownloadDocxWithAnswers: () => void;
  onDownloadHwpx: () => void;
  onDownloadHwpxWithAnswers: () => void;
  onSave: () => void;
}

export function PreviewToolbar({
  template,
  paperSize,
  dirty,
  isPending,
  paperItemsCount,
  forceTwoPerPage,
  onToggleTwoPerPage,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onPrint,
  onDownloadPdf,
  onDownloadDocx,
  onDownloadDocxWithAnswers,
  onDownloadHwpx,
  onDownloadHwpxWithAnswers,
  onSave,
}: PreviewToolbarProps) {
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [compactLabels, setCompactLabels] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const downloadMenuRef = useRef<HTMLDivElement>(null);
  const actionDisabled = isPending || paperItemsCount === 0;
  const templateLabel = TEMPLATE_META[template].label;
  const compactTemplateLabel = templateLabel.trim().slice(0, 1) || templateLabel;

  useEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;

    const updateCompactLabels = () => {
      setCompactLabels(toolbar.getBoundingClientRect().width < 620);
    };

    updateCompactLabels();

    if (typeof ResizeObserver === "undefined") return;

    const resizeObserver = new ResizeObserver(updateCompactLabels);
    resizeObserver.observe(toolbar);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    if (!downloadOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (downloadMenuRef.current?.contains(event.target as Node)) return;
      setDownloadOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDownloadOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [downloadOpen]);

  function runDownload(handler: () => void) {
    setDownloadOpen(false);
    handler();
  }

  return (
    <div
      ref={toolbarRef}
      className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3"
    >
      <div className="flex min-w-0 items-center gap-2">
        <Eye className="h-3.5 w-3.5 text-slate-400" />
        <span className="whitespace-nowrap text-[12px] font-bold text-slate-600">
          {compactLabels ? paperSize : `${paperSize} 미리보기`}
        </span>
        <span
          className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500"
          title={templateLabel}
          aria-label={templateLabel}
        >
          {compactLabels ? compactTemplateLabel : templateLabel}
        </span>
      </div>
      <div className="no-print flex shrink-0 items-center gap-1.5">
        {dirty && (
          <span className="hidden rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 sm:inline-flex">
            저장 필요
          </span>
        )}
        {onToggleTwoPerPage && (
          <button
            type="button"
            onClick={onToggleTwoPerPage}
            aria-pressed={forceTwoPerPage}
            title="쪽당 2문제 — 켜면 좌·우 한 문제씩 강제 배치"
            className={cn(
              "flex h-8 items-center justify-center gap-1.5 rounded-md border px-3 text-[11px] font-semibold transition-colors",
              forceTwoPerPage
                ? "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
            )}
          >
            <Columns2 className="h-3.5 w-3.5" />
            쪽당 2문제
          </button>
        )}
        {onUndo && (
          <button
            onClick={onUndo}
            disabled={!canUndo}
            title="되돌리기"
            aria-label="되돌리기"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Undo2 className="h-3.5 w-3.5" />
          </button>
        )}
        {onRedo && (
          <button
            onClick={onRedo}
            disabled={!canRedo}
            title="앞으로 돌리기"
            aria-label="앞으로 돌리기"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Redo2 className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          onClick={onSave}
          disabled={actionDisabled}
          className="flex h-8 min-w-[76px] items-center justify-center gap-1.5 rounded-md bg-slate-900 px-3 text-[11px] font-bold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          저장
        </button>
        <button
          onClick={onPrint}
          disabled={actionDisabled}
          className="flex h-8 min-w-[76px] items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Printer className="h-3.5 w-3.5" />
          인쇄
        </button>
        <div ref={downloadMenuRef} className="relative">
          <button
            type="button"
            onClick={() => setDownloadOpen((open) => !open)}
            disabled={actionDisabled}
            aria-expanded={downloadOpen}
            className="flex h-8 min-w-[98px] items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            다운로드
            <ChevronDown className="h-3 w-3 text-slate-400" />
          </button>
          {downloadOpen && (
            <div className="absolute right-0 top-[calc(100%+6px)] z-30 w-52 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-xl shadow-slate-200/70">
              <button
                type="button"
                onClick={() => runDownload(onDownloadPdf)}
                className="flex h-9 w-full items-center gap-2 px-3 text-left text-[12px] font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                <Printer className="h-3.5 w-3.5 text-rose-500" />
                PDF
                <span className="ml-auto rounded-sm bg-rose-50 px-1 py-px text-[9px] font-bold leading-none text-rose-600">
                  미리보기 그대로
                </span>
              </button>
              <div className="my-1 h-px bg-slate-100" />
              <button
                type="button"
                onClick={() => runDownload(onDownloadDocx)}
                className="flex h-9 w-full items-center gap-2 px-3 text-left text-[12px] font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                <Download className="h-3.5 w-3.5 text-blue-500" />
                DOCX
              </button>
              <button
                type="button"
                onClick={() => runDownload(onDownloadDocxWithAnswers)}
                className="flex h-9 w-full items-center gap-2 px-3 text-left text-[12px] font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                <BookOpen className="h-3.5 w-3.5 text-emerald-500" />
                DOCX 해설
              </button>
              <button
                type="button"
                onClick={() => runDownload(onDownloadHwpx)}
                className="flex h-9 w-full items-center gap-2 px-3 text-left text-[12px] font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                <FileType2 className="h-3.5 w-3.5 text-indigo-500" />
                HWPX
                <span className="ml-auto rounded-sm bg-indigo-50 px-1 py-px text-[9px] font-bold uppercase leading-none text-indigo-600">
                  beta
                </span>
              </button>
              <button
                type="button"
                onClick={() => runDownload(onDownloadHwpxWithAnswers)}
                className="flex h-9 w-full items-center gap-2 px-3 text-left text-[12px] font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                <BookOpen className="h-3.5 w-3.5 text-violet-500" />
                HWPX 해설
                <span className="ml-auto rounded-sm bg-violet-50 px-1 py-px text-[9px] font-bold uppercase leading-none text-violet-600">
                  beta
                </span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
