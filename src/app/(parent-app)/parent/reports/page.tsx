import { redirect } from "next/navigation";
import { getParentSession } from "@/lib/auth-parent";
import { getParentReports } from "@/actions/parent";
import { ReportsClient } from "./reports-client";

export default async function ParentReportsPage() {
  const session = await getParentSession();
  if (!session) redirect("/parent/login");

  const reports = await getParentReports();

  return <ReportsClient reports={reports} />;
}
