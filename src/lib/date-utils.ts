/**
 * KST (한국 표준시, UTC+9) 기반 날짜 유틸리티
 *
 * 서버(Vercel)가 UTC로 동작하므로 new Date()는 UTC 기준.
 * 한국 학생/원장이 사용하는 앱이므로 모든 "오늘", "이번 주", "이번 달" 계산은
 * KST 기준으로 해야 한다.
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000; // 9시간 (밀리초)

/** 현재 시각을 KST 기준 Date 객체로 반환 (내부 값은 UTC) */
function nowKST(): Date {
  return new Date(Date.now() + KST_OFFSET_MS);
}

/**
 * KST 기준 오늘 자정을 UTC Date로 반환
 * 예: KST 2026-04-05 00:00:00 = UTC 2026-04-04 15:00:00
 */
export function getTodayKST(): Date {
  const kst = nowKST();
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth();
  const d = kst.getUTCDate();
  // KST 자정 = UTC로 변환 (9시간 빼기)
  return new Date(Date.UTC(y, m, d) - KST_OFFSET_MS);
}

/**
 * KST 기준 내일 자정을 UTC Date로 반환
 */
export function getTomorrowKST(): Date {
  const today = getTodayKST();
  return new Date(today.getTime() + 24 * 60 * 60 * 1000);
}

/**
 * KST 기준 오늘/내일 범위 반환 { today, tomorrow }
 * Prisma WHERE: { date: { gte: today, lt: tomorrow } }
 */
export function getTodayRangeKST() {
  return { today: getTodayKST(), tomorrow: getTomorrowKST() };
}

/**
 * KST 기준 이번 주 월요일 자정을 UTC Date로 반환
 */
export function getWeekStartKST(): Date {
  const kst = nowKST();
  const day = kst.getUTCDay(); // 0=일, 1=월, ..., 6=토
  const diff = day === 0 ? 6 : day - 1; // 월요일까지 거리
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth();
  const d = kst.getUTCDate() - diff;
  return new Date(Date.UTC(y, m, d) - KST_OFFSET_MS);
}

/**
 * KST 기준 이번 달 1일 자정을 UTC Date로 반환
 */
export function getMonthStartKST(): Date {
  const kst = nowKST();
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth();
  return new Date(Date.UTC(y, m, 1) - KST_OFFSET_MS);
}

/**
 * KST 기준 지난 달 1일 자정을 UTC Date로 반환
 */
export function getLastMonthStartKST(): Date {
  const kst = nowKST();
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth() - 1;
  return new Date(Date.UTC(y, m, 1) - KST_OFFSET_MS);
}

/**
 * KST 기준 현재 요일 반환 (0=일, 1=월, ..., 6=토)
 */
export function getDayOfWeekKST(): number {
  return nowKST().getUTCDay();
}

/**
 * KST 기준 오늘 날짜 문자열 "YYYY-MM-DD" 반환
 */
export function getTodayStringKST(): string {
  const kst = nowKST();
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * KST 기준 어제 자정을 UTC Date로 반환
 */
export function getYesterdayKST(): Date {
  const today = getTodayKST();
  return new Date(today.getTime() - 24 * 60 * 60 * 1000);
}

/**
 * 주어진 Date를 KST 기준 자정으로 정규화 (UTC Date 반환)
 */
export function normalizeToKSTMidnight(date: Date): Date {
  const kst = new Date(date.getTime() + KST_OFFSET_MS);
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth();
  const d = kst.getUTCDate();
  return new Date(Date.UTC(y, m, d) - KST_OFFSET_MS);
}

/**
 * N개월 전 날짜를 KST 기준으로 반환
 */
export function getMonthsAgoKST(months: number): Date {
  const kst = nowKST();
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth() - months;
  const d = kst.getUTCDate();
  return new Date(Date.UTC(y, m, d) - KST_OFFSET_MS);
}
