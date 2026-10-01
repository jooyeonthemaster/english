"use client";

// 최종 문항 렌더 — 밑줄 ①~⑤(markedPassage 마커 기준), 정답은 「정답 보기」 이후에만 칠한다.
// 정답/고침/해설/오답 + 밑줄표(원형·표시형·코드·jev P).

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

import type { MdGrammarQuestion } from "@/lib/md-qgen/parser";
import type { VerifyResult } from "@/lib/qgen-lab/types";
import { cn } from "@/lib/utils";
import { circledOfLabel, questionSegments } from "./passage-utils";
import { IssueList, Mono } from "./ui-bits";

export function QuestionView({
  question,
  passage,
  verify,
}: {
  question: MdGrammarQuestion;
  passage: string;
  verify?: VerifyResult | null;
}) {
  const [reveal, setReveal] = useState(false);
  const { segments, unmatched } = questionSegments(passage, question);
  const answers = question.answers?.length ? question.answers : [question.answer];
  const pByLabel = new Map((verify?.perMark ?? []).map((m) => [m.label, m.pGrammatical]));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[0.6875rem] font-bold tracking-[0.12em] text-stone-500 uppercase">최종 문항</span>
        <button
          type="button"
          onClick={() => setReveal((v) => !v)}
          className={cn(
            "inline-flex h-[26px] items-center gap-1 rounded-md border px-2 text-[0.6875rem] font-semibold",
            reveal ? "border-stone-900 bg-stone-900 text-[#fffefa]" : "border-stone-300 bg-white text-stone-700 hover:border-stone-500",
          )}
        >
          {reveal ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
          {reveal ? "정답 가리기" : "정답 보기"}
        </button>
      </div>

      <div className="rounded-md border border-stone-200 bg-white px-4 py-3">
        <p className="mb-2 text-[0.8125rem] font-bold text-stone-900">다음 글의 밑줄 친 부분 중, 어법상 틀린 것은?</p>
        <p className="font-serif text-[0.9375rem] leading-[1.9] text-stone-900">
          {segments.map((s, i) =>
            s.type === "text" ? (
              <span key={i}>{s.text}</span>
            ) : (
              <span key={i} className="whitespace-nowrap">
                <span className={cn("mr-0.5 font-sans text-[0.8125rem]", reveal && s.isAnswer && "font-bold text-orange-700")}>
                  {s.circled}
                </span>
                <span
                  className={cn(
                    "underline decoration-stone-900 decoration-1 underline-offset-[5px]",
                    reveal && s.isAnswer && "bg-orange-100 decoration-orange-600 decoration-2",
                  )}
                >
                  {s.text}
                </span>
              </span>
            ),
          )}
        </p>
      </div>

      {unmatched.length > 0 && <IssueList tone="muted" issues={unmatched.map((u) => `위치 못 찾은 밑줄: ${u}`)} />}

      {reveal && (
        <div className="space-y-2 text-[0.8125rem] leading-6 text-stone-800">
          <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-2 gap-y-1">
            <span className="font-bold text-stone-500">정답</span>
            <span className="font-semibold text-stone-900">
              {answers.map((a) => `${circledOfLabel(question, a)} ${a}`).join(", ")}
            </span>
            <span className="font-bold text-stone-500">고침</span>
            <span>
              {answers.map((a) => {
                const mark = question.marks.find((m) => m.label === a);
                const fix = question.fixes?.[a] ?? (a === question.answer ? question.fix : "");
                return (
                  <span key={a} className="mr-3">
                    <span className="text-stone-500 line-through decoration-orange-500">{mark?.shown ?? "?"}</span>
                    <span className="mx-1 text-stone-400">→</span>
                    <span className="font-semibold text-stone-900">{fix || "—"}</span>
                  </span>
                );
              })}
            </span>
            <span className="font-bold text-stone-500">해설</span>
            <span className="whitespace-pre-wrap">{question.explanation || "—"}</span>
            <span className="font-bold text-stone-500">오답</span>
            <ul className="space-y-0.5">
              {question.wrong.length === 0 && <li className="text-stone-400">—</li>}
              {question.wrong.map((w) => (
                <li key={w.label}>
                  <span className="mr-1 font-semibold">{circledOfLabel(question, w.label)}</span>
                  {w.text}
                </li>
              ))}
            </ul>
          </div>

          <table className="w-full border-collapse text-[0.75rem]">
            <thead>
              <tr className="border-b border-stone-300 text-left text-[0.6875rem] text-stone-500">
                <th className="py-1 pr-2 font-semibold">#</th>
                <th className="py-1 pr-2 font-semibold">표시형</th>
                <th className="py-1 pr-2 font-semibold">원형</th>
                <th className="py-1 pr-2 font-semibold">코드</th>
                <th className="py-1 text-right font-semibold">jev P(옳음)</th>
              </tr>
            </thead>
            <tbody>
              {question.marks.map((m) => {
                const isAns = answers.includes(m.label);
                const p = pByLabel.get(m.label) ?? pByLabel.get(circledOfLabel(question, m.label));
                return (
                  <tr key={m.label} className={cn("border-b border-stone-100", isAns && "bg-orange-50/70")}>
                    <td className="py-1 pr-2 whitespace-nowrap">
                      {circledOfLabel(question, m.label)} <Mono className="text-stone-400">{m.label}</Mono>
                    </td>
                    <td className="py-1 pr-2 font-serif">{m.shown}</td>
                    <td className={cn("py-1 pr-2 font-serif", m.original !== m.shown && "text-orange-800")}>{m.original}</td>
                    <td className="py-1 pr-2">
                      <Mono>{m.code || "—"}</Mono>
                    </td>
                    <td className="py-1 text-right">
                      {p == null ? (
                        <span className="text-stone-300">—</span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-1 w-12 overflow-hidden rounded-full bg-stone-200">
                            <span
                              className={cn("block h-full", isAns ? "bg-orange-600" : "bg-stone-700")}
                              style={{ width: `${Math.round(p * 100)}%` }}
                            />
                          </span>
                          <Mono>{p.toFixed(2)}</Mono>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
