export function formatTaskDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  // 연월일시분 — 예: "2026.06.06 17:45" (로컬 시각, 24시간제).
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}.${mm}.${dd} ${hh}:${min}`;
}

export function formatTaskDateParts(
  value: string,
): { day: string; time: string } | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return {
    day: date.toLocaleDateString("ko-KR", {
      month: "numeric",
      day: "numeric",
    }),
    time: date.toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }),
  };
}
