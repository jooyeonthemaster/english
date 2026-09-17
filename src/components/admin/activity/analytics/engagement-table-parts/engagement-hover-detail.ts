import { detailFields, type AdminDetail } from "@/lib/admin-detail-types";
import {
  PLAN_TIER_LABELS,
  SEGMENT_LABELS,
  type AcademyEngagement,
  type PlanTier,
} from "@/lib/admin-analytics-types";
import {
  ACADEMY_STATUS,
  PLAN_TIER,
  SUBSCRIPTION_STATUS,
  labelOf,
  statusOf,
  type StatusMap,
  type StatusMeta,
} from "@/lib/admin-labels";
import { formatDateTime, formatNumber } from "@/lib/utils";

// 학원 인게이지먼트 행 → 호버 상세. 분석 페이로드에 이미 실려 온 값만 쓴다(추가 조회 없음).
// 리더보드·학원별 테이블이 공유한다. 표에 안 보이는 값(첫 활동·30일 활동일·최장 연속 등)을 앞에 둔다.
// 학원·구독·요금제 라벨은 레지스트리(admin-labels)에서만 가져온다.

/** 인게이지먼트 세그먼트(분석 전용) — 차트 색(SEGMENT_COLORS)과 같은 계열의 색조 */
export const ENGAGEMENT_SEGMENT: StatusMap = {
  POWER: { label: SEGMENT_LABELS.POWER, tone: "violet" },
  REGULAR: { label: SEGMENT_LABELS.REGULAR, tone: "emerald" },
  LIGHT: { label: SEGMENT_LABELS.LIGHT, tone: "sky" },
  NEW: { label: SEGMENT_LABELS.NEW, tone: "blue" },
  DORMANT: { label: SEGMENT_LABELS.DORMANT, tone: "gray" },
  SIGNUP_ONLY: { label: SEGMENT_LABELS.SIGNUP_ONLY, tone: "gray" },
};

/** 요금제 등급 뱃지 — 레지스트리(PLAN_TIER)에 없는 NONE(미구독)은 회색 */
export function planTierMeta(tier: PlanTier): StatusMeta {
  return statusOf(PLAN_TIER, tier, { label: PLAN_TIER_LABELS.NONE, tone: "gray" });
}

const dt = (iso: string | null) => (iso ? formatDateTime(iso) : null);

export function engagementRowDetail(row: AcademyEngagement): AdminDetail {
  const plan = planTierMeta(row.planTier).label;
  const planStatus = row.planStatus ? labelOf(SUBSCRIPTION_STATUS, row.planStatus) : null;
  const recent14 = row.sparkline.reduce((s, n) => s + n, 0);
  const activeDays14 = row.sparkline.filter((n) => n > 0).length;

  return {
    title: row.academyName || "이름 없음",
    subtitle: `${SEGMENT_LABELS[row.segment]} · ${plan}${planStatus ? ` (${planStatus})` : ""}`,
    fields: detailFields([
      ["첫 활동", dt(row.firstActivityAt) ?? "활동 없음"],
      ["최근 활동", dt(row.lastActivityAt)],
      ["최근 30일 활동일", `${formatNumber(row.activeDays30)}일`],
      ["현재 / 최장 연속", `${row.currentStreak}일 / ${row.longestStreak}일`],
      [
        "가입 → 첫 활동",
        row.daysToActivate === null ? "미활성" : `${formatNumber(row.daysToActivate)}일`,
      ],
      ["가입일", `${formatDateTime(row.signupAt)} (${formatNumber(row.daysSinceSignup)}일차)`],
      ["최근 14일", `${formatNumber(recent14)}건 · ${activeDays14}일 활동`],
      ["구독", planStatus ? `${plan} · ${planStatus}` : plan],
      ["계정 상태", labelOf(ACADEMY_STATUS, row.academyStatus)],
      ["총 활동 / 최근 7일", `${formatNumber(row.totalEvents)}건 / ${formatNumber(row.events7)}건`],
    ]),
  };
}
