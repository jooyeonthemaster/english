import { analyticsGet } from "@/lib/analytics/admin-route";
import { getSessionList, parseSessionListParams, withoutPageNumberFilter } from "@/lib/analytics/reports/sessions";

export const dynamic = "force-dynamic";

export const GET = analyticsGet((q, sp) => getSessionList(withoutPageNumberFilter(q), parseSessionListParams(sp)));
