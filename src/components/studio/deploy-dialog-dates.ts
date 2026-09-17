// ============================================================================
// C1 보조 — 배포 다이얼로그 마감 날짜 헬퍼 (서울 달력 고정 — seoulTodayYmd 방식)
//
// deploy-dialog.tsx 전용 분할 파일. 날짜는 composer-config-form 의
// seoulTodayYmd(서울 고정 해석)를 재사용 — 브라우저 TZ 로 해석하지 않는다.
// ============================================================================

import {
  seoulTodayYmd,
  ymdWeekdayKo,
} from "@/components/study-assignments/composer-config-form";

export type DuePreset = "today" | "tomorrow" | "week" | "custom";

/** 이번 주 일요일 ymd — 오늘이 일요일이면 오늘(composer upcomingSundayYmd(0) 동형) */
export function thisSundayYmd(): string {
  const t = new Date(`${seoulTodayYmd()}T00:00:00+09:00`).getTime();
  const weekday = new Date(t + 9 * 3_600_000).getUTCDay();
  return seoulTodayYmd((7 - weekday) % 7);
}

/** 프리셋 → 마감 ymd (직접 선택은 인풋 값) */
export function resolveDueYmd(preset: DuePreset, customYmd: string): string {
  if (preset === "today") return seoulTodayYmd(0);
  if (preset === "tomorrow") return seoulTodayYmd(1);
  if (preset === "week") return thisSundayYmd();
  return customYmd;
}

/** ymd → 해당일 23:59 (서울 고정 해석) ISO — 파손 ymd 는 null */
export function dueYmdToIso(ymd: string): string | null {
  if (!ymd) return null;
  const d = new Date(`${ymd}T23:59:00+09:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** "2026-08-10" → "8. 10.(일)" — ko-KR 월.일(요일). Date 로컬 포맷 없이 ymd 직접 파싱, 요일은 서울 고정 헬퍼 */
export function dueLabelKo(ymd: string): string {
  const [, m, d] = ymd.split("-");
  if (!m || !d) return ymd;
  return `${Number(m)}. ${Number(d)}.(${ymdWeekdayKo(ymd)})`;
}
