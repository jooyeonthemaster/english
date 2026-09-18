// ============================================================================
// 분석 화면 포맷터 — 클라이언트 안전(순수 함수).
// ============================================================================

export function fmtInt(n: number | null | undefined): string {
  return new Intl.NumberFormat("ko-KR").format(Math.round(n ?? 0));
}

export function fmtKrw(n: number | null | undefined): string {
  return `${fmtInt(n)}원`;
}

export function fmtPct(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "-";
  return `${n.toFixed(digits).replace(/\.0$/, "")}%`;
}

/** ms → "1분 23초" / "45초" / "1시간 2분" */
export function fmtDuration(ms: number | null | undefined): string {
  const total = Math.max(0, Math.round((ms ?? 0) / 1000));
  if (total < 60) return `${total}초`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m < 60) return s ? `${m}분 ${s}초` : `${m}분`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm ? `${h}시간 ${mm}분` : `${h}시간`;
}

/** 증감률 (이전 0 이면 null) */
export function deltaPct(current: number, previous: number): number | null {
  if (!previous) return current ? null : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

const KST_DT = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const KST_TIME = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

/** ISO → "9. 17. 19:46" 계열 KST */
export function fmtDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return "-";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return Number.isNaN(d.getTime()) ? "-" : KST_DT.format(d);
}

export function fmtTime(iso: string | Date | null | undefined): string {
  if (!iso) return "-";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return Number.isNaN(d.getTime()) ? "-" : KST_TIME.format(d);
}

/** "n초 전 / n분 전 / n시간 전" */
export function fmtAgo(iso: string | Date | null | undefined, now = Date.now()): string {
  if (!iso) return "-";
  const t = (typeof iso === "string" ? new Date(iso) : iso).getTime();
  const sec = Math.max(0, Math.round((now - t) / 1000));
  if (sec < 60) return `${sec}초 전`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분 전`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

/** 버킷 키 'YYYY-MM-DD' | 'YYYY-MM-DD HH' → 축 라벨 */
export function fmtBucket(key: string): string {
  if (key.length > 10) return `${Number(key.slice(11, 13))}시`;
  const [, m, d] = key.split("-");
  return `${Number(m)}/${Number(d)}`;
}

export const DOW_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
