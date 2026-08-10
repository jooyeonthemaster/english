"use client";

// 학생 상세 허브 — 어법 문항 상세 모달 (강사 전용 뷰).
// 시도 기록 행/질문 로그 컨텍스트 클릭 시 문항 원문·학생 응답·정답·해설을
// 한 화면에 보여준다. 데이터는 getGrammarItemTeacherView(서버 번들).

import { useEffect, useState } from "react";
import { BookOpen, CheckCircle2, Eye, Lightbulb, XCircle } from "lucide-react";
import {
  getGrammarItemTeacherView,
  type GrammarItemTeacherView,
} from "@/actions/grammar-drill-admin";
import { WideModal } from "@/components/layout/wide-modal";
import { StatusPill } from "@/components/layout/page-frame";
import { MarkupText } from "@/components/grammar-drill/markup-text";
import {
  GRAMMAR_SOURCE_LABEL,
  GRAMMAR_TYPE_LABEL,
  formatDurationMs,
} from "@/lib/grammar-drill/display";
import { cn } from "@/lib/utils";

const CIRCLED = ["①", "②", "③", "④", "⑤"];

/** 시도 컨텍스트 — 시도 기록에서 열면 채워지고, 질문 로그에서 열면 null */
export interface GrammarAttemptContext {
  correct: boolean;
  answer: string;
  hintUsed: number;
  conceptPeeked: boolean;
  timeMs: number;
  source: string;
  createdAt: string;
}

/** 학생 응답 원문(answer 컬럼) → 사람이 읽는 표시 */
function formatStudentAnswer(view: GrammarItemTeacherView, raw: string): string {
  if (view.type === "CHOICE") {
    const idx = Number(raw);
    if (Number.isInteger(idx) && view.options?.[idx] !== undefined) {
      return `${CIRCLED[idx] ?? idx + 1} ${view.options[idx]}`;
    }
    return raw;
  }
  if (view.type === "OX") return raw === "O" ? "O (옳다)" : raw === "X" ? "X (틀리다)" : raw;
  if (view.type === "MULTI_UNDERLINE" || view.type === "PASSAGE") {
    const n = Number(raw);
    return Number.isInteger(n) && n >= 1 && n <= 5 ? `${CIRCLED[n - 1]} 선택` : raw;
  }
  return raw; // 서술형 원문
}

