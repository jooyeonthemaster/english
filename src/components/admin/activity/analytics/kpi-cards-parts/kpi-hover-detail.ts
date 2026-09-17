import type { AdminDetail, AdminDetailColumn } from "@/lib/admin-detail-types";
import {
  PLAN_TIER_LABELS,
  SEGMENT_LABELS,
  type AcademyEngagement,
  type AnalyticsKpis,
  type EngagementSegment,
} from "@/lib/admin-analytics-types";
import { formatDate, formatNumber } from "@/lib/utils";

// 분석 KPI 카드 → 상세. 카드 숫자와 "같은 기준"으로, 이미 받은 학원별 인게이지먼트 행에서
// 해당 학원 목록을 다시 골라낸다(추가 조회 없음). 기준은 _compute.ts 의 kpis 계산과 1:1 대응:
//   오늘/어제 활동 = 스파크라인 마지막/직전 칸(>0), 최근 7일 = 스파크라인 마지막 7칸,
//   최근 30일 = activeDays30>0, 신규 7/30일 = daysSinceSignup ≤ 6/29, 활성화 = firstActivityAt 있음.

export type KpiDetailKey =
  | "activationRate"
  | "activeToday"
  | "signupOnly"
  | "streak3plus"
  | "activeWeek"
  | "activeMonth"
  | "newAcademies"
  | "dormant"
  | "avgStreak"
  | "medianActivate";

type Row = Record<string, string>;

const name = (e: AcademyEngagement) => e.academyName || "이름 없음";
const day = (iso: string | null) => (iso ? formatDate(iso) : "—");
const n = (v: number) => formatNumber(v);
const plan = (e: AcademyEngagement) => PLAN_TIER_LABELS[e.planTier];
const isActivated = (e: AcademyEngagement) => Boolean(e.firstActivityAt);
const today = (e: AcademyEngagement) => e.sparkline[e.sparkline.length - 1] ?? 0;
const yesterday = (e: AcademyEngagement) => e.sparkline[e.sparkline.length - 2] ?? 0;
const last7 = (e: AcademyEngagement) => e.sparkline.slice(-7);
const byTimeDesc = (pick: (e: AcademyEngagement) => string | null) =>
  (a: AcademyEngagement, b: AcademyEngagement) =>
    (pick(b) ?? "").localeCompare(pick(a) ?? "");

const COL = {
  academy: { key: "academy", label: "학원", wide: true },
  plan: { key: "plan", label: "플랜" },
  segment: { key: "segment", label: "세그먼트" },
  signup: { key: "signup", label: "가입일" },
  last: { key: "last", label: "최근 활동" },
} satisfies Record<string, AdminDetailColumn>;

