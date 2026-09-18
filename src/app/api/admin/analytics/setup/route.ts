import { analyticsGet } from "@/lib/analytics/admin-route";
import { getSetupReport } from "@/lib/analytics/reports/setup";

export const dynamic = "force-dynamic";

// 수집기 상태는 기간·필터와 무관(전체 수집 기준) — 쿼리 파라미터를 쓰지 않는다.
export const GET = analyticsGet(() => getSetupReport());
