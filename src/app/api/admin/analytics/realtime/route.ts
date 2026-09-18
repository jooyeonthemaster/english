import { analyticsGet } from "@/lib/analytics/admin-route";
import { getRealtimeReport } from "@/lib/analytics/reports/realtime";

export const dynamic = "force-dynamic";

export const GET = analyticsGet((q) => getRealtimeReport(q));
