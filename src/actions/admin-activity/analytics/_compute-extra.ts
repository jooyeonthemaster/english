// ============================================================================
// 활동 분석 — 확장 계산 레이어 (순수 함수, prisma 금지).
// _query-extra 의 결과 + 디렉터리/인게이지먼트를 받아 기능 추이·채택률·성공률·
// 히트맵·가입추이·분포·퍼널 페이로드 조각을 만든다. 일자는 KST 문자열.
// ============================================================================

import type {
  AcademyEngagement,
  ActivityFeature,
  DistributionItem,
  FeatureAdoption,
  FeatureDailyPoint,
  FeatureOutcome,
  FunnelStage,
  HourWeekdayCell,
  SignupPoint,
} from "@/lib/admin-analytics-types";
import {
  FEATURE_LABELS,
  FEATURE_ORDER,
  JOB_FEATURES,
  PLAN_TIER_LABELS,
} from "@/lib/admin-analytics-types";
import type { DirectoryRow } from "./_query";
import type {
  FeatureAdoptionRow,
  FeatureDayRow,
  FeatureOutcomeRow,
  HourWeekdayRow,
  SignupDayRow,
} from "./_query-extra";

const DAY_MS = 86_400_000;
const dayToMs = (d: string) => Date.parse(`${d}T00:00:00Z`);
const msToDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => msToDay(dayToMs(d) + n * DAY_MS);
function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let ms = dayToMs(from); ms <= dayToMs(to); ms += DAY_MS) out.push(msToDay(ms));
  return out;
}

function emptyFeatures(): Record<ActivityFeature, number> {
  return FEATURE_ORDER.reduce(
    (acc, f) => {
      acc[f] = 0;
      return acc;
    },
    {} as Record<ActivityFeature, number>,
  );
}

const PLAN_COLORS: Record<string, string> = {
  STARTER: "#94A3B8",
  STANDARD: "#3B82F6",
  PREMIUM: "#8B5CF6",
  ENTERPRISE: "#10B981",
  NONE: "#E2E8F0",
};

const STATUS_META: Record<string, { label: string; color: string }> = {
  ACTIVE: { label: "활성", color: "#10B981" },
  TRIAL: { label: "체험", color: "#3B82F6" },
  SUSPENDED: { label: "정지", color: "#F43F5E" },
  DEACTIVATED: { label: "해지", color: "#94A3B8" },
};

export interface ExtraInput {
  todayKst: string;
  rangeDays: number;
  featureDaily: FeatureDayRow[];
  featureAdoption: FeatureAdoptionRow[];
  featureOutcomes: FeatureOutcomeRow[];
  hourWeekday: HourWeekdayRow[];
  signups: { daily: SignupDayRow[]; baseline: number };
  directory: DirectoryRow[];
  engagement: AcademyEngagement[];
}

export interface ExtraOutput {
  featureDaily: FeatureDailyPoint[];
  featureAdoption: FeatureAdoption[];
  featureOutcomes: FeatureOutcome[];
  hourWeekday: HourWeekdayCell[];
  signupsDaily: SignupPoint[];
  planDistribution: DistributionItem[];
  statusDistribution: DistributionItem[];
  funnel: FunnelStage[];
}

function isFeature(s: string): s is ActivityFeature {
  return (FEATURE_ORDER as string[]).includes(s);
}

