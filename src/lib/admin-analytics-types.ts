// ============================================================================
// 관리자 활동 분석 — 공유 타입 (순수 모듈, prisma 금지).
//
// /admin/activity 의 "분석 대시보드" 탭이 쓰는 집계 페이로드 계약.
// 서버(get-activity-analytics)와 모든 차트/패널 클라이언트 컴포넌트가
// 함께 import 하므로 서버 전용 의존성(prisma 등)을 절대 두지 않는다.
//
// 분석의 출처(source of truth)는 타임라인과 동일한 9-소스 유니온이다
// (extraction_jobs / workbench_ai_jobs / similar_exam·question /
//  custom_question / passages / exams / passage_reports / app_events).
// app_events 단독은 디렉터 페이지뷰·로그인·내보내기뿐(전체 활동의 일부)
// 이므로, "학원이 그날 활동했는가"는 반드시 유니온으로 판단한다.
// ============================================================================

import type {
  ActivityCategory,
  ActivityItem,
} from "@/lib/admin-activity-types";

export type { ActivityCategory, ActivityItem };

/** 구독 플랜 등급 — SubscriptionPlan.tier + 구독 없음(NONE). */
export type PlanTier =
  | "STARTER"
  | "STANDARD"
  | "PREMIUM"
  | "ENTERPRISE"
  | "NONE";

export const PLAN_TIER_LABELS: Record<PlanTier, string> = {
  STARTER: "스타터",
  STANDARD: "스탠다드",
  PREMIUM: "프리미엄",
  ENTERPRISE: "엔터프라이즈",
  NONE: "미구독",
};

/**
 * 인게이지먼트 세그먼트 — 학원 1곳을 활동 패턴으로 분류한다.
 * 우선순위(겹치면 위가 우선): SIGNUP_ONLY > NEW > DORMANT > POWER > REGULAR > LIGHT.
 */
export type EngagementSegment =
  | "POWER" // 파워: 최근 30일 활동일 12+ (거의 매일)
  | "REGULAR" // 꾸준: 최근 30일 활동일 4~11
  | "LIGHT" // 라이트: 최근 30일 활동일 1~3
  | "NEW" // 신규: 가입 7일 이내 (아직 판단 보류)
  | "DORMANT" // 휴면: 과거 활동 있으나 최근 14일 무활동
  | "SIGNUP_ONLY"; // 가입만: 가입 후 단 한 번도 활동 없음

export const SEGMENT_LABELS: Record<EngagementSegment, string> = {
  POWER: "파워 유저",
  REGULAR: "꾸준 사용",
  LIGHT: "라이트 사용",
  NEW: "신규",
  DORMANT: "휴면",
  SIGNUP_ONLY: "가입만",
};

/** 세그먼트 색 — 라인/배지 공용. 주황·앰버 금지(브랜드 규칙). */
export const SEGMENT_COLORS: Record<EngagementSegment, string> = {
  POWER: "#4F46E5", // indigo-600
  REGULAR: "#10B981", // emerald-500
  LIGHT: "#0EA5E9", // sky-500
  NEW: "#3B82F6", // blue-500
  DORMANT: "#94A3B8", // slate-400
  SIGNUP_ONLY: "#CBD5E1", // slate-300
};

/** 카테고리 색 — 카테고리 추이/구성 차트 공용. */
export const CATEGORY_COLORS: Record<ActivityCategory, string> = {
  EXTRACTION: "#3B82F6", // blue
  AI_GENERATION: "#8B5CF6", // violet
  CONTENT: "#10B981", // emerald
  EXPORT: "#64748B", // slate
  PAGE_VIEW: "#0EA5E9", // sky
  AUTH: "#A8A29E", // stone (중립)
};

/** 일별 1점 — KST 일자 기준 집계. */
export interface DailyPoint {
  /** 'YYYY-MM-DD' (KST) */
  date: string;
  /** 그날 활동한 고유 학원 수 (유니온, 중복 제거) */
  activeAcademies: number;
  /** 그날 총 활동 건수 (모든 소스 합) */
  events: number;
  /** 카테고리별 활동 건수 */
  byCategory: Record<ActivityCategory, number>;
}

