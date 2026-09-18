import type { CostPeriodMode } from "@/actions/admin/operations-cost-types";

// 원가 분석 페이지의 기간 파라미터 계산·표시 포맷 — 순수 함수만(서버·클라이언트 공용).

export type CostView = "dashboard" | "margin" | "settings";

export const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function resolveCostView(raw?: string): CostView {
  return raw === "margin" ? "margin" : raw === "settings" ? "settings" : "dashboard";
}

export function buildPreviousNextHref({
  mode,
  dateValue,
  monthValue,
  startValue,
  endValue,
  direction,
  view,
}: {
  mode: CostPeriodMode;
  dateValue: string;
  monthValue: string;
  startValue: string | null;
  endValue: string | null;
  direction: -1 | 1;
  view?: CostView;
}) {
  const params = new URLSearchParams({ mode });
  if (view) params.set("view", view);
  if (startValue && endValue) {
    const span = diffInputDays(startValue, endValue) + 1;
    params.set("start", addDaysInput(startValue, span * direction));
    params.set("end", addDaysInput(endValue, span * direction));
    return `/admin/costs?${params.toString()}`;
  }

  if (mode === "monthly") {
    params.set("month", addMonthsInput(monthValue, direction));
  } else {
    params.set("date", addDaysInput(dateValue, direction));
  }
  return `/admin/costs?${params.toString()}`;
}

export function todayKstInput() {
  const shifted = new Date(Date.now() + KST_OFFSET_MS);
  return [
    shifted.getUTCFullYear(),
    String(shifted.getUTCMonth() + 1).padStart(2, "0"),
    String(shifted.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

export function normalizeDateInput(value?: string) {
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
  return `${match[1]}-${match[2]}-${match[3]}`;
}

export function normalizeMonthInput(value?: string) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return `${match[1]}-${match[2]}`;
}

export function addDaysInput(value: string, delta: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + delta));
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

export function addMonthsInput(value: string, delta: number) {
  const [year, month] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
  ].join("-");
}

export function lastDayOfMonthInput(value: string) {
  const [year, month] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month, 0));
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

// 기능별 마진 원가 집계 기간을 KST 반열림 구간 [start, end) 으로 변환.
export function resolveMarginRange(args: {
  mode: CostPeriodMode;
  dateValue: string;
  monthValue: string;
  startValue: string | null;
  endValue: string | null;
}): { range: { start: Date; end: Date }; label: string; displayDate: string } {
  const kstStart = (d: string) => new Date(`${d}T00:00:00+09:00`);
  const dayAfter = (d: string) =>
    new Date(kstStart(d).getTime() + 24 * 60 * 60 * 1000);
  const dot = (d: string) => d.replace(/-/g, "."); // 2026-07-02 → 2026.07.02

  if (args.startValue && args.endValue) {
    const [s, e] =
      args.startValue <= args.endValue
        ? [args.startValue, args.endValue]
        : [args.endValue, args.startValue];
    return {
      range: { start: kstStart(s), end: dayAfter(e) },
      label: `${dot(s)} ~ ${dot(e)}`,
      displayDate: e,
    };
  }

  if (args.mode === "monthly") {
    const first = `${args.monthValue}-01`;
    const last = lastDayOfMonthInput(args.monthValue);
    return {
      range: { start: kstStart(first), end: dayAfter(last) },
      label: dot(args.monthValue),
      displayDate: last,
    };
  }

  return {
    range: { start: kstStart(args.dateValue), end: dayAfter(args.dateValue) },
    label: dot(args.dateValue),
    displayDate: args.dateValue,
  };
}

export function diffInputDays(start: string, end: string) {
  const [startYear, startMonth, startDay] = start.split("-").map(Number);
  const [endYear, endMonth, endDay] = end.split("-").map(Number);
  return Math.max(
    0,
    Math.round(
      (Date.UTC(endYear, endMonth - 1, endDay) -
        Date.UTC(startYear, startMonth - 1, startDay)) /
        86_400_000,
    ),
  );
}

export function formatKstDate(iso: string) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "-";
  return formatKstDateFromMs(date.getTime());
}

export function formatKstInclusiveEndDate(iso: string) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "-";
  return formatKstDateFromMs(date.getTime() - 1);
}

function formatKstDateFromMs(ms: number) {
  const shifted = new Date(ms + KST_OFFSET_MS);
  return [
    shifted.getUTCFullYear(),
    String(shifted.getUTCMonth() + 1).padStart(2, "0"),
    String(shifted.getUTCDate()).padStart(2, "0"),
  ].join(".");
}

/**
 * 마진 등 백분율 표시. null = 매출 0이라 정의할 수 없는 기간(operations-cost-types.ts marginPercent).
 * "0.0%" 로 보이면 「본전」으로 오독되므로 "—" 로 구분한다.
 */
export function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}%`;
}

export function formatBadgeDate(dateStr: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  return match ? `${match[2]}.${match[3]}` : dateStr;
}

export function summaryMetricLabel(
  mode: "bucket" | "range",
  summaryLabel: string,
  metric: string,
) {
  return mode === "range" ? `선택 기간 ${metric}` : `${summaryLabel} ${metric}`;
}
