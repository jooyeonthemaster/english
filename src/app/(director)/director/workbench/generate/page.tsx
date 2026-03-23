import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { getWorkbenchPassages } from "@/actions/workbench";
import { QuestionGeneratorClient } from "@/components/workbench/question-generator-client";

interface PageProps {
  searchParams: Promise<{ passageId?: string }>;
}

export default async function GeneratePage({ searchParams }: PageProps) {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const params = await searchParams;

  // Load passages for selection
  const passagesData = await getWorkbenchPassages(staff.academyId, {
    limit: 100,
  });

  return (
    <QuestionGeneratorClient
      passages={passagesData.passages}
      initialPassageId={params.passageId}
    />
  );
}
