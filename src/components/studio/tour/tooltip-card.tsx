"use client";

// ============================================================================
// 투어 말풍선 카드 — 제목·본문·스테이지 데모·진행도·조작(이전/다음/건너뛰기/점프)
// 위치는 SpotlightLayer 가 명령형으로 구동한다(transform). 여기는 내용만 소유.
// 문구 톤: §10 계약(합니다체·이모지 금지) — 자구는 steps/ 원장이 정본.
// ============================================================================

import { useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { ChevronDown, X } from "lucide-react";
import { TOUR_CHAPTERS, chapterIndex, type TourStepRuntime } from "./types";

export interface TooltipCardProps {
  step: TourStepRuntime;
  stepNumber: number; // 전체 1-base
  totalSteps: number;
  doneChapters: ReadonlySet<string>;
  stageDemo: ReactNode | null;
  isFirst: boolean;
  isLast: boolean;
  cardRef: RefObject<HTMLDivElement | null>;
  arrowRef: RefObject<HTMLDivElement | null>;
  onPrev: () => void;
  onNext: () => void;
  onJumpChapter: (chapterIdx: number) => void;
  onSkipChapter: () => void;
  onExitRequest: () => void;
}

export function TooltipCard({
  step,
  stepNumber,
  totalSteps,
  doneChapters,
  stageDemo,
  isFirst,
  isLast,
  cardRef,
  arrowRef,
  onPrev,
  onNext,
  onJumpChapter,
  onSkipChapter,
  onExitRequest,
}: TooltipCardProps) {
  const [skipOpen, setSkipOpen] = useState(false);
  const skipMenuRef = useRef<HTMLDivElement | null>(null);
  const curChapterIdx = chapterIndex(step.chapter);
  const chapterLabel = TOUR_CHAPTERS[curChapterIdx]?.label ?? "";
  const isStage = stageDemo !== null;

  // 스텝이 바뀌면 건너뛰기 메뉴를 닫는다 — 렌더 중 파생 리셋 관용구
  // (effect 내 동기 setState 금지 규칙 준수).
  const [prevStepId, setPrevStepId] = useState(step.id);
  if (prevStepId !== step.id) {
    setPrevStepId(step.id);
    setSkipOpen(false);
  }

  // 메뉴 바깥 클릭 닫기(카드 내부 한정 — 딤 클릭은 engine 소관).
  useEffect(() => {
    if (!skipOpen) return;
    const close = (e: MouseEvent) => {
      if (!skipMenuRef.current?.contains(e.target as Node)) setSkipOpen(false);
    };
    document.addEventListener("mousedown", close, true);
    return () => document.removeEventListener("mousedown", close, true);
  }, [skipOpen]);

  return (
    <div
      ref={cardRef}
      role="dialog"
      aria-modal="true"
      aria-label={`튜토리얼 — ${step.title}`}
      data-tour-card
      data-tour-step={step.id}
      tabIndex={-1}
      className={`absolute left-0 top-0 flex max-h-[calc(100vh-24px)] flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/25 outline-none ${
        isStage ? "w-[min(860px,calc(100vw-32px))]" : "w-[380px] max-w-[calc(100vw-32px)]"
      }`}
      style={{ pointerEvents: "auto", willChange: "transform" }}
    >
      {/* 꼬리 — SpotlightLayer 가 변·좌표를 구동 */}
      <div
        ref={arrowRef}
        aria-hidden="true"
        className="absolute h-3 w-3 rotate-45 border border-slate-200 bg-white"
        style={{ display: "none" }}
      />

      {/* 헤더: 챕터 칩 · 진행 · 닫기 */}
      <div className="flex items-center gap-2 px-4 pt-3.5">
        <span className="inline-flex h-6 items-center rounded-full bg-blue-50 px-2.5 text-[11px] font-bold text-blue-700">
          {chapterLabel}
        </span>
        <span className="text-[11px] font-medium tabular-nums text-slate-400">
          {step.chapterStep}/{step.chapterSize}
        </span>
        <span className="flex-1" />
        <button
          type="button"
          aria-label="튜토리얼 닫기"
          className="-mr-1.5 flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-50 hover:text-slate-500"
          onClick={onExitRequest}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* 본문 + 스테이지 데모 — 세로 짧은 뷰포트 안전망: 이 영역만 스크롤하고
          푸터·진행바는 항상 보인다(적대검수 확정 — 캡 없이는 조작 불가 잘림). */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-4 pb-1 pt-1.5">
          <h3 className="text-[15px] font-bold leading-snug text-slate-900 break-keep">
            {step.title}
          </h3>
          <p className="mt-1.5 text-[13px] leading-relaxed text-slate-600 break-keep">
            {step.body}
          </p>
        </div>
        {isStage ? (
          <div className="mx-4 mt-2 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
            {stageDemo}
          </div>
        ) : null}
      </div>

      {/* 푸터: 건너뛰기 · 챕터 점 · 이전/다음 */}
      <div className="mt-3 flex shrink-0 items-center gap-2 border-t border-slate-100 px-4 py-2.5">
        <div ref={skipMenuRef} className="relative">
          <button
            type="button"
            data-tour-skip
            aria-expanded={skipOpen}
            className="inline-flex h-8 items-center gap-0.5 rounded-lg px-2 text-[12px] font-medium text-slate-400 hover:bg-slate-50 hover:text-slate-600"
            onClick={() => setSkipOpen((v) => !v)}
          >
            <span className="whitespace-nowrap">건너뛰기</span>
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          {skipOpen ? (
            <div className="absolute bottom-9 left-0 w-44 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
              <button
                type="button"
                data-tour-skip-chapter
                className="flex h-9 w-full items-center rounded-lg px-2.5 text-left text-[12px] font-medium text-slate-600 hover:bg-slate-50"
                onClick={() => {
                  setSkipOpen(false);
                  onSkipChapter();
                }}
              >
                이 챕터 건너뛰기
              </button>
              <button
                type="button"
                data-tour-skip-all
                className="flex h-9 w-full items-center rounded-lg px-2.5 text-left text-[12px] font-medium text-rose-600 hover:bg-rose-50"
                onClick={() => {
                  setSkipOpen(false);
                  onExitRequest();
                }}
              >
                튜토리얼 종료
              </button>
            </div>
          ) : null}
        </div>

        {/* 챕터 점프 점 */}
        <div className="flex flex-1 items-center justify-center gap-1.5">
          {TOUR_CHAPTERS.map((c, i) => {
            const state =
              i === curChapterIdx ? "current" : doneChapters.has(c.id) ? "done" : "todo";
            return (
              <button
                key={c.id}
                type="button"
                title={`${i + 1}. ${c.label}`}
                aria-label={`${c.label} 챕터로 이동`}
                aria-current={state === "current" ? "step" : undefined}
                data-tour-dot={c.id}
                className={`h-2.5 rounded-full transition-all ${
                  state === "current"
                    ? "w-6 bg-blue-600"
                    : state === "done"
                      ? "w-2.5 bg-blue-300 hover:bg-blue-400"
                      : "w-2.5 bg-slate-200 hover:bg-slate-300"
                }`}
                onClick={() => onJumpChapter(i)}
              />
            );
          })}
        </div>

        {!isFirst ? (
          <button
            type="button"
            data-tour-prev
            className="inline-flex h-8 items-center whitespace-nowrap rounded-lg px-2.5 text-[12px] font-semibold text-slate-500 hover:bg-slate-50"
            onClick={onPrev}
          >
            이전
          </button>
        ) : null}
        <button
          type="button"
          data-tour-next
          className="inline-flex h-8 items-center whitespace-nowrap rounded-lg bg-blue-600 px-3.5 text-[12px] font-bold text-white hover:bg-blue-700"
          onClick={onNext}
        >
          {isLast ? "마치기" : "다음"}
        </button>
      </div>

      {/* 전체 진행 바 — 라운드 반지름은 카드(16px) − 테두리(1px) = 15px:
          16px 그대로 두면 모서리가 카드 곡률을 뚫고 각져 보인다(검수 실측). */}
      <div className="h-1 shrink-0 overflow-hidden rounded-b-[15px] bg-slate-100">
        <div
          className="h-full bg-blue-500 transition-[width] duration-300"
          style={{ width: `${Math.round((stepNumber / totalSteps) * 100)}%` }}
          data-tour-progress={`${stepNumber}/${totalSteps}`}
        />
      </div>
    </div>
  );
}
