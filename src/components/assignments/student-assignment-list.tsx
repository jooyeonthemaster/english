"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FileText,
  Calendar,
  ChevronRight,
  Check,
  Clock,
  AlertCircle,
  Send,
} from "lucide-react";
import { submitAssignment } from "@/actions/assignments";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface AssignmentSubmission {
  id: string;
  status: string;
  score: number | null;
  feedback: string | null;
  submittedAt: string | Date | null;
}

interface AssignmentItem {
  id: string;
  title: string;
  description: string | null;
  className: string;
  dueDate: string | Date;
  maxScore: number | null;
  isOverdue: boolean;
  submission: AssignmentSubmission | null;
}

interface Props {
  assignments: AssignmentItem[];
  studentId: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function StudentAssignmentList({ assignments, studentId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedAssignment, setSelectedAssignment] =
    useState<AssignmentItem | null>(null);
  const [submitContent, setSubmitContent] = useState("");

  const pending = assignments.filter(
    (a) => !a.submission || a.submission.status === "PENDING"
  );
  const completed = assignments.filter(
    (a) =>
      a.submission &&
      a.submission.status !== "PENDING"
  );

  function openSubmit(a: AssignmentItem) {
    setSelectedAssignment(a);
    setSubmitContent("");
  }

  function handleSubmit() {
    if (!selectedAssignment) return;
    startTransition(async () => {
      const result = await submitAssignment(
        selectedAssignment.id,
        studentId,
        { content: submitContent }
      );
      if (result.success) {
        toast.success("과제가 제출되었습니다.");
        setSelectedAssignment(null);
        router.refresh();
      } else {
        toast.error(result.error || "제출에 실패했습니다.");
      }
    });
  }

  function getStatusInfo(a: AssignmentItem) {
    if (!a.submission || a.submission.status === "PENDING") {
      if (a.isOverdue) return { label: "마감", icon: AlertCircle, color: "text-red-500", bg: "bg-red-50" };
      return { label: "미제출", icon: Clock, color: "text-[#8B95A1]", bg: "bg-gray-100" };
    }
    switch (a.submission.status) {
      case "SUBMITTED":
        return { label: "제출완료", icon: Check, color: "text-blue-600", bg: "bg-blue-50" };
      case "LATE":
        return { label: "지각제출", icon: AlertCircle, color: "text-amber-600", bg: "bg-amber-50" };
      case "GRADED":
        return { label: "채점완료", icon: Check, color: "text-emerald-600", bg: "bg-emerald-50" };
      default:
        return { label: "미제출", icon: Clock, color: "text-[#8B95A1]", bg: "bg-gray-100" };
    }
  }

  return (
    <div className="p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-violet-50">
          <FileText className="size-5 text-violet-600" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-[#191F28]">과제</h1>
          <p className="text-xs text-[#8B95A1]">과제 확인 및 제출</p>
        </div>
      </div>

      {/* Pending Assignments */}
      {pending.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-[#4E5968] mb-3">
            진행중인 과제
          </h2>
          <div className="space-y-3">
            {pending.map((a) => {
              const status = getStatusInfo(a);
              const Icon = status.icon;
              return (
                <div
                  key={a.id}
                  className="rounded-xl border border-[#E5E8EB] bg-white p-4"
                >
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-[15px] font-semibold text-[#191F28]">
                      {a.title}
                    </h3>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
                        status.bg,
                        status.color
                      )}
                    >
                      <Icon className="size-3" />
                      {status.label}
                    </span>
                  </div>

                  {a.description && (
                    <p className="text-sm text-[#8B95A1] mb-3 line-clamp-2">
                      {a.description}
                    </p>
                  )}

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 text-xs text-[#8B95A1]">
                      <span>{a.className}</span>
                      <span className="flex items-center gap-1">
                        <Calendar className="size-3" />
                        <span
                          className={cn(
                            a.isOverdue && "text-red-500 font-medium"
                          )}
                        >
                          {formatDate(a.dueDate)}
                          {a.isOverdue && " (마감)"}
                        </span>
                      </span>
                    </div>
                    {!a.isOverdue && (
                      <Button
                        size="sm"
                        onClick={() => openSubmit(a)}
                        className="bg-[#3182F6] hover:bg-[#1B64DA] text-xs"
                      >
                        <Send className="size-3.5 mr-1" />
                        제출하기
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Completed Assignments */}
      {completed.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-[#4E5968] mb-3">
            완료된 과제
          </h2>
          <div className="space-y-2">
            {completed.map((a) => {
              const status = getStatusInfo(a);
              const Icon = status.icon;
              const sub = a.submission!;
              return (
                <div
                  key={a.id}
                  className="flex items-center gap-4 rounded-xl border border-[#E5E8EB] bg-white p-4"
                >
                  <div
                    className={cn(
                      "flex size-10 items-center justify-center rounded-full",
                      status.bg
                    )}
                  >
                    <Icon className={cn("size-5", status.color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-[#191F28]">
                      {a.title}
                    </h3>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-[#8B95A1]">
                      <span>{a.className}</span>
                      <span className={cn("font-medium", status.color)}>
                        {status.label}
                      </span>
                    </div>
                  </div>
                  {sub.score != null && (
                    <div className="text-right">
                      <p className="text-lg font-bold text-[#191F28]">
                        {sub.score}
                        {a.maxScore && (
                          <span className="text-sm text-[#8B95A1] font-normal">
                            /{a.maxScore}
                          </span>
                        )}
                      </p>
                    </div>
                  )}
                  {sub.feedback && (
                    <ChevronRight className="size-4 text-[#8B95A1] shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Empty State */}
      {assignments.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-[#8B95A1]">
          <FileText className="size-12 mb-3 opacity-40" />
          <p className="text-sm">과제가 없습니다.</p>
        </div>
      )}

      {/* Submit Dialog */}
      <Dialog
        open={!!selectedAssignment}
        onOpenChange={(open) => !open && setSelectedAssignment(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedAssignment?.title}</DialogTitle>
          </DialogHeader>

          {selectedAssignment && (
            <div className="space-y-4">
              {selectedAssignment.description && (
                <div className="rounded-lg bg-[#F7F8FA] p-3">
                  <p className="text-sm text-[#4E5968] whitespace-pre-wrap">
                    {selectedAssignment.description}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium text-[#191F28]" htmlFor="submit-content">
                  답안 작성
                </label>
                <Textarea
                  id="submit-content"
                  value={submitContent}
                  onChange={(e) => setSubmitContent(e.target.value)}
                  placeholder="과제 답안을 입력하세요..."
                  className="border-[#E5E8EB] min-h-[200px] resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setSelectedAssignment(null)}
                  className="border-[#E5E8EB]"
                >
                  취소
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={isPending || !submitContent.trim()}
                  className="bg-[#3182F6] hover:bg-[#1B64DA]"
                >
                  <Send className="size-4 mr-1.5" />
                  {isPending ? "제출 중..." : "제출하기"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
