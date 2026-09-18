import { Suspense } from "react";
import { AudienceView } from "@/components/admin/analytics/audience/audience-view";
import { ReportSkeleton } from "@/components/admin/analytics/shared/report-states";

export const dynamic = "force-dynamic";

export default function AdminAnalyticsAudiencePage() {
  return (
    <Suspense fallback={<ReportSkeleton rows={6} />}>
      <AudienceView />
    </Suspense>
  );
}
