import { Suspense } from "react";
import { PagesView } from "@/components/admin/analytics/pages/pages-view";
import { ReportSkeleton } from "@/components/admin/analytics/shared/report-states";

export const dynamic = "force-dynamic";

export default function AdminAnalyticsPagesPage() {
  return (
    <Suspense fallback={<ReportSkeleton rows={6} />}>
      <PagesView />
    </Suspense>
  );
}
