"use server";

import { revalidatePath } from "next/cache";
import { OPERATION_LABELS, type OperationType } from "@/lib/credit-costs";
import { getUsdKrwRate, kstTodayString } from "@/lib/fx-rate";
import { syncPlatformApiUsageCostsForRange } from "@/lib/platform-api-costs";
import {
  getProviderBillingSyncStatus,
  syncProviderBillingCostsForRange,
  type ProviderBillingSyncTarget,
} from "@/lib/provider-billing-sync";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth-admin";

export type CostPeriodMode = "daily" | "monthly";
export type CostSummaryMode = "bucket" | "range";

export interface OperationsCostOptions {
  date?: string;
  month?: string;
  startDate?: string;
  endDate?: string;
}

export interface CostBucket {
  key: string;
  label: string;
  revenueKrw: number;
  variableCostKrw: number;
  fixedCostKrw: number;
  totalCostKrw: number;
  profitKrw: number;
  marginPercent: number;
  apiCalls: number;
  unpricedCalls: number;
  inputTokens: number;
  outputTokens: number;
  creditsConsumed: number;
}

export interface CostSourceSummary {
  key: string;
  label: string;
  calls: number;
  unpricedCalls: number;
  unpricedInputTokens: number;
  unpricedOutputTokens: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  costKrw: number;
}

export interface CreditOperationSummary {
  operationType: string;
  label: string;
  credits: number;
  transactionCount: number;
}

export interface AcademyUsageSummary {
  academyId: string | null;
  name: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  costKrw: number;
}

export interface ProviderPricingSummary {
  id: string;
  provider: string;
  modelPattern: string | null;
  unitType: string;
  inputUsdPer1M: number | null;
  outputUsdPer1M: number | null;
  unitUsd: number | null;
  usdToKrwRate: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  notes: string | null;
}

export interface BillingReconciliationSummary {
  id: string;
  provider: string;
  unitType: string | null;
  modelPattern: string | null;
  periodStart: string;
  periodEnd: string;
  actualCostUsd: number;
  actualCostKrw: number;
  estimatedCostUsd: number;
  estimatedCostKrw: number;
  deltaKrw: number;
  source: string;
  referenceId: string | null;
  notes: string | null;
}

export interface OperationsCostDashboard {
  mode: CostPeriodMode;
  summaryMode: CostSummaryMode;
  summaryLabel: string;
  rangeLabel: string;
  generatedAt: string;
  usdToKrwRate: number;
  fxRate: {
    rate: number;
    date: string;
    source: string;
  };
  pricing: {
    fixedMonthlyCostKrw: number;
    hasGeminiPricing: boolean;
    hasAnthropicPricing: boolean;
    hasDocumentAiPricing: boolean;
    hasWebtoonPricing: boolean;
  };
  totals: {
    revenueKrw: number;
    variableCostKrw: number;
    fixedCostKrw: number;
    totalCostKrw: number;
    profitKrw: number;
    marginPercent: number;
    apiCalls: number;
    unpricedCalls: number;
    inputTokens: number;
    outputTokens: number;
    creditsConsumed: number;
  };
  current: CostBucket;
  buckets: CostBucket[];
  sources: CostSourceSummary[];
  creditOperations: CreditOperationSummary[];
  academyUsage: AcademyUsageSummary[];
  providerPricings: ProviderPricingSummary[];
  billingReconciliation: {
    hasActual: boolean;
    actualCostUsd: number;
    actualCostKrw: number;
    estimatedCostUsd: number;
    estimatedCostKrw: number;
    adjustmentKrw: number;
    actualVariableCostKrw: number;
    actualTotalCostKrw: number;
    actualProfitKrw: number;
    rows: BillingReconciliationSummary[];
  };
  billingSync: {
    googleConfigured: boolean;
    anthropicConfigured: boolean;
    missingEnv: string[];
  };
  activeSubscriptions: {
    count: number;
    estimatedMrrKrw: number;
  };
  missingPricingKeys: string[];
  unpricedUsage: {
    calls: number;
    inputTokens: number;
    outputTokens: number;
  };
  untracked: {
    workbenchJobs: number;
    workbenchCredits: number;
    directCreditTransactions: number;
    directCredits: number;
  };
}

type BucketAccumulator = {
  key: string;
  label: string;
  revenueKrw: number;
  variableCostKrw: number;
  fixedCostKrw: number;
  apiCalls: number;
  unpricedCalls: number;
  inputTokens: number;
  outputTokens: number;
  creditsConsumed: number;
};

type SourceAccumulator = {
  key: string;
  label: string;
  calls: number;
  unpricedCalls: number;
  unpricedInputTokens: number;
  unpricedOutputTokens: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  costKrw: number;
};

type AcademyUsageAccumulator = {
  academyId: string | null;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  costKrw: number;
};

type PricingConfig = {
  usdToKrwRate: number;
  geminiInputUsdPer1M: number | null;
  geminiOutputUsdPer1M: number | null;
  anthropicInputUsdPer1M: number | null;
  anthropicOutputUsdPer1M: number | null;
  documentAiPageCostUsd: number | null;
  webtoonImageCostUsd: number | null;
  fixedMonthlyCostKrw: number;
};

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DEFAULT_USD_KRW_RATE = 1350;
const DAILY_BUCKET_COUNT = 30;
const MONTHLY_BUCKET_COUNT = 12;

