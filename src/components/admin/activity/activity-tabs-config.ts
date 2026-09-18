import { BarChart3, ListTree } from "lucide-react";
import type { AdminTab } from "@/components/admin/kit";

// /admin/activity 탭·분석 구역 키. 서버 페이지(searchParams 해석)와 클라이언트가 같이 쓴다.
// "use client" 모듈에서 상수를 내보내면 서버가 못 읽으므로 여기 따로 둔다.

export type ActivityTabKey = "dashboard" | "log";
export const ACTIVITY_TAB_KEYS = ["dashboard", "log"] as const satisfies readonly ActivityTabKey[];
export const ACTIVITY_TABS: ReadonlyArray<AdminTab<ActivityTabKey>> = [
  { key: "dashboard", label: "분석 대시보드", icon: BarChart3 },
  { key: "log", label: "활동 로그", icon: ListTree },
];

export type AnalyticsSectionKey = "overview" | "features" | "growth" | "academies";
export const ANALYTICS_SECTION_KEYS = [
  "overview",
  "features",
  "growth",
  "academies",
] as const satisfies readonly AnalyticsSectionKey[];
export const ANALYTICS_SECTIONS: ReadonlyArray<{ key: AnalyticsSectionKey; label: string }> = [
  { key: "overview", label: "개요" },
  { key: "features", label: "기능 분석" },
  { key: "growth", label: "가입·성장" },
  { key: "academies", label: "학원별" },
];
