"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, FileText } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { QuestionCardItem } from "@/components/workbench/question-card";
import {
  Q_TYPE_LABELS,
  Q_SUBTYPE_LABELS,
  Q_DIFF,
} from "@/components/workbench/passage-detail/constants";

// ─────────────────────────────────────────────────────────────
// 지문 카드 하단 토글 — 이 지문으로 생성된 문제 요약
//   카드 폭(≈260px)에 맞춰 한 줄짜리 컴팩트 행으로 보여준다.
//   클릭 이벤트는 토글 영역에서 멈춰 지문 상세 모달이 열리지 않게 한다.
// ─────────────────────────────────────────────────────────────

function stripText(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/[*_`#>]/g, "")
    .trim();
}

function SummaryRow({
  q,
  num,
  onOpenDetail,
}: {
  q: QuestionCardItem;
  num: number;
  onOpenDetail?: (q: QuestionCardItem) => void;
}) {
  const router = useRouter();
  const typeLabel = Q_TYPE_LABELS[q.type] || q.type;
  const subLabel = q.subType ? Q_SUBTYPE_LABELS[q.subType] || q.subType : null;
  const diff = Q_DIFF[q.difficulty];
  const examLinks = q._count?.examLinks ?? 0;
  const text = stripText(q.questionText || subLabel || typeLabel);

  // 행 클릭 시 개별 편집 페이지(/director/questions/[id])로 이동하지 않고,
  // 부모가 소유한 '문제 상세' 모달을 연다. 핸들러가 없을 때만 레거시 폴백.
  const openDetail = () =>
    onOpenDetail ? onOpenDetail(q) : router.push(`/director/questions/${q.id}`);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={openDetail}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        openDetail();
      }}
      className="cursor-pointer rounded-lg border border-slate-100 bg-slate-50/60 px-2 py-1.5 transition-colors hover:border-slate-200 hover:bg-slate-100/70"
    >
      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-[10px] font-bold text-slate-400">{num}.</span>
        <span className="inline-flex items-center rounded bg-slate-100 px-1 py-0.5 text-[9.5px] font-medium text-slate-600">
          {typeLabel}
        </span>
        {subLabel && (
          <span className="text-[9.5px] text-slate-500">{subLabel}</span>
        )}
        <span
          className={`inline-flex items-center rounded border px-1 py-0.5 text-[9.5px] font-semibold ${
            diff?.cls || "bg-slate-100 text-slate-500 border-slate-200"
          }`}
        >
          {diff?.label || q.difficulty}
        </span>
        {examLinks > 0 && (
          <span className="ml-auto text-[9.5px] font-medium text-slate-400">
            {examLinks}개 시험지
          </span>
        )}
      </div>
      {text && (
        <p className="mt-1 text-[10.5px] leading-snug text-slate-600 line-clamp-1">
          {text}
        </p>
      )}
    </div>
  );
}

export function PassageQuestionsSummary({
  questions,
  onOpenDetail,
}: {
  questions: QuestionCardItem[];
  /** 행 클릭 시 '문제 상세' 모달을 여는 핸들러. 생략 시 개별 페이지로 폴백. */
  onOpenDetail?: (q: QuestionCardItem) => void;
}) {
  const [open, setOpen] = useState(false);

  if (questions.length === 0) return null;

  return (
    <div
      className="mt-2.5 border-t border-slate-100 pt-2"
      onClick={(e) => e.stopPropagation()}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-expanded={open}
            className="flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-left text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-50"
          >
            <FileText className="h-3 w-3 text-slate-400" />
            <span>생성된 문제 {questions.length}개</span>
            <ChevronDown
              className={`ml-auto h-3.5 w-3.5 text-slate-400 transition-transform ${
                open ? "rotate-180" : ""
              }`}
            />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-80 max-w-[90vw] p-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
            {questions.map((q, idx) => (
              <SummaryRow
                key={q.id}
                q={q}
                num={idx + 1}
                onOpenDetail={
                  onOpenDetail
                    ? (question) => {
                        setOpen(false);
                        onOpenDetail(question);
                      }
                    : undefined
                }
              />
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
