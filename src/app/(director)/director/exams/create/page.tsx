import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { getExamPaperBuilderData } from "@/actions/exam-paper-builder";
import { ExamPaperBuilderClient } from "@/components/exams/exam-paper-builder-client";

export default async function ExamCreatePage() {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const data = await getExamPaperBuilderData(staff.academyId);

  return (
    <ExamPaperBuilderClient
      academyId={staff.academyId}
      questions={data.questions as never}
      collections={data.collections as never}
      classes={data.classes}
      schools={data.schools}
    />
  );
}
