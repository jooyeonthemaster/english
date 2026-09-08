"use client";

// ============================================================================
// 공개 시험지 분석 리포트 — 문항 카드 1개 (exam-public-content.tsx 에서 분리, 500줄 상한)
//
// 헤더: 번호 배지 · 유형 · 난이도 칩 · 배점 · 정답(공개 시 ①②③ 서클 숫자 / 검수 전
// 「정답 검수 중」). 본문: 출제 포인트(리드) → 핵심 개념 칩 → 난이도 5눈금+근거 →
// 접근 전략 → 접이(오답 함정·상세 해설). 접이는 인쇄(beforeprint)에 강제 펼침.
// ============================================================================

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CARD,
  CHIP,
  CIRCLED,
  DIFF_CHIP,
  type ExamPublicQuestion,
} from "./exam-public-shared";

function formatAnswer(q: ExamPublicQuestion): string {
  if (!q.answer) return "";
  if (q.kind === "MC") return CIRCLED[q.answer.trim()] ?? q.answer;
  return q.answer;
}

export function QuestionCard({
  q,
  forceOpen,
}: {
  q: ExamPublicQuestion;
  /** 인쇄 중 — 접이 전부 펼침 */
  forceOpen: boolean;
}) {
  const [openTraps, setOpenTraps] = useState(false);
  const [openExplain, setOpenExplain] = useState(false);
  const a = q.analysis;
  const diff = a ? DIFF_CHIP[a.difficulty] : null;
  const answer = formatAnswer(q);

  return (
    <article className={cn(CARD, "p-4 sm:p-5")}>
      <header className="flex min-w-0 flex-wrap items-center gap-1.5">
        <span className="flex h-7 min-w-7 shrink-0 items-center justify-center rounded-md bg-slate-900 px-1.5 text-[12px] font-bold tabular-nums text-white">
          {q.number}
        </span>
        <span
          className="min-w-0 truncate text-[13.5px] font-semibold text-slate-800"
          title={q.typeLabel}
        >
          {q.typeLabel}
        </span>
        {diff ? <span className={cn(CHIP, diff.className)}>{diff.label}</span> : null}
        {q.points != null ? (
          <span className={cn(CHIP, "bg-slate-50 text-slate-600 ring-slate-200/60 tabular-nums")}>
            {q.points}점
          </span>
        ) : null}
        {answer ? (
          <span className={cn(CHIP, "ml-auto bg-blue-50 text-blue-700 ring-blue-200/60")}>
            정답 {answer}
          </span>
        ) : q.answerHidden ? (
          <span className={cn(CHIP, "ml-auto bg-slate-50 text-slate-400 ring-slate-200/60")}>
            정답 검수 중
          </span>
        ) : null}
      </header>

      {!a ? (
        <p className="mt-3 text-[12.5px] leading-relaxed text-slate-400">
          {q.brief ? `${q.brief} · ` : ""}이 문항의 AI 분석은 아직 없습니다.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {a.examPoint ? (
            <p className="break-keep text-[14px] font-medium leading-[1.7] text-slate-800">
              {a.examPoint}
            </p>
          ) : null}
          {a.keyConcepts.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {a.keyConcepts.map((c) => (
                <span key={c} className={cn(CHIP, "bg-indigo-50 text-indigo-700 ring-indigo-200/60")}>
                  {c}
                </span>
              ))}
            </div>
          ) : null}
          {diff ? (
            <div className="flex items-center gap-2">
              <div className="flex gap-0.5" aria-label={`난이도 ${a.difficulty}/5`}>
                {[1, 2, 3, 4, 5].map((i) => (
                  <span
                    key={i}
                    className={cn(
                      "h-1.5 w-4 rounded-full",
                      i <= a.difficulty ? diff.fill : "bg-slate-100",
                    )}
                  />
                ))}
              </div>
              <p className="min-w-0 flex-1 break-keep text-[12px] leading-snug text-slate-500">
                {a.difficultyRationale}
              </p>
            </div>
          ) : null}
          {a.solvingStrategy ? (
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
              <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
                접근 전략
              </p>
              <p className="mt-1 break-keep text-[13px] leading-[1.7] text-slate-700">
                {a.solvingStrategy}
              </p>
            </div>
          ) : null}

          {a.traps.length > 0 ? (
            <Collapsible
              label={`오답 함정 ${a.traps.length}개`}
              open={openTraps || forceOpen}
              onToggle={() => setOpenTraps((v) => !v)}
            >
              <ul className="space-y-1.5">
                {a.traps.map((t) => (
                  <li key={t.choice} className="flex gap-2 text-[13px] leading-relaxed text-slate-700">
                    <span className="shrink-0 font-semibold text-slate-900">
                      {CIRCLED[t.choice] ?? t.choice}
                    </span>
                    <span className="min-w-0 flex-1 break-keep">{t.why}</span>
                    <span
                      className="shrink-0 text-[11px] text-rose-500"
                      title={`매력도 ${t.attractiveness}/3`}
                    >
                      {"●".repeat(t.attractiveness)}
                      <span className="text-slate-200">{"●".repeat(3 - t.attractiveness)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Collapsible>
          ) : null}
          {a.explanation ? (
            <Collapsible
              label="상세 해설"
              open={openExplain || forceOpen}
              onToggle={() => setOpenExplain((v) => !v)}
            >
              <p className="whitespace-pre-wrap break-keep text-[13px] leading-[1.75] text-slate-700">
                {a.explanation}
              </p>
              {a.intent ? (
                <p className="mt-2 break-keep text-[12px] leading-relaxed text-slate-500">
                  <span className="font-semibold text-slate-600">출제 의도 · </span>
                  {a.intent}
                </p>
              ) : null}
            </Collapsible>
          ) : null}
        </div>
      )}
    </article>
  );
}

function Collapsible({
  label,
  open,
  onToggle,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-100">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="er-public-print-hide flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[12.5px] font-semibold text-slate-600 transition-colors hover:text-slate-900"
      >
        {label}
        <ChevronDown
          className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>
      {open ? (
        <div className="border-t border-slate-100 px-3 py-2.5">
          {/* 인쇄에선 토글 버튼이 숨겨지므로 제목을 대신 찍는다 */}
          <p className="mb-1.5 hidden text-[10.5px] font-semibold uppercase tracking-wider text-slate-400 print:block">
            {label}
          </p>
          {children}
        </div>
      ) : null}
    </div>
  );
}
