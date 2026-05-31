import "server-only";

import { BigQuery } from "@google-cloud/bigquery";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type ProviderBillingSyncTarget = "ALL" | "GOOGLE" | "ANTHROPIC";

export interface ProviderBillingSyncStatus {
  googleConfigured: boolean;
  anthropicConfigured: boolean;
  missingEnv: string[];
}

export interface ProviderBillingSyncResult {
  provider: "GOOGLE" | "ANTHROPIC";
  importedRows: number;
  actualCostUsd: number;
  actualCostKrw: number;
  skippedReason?: string;
}

type BillingImportRow = {
  provider: string;
  unitType: string | null;
  modelPattern: string | null;
  periodStart: Date;
  periodEnd: Date;
  actualCostUsd: number;
  actualCostKrw: number;
  usdToKrwRate: number;
  source: string;
  referenceId: string;
  notes: string | null;
};

const DEFAULT_USD_KRW_RATE = 1350;
const GOOGLE_BILLING_SOURCE = "GOOGLE_BILLING_EXPORT";
const ANTHROPIC_BILLING_SOURCE = "ANTHROPIC_COST_REPORT";
const DEFAULT_GOOGLE_BILLING_PATTERNS = [
  "%gemini%",
  "%generative ai%",
  "%generative language%",
  "%document ai%",
  "%cloud document ai%",
];

export function getProviderBillingSyncStatus(): ProviderBillingSyncStatus {
  const missingEnv: string[] = [];
  const googleConfigured = Boolean(readEnv("GOOGLE_BILLING_BIGQUERY_TABLE"));
  const anthropicConfigured = Boolean(readEnv("ANTHROPIC_ADMIN_KEY"));

  if (!googleConfigured) missingEnv.push("GOOGLE_BILLING_BIGQUERY_TABLE");
  if (!anthropicConfigured) missingEnv.push("ANTHROPIC_ADMIN_KEY");

  return {
    googleConfigured,
    anthropicConfigured,
    missingEnv,
  };
}

export async function syncProviderBillingCostsForRange({
  target,
  periodStart,
  periodEnd,
  usdToKrwRate = readNumberEnv("PLATFORM_BILLING_USD_KRW_RATE", readNumberEnv("PLATFORM_USD_KRW_RATE", DEFAULT_USD_KRW_RATE)),
}: {
  target: ProviderBillingSyncTarget;
  periodStart: Date;
  periodEnd: Date;
  usdToKrwRate?: number;
}): Promise<ProviderBillingSyncResult[]> {
  const results: ProviderBillingSyncResult[] = [];

  if (target === "ALL" || target === "GOOGLE") {
    results.push(await syncGoogleBillingExport(periodStart, periodEnd, usdToKrwRate));
  }
  if (target === "ALL" || target === "ANTHROPIC") {
    results.push(await syncAnthropicCostReport(periodStart, periodEnd, usdToKrwRate));
  }

  return results;
}

