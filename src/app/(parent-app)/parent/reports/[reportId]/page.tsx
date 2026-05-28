import { redirect } from "next/navigation";
import { getParentSession } from "@/lib/auth-parent";
import { getParentReport } from "@/actions/parent";
import { ReportDetailClient } from "./report-detail-client";
import { UserResultsDisabled } from "@/components/shared/user-results-disabled";
import { FEATURE_FLAGS } from "@/lib/feature-flags";

interface Props {
  params: Promise<{ reportId: string }>;
}

export default async function ParentReportDetailPage({ params }: Props) {
  const session = await getParentSession();
  if (!session) redirect("/parent/login");
  if (!FEATURE_FLAGS.SHOW_USER_RESULTS) {
    return <UserResultsDisabled homeHref="/parent" />;
  }

  const { reportId } = await params;
  const report = await getParentReport(reportId);

  return <ReportDetailClient report={report} />;
}
