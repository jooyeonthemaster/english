"use client";

import { ArrowRight, CheckSquare, FileText, Square } from "lucide-react";

import type { ExamPaper } from "@/lib/exam-passages/types";
import { boardShortLabel, gradeBadgeClass } from "@/lib/exam-passages/format";

interface ExamPaperCardProps {
  paper: ExamPaper;
  onOpen: (paper: ExamPaper) => void;
  /** 시험지 전체를 내 지문함 선택에 담았는지. */
  selected: boolean;
  /** 체크박스 토글 — 시험지의 모든 지문을 담기/해제. */
  onToggleSelect: (paper: ExamPaper) => void;
}

/**
 * 시험지 첫 페이지 미리보기 — 실제 스캔이 없는 텍스트 코퍼스라, 지문 발췌를
 * 시험지처럼 2단으로 빽빽이 렌더해 여러 문제가 있는 "시험지 페이지" 텍스처를 만든다.
 * 카드 좌측 끝·위·아래까지 꽉 차게(full-bleed) 깔린다.
 */
function PaperThumbnail({ paper }: { paper: ExamPaper }) {
  return (
    <div className="flex h-full flex-col bg-white px-1.5 py-1.5">
      {/* 시험지 표제 — "영어 영역" + 가로줄 */}
      <div className="mb-1 shrink-0 border-b border-slate-300 pb-0.5 text-center">
        <div className="text-[5.5px] font-bold leading-none tracking-tight text-slate-700">
          영어 영역
        </div>
      </div>
      {/* 본문 — 2단 빽빽한 지문 발췌(여러 문제, 클립). */}
      <div className="min-h-0 flex-1 overflow-hidden [column-gap:5px] [column-rule:0.5px_solid_#e2e8f0] [columns:2]">
        {paper.preview.map((b, i) => (
          <p
            key={i}
            className="mb-[3px] break-inside-avoid text-justify text-[4px] leading-[1.38] text-slate-500"
          >
            <span className="mr-0.5 font-bold text-slate-700">{b.q}.</span>
            {b.text}…
          </p>
        ))}
      </div>
    </div>
  );
}

/**
 * 시험지 한 장(한 회차 시험) 카드 — 클릭하면 그 시험지의 문제로 드릴인.
 * 좌측에 카드 끝까지 붙는 A4 첫-페이지 미리보기 + 우측 메타.
 * 시험지관리 카드(material-job-card)의 full-bleed A4 썸네일과 동일한 결.
 */
export function ExamPaperCard({
  paper,
  onOpen,
  selected,
  onToggleSelect,
}: ExamPaperCardProps) {
  const isHakpyeong = paper.board === "학력평가";

  return (
    <div
      data-exam-card
      className={
        "group relative flex w-full min-w-0 overflow-hidden rounded-xl border bg-white text-left shadow-sm transition hover:shadow-md focus-within:ring-2 focus-within:ring-blue-500 " +
        (selected
          ? "border-blue-400 ring-1 ring-blue-200"
          : "border-slate-200 hover:border-slate-300")
      }
    >
      {/* 배경 오버레이 — 클릭=선택 토글, 더블클릭=열기(드릴인). 우측 화살표 버튼으로도 연다. */}
      <button
        type="button"
        onClick={() => onToggleSelect(paper)}
        onDoubleClick={() => onOpen(paper)}
        aria-label={selected ? `${paper.title} 선택 해제` : `${paper.title} 선택`}
        title="클릭하여 선택 · 더블클릭하여 열기"
        className="absolute inset-0 z-0 cursor-pointer focus:outline-none"
      />

      {/* 좌측 — 카드 끝까지 붙는 A4 첫 페이지 미리보기 (210:297) */}
      <div className="pointer-events-none relative aspect-[210/297] w-[108px] shrink-0 self-stretch border-r border-slate-200 sm:w-[132px]">
        <PaperThumbnail paper={paper} />
      </div>

      {/* 우측 — 메타 (클릭은 배경 오버레이로 통과, 체크박스만 활성) */}
      <div className="pointer-events-none relative z-10 flex min-w-0 flex-1 flex-col gap-1.5 p-2.5">
        {/* 체크박스 + 제목 */}
        <div className="flex min-w-0 items-start gap-2">
          <button
            type="button"
            role="checkbox"
            aria-checked={selected}
            aria-label={selected ? "선택 해제" : "내 지문함에 담기 선택"}
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect(paper);
            }}
            className="pointer-events-auto -ml-0.5 mt-0.5 shrink-0 cursor-pointer rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            {selected ? (
              <CheckSquare className="size-[18px] text-blue-600" />
            ) : (
              <Square className="size-[18px] text-slate-300 transition group-hover:text-slate-400" />
            )}
          </button>
          <h4 className="min-w-0 text-[13px] font-bold leading-snug text-slate-800">
            {paper.title}
          </h4>
        </div>

        {/* 뱃지 — 제목 아래 (회차/학년) */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-bold tracking-tight text-slate-600">
            {boardShortLabel(paper.board)}
          </span>
          {isHakpyeong && paper.grade ? (
            <span
              className={
                "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-bold " +
                gradeBadgeClass(paper.grade)
              }
            >
              {paper.grade}
            </span>
          ) : null}
        </div>

        {/* 푸터 — 문제 수 · 문항범위 / 열기 */}
        <div className="mt-auto flex min-w-0 items-center justify-between gap-1.5 pt-0.5">
          <span className="inline-flex min-w-0 flex-1 items-center gap-1 truncate text-[11px] font-medium text-slate-400">
            <FileText className="size-3.5" />
            <span className="truncate">
              {paper.count}문제
              {paper.qFrom ? ` · ${paper.qFrom}~${paper.qTo}번` : ""}
            </span>
          </span>
          <button
            type="button"
            aria-label={`${paper.title} 열기`}
            title="열기"
            onClick={(e) => {
              e.stopPropagation();
              onOpen(paper);
            }}
            className="pointer-events-auto inline-flex size-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 group-hover:border-blue-300 group-hover:text-blue-600"
          >
            <ArrowRight className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
