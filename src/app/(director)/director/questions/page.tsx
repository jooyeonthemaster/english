import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { getWorkbenchQuestions, getQuestionCollections } from "@/actions/workbench";
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
    search?: string;
  }>;
}

export default async function QuestionsPage({ searchParams }: PageProps) {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const params = await searchParams;
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
    search: params.search || undefined,
  };

  const [questionsData, collections] = await Promise.all([
    getWorkbenchQuestions(staff.academyId, filters),
    getQuestionCollections(staff.academyId),
  ]);

  return (
    <QuestionBankClient
      academyId={staff.academyId}
      questionsData={questionsData}
      filters={filters}
      collections={collections}
    />
  );
}
