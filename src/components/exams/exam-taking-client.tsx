"use client";

import { useState, useEffect, useCallback, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Flag,
  Send,
} from "lucide-react";
import { saveAnswer, submitExam } from "@/actions/exam-taking";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ExamQuestion {
  examQuestionId: string;
  questionId: string;
  orderNum: number;
  points: number;
  type: string;
  questionText: string;
  questionImage: string | null;
  options: { label: string; text: string }[] | null;
}

interface ExamData {
  submissionId: string;
  examTitle: string;
  duration: number | null;
  startedAt: string;
  totalPoints: number;
  shuffleOptions: boolean;
  questions: ExamQuestion[];
  savedAnswers: Record<string, string>;
}

interface Props {
  examData: ExamData;
}

// ---------------------------------------------------------------------------
// Timer Hook
// ---------------------------------------------------------------------------
function useTimer(durationMinutes: number | null, startedAt: string) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!durationMinutes) {
      setRemaining(null);
      return;
    }

    const startTime = new Date(startedAt).getTime();
    const endTime = startTime + durationMinutes * 60 * 1000;

    const update = () => {
      const now = Date.now();
      const left = Math.max(0, Math.floor((endTime - now) / 1000));
      setRemaining(left);
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [durationMinutes, startedAt]);

  return remaining;
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function ExamTakingClient({ examData }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>(
    examData.savedAnswers || {}
  );
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const autoSubmittedRef = useRef(false);

  const remaining = useTimer(examData.duration, examData.startedAt);
  const questions = examData.questions;
  const currentQ = questions[currentIdx];

  const answeredCount = Object.keys(answers).filter(
    (k) => answers[k]?.trim()
  ).length;
  const unansweredCount = questions.length - answeredCount;

  // Auto-submit on timeout
  useEffect(() => {
    if (remaining === 0 && !autoSubmittedRef.current) {
      autoSubmittedRef.current = true;
      handleSubmit();
    }
  }, [remaining]);

  // Save answer with debounce
  const saveTimeout = useRef<NodeJS.Timeout | null>(null);
  const debouncedSave = useCallback(
    (questionId: string, answer: string) => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
      saveTimeout.current = setTimeout(() => {
        saveAnswer(examData.submissionId, questionId, answer);
      }, 500);
    },
    [examData.submissionId]
  );

  function setAnswer(questionId: string, value: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    debouncedSave(questionId, value);
  }

  function toggleFlag(questionId: string) {
    setFlagged((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);
      return next;
    });
  }

  function handleSubmit() {
    startTransition(async () => {
      const result = await submitExam(examData.submissionId);
      if (result.success) {
        toast.success("시험이 제출되었습니다.");
        router.replace(`/exams/${currentQ?.questionId ? "" : ""}result`);
        // Navigate back to exam list for now
        router.replace("/exams");
      } else {
        toast.error(result.error || "제출에 실패했습니다.");
      }
    });
  }

  if (!currentQ) {
    return (
      <div className="flex items-center justify-center h-screen text-[#8B95A1]">
        문제를 불러올 수 없습니다.
      </div>
    );
  }

  const isTimeLow = remaining !== null && remaining < 300; // Less than 5 min

  return (
    <div className="flex flex-col h-screen bg-white max-w-[480px] mx-auto">
      {/* Top Bar */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-[#E5E8EB] bg-white sticky top-0 z-20">
        <h1 className="text-sm font-semibold text-[#191F28] truncate max-w-[140px]">
          {examData.examTitle}
        </h1>

        {remaining !== null && (
          <div
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-mono font-semibold",
              isTimeLow
                ? "bg-red-50 text-red-600"
                : "bg-[#F7F8FA] text-[#4E5968]"
            )}
            aria-live="polite"
            aria-label={`남은 시간 ${formatTime(remaining)}`}
          >
            <Clock className="size-4" />
            {formatTime(remaining)}
          </div>
        )}

        <Button
          size="sm"
          onClick={() => setShowSubmitDialog(true)}
          className="bg-[#3182F6] hover:bg-[#1B64DA] text-xs px-3"
        >
          <Send className="size-3.5 mr-1" />
          제출
        </Button>
      </header>

      {/* Question Navigator */}
      <div className="px-4 py-2.5 border-b border-[#E5E8EB] overflow-x-auto">
        <div className="flex gap-1.5 min-w-max" role="navigation" aria-label="문제 번호">
          {questions.map((q, idx) => {
            const isAnswered = !!answers[q.questionId]?.trim();
            const isFlagged = flagged.has(q.questionId);
            const isCurrent = idx === currentIdx;
            return (
              <button
                key={q.questionId}
                onClick={() => setCurrentIdx(idx)}
                className={cn(
                  "flex size-9 items-center justify-center rounded-full text-xs font-semibold transition-all border-2",
                  isCurrent
                    ? "border-[#3182F6] bg-[#3182F6] text-white scale-110"
                    : isFlagged
                      ? "border-amber-400 bg-amber-50 text-amber-700"
                      : isAnswered
                        ? "border-[#3182F6] bg-blue-50 text-[#3182F6]"
                        : "border-[#E5E8EB] bg-white text-[#8B95A1]"
                )}
                aria-label={`${idx + 1}번 문제${isAnswered ? " (답변완료)" : ""}${isFlagged ? " (표시)" : ""}`}
                aria-current={isCurrent ? "true" : undefined}
              >
                {idx + 1}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Question Area */}
      <main className="flex-1 overflow-y-auto px-4 py-6">
        <div className="space-y-6">
          {/* Question Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-full bg-[#3182F6] text-white text-sm font-bold">
                {currentIdx + 1}
              </span>
              <span className="text-xs text-[#8B95A1]">
                {currentQ.points}점
              </span>
            </div>
            <button
              onClick={() => toggleFlag(currentQ.questionId)}
              className={cn(
                "flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                flagged.has(currentQ.questionId)
                  ? "bg-amber-100 text-amber-700"
                  : "bg-[#F7F8FA] text-[#8B95A1] hover:bg-amber-50 hover:text-amber-600"
              )}
              aria-pressed={flagged.has(currentQ.questionId)}
              aria-label="나중에 확인"
            >
              <Flag className="size-3.5" />
              {flagged.has(currentQ.questionId) ? "표시됨" : "표시"}
            </button>
          </div>

          {/* Question Text */}
          <p className="text-[15px] leading-relaxed text-[#191F28] whitespace-pre-wrap">
            {currentQ.questionText}
          </p>

          {/* Question Image */}
          {currentQ.questionImage && (
            <img
              src={currentQ.questionImage}
              alt="문제 이미지"
              className="max-w-full rounded-lg border border-[#E5E8EB]"
            />
          )}

          {/* Answer Input */}
          <div className="pt-2">
            {(currentQ.type === "MULTIPLE_CHOICE" ||
              currentQ.type === "VOCAB") &&
            currentQ.options ? (
              <RadioGroup
                value={answers[currentQ.questionId] || ""}
                onValueChange={(v) => setAnswer(currentQ.questionId, v)}
                className="space-y-2"
              >
                {currentQ.options.map((opt, oi) => (
                  <label
                    key={oi}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border-2 p-4 cursor-pointer transition-all",
                      answers[currentQ.questionId] === opt.text
                        ? "border-[#3182F6] bg-blue-50/50"
                        : "border-[#E5E8EB] hover:border-[#3182F6]/30 hover:bg-[#F7F8FA]"
                    )}
                  >
                    <RadioGroupItem value={opt.text} id={`opt-${oi}`} />
                    <span className="text-sm font-medium text-[#8B95A1] shrink-0">
                      {opt.label}
                    </span>
                    <span className="text-[15px] text-[#191F28]">
                      {opt.text}
                    </span>
                  </label>
                ))}
              </RadioGroup>
            ) : currentQ.type === "ESSAY" ? (
              <Textarea
                value={answers[currentQ.questionId] || ""}
                onChange={(e) =>
                  setAnswer(currentQ.questionId, e.target.value)
                }
                placeholder="답안을 입력하세요..."
                className="min-h-[200px] border-[#E5E8EB] text-[15px] leading-relaxed resize-none"
                aria-label="서술형 답안"
              />
            ) : (
              <Input
                value={answers[currentQ.questionId] || ""}
                onChange={(e) =>
                  setAnswer(currentQ.questionId, e.target.value)
                }
                placeholder="답을 입력하세요"
                className="border-[#E5E8EB] text-[15px] h-12"
                aria-label="단답형 답안"
              />
            )}
          </div>
        </div>
      </main>

      {/* Bottom Navigation */}
      <footer className="flex items-center justify-between px-4 py-3 border-t border-[#E5E8EB] bg-white safe-bottom">
        <Button
          variant="outline"
          onClick={() => setCurrentIdx(Math.max(0, currentIdx - 1))}
          disabled={currentIdx === 0}
          className="border-[#E5E8EB]"
        >
          <ChevronLeft className="size-4 mr-1" />
          이전
        </Button>

        <span className="text-xs text-[#8B95A1]">
          {currentIdx + 1} / {questions.length}
        </span>

        <Button
          variant="outline"
          onClick={() =>
            setCurrentIdx(Math.min(questions.length - 1, currentIdx + 1))
          }
          disabled={currentIdx === questions.length - 1}
          className="border-[#E5E8EB]"
        >
          다음
          <ChevronRight className="size-4 ml-1" />
        </Button>
      </footer>

      {/* Submit Confirmation Dialog */}
      <AlertDialog open={showSubmitDialog} onOpenChange={setShowSubmitDialog}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>시험을 제출하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              {unansweredCount > 0 ? (
                <span className="text-amber-600 font-medium">
                  아직 답하지 않은 문제가 {unansweredCount}개 있습니다.
                </span>
              ) : (
                "모든 문제에 답변을 완료했습니다."
              )}
              <br />
              제출 후에는 수정할 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>돌아가기</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSubmit}
              className="bg-[#3182F6] hover:bg-[#1B64DA]"
              disabled={isPending}
            >
              {isPending ? "제출 중..." : "제출하기"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
