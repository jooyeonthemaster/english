// ============================================================================
// 활동 분석 — 계산 레이어 (순수 함수, prisma 금지).
//
// 쿼리 레이어가 준 매트릭스/경계/디렉터리 + todayKst 를 받아 페이로드를
// 조립한다. 모든 일자 계산은 KST 'YYYY-MM-DD' 문자열로 한다(서버 타임존에
// 의존하지 않도록 todayKst 를 SQL now()@Asia/Seoul 에서 받아 주입).
// KST 는 DST 가 없어 하루 = 정확히 86400000ms.
// ============================================================================

import type {
  AcademyEngagement,
  ActivityAnalyticsPayload,
  ActivityCategory,
  AnalyticsKpis,
  CohortPoint,
  DailyPoint,
  EngagementSegment,
  PlanTier,
  SegmentCount,
  StreakBucket,
} from "@/lib/admin-analytics-types";
import { SEGMENT_LABELS } from "@/lib/admin-analytics-types";
import type { BoundsRow, DirectoryRow, MatrixRow } from "./_query";

const ALL_CATEGORIES: ActivityCategory[] = [
  "EXTRACTION",
  "AI_GENERATION",
  "CONTENT",
  "EXPORT",
  "PAGE_VIEW",
  "AUTH",
];

const SEGMENT_ORDER: EngagementSegment[] = [
  "POWER",
  "REGULAR",
  "LIGHT",
  "NEW",
  "DORMANT",
  "SIGNUP_ONLY",
];

const DAY_MS = 86_400_000;
const KST_OFFSET_MS = 9 * 3_600_000;

// ─── KST 일자 헬퍼 ───────────────────────────────────────────────────────────

function dayToMs(day: string): number {
  return Date.parse(`${day}T00:00:00Z`);
}
function msToDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
function addDays(day: string, n: number): string {
  return msToDay(dayToMs(day) + n * DAY_MS);
}
/** a - b (일). 양수면 a 가 더 나중. */
function diffDays(a: string, b: string): number {
  return Math.round((dayToMs(a) - dayToMs(b)) / DAY_MS);
}
/** timestamp(UTC) → KST 달력 일자 'YYYY-MM-DD'. */
function kstDayOf(date: Date): string {
  return new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}
function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let ms = dayToMs(from); ms <= dayToMs(to); ms += DAY_MS) {
    out.push(msToDay(ms));
  }
  return out;
}
/** 그 일자가 속한 주의 월요일. */
function mondayOf(day: string): string {
  const dow = new Date(dayToMs(day)).getUTCDay(); // 0=일..6=토
  const sinceMon = (dow + 6) % 7;
  return addDays(day, -sinceMon);
}
function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// ─── 학원별 일자 집계 ────────────────────────────────────────────────────────

interface PerAcademy {
  /** day -> 총 건수 */
  dayCount: Map<string, number>;
  /** 활동한 일자 집합 */
  activeDays: Set<string>;
}

function indexMatrix(matrix: MatrixRow[]): Map<string, PerAcademy> {
  const map = new Map<string, PerAcademy>();
  for (const row of matrix) {
    let pa = map.get(row.academyId);
    if (!pa) {
      pa = { dayCount: new Map(), activeDays: new Set() };
      map.set(row.academyId, pa);
    }
    pa.dayCount.set(row.day, (pa.dayCount.get(row.day) ?? 0) + row.cnt);
    pa.activeDays.add(row.day);
  }
  return map;
}