export function GrammarItemModal({
  itemId,
  attempt,
  open,
  onClose,
}: {
  itemId: string | null;
  attempt: GrammarAttemptContext | null;
  open: boolean;
  onClose: () => void;
}) {
  const [view, setView] = useState<GrammarItemTeacherView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !itemId) return;
    let alive = true;
    setLoading(true);
    setError(null);
    setView(null);
    getGrammarItemTeacherView(itemId)
      .then((res) => {
        if (!alive) return;
        if (res.success && res.data) setView(res.data);
        else setError(res.error ?? "문항을 불러오지 못했습니다.");
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [open, itemId]);

  return (
    <WideModal
      open={open}
      onClose={onClose}
      icon={BookOpen}
      title={view ? `${view.unitTitle} · ${view.conceptTitle}` : "문항 상세"}
      description={
        view
          ? `${GRAMMAR_TYPE_LABEL[view.type] ?? view.type} · 난이도 D${view.difficulty}`
          : undefined
      }
    >
      <div className="flex flex-col gap-4 p-4 pb-8 sm:p-6 sm:pb-10">
        {loading ? (
          <div className="flex flex-col gap-3">
            <div className="h-24 animate-pulse rounded-lg bg-slate-100" />
            <div className="h-16 animate-pulse rounded-lg bg-slate-100" />
          </div>
        ) : error ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-center text-[13px] text-rose-700">
            {error}
          </p>
        ) : view ? (
          <>
            {/* 문항 원문 — teacher-markup(globals.css)이 밑줄·번호·빈칸 스타일 +
                정오 하이라이트(정답 emerald · 학생 오선택 rose)를 입힌다 */}
            <div className="teacher-markup rounded-lg border border-slate-200 bg-white p-4">
              {view.directive ? (
                <p className="mb-2 text-[12.5px] font-semibold text-slate-500">
                  {view.directive}
                </p>
              ) : null}
              <MarkupText
                text={view.text}
                className="font-serif text-[15px] leading-loose text-slate-800"
                underlineStateFor={(n) => {
                  if (n === null) return "idle";
                  if (view.answerNumber !== null && n === view.answerNumber) return "correct";
                  if (
                    attempt &&
                    !attempt.correct &&
                    (view.type === "MULTI_UNDERLINE" || view.type === "PASSAGE") &&
                    Number(attempt.answer) === n
                  ) {
                    return "wrong";
                  }
                  return "idle";
                }}
              />
              {view.options ? (
                <div className="mt-3 flex flex-col gap-1.5">
                  {view.options.map((opt, i) => {
                    const isAnswer = view.answerDisplay.startsWith(CIRCLED[i] ?? "");
                    const isStudentPick =
                      attempt && view.type === "CHOICE" && Number(attempt.answer) === i;
                    return (
                      <div
                        key={i}
                        className={cn(
                          "flex items-center gap-2 rounded-md border px-3 py-1.5 text-[13.5px]",
                          isAnswer
                            ? "border-emerald-200 bg-emerald-50/60 text-emerald-800"
                            : isStudentPick
                              ? "border-rose-200 bg-rose-50/60 text-rose-800"
                              : "border-slate-100 text-slate-600",
                        )}
                      >
                        <span className="font-semibold">{CIRCLED[i] ?? i + 1}</span>
                        <span className="font-serif">{opt}</span>
                        {isAnswer ? (
                          <CheckCircle2 className="ml-auto size-4 text-emerald-500" aria-hidden />
                        ) : isStudentPick ? (
                          <XCircle className="ml-auto size-4 text-rose-500" aria-hidden />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
              {view.translation ? (
                <p className="mt-3 border-t border-slate-100 pt-2.5 text-[12.5px] text-slate-400">
                  {view.translation}
                </p>
              ) : null}
            </div>

            {/* 판정 결과 (시도 컨텍스트가 있을 때) */}
            {attempt ? (
              <div
                className={cn(
                  "flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border p-3.5",
                  attempt.correct
                    ? "border-emerald-200 bg-emerald-50/50"
                    : "border-rose-200 bg-rose-50/50",
                )}
              >
                <StatusPill tone={attempt.correct ? "emerald" : "rose"}>
                  {attempt.correct ? "정답" : "오답"}
                </StatusPill>
                <span className="text-[13px] text-slate-700">
                  학생 응답:{" "}
                  <span className={cn("font-semibold", attempt.correct ? "text-emerald-700" : "text-rose-700")}>
                    {formatStudentAnswer(view, attempt.answer)}
                  </span>
                </span>
                <span className="text-[12px] text-slate-400">
                  {GRAMMAR_SOURCE_LABEL[attempt.source] ?? attempt.source} ·{" "}
                  {formatDurationMs(attempt.timeMs)}
                  {attempt.hintUsed > 0 ? ` · 힌트 ${attempt.hintUsed}단계` : ""}
                  {attempt.conceptPeeked ? " · 개념 열람" : ""}
                </span>
              </div>
            ) : null}

            {/* 정답·해설 */}
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="flex items-center gap-1.5 text-[12px] font-bold text-slate-500">
                <CheckCircle2 className="size-3.5 text-emerald-500" aria-hidden />
                정답
              </p>
              <p className="mt-1 font-serif text-[14px] font-semibold text-emerald-700">
                {view.answerDisplay}
              </p>
              <p className="mt-3 flex items-center gap-1.5 text-[12px] font-bold text-slate-500">
                <Lightbulb className="size-3.5 text-blue-500" aria-hidden />
                해설
              </p>
              <p className="mt-1 whitespace-pre-line text-[13.5px] leading-relaxed text-slate-700">
                {view.explanation}
              </p>
              {view.rationales && view.rationales.length > 0 ? (
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <p className="mb-1.5 text-[12px] font-bold text-slate-500">밑줄별 판단 근거</p>
                  <ul className="flex flex-col gap-1">
                    {view.rationales.map((r, i) => {
                      // 정오 판정 — 지문 하이라이트(underlineStateFor)와 동일 로직 재사용
                      const n = i + 1;
                      const isAnswer =
                        view.answerNumber !== null && n === view.answerNumber;
                      const isWrongPick =
                        !isAnswer &&
                        attempt !== null &&
                        !attempt.correct &&
                        (view.type === "MULTI_UNDERLINE" || view.type === "PASSAGE") &&
                        Number(attempt.answer) === n;
                      return (
                        <li
                          key={i}
                          className={cn(
                            "flex gap-2 text-[13px] leading-relaxed text-slate-600",
                            isAnswer
                              ? "border-l-2 border-emerald-400 pl-2"
                              : isWrongPick
                                ? "border-l-2 border-rose-400 pl-2"
                                : null,
                          )}
                        >
                          <span className="shrink-0 font-semibold text-slate-400">
                            {CIRCLED[i] ?? i + 1}
                          </span>
                          <span className="min-w-0 flex-1">{r}</span>
                          {isAnswer ? (
                            <CheckCircle2
                              className="mt-0.5 size-3.5 shrink-0 text-emerald-500"
                              aria-hidden
                            />
                          ) : isWrongPick ? (
                            <XCircle
                              className="mt-0.5 size-3.5 shrink-0 text-rose-500"
                              aria-hidden
                            />
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
            </div>

            {/* 힌트(학생에게 보였던 계단) */}
            <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3.5">
              <p className="mb-1.5 flex items-center gap-1.5 text-[12px] font-bold text-slate-400">
                <Eye className="size-3.5" aria-hidden />
                학생에게 제공되는 힌트 계단
              </p>
              <ol className="flex flex-col gap-1 text-[12.5px] text-slate-500">
                <li>1단계 · {view.hints[0]}</li>
                <li>2단계 · {view.hints[1]}</li>
              </ol>
            </div>
          </>
        ) : null}
      </div>
    </WideModal>
  );
}
