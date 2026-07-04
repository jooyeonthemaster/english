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

  // Convert membership arrays to Sets for client-side usage.
  // [ISO-9] 폴더 멤버십을 영어 목록(getExams=KO 제외) 시험지 id 로 교집합 —
  // 폴더에 국어 시험지가 담겨 있어도 배지 수와 실제 표시 수가 어긋나지 않는다
  // (국어 페이지 korean/exams 의 koExamIds 교집합 로직 미러). 단, 레거시
  // ?collectionId= 딥링크로 목록 자체가 한 폴더로 축소된 경우에는 교집합을
  // 건너뛴다(다른 폴더 배지가 0 으로 무너지는 것 방지 — 종전 동작 유지).
  const enExamIds = params.collectionId
    ? null
    : new Set(exams.map((exam) => exam.id));
  const collectionMembership: Record<string, Set<string>> = {};
  for (const [colId, examIds] of Object.entries(membershipRaw)) {
    collectionMembership[colId] = new Set(
      enExamIds ? examIds.filter((id) => enExamIds.has(id)) : examIds,
    );
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
