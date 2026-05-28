import { redirect, notFound } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { getAssignment } from "@/actions/assignments";
import { AssignmentDetailClient } from "@/components/assignments/assignment-detail-client";
import { UserResultsDisabled } from "@/components/shared/user-results-disabled";
import { FEATURE_FLAGS } from "@/lib/feature-flags";

interface PageProps {
  params: Promise<{ assignmentId: string }>;
}

export default async function AssignmentDetailPage({ params }: PageProps) {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const { assignmentId } = await params;
  if (!FEATURE_FLAGS.SHOW_USER_RESULTS) {
    return <UserResultsDisabled homeHref="/director" />;
  }

  const assignment = await getAssignment(assignmentId);

  if (!assignment) notFound();

  return <AssignmentDetailClient assignment={assignment as never} />;
}
