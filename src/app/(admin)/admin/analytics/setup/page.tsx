import { Suspense } from "react";
import { SetupView } from "@/components/admin/analytics/setup/setup-view";
import { ReportSkeleton } from "@/components/admin/analytics/shared/report-states";

export const dynamic = "force-dynamic";

export default function AdminAnalyticsSetupPage() {
  return (
    <Suspense fallback={<ReportSkeleton rows={6} />}>
      <SetupView />
    </Suspense>
  );
}
