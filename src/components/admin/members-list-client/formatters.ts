// Shared formatting helpers for the members list.

// 시각 표기는 KST 고정 포매터를 쓴다. 두 축이 동시에 걸려 있다:
//   ① 서버(Vercel)는 UTC 라 timeZone 없이 toLocale* 로 포맷하면 SSR 문자열이 하루
//      이르게 찍힌다(가입일이 UTC 15시 이후인 행).
//   ② 서버(UTC)·브라우저(KST) 결과가 갈리면 hydration 이 깨진다.
// 관리자 화면 표시부의 단일 진실원은 @/lib/admin-kst-format 이다(스펙 I1).
// 게이트 `TZ=UTC npx tsx scripts/analytics-gate-member-kst.ts` 가 이 파일의
// formatDate 를 직접 import 해 "2026. 07. 08." 표기를 못 박는다 — 다른 포매터로
// 갈아끼우면 게이트가 빨간불이 된다.
import { formatKstDate } from "@/lib/admin-kst-format";

export function formatDate(d: Date | string | null | undefined): string {
  // 값 없음·파싱 불가는 formatKstDate 가 "—" 로 돌려준다(빈 값 가드 내장).
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
  // 이모지처럼 두 코드유닛짜리 글자를 반으로 자르면 서버(�)·클라 표기가 달라 hydration 이 깨진다.
  return Array.from(trimmed)[0] ?? "?";
}
