import { Suspense } from "react";
import { OverviewView } from "@/components/admin/analytics/overview/overview-view";
import { ReportSkeleton } from "@/components/admin/analytics/shared/report-states";

export const dynamic = "force-dynamic";

export default function AdminAnalyticsOverviewPage() {
  return (
    <Suspense fallback={<ReportSkeleton rows={6} />}>
      <OverviewView />
    </Suspense>
  );
}
