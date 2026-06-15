"use client";

import { useState } from "react";
import { ChevronDown, FileText } from "lucide-react";
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

function SummaryRow({ q, num }: { q: QuestionCardItem; num: number }) {
  const typeLabel = Q_TYPE_LABELS[q.type] || q.type;
  const subLabel = q.subType ? Q_SUBTYPE_LABELS[q.subType] || q.subType : null;
  const diff = Q_DIFF[q.difficulty];
  const examLinks = q._count?.examLinks ?? 0;
  const text = stripText(q.questionText || subLabel || typeLabel);

  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-2 py-1.5">
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
}: {
  questions: QuestionCardItem[];
}) {
  const [expanded, setExpanded] = useState(false);

  if (questions.length === 0) return null;

  return (
    <div
      className="mt-2.5 border-t border-slate-100 pt-2"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-left text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-50"
      >
        <FileText className="h-3 w-3 text-slate-400" />
        <span>생성된 문제 {questions.length}개</span>
        <ChevronDown
          className={`ml-auto h-3.5 w-3.5 text-slate-400 transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>
      {expanded && (
        <div className="mt-1.5 space-y-1.5">
          {questions.map((q, idx) => (
            <SummaryRow key={q.id} q={q} num={idx + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
