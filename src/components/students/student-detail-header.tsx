// @ts-nocheck
"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import {
  cn,
  formatPercent,
  getInitials,
  getScoreColor,
  getLevelFromXp,
} from "@/lib/utils";
import { STUDENT_STATUSES } from "@/lib/constants";
import { updateStudentStatus } from "@/actions/students";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Phone,
  TrendingUp,
  Flame,
  Zap,
  CheckCircle,
  BookOpen,
} from "lucide-react";

interface StudentDetailHeaderProps {
  student: any;
  stats: any;
  isDirector: boolean;
  basePath: string;
}

export function StudentDetailHeader({
  student,
  stats,
  isDirector,
  basePath,
}: StudentDetailHeaderProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const statusInfo = STUDENT_STATUSES.find((s) => s.value === student.status);
  const levelInfo = getLevelFromXp(stats.xp);

  function handleStatusChange(newStatus: string) {
    startTransition(async () => {
      const result = await updateStudentStatus(student.id, newStatus);
      if (result.success) {
        toast.success("상태가 변경되었습니다.");
        router.refresh();
      } else {
        toast.error(result.error || "오류가 발생했습니다.");
      }
    });
  }

  return (
    <div className="border-b border-[#F2F4F6] bg-white px-8 py-5">
      <div className="flex items-center gap-3 mb-4">
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={() => router.push(basePath)}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <span className="text-sm text-[#8B95A1]">학생 관리</span>
      </div>

      <div className="flex items-start justify-between">
        <div className="flex items-center gap-5">
          {/* Avatar */}
          <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-[#E8F3FF] text-xl font-bold text-[#3182F6]">
            {getInitials(student.name)}
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-[#191F28]">
                {student.name}
              </h1>
              {statusInfo && (
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium",
                    statusInfo.color
                  )}
                >
                  {statusInfo.label}
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 mt-1.5 text-sm text-[#6B7684]">
              <span className="font-mono bg-[#F7F8FA] px-2 py-0.5 rounded text-xs">
                {student.studentCode}
              </span>
              <span>{student.school?.name ?? "학교 미등록"}</span>
              <span>{student.grade}학년</span>
              {student.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="size-3.5" />
                  {student.phone}
                </span>
              )}
            </div>
            {/* Classes */}
            {student.classEnrollments.length > 0 && (
              <div className="flex items-center gap-2 mt-2">
                <BookOpen className="size-3.5 text-[#8B95A1]" />
                {student.classEnrollments
                  .filter((ce: any) => ce.status === "ENROLLED")
                  .map((ce: any) => (
                    <span
                      key={ce.id}
                      className="inline-flex items-center rounded-md bg-[#F2F4F6] px-2 py-0.5 text-xs font-medium text-[#4E5968]"
                    >
                      {ce.class.name}
                      {ce.class.teacher && (
                        <span className="ml-1 text-[#8B95A1]">
                          ({ce.class.teacher.name})
                        </span>
                      )}
                    </span>
                  ))}
              </div>
            )}
          </div>
        </div>

        {/* Status changer (director only) */}
        {isDirector && (
          <Select
            value={student.status}
            onValueChange={handleStatusChange}
            disabled={isPending}
          >
            <SelectTrigger className="w-[130px] h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STUDENT_STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* ===== Quick Stats ===== */}
      <div className="grid grid-cols-4 gap-4 mt-6">
        <div className="flex items-center gap-3 rounded-lg border border-[#F2F4F6] bg-[#F7F8FA] p-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-emerald-100">
            <CheckCircle className="size-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-xs text-[#8B95A1]">출석률 (30일)</p>
            <p className="text-lg font-bold text-[#191F28]">
              {formatPercent(stats.attendanceRate)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-[#F2F4F6] bg-[#F7F8FA] p-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-blue-100">
            <TrendingUp className="size-5 text-blue-600" />
          </div>
          <div>
            <p className="text-xs text-[#8B95A1]">평균 점수</p>
            <p
              className={cn(
                "text-lg font-bold",
                getScoreColor(stats.averageScore)
              )}
            >
              {stats.averageScore > 0 ? `${stats.averageScore}점` : "-"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-[#F2F4F6] bg-[#F7F8FA] p-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-orange-100">
            <Flame className="size-5 text-orange-600" />
          </div>
          <div>
            <p className="text-xs text-[#8B95A1]">연속 출석</p>
            <p className="text-lg font-bold text-[#191F28]">{stats.streak}일</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-[#F2F4F6] bg-[#F7F8FA] p-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-purple-100">
            <Zap className="size-5 text-purple-600" />
          </div>
          <div>
            <p className="text-xs text-[#8B95A1]">
              Lv.{levelInfo.level} {levelInfo.title}
            </p>
            <div className="flex items-center gap-2">
              <p className="text-lg font-bold text-[#191F28]">{stats.xp} XP</p>
            </div>
            <Progress value={levelInfo.progress} className="h-1 mt-0.5" />
          </div>
        </div>
      </div>
    </div>
  );
}
