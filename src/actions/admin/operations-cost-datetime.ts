import type { CostPeriodMode, CostRange, OperationsCostOptions, RangeBucket } from "./operations-cost-types";
export const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
export const DAILY_BUCKET_COUNT = 30;
export const MONTHLY_BUCKET_COUNT = 12;
export function buildRange(mode: CostPeriodMode, options: OperationsCostOptions): CostRange {
  const customRange = parseDateRange(options.startDate, options.endDate);
  if (customRange) {
    return mode === "monthly"
      ? buildMonthlyCustomRange(customRange.start, customRange.end)
      : buildDailyCustomRange(customRange.start, customRange.end);
  }

  const nowParts = kstParts(new Date());
  if (mode === "monthly") {
    const selected = parseMonthInput(options.month) ?? {
      year: nowParts.year,
      monthIndex: nowParts.monthIndex,
    };
    const first = addKstMonths(selected.year, selected.monthIndex, -(MONTHLY_BUCKET_COUNT - 1));
    const buckets = Array.from({ length: MONTHLY_BUCKET_COUNT }, (_, index) => {
      const parts = addKstMonths(first.year, first.monthIndex, index);
      return {
        key: monthKey(parts.year, parts.monthIndex),
        label: `${parts.year}.${String(parts.monthIndex + 1).padStart(2, "0")}`,
        year: parts.year,
        monthIndex: parts.monthIndex,
      };
    });
    const last = buckets[buckets.length - 1];
    const next = addKstMonths(last.year, last.monthIndex, 1);
    const summaryKey = monthKey(selected.year, selected.monthIndex);
    return {
      start: kstDateToUtc(first.year, first.monthIndex, 1),
      end: kstDateToUtc(next.year, next.monthIndex, 1),
      buckets,
      summaryMode: "bucket",
      summaryKey,
      summaryLabel: `${selected.year}.${String(selected.monthIndex + 1).padStart(2, "0")}`,
    };
  }

  const selected = parseDateInput(options.date) ?? nowParts;
  const first = addKstDays(selected.year, selected.monthIndex, selected.day, -(DAILY_BUCKET_COUNT - 1));
  const buckets = Array.from({ length: DAILY_BUCKET_COUNT }, (_, index) => {
    const parts = addKstDays(first.year, first.monthIndex, first.day, index);
    return {
      key: dayKey(parts.year, parts.monthIndex, parts.day),
      label: `${parts.monthIndex + 1}.${String(parts.day).padStart(2, "0")}`,
      year: parts.year,
      monthIndex: parts.monthIndex,
      day: parts.day,
    };
  });
  const last = buckets[buckets.length - 1];
  const next = addKstDays(last.year, last.monthIndex, last.day, 1);
  const summaryKey = dayKey(selected.year, selected.monthIndex, selected.day);
  return {
    start: kstDateToUtc(first.year, first.monthIndex, first.day),
    end: kstDateToUtc(next.year, next.monthIndex, next.day),
    buckets,
    summaryMode: "bucket",
    summaryKey,
    summaryLabel: formatFullDateLabel(selected),
  };
}
export function buildDailyCustomRange(
  start: { year: number; monthIndex: number; day: number },
  end: { year: number; monthIndex: number; day: number },
): CostRange {
  const days = diffKstDays(start, end) + 1;
  const buckets = Array.from({ length: days }, (_, index) => {
    const parts = addKstDays(start.year, start.monthIndex, start.day, index);
    return {
      key: dayKey(parts.year, parts.monthIndex, parts.day),
      label: `${parts.monthIndex + 1}.${String(parts.day).padStart(2, "0")}`,
      year: parts.year,
      monthIndex: parts.monthIndex,
      day: parts.day,
    };
  });
  const next = addKstDays(end.year, end.monthIndex, end.day, 1);
  return {
    start: kstDateToUtc(start.year, start.monthIndex, start.day),
    end: kstDateToUtc(next.year, next.monthIndex, next.day),
    buckets,
    summaryMode: "range",
    summaryLabel: `${formatFullDateLabel(start)} - ${formatFullDateLabel(end)}`,
  };
}
export function buildMonthlyCustomRange(
  start: { year: number; monthIndex: number; day: number },
  end: { year: number; monthIndex: number; day: number },
): CostRange {
  const monthCount = diffKstMonths(start, end) + 1;
  const buckets = Array.from({ length: monthCount }, (_, index) => {
    const parts = addKstMonths(start.year, start.monthIndex, index);
    return {
      key: monthKey(parts.year, parts.monthIndex),
      label: `${parts.year}.${String(parts.monthIndex + 1).padStart(2, "0")}`,
      year: parts.year,
      monthIndex: parts.monthIndex,
    };
  });
  const next = addKstDays(end.year, end.monthIndex, end.day, 1);
  return {
    start: kstDateToUtc(start.year, start.monthIndex, start.day),
    end: kstDateToUtc(next.year, next.monthIndex, next.day),
    buckets,
    summaryMode: "range",
    summaryLabel: `${formatFullDateLabel(start)} - ${formatFullDateLabel(end)}`,
  };
}
export function bucketKeyForDate(date: Date | null, mode: CostPeriodMode) {
  if (!date) return "";
  const parts = kstParts(date);
  return mode === "monthly"
    ? monthKey(parts.year, parts.monthIndex)
    : dayKey(parts.year, parts.monthIndex, parts.day);
}
export function fixedCostForBucket(
  bucket: RangeBucket,
  mode: CostPeriodMode,
  fixedMonthlyCostKrw: number,
  periodStart: Date,
  periodEnd: Date,
) {
  if (fixedMonthlyCostKrw <= 0) return 0;
  if (mode === "monthly") {
    const monthStart = kstDateToUtc(bucket.year, bucket.monthIndex, 1);
    const nextMonth = addKstMonths(bucket.year, bucket.monthIndex, 1);
    const monthEnd = kstDateToUtc(nextMonth.year, nextMonth.monthIndex, 1);
    const overlapStartMs = Math.max(monthStart.getTime(), periodStart.getTime());
    const overlapEndMs = Math.min(monthEnd.getTime(), periodEnd.getTime());
    const overlapDays = Math.max(0, Math.ceil((overlapEndMs - overlapStartMs) / 86_400_000));
    return (fixedMonthlyCostKrw / daysInMonth(bucket.year, bucket.monthIndex)) * overlapDays;
  }
  return fixedMonthlyCostKrw / daysInMonth(bucket.year, bucket.monthIndex);
}
export function parseDateRange(startValue?: string, endValue?: string) {
  const start = parseDateInput(startValue);
  const end = parseDateInput(endValue);
  if (!start || !end) return null;

  if (compareKstDates(start, end) <= 0) {
    return { start, end };
  }
  return { start: end, end: start };
}
export function parseDateInput(value?: string) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, monthIndex, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== monthIndex ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, monthIndex, day };
}
export function parseMonthInput(value?: string) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return null;
  return { year, monthIndex };
}
export function compareKstDates(
  a: { year: number; monthIndex: number; day: number },
  b: { year: number; monthIndex: number; day: number },
) {
  return (
    Date.UTC(a.year, a.monthIndex, a.day) -
    Date.UTC(b.year, b.monthIndex, b.day)
  );
}
export function diffKstDays(
  start: { year: number; monthIndex: number; day: number },
  end: { year: number; monthIndex: number; day: number },
) {
  return Math.max(0, Math.round(compareKstDates(end, start) / 86_400_000));
}
export function diffKstMonths(
  start: { year: number; monthIndex: number },
  end: { year: number; monthIndex: number },
) {
  return (end.year - start.year) * 12 + end.monthIndex - start.monthIndex;
}
export function formatFullDateLabel(parts: { year: number; monthIndex: number; day: number }) {
  return `${parts.year}.${String(parts.monthIndex + 1).padStart(2, "0")}.${String(parts.day).padStart(2, "0")}`;
}
export function kstParts(date: Date) {
  const shifted = new Date(date.getTime() + KST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    monthIndex: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
  };
}
export function kstDateToUtc(year: number, monthIndex: number, day: number) {
  return new Date(Date.UTC(year, monthIndex, day) - KST_OFFSET_MS);
}
export function addKstDays(year: number, monthIndex: number, day: number, delta: number) {
  const date = new Date(Date.UTC(year, monthIndex, day + delta));
  return {
    year: date.getUTCFullYear(),
    monthIndex: date.getUTCMonth(),
    day: date.getUTCDate(),
  };
}
export function addKstMonths(year: number, monthIndex: number, delta: number) {
  const date = new Date(Date.UTC(year, monthIndex + delta, 1));
  return {
    year: date.getUTCFullYear(),
    monthIndex: date.getUTCMonth(),
  };
}
export function daysInMonth(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}
export function monthKey(year: number, monthIndex: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}
export function dayKey(year: number, monthIndex: number, day: number) {
  return `${monthKey(year, monthIndex)}-${String(day).padStart(2, "0")}`;
}
