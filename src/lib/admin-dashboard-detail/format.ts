import { formatCurrency, formatNumber } from "@/lib/utils";

// 대시보드 상세 표시용 포맷. 서버(UTC 프로덕션)에서 문자열로 만들어 보내므로
// 시각은 반드시 Asia/Seoul 로 고정한다.

const KST_TIME = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const KST_DATETIME = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function kstTime(date: Date | null | undefined) {
  return date ? KST_TIME.format(date) : "—";
}

/** "9/17 22:35" */
export function kstDateTime(date: Date | null | undefined) {
  if (!date) return "—";
  const parts = Object.fromEntries(
    KST_DATETIME.formatToParts(date).map((p) => [p.type, p.value]),
  );
  return `${Number(parts.month)}/${Number(parts.day)} ${parts.hour}:${parts.minute}`;
}

export const won = formatCurrency;
export const num = formatNumber;

export function truncate(text: string | null | undefined, max = 60) {
  if (!text) return "—";
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine;
}

/** "YYYY-MM-DD"(KST) → [그날 00:00 KST, 다음날 00:00 KST) */
export function kstDayRange(dateKey: string): { start: Date; end: Date } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  const start = new Date(`${dateKey}T00:00:00+09:00`);
  if (Number.isNaN(start.getTime())) return null;
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

/** academyId 목록 → 학원명 맵 */
export function nameOf(map: Map<string, string>, academyId: string | null | undefined) {
  if (!academyId) return "—";
  return map.get(academyId) ?? "(삭제된 학원)";
}
