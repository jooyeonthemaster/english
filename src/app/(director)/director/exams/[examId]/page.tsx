import { redirect, notFound } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { getExam } from "@/actions/exams";
import { getExamAnalytics } from "@/actions/exams";
import { ExamDetailClient } from "@/components/exams/exam-detail-client";
import { FEATURE_FLAGS } from "@/lib/feature-flags";

interface PageProps {
  params: Promise<{ examId: string }>;
}

export default async function ExamDetailPage({ params }: PageProps) {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const { examId } = await params;
  const showResults = FEATURE_FLAGS.SHOW_USER_RESULTS;

  const [exam, analytics] = await Promise.all([
    getExam(examId),
    showResults ? getExamAnalytics(examId) : Promise.resolve(null),
  ]);

  if (!exam) notFound();

  const clientExam = showResults
    ? exam
    : {
        ...exam,
        submissions: [],
      };

  return <ExamDetailClient exam={clientExam as never} analytics={analytics} />;
}
