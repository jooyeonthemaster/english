import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { VOCAB_TEST_TYPES } from "@/lib/constants";
import { ArrowLeft, ChevronRight, User, BookOpen, Target, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";

interface StudentDetailPageProps {
  params: Promise<{ studentId: string }>;
}

export default async function StudentDetailPage({
  params,
}: StudentDetailPageProps) {
  const session = await auth();
  if (!session?.user) redirect("/admin/login");

  const { studentId } = await params;

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      school: { select: { name: true, slug: true, type: true } },
    },
  });

  if (!student) notFound();

  // Fetch test results
  const testResults = await prisma.vocabTestResult.findMany({
    where: { studentId },
    include: {
      list: { select: { title: true } },
    },
    orderBy: { takenAt: "desc" },
    take: 20,
  });

  // Calculate stats
  const totalTests = testResults.length;
  const averageScore =
    totalTests > 0
      ? Math.round(
          testResults.reduce((sum, r) => sum + r.percent, 0) / totalTests
        )
      : 0;

  // Frequently missed words (top 10)
  const wrongAnswers = await prisma.wrongVocabAnswer.findMany({
    where: { studentId },
    include: {
      item: { select: { english: true, korean: true } },
    },
    orderBy: { count: "desc" },
    take: 10,
  });

  const testTypeLabelMap = Object.fromEntries(
    VOCAB_TEST_TYPES.map((t) => [t.value, t.label])
  );

  function formatDuration(seconds: number | null): string {
    if (!seconds) return "-";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}분 ${secs}초` : `${secs}초`;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-[13px] text-[#8B95A1]">
        <Link
          href="/admin/students"
          className="transition-colors hover:text-[#3182F6]"
        >
          학생 관리
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="font-medium text-[#191F28]">{student.name}</span>
      </nav>

      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/admin/students">
          <Button
            variant="ghost"
            size="icon"
            className="size-9 text-[#8B95A1] hover:text-[#191F28]"
          >
            <ArrowLeft className="size-4" />
          </Button>
        </Link>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-[24px] font-bold text-[#191F28]">
              {student.name}
            </h1>
            <Badge
              variant="secondary"
              className={
                student.school.type === "MIDDLE"
                  ? "bg-[#E8F3FF] text-[#3182F6] hover:bg-[#E8F3FF]"
                  : "bg-[#F3EEFF] text-[#8B5CF6] hover:bg-[#F3EEFF]"
              }
            >
              {student.school.name}
            </Badge>
          </div>
          <p className="mt-1 text-[14px] text-[#8B95A1]">
            {student.grade}학년 | 코드: {student.studentCode}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          {
            label: "총 테스트",
            value: totalTests,
            icon: BookOpen,
            color: "#3182F6",
            bgColor: "#E8F3FF",
          },
          {
            label: "평균 점수",
            value: `${averageScore}%`,
            icon: Target,
            color: "#00C471",
            bgColor: "#E8FAF0",
          },
          {
            label: "자주 틀린 단어",
            value: wrongAnswers.length,
            icon: User,
            color: "#F97316",
            bgColor: "#FFF3E8",
          },
          {
            label: "최근 테스트",
            value: testResults.length > 0
              ? new Date(testResults[0].takenAt).toLocaleDateString("ko-KR")
              : "-",
            icon: Clock,
            color: "#8B5CF6",
            bgColor: "#F3EEFF",
          },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="flex flex-col gap-3 rounded-xl border border-[#F2F4F6] bg-white p-5"
            >
              <div
                className="flex size-9 items-center justify-center rounded-lg"
                style={{ backgroundColor: stat.bgColor }}
              >
                <Icon className="size-4" style={{ color: stat.color }} />
              </div>
              <div>
                <p className="text-2xl font-bold text-[#191F28]">
                  {stat.value}
                </p>
                <p className="mt-0.5 text-[13px] text-[#8B95A1]">
                  {stat.label}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Recent test results */}
      <div className="rounded-xl border border-[#F2F4F6] bg-white">
        <div className="border-b border-[#F2F4F6] px-6 py-4">
          <h2 className="text-[16px] font-semibold text-[#191F28]">
            최근 테스트 결과
          </h2>
        </div>

        {testResults.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-[14px] text-[#8B95A1]">
              아직 테스트 기록이 없습니다.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-[#F2F4F6] hover:bg-transparent">
                <TableHead className="pl-6 text-[13px] font-medium text-[#8B95A1]">
                  날짜
                </TableHead>
                <TableHead className="text-[13px] font-medium text-[#8B95A1]">
                  단어장
                </TableHead>
                <TableHead className="text-[13px] font-medium text-[#8B95A1]">
                  유형
                </TableHead>
                <TableHead className="text-center text-[13px] font-medium text-[#8B95A1]">
                  점수
                </TableHead>
                <TableHead className="pr-6 text-[13px] font-medium text-[#8B95A1]">
                  소요시간
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {testResults.map((result) => {
                const scoreColor =
                  result.percent >= 80
                    ? "#00C471"
                    : result.percent >= 60
                      ? "#F97316"
                      : "#F04452";

                return (
                  <TableRow
                    key={result.id}
                    className="border-[#F2F4F6] hover:bg-[#F7F8FA]"
                  >
                    <TableCell className="pl-6 text-[13px] text-[#8B95A1]">
                      {new Date(result.takenAt).toLocaleDateString("ko-KR")}
                    </TableCell>
                    <TableCell className="text-[14px] text-[#4E5968]">
                      {result.list.title}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className="bg-[#F7F8FA] text-[#4E5968] hover:bg-[#F7F8FA]"
                      >
                        {testTypeLabelMap[result.testType] || result.testType}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <span
                        className="text-[14px] font-semibold"
                        style={{ color: scoreColor }}
                      >
                        {result.score}/{result.total} ({Math.round(result.percent)}%)
                      </span>
                    </TableCell>
                    <TableCell className="pr-6 text-[13px] text-[#8B95A1]">
                      {formatDuration(result.duration)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Frequently missed words */}
      {wrongAnswers.length > 0 && (
        <div className="rounded-xl border border-[#F2F4F6] bg-white">
          <div className="border-b border-[#F2F4F6] px-6 py-4">
            <h2 className="text-[16px] font-semibold text-[#191F28]">
              자주 틀린 단어 (상위 10개)
            </h2>
          </div>
          <div className="divide-y divide-[#F2F4F6]">
            {wrongAnswers.map((wa, index) => (
              <div
                key={wa.id}
                className="flex items-center justify-between px-6 py-3"
              >
                <div className="flex items-center gap-3">
                  <span className="flex size-6 items-center justify-center rounded-full bg-[#F7F8FA] text-[12px] font-medium text-[#8B95A1]">
                    {index + 1}
                  </span>
                  <div>
                    <span className="text-[14px] font-medium text-[#191F28]">
                      {wa.item.english}
                    </span>
                    <span className="ml-2 text-[13px] text-[#8B95A1]">
                      {wa.item.korean}
                    </span>
                  </div>
                </div>
                <Badge
                  variant="secondary"
                  className="bg-[#FFF0F0] text-[#F04452] hover:bg-[#FFF0F0]"
                >
                  {wa.count}회 오답
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
