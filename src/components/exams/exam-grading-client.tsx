"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  User,
} from "lucide-react";
import { gradeSubmission } from "@/actions/exam-grading";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ExamQuestion {
  id: string;
  orderNum: number;
  points: number;
  question: {
    id: string;
    type: string;
    questionText: string;
    options: string | null;
    correctAnswer: string;
  };
}

interface Submission {
  id: string;
  status: string;
  score: number | null;
  answers: string;
  student: { id: string; name: string; studentCode: string };
}

interface Props {
  examId: string;
  examTitle: string;
  totalPoints: number;
  questions: ExamQuestion[];
  submissions: Submission[];
}

interface QuestionGrade {
  score: number;
  feedback: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function ExamGradingClient({
  examId,
  examTitle,
  totalPoints,
  questions,
  submissions,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedIdx, setSelectedIdx] = useState(0);

  // Grades state: per student, per question
  const [allGrades, setAllGrades] = useState<
    Record<string, Record<string, QuestionGrade>>
  >(() => {
    const initial: Record<string, Record<string, QuestionGrade>> = {};
    for (const sub of submissions) {
      initial[sub.id] = {};
      const answers = JSON.parse(sub.answers || "{}");
      for (const eq of questions) {
        const answer = answers[eq.question.id];
        const existingScore =
          typeof answer === "object" ? answer?.manualScore : undefined;
        const existingFeedback =
          typeof answer === "object" ? answer?.feedback : undefined;
        initial[sub.id][eq.question.id] = {
          score: existingScore ?? 0,
          feedback: existingFeedback ?? "",
        };
      }
    }
    return initial;
  });

  const pendingSubs = submissions.filter((s) => s.status !== "GRADED");
  const gradedSubs = submissions.filter((s) => s.status === "GRADED");
  const selectedSub = submissions[selectedIdx];

  if (!selectedSub) {
    return (
      <div className="p-6 text-center text-[#8B95A1]">
        채점할 제출이 없습니다.
      </div>
    );
  }

  const answers = JSON.parse(selectedSub.answers || "{}");
  const grades = allGrades[selectedSub.id] || {};

  // Calculate auto-graded MC score
  function getAutoScore(sub: Submission) {
    const ans = JSON.parse(sub.answers || "{}");
    let score = 0;
    for (const eq of questions) {
      if (
        eq.question.type === "MULTIPLE_CHOICE" ||
        eq.question.type === "VOCAB"
      ) {
        const studentAns = ans[eq.question.id];
        const ansText =
          typeof studentAns === "string"
            ? studentAns
            : studentAns?.answer || "";
        if (
          ansText.trim().toLowerCase() ===
          eq.question.correctAnswer.trim().toLowerCase()
        ) {
          score += eq.points;
        }
      }
    }
    return score;
  }

  function updateGrade(
    questionId: string,
    field: "score" | "feedback",
    value: string | number
  ) {
    setAllGrades((prev) => ({
      ...prev,
      [selectedSub.id]: {
        ...prev[selectedSub.id],
        [questionId]: {
          ...prev[selectedSub.id]?.[questionId],
          [field]: value,
        },
      },
    }));
  }

  function handleGradeSubmit() {
    startTransition(async () => {
      const gradeInputs = Object.entries(grades)
        .filter(([qId]) => {
          const eq = questions.find((q) => q.question.id === qId);
          return (
            eq &&
            eq.question.type !== "MULTIPLE_CHOICE" &&
            eq.question.type !== "VOCAB"
          );
        })
        .map(([questionId, grade]) => ({
          questionId,
          score: grade.score,
          feedback: grade.feedback,
        }));

      // Total = auto MC score + manual scores
      const autoScore = getAutoScore(selectedSub);
      const manualScore = gradeInputs.reduce((acc, g) => acc + g.score, 0);
      const total = autoScore + manualScore;

      const result = await gradeSubmission(selectedSub.id, gradeInputs, total);
      if (result.success) {
        toast.success(`${selectedSub.student.name} 채점 완료`);
        // Move to next ungraded
        if (selectedIdx < submissions.length - 1) {
          setSelectedIdx(selectedIdx + 1);
        }
        router.refresh();
      } else {
        toast.error(result.error || "채점에 실패했습니다.");
      }
    });
  }

  const mcQuestions = questions.filter(
    (eq) =>
      eq.question.type === "MULTIPLE_CHOICE" || eq.question.type === "VOCAB"
  );
  const manualQuestions = questions.filter(
    (eq) =>
      eq.question.type !== "MULTIPLE_CHOICE" && eq.question.type !== "VOCAB"
  );
  const autoScore = getAutoScore(selectedSub);
  const progressPercent =
    submissions.length > 0
      ? (gradedSubs.length / submissions.length) * 100
      : 0;

  return (
    <div className="flex h-[calc(100vh-64px)]">
      {/* Left: Student List */}
      <div className="w-72 border-r border-[#E5E8EB] bg-white flex flex-col">
        <div className="p-4 border-b border-[#E5E8EB]">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(`/director/exams/${examId}`)}
            className="mb-2 -ml-2"
          >
            <ArrowLeft className="size-4 mr-1" />
            돌아가기
          </Button>
          <h2 className="text-sm font-semibold text-[#191F28]">{examTitle}</h2>
          <div className="mt-2">
            <div className="flex items-center justify-between text-xs text-[#8B95A1] mb-1">
              <span>채점 진행률</span>
              <span>
                {gradedSubs.length}/{submissions.length}
              </span>
            </div>
            <Progress value={progressPercent} className="h-2" />
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {submissions.map((sub, idx) => (
              <button
                key={sub.id}
                onClick={() => setSelectedIdx(idx)}
                className={cn(
                  "w-full flex items-center gap-3 rounded-lg p-3 text-left transition-colors",
                  idx === selectedIdx
                    ? "bg-blue-50 border border-[#3182F6]/30"
                    : "hover:bg-[#F7F8FA]"
                )}
                aria-current={idx === selectedIdx ? "true" : undefined}
              >
                <div
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full text-xs font-medium",
                    sub.status === "GRADED"
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-gray-100 text-gray-600"
                  )}
                >
                  {sub.status === "GRADED" ? (
                    <Check className="size-4" />
                  ) : (
                    <User className="size-4" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#191F28] truncate">
                    {sub.student.name}
                  </p>
                  <p className="text-xs text-[#8B95A1]">
                    {sub.status === "GRADED"
                      ? `${sub.score}/${totalPoints}점`
                      : `객관식: ${getAutoScore(sub)}점`}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Right: Grading Area */}
      <div className="flex-1 overflow-auto">
        <div className="p-6 space-y-6 max-w-3xl">
          {/* Student Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() =>
                  setSelectedIdx(Math.max(0, selectedIdx - 1))
                }
                disabled={selectedIdx === 0}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <h2 className="text-lg font-bold text-[#191F28]">
                {selectedSub.student.name}
              </h2>
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() =>
                  setSelectedIdx(
                    Math.min(submissions.length - 1, selectedIdx + 1)
                  )
                }
                disabled={selectedIdx === submissions.length - 1}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
            <div className="text-sm text-[#8B95A1]">
              객관식 자동 채점: {autoScore}점
            </div>
          </div>

          {/* Auto-graded MC Summary */}
          {mcQuestions.length > 0 && (
            <div className="rounded-lg border border-[#E5E8EB] p-4">
              <h3 className="text-sm font-semibold text-[#191F28] mb-3">
                객관식 (자동 채점)
              </h3>
              <div className="grid grid-cols-5 gap-2">
                {mcQuestions.map((eq) => {
                  const ans = answers[eq.question.id];
                  const ansText =
                    typeof ans === "string" ? ans : ans?.answer || "";
                  const correct =
                    ansText.trim().toLowerCase() ===
                    eq.question.correctAnswer.trim().toLowerCase();
                  return (
                    <div
                      key={eq.id}
                      className={cn(
                        "flex flex-col items-center justify-center rounded-lg p-2 text-xs",
                        correct
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : ansText
                            ? "bg-red-50 text-red-700 border border-red-200"
                            : "bg-gray-50 text-gray-500 border border-gray-200"
                      )}
                    >
                      <span className="font-bold">{eq.orderNum}번</span>
                      <span>
                        {correct ? "O" : ansText ? "X" : "미답"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Manual Grading Questions */}
          {manualQuestions.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-[#191F28]">
                주관식/서술형 (수동 채점)
              </h3>
              {manualQuestions.map((eq) => {
                const ans = answers[eq.question.id];
                const ansText =
                  typeof ans === "string" ? ans : ans?.answer || "";
                const grade = grades[eq.question.id] || {
                  score: 0,
                  feedback: "",
                };

                return (
                  <div
                    key={eq.id}
                    className="rounded-lg border border-[#E5E8EB] p-5 space-y-4"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="inline-flex size-6 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-[#3182F6] mr-2">
                          {eq.orderNum}
                        </span>
                        <span className="text-sm text-[#8B95A1]">
                          ({eq.points}점)
                        </span>
                      </div>
                    </div>

                    <div>
                      <p className="text-sm text-[#191F28] whitespace-pre-wrap">
                        {eq.question.questionText}
                      </p>
                    </div>

                    <div className="rounded-lg bg-[#F7F8FA] p-3">
                      <p className="text-xs text-[#8B95A1] mb-1">
                        정답
                      </p>
                      <p className="text-sm text-emerald-700">
                        {eq.question.correctAnswer}
                      </p>
                    </div>

                    <div className="rounded-lg bg-blue-50/50 p-3">
                      <p className="text-xs text-[#8B95A1] mb-1">
                        학생 답안
                      </p>
                      <p className="text-sm text-[#191F28] whitespace-pre-wrap">
                        {ansText || "(미답)"}
                      </p>
                    </div>

                    <div className="grid grid-cols-[100px_1fr] gap-3">
                      <div>
                        <Label className="text-xs text-[#8B95A1]">
                          점수 (/{eq.points})
                        </Label>
                        <Input
                          type="number"
                          min={0}
                          max={eq.points}
                          value={grade.score}
                          onChange={(e) =>
                            updateGrade(
                              eq.question.id,
                              "score",
                              Math.min(
                                parseInt(e.target.value) || 0,
                                eq.points
                              )
                            )
                          }
                          className="mt-1 border-[#E5E8EB]"
                          aria-label={`${eq.orderNum}번 문제 점수`}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-[#8B95A1]">
                          피드백
                        </Label>
                        <Textarea
                          value={grade.feedback}
                          onChange={(e) =>
                            updateGrade(
                              eq.question.id,
                              "feedback",
                              e.target.value
                            )
                          }
                          placeholder="피드백을 입력하세요..."
                          className="mt-1 border-[#E5E8EB] h-20 resize-none"
                          aria-label={`${eq.orderNum}번 문제 피드백`}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Submit Button */}
          <div className="flex justify-end pt-4 border-t border-[#E5E8EB]">
            <Button
              onClick={handleGradeSubmit}
              disabled={isPending}
              className="bg-[#3182F6] hover:bg-[#1B64DA]"
            >
              <Check className="size-4 mr-1.5" />
              {isPending ? "저장 중..." : "채점 완료"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