/** 학원 1곳의 인게이지먼트 요약 (학원별 테이블 행). */
export interface AcademyEngagement {
  academyId: string;
  academyName: string | null;
  planTier: PlanTier;
  /** 구독 상태 (TRIAL|ACTIVE|PAST_DUE|CANCELLED|SUSPENDED) 또는 null */
  planStatus: string | null;
  /** 학원 계정 상태 (ACTIVE|TRIAL|SUSPENDED|DEACTIVATED) */
  academyStatus: string;
  /** 가입 시각 ISO */
  signupAt: string;
  /** 최초 활동 시각 ISO (전체 기간) — 없으면 가입만 */
  firstActivityAt: string | null;
  /** 최근 활동 시각 ISO (전체 기간) */
  lastActivityAt: string | null;
  /** 전체 기간 누적 활동 건수 */
  totalEvents: number;
  /** 최근 30일(윈도우) 고유 활동일 수 */
  activeDays30: number;
  /** 최근 7일 활동 건수 */
  events7: number;
  /** 현재 연속 활동일 (오늘 또는 어제까지 이어지는 연속 KST 일수) */
  currentStreak: number;
  /** 윈도우 내 최장 연속 활동일 */
  longestStreak: number;
  /** 가입 후 경과일 (KST) */
  daysSinceSignup: number;
  /** 가입→최초활동 소요일 (활성화 안 했으면 null) */
  daysToActivate: number | null;
  /** 최근 14일 일별 활동 건수 (스파크라인용, 길이 14, 과거→현재) */
  sparkline: number[];
  segment: EngagementSegment;
}

/** 가입 코호트 1주 — 활성화 전환을 본다. */
export interface CohortPoint {
  /** 주 시작일 'YYYY-MM-DD' (KST, 월요일) */
  weekStart: string;
  /** 라벨 (예: "6/9 주") */
  label: string;
  /** 그 주 신규 가입 학원 수 */
  signups: number;
  /** 그중 (전체 기간 내) 한 번이라도 활동한 수 */
  activated: number;
  /** 그중 가입 7일 이내 활동한 수 */
  activatedWithin7d: number;
  /** activated / signups (0~1) */
  activationRate: number;
}

/** 현재 연속 활동일 히스토그램 1막대. */
export interface StreakBucket {
  label: string;
  /** 버킷 하한(정렬용) */
  min: number;
  count: number;
}

/** 세그먼트별 학원 수. */
export interface SegmentCount {
  segment: EngagementSegment;
  label: string;
  count: number;
}

/** 요약 KPI. */
export interface AnalyticsKpis {
  /** 전체 가입 학원 수 */
  totalAcademies: number;
  /** 활성화된(한 번이라도 활동한) 학원 수 */
  activatedAcademies: number;
  /** 가입만 하고 활동 0인 학원 수 */
  signupOnly: number;
  /** activatedAcademies / totalAcademies (0~1) */
  activationRate: number;
  /** 오늘(KST) 활동 학원 수 */
  activeToday: number;
  /** 어제(KST) 활동 학원 수 */
  activeYesterday: number;
  /** 최근 7일 활동 학원 수 (WAU) */
  activeWeek: number;
  /** 최근 30일 활동 학원 수 (MAU) */
  activeMonth: number;
  /** 최근 7일 신규 가입 */
  newAcademies7d: number;
  /** 최근 30일 신규 가입 */
  newAcademies30d: number;
  /** 현재 연속 3일+ 학원 수 */
  streak3plus: number;
  /** 현재 연속 7일+ 학원 수 */
  streak7plus: number;
  /** 활성 학원 평균 현재 연속일 (활동 이력 있는 학원 대상) */
  avgCurrentStreak: number;
  /** 휴면(과거 활동, 최근 14일 무활동) 학원 수 */
  dormant: number;
  /** 가입 후 활성화까지 걸린 일수의 중앙값(활성화 학원 대상), 없으면 null */
  medianDaysToActivate: number | null;
}

