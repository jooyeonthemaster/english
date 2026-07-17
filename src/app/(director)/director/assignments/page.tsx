import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { getAssignments } from "@/actions/assignments";
import { getClassesForFilter } from "@/actions/exams";
import { AssignmentsPageClient } from "@/components/assignments/assignments-page-client";
import { UserResultsDisabled } from "@/components/shared/user-results-disabled";
import { FEATURE_FLAGS } from "@/lib/feature-flags";

export default async function AssignmentsPage() {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");
  if (!FEATURE_FLAGS.SHOW_USER_RESULTS) {
    return <UserResultsDisabled homeHref="/director" />;
  }

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