async function syncGoogleBillingExport(
  periodStart: Date,
  periodEnd: Date,
  usdToKrwRate: number,
): Promise<ProviderBillingSyncResult> {
  const table = readEnv("GOOGLE_BILLING_BIGQUERY_TABLE");
  if (!table) {
    return skipped("GOOGLE", "GOOGLE_BILLING_BIGQUERY_TABLE is not configured.");
  }

  const tableRef = quoteBigQueryTable(table);
  const patterns = readListEnv("GOOGLE_BILLING_SERVICE_PATTERNS")
    .map((pattern) => `%${pattern.toLowerCase().replaceAll("%", "")}%`);
  const servicePatterns = patterns.length > 0 ? patterns : DEFAULT_GOOGLE_BILLING_PATTERNS;
  const location = readEnv("GOOGLE_BILLING_BIGQUERY_LOCATION") || undefined;
  const bigQuery = createBigQueryClient();

  const query = `
    SELECT
      FORMAT_DATE('%F', DATE(usage_start_time, 'Asia/Seoul')) AS usage_date,
      CASE
        WHEN LOWER(service.description) LIKE '%document ai%'
          OR LOWER(sku.description) LIKE '%document ai%'
          OR LOWER(sku.description) LIKE '%ocr%'
        THEN 'GOOGLE_DOCUMENT_AI'
        ELSE 'GOOGLE_GEMINI'
      END AS provider,
      currency,
      CAST(SUM(CAST(cost AS NUMERIC) + IFNULL((SELECT SUM(CAST(credit.amount AS NUMERIC)) FROM UNNEST(credits) AS credit), 0)) AS FLOAT64) AS net_cost,
      CAST(SUM(CAST(cost AS NUMERIC)) AS FLOAT64) AS gross_cost,
      CAST(SUM(IFNULL((SELECT SUM(CAST(credit.amount AS NUMERIC)) FROM UNNEST(credits) AS credit), 0)) AS FLOAT64) AS credit_amount
    FROM ${tableRef}
    WHERE usage_start_time >= TIMESTAMP(@periodStart)
      AND usage_start_time < TIMESTAMP(@periodEnd)
      AND EXISTS (
        SELECT 1
        FROM UNNEST(@servicePatterns) AS pattern
        WHERE LOWER(service.description) LIKE pattern
          OR LOWER(sku.description) LIKE pattern
      )
    GROUP BY usage_date, provider, currency
    HAVING ABS(net_cost) > 0
    ORDER BY usage_date ASC, provider ASC
  `;

  const [rows] = await bigQuery.query({
    query,
    location,
    params: {
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      servicePatterns,
    },
  });

  const importRows = rows.map((row) => {
    const usageDate = String(row.usage_date);
    const provider = String(row.provider);
    const currency = String(row.currency || "USD").toUpperCase();
    const netCost = Number(row.net_cost ?? 0);
    const normalized = normalizeCurrencyAmount(netCost, currency, usdToKrwRate);
    const dayStart = new Date(`${usageDate}T00:00:00.000+09:00`);
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);
    return {
      provider,
      unitType: null,
      modelPattern: null,
      periodStart: dayStart,
      periodEnd: dayEnd,
      actualCostUsd: normalized.usd,
      actualCostKrw: normalized.krw,
      usdToKrwRate,
      source: GOOGLE_BILLING_SOURCE,
      referenceId: `google-bq:${usageDate}:${provider}:${currency}`,
      notes: `Google Billing Export net cost. currency=${currency}, gross=${Number(row.gross_cost ?? 0).toFixed(6)}, credits=${Number(row.credit_amount ?? 0).toFixed(6)}`,
    } satisfies BillingImportRow;
  });

  await replaceImportedRows(GOOGLE_BILLING_SOURCE, periodStart, periodEnd, importRows);
  return summarizeImport("GOOGLE", importRows);
}

