// Shared formatting helpers for the members list.

// 표시 포매터는 반드시 KST 고정(@/lib/admin-kst-format) — 서버(Vercel)는 UTC 라
// timeZone 없이 포맷하면 SSR 문자열이 하루 이르게 찍힌다(가입일 UTC 15시 이후 행).
import { formatKstDate } from "@/lib/admin-kst-format";

export function formatDate(d: Date | string | null | undefined): string {
  return formatKstDate(d);
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
  return trimmed.slice(0, 1);
}

export function tierBadgeClass(tier: string): string {
  switch (tier) {
    case "ENTERPRISE":
      return "bg-slate-900 text-white";
    case "PREMIUM":
      return "bg-blue-600 text-white";
    case "STANDARD":
      return "bg-blue-100 text-blue-800";
    case "STARTER":
      return "bg-slate-100 text-slate-700";
    default:
      return "bg-gray-100 text-gray-600";
  }
}
