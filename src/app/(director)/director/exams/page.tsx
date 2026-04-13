import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { getExams, getClassesForFilter, getExamCollections, getExamCollectionMembership } from "@/actions/exams";
import { ExamListClient } from "@/components/exams/exam-list-client";

export default async function ExamsPage() {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const [exams, classes, collections, membershipRaw] = await Promise.all([
    getExams(staff.academyId),
    getClassesForFilter(staff.academyId),
    getExamCollections(staff.academyId),
    getExamCollectionMembership(staff.academyId),
  ]);

  // Convert membership arrays to Sets for client-side usage
  const collectionMembership: Record<string, Set<string>> = {};
  for (const [colId, examIds] of Object.entries(membershipRaw)) {
    collectionMembership[colId] = new Set(examIds);
  }

  return (
    <ExamListClient
      exams={exams as never[]}
      classes={classes}
      collections={collections}
      collectionMembership={collectionMembership}
    />
  );
}
