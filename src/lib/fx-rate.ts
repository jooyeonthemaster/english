import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Daily USD->KRW exchange rate, sourced from the ECB daily reference rate via
// the free Frankfurter API (no API key required). Rates are cached per KST date
// in the daily_fx_rates table and fetched lazily (self-healing): the first time
// a date is needed, we fetch + store it.
//
// 원가 환산 규칙: 어떤 날짜 D 에 발생한 원가는 **전일(D-1) 종가 기준 공식 환율**로
// 환산한다. ECB 기준환율은 당일 16:00 CET(≈KST 자정) 이후에야 고시되므로, 당일 원가를
// 당일 환율로 잡으면 값이 하루 종일 불안정하다. 전일 종가는 D 시작 시점에 이미 확정돼
// 있어 결정론적이고 매일 자동 갱신된다(회계·세무의 전일 매매기준율 관행과 동일).
// 주말/공휴일이면 Frankfurter 가 직전 영업일 종가를 반환한다.

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DEFAULT_USD_KRW_RATE = 1350;
const FRANKFURTER_BASE = "https://api.frankfurter.app";
const FETCH_TIMEOUT_MS = 5000;

// Per-process memo so a burst of cost rows for the same day hits the network /
// DB once. Serverless invocations are short-lived, so staleness is not a concern.
const memoryCache = new Map<string, number>();

export function kstDateString(date: Date): string {
  const shifted = new Date(date.getTime() + KST_OFFSET_MS);
  return [
    shifted.getUTCFullYear(),
    String(shifted.getUTCMonth() + 1).padStart(2, "0"),
    String(shifted.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

export function kstTodayString(): string {
  return kstDateString(new Date());
}

// 전일(D-1) KST 날짜 문자열. 주말/공휴일 보정은 Frankfurter 가 직전 영업일 종가를
// 반환하는 것으로 처리되므로 여기서는 단순 하루 차감만 한다.
export function previousKstDateString(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - 1);
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function envDefaultRate(): number {
  const raw = process.env.PLATFORM_USD_KRW_RATE;
  if (!raw || raw.trim() === "") return DEFAULT_USD_KRW_RATE;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_USD_KRW_RATE;
}

async function fetchFrankfurterUsdKrw(dateStr: string): Promise<number | null> {
  try {
    // Today/future has no published rate yet → ask for the latest available.
    const path = dateStr >= kstTodayString() ? "latest" : dateStr;
    const res = await fetch(`${FRANKFURTER_BASE}/${path}?from=USD&to=KRW`, {
      next: { revalidate: 60 * 60 },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { rates?: { KRW?: number } };
    const rate = json?.rates?.KRW;
    return typeof rate === "number" && rate > 0 ? rate : null;
  } catch {
    return null;
  }
}

// All DB access is wrapped so the FX feature degrades gracefully (to a fetched
// or default rate) even when the daily_fx_rates table is missing or the DB
// hiccups — it must never break the cost dashboard or cost recording.
async function readStoredRate(dateStr: string): Promise<number | null> {
  try {
    const existing = await prisma.dailyFxRate.findUnique({ where: { date: dateStr } });
    return existing ? Number(existing.rate) : null;
  } catch {
    return null;
  }
}

async function storeRate(dateStr: string, rate: number): Promise<void> {
  try {
    await prisma.dailyFxRate.upsert({
      where: { date: dateStr },
      create: {
        date: dateStr,
        base: "USD",
        quote: "KRW",
        rate: new Prisma.Decimal(rate),
        source: "FRANKFURTER",
      },
      update: {
        rate: new Prisma.Decimal(rate),
        source: "FRANKFURTER",
        fetchedAt: new Date(),
      },
    });
  } catch {
    // Ignore: unique-constraint race, or table not yet migrated.
  }
}

async function latestStoredRate(): Promise<number | null> {
  try {
    const latest = await prisma.dailyFxRate.findFirst({ orderBy: { date: "desc" } });
    return latest ? Number(latest.rate) : null;
  } catch {
    return null;
  }
}

// Returns the stored/fetched rate for a date, or null if unavailable
// (network failure + no cached row). Never falls back here.
async function loadOrFetch(dateStr: string): Promise<number | null> {
  const cached = memoryCache.get(dateStr);
  if (cached !== undefined) return cached;

  const stored = await readStoredRate(dateStr);
  if (stored !== null) {
    memoryCache.set(dateStr, stored);
    return stored;
  }

  const fetched = await fetchFrankfurterUsdKrw(dateStr);
  if (fetched && fetched > 0) {
    await storeRate(dateStr, fetched);
    memoryCache.set(dateStr, fetched);
    return fetched;
  }

  return null;
}

/**
 * Resolve the USD->KRW rate to apply to a cost incurred on `usageAt`.
 * 전일(D-1) 종가 기준 공식 환율을 사용한다(당일 환율 미고시 구간의 불안정성 제거).
 * Falls back to the most recent known rate, then the env/default rate.
 */
export async function resolveUsdKrwRate(usageAt: Date): Promise<number> {
  const dateStr = previousKstDateString(kstDateString(usageAt));
  const direct = await loadOrFetch(dateStr);
  if (direct !== null) return direct;

  const latest = await latestStoredRate();
  if (latest !== null) return latest;

  return envDefaultRate();
}

export interface UsdKrwRateInfo {
  rate: number;
  /** 적용된 환율의 기준일 = 요청일의 전일(종가 기준일). */
  date: string;
  source: "ECB" | "기본값";
}

/**
 * Resolve the rate for display on the cost dashboard for costs dated `dateStr`.
 * 원가 기록과 동일하게 전일(D-1) 종가 기준 환율을 반환하고, `date`에는 그 기준일을 담는다.
 */
export async function getUsdKrwRate(dateStr: string): Promise<UsdKrwRateInfo> {
  const rateDate = previousKstDateString(dateStr);
  const direct = await loadOrFetch(rateDate);
  if (direct !== null) return { rate: direct, date: rateDate, source: "ECB" };

  const latest = await latestStoredRate();
  if (latest !== null) return { rate: latest, date: rateDate, source: "ECB" };

  return { rate: envDefaultRate(), date: rateDate, source: "기본값" };
}
