import { Suspense } from "react";
import { RealtimeView } from "@/components/admin/analytics/realtime/realtime-view";
import { ReportSkeleton } from "@/components/admin/analytics/shared/report-states";

export const dynamic = "force-dynamic";

export default function AdminAnalyticsRealtimePage() {
  return (
    <Suspense fallback={<ReportSkeleton rows={6} />}>
      <RealtimeView />
    </Suspense>
  );
}
