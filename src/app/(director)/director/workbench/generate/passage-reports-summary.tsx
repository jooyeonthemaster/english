"use client";

import { useState } from "react";
import { BookOpen, ChevronDown, Clock } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { PassageItem } from "./generate-page-types";

// ─────────────────────────────────────────────────────────────
// 지문 카드 하단 토글 — 이 지문으로 생성된 학습자료(분석 리포트) 요약.
//   "생성된 문제" 토글(PassageQuestionsSummary)과 같은 컴팩트 패턴.
//   행을 클릭하면 해당 지문의 학습자료 상세 모달을 연다.
//   (학습자료 생성으로 만들어진 리포트는 분석 리포트 형식이라 A4 보고서
//    에디터 경로로 열면 스키마 검증에 실패한다 — 분석 모달이 올바른 뷰어.)
// ─────────────────────────────────────────────────────────────

type ReportItem = NonNullable<PassageItem["reports"]>[number];

const STATUS_META: Record<
  string,
  { label: string; cls: string }
> = {
  DRAFT: { label: "초안", cls: "bg-amber-50 text-amber-600 border-amber-200" },
  PUBLISHED: {
    label: "발행됨",
    cls: "bg-emerald-50 text-emerald-600 border-emerald-200",
  },
  ARCHIVED: {
    label: "보관됨",
    cls: "bg-slate-100 text-slate-500 border-slate-200",
  },
};

function ReportRow({
  report,
  num,
  onOpen,
}: {
  report: ReportItem;
  num: number;
  onOpen: () => void;
}) {
  const status = STATUS_META[report.status] ?? {
    label: report.status,
    cls: "bg-slate-100 text-slate-500 border-slate-200",
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        onOpen();
      }}
      className="cursor-pointer rounded-lg border border-slate-100 bg-slate-50/60 px-2 py-1.5 transition-colors hover:border-slate-200 hover:bg-slate-100/70"
    >
      <div className="flex items-center gap-1">
        <span className="text-[10px] font-bold text-slate-400">{num}.</span>
        <span className="min-w-0 flex-1 truncate text-[10.5px] font-medium text-slate-600">
          {report.title}
        </span>
        <span
          className={`inline-flex shrink-0 items-center rounded border px-1 py-0.5 text-[9.5px] font-semibold ${status.cls}`}
        >
          {status.label}
        </span>
      </div>
    </div>
  );
}

export function PassageReportsSummary({
  passageId,
  reports,
  onOpen,
}: {
  passageId: string;
  reports: ReportItem[];
  /** 행 클릭 시 이 지문의 학습자료 상세 모달을 연다(분석 리포트 뷰어). */
  onOpen: (passageId: string) => void;
}) {
  const [open, setOpen] = useState(false);

  if (reports.length === 0) return null;

  return (
    <div
      className="mt-1.5 border-t border-slate-100 pt-2"
      onClick={(e) => e.stopPropagation()}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-expanded={open}
            className="flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-left text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-50"
          >
            {/* 책 아이콘 + 우하단 시계 배지 — "이미 생성된" 상징. */}
            <span className="relative inline-flex shrink-0 text-slate-400">
              <BookOpen className="h-3 w-3" />
              <Clock
                className="absolute -bottom-0.5 -right-0.5 h-[7px] w-[7px] rounded-full bg-white"
                strokeWidth={3}
                aria-hidden="true"
              />
            </span>
            <span>생성된 학습자료 {reports.length}개</span>
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
            {reports.map((r, idx) => (
              <ReportRow
                key={r.id}
                report={r}
                num={idx + 1}
                onOpen={() => onOpen(passageId)}
              />
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
