"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  GraduationCap,
  Calendar,
  Clock,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  FileText,
} from "lucide-react";
import { formatDate } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ExamSubmission {
  id: string;
  status: string;
  score: number | null;
  maxScore: number | null;
  percent: number | null;
}

interface ExamItem {
  id: string;
  title: string;
  type: string;
  examDate: string | Date | null;
  duration: number | null;
  totalPoints: number;
  questionCount: number;
  className: string;
  submission: ExamSubmission | null;
}

interface Props {
  exams: ExamItem[];
  studentId: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getExamStatus(exam: ExamItem) {
  if (!exam.submission) return { label: "미응시", color: "text-[#8B95A1]", bg: "bg-gray-100" };
  switch (exam.submission.status) {
    case "IN_PROGRESS":
      return { label: "진행중", color: "text-amber-700", bg: "bg-amber-100" };
    case "SUBMITTED":
      return { label: "채점중", color: "text-blue-700", bg: "bg-blue-100" };
    case "GRADED":
      return { label: "완료", color: "text-emerald-700", bg: "bg-emerald-100" };
    default:
      return { label: "미응시", color: "text-[#8B95A1]", bg: "bg-gray-100" };
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function StudentExamList({ exams, studentId }: Props) {
  const available = exams.filter(
    (e) => !e.submission || e.submission.status === "IN_PROGRESS"
  );
  const completed = exams.filter(
    (e) =>
      e.submission &&
      (e.submission.status === "SUBMITTED" || e.submission.status === "GRADED")
  );

  return (
    <div className="p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-blue-50">
          <GraduationCap className="size-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-[#191F28]">시험</h1>
          <p className="text-xs text-[#8B95A1]">
            시험 응시 및 결과 확인
          </p>
        </div>
      </div>

      {/* Available Exams */}
      {available.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-[#4E5968] mb-3">
            응시 가능한 시험
          </h2>
          <div className="space-y-3">
            {available.map((exam) => {
              const status = getExamStatus(exam);
              return (
                <div
                  key={exam.id}
                  className="rounded-xl border border-[#E5E8EB] bg-white p-4"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-[15px] font-semibold text-[#191F28]">
                        {exam.title}
                      </h3>
                      <div className="flex items-center gap-3 mt-1 text-xs text-[#8B95A1]">
                        <span>{exam.className}</span>
                        {exam.examDate && (
                          <span className="flex items-center gap-1">
                            <Calendar className="size-3" />
                            {formatDate(exam.examDate)}
                          </span>
                        )}
                        {exam.duration && (
                          <span className="flex items-center gap-1">
                            <Clock className="size-3" />
                            {exam.duration}분
                          </span>
                        )}
                        <span>{exam.questionCount}문제</span>
                      </div>
                    </div>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                        status.bg,
                        status.color
                      )}
                    >
                      {status.label}
                    </span>
                  </div>
                  <Button
                    asChild
                    className="w-full bg-[#3182F6] hover:bg-[#1B64DA]"
                  >
                    <Link href={`/exams/${exam.id}/take`}>
                      {exam.submission?.status === "IN_PROGRESS"
                        ? "이어서 풀기"
                        : "시험 보기"}
                      <ChevronRight className="size-4 ml-1" />
                    </Link>
                  </Button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Completed Exams */}
      {completed.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-[#4E5968] mb-3">
            완료된 시험
          </h2>
          <div className="space-y-2">
            {completed.map((exam) => {
              const status = getExamStatus(exam);
              const sub = exam.submission!;
              return (
                <Link
                  key={exam.id}
                  href={
                    sub.status === "GRADED"
                      ? `/exams/${exam.id}/result`
                      : "#"
                  }
                  className="flex items-center gap-4 rounded-xl border border-[#E5E8EB] bg-white p-4 hover:bg-[#F7F8FA] transition-colors"
                >
                  <div
                    className={cn(
                      "flex size-10 items-center justify-center rounded-full",
                      sub.status === "GRADED"
                        ? "bg-emerald-50"
                        : "bg-blue-50"
                    )}
                  >
                    {sub.status === "GRADED" ? (
                      <CheckCircle2 className="size-5 text-emerald-600" />
                    ) : (
                      <AlertCircle className="size-5 text-blue-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-[#191F28]">
                      {exam.title}
                    </h3>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-[#8B95A1]">
                      <span>{exam.className}</span>
                      <span
                        className={cn(
                          "font-medium",
                          status.color
                        )}
                      >
                        {status.label}
                      </span>
                    </div>
                  </div>
                  {sub.score != null && (
                    <div className="text-right">
                      <p className="text-lg font-bold text-[#191F28]">
                        {sub.score}
                        <span className="text-sm text-[#8B95A1] font-normal">
                          /{sub.maxScore}
                        </span>
                      </p>
                      <p className="text-xs text-[#8B95A1]">
                        {Math.round(sub.percent || 0)}%
                      </p>
                    </div>
                  )}
                  <ChevronRight className="size-4 text-[#8B95A1] shrink-0" />
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Empty State */}
      {exams.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-[#8B95A1]">
          <FileText className="size-12 mb-3 opacity-40" />
          <p className="text-sm">예정된 시험이 없습니다.</p>
        </div>
      )}
    </div>
  );
}
