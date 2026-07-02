import type { Metadata } from "next";
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

export const metadata: Metadata = { title: "국어 문제 은행" };

// C1/C2 공유 계약 prop — C2 가 클라이언트 측 subjectScope 를 구현한다. 스프레드로
// 넘겨 C2 착륙 전에도 컴파일이 깨지지 않게 한다(런타임 전달은 동일).
const KOREAN_SCOPE = { subjectScope: "KOREAN" } as const;

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

/**
 * 국어 문제 은행 — 영어 director/questions 페이지의 국어 대칭 라우트.
 * 동일 클라이언트(QuestionBankClient)를 재사용하고 계약 prop
 * subjectScope="KOREAN" 을 넘긴다(KO_* 문항·국어 지문만 노출).
 * 서버 페치 필터에도 subject: "KOREAN" 을 함께 실어 액션 측 스코프 구현이
 * 그대로 집도록 한다.
 */
export default async function KoreanQuestionsPage({ searchParams }: PageProps) {
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
    // 국어 스코프 — 액션 측 subject 필터 계약(KOREAN 단방향 opt-in)과 동일 키.
    subject: "KOREAN" as const,
  };

  const [questionsData, groupedData, statusCounts, collections, collectionItems] = await Promise.all([
    view === "flat"
      ? getWorkbenchQuestions(staff.academyId, filters)
      : Promise.resolve(null),
    view === "passage"
      ? getWorkbenchQuestionsGroupedByPassage(staff.academyId, filters)
      : Promise.resolve(null),
    getWorkbenchQuestionStatusCounts(staff.academyId, filters),
    // 폴더는 국어 스코프(subject='KOREAN' 폴더만) — 영어 폴더와 완전 분리.
    getQuestionCollections(staff.academyId, { subject: "KOREAN" }),
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
      {...KOREAN_SCOPE}
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
