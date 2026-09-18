import { analyticsGet } from "@/lib/analytics/admin-route";
import { getConversionsReport, parseAttributionModel } from "@/lib/analytics/reports/conversions";

export const dynamic = "force-dynamic";

export const GET = analyticsGet((q, sp) => getConversionsReport(q, parseAttributionModel(sp)));
