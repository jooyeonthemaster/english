import "server-only";

import { BigQuery } from "@google-cloud/bigquery";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type ProviderBillingSyncTarget = "ALL" | "GOOGLE" | "OPENROUTER";

export interface ProviderBillingSyncStatus {
  googleConfigured: boolean;
  atlasConfigured: boolean;
  /** OpenRouter 활동(실지출) 동기화 가능 여부 — management key 필요. */
  openRouterConfigured: boolean;
  missingEnv: string[];
}

export interface ProviderBillingSyncResult {
  provider: "GOOGLE" | "OPENROUTER";
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
const OPENROUTER_BILLING_SOURCE = "OPENROUTER_ACTIVITY";
const OPENROUTER_ACTIVITY_URL = "https://openrouter.ai/api/v1/activity";
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
  const atlasConfigured = Boolean(
    readEnv("ATLASCLOUD_TEXT_API_KEY") ||
      readEnv("ATLASCLOUD_API_KEY") ||
      readEnv("OPENROUTER_API_KEY"),
  );
  // /api/v1/activity 는 일반 추론 키가 아니라 management key 를 요구한다
  // (openrouter.ai/settings/management-keys 에서 발급, 읽기 전용).
  const openRouterConfigured = Boolean(readOpenRouterManagementKey());

  if (!googleConfigured) missingEnv.push("GOOGLE_BILLING_BIGQUERY_TABLE");
  if (!openRouterConfigured) missingEnv.push("OPENROUTER_MANAGEMENT_KEY");

  return {
    googleConfigured,
    atlasConfigured,
    openRouterConfigured,
    missingEnv,
  };
}

function readOpenRouterManagementKey(): string | null {
  return (
    readEnv("OPENROUTER_MANAGEMENT_KEY") ?? readEnv("OPENROUTER_PROVISIONING_KEY")
  );
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
  if (target === "ALL" || target === "OPENROUTER") {
    results.push(await syncOpenRouterActivity(periodStart, periodEnd, usdToKrwRate));
  }

  return results;
}

interface OpenRouterActivityRow {
  date?: string;
  model?: string;
  model_permaslug?: string;
  endpoint_id?: string;
  provider_name?: string;
  /** 해당 일×모델×엔드포인트의 실지출(USD). */
  usage?: number;
  /** BYOK 요청의 upstream 실비(USD) — usage 와 합산해야 총지출. */
  byok_usage_inference?: number;
  requests?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  reasoning_tokens?: number;
}

/**
 * OpenRouter 활동 API(GET /api/v1/activity)에서 일 단위 실지출을 끌어와
 * ProviderBillingReconciliation(source=OPENROUTER_ACTIVITY)로 적재한다.
 * 원장(토큰×단가/RECORDED)과 독립적인 "계정 실지출" 대사 축.
 *
 * 제약: management key 필요, 최근 30 완료 UTC 일만 제공(오늘/부분일 미포함).
 */
async function syncOpenRouterActivity(
  periodStart: Date,
  periodEnd: Date,
  usdToKrwRate: number,
): Promise<ProviderBillingSyncResult> {
  const managementKey = readOpenRouterManagementKey();
  if (!managementKey) {
    return skipped(
      "OPENROUTER",
      "OPENROUTER_MANAGEMENT_KEY is not configured (management key required for /activity).",
    );
  }

  const response = await fetch(OPENROUTER_ACTIVITY_URL, {
    headers: { Authorization: `Bearer ${managementKey}` },
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `OpenRouter activity API failed (HTTP ${response.status}): ${body.slice(0, 300)}`,
    );
  }
  const payload = (await response.json()) as { data?: OpenRouterActivityRow[] };
  const rows = Array.isArray(payload.data) ? payload.data : [];

  // 일 단위로 합산(모델×엔드포인트 → 일 총액). 날짜는 UTC 완료일 기준.
  const daily = new Map<
    string,
    { costUsd: number; requests: number; models: Set<string> }
  >();
  for (const row of rows) {
    const date = typeof row.date === "string" ? row.date.slice(0, 10) : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const dayStart = new Date(`${date}T00:00:00.000Z`);
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);
    if (dayEnd <= periodStart || dayStart >= periodEnd) continue;

    const usage = Number(row.usage ?? 0);
    const byok = Number(row.byok_usage_inference ?? 0);
    const costUsd =
      (Number.isFinite(usage) ? usage : 0) + (Number.isFinite(byok) ? byok : 0);
    const entry =
      daily.get(date) ?? { costUsd: 0, requests: 0, models: new Set<string>() };
    entry.costUsd += costUsd;
    entry.requests += Number.isFinite(Number(row.requests)) ? Number(row.requests) : 0;
    if (row.model) entry.models.add(row.model);
    daily.set(date, entry);
  }

  const importRows = [...daily.entries()]
    .filter(([, entry]) => Math.abs(entry.costUsd) > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, entry]) => {
      const dayStart = new Date(`${date}T00:00:00.000Z`);
      return {
        provider: "OPENROUTER",
        unitType: null,
        modelPattern: null,
        periodStart: dayStart,
        periodEnd: new Date(dayStart.getTime() + 86_400_000),
        actualCostUsd: entry.costUsd,
        actualCostKrw: Math.round(entry.costUsd * usdToKrwRate),
        usdToKrwRate,
        source: OPENROUTER_BILLING_SOURCE,
        referenceId: `openrouter:${date}`,
        notes: `OpenRouter activity (UTC day). requests=${entry.requests}, models=${entry.models.size}`,
      } satisfies BillingImportRow;
    });

  await replaceImportedRows(OPENROUTER_BILLING_SOURCE, periodStart, periodEnd, importRows);
  return summarizeImport("OPENROUTER", importRows);
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
