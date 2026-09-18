// 방문자·시간대 화면 공용 순수 함수(클라이언트 안전).

import { DOW_LABELS } from "@/lib/analytics/format";

/** 비율(%) 소수 1자리 — whole 0 이면 0 */
export function pctOf(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;
}

/** 'YYYY-MM-DD' → 요일(0=일). 달력 날짜 자체의 요일이라 시간대 무관. */
export function dowOf(day: string): number {
  return new Date(`${day}T00:00:00Z`).getUTCDay();
}

/** 'YYYY-MM-DD' → "9월 17일 (목)" */
export function fmtDayLong(day: string): string {
  const [, m, d] = day.split("-").map(Number);
  return `${m}월 ${d}일 (${DOW_LABELS[dowOf(day)]})`;
}

/** 요일 글자색 — 일요일 빨강, 토요일 파랑 */
export function dowTone(dow: number): string {
  if (dow === 0) return "text-rose-500";
  if (dow === 6) return "text-blue-600";
  return "text-gray-500";
}
