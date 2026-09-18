import { Suspense } from "react";
import { LinksView } from "@/components/admin/analytics/links/links-view";
import { ReportSkeleton } from "@/components/admin/analytics/shared/report-states";

export const dynamic = "force-dynamic";

export default function AdminAnalyticsLinksPage() {
  return (
    <Suspense fallback={<ReportSkeleton rows={6} />}>
      <LinksView />
    </Suspense>
  );
}
