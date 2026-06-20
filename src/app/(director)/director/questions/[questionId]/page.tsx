import { redirect, notFound } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { getWorkbenchQuestion } from "@/actions/workbench";
import { QuestionEditWorkspace } from "@/components/workbench/question-ai-edit/question-edit-workspace";

interface PageProps {
  params: Promise<{ questionId: string }>;
}

export default async function QuestionDetailPage({ params }: PageProps) {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const { questionId } = await params;
  const question = await getWorkbenchQuestion(questionId);

  if (!question) notFound();

  return <QuestionEditWorkspace question={question} mode="page" />;
}
