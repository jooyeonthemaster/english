import { notFound, redirect } from "next/navigation";
import { getExam } from "@/actions/exams";
import { getExamPaperBuilderData } from "@/actions/exam-paper-builder";
import { getStaffSession } from "@/lib/auth";
import { ExamPaperBuilderClient } from "@/components/exams/exam-paper-builder-client";

interface PageProps {
  params: Promise<{ examId: string }>;
}

/**
 * 국어 시험지 편집 — 영어 편집(/director/workbench/exams/[examId]/edit)의 국어 대칭 라우트.
 * 판별자 일급화(P0) 후 exams.subject 가 단일 권위 소스다. subject==='KOREAN' 시험지만
 * 국어 편집으로 취급하고, 그 외(영어 시험지)가 국어 경로로 진입하면 영어 빌더로 방어
 * 리다이렉트한다(경로 오착륙·데이터 혼입 방지, 무회귀). 영어 편집 라우트도 대칭으로
 * subject==='KOREAN' 시험지를 이 경로로 되돌린다.
 */
export default async function KoreanExamEditPage({ params }: PageProps) {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const { examId } = await params;
  const exam = await getExam(examId);
  if (!exam) notFound();

  if (exam.subject !== "KOREAN") {
    redirect(`/director/workbench/exams/${examId}/edit`);
  }

  const data = await getExamPaperBuilderData(staff.academyId, {
    subject: "KOREAN",
  });

  return (
    <ExamPaperBuilderClient
      academyId={staff.academyId}
      questions={data.questions as never}
      total={data.total}
      totalPages={data.totalPages}
      statusCounts={data.statusCounts}
      collections={data.collections as never}
      classes={data.classes}
      schools={data.schools}
      initialExam={exam as never}
      subjectScope="KOREAN"
    />
  );
}
