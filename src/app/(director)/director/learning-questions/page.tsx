import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { getLearningSets, getNaeshinQuestions } from "@/actions/learning-questions";
import { LearningQuestionBankClient } from "./learning-question-bank-client";

interface PageProps {
  searchParams: Promise<{
    page?: string;
    setId?: string;
    learningCategory?: string;
    subType?: string;
    difficulty?: string;
    approved?: string;
    search?: string;
    publisher?: string;
    grade?: string;
  }>;
}

export default async function LearningQuestionsPage({ searchParams }: PageProps) {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const params = await searchParams;

  // 세트 목록 조회
  const setsData = await getLearningSets(staff.academyId, {
    publisher: params.publisher || undefined,
    grade: params.grade ? parseInt(params.grade) : undefined,
  });

  // 특정 세트 선택 시 문제 목록 조회
  let questionsData = null;
  if (params.setId) {
    questionsData = await getNaeshinQuestions(staff.academyId, {
      learningSetId: params.setId,
      learningCategory: params.learningCategory || undefined,
      subType: params.subType || undefined,
      difficulty: params.difficulty || undefined,
      approved: params.approved === "true" ? true : params.approved === "false" ? false : undefined,
      search: params.search || undefined,
      page: params.page ? parseInt(params.page) : 1,
    });
  }

  return (
    <LearningQuestionBankClient
      setsData={setsData}
      questionsData={questionsData}
      currentSetId={params.setId || null}
      filters={params}
    />
  );
}
