import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import {
  getWorkbenchQuestions,
  getWorkbenchQuestionsGroupedByPassage,
  getWorkbenchQuestionStatusCounts,
  getQuestionCollections,
} from "@/actions/workbench";
import { prisma } from "@/lib/prisma";
import { QuestionBankClient } from "@/components/workbench/question-bank-client";

interface PageProps {
  searchParams: Promise<{
    page?: string;
    type?: string;
    subType?: string;
    difficulty?: string;
    passageId?: string;
    collectionId?: string;
    aiGenerated?: string;
    approved?: string;
    starred?: string;
    sort?: string;
    search?: string;
    view?: string;
  }>;
}

export default async function QuestionsPage({ searchParams }: PageProps) {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const params = await searchParams;
  const view: "flat" | "passage" = params.view === "passage" ? "passage" : "flat";
  const filters = {
    page: params.page ? parseInt(params.page) : 1,
    type: params.type || undefined,
    subType: params.subType || undefined,
    difficulty: params.difficulty || undefined,
    passageId: params.passageId || undefined,
    collectionId: params.collectionId || undefined,
    aiGenerated:
      params.aiGenerated === "true"
        ? true
        : params.aiGenerated === "false"
        ? false
        : undefined,
    approved:
      params.approved === "true"
        ? true
        : params.approved === "false"
        ? false
        : undefined,
    starred:
      params.starred === "true"
        ? true
        : params.starred === "false"
        ? false
        : undefined,
    sort: params.sort || undefined,
    search: params.search || undefined,
  };

  const [questionsData, groupedData, statusCounts, collections, collectionItems] = await Promise.all([
    view === "flat"
      ? getWorkbenchQuestions(staff.academyId, filters)
      : Promise.resolve(null),
    view === "passage"
      ? getWorkbenchQuestionsGroupedByPassage(staff.academyId, filters)
      : Promise.resolve(null),
    getWorkbenchQuestionStatusCounts(staff.academyId, filters),
    getQuestionCollections(staff.academyId),
    prisma.questionCollectionItem.findMany({
      // 휴지통 가드 — 삭제(휴지통)된 문제는 폴더 멤버십/카운트에서 제외(링크는 보존되지만 표시 X).
      where: {
        collection: { academyId: staff.academyId },
        question: { deletedAt: null },
      },
      select: { collectionId: true, questionId: true },
    }),
  ]);

  // Build membership map: { collectionId: Set<questionId> }
  const membershipRaw: Record<string, string[]> = {};
  for (const item of collectionItems) {
    if (!membershipRaw[item.collectionId]) membershipRaw[item.collectionId] = [];
    membershipRaw[item.collectionId].push(item.questionId);
  }

  return (
    <QuestionBankClient
      academyId={staff.academyId}
      view={view}
      questionsData={questionsData}
      groupedData={groupedData}
      statusCounts={statusCounts}
      filters={filters}
      collections={collections as any}
      collectionMembership={Object.fromEntries(
        Object.entries(membershipRaw).map(([k, v]) => [k, new Set(v)])
      )}
    />
  );
}