export async function getOperationsCostDashboard(
  mode: CostPeriodMode = "daily",
  options: OperationsCostOptions = {},
): Promise<OperationsCostDashboard> {
  await requireAdminAuth();

  const normalizedMode: CostPeriodMode = mode === "monthly" ? "monthly" : "daily";
  const pricing = readPricingConfig();
  const missingPricingKeys = new Set<string>();
  const range = buildRange(normalizedMode, options);
  // In bucket mode (single 일별/월별 selection) the breakdown panels — 원가 구성,
  // 학원별 사용량, 크레딧 사용 — aggregate only the selected day/month. In custom
  // range mode they cover the whole range. The 일별/월별 손익 trend table always
  // spans the full window regardless (it is the time series).
  const isInSummaryScope = (key: string) =>
    range.summaryMode === "range" || key === range.summaryKey;
  const buckets = new Map<string, BucketAccumulator>(
    range.buckets.map((bucket) => [
      bucket.key,
      {
        key: bucket.key,
        label: bucket.label,
        revenueKrw: 0,
        variableCostKrw: 0,
        fixedCostKrw: fixedCostForBucket(
          bucket,
          normalizedMode,
          pricing.fixedMonthlyCostKrw,
          range.start,
          range.end,
        ),
        apiCalls: 0,
        unpricedCalls: 0,
        inputTokens: 0,
        outputTokens: 0,
        creditsConsumed: 0,
      },
    ]),
  );
  const sources = new Map<string, SourceAccumulator>();
  const academyUsageMap = new Map<string, AcademyUsageAccumulator>();

  await syncPlatformApiUsageCostsForRange(range.start, range.end);

  const [
    subscriptionPayments,
    creditTopUps,
    apiUsageCosts,
    creditTransactions,
    activeSubscriptions,
    workbenchJobs,
    activePricingRows,
    providerPricings,
    billingReconciliations,
  ] = await Promise.all([
    prisma.subscriptionPayment.findMany({
      where: {
        status: "PAID",
        OR: [
          { paidAt: { gte: range.start, lt: range.end } },
          { paidAt: null, completedAt: { gte: range.start, lt: range.end } },
        ],
      },
      select: {
        amount: true,
        paidAmount: true,
        paidAt: true,
        completedAt: true,
      },
    }),
    prisma.creditTopUp.findMany({
      where: {
        status: "COMPLETED",
        OR: [
          { paidAt: { gte: range.start, lt: range.end } },
          { paidAt: null, completedAt: { gte: range.start, lt: range.end } },
        ],
      },
      select: {
        price: true,
        paidAmount: true,
        paidAt: true,
        completedAt: true,
      },
    }),
    prisma.platformApiUsageCost.findMany({
      where: {
        usageAt: { gte: range.start, lt: range.end },
      },
      select: {
        usageAt: true,
        academyId: true,
        sourceType: true,
        sourceDetail: true,
        provider: true,
        model: true,
        unitType: true,
        calls: true,
        inputTokens: true,
        outputTokens: true,
        costUsd: true,
        costKrw: true,
        pricingSource: true,
      },
    }),
    prisma.creditTransaction.findMany({
      where: {
        createdAt: { gte: range.start, lt: range.end },
        type: { in: ["CONSUMPTION", "REFUND"] },
      },
      select: {
        createdAt: true,
        type: true,
        amount: true,
        operationType: true,
        referenceType: true,
      },
    }),
    prisma.academySubscription.findMany({
      where: { status: { in: ["ACTIVE", "TRIAL"] } },
      include: { plan: { select: { monthlyPrice: true } } },
    }),
    prisma.workbenchAiJob.findMany({
      where: {
        createdAt: { gte: range.start, lt: range.end },
        status: { in: ["COMPLETED", "PARTIAL", "FAILED"] },
      },
      select: {
        createdAt: true,
        creditTxId: true,
        domain: true,
      },
    }),
    prisma.providerPricing.findMany({
      where: { isActive: true },
      select: { provider: true, unitType: true },
    }),
    prisma.providerPricing.findMany({
      where: { isActive: true },
      orderBy: [{ provider: "asc" }, { unitType: "asc" }, { effectiveFrom: "desc" }],
      take: 20,
    }),
    prisma.providerBillingReconciliation.findMany({
      where: {
        periodStart: { lt: range.end },
        periodEnd: { gt: range.start },
      },
      orderBy: [{ periodStart: "desc" }, { createdAt: "desc" }],
      take: 30,
    }),
  ]);

  for (const payment of subscriptionPayments) {
    const key = bucketKeyForDate(payment.paidAt ?? payment.completedAt, normalizedMode);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.revenueKrw += payment.paidAmount ?? payment.amount;
  }

  for (const topUp of creditTopUps) {
    const key = bucketKeyForDate(topUp.paidAt ?? topUp.completedAt, normalizedMode);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.revenueKrw += topUp.paidAmount ?? topUp.price;
  }

  for (const cost of apiUsageCosts) {
    const key = bucketKeyForDate(cost.usageAt, normalizedMode);
    const bucket = buckets.get(key);
    if (!bucket) continue;

    // Trend buckets always span the full window.
    addBucketApiCost(bucket, {
      calls: cost.calls,
      pricingSource: cost.pricingSource,
      inputTokens: cost.inputTokens,
      outputTokens: cost.outputTokens,
      costKrw: cost.costKrw,
    });

    // Breakdown panels only aggregate the selected period.
    if (!isInSummaryScope(key)) continue;

    if (cost.pricingSource === "MISSING") {
      missingPricingKeys.add(formatMissingPricingKey(cost));
    }

    addSourceApiCost(sources, getApiCostSourceKey(cost), getApiCostSourceLabel(cost), {
      calls: cost.calls,
      pricingSource: cost.pricingSource,
      inputTokens: cost.inputTokens,
      outputTokens: cost.outputTokens,
      costUsd: Number(cost.costUsd),
      costKrw: cost.costKrw,
    });

    const academyKey = cost.academyId ?? "__unassigned__";
    const academyEntry =
      academyUsageMap.get(academyKey) ??
      {
        academyId: cost.academyId ?? null,
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        costKrw: 0,
      };
    academyEntry.calls += cost.calls;
    academyEntry.inputTokens += cost.inputTokens;
    academyEntry.outputTokens += cost.outputTokens;
    academyEntry.costUsd += Number(cost.costUsd);
    academyEntry.costKrw += cost.costKrw;
    academyUsageMap.set(academyKey, academyEntry);
  }

  const creditOperationMap = new Map<string, CreditOperationSummary>();
  for (const tx of creditTransactions) {
    const key = bucketKeyForDate(tx.createdAt, normalizedMode);
    const bucket = buckets.get(key);
    if (!bucket) continue;

    const signedCredits = tx.type === "REFUND" ? -Math.abs(tx.amount) : Math.abs(tx.amount);
    bucket.creditsConsumed += signedCredits;

    // 크레딧 사용 breakdown only aggregates the selected period.
    if (!isInSummaryScope(key)) continue;

    const operationType = tx.operationType ?? "UNKNOWN";
    const existing =
      creditOperationMap.get(operationType) ??
      {
        operationType,
        label: getOperationLabel(operationType),
        credits: 0,
        transactionCount: 0,
      };
    existing.credits += signedCredits;
    existing.transactionCount += 1;
    creditOperationMap.set(operationType, existing);
  }

  const rows = Array.from(buckets.values()).map(toCostBucket);
  const totals = toTotals(rows);
  const current = range.summaryMode === "range"
    ? totalsToCostBucket(totals, range.summaryLabel)
    : rows.find((row) => row.key === range.summaryKey) ?? rows[rows.length - 1] ?? emptyCostBucket();
  const activeSubscriptionMrr = activeSubscriptions.reduce(
    (sum, subscription) => sum + subscription.plan.monthlyPrice,
    0,
  );
  const sourceRows = Array.from(sources.values()).sort(
    (a, b) => b.costKrw - a.costKrw || b.unpricedCalls - a.unpricedCalls || b.calls - a.calls,
  );
  const unpricedUsage = sourceRows.reduce(
    (sum, source) => ({
      calls: sum.calls + source.unpricedCalls,
      inputTokens: sum.inputTokens + source.unpricedInputTokens,
      outputTokens: sum.outputTokens + source.unpricedOutputTokens,
    }),
    { calls: 0, inputTokens: 0, outputTokens: 0 },
  );
  const creditOperations = Array.from(creditOperationMap.values())
    .filter((item) => item.credits !== 0 || item.transactionCount > 0)
    .sort((a, b) => Math.abs(b.credits) - Math.abs(a.credits));
  const academyIds = Array.from(academyUsageMap.values())
    .map((entry) => entry.academyId)
    .filter((id): id is string => id !== null);
  const academyNames = academyIds.length
    ? await prisma.academy.findMany({
        where: { id: { in: academyIds } },
        select: { id: true, name: true },
      })
    : [];
  const academyNameMap = new Map(academyNames.map((academy) => [academy.id, academy.name]));
  const academyUsage: AcademyUsageSummary[] = Array.from(academyUsageMap.values())
    .map((entry) => ({
      academyId: entry.academyId,
      name: entry.academyId
        ? academyNameMap.get(entry.academyId) ?? "삭제된 학원"
        : "미지정",
      calls: entry.calls,
      inputTokens: entry.inputTokens,
      outputTokens: entry.outputTokens,
      costUsd: entry.costUsd,
      costKrw: entry.costKrw,
    }))
    .sort((a, b) => b.costKrw - a.costKrw || b.calls - a.calls);
  const untrackedWorkbenchCredits = creditTransactions
    .filter((tx) => tx.type === "CONSUMPTION" && tx.referenceType === "WORKBENCH_AI_JOB")
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
  const directCreditTransactions = creditTransactions.filter(
    (tx) =>
      tx.type === "CONSUMPTION" &&
      tx.referenceType !== "WORKBENCH_AI_JOB" &&
      tx.operationType !== "TEXT_EXTRACTION" &&
      tx.operationType !== "WEBTOON_IMAGE",
  );
  const directCredits = directCreditTransactions.reduce(
    (sum, tx) => sum + Math.abs(tx.amount),
    0,
  );
  const today = kstTodayString();
  const displayRateDate =
    normalizedMode === "daily" && range.summaryMode === "bucket" && range.summaryKey
      ? range.summaryKey
      : today;
  const fxRate = await getUsdKrwRate(displayRateDate > today ? today : displayRateDate);
  // Self-heal today's rate even when viewing a past day, so it stays fresh daily.
  if (displayRateDate !== today) {
    await getUsdKrwRate(today);
  }
  const billingReconciliation = buildBillingReconciliationSummary(
    billingReconciliations,
    apiUsageCosts,
    range.start,
    range.end,
    totals.variableCostKrw,
    totals.totalCostKrw,
    totals.profitKrw,
  );

  return {
    mode: normalizedMode,
    summaryMode: range.summaryMode,
    summaryLabel: range.summaryLabel,
    rangeLabel: `${range.buckets[0]?.label ?? ""} - ${range.buckets[range.buckets.length - 1]?.label ?? ""}`,
    generatedAt: new Date().toISOString(),
    usdToKrwRate: fxRate.rate,
    fxRate,
    pricing: {
      fixedMonthlyCostKrw: pricing.fixedMonthlyCostKrw,
      hasGeminiPricing:
        hasProviderPricing(activePricingRows, "GOOGLE_GEMINI", "TOKENS") ||
        (pricing.geminiInputUsdPer1M !== null && pricing.geminiOutputUsdPer1M !== null),
      hasAnthropicPricing:
        hasProviderPricing(activePricingRows, "ANTHROPIC", "TOKENS") ||
        (pricing.anthropicInputUsdPer1M !== null && pricing.anthropicOutputUsdPer1M !== null),
      hasDocumentAiPricing:
        hasProviderPricing(activePricingRows, "GOOGLE_DOCUMENT_AI", "PAGE") ||
        pricing.documentAiPageCostUsd !== null,
      hasWebtoonPricing:
        hasProviderPricing(activePricingRows, "ATLASCLOUD", "IMAGE") ||
        pricing.webtoonImageCostUsd !== null,
    },
    totals,
    current,
    buckets: rows,
    sources: sourceRows,
    creditOperations,
    academyUsage,
    providerPricings: providerPricings.map((row) => ({
      id: row.id,
      provider: row.provider,
      modelPattern: row.modelPattern,
      unitType: row.unitType,
      inputUsdPer1M: row.inputUsdPer1M === null ? null : Number(row.inputUsdPer1M),
      outputUsdPer1M: row.outputUsdPer1M === null ? null : Number(row.outputUsdPer1M),
      unitUsd: row.unitUsd === null ? null : Number(row.unitUsd),
      usdToKrwRate: Number(row.usdToKrwRate),
      effectiveFrom: row.effectiveFrom.toISOString(),
      effectiveTo: row.effectiveTo?.toISOString() ?? null,
      notes: row.notes,
    })),
    billingReconciliation,
    billingSync: getProviderBillingSyncStatus(),
    activeSubscriptions: {
      count: activeSubscriptions.length,
      estimatedMrrKrw: activeSubscriptionMrr,
    },
    missingPricingKeys: Array.from(missingPricingKeys).sort(),
    unpricedUsage,
    untracked: {
      workbenchJobs: workbenchJobs.length,
      workbenchCredits: untrackedWorkbenchCredits,
      directCreditTransactions: directCreditTransactions.length,
      directCredits,
    },
  };
}

