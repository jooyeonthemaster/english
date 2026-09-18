import { Suspense } from "react";
import { SessionsView } from "@/components/admin/analytics/sessions/sessions-view";
import { ReportSkeleton } from "@/components/admin/analytics/shared/report-states";

export const dynamic = "force-dynamic";

export default function AdminAnalyticsSessionsPage() {
  return (
    <Suspense fallback={<ReportSkeleton rows={8} />}>
      <SessionsView />
    </Suspense>
  );
}
