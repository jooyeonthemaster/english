import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow, differenceInDays, startOfDay } from "date-fns";
import { ko } from "date-fns/locale";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Date formatting
export function formatDate(date: Date | string) {
  return format(new Date(date), "yyyy.MM.dd");
}

export function formatDateTime(date: Date | string) {
  return format(new Date(date), "yyyy.MM.dd HH:mm");
}

export function formatTime(date: Date | string) {
  return format(new Date(date), "HH:mm");
}

export function formatRelativeTime(date: Date | string) {
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: ko });
}

export function formatMonth(date: Date | string) {
  return format(new Date(date), "yyyy년 M월");
}

export function formatKoreanDate(date: Date | string) {
  return format(new Date(date), "M월 d일 (EEE)", { locale: ko });
}

// Number formatting
export function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

export function formatScore(score: number, total: number) {
  return `${score}/${total}`;
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatNumber(num: number) {
  return new Intl.NumberFormat("ko-KR").format(num);
}

// Label helpers
export function getGradeLabel(grade: number) {
  return `${grade}학년`;
}

export function getSemesterLabel(semester: string) {
  return semester === "FIRST" ? "1학기" : "2학기";
}

export function getExamTypeLabel(type: string) {
  switch (type) {
    case "MIDTERM": return "중간고사";
    case "FINAL": return "기말고사";
    case "QUIZ": return "쪽지시험";
    case "MOCK": return "모의고사";
    default: return type;
  }
}

export function getStudentStatusLabel(status: string) {
  switch (status) {
    case "ACTIVE": return "재원";
    case "PAUSED": return "휴원";
    case "WITHDRAWN": return "퇴원";
    case "WAITING": return "대기";
    default: return status;
  }
}

export function getAttendanceStatusLabel(status: string) {
  switch (status) {
    case "PRESENT": return "출석";
    case "ABSENT": return "결석";
    case "LATE": return "지각";
    case "EARLY_LEAVE": return "조퇴";
    case "MAKEUP": return "보강";
    default: return status;
  }
}

// Streak calculation
export function calculateStreak(dates: Date[]): number {
  if (dates.length === 0) return 0;

  const sorted = dates
    .map((d) => startOfDay(new Date(d)))
    .sort((a, b) => b.getTime() - a.getTime());

  const today = startOfDay(new Date());
  let streak = 0;

  // Check if today or yesterday has activity
  const firstDiff = differenceInDays(today, sorted[0]);
  if (firstDiff > 1) return 0;

  streak = 1;
  for (let i = 1; i < sorted.length; i++) {
    const diff = differenceInDays(sorted[i - 1], sorted[i]);
    if (diff === 1) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

// Generate student code
export function generateStudentCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No I, O, 0, 1 for clarity
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Generate unique login token for parents
export function generateLoginToken(): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  let token = "";
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

// Slugify text
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

// Truncate text
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}

// Get initials from name
export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// Color helpers
export function getScoreColor(percent: number): string {
  if (percent >= 90) return "text-emerald-600";
  if (percent >= 70) return "text-blue-600";
  if (percent >= 50) return "text-amber-600";
  return "text-red-600";
}

export function getScoreBgColor(percent: number): string {
  if (percent >= 90) return "bg-emerald-50";
  if (percent >= 70) return "bg-blue-50";
  if (percent >= 50) return "bg-amber-50";
  return "bg-red-50";
}

// Level calculation from XP
export function getLevelFromXp(xp: number): { level: number; title: string; progress: number; nextLevelXp: number } {
  const thresholds = [
    { level: 1, minXp: 0, title: "Beginner" },
    { level: 5, minXp: 500, title: "Novice" },
    { level: 10, minXp: 1500, title: "Learner" },
    { level: 15, minXp: 3500, title: "Intermediate" },
    { level: 20, minXp: 6500, title: "Advanced" },
    { level: 25, minXp: 10000, title: "Expert" },
    { level: 30, minXp: 15000, title: "Scholar" },
    { level: 40, minXp: 25000, title: "Champion" },
    { level: 50, minXp: 40000, title: "Master" },
  ];

  let current = thresholds[0];
  let next = thresholds[1];

  for (let i = thresholds.length - 1; i >= 0; i--) {
    if (xp >= thresholds[i].minXp) {
      current = thresholds[i];
      next = thresholds[i + 1] || thresholds[i];
      break;
    }
  }

  const xpInLevel = xp - current.minXp;
  const xpForNextLevel = next.minXp - current.minXp;
  const progress = xpForNextLevel > 0 ? (xpInLevel / xpForNextLevel) * 100 : 100;

  // Calculate actual level based on XP within the bracket
  const levelRange = next.level - current.level;
  const additionalLevels = xpForNextLevel > 0 ? Math.floor((xpInLevel / xpForNextLevel) * levelRange) : 0;
  const level = Math.min(current.level + additionalLevels, 50);

  return { level, title: current.title, progress: Math.min(progress, 100), nextLevelXp: next.minXp };
}

// Schedule formatting (moved from actions/classes.ts — can't export non-async from "use server")
const DAY_MAP: Record<string, string> = {
  MON: "월", TUE: "화", WED: "수", THU: "목", FRI: "금", SAT: "토", SUN: "일",
};

export function formatScheduleLabel(schedule: { day: string; startTime: string; endTime: string }[]): string {
  if (!schedule || schedule.length === 0) return "시간표 미설정";
  const days = schedule.map((s) => DAY_MAP[s.day] || s.day).join("/");
  const time = schedule[0] ? `${schedule[0].startTime}-${schedule[0].endTime}` : "";
  return `${days} ${time}`;
}
