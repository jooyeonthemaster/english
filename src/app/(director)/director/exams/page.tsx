import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { getExams } from "@/actions/exams";
import { getClassesForFilter } from "@/actions/exam-questions";
import { ExamListClient } from "@/components/exams/exam-list-client";

export default async function ExamsPage() {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const [exams, classes] = await Promise.all([
    getExams(staff.academyId),
    getClassesForFilter(staff.academyId),
  ]);

  return <ExamListClient exams={exams as never[]} classes={classes} />;
}
