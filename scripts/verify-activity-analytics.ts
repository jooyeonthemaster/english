// 활동 분석 compute 로직 런타임 검증 (DB 불필요, 합성 데이터).
// 실행: npx tsx scripts/verify-activity-analytics.ts
// _compute 는 _query 를 `import type` 로만 참조하므로 prisma 가 로드되지 않는다.

import { computeAnalytics } from "../src/actions/admin-activity/analytics/_compute";
import { computeExtras } from "../src/actions/admin-activity/analytics/_compute-extra";
import type {
  BoundsRow,
  DirectoryRow,
  MatrixRow,
} from "../src/actions/admin-activity/analytics/_query";

const todayKst = "2026-06-18";
const D = (s: string) => new Date(`${s}T03:00:00Z`); // KST 정오 근처 (일자 보존)

function matrixDays(academyId: string, days: string[], cat = "EXTRACTION"): MatrixRow[] {
  return days.map((day) => ({ academyId, day, category: cat, cnt: 1 }));
}

// A1 꾸준→휴면: 최근 7일엔 활동 없음, 17일 전 마지막 활동 (MAU엔 잡히고 WAU엔 안 잡혀야)
// A2 가입만: 활동 0 (bounds/matrix 없음)
// A3 연속: 06-14~06-18 5일 연속 (오늘 포함)
const directory: DirectoryRow[] = [
  { academyId: "A1", name: "꾸준학원", status: "ACTIVE", signupAt: D("2026-04-01"), planTier: "STANDARD", planStatus: "ACTIVE" },
  { academyId: "A2", name: "가입만학원", status: "TRIAL", signupAt: D("2026-06-15"), planTier: "NONE", planStatus: null },
  { academyId: "A3", name: "연속학원", status: "ACTIVE", signupAt: D("2026-05-01"), planTier: "PREMIUM", planStatus: "ACTIVE" },
];

const bounds: BoundsRow[] = [
  { academyId: "A1", firstAt: D("2026-04-03"), lastAt: D("2026-06-01"), total: 30 },
  { academyId: "A3", firstAt: D("2026-05-02"), lastAt: D("2026-06-18"), total: 20 },
];

const matrix: MatrixRow[] = [
  ...matrixDays("A1", ["2026-05-25", "2026-06-01"]), // 둘 다 7일보다 과거, 30일 내
  ...matrixDays("A3", ["2026-06-14", "2026-06-15", "2026-06-16", "2026-06-17", "2026-06-18"]),
];

const out = computeAnalytics({
  matrix,
  bounds,
  directory,
  todayKst,
  rangeDays: 30,
  matrixDays: 30,
});

let pass = 0;
let fail = 0;
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "✓" : "✗"} ${name}: got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}

const a3 = out.engagement.find((e) => e.academyId === "A3")!;
const a1 = out.engagement.find((e) => e.academyId === "A1")!;
const a2 = out.engagement.find((e) => e.academyId === "A2")!;

check("총 학원", out.kpis.totalAcademies, 3);
check("활성화 학원", out.kpis.activatedAcademies, 2);
check("가입만", out.kpis.signupOnly, 1);
check("A3 현재 연속일=5", a3.currentStreak, 5);
check("A3 streak3plus 포함 → streak3plus>=1", out.kpis.streak3plus >= 1, true);
check("MAU(2) > WAU(1) [기간결합 버그 수정 검증]", out.kpis.activeMonth > out.kpis.activeWeek, true);
check("activeMonth=2", out.kpis.activeMonth, 2);
check("activeWeek=1", out.kpis.activeWeek, 1);
check("activeToday=1 (A3만)", out.kpis.activeToday, 1);
check("A1 휴면(DORMANT)", a1.segment, "DORMANT");
check("A2 가입만(SIGNUP_ONLY)", a2.segment, "SIGNUP_ONLY");
check("A3 활동일30=5", a3.activeDays30, 5);
check("A3 세그먼트 REGULAR", a3.segment, "REGULAR");
check("A2 firstActivity null", a2.firstActivityAt, null);
check("daily 길이=30(rangeDays)", out.daily.length, 30);
check("A3 sparkline 길이=14", a3.sparkline.length, 14);
check("A3 sparkline 합=5", a3.sparkline.reduce((s, v) => s + v, 0), 5);
check("코호트 활성화율 0~1", out.cohorts.every((c) => c.activationRate >= 0 && c.activationRate <= 1), true);

// ── 확장(computeExtras) 검증 ──
const ex = computeExtras({
  todayKst,
  rangeDays: 30,
  featureDaily: [
    { feature: "EXTRACTION", day: "2026-06-18", cnt: 3 },
    { feature: "QUESTION_GEN", day: "2026-06-17", cnt: 2 },
  ],
  featureAdoption: [
    { feature: "EXTRACTION", academies: 2, total: 30 },
    { feature: "EXAM", academies: 1, total: 5 },
  ],
  featureOutcomes: [
    { feature: "EXTRACTION", status: "SUCCESS", cnt: 25 },
    { feature: "EXTRACTION", status: "FAILED", cnt: 5 },
  ],
  hourWeekday: [{ weekday: 1, hour: 14, cnt: 10 }],
  signups: { daily: [{ day: "2026-06-18", cnt: 2 }, { day: "2026-06-10", cnt: 1 }], baseline: 10 },
  directory,
  engagement: out.engagement,
});

const extDailyLast = ex.featureDaily[ex.featureDaily.length - 1];
const extExtraction = ex.featureAdoption.find((a) => a.feature === "EXTRACTION")!;
const extOutcome = ex.featureOutcomes.find((o) => o.feature === "EXTRACTION")!;
const extSignupLast = ex.signupsDaily[ex.signupsDaily.length - 1];

check("featureDaily 길이=30", ex.featureDaily.length, 30);
check("featureDaily 마지막일 EXTRACTION=3", extDailyLast.byFeature.EXTRACTION, 3);
check("featureAdoption 전체 기능 12개", ex.featureAdoption.length, 12);
check("EXTRACTION 채택 학원=2", extExtraction.academies, 2);
check("featureOutcomes 잡 기능 6개", ex.featureOutcomes.length, 6);
check("EXTRACTION 성공25/실패5", [extOutcome.success, extOutcome.failed], [25, 5]);
check("hourWeekday 7x24=168칸", ex.hourWeekday.length, 168);
check("signups 누적 마지막=13 (baseline10+1+2)", extSignupLast.cumulative, 13);
check("signups 마지막일 신규=2", extSignupLast.signups, 2);
check("funnel 4단계·1단계 가입=3", [ex.funnel.length, ex.funnel[0].label, ex.funnel[0].count], [4, "가입", 3]);
check("funnel 단조감소", ex.funnel.every((s, i) => i === 0 || s.count <= ex.funnel[i - 1].count), true);
check("planDistribution 합=3", ex.planDistribution.reduce((s, p) => s + p.count, 0), 3);
check("statusDistribution 합=3", ex.statusDistribution.reduce((s, p) => s + p.count, 0), 3);

console.log(`\n결과: ${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
