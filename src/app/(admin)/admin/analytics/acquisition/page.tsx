import { Suspense } from "react";
import { AcquisitionView } from "@/components/admin/analytics/acquisition/acquisition-view";
import { ReportSkeleton } from "@/components/admin/analytics/shared/report-states";

export const dynamic = "force-dynamic";

export default function AdminAnalyticsAcquisitionPage() {
  return (
    <Suspense fallback={<ReportSkeleton rows={6} />}>
      <AcquisitionView />
    </Suspense>
  );
}