export async function createProviderPricing(formData: FormData) {
  await requireAdminAuth("SUPER_ADMIN");

  const provider = readFormString(formData, "provider");
  const unitType = readFormString(formData, "unitType");
  const modelPattern = readFormString(formData, "modelPattern") || null;
  const inputUsdPer1M = readOptionalFormNumber(formData, "inputUsdPer1M");
  const outputUsdPer1M = readOptionalFormNumber(formData, "outputUsdPer1M");
  const unitUsd = readOptionalFormNumber(formData, "unitUsd");
  const usdToKrwRate =
    readOptionalFormNumber(formData, "usdToKrwRate") ??
    readNumberEnv("PLATFORM_USD_KRW_RATE", DEFAULT_USD_KRW_RATE);
  const effectiveFromValue = readFormString(formData, "effectiveFrom");
  const effectiveFrom = effectiveFromValue
    ? new Date(`${effectiveFromValue}T00:00:00.000+09:00`)
    : new Date();
  const notes = readFormString(formData, "notes") || null;

  const allowedProviders = new Set([
    "GOOGLE_GEMINI",
    "ANTHROPIC",
    "GOOGLE_DOCUMENT_AI",
    "ATLASCLOUD",
  ]);
  const allowedUnits = new Set(["TOKENS", "PAGE", "IMAGE", "CALL"]);
  if (!allowedProviders.has(provider) || !allowedUnits.has(unitType)) {
    throw new Error("Invalid provider pricing input.");
  }
  if (unitType === "TOKENS" && inputUsdPer1M === null && outputUsdPer1M === null) {
    throw new Error("Token pricing requires at least one token unit price.");
  }
  if (unitType !== "TOKENS" && unitUsd === null) {
    throw new Error("Unit pricing requires unitUsd.");
  }

  await prisma.providerPricing.create({
    data: {
      provider,
      unitType,
      modelPattern,
      inputUsdPer1M,
      outputUsdPer1M,
      unitUsd,
      usdToKrwRate,
      effectiveFrom,
      notes,
    },
  });

  revalidatePath("/admin/costs");
}

