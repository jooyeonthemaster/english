import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { ExtractionManageClient } from "../_components/bulk-extract-client";

export const dynamic = "force-dynamic";

export default async function ExtractionJobsPage() {
  const staff = await getStaffSession();
  if (!staff) {
    redirect("/login?callbackUrl=/director/workbench/passages/import/jobs");
  }

  return <ExtractionManageClient />;
}
