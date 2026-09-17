import type { StatusMap } from "./tone";

// 마케팅·성장 도메인 라벨.

/** Referral.status */
export const REFERRAL_STATUS: StatusMap = {
  GRANTED: { label: "지급 완료", tone: "emerald" },
  APPROVED: { label: "승인 지급", tone: "emerald" },
  HELD: { label: "보류", tone: "amber" },
  REJECTED: { label: "반려", tone: "gray" },
  CLAWED_BACK: { label: "회수됨", tone: "rose" },
};