export async function syncProviderBillingReconciliation(formData: FormData) {
  await requireAdminAuth("SUPER_ADMIN");

  const targetValue = readFormString(formData, "syncTarget") || "ALL";
  const periodStartValue = readFormString(formData, "syncPeriodStart");
  const periodEndValue = readFormString(formData, "syncPeriodEnd");
  const usdToKrwRate =
    readOptionalFormNumber(formData, "syncUsdToKrwRate") ??
    readNumberEnv("PLATFORM_BILLING_USD_KRW_RATE", readNumberEnv("PLATFORM_USD_KRW_RATE", DEFAULT_USD_KRW_RATE));

  const allowedTargets = new Set(["ALL", "GOOGLE", "ANTHROPIC"]);
  if (!allowedTargets.has(targetValue)) {
    throw new Error("Invalid billing sync target.");
  }
  if (!periodStartValue || !periodEndValue) {
    throw new Error("Billing sync requires period dates.");
  }

  const periodStartParts = parseDateInput(periodStartValue);
  const periodEndParts = parseDateInput(periodEndValue);
  if (!periodStartParts || !periodEndParts) {
    throw new Error("Invalid billing sync period.");
  }

  const periodStart = kstDateToUtc(
    periodStartParts.year,
    periodStartParts.monthIndex,
    periodStartParts.day,
  );
  const periodEndNext = addKstDays(
    periodEndParts.year,
    periodEndParts.monthIndex,
    periodEndParts.day,
    1,
  );
  const periodEnd = kstDateToUtc(
    periodEndNext.year,
    periodEndNext.monthIndex,
    periodEndNext.day,
  );
  if (periodEnd <= periodStart) {
    throw new Error("Billing sync period end must be after start.");
  }

  await syncProviderBillingCostsForRange({
    target: targetValue as ProviderBillingSyncTarget,
    periodStart,
    periodEnd,
    usdToKrwRate,
  });

  revalidatePath("/admin/costs");
}

