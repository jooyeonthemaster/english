import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { GRADES, SEMESTERS, EXAM_TYPES } from "@/lib/constants";
import { deleteExam } from "@/actions/exams";
import { Plus, ChevronRight, ArrowLeft } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";

interface ExamsPageProps {
  params: Promise<{ schoolSlug: string }>;
}

export default async function ExamsPage({ params }: ExamsPageProps) {
  const session = await auth();
  if (!session?.user) redirect("/admin/login");

  const { schoolSlug } = await params;

  const school = await prisma.school.findUnique({
    where: { slug: schoolSlug },
  });

  if (!school) notFound();

  const exams = await prisma.exam.findMany({
    where: { schoolId: school.id },
    include: {
      _count: { select: { questions: true } },
    },
    orderBy: [{ year: "desc" }, { createdAt: "desc" }],
  });

  const gradeLabelMap = Object.fromEntries(
    GRADES.map((g) => [g.value, g.label])
  );
  const semesterLabelMap = Object.fromEntries(
    SEMESTERS.map((s) => [s.value, s.label])
  );
  const examTypeLabelMap = Object.fromEntries(
    EXAM_TYPES.map((e) => [e.value, e.label])
  );

  const examTypeColorMap: Record<string, { bg: string; text: string }> = {
    MIDTERM: { bg: "#E8F3FF", text: "#3182F6" },
    FINAL: { bg: "#FFF3E8", text: "#F97316" },
    MOCK: { bg: "#F3EEFF", text: "#8B5CF6" },
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-[13px] text-[#8B95A1]">
        <Link
          href="/admin/schools"
          className="transition-colors hover:text-[#3182F6]"
        >
          학교 관리
        </Link>
        <ChevronRight className="size-3.5" />
        <Link
          href={`/admin/schools/${school.slug}`}
          className="transition-colors hover:text-[#3182F6]"
        >
          {school.name}
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="font-medium text-[#191F28]">시험 관리</span>
      </nav>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/admin/schools/${school.slug}`}>
            <Button
              variant="ghost"
              size="icon"
              className="size-9 text-[#8B95A1] hover:text-[#191F28]"
            >
              <ArrowLeft className="size-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-[24px] font-bold text-[#191F28]">시험 관리</h1>
            <p className="mt-1 text-[14px] text-[#8B95A1]">
              {school.name} - 총 {exams.length}개 시험
            </p>
          </div>
        </div>
        <Link href={`/admin/schools/${school.slug}/exams/create`}>
          <Button className="gap-2 bg-[#3182F6] text-white hover:bg-[#1B64DA]">
            <Plus className="size-4" />새 시험 등록
          </Button>
        </Link>
      </div>

      {/* Table */}
      {exams.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-[#F2F4F6] bg-white py-16 text-center">
          <p className="text-[14px] text-[#8B95A1]">
            등록된 시험이 없습니다.
          </p>
          <p className="mt-1 text-[13px] text-[#ADB5BD]">
            새 시험을 등록해 보세요.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-[#F2F4F6] bg-white">
          <Table>
            <TableHeader>
              <TableRow className="border-[#F2F4F6] hover:bg-transparent">
                <TableHead className="pl-6 text-[13px] font-medium text-[#8B95A1]">
                  시험명
                </TableHead>
                <TableHead className="text-[13px] font-medium text-[#8B95A1]">
                  학년
                </TableHead>
                <TableHead className="text-[13px] font-medium text-[#8B95A1]">
                  학기
                </TableHead>
                <TableHead className="text-[13px] font-medium text-[#8B95A1]">
                  유형
                </TableHead>
                <TableHead className="text-center text-[13px] font-medium text-[#8B95A1]">
                  연도
                </TableHead>
                <TableHead className="text-center text-[13px] font-medium text-[#8B95A1]">
                  문항 수
                </TableHead>
                <TableHead className="pr-6 text-right text-[13px] font-medium text-[#8B95A1]">
                  액션
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {exams.map((exam) => {
                const typeColor = examTypeColorMap[exam.examType] || {
                  bg: "#F7F8FA",
                  text: "#4E5968",
                };
                return (
                  <TableRow
                    key={exam.id}
                    className="group border-[#F2F4F6] transition-colors hover:bg-[#F7F8FA]"
                  >
                    <TableCell className="pl-6">
                      <Link
                        href={`/admin/schools/${school.slug}/exams/${exam.id}/questions`}
                        className="text-[14px] font-medium text-[#191F28] hover:text-[#3182F6]"
                      >
                        {exam.title}
                      </Link>
                    </TableCell>
                    <TableCell className="text-[14px] text-[#4E5968]">
                      {gradeLabelMap[exam.grade] || `${exam.grade}학년`}
                    </TableCell>
                    <TableCell className="text-[14px] text-[#4E5968]">
                      {semesterLabelMap[exam.semester] || exam.semester}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        style={{
                          backgroundColor: typeColor.bg,
                          color: typeColor.text,
                        }}
                        className="hover:opacity-90"
                      >
                        {examTypeLabelMap[exam.examType] || exam.examType}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center text-[14px] text-[#4E5968]">
                      {exam.year}
                    </TableCell>
                    <TableCell className="text-center text-[14px] text-[#4E5968]">
                      {exam._count.questions}
                    </TableCell>
                    <TableCell className="pr-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/admin/schools/${school.slug}/exams/${exam.id}/questions`}
                        >
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-[13px] text-[#3182F6] hover:bg-[#E8F3FF] hover:text-[#3182F6]"
                          >
                            문항
                          </Button>
                        </Link>
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-[13px] text-[#F04452] hover:bg-[#FFF0F0] hover:text-[#F04452]"
                            >
                              삭제
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>시험 삭제</DialogTitle>
                              <DialogDescription>
                                &quot;{exam.title}&quot; 시험을
                                삭제하시겠습니까? 포함된 모든 문항도 함께
                                삭제됩니다. 이 작업은 되돌릴 수 없습니다.
                              </DialogDescription>
                            </DialogHeader>
                            <DialogFooter>
                              <DialogClose asChild>
                                <Button variant="outline">취소</Button>
                              </DialogClose>
                              <form
                                action={async () => {
                                  "use server";
                                  await deleteExam(exam.id);
                                }}
                              >
                                <Button
                                  type="submit"
                                  className="bg-[#F04452] text-white hover:bg-[#E5333F]"
                                >
                                  삭제
                                </Button>
                              </form>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
