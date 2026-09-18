import { analyticsGet } from "@/lib/analytics/admin-route";
import { getAudienceReport } from "@/lib/analytics/reports/audience";

export const dynamic = "force-dynamic";

export const GET = analyticsGet((q) => getAudienceReport(q));
