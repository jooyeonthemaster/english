import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { TopBarBack } from "@/components/layout/top-bar-back";

interface ExamDetailProps {
  params: Promise<{ schoolSlug: string; examId: string }>;
}

function getExamTypeBadgeColor(type: string) {
  switch (type) {
    case "MIDTERM":
      return "from-[#7CB342] to-[#689F38]";
    case "FINAL":
      return "from-[#4CAF50] to-[#388E3C]";
    case "MOCK":
      return "from-[#F59E0B] to-[#D97706]";
    default:
      return "from-[#9CA396] to-[#6B7265]";
  }
}

export default async function ExamDetailPage({ params }: ExamDetailProps) {
  const { schoolSlug, examId } = await params;

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: {
      questions: {
        orderBy: { questionNumber: "asc" },
        select: {
          id: true,
          questionNumber: true,
        },
      },
    },
  });

  if (!exam) {
    notFound();
  }

  const semesterLabel = exam.semester === "FIRST" ? "1학기" : "2학기";
  const examTypeLabel =
    exam.examType === "MIDTERM"
      ? "중간고사"
      : exam.examType === "FINAL"
        ? "기말고사"
        : "모의고사";

  return (
    <>
      <TopBarBack title={exam.title} />

      {/* Dark gradient hero section */}
      <div className="gradient-dark relative overflow-hidden px-5 pb-6 pt-5">
        {/* Subtle mesh overlay */}
        <div
          className="absolute inset-0 opacity-30"
          style={{
            background:
              "radial-gradient(ellipse at 30% 20%, rgba(124, 179, 66, 0.15) 0%, transparent 60%), radial-gradient(ellipse at 80% 80%, rgba(174, 213, 129, 0.1) 0%, transparent 60%)",
          }}
        />

        <div className="relative z-10 flex flex-col gap-3">
          {/* Exam title */}
          <h1 className="animate-float-up text-[20px] font-bold tracking-[-0.03em] text-white leading-tight">
            {exam.title}
          </h1>

          {/* Metadata row */}
          <div className="animate-float-up stagger-2 flex flex-wrap items-center gap-2">
            {/* Year badge - prominent */}
            <span className="rounded-lg border border-white/20 bg-white/10 px-3 py-1 text-[13px] font-bold text-white tabular-nums">
              {exam.year}년
            </span>

            <span className="rounded-lg bg-white/10 px-2.5 py-1 text-[12px] font-medium text-white/80">
              {exam.grade}학년 {semesterLabel}
            </span>

            {/* Gradient exam type badge */}
            <span
              className={cn(
                "rounded-lg bg-gradient-to-r px-2.5 py-1 text-[12px] font-bold text-white",
                getExamTypeBadgeColor(exam.examType)
              )}
            >
              {examTypeLabel}
            </span>

            <span className="rounded-lg bg-white/10 px-2.5 py-1 text-[12px] font-medium text-white/80">
              총 {exam.questions.length}문항
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-5 px-5 py-5">
        {/* Question number heading */}
        <h2 className="animate-float-up stagger-3 text-[15px] font-semibold text-[#1A1F16]">
          문항 번호를 선택하세요
        </h2>

        {/* Question number grid */}
        {exam.questions.length === 0 ? (
          <div className="animate-float-up stagger-4 flex flex-col items-center gap-3 py-12">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-[#F3F4F0]">
              <svg
                className="size-6 text-[#9CA396]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                />
              </svg>
            </div>
            <p className="text-[14px] text-[#9CA396]">
              등록된 문항이 없습니다
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-5 gap-2.5">
            {exam.questions.map((q, idx) => {
              // Calculate stagger class (1-8, cycling)
              const staggerClass = `stagger-${(idx % 8) + 1}`;
              return (
                <Link
                  key={q.id}
                  href={`/${schoolSlug}/exams/${examId}/${q.questionNumber}`}
                  className={cn(
                    "animate-float-up flex aspect-square items-center justify-center rounded-xl bg-white text-[16px] font-semibold text-[#1A1F16] shadow-card transition-all duration-200 hover:shadow-card-hover hover:scale-[1.04] active:scale-[0.96]",
                    staggerClass
                  )}
                >
                  {q.questionNumber}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