export async function createProviderBillingReconciliation(formData: FormData) {
  await requireAdminAuth("SUPER_ADMIN");

  const provider = readFormString(formData, "provider");
  const unitTypeValue = readFormString(formData, "unitType");
  const unitType = unitTypeValue === "ALL" ? null : unitTypeValue;
  const modelPattern = readFormString(formData, "modelPattern") || null;
  const periodStartValue = readFormString(formData, "periodStart");
  const periodEndValue = readFormString(formData, "periodEnd");
  const actualCostUsdInput = readOptionalFormNumber(formData, "actualCostUsd");
  const actualCostKrwInput = readOptionalFormNumber(formData, "actualCostKrw");
  const usdToKrwRate =
    readOptionalFormNumber(formData, "usdToKrwRate") ??
    readNumberEnv("PLATFORM_USD_KRW_RATE", DEFAULT_USD_KRW_RATE);
  const source = readFormString(formData, "source") || "MANUAL";
  const referenceId = readFormString(formData, "referenceId") || null;
  const notes = readFormString(formData, "notes") || null;

  const allowedProviders = new Set([
    "GOOGLE_GEMINI",
    "ANTHROPIC",
    "GOOGLE_DOCUMENT_AI",
    "ATLASCLOUD",
    "UNKNOWN",
  ]);
  const allowedUnits = new Set(["TOKENS", "PAGE", "IMAGE", "CALL"]);
  const allowedSources = new Set([
    "MANUAL",
    "GOOGLE_BILLING_EXPORT",
    "ANTHROPIC_COST_REPORT",
    "ATLAS_INVOICE",
    "INVOICE",
  ]);
  if (!allowedProviders.has(provider)) {
    throw new Error("Invalid provider reconciliation input.");
  }
  if (unitType !== null && !allowedUnits.has(unitType)) {
    throw new Error("Invalid reconciliation unit type.");
  }
  if (!allowedSources.has(source)) {
    throw new Error("Invalid reconciliation source.");
  }
  if (!periodStartValue || !periodEndValue) {
    throw new Error("Billing reconciliation requires period dates.");
  }
  if (actualCostUsdInput === null && actualCostKrwInput === null) {
    throw new Error("Billing reconciliation requires actual cost.");
  }

  const periodStartParts = parseDateInput(periodStartValue);
  const periodEndParts = parseDateInput(periodEndValue);
  if (!periodStartParts || !periodEndParts) {
    throw new Error("Invalid billing reconciliation period.");
  }
  const periodStart = kstDateToUtc(
    periodStartParts.year,
    periodStartParts.monthIndex,
    periodStartParts.day,
  );
  const periodEndNext = addKstDays(
    periodEndParts.year,
    periodEndParts.monthIndex,
    periodEndParts.day,
    1,
  );
  const periodEnd = kstDateToUtc(
    periodEndNext.year,
    periodEndNext.monthIndex,
    periodEndNext.day,
  );
  if (periodEnd <= periodStart) {
    throw new Error("Billing reconciliation period end must be after start.");
  }

  const actualCostUsd =
    actualCostUsdInput ?? (actualCostKrwInput === null ? 0 : actualCostKrwInput / usdToKrwRate);
  const actualCostKrw =
    actualCostKrwInput ?? Math.round(actualCostUsd * usdToKrwRate);

  await prisma.providerBillingReconciliation.create({
    data: {
      provider,
      unitType,
      modelPattern,
      periodStart,
      periodEnd,
      actualCostUsd,
      actualCostKrw,
      usdToKrwRate,
      source,
      referenceId,
      notes,
    },
  });

  revalidatePath("/admin/costs");
}

