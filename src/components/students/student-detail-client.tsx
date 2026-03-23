// @ts-nocheck
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  cn,
  formatDate,
  formatDateTime,
  formatCurrency,
  formatPercent,
  getInitials,
  getScoreColor,
  getLevelFromXp,
} from "@/lib/utils";
import { STUDENT_STATUSES, ATTENDANCE_STATUSES, INVOICE_STATUSES } from "@/lib/constants";
import { updateStudentStatus } from "@/actions/students";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  Phone,
  Mail,
  Calendar,
  TrendingUp,
  Award,
  Flame,
  Zap,
  CheckCircle,
  XCircle,
  Clock,
  CreditCard,
  MessageSquare,
  Users,
  BookOpen,
  User,
} from "lucide-react";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Types — use `any` wrapper to avoid Prisma serialization mismatches
// ---------------------------------------------------------------------------
/* eslint-disable @typescript-eslint/no-explicit-any */

interface StudentDetailClientProps {
  student: any;
  stats: any;
  isDirector: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function StudentDetailClient({
  student,
  stats,
  isDirector,
}: StudentDetailClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const basePath = isDirector ? "/director/students" : "/teacher/students";

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

  function getRelationLabel(relation: string | null) {
    switch (relation) {
      case "MOTHER": return "어머니";
      case "FATHER": return "아버지";
      case "GUARDIAN": return "보호자";
      case "OTHER": return "기타";
      default: return "-";
    }
  }

  function getAttendanceBadge(status: string) {
    const found = ATTENDANCE_STATUSES.find((s) => s.value === status);
    if (!found) return <Badge variant="secondary">{status}</Badge>;
    return (
      <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", found.color)}>
        {found.label}
      </span>
    );
  }

  function getInvoiceBadge(status: string) {
    const found = INVOICE_STATUSES.find((s) => s.value === status);
    if (!found) return <Badge variant="secondary">{status}</Badge>;
    return (
      <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", found.color)}>
        {found.label}
      </span>
    );
  }

  function getConsultationTypeLabel(type: string) {
    switch (type) {
      case "NEW_INQUIRY": return "신규 문의";
      case "STUDENT": return "학생 상담";
      case "PARENT": return "학부모 상담";
      case "LEVEL_TEST": return "레벨테스트";
      default: return type;
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* ===== Header ===== */}
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
                  <span className={cn("inline-flex items-center rounded-full px-3 py-1 text-xs font-medium", statusInfo.color)}>
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
              <p className={cn("text-lg font-bold", getScoreColor(stats.averageScore))}>
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
              <p className="text-lg font-bold text-[#191F28]">
                {stats.streak}일
              </p>
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
                <p className="text-lg font-bold text-[#191F28]">
                  {stats.xp} XP
                </p>
              </div>
              <Progress
                value={levelInfo.progress}
                className="h-1 mt-0.5"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ===== Tabs Content ===== */}
      <div className="flex-1 overflow-auto px-8 py-6">
        <Tabs defaultValue="overview">
          <TabsList variant="line">
            <TabsTrigger value="overview">개요</TabsTrigger>
            <TabsTrigger value="grades">성적</TabsTrigger>
            <TabsTrigger value="attendance">출결</TabsTrigger>
            <TabsTrigger value="billing">수납</TabsTrigger>
            <TabsTrigger value="consultation">상담</TabsTrigger>
            <TabsTrigger value="parent">학부모</TabsTrigger>
          </TabsList>

          {/* ===== Overview Tab ===== */}
          <TabsContent value="overview" className="mt-6">
            <div className="grid grid-cols-2 gap-6">
              {/* Recent Exams */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-[#191F28] flex items-center gap-2">
                    <Award className="size-4 text-blue-500" />
                    최근 시험
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {stats.examSubmissions.length === 0 ? (
                    <p className="text-sm text-[#8B95A1] py-4 text-center">시험 기록이 없습니다.</p>
                  ) : (
                    <div className="space-y-3">
                      {stats.examSubmissions.slice(0, 5).map((exam: any) => (
                        <div key={exam.id} className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-[#191F28]">
                              {exam.exam.title}
                            </p>
                            <p className="text-xs text-[#8B95A1]">
                              {formatDate(exam.submittedAt)}
                            </p>
                          </div>
                          <span className={cn("text-sm font-bold", getScoreColor(
                            exam.score && exam.totalPoints
                              ? (exam.score / exam.totalPoints) * 100
                              : 0
                          ))}>
                            {exam.score ?? "-"}/{exam.totalPoints ?? "-"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Recent Attendance */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-[#191F28] flex items-center gap-2">
                    <Calendar className="size-4 text-emerald-500" />
                    최근 출결
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {stats.recentAttendances.length === 0 ? (
                    <p className="text-sm text-[#8B95A1] py-4 text-center">출결 기록이 없습니다.</p>
                  ) : (
                    <div className="space-y-3">
                      {stats.recentAttendances.slice(0, 5).map((att: any) => (
                        <div key={att.id} className="flex items-center justify-between">
                          <span className="text-sm text-[#4E5968]">
                            {formatDate(att.date)}
                          </span>
                          {getAttendanceBadge(att.status)}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Student Info */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-[#191F28] flex items-center gap-2">
                    <User className="size-4 text-gray-500" />
                    기본 정보
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <div>
                      <dt className="text-[#8B95A1]">입학일</dt>
                      <dd className="font-medium text-[#191F28]">{formatDate(student.enrollDate)}</dd>
                    </div>
                    <div>
                      <dt className="text-[#8B95A1]">생년월일</dt>
                      <dd className="font-medium text-[#191F28]">
                        {student.birthDate ? formatDate(student.birthDate) : "-"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[#8B95A1]">성별</dt>
                      <dd className="font-medium text-[#191F28]">
                        {student.gender === "MALE" ? "남" : student.gender === "FEMALE" ? "여" : "-"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[#8B95A1]">전화번호</dt>
                      <dd className="font-medium text-[#191F28]">{student.phone || "-"}</dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>

              {/* Memo */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-[#191F28] flex items-center gap-2">
                    <MessageSquare className="size-4 text-amber-500" />
                    특이사항
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-[#4E5968] whitespace-pre-wrap">
                    {student.memo || "등록된 특이사항이 없습니다."}
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ===== Grades Tab ===== */}
          <TabsContent value="grades" className="mt-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-[#191F28]">
                  시험 성적 이력
                </CardTitle>
              </CardHeader>
              <CardContent>
                {stats.examSubmissions.length === 0 ? (
                  <p className="text-sm text-[#8B95A1] py-8 text-center">시험 기록이 없습니다.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-[#F7F8FA] hover:bg-[#F7F8FA]">
                        <TableHead>시험명</TableHead>
                        <TableHead className="w-[80px]">유형</TableHead>
                        <TableHead className="w-[80px]">점수</TableHead>
                        <TableHead className="w-[80px]">총점</TableHead>
                        <TableHead className="w-[80px]">득점률</TableHead>
                        <TableHead className="w-[110px]">응시일</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stats.examSubmissions.map((exam: any) => {
                        const percent =
                          exam.score != null && exam.totalPoints
                            ? Math.round((exam.score / exam.totalPoints) * 100)
                            : null;
                        return (
                          <TableRow key={exam.id}>
                            <TableCell className="font-medium text-[#191F28]">
                              {exam.exam.title}
                            </TableCell>
                            <TableCell className="text-sm text-[#6B7684]">
                              {exam.exam.examType === "MIDTERM"
                                ? "중간"
                                : exam.exam.examType === "FINAL"
                                ? "기말"
                                : exam.exam.examType}
                            </TableCell>
                            <TableCell className={cn("font-bold", percent != null ? getScoreColor(percent) : "")}>
                              {exam.score ?? "-"}
                            </TableCell>
                            <TableCell className="text-sm text-[#6B7684]">
                              {exam.totalPoints ?? "-"}
                            </TableCell>
                            <TableCell className={cn("font-medium", percent != null ? getScoreColor(percent) : "")}>
                              {percent != null ? `${percent}%` : "-"}
                            </TableCell>
                            <TableCell className="text-xs text-[#8B95A1]">
                              {formatDate(exam.submittedAt)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== Attendance Tab ===== */}
          <TabsContent value="attendance" className="mt-6">
            <div className="grid grid-cols-4 gap-4 mb-6">
              {(["PRESENT", "ABSENT", "LATE", "EARLY_LEAVE"] as const).map((status) => {
                const count = stats.recentAttendances.filter((a: any) => a.status === status).length;
                const found = ATTENDANCE_STATUSES.find((s) => s.value === status);
                return (
                  <Card key={status}>
                    <CardContent className="p-4 flex items-center gap-3">
                      <div className={cn("flex size-9 items-center justify-center rounded-lg", found?.color)}>
                        {status === "PRESENT" && <CheckCircle className="size-4" />}
                        {status === "ABSENT" && <XCircle className="size-4" />}
                        {status === "LATE" && <Clock className="size-4" />}
                        {status === "EARLY_LEAVE" && <Clock className="size-4" />}
                      </div>
                      <div>
                        <p className="text-xs text-[#8B95A1]">{found?.label}</p>
                        <p className="text-lg font-bold text-[#191F28]">{count}회</p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-[#191F28]">
                  최근 30일 출결 기록
                </CardTitle>
              </CardHeader>
              <CardContent>
                {stats.recentAttendances.length === 0 ? (
                  <p className="text-sm text-[#8B95A1] py-8 text-center">출결 기록이 없습니다.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-[#F7F8FA] hover:bg-[#F7F8FA]">
                        <TableHead>날짜</TableHead>
                        <TableHead className="w-[80px]">상태</TableHead>
                        <TableHead>비고</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stats.recentAttendances.map((att: any) => (
                        <TableRow key={att.id}>
                          <TableCell className="text-sm text-[#191F28]">
                            {formatDate(att.date)}
                          </TableCell>
                          <TableCell>{getAttendanceBadge(att.status)}</TableCell>
                          <TableCell className="text-sm text-[#8B95A1]">
                            {att.note || "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== Billing Tab ===== */}
          <TabsContent value="billing" className="mt-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-[#191F28] flex items-center gap-2">
                  <CreditCard className="size-4 text-blue-500" />
                  수납 이력
                </CardTitle>
              </CardHeader>
              <CardContent>
                {stats.invoices.length === 0 ? (
                  <p className="text-sm text-[#8B95A1] py-8 text-center">수납 기록이 없습니다.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-[#F7F8FA] hover:bg-[#F7F8FA]">
                        <TableHead>항목</TableHead>
                        <TableHead className="w-[110px]">금액</TableHead>
                        <TableHead className="w-[110px]">할인</TableHead>
                        <TableHead className="w-[110px]">결제액</TableHead>
                        <TableHead className="w-[80px]">상태</TableHead>
                        <TableHead className="w-[100px]">납부기한</TableHead>
                        <TableHead className="w-[100px]">납부일</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stats.invoices.map((inv: any) => (
                        <TableRow key={inv.id}>
                          <TableCell className="font-medium text-[#191F28]">
                            {inv.title}
                          </TableCell>
                          <TableCell className="text-sm">
                            {formatCurrency(inv.amount)}
                          </TableCell>
                          <TableCell className="text-sm text-[#8B95A1]">
                            {inv.discount > 0 ? `-${formatCurrency(inv.discount)}` : "-"}
                          </TableCell>
                          <TableCell className="text-sm font-medium">
                            {formatCurrency(inv.finalAmount)}
                          </TableCell>
                          <TableCell>{getInvoiceBadge(inv.status)}</TableCell>
                          <TableCell className="text-xs text-[#8B95A1]">
                            {formatDate(inv.dueDate)}
                          </TableCell>
                          <TableCell className="text-xs text-[#8B95A1]">
                            {inv.paidDate ? formatDate(inv.paidDate) : "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== Consultation Tab ===== */}
          <TabsContent value="consultation" className="mt-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-[#191F28] flex items-center gap-2">
                  <MessageSquare className="size-4 text-amber-500" />
                  상담 이력
                </CardTitle>
              </CardHeader>
              <CardContent>
                {stats.consultations.length === 0 ? (
                  <p className="text-sm text-[#8B95A1] py-8 text-center">상담 기록이 없습니다.</p>
                ) : (
                  <div className="space-y-4">
                    {stats.consultations.map((con: any) => (
                      <div
                        key={con.id}
                        className="border-l-2 border-[#3182F6] pl-4 py-2"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-[#191F28]">
                              {getConsultationTypeLabel(con.type)}
                            </span>
                            <span
                              className={cn(
                                "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                                con.status === "COMPLETED"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : con.status === "SCHEDULED"
                                  ? "bg-blue-100 text-blue-700"
                                  : con.status === "CANCELLED"
                                  ? "bg-gray-100 text-gray-500"
                                  : "bg-amber-100 text-amber-700"
                              )}
                            >
                              {con.status === "COMPLETED"
                                ? "완료"
                                : con.status === "SCHEDULED"
                                ? "예정"
                                : con.status === "CANCELLED"
                                ? "취소"
                                : "후속"}
                            </span>
                          </div>
                          <span className="text-xs text-[#8B95A1]">
                            {formatDate(con.date)}
                          </span>
                        </div>
                        {con.staff && (
                          <p className="text-xs text-[#8B95A1] mt-0.5">
                            담당: {con.staff.name}
                          </p>
                        )}
                        {con.content && (
                          <p className="text-sm text-[#4E5968] mt-2 whitespace-pre-wrap">
                            {con.content}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== Parent Tab ===== */}
          <TabsContent value="parent" className="mt-6">
            {student.parentLinks.length === 0 ? (
              <Card>
                <CardContent className="py-8">
                  <p className="text-sm text-[#8B95A1] text-center">
                    등록된 학부모 정보가 없습니다.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-2 gap-6">
                {student.parentLinks.map((pl: any) => (
                  <Card key={pl.parent.id}>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-semibold text-[#191F28] flex items-center gap-2">
                        <Users className="size-4 text-indigo-500" />
                        {getRelationLabel(pl.parent.relation)}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <dl className="space-y-3 text-sm">
                        <div className="flex justify-between">
                          <dt className="text-[#8B95A1]">이름</dt>
                          <dd className="font-medium text-[#191F28]">{pl.parent.name}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-[#8B95A1] flex items-center gap-1">
                            <Phone className="size-3.5" /> 전화번호
                          </dt>
                          <dd className="font-medium text-[#191F28]">{pl.parent.phone}</dd>
                        </div>
                        {pl.parent.email && (
                          <div className="flex justify-between">
                            <dt className="text-[#8B95A1] flex items-center gap-1">
                              <Mail className="size-3.5" /> 이메일
                            </dt>
                            <dd className="font-medium text-[#191F28]">{pl.parent.email}</dd>
                          </div>
                        )}
                        {pl.parent.emergencyContact && (
                          <div className="flex justify-between">
                            <dt className="text-[#8B95A1]">긴급연락처</dt>
                            <dd className="font-medium text-[#191F28]">{pl.parent.emergencyContact}</dd>
                          </div>
                        )}
                        {pl.parent.memo && (
                          <div className="pt-2 border-t border-[#F2F4F6]">
                            <dt className="text-[#8B95A1] mb-1">메모</dt>
                            <dd className="text-[#4E5968] whitespace-pre-wrap">{pl.parent.memo}</dd>
                          </div>
                        )}
                      </dl>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
