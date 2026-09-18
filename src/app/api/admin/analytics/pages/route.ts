import { analyticsGet } from "@/lib/analytics/admin-route";
import { getPagesReport, parsePagesOptions } from "@/lib/analytics/reports/pages";

export const dynamic = "force-dynamic";

export const GET = analyticsGet((q, sp) => getPagesReport(q, parsePagesOptions(sp)));