function currentStreak(activeDays: Set<string>, today: string): number {
  let cursor: string | null = null;
  if (activeDays.has(today)) cursor = today;
  else if (activeDays.has(addDays(today, -1))) cursor = addDays(today, -1);
  if (!cursor) return 0;
  let streak = 0;
  while (activeDays.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

function longestStreak(activeDays: Set<string>): number {
  const sorted = [...activeDays].sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    if (prev && diffDays(d, prev) === 1) run += 1;
    else run = 1;
    if (run > best) best = run;
    prev = d;
  }
  return best;
}

function classify(opts: {
  hasActivity: boolean;
  daysSinceSignup: number;
  daysSinceLastActivity: number | null;
  activeDays30: number;
}): EngagementSegment {
  const { hasActivity, daysSinceSignup, daysSinceLastActivity, activeDays30 } =
    opts;
  if (!hasActivity) return "SIGNUP_ONLY";
  if (daysSinceSignup <= 7) return "NEW";
  if (daysSinceLastActivity !== null && daysSinceLastActivity >= 14)
    return "DORMANT";
  if (activeDays30 >= 12) return "POWER";
  if (activeDays30 >= 4) return "REGULAR";
  return "LIGHT";
}

// ─── 메인 ────────────────────────────────────────────────────────────────────

export interface ComputeInput {
  matrix: MatrixRow[];
  bounds: BoundsRow[];
  directory: DirectoryRow[];
  todayKst: string;
  /** 일별 추이 차트 표시 기간(일) */
  rangeDays: number;
  /** 실제 매트릭스가 커버하는 기간(일) = max(rangeDays, 30). 롤링 지표 계산 범위. */
  matrixDays: number;
}

/** 코호트 차트가 과도하게 길지 않도록 최근 N주만 노출. */
const MAX_COHORT_WEEKS = 26;

/** 코어 페이로드 = 전체 페이로드에서 확장 인사이트 필드를 뺀 것. 확장은 액션이 병합. */
export type CoreAnalyticsPayload = Omit<
  ActivityAnalyticsPayload,
  | "featureDaily"
  | "featureAdoption"
  | "featureOutcomes"
  | "hourWeekday"
  | "signupsDaily"
  | "planDistribution"
  | "statusDistribution"
  | "funnel"
>;

export function computeAnalytics(input: ComputeInput): CoreAnalyticsPayload {
  const { matrix, bounds, directory, todayKst, rangeDays, matrixDays } = input;
  const fromKst = addDays(todayKst, -(rangeDays - 1));
  const day7 = addDays(todayKst, -6);
  const day30 = addDays(todayKst, -29);
  const yesterday = addDays(todayKst, -1);

  const perAcademy = indexMatrix(matrix);
  const boundsMap = new Map(bounds.map((b) => [b.academyId, b]));

  // ── 학원별 인게이지먼트 ──
  const engagement: AcademyEngagement[] = directory.map((dir) => {
    const b = boundsMap.get(dir.academyId);
    const pa = perAcademy.get(dir.academyId);
    const signupDay = kstDayOf(dir.signupAt);
    const hasActivity = !!b;

    const firstActivityDay = b ? kstDayOf(b.firstAt) : null;
    const lastActivityDay = b ? kstDayOf(b.lastAt) : null;

    const activeDays = pa?.activeDays ?? new Set<string>();
    const activeDays30 = [...activeDays].filter((d) => d >= day30).length;
    let events7 = 0;
    if (pa) {
      for (const [d, c] of pa.dayCount) if (d >= day7) events7 += c;
    }
    const sparkline = eachDay(addDays(todayKst, -13), todayKst).map(
      (d) => pa?.dayCount.get(d) ?? 0,
    );

    const daysSinceSignup = Math.max(0, diffDays(todayKst, signupDay));
    const daysToActivate =
      firstActivityDay !== null
        ? Math.max(0, diffDays(firstActivityDay, signupDay))
        : null;
    const daysSinceLastActivity =
      lastActivityDay !== null ? diffDays(todayKst, lastActivityDay) : null;

    const segment = classify({
      hasActivity,
      daysSinceSignup,
      daysSinceLastActivity,
      activeDays30,
    });

    return {
      academyId: dir.academyId,
      academyName: dir.name,
      planTier: dir.planTier as PlanTier,
      planStatus: dir.planStatus,
      academyStatus: dir.status,
      signupAt: dir.signupAt.toISOString(),
      firstActivityAt: b ? b.firstAt.toISOString() : null,
      lastActivityAt: b ? b.lastAt.toISOString() : null,
      totalEvents: b?.total ?? 0,
      activeDays30,
      events7,
      currentStreak: currentStreak(activeDays, todayKst),
      longestStreak: longestStreak(activeDays),
      daysSinceSignup,
      daysToActivate,
      sparkline,
      segment,
    };
  });

  // ── 일별 시계열 ──
  const dayActive = new Map<string, Set<string>>(); // day -> academyId set
  const dayCat = new Map<string, Record<ActivityCategory, number>>();
  const dayTotal = new Map<string, number>();
  for (const row of matrix) {
    if (!dayActive.has(row.day)) dayActive.set(row.day, new Set());
    dayActive.get(row.day)!.add(row.academyId);
    if (!dayCat.has(row.day)) {
      dayCat.set(row.day, {
        EXTRACTION: 0,
        AI_GENERATION: 0,
        CONTENT: 0,
        EXPORT: 0,
        PAGE_VIEW: 0,
        AUTH: 0,
      });
    }
    const cat = row.category as ActivityCategory;
    if (ALL_CATEGORIES.includes(cat)) dayCat.get(row.day)![cat] += row.cnt;
    dayTotal.set(row.day, (dayTotal.get(row.day) ?? 0) + row.cnt);
  }
  const daily: DailyPoint[] = eachDay(fromKst, todayKst).map((date) => ({
    date,
    activeAcademies: dayActive.get(date)?.size ?? 0,
    events: dayTotal.get(date) ?? 0,
    byCategory:
      dayCat.get(date) ??
      ({
        EXTRACTION: 0,
        AI_GENERATION: 0,
        CONTENT: 0,
        EXPORT: 0,
        PAGE_VIEW: 0,
        AUTH: 0,
      } as Record<ActivityCategory, number>),
  }));

  // ── 가입 코호트 (주별) ──
  const cohortMap = new Map<
    string,
    { signups: number; activated: number; within7d: number }
  >();
  for (const e of engagement) {
    const wk = mondayOf(kstDayOf(new Date(e.signupAt)));
    const c = cohortMap.get(wk) ?? { signups: 0, activated: 0, within7d: 0 };
    c.signups += 1;
    if (e.firstActivityAt) c.activated += 1;
    if (e.daysToActivate !== null && e.daysToActivate <= 7) c.within7d += 1;
    cohortMap.set(wk, c);
  }
  let cohorts: CohortPoint[] = [...cohortMap.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([weekStart, c]) => {
      const [, m, d] = weekStart.split("-");
      return {
        weekStart,
        label: `${Number(m)}/${Number(d)} 주`,
        signups: c.signups,
        activated: c.activated,
        activatedWithin7d: c.within7d,
        activationRate: c.signups ? c.activated / c.signups : 0,
      };
    });
  const cohortsCapped = cohorts.length > MAX_COHORT_WEEKS;
  if (cohortsCapped) cohorts = cohorts.slice(-MAX_COHORT_WEEKS);

  // ── 연속일 히스토그램 (활성화 학원 대상) ──
  const activated = engagement.filter((e) => e.firstActivityAt);
  const streakBuckets: StreakBucket[] = [
    { label: "끊김", min: 0, count: 0 },
    { label: "1일", min: 1, count: 0 },
    { label: "2일", min: 2, count: 0 },
    { label: "3일", min: 3, count: 0 },
    { label: "4~6일", min: 4, count: 0 },
    { label: "7일+", min: 7, count: 0 },
  ];
  for (const e of activated) {
    const s = e.currentStreak;
    const idx =
      s <= 0 ? 0 : s === 1 ? 1 : s === 2 ? 2 : s === 3 ? 3 : s <= 6 ? 4 : 5;
    streakBuckets[idx].count += 1;
  }

  // ── 세그먼트 분포 ──
  const segCount = new Map<EngagementSegment, number>();
  for (const e of engagement)
    segCount.set(e.segment, (segCount.get(e.segment) ?? 0) + 1);
  const segments: SegmentCount[] = SEGMENT_ORDER.map((segment) => ({
    segment,
    label: SEGMENT_LABELS[segment],
    count: segCount.get(segment) ?? 0,
  }));

  // ── KPI ──
  const activatedCount = activated.length;
  const totalAcademies = engagement.length;
  const activeOn = (cutoff: string) =>
    engagement.filter((e) => {
      const pa = perAcademy.get(e.academyId);
      if (!pa) return false;
      for (const d of pa.activeDays) if (d >= cutoff) return true;
      return false;
    }).length;
  const activeExactly = (day: string) =>
    engagement.filter((e) => perAcademy.get(e.academyId)?.activeDays.has(day))
      .length;

  const kpis: AnalyticsKpis = {
    totalAcademies,
    activatedAcademies: activatedCount,
    signupOnly: totalAcademies - activatedCount,
    activationRate: totalAcademies ? activatedCount / totalAcademies : 0,
    activeToday: activeExactly(todayKst),
    activeYesterday: activeExactly(yesterday),
    activeWeek: activeOn(day7),
    activeMonth: activeOn(day30),
    newAcademies7d: engagement.filter(
      (e) => kstDayOf(new Date(e.signupAt)) >= day7,
    ).length,
    newAcademies30d: engagement.filter(
      (e) => kstDayOf(new Date(e.signupAt)) >= day30,
    ).length,
    streak3plus: activated.filter((e) => e.currentStreak >= 3).length,
    streak7plus: activated.filter((e) => e.currentStreak >= 7).length,
    avgCurrentStreak: activatedCount
      ? activated.reduce((s, e) => s + e.currentStreak, 0) / activatedCount
      : 0,
    dormant: engagement.filter((e) => e.segment === "DORMANT").length,
    medianDaysToActivate: median(
      activated
        .map((e) => e.daysToActivate)
        .filter((d): d is number => d !== null),
    ),
  };

  const dataNotes = [
    "활동 판정은 9개 도메인 소스(추출·생성·콘텐츠·내보내기·로그인·페이지 이동) 유니온 기준입니다.",
    "페이지 이동·로그인 건수는 디렉터 포털에서만 수집됩니다 — 카테고리 구성에서 비중이 낮아도 실제 사용이 적다는 뜻은 아닙니다(학생·튜터 활동은 도메인 작업으로 집계).",
    `MAU·활동일수·인게이지먼트 세그먼트·연속 활동일·14일 추세는 최근 ${matrixDays}일 데이터로 계산됩니다(일별 차트 표시 기간과 별개).`,
    "기능 성공/실패율은 AI 작업(추출·문제/학습지/동형/커스텀 생성)만 추적합니다 — 시험지·지문·내보내기·로그인 등은 단순 카운트입니다.",
    "활성화 퍼널의 '반복·파워'는 최근 30일 기준, '가입·활성화'는 전체 기간 기준입니다.",
    "모든 일자는 한국시간(KST) 기준입니다.",
  ];
  if (cohortsCapped)
    dataNotes.push(`가입 코호트는 최근 ${MAX_COHORT_WEEKS}주만 표시합니다.`);

  return {
    rangeDays,
    todayKst,
    fromKst,
    generatedAt: new Date().toISOString(),
    kpis,
    daily,
    cohorts,
    streakBuckets,
    segments,
    engagement,
    dataNotes,
  };
}
