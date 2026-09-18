// ============================================================================
// 분석 기간 계산 — KST 경계(I1). 순수 함수, 서버/클라이언트 공용.
// 계약: docs/analytics/analytics-spec.md §5
// ============================================================================

const DAY_MS = 86_400_000;
const KST_OFFSET_MS = 9 * 3_600_000;

export const RANGE_KEYS = ["today", "yesterday", "7d", "30d", "90d", "custom"] as const;
export type RangeKey = (typeof RANGE_KEYS)[number];

export const RANGE_LABELS: Record<RangeKey, string> = {
  today: "오늘",
  yesterday: "어제",
  "7d": "최근 7일",
  "30d": "최근 30일",
  "90d": "최근 90일",
  custom: "기간 지정",
};

export interface AnalyticsPeriod {
  range: RangeKey;
  /** UTC instant, 포함 */
  from: Date;
  /** UTC instant, 제외 */
  to: Date;
  /** KST 'YYYY-MM-DD' 포함 */
  fromDay: string;
  /** KST 'YYYY-MM-DD' 포함(마지막 날) */
  toDay: string;
  prevFrom: Date;
  prevTo: Date;
  granularity: "hour" | "day";
  /** 일 수(오늘=1) */
  days: number;
}

/** KST 날짜 문자열 'YYYY-MM-DD' → 그 날 KST 자정의 UTC instant */
export function kstDayStart(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1) - KST_OFFSET_MS);
}

/** UTC instant → KST 'YYYY-MM-DD' */
export function toKstDay(date: Date | number): string {
  const t = typeof date === "number" ? date : date.getTime();
  return new Date(t + KST_OFFSET_MS).toISOString().slice(0, 10);
}

export function addDays(day: string, n: number): string {
  return toKstDay(kstDayStart(day).getTime() + n * DAY_MS);
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isRangeKey(v: unknown): v is RangeKey {
  return typeof v === "string" && (RANGE_KEYS as readonly string[]).includes(v);
}

/**
 * range/from/to 파라미터 → 기간. 잘못된 입력은 7d 로.
 * now 는 테스트 주입용.
 */
export function resolvePeriod(
  params: { range?: string | null; from?: string | null; to?: string | null },
  now: number = Date.now(),
): AnalyticsPeriod {
  const today = toKstDay(now);
  let range: RangeKey = isRangeKey(params.range) ? params.range : "7d";
  let fromDay: string;
  let toDay: string;

  switch (range) {
    case "today":
      fromDay = today;
      toDay = today;
      break;
    case "yesterday":
      fromDay = addDays(today, -1);
      toDay = fromDay;
      break;
    case "30d":
      fromDay = addDays(today, -29);
      toDay = today;
      break;
    case "90d":
      fromDay = addDays(today, -89);
      toDay = today;
      break;
    case "custom": {
      const f = params.from && DAY_RE.test(params.from) ? params.from : null;
      const t = params.to && DAY_RE.test(params.to) ? params.to : null;
      if (f && t && f <= t) {
        fromDay = f;
        toDay = t > today ? today : t;
        // 최대 400일
        if (kstDayStart(toDay).getTime() - kstDayStart(fromDay).getTime() > 400 * DAY_MS) {
          fromDay = addDays(toDay, -399);
        }
      } else {
        range = "7d";
        fromDay = addDays(today, -6);
        toDay = today;
      }
      break;
    }
    case "7d":
    default:
      range = "7d";
      fromDay = addDays(today, -6);
      toDay = today;
  }

  const from = kstDayStart(fromDay);
  const to = new Date(kstDayStart(toDay).getTime() + DAY_MS);
  const span = to.getTime() - from.getTime();
  const days = Math.round(span / DAY_MS);
  return {
    range,
    from,
    to,
    fromDay,
    toDay,
    prevFrom: new Date(from.getTime() - span),
    prevTo: from,
    granularity: days <= 2 ? "hour" : "day",
    days,
  };
}

/** 기간의 버킷 키 목록 — 빈 버킷 0 채우기용. hour 키 'YYYY-MM-DD HH', day 키 'YYYY-MM-DD' (KST). */
export function bucketKeys(period: Pick<AnalyticsPeriod, "from" | "to" | "granularity">): string[] {
  const keys: string[] = [];
  const step = period.granularity === "hour" ? 3_600_000 : DAY_MS;
  for (let t = period.from.getTime(); t < period.to.getTime(); t += step) {
    const kst = new Date(t + KST_OFFSET_MS).toISOString();
    keys.push(period.granularity === "hour" ? `${kst.slice(0, 10)} ${kst.slice(11, 13)}` : kst.slice(0, 10));
  }
  return keys;
}