export function computeExtras(input: ExtraInput): ExtraOutput {
  const { todayKst, rangeDays } = input;
  const fromKst = addDays(todayKst, -(rangeDays - 1));
  const axis = eachDay(fromKst, todayKst);

  // ── 기능별 일별 추이 ──
  const byDay = new Map<string, Record<ActivityFeature, number>>();
  for (const r of input.featureDaily) {
    if (!isFeature(r.feature)) continue;
    if (!byDay.has(r.day)) byDay.set(r.day, emptyFeatures());
    byDay.get(r.day)![r.feature] += r.cnt;
  }
  const featureDaily: FeatureDailyPoint[] = axis.map((date) => ({
    date,
    byFeature: byDay.get(date) ?? emptyFeatures(),
  }));

  // ── 기능 채택률 ──
  const adoptMap = new Map(input.featureAdoption.map((r) => [r.feature, r]));
  const featureAdoption: FeatureAdoption[] = FEATURE_ORDER.map((feature) => {
    const r = adoptMap.get(feature);
    return {
      feature,
      label: FEATURE_LABELS[feature],
      academies: r?.academies ?? 0,
      total: r?.total ?? 0,
    };
  });

  // ── 기능 성공/실패 (잡 기반) ──
  const outMap = new Map<ActivityFeature, FeatureOutcome>();
  for (const f of JOB_FEATURES) {
    outMap.set(f, { feature: f, label: FEATURE_LABELS[f], success: 0, failed: 0, pending: 0 });
  }
  for (const r of input.featureOutcomes) {
    if (!isFeature(r.feature)) continue;
    const o = outMap.get(r.feature);
    if (!o) continue;
    if (r.status === "SUCCESS") o.success += r.cnt;
    else if (r.status === "FAILED") o.failed += r.cnt;
    else o.pending += r.cnt;
  }
  const featureOutcomes: FeatureOutcome[] = JOB_FEATURES.map(
    (f) => outMap.get(f)!,
  );

  // ── 시간대×요일 히트맵 (7×24 전부 채움) ──
  const cellMap = new Map<string, number>();
  for (const r of input.hourWeekday) {
    cellMap.set(`${r.weekday}-${r.hour}`, r.cnt);
  }
  const hourWeekday: HourWeekdayCell[] = [];
  for (let weekday = 0; weekday < 7; weekday++) {
    for (let hour = 0; hour < 24; hour++) {
      hourWeekday.push({
        weekday,
        hour,
        count: cellMap.get(`${weekday}-${hour}`) ?? 0,
      });
    }
  }

  // ── 일별 신규 가입 + 누적 ──
  const signupMap = new Map(input.signups.daily.map((r) => [r.day, r.cnt]));
  let running = input.signups.baseline;
  const signupsDaily: SignupPoint[] = axis.map((date) => {
    const s = signupMap.get(date) ?? 0;
    running += s;
    return { date, signups: s, cumulative: running };
  });

  // ── 플랜/상태 분포 ──
  const planCount = new Map<string, number>();
  const statusCount = new Map<string, number>();
  for (const a of input.directory) {
    planCount.set(a.planTier, (planCount.get(a.planTier) ?? 0) + 1);
    statusCount.set(a.status, (statusCount.get(a.status) ?? 0) + 1);
  }
  const planDistribution: DistributionItem[] = (
    ["ENTERPRISE", "PREMIUM", "STANDARD", "STARTER", "NONE"] as const
  )
    .filter((tier) => (planCount.get(tier) ?? 0) > 0)
    .map((tier) => ({
      key: tier,
      label: PLAN_TIER_LABELS[tier],
      count: planCount.get(tier) ?? 0,
      color: PLAN_COLORS[tier],
    }));
  const statusDistribution: DistributionItem[] = [...statusCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => ({
      key,
      label: STATUS_META[key]?.label ?? key,
      count,
      color: STATUS_META[key]?.color ?? "#CBD5E1",
    }));

  // ── 활성화 퍼널 ──
  const total = input.engagement.length;
  const activated = input.engagement.filter((e) => e.firstActivityAt).length;
  const repeat = input.engagement.filter((e) => e.activeDays30 >= 2).length;
  const power = input.engagement.filter((e) => e.segment === "POWER").length;
  const stages: Array<{ key: string; label: string; count: number }> = [
    { key: "signup", label: "가입", count: total },
    { key: "activated", label: "활성화(1회+)", count: activated },
    { key: "repeat", label: "반복(2일+)", count: repeat },
    { key: "power", label: "파워", count: power },
  ];
  const funnel: FunnelStage[] = stages.map((s, i) => ({
    ...s,
    rate: i === 0 ? 1 : stages[i - 1].count ? s.count / stages[i - 1].count : 0,
  }));

  return {
    featureDaily,
    featureAdoption,
    featureOutcomes,
    hourWeekday,
    signupsDaily,
    planDistribution,
    statusDistribution,
    funnel,
  };
}
