import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { GenerateLearningClient } from "./_components/generate-learning-client";

export default async function GenerateLearningPage() {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  return <GenerateLearningClient academyId={staff.academyId} />;
}
