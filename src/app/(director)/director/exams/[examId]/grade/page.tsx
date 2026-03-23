import { redirect, notFound } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { getExam } from "@/actions/exams";
import { ExamGradingClient } from "@/components/exams/exam-grading-client";

interface PageProps {
  params: Promise<{ examId: string }>;
}

export default async function ExamGradePage({ params }: PageProps) {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const { examId } = await params;
  const exam = await getExam(examId);

  if (!exam) notFound();

  // Only show submitted or graded submissions
  const gradableSubmissions = exam.submissions.filter(
    (s) => s.status === "SUBMITTED" || s.status === "GRADED"
  );

  return (
    <ExamGradingClient
      examId={exam.id}
      examTitle={exam.title}
      totalPoints={exam.totalPoints}
      questions={exam.questions as never[]}
      submissions={gradableSubmissions as never[]}
    />
  );
}
