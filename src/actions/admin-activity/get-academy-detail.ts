"use server";

// ============================================================================
// 개별 학원 심층 — 학원별 테이블 행 클릭 시 모달이 지연 로드.
// 기능별 분해(성공/실패 포함)·최근 60일 일별·직원 수·최근 활동 타임라인.
// ============================================================================

import { requireAdminAuth } from "@/lib/auth-admin";
import { isSuperAdmin } from "@/actions/admin-members/_shared";
import { prisma } from "@/lib/prisma";
import {
  FEATURE_LABELS,
  FEATURE_ORDER,
  type AcademyDetailPayload,
  type AcademyFeatureBreakdown,
  type ActivityFeature,
  type PlanTier,
} from "@/lib/admin-analytics-types";
import { fetchActivityUnion } from "./_sources";
import { fetchTodayKst } from "./analytics/_query";
import { fetchAcademyDetail } from "./analytics/_query-extra";

const DAILY_DAYS = 60;
const DAY_MS = 86_400_000;
const KST_OFFSET_MS = 9 * 3_600_000;
const dayToMs = (d: string) => Date.parse(`${d}T00:00:00Z`);
const msToDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => msToDay(dayToMs(d) + n * DAY_MS);

function currentStreak(active: Set<string>, today: string): number {
  let cursor: string | null = active.has(today)
    ? today
    : active.has(addDays(today, -1))
      ? addDays(today, -1)
      : null;
  if (!cursor) return 0;
  let n = 0;
  while (active.has(cursor)) {
    n += 1;
    cursor = addDays(cursor, -1);
  }
  return n;
}

export async function getAcademyDetail(
  academyId: string,
): Promise<AcademyDetailPayload | null> {
  const session = await requireAdminAuth();
  if (!academyId) return null;
  const elevated = isSuperAdmin(session);

  const todayKst = await fetchTodayKst();
  const dailyFromMs = dayToMs(todayKst) - (DAILY_DAYS - 1) * DAY_MS;
  const dailyFromUtc = new Date(dailyFromMs - KST_OFFSET_MS);

  const [academy, detail, feed] = await Promise.all([
    prisma.academy.findUnique({
      where: { id: academyId },
      select: {
        id: true,
        name: true,
        status: true,
        createdAt: true,
        subscriptions: {
          select: { status: true, plan: { select: { tier: true } } },
          orderBy: { createdAt: "desc" },
          take: 5,
        },
      },
    }),
    fetchAcademyDetail(academyId, dailyFromUtc),
    fetchActivityUnion({ academyId, limit: 25 }),
  ]);

  if (!academy) return null;

  const sub =
    academy.subscriptions.find((s) =>
      ["ACTIVE", "TRIAL", "PAST_DUE"].includes(s.status),
    ) ?? academy.subscriptions[0];

  // 기능별 분해 (전체 기간)
  const byFeature = new Map<
    ActivityFeature,
    { total: number; success: number; failed: number }
  >();
  for (const r of detail.featureRows) {
    if (!(FEATURE_ORDER as string[]).includes(r.feature)) continue;
    const f = r.feature as ActivityFeature;
    const acc = byFeature.get(f) ?? { total: 0, success: 0, failed: 0 };
    acc.total += r.cnt;
    if (r.status === "SUCCESS") acc.success += r.cnt;
    else if (r.status === "FAILED") acc.failed += r.cnt;
    byFeature.set(f, acc);
  }
  const featureBreakdown: AcademyFeatureBreakdown[] = FEATURE_ORDER.map((f) => {
    const a = byFeature.get(f);
    return {
      feature: f,
      label: FEATURE_LABELS[f],
      total: a?.total ?? 0,
      success: a?.success ?? 0,
      failed: a?.failed ?? 0,
    };
  }).filter((b) => b.total > 0);

  // 최근 60일 일별 (0 채움) + 활동일/연속일.
  // GROUP BY COUNT(*) 결과라 모든 dailyRows 는 cnt>=1 → 활동일 집합 그대로.
  const dayMap = new Map(detail.dailyRows.map((r) => [r.day, r.cnt]));
  const active = new Set(detail.dailyRows.map((r) => r.day));
  const daily: Array<{ date: string; count: number }> = [];
  for (let i = DAILY_DAYS - 1; i >= 0; i--) {
    const date = addDays(todayKst, -i);
    daily.push({ date, count: dayMap.get(date) ?? 0 });
  }

  const totalEvents = detail.featureRows.reduce((s, r) => s + r.cnt, 0);

  return {
    academyId: academy.id,
    academyName: academy.name,
    planTier: (sub?.plan?.tier ?? "NONE") as PlanTier,
    planStatus: sub?.status ?? null,
    academyStatus: academy.status,
    signupAt: academy.createdAt.toISOString(),
    firstActivityAt: detail.firstAt ? detail.firstAt.toISOString() : null,
    lastActivityAt: detail.lastAt ? detail.lastAt.toISOString() : null,
    totalEvents,
    staffCount: detail.staffCount,
    activeDays60: active.size,
    currentStreak: currentStreak(active, todayKst),
    featureBreakdown,
    daily,
    // 비-SUPER_ADMIN(SUPPORT)에게는 메타데이터 비공개 — 전역 피드와 동일 규칙.
    recentActivity: elevated
      ? feed.items
      : feed.items.map((i) => ({ ...i, metadata: null })),
    dataNotes: [
      "기능별 건수·성공/실패는 전체 기간 누적입니다.",
      "일별 추이·현재 연속일은 최근 60일(KST) 기준, 최근 활동은 9-소스 유니온 최신 25건입니다.",
      "페이지 이동·로그인은 디렉터 포털에서만 수집됩니다(학생·튜터 활동은 도메인 작업으로 집계).",
    ],
  };
}
