import { analyticsGet } from "@/lib/analytics/admin-route";
import { isAttributionModel } from "@/lib/analytics/attribution";
import { getAcquisitionReport } from "@/lib/analytics/reports/acquisition";

export const dynamic = "force-dynamic";

// GET /api/admin/analytics/acquisition?<공용 기간·필터>&model=first|last (기본 first)
export const GET = analyticsGet((q, sp) => {
  const model = sp.get("model");
  return getAcquisitionReport(q, isAttributionModel(model) ? model : "first");
});
