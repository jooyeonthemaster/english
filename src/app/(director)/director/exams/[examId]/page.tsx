import { redirect, notFound } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { getExam, getExamAnalytics } from "@/actions/exams";
import { ExamDetailClient } from "@/components/exams/exam-detail-client";

interface PageProps {
  params: Promise<{ examId: string }>;
}

export default async function ExamDetailPage({ params }: PageProps) {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const { examId } = await params;

  const [exam, analytics] = await Promise.all([
    getExam(examId),
    getExamAnalytics(examId),
  ]);

  if (!exam) notFound();

  return <ExamDetailClient exam={exam as never} analytics={analytics} />;
}
