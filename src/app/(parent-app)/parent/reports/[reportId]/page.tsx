import { redirect } from "next/navigation";
import { getParentSession } from "@/lib/auth-parent";
import { getParentReport } from "@/actions/parent";
import { ReportDetailClient } from "./report-detail-client";

interface Props {
  params: Promise<{ reportId: string }>;
}

export default async function ParentReportDetailPage({ params }: Props) {
  const session = await getParentSession();
  if (!session) redirect("/parent/login");

  const { reportId } = await params;
  const report = await getParentReport(reportId);

  return <ReportDetailClient report={report} />;
}
