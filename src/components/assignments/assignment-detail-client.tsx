"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Calendar,
  Check,
  FileText,
  Bell,
} from "lucide-react";
import { gradeAssignment } from "@/actions/assignments";
import { toast } from "sonner";
import { formatDate, formatDateTime } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Submission {
  id: string;
  status: string;
  content: string | null;
  attachments: string | null;
  score: number | null;
  feedback: string | null;
  submittedAt: string | Date | null;
  gradedAt: string | Date | null;
  student: { id: string; name: string; studentCode: string };
}

interface AssignmentDetail {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | Date;
  maxScore: number | null;
  targetType: string;
  class: { id: string; name: string } | null;
  submissions: Submission[];
}

interface Props {
  assignment: AssignmentDetail;
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------
const STATUS_LABELS: Record<string, string> = {
  PENDING: "미제출",
  SUBMITTED: "제출완료",
  LATE: "지각제출",
  GRADED: "채점완료",
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-gray-100 text-gray-600",
  SUBMITTED: "bg-blue-100 text-blue-700",
  LATE: "bg-amber-100 text-amber-700",
  GRADED: "bg-emerald-100 text-emerald-700",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function AssignmentDetailClient({ assignment }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [gradingSub, setGradingSub] = useState<Submission | null>(null);
  const [gradeScore, setGradeScore] = useState("");
  const [gradeFeedback, setGradeFeedback] = useState("");

  const isOverdue = new Date(assignment.dueDate) < new Date();
  const totalStudents = assignment.submissions.length;
  const submittedCount = assignment.submissions.filter(
    (s) => s.status !== "PENDING"
  ).length;
  const gradedCount = assignment.submissions.filter(
    (s) => s.status === "GRADED"
  ).length;
  const submissionRate =
    totalStudents > 0 ? Math.round((submittedCount / totalStudents) * 100) : 0;

  function openGrading(sub: Submission) {
    setGradingSub(sub);
    setGradeScore(sub.score != null ? String(sub.score) : "");
    setGradeFeedback(sub.feedback || "");
  }

  function handleGrade() {
    if (!gradingSub) return;
    startTransition(async () => {
      const result = await gradeAssignment(
        gradingSub.id,
        parseInt(gradeScore) || 0,
        gradeFeedback
      );
      if (result.success) {
        toast.success(`${gradingSub.student.name} 채점 완료`);
        setGradingSub(null);
        router.refresh();
      } else {
        toast.error(result.error || "채점에 실패했습니다.");
      }
    });
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/director/assignments")}
            className="shrink-0 mt-0.5"
          >
            <ArrowLeft className="size-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-[#191F28]">
              {assignment.title}
            </h1>
            <div className="flex items-center gap-3 mt-1 text-sm text-[#8B95A1]">
              {assignment.class && <span>{assignment.class.name}</span>}
              <span className="flex items-center gap-1">
                <Calendar className="size-3.5" />
                <span
                  className={cn(isOverdue && "text-red-500 font-medium")}
                >
                  {formatDate(assignment.dueDate)}
                  {isOverdue && " (마감)"}
                </span>
              </span>
              {assignment.maxScore && (
                <span>만점: {assignment.maxScore}점</span>
              )}
            </div>
          </div>
        </div>

        <Button
          variant="outline"
          className="border-[#E5E8EB] text-[#4E5968]"
          onClick={() => toast.info("미제출 학생에게 알림을 발송합니다.")}
        >
          <Bell className="size-4 mr-1.5" />
          미제출 알림
        </Button>
      </div>

      {/* Description */}
      {assignment.description && (
        <div className="rounded-xl border border-[#E5E8EB] bg-white p-4">
          <p className="text-sm text-[#4E5968] whitespace-pre-wrap">
            {assignment.description}
          </p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-[#E5E8EB] bg-white p-4">
          <p className="text-xs text-[#8B95A1] mb-1">제출률</p>
          <div className="flex items-center gap-2">
            <Progress value={submissionRate} className="h-2 flex-1" />
            <span className="text-sm font-bold text-[#191F28]">
              {submissionRate}%
            </span>
          </div>
          <p className="text-xs text-[#8B95A1] mt-1">
            {submittedCount}/{totalStudents}명
          </p>
        </div>
        <div className="rounded-xl border border-[#E5E8EB] bg-white p-4">
          <p className="text-xs text-[#8B95A1] mb-1">채점 완료</p>
          <p className="text-2xl font-bold text-[#191F28]">
            {gradedCount}
            <span className="text-sm text-[#8B95A1] font-normal">
              /{submittedCount}
            </span>
          </p>
        </div>
        <div className="rounded-xl border border-[#E5E8EB] bg-white p-4">
          <p className="text-xs text-[#8B95A1] mb-1">미제출</p>
          <p className="text-2xl font-bold text-red-500">
            {totalStudents - submittedCount}
          </p>
        </div>
      </div>

      {/* Submission Table */}
      <div className="rounded-xl border border-[#E5E8EB] bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-[#F7F8FA] hover:bg-[#F7F8FA]">
              <TableHead className="text-[#6B7684] font-semibold text-xs">
                학생
              </TableHead>
              <TableHead className="text-[#6B7684] font-semibold text-xs">
                상태
              </TableHead>
              <TableHead className="text-[#6B7684] font-semibold text-xs">
                제출일
              </TableHead>
              <TableHead className="text-[#6B7684] font-semibold text-xs">
                점수
              </TableHead>
              <TableHead className="text-[#6B7684] font-semibold text-xs">
                피드백
              </TableHead>
              <TableHead className="text-[#6B7684] font-semibold text-xs text-right">
                관리
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {assignment.submissions.map((sub) => (
              <TableRow key={sub.id}>
                <TableCell className="font-medium text-[#191F28]">
                  {sub.student.name}
                </TableCell>
                <TableCell>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                      STATUS_COLORS[sub.status] || "bg-gray-100 text-gray-600"
                    )}
                  >
                    {STATUS_LABELS[sub.status] || sub.status}
                  </span>
                </TableCell>
                <TableCell className="text-[#8B95A1] text-sm">
                  {sub.submittedAt
                    ? formatDateTime(sub.submittedAt)
                    : "-"}
                </TableCell>
                <TableCell className="text-[#4E5968]">
                  {sub.score != null
                    ? `${sub.score}${assignment.maxScore ? `/${assignment.maxScore}` : ""}`
                    : "-"}
                </TableCell>
                <TableCell className="text-[#8B95A1] text-sm max-w-[200px] truncate">
                  {sub.feedback || "-"}
                </TableCell>
                <TableCell className="text-right">
                  {sub.status !== "PENDING" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openGrading(sub)}
                      className="text-[#3182F6] hover:text-[#1B64DA] hover:bg-blue-50"
                    >
                      {sub.status === "GRADED" ? "수정" : "채점"}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Grading Dialog */}
      <Dialog
        open={!!gradingSub}
        onOpenChange={(open) => !open && setGradingSub(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {gradingSub?.student.name} - 채점
            </DialogTitle>
          </DialogHeader>

          {gradingSub && (
            <div className="space-y-4">
              {/* Student's submission */}
              <div className="rounded-lg bg-[#F7F8FA] p-4">
                <p className="text-xs text-[#8B95A1] mb-2">학생 제출 내용</p>
                <p className="text-sm text-[#191F28] whitespace-pre-wrap">
                  {gradingSub.content || "(내용 없음)"}
                </p>
              </div>

              <div className="grid grid-cols-[120px_1fr] gap-4">
                <div className="space-y-2">
                  <label className="text-xs text-[#8B95A1]" htmlFor="grade-score">
                    점수
                    {assignment.maxScore && ` (/${assignment.maxScore})`}
                  </label>
                  <Input
                    id="grade-score"
                    type="number"
                    min={0}
                    max={assignment.maxScore || undefined}
                    value={gradeScore}
                    onChange={(e) => setGradeScore(e.target.value)}
                    className="border-[#E5E8EB]"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-[#8B95A1]" htmlFor="grade-feedback">
                    피드백
                  </label>
                  <Textarea
                    id="grade-feedback"
                    value={gradeFeedback}
                    onChange={(e) => setGradeFeedback(e.target.value)}
                    placeholder="피드백을 입력하세요..."
                    className="border-[#E5E8EB] h-24 resize-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setGradingSub(null)}
                  className="border-[#E5E8EB]"
                >
                  취소
                </Button>
                <Button
                  onClick={handleGrade}
                  disabled={isPending}
                  className="bg-[#3182F6] hover:bg-[#1B64DA]"
                >
                  <Check className="size-4 mr-1.5" />
                  {isPending ? "저장 중..." : "채점 완료"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
