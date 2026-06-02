import { notFound, redirect } from "next/navigation";
import { getExam } from "@/actions/exams";
import { getExamPaperBuilderData } from "@/actions/exam-paper-builder";
import { getStaffSession } from "@/lib/auth";
import { ExamPaperBuilderClient } from "@/components/exams/exam-paper-builder-client";

interface PageProps {
  params: Promise<{ examId: string }>;
}

export default async function WorkbenchExamEditPage({ params }: PageProps) {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const { examId } = await params;
  const [data, exam] = await Promise.all([
    getExamPaperBuilderData(staff.academyId),
    getExam(examId),
  ]);

  if (!exam) notFound();

  return (
    <ExamPaperBuilderClient
      academyId={staff.academyId}
      questions={data.questions as never}
      collections={data.collections as never}
      classes={data.classes}
      schools={data.schools}
      initialExam={exam as never}
    />
  );
}
