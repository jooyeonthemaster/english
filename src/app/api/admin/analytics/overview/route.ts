import { analyticsGet } from "@/lib/analytics/admin-route";
import { getOverviewReport } from "@/lib/analytics/reports/overview";

export const dynamic = "force-dynamic";

export const GET = analyticsGet((q) => getOverviewReport(q));