function readPricingConfig(): PricingConfig {
  return {
    usdToKrwRate: readNumberEnv("PLATFORM_USD_KRW_RATE", DEFAULT_USD_KRW_RATE),
    geminiInputUsdPer1M: readOptionalPositiveNumberEnv("GEMINI_PRICE_INPUT_PER_1M_USD"),
    geminiOutputUsdPer1M: readOptionalPositiveNumberEnv("GEMINI_PRICE_OUTPUT_PER_1M_USD"),
    anthropicInputUsdPer1M: readOptionalPositiveNumberEnv("ANTHROPIC_PRICE_INPUT_PER_1M_USD"),
    anthropicOutputUsdPer1M: readOptionalPositiveNumberEnv("ANTHROPIC_PRICE_OUTPUT_PER_1M_USD"),
    documentAiPageCostUsd: readOptionalPositiveNumberEnv("GOOGLE_DOC_AI_PAGE_COST_USD"),
    webtoonImageCostUsd: readOptionalPositiveNumberEnv("WEBTOON_IMAGE_COST_USD"),
    fixedMonthlyCostKrw: readNumberEnv("PLATFORM_FIXED_MONTHLY_COST_KRW", 0),
  };
}

function readNumberEnv(name: string, fallback: number): number {
  const value = readOptionalNumberEnv(name);
  return value ?? fallback;
}