async function syncAnthropicCostReport(
  periodStart: Date,
  periodEnd: Date,
  usdToKrwRate: number,
): Promise<ProviderBillingSyncResult> {
  const adminKey = readEnv("ANTHROPIC_ADMIN_KEY");
  if (!adminKey) {
    return skipped("ANTHROPIC", "ANTHROPIC_ADMIN_KEY is not configured.");
  }

  const rows: BillingImportRow[] = [];
  let page: string | null = null;

  do {
    const url = new URL("https://api.anthropic.com/v1/organizations/cost_report");
    url.searchParams.set("starting_at", periodStart.toISOString());
    url.searchParams.set("ending_at", periodEnd.toISOString());
    url.searchParams.set("limit", "31");
    url.searchParams.append("group_by[]", "description");
    if (page) url.searchParams.set("page", page);

    const response = await fetch(url, {
      headers: {
        "anthropic-version": "2023-06-01",
        "x-api-key": adminKey,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Anthropic cost report failed: ${response.status} ${body.slice(0, 300)}`);
    }

    const payload = (await response.json()) as {
      data?: Array<{
        starting_at: string;
        ending_at: string;
        results?: Array<{ amount?: string; currency?: string }>;
      }>;
      has_more?: boolean;
      next_page?: string | null;
    };

    for (const bucket of payload.data ?? []) {
      const amountMinor = (bucket.results ?? []).reduce(
        (sum, item) => sum + Number(item.amount ?? 0),
        0,
      );
      if (amountMinor === 0) continue;

      const actualCostUsd = amountMinor / 100;
      rows.push({
        provider: "ANTHROPIC",
        unitType: null,
        modelPattern: null,
        periodStart: new Date(bucket.starting_at),
        periodEnd: new Date(bucket.ending_at),
        actualCostUsd,
        actualCostKrw: Math.round(actualCostUsd * usdToKrwRate),
        usdToKrwRate,
        source: ANTHROPIC_BILLING_SOURCE,
        referenceId: `anthropic-cost:${bucket.starting_at}:${bucket.ending_at}`,
        notes: "Anthropic Admin Cost Report. Amount is converted from lowest USD units.",
      });
    }

    page = payload.has_more ? payload.next_page ?? null : null;
  } while (page);

  await replaceImportedRows(ANTHROPIC_BILLING_SOURCE, periodStart, periodEnd, rows);
  return summarizeImport("ANTHROPIC", rows);
}

async function replaceImportedRows(
  source: string,
  periodStart: Date,
  periodEnd: Date,
  rows: BillingImportRow[],
) {
  await prisma.$transaction(async (tx) => {
    await tx.providerBillingReconciliation.deleteMany({
      where: {
        source,
        periodStart: { gte: periodStart, lt: periodEnd },
      },
    });

    if (rows.length === 0) return;

    await tx.providerBillingReconciliation.createMany({
      data: rows.map((row) => ({
        provider: row.provider,
        unitType: row.unitType,
        modelPattern: row.modelPattern,
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
        actualCostUsd: new Prisma.Decimal(row.actualCostUsd),
        actualCostKrw: row.actualCostKrw,
        usdToKrwRate: new Prisma.Decimal(row.usdToKrwRate),
        source: row.source,
        referenceId: row.referenceId,
        notes: row.notes,
      })),
    });
  });
}

function createBigQueryClient() {
  const projectId = readEnv("GOOGLE_BILLING_BIGQUERY_PROJECT_ID") || undefined;
  const serviceAccountB64 = readEnv("GOOGLE_BILLING_SERVICE_ACCOUNT_B64");
  if (!serviceAccountB64) return new BigQuery({ projectId });

  const credentials = JSON.parse(Buffer.from(serviceAccountB64, "base64").toString("utf8")) as {
    client_email?: string;
    private_key?: string;
    project_id?: string;
  };

  return new BigQuery({
    projectId: projectId ?? credentials.project_id,
    credentials,
  });
}

function quoteBigQueryTable(table: string) {
  const normalized = table.replace(/^`|`$/g, "").trim();
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_]+\.[A-Za-z0-9_]+$/.test(normalized)) {
    throw new Error("GOOGLE_BILLING_BIGQUERY_TABLE must be project.dataset.table.");
  }
  return `\`${normalized}\``;
}

function normalizeCurrencyAmount(amount: number, currency: string, usdToKrwRate: number) {
  if (currency === "KRW") {
    return {
      usd: amount / usdToKrwRate,
      krw: Math.round(amount),
    };
  }

  return {
    usd: amount,
    krw: Math.round(amount * usdToKrwRate),
  };
}

function summarizeImport(
  provider: ProviderBillingSyncResult["provider"],
  rows: BillingImportRow[],
): ProviderBillingSyncResult {
  return {
    provider,
    importedRows: rows.length,
    actualCostUsd: rows.reduce((sum, row) => sum + row.actualCostUsd, 0),
    actualCostKrw: rows.reduce((sum, row) => sum + row.actualCostKrw, 0),
  };
}

function skipped(
  provider: ProviderBillingSyncResult["provider"],
  skippedReason: string,
): ProviderBillingSyncResult {
  return {
    provider,
    importedRows: 0,
    actualCostUsd: 0,
    actualCostKrw: 0,
    skippedReason,
  };
}

function readListEnv(name: string) {
  return (readEnv(name) ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function readNumberEnv(name: string, fallback: number) {
  const raw = readEnv(name);
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function readEnv(name: string) {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : null;
}
