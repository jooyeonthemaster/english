import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string) {
  return format(new Date(date), "yyyy.MM.dd");
}

export function formatDateTime(date: Date | string) {
  return format(new Date(date), "yyyy.MM.dd HH:mm");
}

export function formatRelativeTime(date: Date | string) {
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: ko });
}

export function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

export function formatScore(score: number, total: number) {
  return `${score}/${total}`;
}

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
    case "MOCK": return "모의고사";
    default: return type;
  }
}
