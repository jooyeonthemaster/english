"use client";

import { Check, Maximize2, AlertTriangle } from "lucide-react";

import type { ExamPassage } from "@/lib/exam-passages/types";
import {
  examShortLabel,
  qLabel,
  reconLabel,
  isReconstructed,
  typeBadgeClass,
  gradeBadgeClass,
} from "@/lib/exam-passages/format";

interface ExamPassageCardProps {
  passage: ExamPassage;
  selected: boolean;
  onToggle: (id: string) => void;
  onPreview: (passage: ExamPassage) => void;
}

/**
 * 기출 지문 한 장 — 전체 카드 클릭으로 선택 토글, 우상단 체크 표식.
 * 디자인 토큰: rounded-xl + border-slate-200 + shadow-sm, 선택 시 ring-2 ring-blue-500.
 */
export function ExamPassageCard({
  passage,
  selected,
  onToggle,
  onPreview,
}: ExamPassageCardProps) {
  const reconstructed = isReconstructed(passage.reconstructionKind);
  const lowConfidence = passage.confidence === "low";

  return (
    <div
      data-exam-card
      title="클릭하여 선택 · 더블클릭하여 상세 보기"
      onClick={() => onToggle(passage.id)}
      onDoubleClick={() => onPreview(passage)}
      className={
        "group relative flex cursor-pointer flex-col gap-2 rounded-xl border bg-white p-3 text-left shadow-sm transition hover:shadow-md " +
        (selected
          ? "border-blue-300 bg-blue-50/40 ring-2 ring-blue-500"
          : "border-slate-200 hover:border-slate-300")
      }
    >
      {/* 메타 행 — 체크박스(맨 왼쪽) + 문제번호 뱃지 + 회차/유형 */}
      <div className="flex flex-wrap items-center gap-1.5">
        {/* 선택 토글 — 실제 버튼(키보드 접근). 카드 전체 클릭도 토글한다. */}
        <button
          type="button"
          aria-pressed={selected}
          aria-label={selected ? "선택 해제" : "선택"}
          onClick={(e) => {
            e.stopPropagation();
            onToggle(passage.id);
          }}
          className={
            "flex size-[18px] shrink-0 items-center justify-center rounded-[6px] border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 " +
            (selected
              ? "border-blue-600 bg-blue-600 text-white"
              : "border-slate-300 bg-white text-transparent group-hover:border-slate-400")
          }
        >
          <Check className="size-3" strokeWidth={3} />
        </button>

        {/* 문제번호 뱃지 */}
        <span className="inline-flex items-center rounded-md bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-white">
          {qLabel(passage.qNumbers)}번
        </span>

        {passage.grade && passage.grade !== "고3" ? (
          <span
            className={
              "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-bold " +
              gradeBadgeClass(passage.grade)
            }
          >
            {passage.grade}
          </span>
        ) : null}
        <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-bold tracking-tight text-slate-600">
          {passage.year} {examShortLabel(passage.exam)}
          {passage.form ? ` ${passage.form}형` : ""}
        </span>
        <span
          className={
            "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold " +
            typeBadgeClass(passage.typeGroup)
          }
        >
          {passage.type}
        </span>
        {reconstructed ? (
          <span className="inline-flex items-center rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
            {reconLabel(passage.reconstructionKind)}
          </span>
        ) : null}
        {lowConfidence ? (
          <span
            title="정답 미검증 — 내용 응집성으로 복원"
            aria-label="복원 검토 요망 — 정답 미검증, 내용 응집성으로 복원"
            className="inline-flex items-center gap-0.5 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-500"
          >
            <AlertTriangle className="size-2.5" />
            검토요망
          </span>
        ) : null}
      </div>

      {/* 본문 미리보기 */}
      <p className="line-clamp-3 text-[12px] leading-relaxed text-slate-600">
        {passage.text}
      </p>

      {/* 푸터 — 상세 보기(아이콘) */}
      <div className="mt-0.5 flex items-center justify-end">
        <button
          type="button"
          aria-label="상세 보기"
          title="상세 보기"
          onClick={(e) => {
            e.stopPropagation();
            onPreview(passage);
          }}
          className="inline-flex size-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
        >
          <Maximize2 className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
