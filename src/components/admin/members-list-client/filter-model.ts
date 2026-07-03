// 회원 관리 운영 필터 모델 — 상세 필터 축의 상태/초기값/적용개수 계산.
// (UI 는 각 축을 개별 토글 드롭다운으로 노출: filter-dropdown.tsx + members-list-client.tsx)

export type MarketingFilter = "all" | "consented" | "none";
export type SmsFilter = "all" | "excluded" | "included";

export interface OperationalFilters {
  // 구입 기준 필터: "all" | "has"(구입 있음) | "none"(구입 없음) | 상품명(최근 구입 상품 일치)
  purchase: string;
  lowBalance: boolean;
  marketing: MarketingFilter;
  sms: SmsFilter;
  signupFrom: string; // "" | "YYYY-MM-DD"
  signupTo: string;
}

export const INITIAL_OPERATIONAL: OperationalFilters = {
  purchase: "all",
  lowBalance: false,
  marketing: "all",
  sms: "all",
  signupFrom: "",
  signupTo: "",
};

/** 적용된 운영 필터 개수(전체 초기화 노출 판단 등). */
export function countOperational(f: OperationalFilters): number {
  let n = 0;
  if (f.purchase !== "all") n += 1;
  if (f.lowBalance) n += 1;
  if (f.marketing !== "all") n += 1;
  if (f.sms !== "all") n += 1;
  if (f.signupFrom || f.signupTo) n += 1;
  return n;
}
