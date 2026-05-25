import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { GeneratePageClient } from "../../generate/generate-page-client";

export default async function QuestionsGeneratePage() {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  return <GeneratePageClient academyId={staff.academyId} defaultMode="manual" />;
}
