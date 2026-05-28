import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { getExams, getClassesForFilter, getExamCollections, getExamCollectionMembership } from "@/actions/exams";
import { ExamListClient } from "@/components/exams/exam-list-client";
import { FEATURE_FLAGS } from "@/lib/feature-flags";

interface PageProps {
  searchParams: Promise<{
    collectionId?: string;
  }>;
}

export default async function ExamsPage({ searchParams }: PageProps) {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const params = await searchParams;
  const showResults = FEATURE_FLAGS.SHOW_USER_RESULTS;

  const [exams, classes, collections, membershipRaw] = await Promise.all([
    getExams(staff.academyId, {
      collectionId: params.collectionId || undefined,
    }),
    getClassesForFilter(staff.academyId),
    getExamCollections(staff.academyId),
    getExamCollectionMembership(staff.academyId),
  ]);

  // Convert membership arrays to Sets for client-side usage
  const collectionMembership: Record<string, Set<string>> = {};
  for (const [colId, examIds] of Object.entries(membershipRaw)) {
    collectionMembership[colId] = new Set(examIds);
  }

  const clientExams = showResults
    ? exams
    : exams.map((exam) => ({
        ...exam,
        _count: { ...exam._count, submissions: 0 },
      }));

  return (
    <ExamListClient
      exams={clientExams as never[]}
      classes={classes}
      collections={collections}
      collectionMembership={collectionMembership}
    />
  );
}
