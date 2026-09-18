// 회원·학원 목록의 리사이즈 가능한 데이터 컬럼 정의(체크박스/화살표 열은 고정).
// 회원별·학원별 두 보기의 컬럼을 하나의 너비 맵(colWidths)으로 관리한다.

import type { MemberSortKey } from "@/actions/admin-members";

export type ColumnId =
  // 회원별 보기
  | "name"
  | "academyName"
  | "plan"
  | "balance"
  | "expiresAt"
  | "createdAt"
  | "lastActiveAt"
  | "sms"
  // 학원별 보기
  | "acaName"
  | "acaMembers"
  | "acaPlan"
  | "acaBalance"
  | "acaExpiry";

export interface ResizableColumnDef {
  id: ColumnId;
  label: string;
  sortKey: MemberSortKey;
  defaultWidth: number;
  /** 좁은 화면에서 숨기는 반응형 클래스 */
  responsive?: string;
  align?: "right";
}

export const COLUMN_DEFS: ResizableColumnDef[] = [
  { id: "name", label: "회원", sortKey: "name", defaultWidth: 240 },
  { id: "academyName", label: "학원", sortKey: "academyName", defaultWidth: 200, responsive: "hidden xl:table-cell" },
  { id: "plan", label: "최근 구입 상품", sortKey: "plan", defaultWidth: 180 },
  { id: "balance", label: "크레딧", sortKey: "balance", defaultWidth: 120, align: "right" },
  { id: "expiresAt", label: "소멸시효", sortKey: "expiresAt", defaultWidth: 140 },
  { id: "createdAt", label: "가입일", sortKey: "createdAt", defaultWidth: 120, responsive: "hidden xl:table-cell" },
  { id: "lastActiveAt", label: "최근 활동", sortKey: "lastActiveAt", defaultWidth: 130, responsive: "hidden 2xl:table-cell" },
  { id: "sms", label: "문자", sortKey: "sms", defaultWidth: 96, responsive: "hidden lg:table-cell" },
];

// 학원별 보기 컬럼. sortKey는 회원 정렬 파이프라인(sorted)을 재사용한다:
// academyName/name/plan/balance/expiresAt로 정렬하면 그룹 순서가 그대로 따라온다.
export const ACADEMY_COLUMN_DEFS: ResizableColumnDef[] = [
  { id: "acaName", label: "학원", sortKey: "academyName", defaultWidth: 280 },
  { id: "acaMembers", label: "소속 회원", sortKey: "name", defaultWidth: 280 },
  { id: "acaPlan", label: "최근 구입 상품", sortKey: "plan", defaultWidth: 180 },
  { id: "acaBalance", label: "크레딧", sortKey: "balance", defaultWidth: 120, align: "right" },
  { id: "acaExpiry", label: "소멸시효", sortKey: "expiresAt", defaultWidth: 140 },
];

export const ALL_COLUMN_DEFS = [...COLUMN_DEFS, ...ACADEMY_COLUMN_DEFS];

export const COLUMN_WIDTH_STORAGE_KEY = "admin.members.columnWidths.v1";
// 드래그로 줄일 수 있는 하한(핸들·아이콘이 눌릴 최소 폭). 이보다 아래로는 표가
// 깨지므로 막는다. 상한은 넉넉히 둔다.
export const MIN_COLUMN_WIDTH = 48;
export const MAX_COLUMN_WIDTH = 1200;

export type ColumnWidths = Record<ColumnId, number>;

export const DEFAULT_COLUMN_WIDTHS = Object.fromEntries(
  ALL_COLUMN_DEFS.map((c) => [c.id, c.defaultWidth]),
) as ColumnWidths;
