import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import {
  getTrashWorkbenchQuestions,
  getQuestionCollections,
} from "@/actions/workbench";
import { prisma } from "@/lib/prisma";
import { QuestionTrashClient } from "@/components/workbench/question-trash-client";

interface PageProps {
  searchParams: Promise<{
    page?: string;
    type?: string;
    subType?: string;
    difficulty?: string;
    collectionId?: string;
    starred?: string;
    search?: string;
    sort?: string;
  }>;
}

export default async function QuestionTrashPage({ searchParams }: PageProps) {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const params = await searchParams;
  const filters = {
    page: params.page ? parseInt(params.page) : 1,
    type: params.type || undefined,
    subType: params.subType || undefined,
    difficulty: params.difficulty || undefined,
    collectionId: params.collectionId || undefined,
    starred:
      params.starred === "true"
        ? true
        : params.starred === "false"
          ? false
          : undefined,
    search: params.search || undefined,
    sort: params.sort || undefined,
  };

  // 휴지통 데이터 + 폴더(컬렉션) + 휴지통 멤버십을 함께 로드한다.
  // - collections: 문제 관리와 동일한 공유 폴더 목록(생성/이름변경/삭제가 양쪽에 반영된다).
  // - collectionItems: deletedAt != null(휴지통에 있는) 문제만의 폴더 소속 —
  //   소프트 삭제 후에도 question_collection_items 행이 보존되므로, 휴지통 카운트가 의미를 가진다.
  //   (문제 관리 page.tsx 는 정확히 그 반대인 deletedAt:null 만 센다.)
  const [questionsData, collections, collectionItems] = await Promise.all([
    getTrashWorkbenchQuestions(staff.academyId, filters),
    getQuestionCollections(staff.academyId),
    prisma.questionCollectionItem.findMany({
      where: {
        collection: { academyId: staff.academyId },
        question: { deletedAt: { not: null } },
      },
      select: { collectionId: true, questionId: true },
    }),
  ]);

  // 멤버십 맵 { collectionId: Set<questionId> } — 폴더별 휴지통 카운트의 원천.
  const membershipRaw: Record<string, string[]> = {};
  for (const item of collectionItems) {
    if (!membershipRaw[item.collectionId]) membershipRaw[item.collectionId] = [];
    membershipRaw[item.collectionId].push(item.questionId);
  }

  // 휴지통 폴더 카운트는 "삭제된 문제 수"여야 하므로, getQuestionCollections 가
  // deletedAt:null 만으로 채운 _count.items 를 휴지통 멤버십 기준으로 덮어쓴다.
  const trashCollections = collections.map((c) => ({
    ...c,
    _count: {
      ...c._count,
      items: membershipRaw[c.id]?.length ?? 0,
    },
  }));

  return (
    <QuestionTrashClient
      questionsData={questionsData}
      filters={filters}
      collections={trashCollections as never}
      collectionMembership={Object.fromEntries(
        Object.entries(membershipRaw).map(([k, v]) => [k, new Set(v)]),
      )}
    />
  );
}
