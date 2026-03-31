import {
  Target,
  BookOpen,
  ClipboardList,
  FileText,
  BarChart3,
  MessageSquare,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type RankingTab = "individual" | "school" | "academy";

export interface QuickMenuItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  href: string;
  color: string;
  bg: string;
}

// ---------------------------------------------------------------------------
// Ranking tabs
// ---------------------------------------------------------------------------
export const RANKING_TABS: { key: RankingTab; label: string }[] = [
  { key: "individual", label: "개인" },
  { key: "school", label: "학교" },
  { key: "academy", label: "학원" },
];

// ---------------------------------------------------------------------------
// Quick menu
// ---------------------------------------------------------------------------
export const QUICK_MENU_OPTIONS: QuickMenuItem[] = [
  { id: "review", label: "오답복습", icon: Target, href: "/student/learn/analytics", color: "text-red-500", bg: "bg-red-50" },
  { id: "learn", label: "학습", icon: BookOpen, href: "/student/learn", color: "text-violet-500", bg: "bg-violet-50" },
  { id: "assignments", label: "숙제", icon: ClipboardList, href: "/student/resources?tab=assignments", color: "text-amber-500", bg: "bg-amber-50" },
  { id: "notices", label: "공지사항", icon: FileText, href: "/student/resources?tab=notices", color: "text-blue-500", bg: "bg-blue-50" },
  { id: "grades", label: "성적", icon: BarChart3, href: "/student/mypage?tab=grades", color: "text-emerald-500", bg: "bg-emerald-50" },
  { id: "qna", label: "질문하기", icon: MessageSquare, href: "/student/mypage?tab=qna", color: "text-blue-500", bg: "bg-blue-50" },
];

export const DEFAULT_SHORTCUTS = ["review", "learn", "assignments", "notices"];

export function getShortcuts(): string[] {
  if (typeof window === "undefined") return DEFAULT_SHORTCUTS;
  try {
    const stored = localStorage.getItem("student-shortcuts");
    if (stored) return JSON.parse(stored);
  } catch {}
  return DEFAULT_SHORTCUTS;
}

// ---------------------------------------------------------------------------
// Weekly schedule helpers
// ---------------------------------------------------------------------------
export const DAY_MAP: Record<string, number> = {
  MON: 0, TUE: 1, WED: 2, THU: 3, FRI: 4, SAT: 5, SUN: 6,
};
export const DAY_LABELS = ["월", "화", "수", "목", "금", "토"];

export function getTodayDayIndex(): number {
  const jsDay = new Date().getDay(); // 0=Sun
  return jsDay === 0 ? 6 : jsDay - 1; // 0=Mon
}

// ---------------------------------------------------------------------------
// Level badge colors
// ---------------------------------------------------------------------------
export const LEVEL_COLORS: Record<string, string> = {
  S: "bg-gradient-to-br from-yellow-400 to-amber-500 text-white",
  A: "bg-gradient-to-br from-blue-400 to-blue-600 text-white",
  B: "bg-gradient-to-br from-emerald-400 to-emerald-600 text-white",
  C: "bg-gradient-to-br from-amber-400 to-amber-500 text-white",
  D: "bg-gray-100 text-gray-400",
};

// ---------------------------------------------------------------------------
// Schedule slot type
// ---------------------------------------------------------------------------
export type ScheduleSlot = {
  className: string;
  startTime: string;
  endTime: string;
  colorIdx: number;
};
