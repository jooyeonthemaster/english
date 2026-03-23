import { redirect, notFound } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { getWorkbenchQuestion } from "@/actions/workbench";
import { QuestionEditClient } from "@/components/workbench/question-edit-client";

interface PageProps {
  params: Promise<{ questionId: string }>;
}

export default async function QuestionDetailPage({ params }: PageProps) {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const { questionId } = await params;
  const question = await getWorkbenchQuestion(questionId);

  if (!question) notFound();

  return <QuestionEditClient question={question} />;
}
