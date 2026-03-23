import { redirect, notFound } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { getAssignment } from "@/actions/assignments";
import { AssignmentDetailClient } from "@/components/assignments/assignment-detail-client";

interface PageProps {
  params: Promise<{ assignmentId: string }>;
}

export default async function AssignmentDetailPage({ params }: PageProps) {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const { assignmentId } = await params;
  const assignment = await getAssignment(assignmentId);

  if (!assignment) notFound();

  return <AssignmentDetailClient assignment={assignment as never} />;
}
