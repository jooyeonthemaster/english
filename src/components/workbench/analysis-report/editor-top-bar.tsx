import {
  Copy,
  FileQuestion,
  Loader2,
  Redo2,
  RotateCcw,
  Undo2,
} from "lucide-react";
import type { ReactNode } from "react";

import { CreditCostChip } from "@/components/credits/credit-cost-chip";
import { CREDIT_COSTS } from "@/lib/credit-costs";

type Props = {
  /**
   * 좌측 슬롯 — 섹션 목차 트리거(SectionOutlinePopover). 상단바는 목차 로직을 모른다.
   * (기존의 아이콘+'지문 학습자료 편집'+페이지 칩+템플릿 칩 뭉치를 대체했다. 페이지 수는
   *  트리거 칩 안에 살아 있고, 템플릿명은 설정 패널에 이미 있다.)
   */
  outlineSlot?: ReactNode;
  error: string | null;
  dirty: boolean;
  saving: boolean;
  canUndo: boolean;
  canRedo: boolean;
  worksheetBusy: boolean;
  worksheetHasContent: boolean;
  /** 모달 헤더가 '실전 학습지 생성' 버튼을 대신 렌더하지 않는 컨텍스트에서만 툴바에 인라인으로 보인다. */
  showGenerateWorksheet: boolean;
  /**
   * 저장 버튼을 바깥(모달 헤더)에서 렌더하지 않는 컨텍스트에서만 '다른 이름으로 저장'을
   * 툴바에 인라인으로 둔다 — 그 컨텍스트에는 사본 저장으로 가는 다른 입구가 없다.
   */
  showSaveAs: boolean;
  savingAs: boolean;
  onSaveAs: () => void;
  answerKeyIncluded: boolean;
  onToggleAnswers: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onRevert: () => void;
  onGenerateWorksheet: () => void;
};

export function EditorTopBar({
  outlineSlot,
  error,
  dirty,
  saving,
  canUndo,
  canRedo,
  worksheetBusy,
  worksheetHasContent,
  showGenerateWorksheet,
  showSaveAs,
  savingAs,
  onSaveAs,
  answerKeyIncluded,
  onToggleAnswers,
  onUndo,
  onRedo,
  onRevert,
  onGenerateWorksheet,
}: Props) {
  return (
    <div className="no-print flex h-11 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4">
      <div className="flex min-w-0 items-center gap-2">{outlineSlot}</div>

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
          </button>
        ) : null}
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
        {/* '다른 이름으로 저장' — 저장 버튼을 모달 헤더로 끌어올리는 컨텍스트에서는
            그 헤더의 split 버튼(캐럿)이 담당하므로 숨긴다. 여기 보이는 경우는
            툴바 상태를 끌어올리지 않는 컨텍스트(사본 저장 입구가 달리 없는 화면)뿐이다. */}
        {showSaveAs ? (
          <button
            type="button"
            onClick={onSaveAs}
            disabled={savingAs || saving}
            title="다른 이름으로 저장 — 원본은 그대로 두고 새 학습지 사본을 만듭니다"
            aria-label="다른 이름으로 저장"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {savingAs ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        ) : null}
        {/* '실전 학습지 생성' — 모달 헤더(저장 버튼 옆)에서 렌더하는 컨텍스트에서는 숨기고,
            툴바 상태를 끌어올리지 않는 컨텍스트에서만 여기 인라인으로 보인다. */}
        {showGenerateWorksheet && !worksheetHasContent ? (
          <button
            type="button"
            onClick={onGenerateWorksheet}
            disabled={worksheetBusy || saving}
            title="실전 학습지(어법 선택·어휘 빈칸·배열 + 수능추론 5문항) 추가 생성"
            className="flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-blue-200 bg-white px-2.5 text-[11.5px] font-semibold text-blue-700 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
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
      </div>
    </div>
  );
}
