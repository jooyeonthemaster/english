import { redirect, notFound } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { getWorkbenchPassage } from "@/actions/workbench";
import { PassageDetailClient } from "@/components/workbench/passage-detail-client";

interface PageProps {
  params: Promise<{ passageId: string }>;
  searchParams: Promise<{ [key: string]: string | undefined }>;
}

export default async function PassageDetailPage({ params, searchParams }: PageProps) {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const { passageId } = await params;
  const sp = await searchParams;
  const passage = await getWorkbenchPassage(passageId);

  if (!passage) notFound();

  return (
    <PassageDetailClient
      passage={passage}
      autoAnalyze={sp.autoAnalyze === "true"}
      initialPrompt={sp.prompt}
      initialFocus={sp.focus?.split(",").filter(Boolean)}
      initialLevel={sp.level}
    />
  );
}
