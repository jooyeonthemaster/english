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

  // Academy guard — even if the action doesn't scope by tenant internally,
  // the detail page refuses to render passages that don't belong to the
  // current staff's academy so deep-linked ids from other tenants 404 out.
  if (!passage || passage.academyId !== staff.academyId) notFound();

  return (
    <PassageDetailClient
      passage={passage}
      academyId={staff.academyId}
      autoAnalyze={sp.autoAnalyze === "true"}
      initialPrompt={sp.prompt}
      initialFocus={sp.focus?.split(",").filter(Boolean)}
      initialLevel={sp.level}
    />
  );
}
