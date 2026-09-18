// 관리자 대시보드 블록 상세 키. 데이터 모델은 관리자 공용(admin-detail-types)을 쓴다.
import type { AdminDetail, AdminDetailColumn, AdminDetailSection } from "@/lib/admin-detail-types";

export { DETAIL_PREVIEW_ROWS } from "@/lib/admin-detail-types";

export type DashboardDetailKey =
  | "deposits"
  | "support"
  | "seminars"
  | "revenue-today"
  | "signups-today"
  | "questions-today"
  | "credits-today"
  | "active-academies"
  | "month-revenue"
  | "month-ai-cost"
  | "month-margin"
  | "errors-today"
  | "trend-day";

export type DashboardDetailColumn = AdminDetailColumn;
export type DashboardDetailSection = AdminDetailSection;
/** 대시보드 상세는 요약·표를 항상 채운다. */
export type DashboardDetail = AdminDetail & {
  summary: NonNullable<AdminDetail["summary"]>;
  sections: AdminDetailSection[];
};
