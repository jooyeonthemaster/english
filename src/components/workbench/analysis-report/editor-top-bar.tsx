import {
  ChevronLeft,
  FileQuestion,
  FileText,
  Loader2,
  Printer,
  Redo2,
  RotateCcw,
  Save,
  Undo2,
} from "lucide-react";

import { CreditCostChip } from "@/components/credits/credit-cost-chip";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import type { ReportThemeId } from "@/lib/passage-report/analysis-report/schema";

import { DESIGN_TEMPLATE_LABELS } from "./editor-storage";

type Props = {
  pageCount: number;
  themeId: ReportThemeId;
  error: string | null;
  dirty: boolean;
  saving: boolean;
  canUndo: boolean;
  canRedo: boolean;
  worksheetBusy: boolean;
  worksheetHasContent: boolean;
  answerKeyIncluded: boolean;
  onToggleAnswers: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onRevert: () => void;
  onSave: () => void;
  onGenerateWorksheet: () => void;
  onExit?: () => void;
};

export function EditorTopBar({
  pageCount,
  themeId,
  error,
  dirty,
  saving,
  canUndo,
  canRedo,
  worksheetBusy,
  worksheetHasContent,
  answerKeyIncluded,
  onToggleAnswers,
  onUndo,
  onRedo,
  onRevert,
  onSave,
  onGenerateWorksheet,
  onExit,
}: Props) {
  return (
    <div className="no-print flex h-11 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4">
      <div className="flex min-w-0 items-center gap-2">
        <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        <span className="truncate text-[12px] font-bold text-slate-600">지문 학습자료 편집</span>
        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
          {pageCount || 1}페이지
        </span>
        <span className="hidden shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 sm:inline-flex">
          {DESIGN_TEMPLATE_LABELS[themeId]}
        </span>
      </div>

      <div className="flex min-w-0 items-center justify-end gap-2">
        {error ? <span className="max-w-[260px] truncate text-[11px] text-red-500">{error}</span> : null}
        {dirty ? (
          <span className="hidden rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 sm:inline-flex">
            저장 필요
          </span>
        ) : null}
        {worksheetHasContent ? (
          <button
            type="button"
            role="switch"
            aria-checked={answerKeyIncluded}
            data-answer-key-toolbar={answerKeyIncluded ? "include" : "exclude"}
            onClick={onToggleAnswers}
            title="정답지·해설지 포함"
            className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-[11.5px] font-semibold transition-colors ${
              answerKeyIncluded
                ? "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            <span className="hidden sm:inline">정답지·해설지 포함</span>
            <span className="sm:hidden">정답·해설</span>
            <span
              className={`relative h-4 w-7 rounded-full transition-colors ${
                answerKeyIncluded ? "bg-sky-500" : "bg-slate-300"
              }`}
              aria-hidden="true"
            >
              <span
                className={`absolute left-0 top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${
                  answerKeyIncluded ? "translate-x-3.5" : "translate-x-0.5"
                }`}
              />
            </span>
            <span className={`text-[10px] font-bold ${answerKeyIncluded ? "text-sky-700" : "text-slate-400"}`}>
              {answerKeyIncluded ? "ON" : "OFF"}
            </span>
          </button>
        ) : null}
        {/* 단어 시험지 컨트롤은 우측 학습 활동 팔레트 하단 '어휘' 섹션으로 이동(툴바에서 제거) */}
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo || saving}
          title="되돌리기"
          aria-label="되돌리기"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Undo2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo || saving}
          title="앞으로 가기"
          aria-label="앞으로 가기"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Redo2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onRevert}
          disabled={!dirty || saving}
          title="저장 전 상태로 되돌리기"
          aria-label="저장 전 상태로 되돌리기"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !dirty}
          className="flex h-8 min-w-[64px] items-center justify-center gap-1 rounded-md bg-slate-900 px-2 text-[11px] font-bold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          저장
        </button>
        {!worksheetHasContent ? (
          <button
            type="button"
            onClick={onGenerateWorksheet}
            disabled={worksheetBusy || saving}
            title="실전 학습지(어법 선택·어휘 빈칸·배열 + 수능추론 5문항) 추가 생성"
            className="flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 text-[11.5px] font-semibold text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {worksheetBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileQuestion className="h-3.5 w-3.5" />}
            <span className="hidden items-center gap-1.5 sm:inline-flex">
              {worksheetBusy ? "실전 학습지 생성 중…" : "실전 학습지 생성"}
              {!worksheetBusy && (
                <CreditCostChip
                  amount={CREDIT_COSTS.PASSAGE_ANALYSIS}
                  className="rounded bg-blue-100 px-1 py-px text-[10px] text-blue-700"
                />
              )}
            </span>
            <span className="sm:hidden">실전 학습지</span>
          </button>
        ) : null}
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
  );
}
