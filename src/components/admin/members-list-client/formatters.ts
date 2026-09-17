// Shared formatting helpers for the members list.
import { formatDate as kstDate } from "@/lib/utils";

// 시각 표기는 KST 고정 포매터(lib/utils)를 쓴다 — toLocale* 는 서버(UTC)·브라우저(KST) 결과가
// 달라 hydration 이 깨진다.
export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return kstDate(d);
}

export function formatRelative(
  d: Date | string | null | undefined,
  now: number,
): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  const diffMs = now - date.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}일 전`;
  if (day < 30) return `${Math.floor(day / 7)}주 전`;
  if (day < 365) return `${Math.floor(day / 30)}개월 전`;
  return `${Math.floor(day / 365)}년 전`;
}

export function getInitials(name: string): string {
  if (!name) return "?";
  const trimmed = name.trim();
  if (/^[A-Za-z]/.test(trimmed)) {
    const parts = trimmed.split(/\s+/).slice(0, 2);
    return parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
  }
  // 이모지처럼 두 코드유닛짜리 글자를 반으로 자르면 서버(�)·클라 표기가 달라 hydration 이 깨진다.
  return Array.from(trimmed)[0] ?? "?";
}
