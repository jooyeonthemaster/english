"use server";

import { requireAdminAuth } from "@/lib/auth-admin";
import type { DashboardDetail, DashboardDetailKey } from "@/lib/admin-dashboard-detail-types";
import { depositsDetail, seminarsDetail, supportDetail } from "@/lib/admin-dashboard-detail/queue";
import {
  activeAcademiesDetail,
  creditsDetail,
  errorsDetail,
  questionsDetail,
  signupsDetail,
} from "@/lib/admin-dashboard-detail/today";
import {
  monthAiCostDetail,
  monthMarginDetail,
  monthRevenueDetail,
  revenueTodayDetail,
  trendDayDetail,
} from "@/lib/admin-dashboard-detail/money";

/**
 * 대시보드 블록 상세 — 호버 팝오버·클릭 팝업이 처음 열릴 때 지연 조회한다.
 * 10분 자동 새로고침되는 개요(getDashboardOverview)를 무겁게 만들지 않기 위해 분리.
 */
export async function getDashboardDetail(
  key: DashboardDetailKey,
  param?: string,
): Promise<DashboardDetail> {
  await requireAdminAuth();
  switch (key) {
    case "deposits":
      return depositsDetail();
    case "support":
      return supportDetail();
    case "seminars":
      return seminarsDetail();
    case "revenue-today":
      return revenueTodayDetail();
    case "signups-today":
      return signupsDetail();
    case "questions-today":
      return questionsDetail();
    case "credits-today":
      return creditsDetail();
    case "active-academies":
      return activeAcademiesDetail();
    case "month-revenue":
      return monthRevenueDetail();
    case "month-ai-cost":
      return monthAiCostDetail();
    case "month-margin":
      return monthMarginDetail();
    case "errors-today":
      return errorsDetail();
    case "trend-day":
      return trendDayDetail(param ?? "");
    default:
      throw new Error("알 수 없는 상세 항목입니다.");
  }
}
