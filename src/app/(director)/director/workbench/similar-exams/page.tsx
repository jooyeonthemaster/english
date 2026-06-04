import { redirect } from "next/navigation";

import { getStaffSession } from "@/lib/auth";
import { SimilarExamGeneratorClient } from "../exams/similar/similar-exam-generator-client";

export default async function SimilarExamsPage() {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  return <SimilarExamGeneratorClient />;
}
