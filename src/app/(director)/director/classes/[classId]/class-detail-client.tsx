"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  Users,
  Clock,
  MapPin,
  CreditCard,
  UserPlus,
  UserMinus,
  ChevronRight,
  BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EnrollStudentDialog } from "@/components/classes/enroll-student-dialog";
import { removeStudent } from "@/actions/classes";
import {
  formatCurrency,
  getInitials,
  getGradeLabel,
  getAttendanceStatusLabel,
  formatScheduleLabel,
} from "@/lib/utils";
import type { ScheduleEntry } from "@/actions/classes";

interface StudentInfo {
  id: string;
  name: string;
  studentCode: string;
  grade: number;
  phone: string | null;
  avatarUrl: string | null;
  status: string;
}

interface ClassData {
  id: string;
  academyId: string;
  name: string;
  teacherId: string | null;
  teacherName: string | null;
  teacherAvatar: string | null;
  teacherPhone: string | null;
  schedule: ScheduleEntry[];
  capacity: number;
  fee: number;
  room: string | null;
  isActive: boolean;
  enrolled: Array<{
    enrollmentId: string;
    enrolledAt: Date;
    student: StudentInfo;
    attendance: Record<string, number>;
  }>;
  waitlisted: Array<{
    enrollmentId: string;
    enrolledAt: Date;
    student: StudentInfo;
  }>;
}

interface ClassDetailClientProps {
  classData: ClassData;
  academyId: string;
}

