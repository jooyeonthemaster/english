import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import {
  getTrashWorkbenchQuestions,
  getQuestionCollections,
} from "@/actions/workbench";
import { prisma } from "@/lib/prisma";
import { QuestionTrashClient } from "@/components/workbench/question-trash-client";

export const metadata: Metadata = { title: "국어 문제 휴지통" };

// C1/C2 공유 계약 prop — 국어 문제 은행/지문 관리 페이지와 동일 관례.
const KOREAN_SCOPE = { subjectScope: "KOREAN" } as const;

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

/**
 * 국어 문제 휴지통 — 영어 휴지통(/director/questions/trash, workbench 별칭 포함)의
 * 국어 대칭 라우트. 동일 클라이언트(QuestionTrashClient)를 재사용하되:
 *  - 서버 페치 필터에 subject: "KOREAN" 을 실어 buildWorkbenchQuestionWhere 의
 *    과목 스코프(KO_* subType 만)가 trash 스코프에도 그대로 걸리게 한다.
 *  - 폴더 목록은 국어 폴더(subject='KOREAN')만, 휴지통 멤버십/카운트도 KO_*
 *    문항만 센다.
 *  - subjectScope="KOREAN" 으로 URL 내비게이션·백링크가 국어 라우트에 머문다.
 */
export default async function KoreanQuestionTrashPage({ searchParams }: PageProps) {
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
    // 국어 스코프 — trash where 빌더가 KO_* 문항만 잡는다(전체선택 id 페치까지
    // 클라이언트가 이 filters 를 그대로 되돌려 보내므로 스코프가 유지된다).
    subject: "KOREAN" as const,
  };

  // 휴지통 데이터 + 국어 폴더 + "삭제된 KO_* 문항"만의 폴더 멤버십을 함께 로드
  // (영어 휴지통 페이지 미러 — 카운트 의미는 동일하되 모집단만 국어로 좁힌다).
  const [questionsData, collections, collectionItems] = await Promise.all([
    getTrashWorkbenchQuestions(staff.academyId, filters),
    getQuestionCollections(staff.academyId, { subject: "KOREAN" }),
    prisma.questionCollectionItem.findMany({
      where: {
        collection: { academyId: staff.academyId },
        question: {
          deletedAt: { not: null },
          subType: { startsWith: "KO_" },
        },
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
      academyId={staff.academyId}
      {...KOREAN_SCOPE}
      questionsData={questionsData}
      filters={filters}
      collections={trashCollections as never}
      collectionMembership={Object.fromEntries(
        Object.entries(membershipRaw).map(([k, v]) => [k, new Set(v)]),
      )}
    />
  );
}
