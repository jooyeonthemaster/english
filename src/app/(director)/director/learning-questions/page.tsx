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

  // 세트 + 문제 병렬 조회 (문제는 setId + learningCategory 둘 다 있을 때만)
  const needQuestions = !!(params.setId && params.learningCategory);

  const [setsData, questionsData] = await Promise.all([
    getLearningSets(staff.academyId, {
      publisher: params.publisher || undefined,
      grade: params.grade ? parseInt(params.grade) : undefined,
    }),
    needQuestions
      ? getNaeshinQuestions(staff.academyId, {
          learningSetId: params.setId,
          learningCategory: params.learningCategory || undefined,
          subType: params.subType || undefined,
          difficulty: params.difficulty || undefined,
          approved: params.approved === "true" ? true : params.approved === "false" ? false : undefined,
          search: params.search || undefined,
          page: params.page ? parseInt(params.page) : 1,
        })
      : Promise.resolve(null),
  ]);

  return (
    <LearningQuestionBankClient
      setsData={setsData}
      questionsData={questionsData}
      currentSetId={params.setId || null}
      filters={params}
    />
  );
}
