import { redirect, notFound } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { getExam } from "@/actions/exams";
import { ExamGradingClient } from "@/components/exams/exam-grading-client";
import { UserResultsDisabled } from "@/components/shared/user-results-disabled";
import { FEATURE_FLAGS } from "@/lib/feature-flags";

interface PageProps {
  params: Promise<{ examId: string }>;
}

export default async function ExamGradePage({ params }: PageProps) {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const { examId } = await params;
  if (!FEATURE_FLAGS.SHOW_USER_RESULTS) {
    return <UserResultsDisabled homeHref={`/director/exams/${examId}`} />;
  }

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
