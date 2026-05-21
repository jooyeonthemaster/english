"use client";

import { BookOpen, Download, Eye, Loader2, Printer, Save } from "lucide-react";
import { TEMPLATE_META } from "../paper-builder/templates";
import type { PaperTemplate } from "../paper-builder/types";

// ---------------------------------------------------------------------------
// A4 미리보기 상단 헤더 툴바
// ---------------------------------------------------------------------------

interface PreviewToolbarProps {
  template: PaperTemplate;
  dirty: boolean;
  isPending: boolean;
  paperItemsCount: number;
  onGoToManage: () => void;
  onPrint: () => void;
  onDownloadDocx: () => void;
  onDownloadDocxWithAnswers: () => void;
  onSave: () => void;
}

export function PreviewToolbar({
  template,
  dirty,
  isPending,
  paperItemsCount,
  onGoToManage,
  onPrint,
  onDownloadDocx,
  onDownloadDocxWithAnswers,
  onSave,
}: PreviewToolbarProps) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <Eye className="h-3.5 w-3.5 text-slate-400" />
        <span className="text-[12px] font-bold text-slate-600">A4 미리보기</span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
          {TEMPLATE_META[template].label}
        </span>
      </div>
      <div className="no-print flex shrink-0 items-center gap-1.5">
        {dirty && (
          <span className="hidden rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 sm:inline-flex">
            저장 필요
          </span>
        )}
        <button
          onClick={onGoToManage}
          className="h-8 rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-50"
        >
          시험지 관리
        </button>
        <button
          onClick={onPrint}
          className="flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-50"
        >
          <Printer className="h-3.5 w-3.5" />
          인쇄
        </button>
        <button
          onClick={onDownloadDocx}
          disabled={isPending || paperItemsCount === 0}
          className="flex h-8 items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2.5 text-[11px] font-semibold text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          DOCX
        </button>
        <button
          onClick={onDownloadDocxWithAnswers}
          disabled={isPending || paperItemsCount === 0}
          className="flex h-8 items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 text-[11px] font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BookOpen className="h-3.5 w-3.5" />}
          해설 포함
        </button>
        <button
          onClick={onSave}
          disabled={isPending || paperItemsCount === 0}
          className="flex h-8 items-center gap-1 rounded-md bg-slate-900 px-2.5 text-[11px] font-bold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          저장
        </button>
      </div>
    </div>
  );
}
