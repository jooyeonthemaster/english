// ============================================================================
// 관리자 활동 타임라인 — 공유 타입/라벨 (순수 모듈).
// 클라이언트 컴포넌트와 서버 액션이 함께 import하므로 prisma 등 서버 전용
// 의존성을 두지 않는다.
// ============================================================================

export type ActivityCategory =
  | "PAGE_VIEW"
  | "AUTH"
  | "EXTRACTION"
  | "AI_GENERATION"
  | "CONTENT"
  | "EXPORT";

export const ACTIVITY_CATEGORY_LABELS: Record<ActivityCategory, string> = {
  PAGE_VIEW: "페이지 이동",
  AUTH: "로그인",
  EXTRACTION: "자료 추출",
  AI_GENERATION: "AI 생성",
  CONTENT: "콘텐츠 생성",
  EXPORT: "내보내기",
};

export const ACTIVITY_CATEGORY_OPTIONS: Array<{
  value: ActivityCategory | "all";
  label: string;
}> = [
  { value: "all", label: "전체" },
  ...(
    Object.entries(ACTIVITY_CATEGORY_LABELS) as Array<
      [ActivityCategory, string]
    >
  ).map(([value, label]) => ({ value, label })),
];

export type ActivityStatus = "SUCCESS" | "FAILED" | "PENDING" | "INFO";

export interface ActivityItem {
  /** `${source}:${rowId}` — 소스 간 충돌 없는 식별자 */
  id: string;
  source: string;
  category: ActivityCategory;
  categoryLabel: string;
  title: string;
  detail: string | null;
  status: ActivityStatus;
  academyId: string;
  academyName: string | null;
  actorId: string | null;
  actorName: string | null;
  /** SUPER_ADMIN에게만 전달 (SUPPORT는 null) */
  metadata: Record<string, unknown> | null;
  createdAt: Date | string;
}
