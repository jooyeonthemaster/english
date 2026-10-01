// qgen-lab 집계 통계(순수) — 중앙값·p90(최근접 순위)·평균·상위 빈도.

function finite(values: (number | null | undefined)[]): number[] {
  return values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
}

/** 최근접 순위 분위수(q ∈ (0,1]). 표본이 적은 벤치에서 보간 없이 실측값을 그대로 보인다. */
export function quantile(values: (number | null | undefined)[], q: number): number | null {
  const xs = finite(values).sort((a, b) => a - b);
  if (xs.length === 0) return null;
  const rank = Math.max(1, Math.ceil(q * xs.length));
  return xs[Math.min(xs.length, rank) - 1];
}

export function median(values: (number | null | undefined)[]): number | null {
  const xs = finite(values).sort((a, b) => a - b);
  if (xs.length === 0) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

export function mean(values: (number | null | undefined)[]): number | null {
  const xs = finite(values);
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** 반려 사유 정규화 — 앞 60자, 따옴표 속 가변 표현은 … 로 접어 같은 유형끼리 모은다. */
export function reasonKey(reason: string): string {
  return reason
    .replace(/["“”'‘’`][^"“”'‘’`]{1,80}["“”'‘’`]/g, "“…”")
    // 수치는 # 로 접되 HTTP 상태(4xx/5xx)는 유형 구분에 쓰이므로 남긴다.
    .replace(/\d+(\.\d+)?/g, (m) => (/^[45]\d\d$/.test(m) ? m : "#"))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

export function topCounts(items: string[], limit = 3): { key: string; count: number }[] {
  const m = new Map<string, number>();
  for (const it of items) m.set(it, (m.get(it) ?? 0) + 1);
  return [...m.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, limit);
}
