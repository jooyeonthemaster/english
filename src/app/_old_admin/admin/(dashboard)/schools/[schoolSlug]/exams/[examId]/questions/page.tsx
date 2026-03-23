import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteQuestion } from "@/actions/exams";
import { Plus, ChevronRight, ArrowLeft, FileCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

interface QuestionsPageProps {
  params: Promise<{ schoolSlug: string; examId: string }>;
}

export default async function QuestionsPage({ params }: QuestionsPageProps) {
  const session = await auth();
  if (!session?.user) redirect("/admin/login");

  const { schoolSlug, examId } = await params;

  const school = await prisma.school.findUnique({
    where: { slug: schoolSlug },
  });

  if (!school) notFound();

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: {
      questions: {
        include: {
          explanation: true,
          passage: { select: { id: true, title: true } },
        },
        orderBy: { questionNumber: "asc" },
      },
    },
  });

  if (!exam || exam.schoolId !== school.id) notFound();

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
        <Link
          href={`/admin/schools/${school.slug}/exams`}
          className="transition-colors hover:text-[#3182F6]"
        >
          시험 관리
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="font-medium text-[#191F28]">문항 관리</span>
      </nav>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/admin/schools/${school.slug}/exams`}>
            <Button
              variant="ghost"
              size="icon"
              className="size-9 text-[#8B95A1] hover:text-[#191F28]"
            >
              <ArrowLeft className="size-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-[24px] font-bold text-[#191F28]">
              {exam.title}
            </h1>
            <p className="mt-1 text-[14px] text-[#8B95A1]">
              총 {exam.questions.length}개 문항
            </p>
          </div>
        </div>
        <Link
          href={`/admin/schools/${school.slug}/exams/${exam.id}/questions/create`}
        >
          <Button className="gap-2 bg-[#3182F6] text-white hover:bg-[#1B64DA]">
            <Plus className="size-4" />
            문항 추가
          </Button>
        </Link>
      </div>

      {/* Question cards */}
      {exam.questions.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-[#F2F4F6] bg-white py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-[#F7F8FA]">
            <FileCheck className="size-5 text-[#ADB5BD]" />
          </div>
          <p className="mt-3 text-[14px] text-[#8B95A1]">
            등록된 문항이 없습니다.
          </p>
          <p className="mt-1 text-[13px] text-[#ADB5BD]">
            &quot;문항 추가&quot; 버튼을 클릭하여 문항을 등록하세요.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {exam.questions.map((q) => (
            <div
              key={q.id}
              className="rounded-xl border border-[#F2F4F6] bg-white p-5 transition-colors hover:border-[#E5E8EB]"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="secondary"
                      className="bg-[#E8F3FF] text-[#3182F6] hover:bg-[#E8F3FF]"
                    >
                      {q.questionNumber}번
                    </Badge>
                    <span className="text-[13px] text-[#8B95A1]">
                      {q.points}점
                    </span>
                    {q.explanation && (
                      <Badge
                        variant="secondary"
                        className="bg-[#E8FAF0] text-[#00C471] hover:bg-[#E8FAF0]"
                      >
                        해설 있음
                      </Badge>
                    )}
                    {q.passage && (
                      <Badge
                        variant="secondary"
                        className="bg-[#F3EEFF] text-[#8B5CF6] hover:bg-[#F3EEFF]"
                      >
                        {q.passage.title}
                      </Badge>
                    )}
                  </div>

                  <p className="mt-2 text-[14px] leading-relaxed text-[#4E5968]">
                    {q.questionText.length > 100
                      ? `${q.questionText.slice(0, 100)}...`
                      : q.questionText}
                  </p>

                  <p className="mt-2 text-[13px] text-[#8B95A1]">
                    정답:{" "}
                    <span className="font-medium text-[#191F28]">
                      {q.correctAnswer}
                    </span>
                  </p>
                </div>

                <div className="ml-4 flex items-center gap-2">
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
                        <DialogTitle>문항 삭제</DialogTitle>
                        <DialogDescription>
                          {q.questionNumber}번 문항을 삭제하시겠습니까? 이
                          작업은 되돌릴 수 없습니다.
                        </DialogDescription>
                      </DialogHeader>
                      <DialogFooter>
                        <DialogClose asChild>
                          <Button variant="outline">취소</Button>
                        </DialogClose>
                        <form
                          action={async () => {
                            "use server";
                            await deleteQuestion(q.id);
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
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
