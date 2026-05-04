import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { getAssignments } from "@/actions/assignments";
import { getClassesForFilter } from "@/actions/exam-questions";
import { AssignmentsPageClient } from "@/components/assignments/assignments-page-client";

export default async function AssignmentsPage() {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const [assignments, classes] = await Promise.all([
    getAssignments(staff.academyId),
    getClassesForFilter(staff.academyId),
  ]);

  return (
    <AssignmentsPageClient
      academyId={staff.academyId}
      assignments={assignments as never[]}
      classes={classes}
    />
  );
}
