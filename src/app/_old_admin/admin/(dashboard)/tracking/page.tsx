import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SCHOOLS, VOCAB_TEST_TYPES } from "@/lib/constants";
import { Activity, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";

interface TrackingPageProps {
  searchParams: Promise<{
    school?: string;
    from?: string;
    to?: string;
    student?: string;
    page?: string;
  }>;
}

const PAGE_SIZE = 20;

export default async function TrackingPage({
  searchParams,
}: TrackingPageProps) {
  const session = await auth();
  if (!session?.user) redirect("/admin/login");

  const sp = await searchParams;
  const schoolSlug = sp.school || "";
  const from = sp.from || "";
  const to = sp.to || "";
  const studentSearch = sp.student || "";
  const currentPage = parseInt(sp.page || "1") || 1;

  // Build filter
  const where: Record<string, unknown> = {};

  if (schoolSlug) {
    const schoolData = SCHOOLS.find((s) => s.slug === schoolSlug);
    if (schoolData) {
      const school = await prisma.school.findUnique({
        where: { slug: schoolSlug },
        select: { id: true },
      });
      if (school) {
        where.student = { schoolId: school.id };
      }
    }
  }

  if (studentSearch) {
    const matchingStudents = await prisma.student.findMany({
      where: {
        OR: [
          { name: { contains: studentSearch } },
          { studentCode: { contains: studentSearch } },
        ],
      },
      select: { id: true },
    });
    const studentIds = matchingStudents.map((s) => s.id);
    if (where.student) {
      (where.student as Record<string, unknown>).id = { in: studentIds };
    } else {
      where.studentId = { in: studentIds };
    }
  }

  if (from || to) {
    const takenAt: Record<string, Date> = {};
    if (from) takenAt.gte = new Date(from);
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      takenAt.lte = toDate;
    }
    where.takenAt = takenAt;
  }

  // Count total for pagination
  const totalCount = await prisma.vocabTestResult.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const results = await prisma.vocabTestResult.findMany({
    where,
    include: {
      student: {
        include: {
          school: { select: { name: true } },
        },
      },
      list: { select: { title: true } },
    },
    orderBy: { takenAt: "desc" },
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
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

  // Build query string helper
  function buildQuery(overrides: Record<string, string | number>) {
    const params = new URLSearchParams();
    const merged = {
      school: schoolSlug,
      from,
      to,
      student: studentSearch,
      page: String(currentPage),
      ...Object.fromEntries(
        Object.entries(overrides).map(([k, v]) => [k, String(v)])
      ),
    };
    for (const [k, v] of Object.entries(merged)) {
      if (v) params.set(k, v);
    }
    return `/admin/tracking?${params.toString()}`;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Activity className="size-6 text-[#3182F6]" />
        <div>
          <h1 className="text-[24px] font-bold text-[#191F28]">학습 추적</h1>
          <p className="mt-1 text-[14px] text-[#8B95A1]">
            총 {totalCount}개의 테스트 결과
          </p>
        </div>
      </div>

      {/* Filters */}
      <form className="rounded-xl border border-[#F2F4F6] bg-white p-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-[#4E5968]">
              학교
            </label>
            <select
              name="school"
              defaultValue={schoolSlug}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">전체 학교</option>
              {SCHOOLS.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-[#4E5968]">
              시작일
            </label>
            <Input type="date" name="from" defaultValue={from} />
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-[#4E5968]">
              종료일
            </label>
            <Input type="date" name="to" defaultValue={to} />
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-[#4E5968]">
              학생 검색
            </label>
            <Input
              name="student"
              defaultValue={studentSearch}
              placeholder="이름 또는 코드"
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Link href="/admin/tracking">
            <Button type="button" variant="outline" size="sm">
              초기화
            </Button>
          </Link>
          <a
            href={`/api/admin/tracking/export?${new URLSearchParams({
              ...(schoolSlug && { school: schoolSlug }),
              ...(from && { from }),
              ...(to && { to }),
              ...(studentSearch && { student: studentSearch }),
            }).toString()}`}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-[#E5E8EB] bg-white px-3 text-[13px] font-medium text-[#4E5968] transition-colors hover:bg-[#F7F8FA]"
          >
            <Download className="size-3.5" />
            CSV 내보내기
          </a>
          <button
            type="submit"
            className="inline-flex h-8 items-center justify-center rounded-md bg-[#3182F6] px-4 text-[13px] font-medium text-white transition-colors hover:bg-[#1B64DA]"
          >
            검색
          </button>
        </div>
      </form>

      {/* Results */}
      {results.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-[#F2F4F6] bg-white py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-[#F7F8FA]">
            <Activity className="size-5 text-[#ADB5BD]" />
          </div>
          <p className="mt-3 text-[14px] text-[#8B95A1]">
            조건에 맞는 학습 기록이 없습니다.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-[#F2F4F6] bg-white">
          <Table>
            <TableHeader>
              <TableRow className="border-[#F2F4F6] hover:bg-transparent">
                <TableHead className="pl-6 text-[13px] font-medium text-[#8B95A1]">
                  학생명
                </TableHead>
                <TableHead className="text-[13px] font-medium text-[#8B95A1]">
                  학교
                </TableHead>
                <TableHead className="text-[13px] font-medium text-[#8B95A1]">
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
              {results.map((result) => {
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
                    <TableCell className="pl-6">
                      <Link
                        href={`/admin/students/${result.studentId}`}
                        className="text-[14px] font-medium text-[#191F28] hover:text-[#3182F6]"
                      >
                        {result.student.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-[13px] text-[#4E5968]">
                      {result.student.school.name}
                    </TableCell>
                    <TableCell className="text-[13px] text-[#8B95A1]">
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
                        {result.score}/{result.total} (
                        {Math.round(result.percent)}%)
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
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          {currentPage > 1 ? (
            <Link href={buildQuery({ page: currentPage - 1 })}>
              <Button variant="outline" size="sm" className="gap-1">
                <ChevronLeft className="size-4" />
                이전
              </Button>
            </Link>
          ) : (
            <Button variant="outline" size="sm" className="gap-1" disabled>
              <ChevronLeft className="size-4" />
              이전
            </Button>
          )}

          <span className="px-3 text-[13px] text-[#8B95A1]">
            {currentPage} / {totalPages}
          </span>

          {currentPage < totalPages ? (
            <Link href={buildQuery({ page: currentPage + 1 })}>
              <Button variant="outline" size="sm" className="gap-1">
                다음
                <ChevronRight className="size-4" />
              </Button>
            </Link>
          ) : (
            <Button variant="outline" size="sm" className="gap-1" disabled>
              다음
              <ChevronRight className="size-4" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
