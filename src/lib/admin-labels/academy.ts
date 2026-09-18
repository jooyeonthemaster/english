import type { StatusMap } from "./tone";

// 학원·회원 도메인 라벨. 화면마다 따로 두던 맵(8곳)을 여기로 모은다.

/** Academy.status */
export const ACADEMY_STATUS: StatusMap = {
  ACTIVE: { label: "활성", tone: "emerald" },
  TRIAL: { label: "체험", tone: "blue" },
  SUSPENDED: { label: "정지", tone: "rose" },
  DEACTIVATED: { label: "비활성", tone: "gray" },
};

/** AcademySubscription.status */
export const SUBSCRIPTION_STATUS: StatusMap = {
  TRIAL: { label: "체험", tone: "blue" },
  ACTIVE: { label: "이용 중", tone: "emerald" },
  PAST_DUE: { label: "연체", tone: "amber" },
  CANCELLED: { label: "해지", tone: "gray" },
  SUSPENDED: { label: "중단", tone: "rose" },
};

/** SubscriptionPlan.tier */
export const PLAN_TIER: StatusMap = {
  STARTER: { label: "스타터", tone: "gray" },
  STANDARD: { label: "스탠다드", tone: "blue" },
  PREMIUM: { label: "프리미엄", tone: "violet" },
  ENTERPRISE: { label: "엔터프라이즈", tone: "amber" },
};

/** Staff.role */
export const STAFF_ROLE: StatusMap = {
  DIRECTOR: { label: "원장", tone: "blue" },
  TEACHER: { label: "강사", tone: "gray" },
};

/** Staff.authProvider — 가입 경로 */
export const AUTH_PROVIDER: StatusMap = {
  google: { label: "Google", tone: "gray" },
  kakao: { label: "Kakao", tone: "amber" },
  credentials: { label: "이메일", tone: "gray" },
};

/** 노출·활성 플래그 공통 표기 */
export function activeFlag(active: boolean, labels: [on: string, off: string] = ["노출 중", "미노출"]) {
  return active
    ? { label: labels[0], tone: "emerald" as const }
    : { label: labels[1], tone: "gray" as const };
}
