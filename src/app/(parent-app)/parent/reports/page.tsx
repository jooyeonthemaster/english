import { redirect } from "next/navigation";
import { getParentSession } from "@/lib/auth-parent";
import { getParentReports } from "@/actions/parent";
import { ReportsClient } from "./reports-client";
import { UserResultsDisabled } from "@/components/shared/user-results-disabled";
import { FEATURE_FLAGS } from "@/lib/feature-flags";

export default async function ParentReportsPage() {
  const session = await getParentSession();
  if (!session) redirect("/parent/login");
  if (!FEATURE_FLAGS.SHOW_USER_RESULTS) {
    return <UserResultsDisabled homeHref="/parent" />;
  }

  const reports = await getParentReports();

  return <ReportsClient reports={reports} />;
}
