import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { TopBarBack } from "@/components/layout/top-bar-back";
import { ExamListClient } from "./exam-list-client";

interface ExamsPageProps {
  params: Promise<{ schoolSlug: string }>;
}

export default async function ExamsPage({ params }: ExamsPageProps) {
  const { schoolSlug } = await params;

  const school = await prisma.school.findUnique({
    where: { slug: schoolSlug },
  });

  if (!school) {
    notFound();
  }

  const exams = await prisma.exam.findMany({
    where: { schoolId: school.id },
    orderBy: [{ year: "desc" }, { grade: "asc" }, { semester: "asc" }],
    select: {
      id: true,
      title: true,
      grade: true,
      semester: true,
      examType: true,
      year: true,
      _count: {
        select: { questions: true },
      },
    },
  });

  const grades = [...new Set(exams.map((e) => e.grade))].sort();

  const examsWithCount = exams.map((exam) => ({
    id: exam.id,
    title: exam.title,
    grade: exam.grade,
    semester: exam.semester,
    examType: exam.examType,
    year: exam.year,
    questionCount: exam._count.questions,
  }));

  return (
    <>
      <TopBarBack title="시험 해설" />
      <ExamListClient
        exams={examsWithCount}
        grades={grades}
        schoolSlug={schoolSlug}
      />
    </>
  );
}
