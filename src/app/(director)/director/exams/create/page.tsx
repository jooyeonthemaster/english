import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { getClassesForFilter, getSchoolsForFilter } from "@/actions/exam-questions";
import { ExamCreateWizard } from "@/components/exams/exam-create-wizard";

export default async function ExamCreatePage() {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const [classes, schools] = await Promise.all([
    getClassesForFilter(staff.academyId),
    getSchoolsForFilter(staff.academyId),
  ]);

  return (
    <ExamCreateWizard
      academyId={staff.academyId}
      classes={classes}
      schools={schools}
    />
  );
}
