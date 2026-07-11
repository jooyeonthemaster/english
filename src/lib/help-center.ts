// ============================================================================
// 헬프센터 공통 상수 — 카테고리 / 상태 / 채널 (director · admin 공유)
// 색상 className은 게시판 상태 뱃지에 그대로 쓰인다(공지/뱃지 톤과 통일).
// ============================================================================

export type HelpBoard = "FEEDBACK" | "SUPPORT";

export interface LabeledOption {
  value: string;
  label: string;
}

export interface StatusOption extends LabeledOption {
  /** 뱃지용 Tailwind 색상 클래스 */
  className: string;
}

// ─── 카테고리 ────────────────────────────────────────────────────────────────

export const FEEDBACK_CATEGORIES: readonly LabeledOption[] = [
  { value: "FEATURE", label: "기능 개선" },
  { value: "BUG", label: "버그 신고" },
  { value: "UIUX", label: "UI·UX" },
  { value: "ETC", label: "기타" },
] as const;

export const SUPPORT_CATEGORIES: readonly LabeledOption[] = [
  { value: "BILLING", label: "결제·환불" },
  { value: "ACCOUNT", label: "계정·로그인" },
  { value: "ERROR", label: "오류·버그" },
  { value: "USAGE", label: "사용법 문의" },
  { value: "ETC", label: "기타" },
] as const;

// ─── 상태 ───────────────────────────────────────────────────────────────────

const NEUTRAL = "bg-slate-50 text-slate-600 border-slate-200";
const BLUE = "bg-blue-50 text-blue-700 border-blue-200";
const AMBER = "bg-amber-50 text-amber-700 border-amber-200";
const VIOLET = "bg-violet-50 text-violet-700 border-violet-200";
const EMERALD = "bg-emerald-50 text-emerald-700 border-emerald-200";
const ROSE = "bg-rose-50 text-rose-700 border-rose-200";

export const FEEDBACK_STATUSES: readonly StatusOption[] = [
  { value: "OPEN", label: "접수", className: NEUTRAL },
  { value: "REVIEWING", label: "검토중", className: BLUE },
  { value: "PLANNED", label: "반영예정", className: VIOLET },
  { value: "DONE", label: "반영완료", className: EMERALD },
  { value: "WONT_DO", label: "반려", className: ROSE },
] as const;

export const SUPPORT_STATUSES: readonly StatusOption[] = [
  { value: "OPEN", label: "접수", className: NEUTRAL },
  { value: "IN_PROGRESS", label: "처리중", className: AMBER },
  { value: "ANSWERED", label: "답변완료", className: EMERALD },
  { value: "CLOSED", label: "종료", className: NEUTRAL },
] as const;

export const SEMINAR_STATUSES: readonly StatusOption[] = [
  { value: "RECEIVED", label: "접수", className: NEUTRAL },
  { value: "CONTACTED", label: "연락완료", className: BLUE },
  { value: "SCHEDULED", label: "예약확정", className: VIOLET },
  { value: "DONE", label: "완료", className: EMERALD },
  { value: "CANCELED", label: "취소", className: ROSE },
] as const;

// 단체 세미나 클래스(운영자 개설)의 공개 상태.
export const GROUP_SEMINAR_STATUSES: readonly StatusOption[] = [
  { value: "DRAFT", label: "작성중", className: NEUTRAL },
  { value: "OPEN", label: "모집중", className: BLUE },
  { value: "CLOSED", label: "모집마감", className: AMBER },
  { value: "ENDED", label: "종료", className: EMERALD },
  { value: "CANCELED", label: "취소", className: ROSE },
] as const;

// 단체 세미나 신청(원장)의 상태.
export const GROUP_SEMINAR_REG_STATUSES: readonly StatusOption[] = [
  { value: "REGISTERED", label: "신청완료", className: BLUE },
  { value: "ATTENDED", label: "참석완료", className: EMERALD },
  { value: "CANCELED", label: "취소", className: ROSE },
] as const;

// ─── 세미나 신청 폼 옵션 ──────────────────────────────────────────────────────

export const SEMINAR_CHANNELS: readonly LabeledOption[] = [
  { value: "PHONE", label: "전화" },
  { value: "KAKAO", label: "카카오 오픈채팅" },
  { value: "EITHER", label: "무관" },
] as const;

export const SEMINAR_TIME_SLOTS: readonly string[] = [
  "평일 오전",
  "평일 오후",
  "평일 저녁",
  "주말 오전",
  "주말 오후",
] as const;

/** 1:1 세미나 주간 상담 슬롯 정원 — 히어로의 "남은 상담 슬롯" 표시에 사용 */
export const SEMINAR_WEEKLY_CAPACITY = 10;

export const SEMINAR_TOPICS: readonly string[] = [
  "문제 생성",
  "시험지 생성",
  "학습지 생성",
  "자료 추출",
  "전반 사용법",
  "기타",
] as const;

// ─── 단체 세미나 딥링크 ───────────────────────────────────────────────────────
// QR·공유 링크가 수렴하는 원장용 경로. 목록 페이지에서 seminar 쿼리로 해당 글을
// 자동 스크롤·강조한다. (server: 로그인 콜백 구성, client: QR URL 생성 공용)

export const GROUP_SEMINAR_BROWSE_PATH = "/director/help/group-seminar";

export function groupSeminarBrowseLink(seminarId: string): string {
  return `${GROUP_SEMINAR_BROWSE_PATH}?seminar=${encodeURIComponent(seminarId)}`;
}

// ─── 조회 헬퍼 ───────────────────────────────────────────────────────────────

export function boardCategories(board: HelpBoard): readonly LabeledOption[] {
  return board === "FEEDBACK" ? FEEDBACK_CATEGORIES : SUPPORT_CATEGORIES;
}

export function boardStatuses(board: HelpBoard): readonly StatusOption[] {
  return board === "FEEDBACK" ? FEEDBACK_STATUSES : SUPPORT_STATUSES;
}

export function labelOf(options: readonly LabeledOption[], value: string): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

export function statusOf(
  options: readonly StatusOption[],
  value: string,
): StatusOption {
  return options.find((o) => o.value === value) ?? { value, label: value, className: NEUTRAL };
}

export const HELP_BOARD_META: Record<
  HelpBoard,
  { title: string; subtitle: string; path: string; adminPath: string }
> = {
  FEEDBACK: {
    title: "피드백 게시판",
    subtitle: "서비스 개선 의견과 요청 사항을 남겨 주세요",
    path: "/director/help/feedback",
    adminPath: "/admin/feedback",
  },
  SUPPORT: {
    title: "문의 게시판",
    subtitle: "결제·이용 중 불편한 점이나 문제를 문의하세요",
    path: "/director/help/support",
    adminPath: "/admin/support",
  },
};
