import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Users } from "lucide-react";
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

interface StudentsPageProps {
  searchParams: Promise<{ q?: string }>;
}

export default async function StudentsPage({
  searchParams,
}: StudentsPageProps) {
  const session = await auth();
  if (!session?.user) redirect("/admin/login");

  const { q } = await searchParams;
  const search = q?.trim() || "";

  const where: Record<string, unknown> = {};
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { studentCode: { contains: search } },
    ];
  }

  const students = await prisma.student.findMany({
    where,
    include: {
      school: { select: { name: true, type: true } },
      _count: { select: { vocabTestResults: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-[24px] font-bold text-[#191F28]">학생 관리</h1>
        <p className="mt-1 text-[14px] text-[#8B95A1]">
          총 {students.length}명의 학생
        </p>
      </div>

      {/* Search */}
      <form className="flex items-center gap-3">
        <Input
          name="q"
          defaultValue={search}
          placeholder="학생 이름 또는 학생 코드로 검색..."
          className="max-w-md"
        />
        <button
          type="submit"
          className="inline-flex h-9 items-center justify-center rounded-md bg-[#3182F6] px-4 text-[14px] font-medium text-white transition-colors hover:bg-[#1B64DA]"
        >
          검색
        </button>
      </form>

      {/* Table */}
      {students.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-[#F2F4F6] bg-white py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-[#F7F8FA]">
            <Users className="size-5 text-[#ADB5BD]" />
          </div>
          <p className="mt-3 text-[14px] text-[#8B95A1]">
            {search
              ? "검색 결과가 없습니다."
              : "등록된 학생이 없습니다."}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-[#F2F4F6] bg-white">
          <Table>
            <TableHeader>
              <TableRow className="border-[#F2F4F6] hover:bg-transparent">
                <TableHead className="pl-6 text-[13px] font-medium text-[#8B95A1]">
                  이름
                </TableHead>
                <TableHead className="text-[13px] font-medium text-[#8B95A1]">
                  학생코드
                </TableHead>
                <TableHead className="text-[13px] font-medium text-[#8B95A1]">
                  학교
                </TableHead>
                <TableHead className="text-center text-[13px] font-medium text-[#8B95A1]">
                  학년
                </TableHead>
                <TableHead className="text-center text-[13px] font-medium text-[#8B95A1]">
                  테스트 수
                </TableHead>
                <TableHead className="pr-6 text-[13px] font-medium text-[#8B95A1]">
                  등록일
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.map((student) => (
                <TableRow
                  key={student.id}
                  className="group border-[#F2F4F6] transition-colors hover:bg-[#F7F8FA]"
                >
                  <TableCell className="pl-6">
                    <Link
                      href={`/admin/students/${student.id}`}
                      className="text-[14px] font-medium text-[#191F28] hover:text-[#3182F6]"
                    >
                      {student.name}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-[13px] text-[#4E5968]">
                    {student.studentCode}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[14px] text-[#4E5968]">
                        {student.school.name}
                      </span>
                      <Badge
                        variant="secondary"
                        className={
                          student.school.type === "MIDDLE"
                            ? "bg-[#E8F3FF] text-[#3182F6] hover:bg-[#E8F3FF]"
                            : "bg-[#F3EEFF] text-[#8B5CF6] hover:bg-[#F3EEFF]"
                        }
                      >
                        {student.school.type === "MIDDLE" ? "중" : "고"}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-center text-[14px] text-[#4E5968]">
                    {student.grade}학년
                  </TableCell>
                  <TableCell className="text-center text-[14px] text-[#4E5968]">
                    {student._count.vocabTestResults}
                  </TableCell>
                  <TableCell className="pr-6 text-[13px] text-[#8B95A1]">
                    {new Date(student.createdAt).toLocaleDateString("ko-KR")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