export function ClassDetailClient({
  classData,
  academyId,
}: ClassDetailClientProps) {
  const [enrollDialogOpen, setEnrollDialogOpen] = useState(false);

  const fillRate =
    classData.capacity > 0
      ? Math.round(
          (classData.enrolled.length / classData.capacity) * 100
        )
      : 0;

  async function handleRemoveStudent(studentId: string, studentName: string) {
    if (!confirm(`"${studentName}" 학생을 이 반에서 제외하시겠습니까?`)) return;
    const result = await removeStudent(classData.id, studentId);
    if (result.success) {
      toast.success("학생이 제외되었습니다.");
    } else {
      toast.error(result.error || "처리에 실패했습니다.");
    }
  }

  function getAttendanceRate(attendance: Record<string, number>) {
    const total = Object.values(attendance).reduce((a, b) => a + b, 0);
    if (total === 0) return null;
    const present = (attendance["PRESENT"] || 0) + (attendance["MAKEUP"] || 0);
    return Math.round((present / total) * 100);
  }

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/director/classes"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        반 목록
      </Link>

      {/* Header Card */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-card">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
                {classData.name}
              </h1>
              <Badge
                variant={classData.isActive ? "default" : "secondary"}
                className={
                  classData.isActive
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-gray-100 text-gray-500"
                }
              >
                {classData.isActive ? "운영중" : "비활성"}
              </Badge>
            </div>
          </div>
          <Button
            onClick={() => setEnrollDialogOpen(true)}
            className="gap-2 bg-blue-500 hover:bg-blue-600"
          >
            <UserPlus className="h-4 w-4" />
            학생 등록
          </Button>
        </div>

        {/* Info grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50">
              <Users className="h-4 w-4 text-blue-500" />
            </div>
            <div>
              <p className="text-xs text-gray-500">담당 강사</p>
              <p className="text-sm font-semibold text-gray-900">
                {classData.teacherName || "미지정"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50">
              <Clock className="h-4 w-4 text-amber-500" />
            </div>
            <div>
              <p className="text-xs text-gray-500">시간표</p>
              <p className="text-sm font-semibold text-gray-900">
                {formatScheduleLabel(classData.schedule)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50">
              <MapPin className="h-4 w-4 text-emerald-500" />
            </div>
            <div>
              <p className="text-xs text-gray-500">교실</p>
              <p className="text-sm font-semibold text-gray-900">
                {classData.room || "-"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-50">
              <CreditCard className="h-4 w-4 text-purple-500" />
            </div>
            <div>
              <p className="text-xs text-gray-500">수강료</p>
              <p className="text-sm font-semibold text-gray-900">
                {formatCurrency(classData.fee)}/월
              </p>
            </div>
          </div>
        </div>

        {/* Capacity */}
        <div className="mt-5 p-3 rounded-lg bg-gray-50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">수강 인원</span>
            <span className="text-sm font-bold text-gray-900">
              {classData.enrolled.length}/{classData.capacity}명
              <span className="text-xs text-gray-400 ml-1">({fillRate}%)</span>
            </span>
          </div>
          <Progress value={fillRate} className="h-2.5" />
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="students" className="space-y-4">
        <TabsList className="bg-gray-100/80">
          <TabsTrigger value="students" className="gap-1.5">
            <Users className="h-3.5 w-3.5" />
            수강생 ({classData.enrolled.length})
          </TabsTrigger>
          <TabsTrigger value="waitlist" className="gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            대기 ({classData.waitlisted.length})
          </TabsTrigger>
          <TabsTrigger value="stats" className="gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" />
            통계
          </TabsTrigger>
        </TabsList>

        {/* Enrolled Students */}
        <TabsContent value="students">
          <div className="rounded-xl border border-gray-200 bg-white shadow-card overflow-hidden">
            {classData.enrolled.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Users className="h-10 w-10 text-gray-300 mb-3" />
                <p className="text-sm text-gray-500">수강생이 없습니다.</p>
                <Button
                  onClick={() => setEnrollDialogOpen(true)}
                  variant="outline"
                  className="mt-3 gap-1.5"
                >
                  <UserPlus className="h-4 w-4" />
                  학생 등록
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        학생
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        학년
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        코드
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        출석률 (30일)
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        관리
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {classData.enrolled.map(({ student, attendance }) => {
                      const rate = getAttendanceRate(attendance);
                      return (
                        <tr
                          key={student.id}
                          className="table-row-hover"
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <Avatar className="h-8 w-8">
                                <AvatarFallback className="bg-blue-50 text-blue-600 text-[10px] font-bold">
                                  {getInitials(student.name)}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-sm font-medium text-gray-900">
                                {student.name}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {getGradeLabel(student.grade)}
                          </td>
                          <td className="px-4 py-3">
                            <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">
                              {student.studentCode}
                            </code>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {rate !== null ? (
                              <span
                                className={`text-sm font-semibold ${
                                  rate >= 90
                                    ? "text-emerald-600"
                                    : rate >= 70
                                    ? "text-blue-600"
                                    : rate >= 50
                                    ? "text-amber-600"
                                    : "text-red-600"
                                }`}
                              >
                                {rate}%
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                handleRemoveStudent(student.id, student.name)
                              }
                              className="h-7 text-xs text-gray-400 hover:text-red-500"
                            >
                              <UserMinus className="h-3 w-3 mr-1" />
                              제외
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Waitlist */}
        <TabsContent value="waitlist">
          <div className="rounded-xl border border-gray-200 bg-white shadow-card p-5">
            {classData.waitlisted.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Clock className="h-10 w-10 text-gray-300 mb-3" />
                <p className="text-sm text-gray-500">대기 중인 학생이 없습니다.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {classData.waitlisted.map(({ student }, index) => (
                  <div
                    key={student.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-gray-50"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-700">
                        {index + 1}
                      </span>
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-blue-50 text-blue-600 text-[10px] font-bold">
                          {getInitials(student.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {student.name}
                        </p>
                        <p className="text-xs text-gray-400">
                          {getGradeLabel(student.grade)} &middot;{" "}
                          {student.studentCode}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-gray-300" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Stats */}
        <TabsContent value="stats">
          <div className="rounded-xl border border-gray-200 bg-white shadow-card p-6">
            <h3 className="text-base font-bold text-gray-900 mb-4">
              반 출석 통계 (최근 30일)
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {["PRESENT", "ABSENT", "LATE", "EARLY_LEAVE", "MAKEUP"].map(
                (status) => {
                  const total = classData.enrolled.reduce(
                    (sum, e) => sum + (e.attendance[status] || 0),
                    0
                  );
                  const colorMap: Record<string, string> = {
                    PRESENT: "text-emerald-600 bg-emerald-50",
                    ABSENT: "text-red-600 bg-red-50",
                    LATE: "text-amber-600 bg-amber-50",
                    EARLY_LEAVE: "text-orange-600 bg-orange-50",
                    MAKEUP: "text-blue-600 bg-blue-50",
                  };
                  return (
                    <div
                      key={status}
                      className={`p-4 rounded-lg text-center ${colorMap[status] || "bg-gray-50"}`}
                    >
                      <p className="text-2xl font-bold">{total}</p>
                      <p className="text-xs mt-1 opacity-80">
                        {getAttendanceStatusLabel(status)}
                      </p>
                    </div>
                  );
                }
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Enroll Dialog */}
      <EnrollStudentDialog
        open={enrollDialogOpen}
        onOpenChange={setEnrollDialogOpen}
        classId={classData.id}
        academyId={academyId}
        enrolledStudentIds={classData.enrolled.map((e) => e.student.id)}
      />
    </div>
  );
}