/** 대시보드 전체 페이로드 — 서버 액션 반환값, 모든 컴포넌트의 계약. */
export interface ActivityAnalyticsPayload {
  /** 시계열 윈도우 길이(일) */
  rangeDays: number;
  /** 오늘 KST 'YYYY-MM-DD' */
  todayKst: string;
  /** 윈도우 시작 KST 'YYYY-MM-DD' */
  fromKst: string;
  /** 생성 시각 ISO */
  generatedAt: string;
  kpis: AnalyticsKpis;
  /** 윈도우 일별 시계열 (과거→현재, 빈 날도 0으로 채움) */
  daily: DailyPoint[];
  /** 가입 코호트 (과거→현재) */
  cohorts: CohortPoint[];
  /** 현재 연속일 히스토그램 */
  streakBuckets: StreakBucket[];
  /** 세그먼트 분포 */
  segments: SegmentCount[];
  /** 전체 학원 인게이지먼트 (클라에서 정렬/필터) */
  engagement: AcademyEngagement[];
  // ── 확장 인사이트 ──
  /** 세부 기능별 일별 추이 (윈도우, 과거→현재) */
  featureDaily: FeatureDailyPoint[];
  /** 기능별 채택률 (전체 기간) */
  featureAdoption: FeatureAdoption[];
  /** 기능별 성공/실패 (윈도우, 잡 기반 기능만) */
  featureOutcomes: FeatureOutcome[];
  /** 시간대×요일 활동 히트맵 (윈도우, KST) */
  hourWeekday: HourWeekdayCell[];
  /** 일별 신규 가입 + 누적 (윈도우) */
  signupsDaily: SignupPoint[];
  /** 플랜 등급 분포 */
  planDistribution: DistributionItem[];
  /** 학원 상태 분포 */
  statusDistribution: DistributionItem[];
  /** 활성화 퍼널 (가입→활성화→반복→파워) */
  funnel: FunnelStage[];
  /** 정직성 주석 — 데이터 한계(페이지뷰 디렉터 한정 등) UI에 노출 */
  dataNotes: string[];
}

export const ANALYTICS_RANGE_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 7, label: "최근 7일" },
  { value: 30, label: "최근 30일" },
  { value: 90, label: "최근 90일" },
];

// ============================================================================
// 확장: 세부 기능 단위 분석 (카테고리보다 잘게)
// ============================================================================

/** 세부 기능 — 6개 카테고리를 도메인 소스 단위로 더 잘게 나눈 것. */
export type ActivityFeature =
  | "EXTRACTION" // 자료 추출
  | "QUESTION_GEN" // 문제 생성 (workbench QUESTION_GENERATION)
  | "ANALYSIS" // 학습지 생성 (workbench PASSAGE_ANALYSIS)
  | "SIMILAR_EXAM" // 동형 시험지
  | "SIMILAR_QUESTION" // 동형 문제
  | "CUSTOM_QUESTION" // 커스텀 문제
  | "EXAM" // 시험지 생성
  | "PASSAGE" // 지문 등록
  | "REPORT" // 학습지 보고서
  | "EXPORT" // 내보내기
  | "LOGIN" // 로그인
  | "PAGEVIEW"; // 페이지 이동

export const FEATURE_LABELS: Record<ActivityFeature, string> = {
  EXTRACTION: "자료 추출",
  QUESTION_GEN: "문제 생성",
  ANALYSIS: "학습지 생성",
  SIMILAR_EXAM: "동형 시험지",
  SIMILAR_QUESTION: "동형 문제",
  CUSTOM_QUESTION: "커스텀 문제",
  EXAM: "시험지 생성",
  PASSAGE: "지문 등록",
  REPORT: "학습지 보고서",
  EXPORT: "내보내기",
  LOGIN: "로그인",
  PAGEVIEW: "페이지 이동",
};

