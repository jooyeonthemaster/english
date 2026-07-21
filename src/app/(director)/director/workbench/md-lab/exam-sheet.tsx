"use client";

import { useState } from "react";

import {
  circledForMarkIndex,
  segmentPassage,
  type MdQuestion,
} from "@/lib/md-lab/parser";

// 시험지 렌더 + 해설지 + PDF 인쇄 — 마크다운 파싱 결과만으로 전부 구성한다.
export function ExamSheet({
  passage,
  question,
}: {
  passage: string;
  question: MdQuestion;
}) {
  const [withAnswers, setWithAnswers] = useState(true);
  const { segments, unmatched } = segmentPassage(passage, question);

  const direction =
    question.kind === "blank"
      ? "다음 빈칸에 들어갈 말로 가장 적절한 것을 고르시오."
      : "다음 글의 밑줄 친 부분 중, 어법상 틀린 것은?";

  const answerDisplay =
    question.kind === "blank"
      ? question.answer
      : circledForMarkIndex(
          question.marks.findIndex((m) => m.label === question.answer),
        );

  return (
    <section className="space-y-3">
      <div className="no-print flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">시험지 미리보기</h2>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={withAnswers}
              onChange={(e) => setWithAnswers(e.target.checked)}
            />
            해설지 포함
          </label>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800"
          >
            PDF로 인쇄
          </button>
        </div>
      </div>

      {unmatched.length > 0 && (
        <p className="no-print text-xs font-medium text-amber-600">
          지문에서 위치를 찾지 못한 표현: {unmatched.join(", ")} — 편집기에서
          원문표현을 지문 축자로 고치면 반영됩니다.
        </p>
      )}

      <div className="md-lab-print-area rounded-2xl border border-slate-300 bg-white p-8 shadow-sm">
        <div className="border-b-2 border-slate-900 pb-2 text-center">
          <p className="text-xs tracking-widest text-slate-500">
            제 3 교시 · md-lab 실험 출력
          </p>
          <p className="mt-1 text-lg font-bold text-slate-900">영어 영역</p>
        </div>

        <div className="mt-6 space-y-4 font-serif">
          <p className="text-[15px] font-bold text-slate-900">1. {direction}</p>
          <p className="text-[14.5px] leading-7 text-slate-900">
            {segments.map((seg, i) => {
              if (seg.type === "text") return <span key={i}>{seg.text}</span>;
              if (seg.type === "blank")
                return (
                  <span
                    key={i}
                    className="mx-1 inline-block min-w-40 border-b border-slate-900 text-center align-baseline"
                  >
                    {" ".repeat(30)}
                  </span>
                );
              return (
                <span key={i} className="whitespace-nowrap">
                  {seg.label}{" "}
                  <span className="underline decoration-slate-900 underline-offset-4">
                    {seg.text}
                  </span>
                </span>
              );
            })}
          </p>

          {question.kind === "blank" && (
            <ol className="space-y-1.5 text-[14.5px] text-slate-900">
              {question.options.map((o) => (
                <li key={o.label}>
                  {o.label} {o.text}
                </li>
              ))}
            </ol>
          )}
        </div>

        {withAnswers && (
          <div className="mt-8 border-t border-dashed border-slate-300 pt-5">
            <p className="text-sm font-bold text-slate-900">[정답 및 해설]</p>
            <p className="mt-2 text-sm text-slate-900">
              <span className="font-bold">정답 {answerDisplay}</span>
              {question.kind === "grammar" && question.fix && (
                <span className="ml-2 text-slate-600">
                  (고침: {question.fix})
                </span>
              )}
            </p>
            <p className="mt-1.5 text-sm leading-6 text-slate-800">
              {question.explanation}
            </p>
            <ul
              className={`mt-2 space-y-1 text-[13px] leading-5 text-slate-600 ${
                question.wrong.length === 0 ? "hidden" : ""
              }`}
            >
              {question.wrong.map((w, i) => (
                <li key={w.label}>
                  {question.kind === "grammar"
                    ? circledForMarkIndex(
                        question.marks.findIndex((m) => m.label === w.label),
                      )
                    : w.label}{" "}
                  {w.text}
                  {i === question.wrong.length - 1 ? "" : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
