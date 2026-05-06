import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { getPendingQuestionDrafts } from "@/actions/workbench";
import { PendingQuestionDraftClient } from "./pending-question-draft-client";

export default async function PendingQuestionsPage() {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const drafts = await getPendingQuestionDrafts();

  return <PendingQuestionDraftClient initialDrafts={drafts} />;
}