/** 표시 순서: 생산 작업 → 콘텐츠 → 내보내기 → 접속. */
export const FEATURE_ORDER: ActivityFeature[] = [
  "EXTRACTION",
  "QUESTION_GEN",
  "ANALYSIS",
  "SIMILAR_EXAM",
  "SIMILAR_QUESTION",
  "CUSTOM_QUESTION",
  "EXAM",
  "PASSAGE",
  "REPORT",
  "EXPORT",
  "LOGIN",
  "PAGEVIEW",
];

/** 기능 색 — 블루/바이올렛/틸/그린/슬레이트 계열. 주황·앰버 금지. */
export const FEATURE_COLORS: Record<ActivityFeature, string> = {
  EXTRACTION: "#3B82F6",
  QUESTION_GEN: "#8B5CF6",
  ANALYSIS: "#6366F1",
  SIMILAR_EXAM: "#0EA5E9",
  SIMILAR_QUESTION: "#14B8A6",
  CUSTOM_QUESTION: "#A855F7",
  EXAM: "#10B981",
  PASSAGE: "#22C55E",
  REPORT: "#84CC16",
  EXPORT: "#64748B",
  LOGIN: "#94A3B8",
  PAGEVIEW: "#0891B2",
};

/** 성공/실패 결과가 있는(잡 기반) 기능 — 나머지는 단순 카운트. */
export const JOB_FEATURES: ActivityFeature[] = [
  "EXTRACTION",
  "QUESTION_GEN",
  "ANALYSIS",
  "SIMILAR_EXAM",
  "SIMILAR_QUESTION",
  "CUSTOM_QUESTION",
];

export interface FeatureDailyPoint {
  /** 'YYYY-MM-DD' (KST) */
  date: string;
  byFeature: Record<ActivityFeature, number>;
}

export interface FeatureAdoption {
  feature: ActivityFeature;
  label: string;
  /** 전체 기간 이 기능을 1회 이상 쓴 고유 학원 수 */
  academies: number;
  /** 전체 기간 누적 실행 건수 */
  total: number;
}

export interface FeatureOutcome {
  feature: ActivityFeature;
  label: string;
  success: number;
  failed: number;
  pending: number;
}

export interface HourWeekdayCell {
  /** 0=일 .. 6=토 (KST) */
  weekday: number;
  /** 0..23 (KST) */
  hour: number;
  count: number;
}

export interface SignupPoint {
  /** 'YYYY-MM-DD' (KST) */
  date: string;
  signups: number;
  /** 그 날까지 누적 가입 학원 수 */
  cumulative: number;
}

export interface DistributionItem {
  key: string;
  label: string;
  count: number;
  color: string;
}

export interface FunnelStage {
  key: string;
  label: string;
  count: number;
  /** 직전 단계 대비 비율 (0~1), 첫 단계는 1 */
  rate: number;
}

/** 개별 학원 드릴다운 — 기능별 분해. */
export interface AcademyFeatureBreakdown {
  feature: ActivityFeature;
  label: string;
  total: number;
  success: number;
  failed: number;
}

/** 개별 학원 심층 페이로드 (행 클릭 시 지연 로드). */
export interface AcademyDetailPayload {
  academyId: string;
  academyName: string | null;
  planTier: PlanTier;
  planStatus: string | null;
  academyStatus: string;
  signupAt: string;
  firstActivityAt: string | null;
  lastActivityAt: string | null;
  totalEvents: number;
  staffCount: number;
  /** 현재 연속 활동일 (최근 60일 기준) */
  currentStreak: number;
  /** 최근 60일 고유 활동일 */
  activeDays60: number;
  featureBreakdown: AcademyFeatureBreakdown[];
  /** 최근 60일 일별 활동 건수 (과거→현재, 0 포함) */
  daily: Array<{ date: string; count: number }>;
  /** 최근 활동 타임라인 (유니온, 최대 25건) */
  recentActivity: ActivityItem[];
  dataNotes: string[];
}