function segmentRows(rows: AcademyEngagement[]): Row[] {
  const counts = new Map<EngagementSegment, number>();
  for (const e of rows) counts.set(e.segment, (counts.get(e.segment) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([seg, count]) => ({
      segment: SEGMENT_LABELS[seg],
      count: `${n(count)}곳`,
      share: rows.length ? `${Math.round((count / rows.length) * 100)}%` : "—",
    }));
}

const SEGMENT_SECTION_COLUMNS: AdminDetailColumn[] = [
  { key: "segment", label: "세그먼트" },
  { key: "count", label: "학원 수", align: "right" },
  { key: "share", label: "비중", align: "right" },
];

/** 값 → 버킷 라벨 목록으로 분포 행을 만든다(0곳 버킷도 표시). */
function bucketRows(values: number[], buckets: Array<{ label: string; test: (v: number) => boolean }>): Row[] {
  return buckets.map((b) => {
    const count = values.filter(b.test).length;
    return {
      bucket: b.label,
      count: `${n(count)}곳`,
      share: values.length ? `${Math.round((count / values.length) * 100)}%` : "—",
    };
  });
}

const BUCKET_COLUMNS: AdminDetailColumn[] = [
  { key: "bucket", label: "구간" },
  { key: "count", label: "학원 수", align: "right" },
  { key: "share", label: "비중", align: "right" },
];

export function buildKpiDetail(
  key: KpiDetailKey,
  kpis: AnalyticsKpis,
  rows: AcademyEngagement[],
): AdminDetail {
  const activated = rows.filter(isActivated);

  switch (key) {
    case "activationRate": {
      const list = [...activated].sort(byTimeDesc((e) => e.firstActivityAt));
      return {
        title: "활성화율",
        subtitle: "가입 후 한 번이라도 활동(추출·생성·콘텐츠·내보내기·로그인·페이지 이동)한 학원 ÷ 전체 가입 학원",
        summary: [
          { label: "전체 학원", value: `${n(kpis.totalAcademies)}곳` },
          { label: "활성화", value: `${n(kpis.activatedAcademies)}곳` },
          { label: "가입만", value: `${n(kpis.signupOnly)}곳` },
        ],
        sections: [
          {
            title: "최근 활성화된 학원",
            columns: [COL.academy, { key: "first", label: "첫 활동" }, { key: "days", label: "소요", align: "right" }, COL.segment],
            rows: list.map((e) => ({
              academy: name(e),
              first: day(e.firstActivityAt),
              days: e.daysToActivate === null ? "—" : `${n(e.daysToActivate)}일`,
              segment: SEGMENT_LABELS[e.segment],
            })),
            emptyText: "활성화된 학원이 없습니다",
          },
          { title: "전체 세그먼트 구성", columns: SEGMENT_SECTION_COLUMNS, rows: segmentRows(rows) },
        ],
      };
    }

    case "activeToday": {
      const list = rows.filter((e) => today(e) > 0).sort((a, b) => today(b) - today(a));
      const lapsed = rows.filter((e) => today(e) === 0 && yesterday(e) > 0);
      return {
        title: "오늘 활동 학원",
        subtitle: "오늘(KST 0시 이후) 활동이 1건 이상 기록된 학원 수. 증감은 어제 활동 학원 수와 비교",
        summary: [
          { label: "오늘", value: `${n(kpis.activeToday)}곳` },
          { label: "어제", value: `${n(kpis.activeYesterday)}곳` },
          { label: "어제만 활동", value: `${n(lapsed.length)}곳` },
        ],
        sections: [
          {
            title: "오늘 활동한 학원",
            columns: [COL.academy, { key: "today", label: "오늘", align: "right" }, { key: "yesterday", label: "어제", align: "right" }, { key: "streak", label: "연속", align: "right" }, COL.plan],
            rows: list.map((e) => ({
              academy: name(e),
              today: `${n(today(e))}건`,
              yesterday: `${n(yesterday(e))}건`,
              streak: `${e.currentStreak}일`,
              plan: plan(e),
            })),
            emptyText: "오늘 활동한 학원이 없습니다",
          },
          {
            title: "어제는 활동했지만 오늘은 아직 없음",
            columns: [COL.academy, { key: "yesterday", label: "어제", align: "right" }, { key: "streak", label: "연속", align: "right" }, COL.plan],
            rows: lapsed.map((e) => ({
              academy: name(e),
              yesterday: `${n(yesterday(e))}건`,
              streak: `${e.currentStreak}일`,
              plan: plan(e),
            })),
            emptyText: "해당 학원이 없습니다",
          },
        ],
      };
    }

    case "signupOnly": {
      const list = rows.filter((e) => !isActivated(e)).sort(byTimeDesc((e) => e.signupAt));
      return {
        title: "가입만 한 학원",
        subtitle: "가입 후 활동이 한 건도 없는 학원(최근 가입 순). 온보딩 연락 대상",
        summary: [
          { label: "가입만", value: `${n(kpis.signupOnly)}곳` },
          { label: "7일 이내 가입", value: `${n(list.filter((e) => e.daysSinceSignup <= 6).length)}곳` },
          { label: "구독 중", value: `${n(list.filter((e) => e.planTier !== "NONE").length)}곳` },
        ],
        sections: [
          {
            columns: [COL.academy, COL.signup, { key: "age", label: "경과", align: "right" }, COL.plan],
            rows: list.map((e) => ({
              academy: name(e),
              signup: day(e.signupAt),
              age: `${n(e.daysSinceSignup)}일차`,
              plan: plan(e),
            })),
            emptyText: "가입만 한 학원이 없습니다",
          },
        ],
      };
    }

    case "streak3plus": {
      const list = activated.filter((e) => e.currentStreak >= 3).sort((a, b) => b.currentStreak - a.currentStreak);
      return {
        title: "3일+ 연속 활동",
        subtitle: "오늘 또는 어제까지 끊기지 않고 3일 이상 매일 활동한 학원(KST 일자 기준)",
        summary: [
          { label: "3일+", value: `${n(kpis.streak3plus)}곳` },
          { label: "7일+", value: `${n(kpis.streak7plus)}곳` },
        ],
        sections: [
          {
            columns: [COL.academy, { key: "streak", label: "현재 연속", align: "right" }, { key: "longest", label: "최장", align: "right" }, { key: "days30", label: "30일 활동일", align: "right" }, { key: "today", label: "오늘", align: "right" }],
            rows: list.map((e) => ({
              academy: name(e),
              streak: `${e.currentStreak}일`,
              longest: `${e.longestStreak}일`,
              days30: `${e.activeDays30}일`,
              today: today(e) > 0 ? `${n(today(e))}건` : "아직 없음",
            })),
            emptyText: "3일 이상 연속 활동 중인 학원이 없습니다",
          },
        ],
      };
    }

    case "activeWeek": {
      const list = rows
        .filter((e) => last7(e).some((c) => c > 0))
        .sort((a, b) => b.events7 - a.events7);
      return {
        title: "주간 활동 학원 (WAU)",
        subtitle: "오늘 포함 최근 7일(KST) 중 하루라도 활동한 학원 수",
        summary: [
          { label: "WAU", value: `${n(kpis.activeWeek)}곳` },
          { label: "MAU 대비", value: kpis.activeMonth ? `${Math.round((kpis.activeWeek / kpis.activeMonth) * 100)}%` : "—" },
        ],
        sections: [
          {
            columns: [COL.academy, { key: "days", label: "활동일(7일)", align: "right" }, { key: "events", label: "건수(7일)", align: "right" }, COL.last, COL.segment],
            rows: list.map((e) => ({
              academy: name(e),
              days: `${last7(e).filter((c) => c > 0).length}일`,
              events: `${n(e.events7)}건`,
              last: day(e.lastActivityAt),
              segment: SEGMENT_LABELS[e.segment],
            })),
            emptyText: "최근 7일 활동한 학원이 없습니다",
          },
        ],
      };
    }

    case "activeMonth": {
      const list = rows.filter((e) => e.activeDays30 > 0).sort((a, b) => b.activeDays30 - a.activeDays30);
      return {
        title: "월간 활동 학원 (MAU)",
        subtitle: "오늘 포함 최근 30일(KST) 중 하루라도 활동한 학원 수. 활동일 많은 순",
        summary: [
          { label: "MAU", value: `${n(kpis.activeMonth)}곳` },
          { label: "전체 대비", value: kpis.totalAcademies ? `${Math.round((kpis.activeMonth / kpis.totalAcademies) * 100)}%` : "—" },
        ],
        sections: [
          {
            columns: [COL.academy, { key: "days30", label: "30일 활동일", align: "right" }, { key: "events7", label: "최근 7일", align: "right" }, COL.last, COL.segment],
            rows: list.map((e) => ({
              academy: name(e),
              days30: `${e.activeDays30}일`,
              events7: `${n(e.events7)}건`,
              last: day(e.lastActivityAt),
              segment: SEGMENT_LABELS[e.segment],
            })),
            emptyText: "최근 30일 활동한 학원이 없습니다",
          },
          { title: "MAU 세그먼트 구성", columns: SEGMENT_SECTION_COLUMNS, rows: segmentRows(list) },
        ],
      };
    }

    case "newAcademies": {
      const list = rows.filter((e) => e.daysSinceSignup <= 29).sort(byTimeDesc((e) => e.signupAt));
      const in7 = list.filter((e) => e.daysSinceSignup <= 6);
      return {
        title: "신규 가입 학원",
        subtitle: "오늘 포함 최근 7일 / 30일(KST 가입일 기준) 안에 가입한 학원. 최근 가입 순",
        summary: [
          { label: "7일", value: `${n(kpis.newAcademies7d)}곳` },
          { label: "30일", value: `${n(kpis.newAcademies30d)}곳` },
          { label: "30일 중 활성화", value: `${n(list.filter(isActivated).length)}곳` },
        ],
        sections: [
          {
            title: "최근 30일 가입",
            columns: [COL.academy, COL.signup, { key: "first", label: "첫 활동" }, { key: "days", label: "소요", align: "right" }, { key: "in7", label: "7일 내" }],
            rows: list.map((e) => ({
              academy: name(e),
              signup: day(e.signupAt),
              first: e.firstActivityAt ? day(e.firstActivityAt) : "미활성",
              days: e.daysToActivate === null ? "—" : `${n(e.daysToActivate)}일`,
              in7: in7.includes(e) ? "예" : "",
            })),
            emptyText: "최근 30일 가입한 학원이 없습니다",
          },
        ],
      };
    }

    case "dormant": {
      const list = rows.filter((e) => e.segment === "DORMANT").sort(byTimeDesc((e) => e.lastActivityAt));
      return {
        title: "휴면 학원",
        subtitle: "활동 이력은 있지만 마지막 활동 후 14일 이상 활동이 없는 학원(가입 7일 이내 신규는 제외). 최근 이탈 순",
        summary: [
          { label: "휴면", value: `${n(kpis.dormant)}곳` },
          { label: "구독 중 휴면", value: `${n(list.filter((e) => e.planTier !== "NONE").length)}곳` },
        ],
        sections: [
          {
            columns: [COL.academy, COL.last, { key: "total", label: "누적 활동", align: "right" }, { key: "longest", label: "최장 연속", align: "right" }, COL.plan, COL.signup],
            rows: list.map((e) => ({
              academy: name(e),
              last: day(e.lastActivityAt),
              total: `${n(e.totalEvents)}건`,
              longest: `${e.longestStreak}일`,
              plan: plan(e),
              signup: day(e.signupAt),
            })),
            emptyText: "휴면 학원이 없습니다",
          },
        ],
      };
    }

    case "avgStreak": {
      const streaks = activated.map((e) => e.currentStreak);
      const top = [...activated].filter((e) => e.currentStreak > 0).sort((a, b) => b.currentStreak - a.currentStreak);
      return {
        title: "평균 연속일",
        subtitle: "활성화된(활동 이력 있는) 학원의 현재 연속 활동일 평균. 끊긴 학원은 0일로 포함",
        summary: [
          { label: "평균", value: `${kpis.avgCurrentStreak.toFixed(1)}일` },
          { label: "대상", value: `${n(activated.length)}곳` },
          { label: "연속 중", value: `${n(top.length)}곳` },
        ],
        sections: [
          {
            title: "현재 연속일 분포",
            columns: BUCKET_COLUMNS,
            rows: bucketRows(streaks, [
              { label: "끊김(0일)", test: (v) => v <= 0 },
              { label: "1일", test: (v) => v === 1 },
              { label: "2일", test: (v) => v === 2 },
              { label: "3~6일", test: (v) => v >= 3 && v <= 6 },
              { label: "7일+", test: (v) => v >= 7 },
            ]),
          },
          {
            title: "연속 활동 중인 학원",
            columns: [COL.academy, { key: "streak", label: "현재", align: "right" }, { key: "longest", label: "최장", align: "right" }, COL.segment],
            rows: top.map((e) => ({
              academy: name(e),
              streak: `${e.currentStreak}일`,
              longest: `${e.longestStreak}일`,
              segment: SEGMENT_LABELS[e.segment],
            })),
            emptyText: "연속 활동 중인 학원이 없습니다",
          },
        ],
      };
    }

    case "medianActivate": {
      const list = activated
        .filter((e) => e.daysToActivate !== null)
        .sort((a, b) => (b.daysToActivate ?? 0) - (a.daysToActivate ?? 0));
      const values = list.map((e) => e.daysToActivate as number);
      return {
        title: "활성화 소요(중앙값)",
        subtitle: "가입일부터 첫 활동일까지 걸린 일수(KST 일자 차이)의 중앙값. 활성화된 학원만 대상",
        summary: [
          { label: "중앙값", value: kpis.medianDaysToActivate === null ? "—" : `${Math.round(kpis.medianDaysToActivate)}일` },
          { label: "대상", value: `${n(values.length)}곳` },
          { label: "당일 활성화", value: `${n(values.filter((v) => v === 0).length)}곳` },
        ],
        sections: [
          {
            title: "소요일 분포",
            columns: BUCKET_COLUMNS,
            rows: bucketRows(values, [
              { label: "가입 당일", test: (v) => v === 0 },
              { label: "1일", test: (v) => v === 1 },
              { label: "2~3일", test: (v) => v >= 2 && v <= 3 },
              { label: "4~7일", test: (v) => v >= 4 && v <= 7 },
              { label: "8~30일", test: (v) => v >= 8 && v <= 30 },
              { label: "31일+", test: (v) => v >= 31 },
            ]),
          },
          {
            title: "오래 걸린 순",
            columns: [COL.academy, { key: "days", label: "소요", align: "right" }, COL.signup, { key: "first", label: "첫 활동" }],
            rows: list.map((e) => ({
              academy: name(e),
              days: `${n(e.daysToActivate ?? 0)}일`,
              signup: day(e.signupAt),
              first: day(e.firstActivityAt),
            })),
          },
        ],
      };
    }
  }
}
