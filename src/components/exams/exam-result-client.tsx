"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Check,
  X,
  Clock,
  Minus,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ResultQuestion {
  orderNum: number;
  points: number;
  questionId: string;
  type: string;
  questionText: string;
  options: { label: string; text: string }[] | null;
  correctAnswer: string;
  studentAnswer: string;
  isCorrect: boolean | null;
  manualScore?: number;
  feedback?: string;
  explanation: string | null;
}

interface ExamResult {
  id: string;
  examId: string;
  examTitle: string;
  examType: string;
  studentName: string;
  score: number | null;
  maxScore: number | null;
  percent: number | null;
  status: string;
  questions: ResultQuestion[];
}

interface Props {
  result: ExamResult;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function ExamResultClient({ result }: Props) {
  const router = useRouter();

  const totalCorrect = result.questions.filter(
    (q) => q.isCorrect === true
  ).length;
  const totalWrong = result.questions.filter(
    (q) => q.isCorrect === false
  ).length;
  const pending = result.questions.filter(
    (q) => q.isCorrect === null
  ).length;

  return (
    <div className="p-4 space-y-6 max-w-[480px] mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/exams")}
          className="shrink-0"
        >
          <ArrowLeft className="size-5" />
        </Button>
        <h1 className="text-lg font-bold text-[#191F28]">시험 결과</h1>
      </div>

      {/* Score Circle */}
      <div className="flex flex-col items-center py-8">
        <div className="relative">
          <svg className="size-32" viewBox="0 0 120 120">
            <circle
              cx="60"
              cy="60"
              r="52"
              fill="none"
              stroke="#F2F4F6"
              strokeWidth="8"
            />
            <circle
              cx="60"
              cy="60"
              r="52"
              fill="none"
              stroke={
                (result.percent || 0) >= 80
                  ? "#10B981"
                  : (result.percent || 0) >= 60
                    ? "#3B82F6"
                    : (result.percent || 0) >= 40
                      ? "#F59E0B"
                      : "#EF4444"
              }
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${((result.percent || 0) / 100) * 327} 327`}
              transform="rotate(-90 60 60)"
              className="transition-all duration-1000"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {result.score != null ? (
              <>
                <span className="text-3xl font-bold text-[#191F28]">
                  {result.score}
                </span>
                <span className="text-sm text-[#8B95A1]">
                  / {result.maxScore}
                </span>
              </>
            ) : (
              <span className="text-sm text-[#8B95A1]">채점중</span>
            )}
          </div>
        </div>

        <h2 className="text-lg font-semibold text-[#191F28] mt-4">
          {result.examTitle}
        </h2>

        {/* Score Summary */}
        <div className="flex items-center gap-6 mt-4">
          <div className="text-center">
            <div className="flex items-center justify-center size-8 rounded-full bg-emerald-100 mx-auto">
              <Check className="size-4 text-emerald-600" />
            </div>
            <p className="text-xs text-[#8B95A1] mt-1">정답</p>
            <p className="text-sm font-bold text-emerald-600">{totalCorrect}</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center size-8 rounded-full bg-red-100 mx-auto">
              <X className="size-4 text-red-600" />
            </div>
            <p className="text-xs text-[#8B95A1] mt-1">오답</p>
            <p className="text-sm font-bold text-red-600">{totalWrong}</p>
          </div>
          {pending > 0 && (
            <div className="text-center">
              <div className="flex items-center justify-center size-8 rounded-full bg-amber-100 mx-auto">
                <Clock className="size-4 text-amber-600" />
              </div>
              <p className="text-xs text-[#8B95A1] mt-1">채점중</p>
              <p className="text-sm font-bold text-amber-600">{pending}</p>
            </div>
          )}
        </div>
      </div>

      {/* Question-by-Question Review */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-[#4E5968]">
          문항별 결과
        </h3>
        {result.questions.map((q) => (
          <div
            key={q.questionId}
            className="rounded-xl border border-[#E5E8EB] bg-white overflow-hidden"
          >
            {/* Question Header */}
            <div
              className={cn(
                "flex items-center gap-3 px-4 py-3 border-b",
                q.isCorrect === true
                  ? "bg-emerald-50/50 border-emerald-100"
                  : q.isCorrect === false
                    ? "bg-red-50/50 border-red-100"
                    : "bg-amber-50/50 border-amber-100"
              )}
            >
              <span
                className={cn(
                  "flex size-7 items-center justify-center rounded-full text-xs font-bold",
                  q.isCorrect === true
                    ? "bg-emerald-100 text-emerald-700"
                    : q.isCorrect === false
                      ? "bg-red-100 text-red-700"
                      : "bg-amber-100 text-amber-700"
                )}
              >
                {q.isCorrect === true ? (
                  <Check className="size-4" />
                ) : q.isCorrect === false ? (
                  <X className="size-4" />
                ) : (
                  <Minus className="size-4" />
                )}
              </span>
              <span className="text-sm font-medium text-[#191F28]">
                {q.orderNum}번
              </span>
              <span className="text-xs text-[#8B95A1] ml-auto">
                {q.manualScore !== undefined
                  ? `${q.manualScore}/${q.points}점`
                  : q.isCorrect === true
                    ? `${q.points}/${q.points}점`
                    : q.isCorrect === false
                      ? `0/${q.points}점`
                      : `?/${q.points}점`}
              </span>
            </div>

            {/* Question Body */}
            <div className="px-4 py-3 space-y-3">
              <p className="text-sm text-[#191F28] whitespace-pre-wrap">
                {q.questionText}
              </p>

              {/* Answers */}
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <span className="text-xs text-[#8B95A1] shrink-0 mt-0.5 w-12">
                    내 답:
                  </span>
                  <span
                    className={cn(
                      "text-sm",
                      q.isCorrect === false
                        ? "text-red-600 line-through"
                        : "text-[#191F28]"
                    )}
                  >
                    {q.studentAnswer || "(미답)"}
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-xs text-[#8B95A1] shrink-0 mt-0.5 w-12">
                    정답:
                  </span>
                  <span className="text-sm text-emerald-600 font-medium">
                    {q.correctAnswer}
                  </span>
                </div>
              </div>

              {/* Feedback */}
              {q.feedback && (
                <div className="rounded-lg bg-blue-50 p-3">
                  <p className="text-xs text-[#8B95A1] mb-1">
                    선생님 피드백
                  </p>
                  <p className="text-sm text-[#191F28]">{q.feedback}</p>
                </div>
              )}

              {/* Explanation */}
              {q.explanation && (
                <div className="rounded-lg bg-[#F7F8FA] p-3">
                  <p className="text-xs text-[#8B95A1] mb-1">해설</p>
                  <p className="text-sm text-[#4E5968]">{q.explanation}</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Back Button */}
      <div className="pb-4">
        <Button
          variant="outline"
          className="w-full border-[#E5E8EB]"
          onClick={() => router.push("/exams")}
        >
          시험 목록으로 돌아가기
        </Button>
      </div>
    </div>
  );
}
