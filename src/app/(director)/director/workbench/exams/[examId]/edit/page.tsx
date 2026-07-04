import { notFound, redirect } from "next/navigation";
import { getExam } from "@/actions/exams";
import { getExamPaperBuilderData } from "@/actions/exam-paper-builder";
import { getStaffSession } from "@/lib/auth";
import { ExamPaperBuilderClient } from "@/components/exams/exam-paper-builder-client";

interface PageProps {
  params: Promise<{ examId: string }>;
}

/**
 * 영어 시험지 편집. 판별자 일급화(P0) 후 exams.subject 가 단일 권위 소스다 —
 * 국어 시험지(subject==='KOREAN')가 이 공유 경로로 진입하면 국어 전용 편집
 * 경로(/director/korean/exams/[id]/edit)로 착륙시킨다(유저 확정: 시험지 경로
 * 완전 분리). 영어 시험지는 종전대로 subjectScope 없이(영어 기본) 렌더 — 픽셀 불변.
 */
export default async function WorkbenchExamEditPage({ params }: PageProps) {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const { examId } = await params;
  const exam = await getExam(examId);
  if (!exam) notFound();

  if (exam.subject === "KOREAN") {
    redirect(`/director/korean/exams/${examId}/edit`);
  }

  const data = await getExamPaperBuilderData(staff.academyId);

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
    />
  );
}
