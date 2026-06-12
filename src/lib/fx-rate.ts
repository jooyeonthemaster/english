import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Daily USD->KRW exchange rate, sourced from the ECB daily reference rate via
// the free Frankfurter API (no API key required). Rates are cached per KST date
// in the daily_fx_rates table and fetched lazily (self-healing): the first time
// a date is needed, we fetch + store it. Platform API costs convert USD->KRW
// with the rate for the usage date instead of a fixed 1350 fallback.

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
 * Falls back to the most recent known rate, then the env/default rate.
 */
export async function resolveUsdKrwRate(usageAt: Date): Promise<number> {
  const dateStr = kstDateString(usageAt);
  const direct = await loadOrFetch(dateStr);
  if (direct !== null) return direct;

  const latest = await latestStoredRate();
  if (latest !== null) return latest;

  return envDefaultRate();
}

export interface UsdKrwRateInfo {
  rate: number;
  date: string;
  source: "ECB" | "기본값";
}

/**
 * Resolve the rate for display on the cost dashboard. Returns the rate for the
 * requested date, falling back to the latest stored rate, then the default.
 */
export async function getUsdKrwRate(dateStr: string): Promise<UsdKrwRateInfo> {
  const direct = await loadOrFetch(dateStr);
  if (direct !== null) return { rate: direct, date: dateStr, source: "ECB" };

  const latest = await latestStoredRate();
  if (latest !== null) return { rate: latest, date: dateStr, source: "ECB" };

  return { rate: envDefaultRate(), date: dateStr, source: "기본값" };
}
