"use client";

import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ActivityFeedback {
  isCorrect: boolean;
  scoreEarned: number;
  scoreMax: number;
  explanation: string;
  degraded?: boolean; // AI 채점 지연 등 임시 상태
}

export function FeedbackPanel({ feedback }: { feedback: ActivityFeedback }) {
  const pending = feedback.degraded;
  return (
    <section
      className={cn(
        "space-y-2 border-l-2 pl-3",
        pending ? "border-slate-300" : feedback.isCorrect ? "border-blue-500" : "border-rose-400",
      )}
    >
      <div className="flex items-center gap-1.5">
        {pending ? (
          <Clock className="size-4 text-slate-500" />
        ) : feedback.isCorrect ? (
          <CheckCircle2 className="size-4 text-blue-600" />
        ) : (
          <XCircle className="size-4 text-rose-500" />
        )}
        <p
          className={cn(
            "text-[13px] font-bold",
            pending ? "text-slate-600" : feedback.isCorrect ? "text-blue-700" : "text-rose-600",
          )}
        >
          {pending ? "채점 대기" : feedback.isCorrect ? "정답입니다" : "다시 점검해요"} · {feedback.scoreEarned}/
          {feedback.scoreMax}점
        </p>
      </div>
      <p className="whitespace-pre-wrap text-[12.5px] font-medium leading-6 text-slate-700">{feedback.explanation}</p>
    </section>
  );
}
