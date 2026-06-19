"use server";

// ============================================================================
// 활동 분석 페이로드 — /admin/activity "분석 대시보드" 탭용.
// 9-소스 유니온을 일별/학원별로 집계하고, 세부 기능·성과·히트맵·가입·분포·퍼널
// 까지 한 번에 반환한다. 관리자 1~2명 화면이고 학원 ~80곳이라 비용은 작다.
// ============================================================================

import { requireAdminAuth } from "@/lib/auth-admin";
import type { ActivityAnalyticsPayload } from "@/lib/admin-analytics-types";
import { computeAnalytics } from "./analytics/_compute";
import { computeExtras } from "./analytics/_compute-extra";
import {
  fetchAcademyBounds,
  fetchAcademyDirectory,
  fetchDailyMatrix,
  fetchTodayKst,
} from "./analytics/_query";
import {
  fetchFeatureAdoption,
  fetchFeatureDaily,
  fetchFeatureOutcomes,
  fetchHourWeekday,
  fetchSignups,
} from "./analytics/_query-extra";

const ALLOWED_RANGES = new Set([7, 30, 90]);
const DAY_MS = 86_400_000;
const KST_OFFSET_MS = 9 * 3_600_000;

/** KST 일자 'YYYY-MM-DD' 자정 - (days-1)일 을 UTC instant 로. */
function windowStartUtc(todayKst: string, days: number): Date {
  const fromMs = Date.parse(`${todayKst}T00:00:00Z`) - (days - 1) * DAY_MS;
  return new Date(fromMs - KST_OFFSET_MS);
}

export async function getActivityAnalytics(
  rangeDaysInput = 90,
): Promise<ActivityAnalyticsPayload> {
  await requireAdminAuth();

  const rangeDays = ALLOWED_RANGES.has(rangeDaysInput) ? rangeDaysInput : 90;
  // 롤링 지표(MAU·세그먼트·연속일)는 최소 30일 필요 → 매트릭스는 넓게.
  // 기능/가입 등 "최근 N일" 인사이트는 선택 기간(rangeDays)에 맞춰 따로 조회.
  const matrixDays = Math.max(rangeDays, 30);

  const todayKst = await fetchTodayKst();
  const matrixFromUtc = windowStartUtc(todayKst, matrixDays);
  const rangeFromUtc = windowStartUtc(todayKst, rangeDays);

  const [
    matrix,
    bounds,
    directory,
    featureDaily,
    featureAdoption,
    featureOutcomes,
    hourWeekday,
    signups,
  ] = await Promise.all([
    fetchDailyMatrix(matrixFromUtc),
    fetchAcademyBounds(),
    fetchAcademyDirectory(),
    fetchFeatureDaily(rangeFromUtc),
    fetchFeatureAdoption(),
    fetchFeatureOutcomes(rangeFromUtc),
    fetchHourWeekday(rangeFromUtc),
    fetchSignups(rangeFromUtc),
  ]);

  const core = computeAnalytics({
    matrix,
    bounds,
    directory,
    todayKst,
    rangeDays,
    matrixDays,
  });
  const engagement = core.engagement;

  const extras = computeExtras({
    todayKst,
    rangeDays,
    featureDaily,
    featureAdoption,
    featureOutcomes,
    hourWeekday,
    signups,
    directory,
    engagement,
  });

  return { ...core, ...extras };
}
