import { Suspense } from "react";
import { ConversionsView } from "@/components/admin/analytics/conversions/conversions-view";
import { ReportSkeleton } from "@/components/admin/analytics/shared/report-states";

export const dynamic = "force-dynamic";

export default function AdminAnalyticsConversionsPage() {
  return (
    <Suspense fallback={<ReportSkeleton rows={6} />}>
      <ConversionsView />
    </Suspense>
  );
}
