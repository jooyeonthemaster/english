import type { StatusMap } from "./tone";

// 마케팅·성장 도메인 라벨.

/** Referral.status */
export const REFERRAL_STATUS: StatusMap = {
  GRANTED: { label: "지급 완료", tone: "emerald" },
  APPROVED: { label: "승인 지급", tone: "emerald" },
  HELD: { label: "보류", tone: "amber" },
  REJECTED: { label: "반려", tone: "gray" },
  CLAWED_BACK: { label: "회수됨", tone: "rose" },
  // 위 5개 밖의 원본 status 를 서버가 접어 넣는 내부 값(A5-4). 키가 없으면 화면에
  // 영문 "UNKNOWN" 이 그대로 새므로 레지스트리에서 한국어로 못 박는다.
  UNKNOWN: { label: "미분류", tone: "gray" },
};
