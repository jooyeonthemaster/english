"use client";

import {
  CheckCircle2,
  Clock3,
  FileImage,
  FileText,
  Keyboard,
  Layers,
  Loader2,
} from "lucide-react";

import { TEXT_EXTRACTION_MIN_LENGTH } from "../constants";
import type { InputMode } from "../types";
import { WorkflowStep } from "./workflow-step";

export function ExtractionRunPanel({
  activeJobId,
  busy,
  inputMode,
  pageCount,
  textLength,
}: {
  activeJobId: string | null;
  busy: boolean;
  inputMode: InputMode;
  pageCount: number;
  textLength: number;
}) {
  const hasInput =
    inputMode === "text" ? textLength >= TEXT_EXTRACTION_MIN_LENGTH : pageCount > 0;
  const statusLabel = busy
    ? "처리 중"
    : activeJobId
      ? "완료"
      : hasInput
        ? "준비 완료"
        : "대기";
  const statusIcon = busy ? (
    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
  ) : activeJobId || hasInput ? (
    <CheckCircle2 className="size-4" aria-hidden="true" />
  ) : (
    <Clock3 className="size-4" aria-hidden="true" />
  );
  const inputCount = inputMode === "text" ? textLength : pageCount;
  const inputUnit = inputMode === "text" ? "자" : "페이지";
  const inputLabel = inputMode === "text" ? "입력 텍스트" : "선택 자료";
  const inputIcon =
    inputMode === "text" ? (
      <Keyboard className="size-3.5" aria-hidden="true" />
    ) : (
      <FileImage className="size-3.5" aria-hidden="true" />
    );

  return (
    <aside className="flex min-h-0 flex-col overflow-hidden border-t border-slate-100 xl:border-l xl:border-t-0">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <h2 className="text-[13px] font-bold text-slate-950">추출 진행</h2>
        <span
          className={
            "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold " +
            (busy
              ? "bg-blue-50 text-blue-700 ring-1 ring-blue-100"
              : activeJobId || hasInput
                ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
                : "bg-slate-50 text-slate-500 ring-1 ring-slate-200")
          }
          aria-live="polite"
        >
          {statusIcon}
          {statusLabel}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2.5 p-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
              {inputIcon}
              {inputLabel}
            </div>
            <div className="mt-1.5 flex items-baseline gap-1 leading-none">
              <span className="text-lg font-bold text-slate-950">{inputCount}</span>
              <span className="text-[11px] text-slate-500">{inputUnit}</span>
            </div>
          </div>
          <div className="rounded-lg border border-blue-100 bg-blue-50/70 px-3 py-2">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-blue-700">
              <FileText className="size-3.5" aria-hidden="true" />
              추출 방식
            </div>
            <div className="mt-1.5 flex items-baseline gap-1 leading-none">
              <span className="text-[13px] font-bold text-blue-950">지문만 추출</span>
              <span className="text-[11px] text-blue-700">문제·선지 제외</span>
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white p-3">
          <div className="mb-2 flex shrink-0 items-center gap-2">
            <Layers className="size-4 text-blue-600" aria-hidden="true" />
            <h3 className="text-[13px] font-bold text-slate-900">자료 처리 흐름</h3>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <ol className="space-y-1.5">
              <WorkflowStep
                index={1}
                title="자료 추가"
                description="파일은 페이지로, 텍스트는 원문 그대로 준비합니다."
                active={hasInput}
              />
              <WorkflowStep
                index={2}
                title="추출 실행"
                description="파일은 OCR 후 복원하고, 텍스트는 바로 복원합니다."
                active={busy}
              />
              <WorkflowStep
                index={3}
                title="자료 관리"
                description="결과 비교, 수정 저장, 삭제를 이어서 처리합니다."
                active={Boolean(activeJobId)}
              />
            </ol>

            <div className="mt-3 border-t border-slate-100 pt-3">
              <div className="mb-2 flex items-center gap-2">
                <FileText className="size-4 text-blue-600" aria-hidden="true" />
                <h3 className="text-[13px] font-bold text-slate-900">
                  텍스트 처리 기준
                </h3>
              </div>
              <ul className="space-y-1.5">
                <WorkflowStep
                  index={1}
                  title="입력"
                  description="붙여넣은 텍스트를 줄바꿈까지 그대로 보존합니다."
                  active={inputMode === "text" && hasInput}
                />
                <WorkflowStep
                  index={2}
                  title="복원"
                  description="문제 형식이면 본문을 기준으로 지문 복원을 실행합니다."
                  active={inputMode === "text" && busy}
                />
                <WorkflowStep
                  index={3}
                  title="검수"
                  description="완료된 결과는 자료 관리에서 비교하고 저장합니다."
                  active={inputMode === "text" && Boolean(activeJobId)}
                />
              </ul>
            </div>
          </div>
        </div>

      </div>
    </aside>
  );
}
