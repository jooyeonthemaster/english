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

// 필터 전용 값. "CREATED"는 단일 카테고리가 아니라 "유저가 실제로 만든 것"
// (콘텐츠 생성 + 자료 추출 + AI 생성)을 한 번에 보는 복합 필터다 — 페이지 이동/
// 로그인 같은 노이즈에 생성물이 묻히는 문제를 해결한다.
export type ActivityFilter = ActivityCategory | "all" | "CREATED";

export const ACTIVITY_CATEGORY_OPTIONS: Array<{
  value: ActivityFilter;
  label: string;
}> = [
  { value: "all", label: "전체" },
  { value: "CREATED", label: "생성물(콘텐츠·추출·AI)" },
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