function readOptionalNumberEnv(name: string): number | null {
  const raw = process.env[name];
  if (!raw || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function readOptionalPositiveNumberEnv(name: string): number | null {
  const value = readOptionalNumberEnv(name);
  return value && value > 0 ? value : null;
}

function readFormString(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function readOptionalFormNumber(formData: FormData, name: string) {
  const raw = readFormString(formData, name);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function hasProviderPricing(
  rows: Array<{ provider: string; unitType: string }>,
  provider: string,
  unitType: string,
) {
  return rows.some((row) => row.provider === provider && row.unitType === unitType);
}

function buildBillingReconciliationSummary(
  reconciliations: Array<{
    id: string;
    provider: string;
    unitType: string | null;
    modelPattern: string | null;
    periodStart: Date;
    periodEnd: Date;
    actualCostUsd: unknown;
    actualCostKrw: number;
    source: string;
    referenceId: string | null;
    notes: string | null;
  }>,
  costs: Array<{
    usageAt: Date;
    provider: string;
    unitType: string;
    model: string | null;
    costUsd: unknown;
    costKrw: number;
  }>,
  rangeStart: Date,
  rangeEnd: Date,
  estimatedVariableCostKrw: number,
  estimatedTotalCostKrw: number,
  estimatedProfitKrw: number,
): OperationsCostDashboard["billingReconciliation"] {
  const rows = reconciliations.map((row) => {
    const matchedCosts = costs.filter((cost) =>
      matchesBillingReconciliation(cost, row),
    );
    const estimatedCostUsd = matchedCosts.reduce(
      (sum, cost) => sum + Number(cost.costUsd),
      0,
    );
    const estimatedCostKrw = matchedCosts.reduce(
      (sum, cost) => sum + cost.costKrw,
      0,
    );
    const overlapRatio = billingPeriodOverlapRatio(
      row.periodStart,
      row.periodEnd,
      rangeStart,
      rangeEnd,
    );
    const actualCostUsd = Number(row.actualCostUsd) * overlapRatio;
    const actualCostKrw = Math.round(row.actualCostKrw * overlapRatio);

    return {
      id: row.id,
      provider: row.provider,
      unitType: row.unitType,
      modelPattern: row.modelPattern,
      periodStart: row.periodStart.toISOString(),
      periodEnd: row.periodEnd.toISOString(),
      actualCostUsd,
      actualCostKrw,
      estimatedCostUsd,
      estimatedCostKrw,
      deltaKrw: actualCostKrw - estimatedCostKrw,
      source: row.source,
      referenceId: row.referenceId,
      notes: row.notes,
    };
  });

  const actualCostUsd = rows.reduce((sum, row) => sum + row.actualCostUsd, 0);
  const actualCostKrw = rows.reduce((sum, row) => sum + row.actualCostKrw, 0);
  const estimatedCostUsd = rows.reduce((sum, row) => sum + row.estimatedCostUsd, 0);
  const estimatedCostKrw = rows.reduce((sum, row) => sum + row.estimatedCostKrw, 0);
  const adjustmentKrw = actualCostKrw - estimatedCostKrw;
  const actualVariableCostKrw = estimatedVariableCostKrw + adjustmentKrw;
  const actualTotalCostKrw = estimatedTotalCostKrw + adjustmentKrw;
  const actualProfitKrw = estimatedProfitKrw - adjustmentKrw;

  return {
    hasActual: rows.length > 0,
    actualCostUsd,
    actualCostKrw,
    estimatedCostUsd,
    estimatedCostKrw,
    adjustmentKrw,
    actualVariableCostKrw,
    actualTotalCostKrw,
    actualProfitKrw,
    rows,
  };
}

function matchesBillingReconciliation(
  cost: {
    usageAt: Date;
    provider: string;
    unitType: string;
    model: string | null;
  },
  reconciliation: {
    provider: string;
    unitType: string | null;
    modelPattern: string | null;
    periodStart: Date;
    periodEnd: Date;
  },
) {
  if (cost.provider !== reconciliation.provider) return false;
  if (reconciliation.unitType && cost.unitType !== reconciliation.unitType) {
    return false;
  }
  if (cost.usageAt < reconciliation.periodStart || cost.usageAt >= reconciliation.periodEnd) {
    return false;
  }
  return modelPatternMatches(reconciliation.modelPattern, cost.model);
}

function modelPatternMatches(pattern: string | null, model: string | null) {
  if (!pattern) return true;
  if (!model) return false;
  const lowerPattern = pattern.trim().toLowerCase();
  const lowerModel = model.toLowerCase();
  if (lowerPattern === lowerModel) return true;
  if (lowerPattern.includes("*")) {
    const re = new RegExp(`^${escapeRegExp(lowerPattern).replaceAll("\\*", ".*")}$`);
    return re.test(lowerModel);
  }
  return lowerModel.includes(lowerPattern);
}

function escapeRegExp(value: string) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function billingPeriodOverlapRatio(
  periodStart: Date,
  periodEnd: Date,
  rangeStart: Date,
  rangeEnd: Date,
) {
  const periodMs = Math.max(1, periodEnd.getTime() - periodStart.getTime());
  const overlapStart = Math.max(periodStart.getTime(), rangeStart.getTime());
  const overlapEnd = Math.min(periodEnd.getTime(), rangeEnd.getTime());
  return Math.max(0, overlapEnd - overlapStart) / periodMs;
}

function formatMissingPricingKey(cost: {
  provider: string;
  unitType: string;
  model: string | null;
}) {
  const model = cost.model ? ` / ${cost.model}` : "";
  return `${cost.provider} ${cost.unitType}${model}`;
}

function getApiCostSourceKey(cost: {
  sourceType: string;
  sourceDetail: string | null;
  provider: string;
}) {
  if (cost.sourceType === "EXTRACTION_PAGE" && cost.sourceDetail === "DOCUMENT_AI_OCR") {
    return "google-document-ai";
  }
  if (cost.sourceType === "EXTRACTION_PAGE") return "gemini-ocr";
  if (cost.sourceType === "TUTOR_AI_LOG") return "tutor-ai";
  if (cost.sourceType === "WORKBENCH_AI_JOB") return "workbench-ai";
  if (cost.sourceType === "WEBTOON") return "webtoon-image";
  return cost.provider.toLowerCase();
}

function getApiCostSourceLabel(cost: {
  sourceType: string;
  sourceDetail: string | null;
  provider: string;
}) {
  if (cost.sourceType === "EXTRACTION_PAGE" && cost.sourceDetail === "DOCUMENT_AI_OCR") {
    return "Google Document AI";
  }
  if (cost.sourceType === "EXTRACTION_PAGE") return "Gemini OCR/추출";
  if (cost.sourceType === "TUTOR_AI_LOG") return "튜터 AI";
  if (cost.sourceType === "WORKBENCH_AI_JOB") return "워크벤치 AI";
  if (cost.sourceType === "WEBTOON") return "웹툰 이미지";
  return cost.provider;
}

function addBucketApiCost(
  bucket: BucketAccumulator,
  {
    calls,
    pricingSource,
    inputTokens,
    outputTokens,
    costKrw,
  }: {
    calls: number;
    pricingSource: string;
    inputTokens: number;
    outputTokens: number;
    costKrw: number;
  },
) {
  bucket.variableCostKrw += costKrw;
  bucket.apiCalls += calls;
  if (pricingSource === "MISSING") {
    bucket.unpricedCalls += calls;
  }
  bucket.inputTokens += inputTokens;
  bucket.outputTokens += outputTokens;
}

function addSourceApiCost(
  sources: Map<string, SourceAccumulator>,
  sourceKey: string,
  sourceLabel: string,
  {
    calls,
    pricingSource,
    inputTokens,
    outputTokens,
    costUsd,
    costKrw,
  }: {
    calls: number;
    pricingSource: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    costKrw: number;
  },
) {
  const source =
    sources.get(sourceKey) ??
    {
      key: sourceKey,
      label: sourceLabel,
      calls: 0,
      unpricedCalls: 0,
      unpricedInputTokens: 0,
      unpricedOutputTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      costKrw: 0,
    };
  source.calls += calls;
  if (pricingSource === "MISSING") {
    source.unpricedCalls += calls;
    source.unpricedInputTokens += inputTokens;
    source.unpricedOutputTokens += outputTokens;
  }
  source.inputTokens += inputTokens;
  source.outputTokens += outputTokens;
  source.costUsd += costUsd;
  source.costKrw += costKrw;
  sources.set(sourceKey, source);
}

function toCostBucket(bucket: BucketAccumulator): CostBucket {
  const totalCostKrw = bucket.variableCostKrw + bucket.fixedCostKrw;
  const profitKrw = bucket.revenueKrw - totalCostKrw;
  const marginPercent = bucket.revenueKrw > 0 ? (profitKrw / bucket.revenueKrw) * 100 : 0;

  return {
    key: bucket.key,
    label: bucket.label,
    revenueKrw: Math.round(bucket.revenueKrw),
    variableCostKrw: Math.round(bucket.variableCostKrw),
    fixedCostKrw: Math.round(bucket.fixedCostKrw),
    totalCostKrw: Math.round(totalCostKrw),
    profitKrw: Math.round(profitKrw),
    marginPercent,
    apiCalls: bucket.apiCalls,
    unpricedCalls: bucket.unpricedCalls,
    inputTokens: bucket.inputTokens,
    outputTokens: bucket.outputTokens,
    creditsConsumed: bucket.creditsConsumed,
  };
}

function toTotals(rows: CostBucket[]): OperationsCostDashboard["totals"] {
  const total = rows.reduce(
    (sum, row) => ({
      revenueKrw: sum.revenueKrw + row.revenueKrw,
      variableCostKrw: sum.variableCostKrw + row.variableCostKrw,
      fixedCostKrw: sum.fixedCostKrw + row.fixedCostKrw,
      totalCostKrw: sum.totalCostKrw + row.totalCostKrw,
      profitKrw: sum.profitKrw + row.profitKrw,
      apiCalls: sum.apiCalls + row.apiCalls,
      unpricedCalls: sum.unpricedCalls + row.unpricedCalls,
      inputTokens: sum.inputTokens + row.inputTokens,
      outputTokens: sum.outputTokens + row.outputTokens,
      creditsConsumed: sum.creditsConsumed + row.creditsConsumed,
    }),
    {
      revenueKrw: 0,
      variableCostKrw: 0,
      fixedCostKrw: 0,
      totalCostKrw: 0,
      profitKrw: 0,
      apiCalls: 0,
      unpricedCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      creditsConsumed: 0,
    },
  );

  return {
    ...total,
    marginPercent:
      total.revenueKrw > 0 ? (total.profitKrw / total.revenueKrw) * 100 : 0,
  };
}

function totalsToCostBucket(
  totals: OperationsCostDashboard["totals"],
  label: string,
): CostBucket {
  return {
    key: "summary",
    label,
    revenueKrw: totals.revenueKrw,
    variableCostKrw: totals.variableCostKrw,
    fixedCostKrw: totals.fixedCostKrw,
    totalCostKrw: totals.totalCostKrw,
    profitKrw: totals.profitKrw,
    marginPercent: totals.marginPercent,
    apiCalls: totals.apiCalls,
    unpricedCalls: totals.unpricedCalls,
    inputTokens: totals.inputTokens,
    outputTokens: totals.outputTokens,
    creditsConsumed: totals.creditsConsumed,
  };
}

function emptyCostBucket(): CostBucket {
  return {
    key: "",
    label: "",
    revenueKrw: 0,
    variableCostKrw: 0,
    fixedCostKrw: 0,
    totalCostKrw: 0,
    profitKrw: 0,
    marginPercent: 0,
    apiCalls: 0,
    unpricedCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    creditsConsumed: 0,
  };
}

function getOperationLabel(operationType: string) {
  if (operationType in OPERATION_LABELS) {
    return OPERATION_LABELS[operationType as OperationType];
  }
  if (operationType === "UNKNOWN") return "미분류";
  return operationType;
}

type RangeBucket = {
  key: string;
  label: string;
  year: number;
  monthIndex: number;
  day?: number;
};

type CostRange = {
  start: Date;
  end: Date;
  buckets: RangeBucket[];
  summaryMode: CostSummaryMode;
  summaryLabel: string;
  summaryKey?: string;
};

function buildRange(mode: CostPeriodMode, options: OperationsCostOptions): CostRange {
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

function buildDailyCustomRange(
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

function buildMonthlyCustomRange(
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

function bucketKeyForDate(date: Date | null, mode: CostPeriodMode) {
  if (!date) return "";
  const parts = kstParts(date);
  return mode === "monthly"
    ? monthKey(parts.year, parts.monthIndex)
    : dayKey(parts.year, parts.monthIndex, parts.day);
}

function fixedCostForBucket(
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

function parseDateRange(startValue?: string, endValue?: string) {
  const start = parseDateInput(startValue);
  const end = parseDateInput(endValue);
  if (!start || !end) return null;

  if (compareKstDates(start, end) <= 0) {
    return { start, end };
  }
  return { start: end, end: start };
}

function parseDateInput(value?: string) {
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

function parseMonthInput(value?: string) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return null;
  return { year, monthIndex };
}

function compareKstDates(
  a: { year: number; monthIndex: number; day: number },
  b: { year: number; monthIndex: number; day: number },
) {
  return (
    Date.UTC(a.year, a.monthIndex, a.day) -
    Date.UTC(b.year, b.monthIndex, b.day)
  );
}

function diffKstDays(
  start: { year: number; monthIndex: number; day: number },
  end: { year: number; monthIndex: number; day: number },
) {
  return Math.max(0, Math.round(compareKstDates(end, start) / 86_400_000));
}

function diffKstMonths(
  start: { year: number; monthIndex: number },
  end: { year: number; monthIndex: number },
) {
  return (end.year - start.year) * 12 + end.monthIndex - start.monthIndex;
}

function formatFullDateLabel(parts: { year: number; monthIndex: number; day: number }) {
  return `${parts.year}.${String(parts.monthIndex + 1).padStart(2, "0")}.${String(parts.day).padStart(2, "0")}`;
}

function kstParts(date: Date) {
  const shifted = new Date(date.getTime() + KST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    monthIndex: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
  };
}

function kstDateToUtc(year: number, monthIndex: number, day: number) {
  return new Date(Date.UTC(year, monthIndex, day) - KST_OFFSET_MS);
}

function addKstDays(year: number, monthIndex: number, day: number, delta: number) {
  const date = new Date(Date.UTC(year, monthIndex, day + delta));
  return {
    year: date.getUTCFullYear(),
    monthIndex: date.getUTCMonth(),
    day: date.getUTCDate(),
  };
}

function addKstMonths(year: number, monthIndex: number, delta: number) {
  const date = new Date(Date.UTC(year, monthIndex + delta, 1));
  return {
    year: date.getUTCFullYear(),
    monthIndex: date.getUTCMonth(),
  };
}

function daysInMonth(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function monthKey(year: number, monthIndex: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

function dayKey(year: number, monthIndex: number, day: number) {
  return `${monthKey(year, monthIndex)}-${String(day).padStart(2, "0")}`;
}
