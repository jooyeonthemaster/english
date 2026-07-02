"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { getUsdKrwRate, kstTodayString } from "@/lib/fx-rate";
import { syncPlatformApiUsageCostsForRange } from "@/lib/platform-api-costs";
import { getProviderBillingSyncStatus, type ProviderBillingSyncTarget, syncProviderBillingCostsForRange } from "@/lib/provider-billing-sync";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth-admin";
import { getOperationTypeLabel, getTransactionTypeLabel, TRANSACTION_TYPES } from "@/lib/admin-members-labels";
import type { AcademyTransactionFilters, AcademyTransactionListResult, AcademyUsageAccumulator, AcademyUsageSummary, BucketAccumulator, CostPeriodMode, CreditOperationSummary, OperationsCostDashboard, OperationsCostOptions, SourceAccumulator } from "./operations-cost-types";
import { addKstDays, bucketKeyForDate, buildRange, fixedCostForBucket, kstDateToUtc, parseDateInput } from "./operations-cost-datetime";
import { DEFAULT_USD_KRW_RATE, addBucketApiCost, addSourceApiCost, buildBillingReconciliationSummary, emptyCostBucket, formatMissingPricingKey, getApiCostSourceKey, getApiCostSourceLabel, getOperationLabel, hasProviderPricing, readFormString, readNumberEnv, readOptionalFormNumber, readPricingConfig, toCostBucket, toTotals, totalsToCostBucket } from "./operations-cost-compute";

export type {
  CostPeriodMode,
  CostSummaryMode,
  OperationsCostOptions,
  CostBucket,
  CostSourceSummary,
  CreditOperationSummary,
  AcademyUsageSummary,
  ProviderPricingSummary,
  BillingReconciliationSummary,
  OperationsCostDashboard,
  AcademyTransactionFilters,
  AcademyTransactionListItem,
  AcademyTransactionListResult,
} from "./operations-cost-types";

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
        select: {
          id: true,
          name: true,
          // 원가는 학원 단위 집계라 회원별 보기에선 학원의 원장(DIRECTOR)을
          // 대표 회원으로 매핑해 표시한다.
          staff: {
            where: { role: "DIRECTOR" },
            select: { name: true, email: true },
            orderBy: { createdAt: "asc" },
            take: 1,
          },
        },
      })
    : [];
  const academyNameMap = new Map(academyNames.map((academy) => [academy.id, academy.name]));
  const academyDirectorMap = new Map(
    academyNames.map((academy) => [academy.id, academy.staff[0] ?? null]),
  );
  const academyUsage: AcademyUsageSummary[] = Array.from(academyUsageMap.values())
    .map((entry) => {
      const director = entry.academyId
        ? academyDirectorMap.get(entry.academyId) ?? null
        : null;
      return {
        academyId: entry.academyId,
        name: entry.academyId
          ? academyNameMap.get(entry.academyId) ?? "삭제된 학원"
          : "미지정",
        directorName: director?.name ?? null,
        directorEmail: director?.email ?? null,
        calls: entry.calls,
        inputTokens: entry.inputTokens,
        outputTokens: entry.outputTokens,
        costUsd: entry.costUsd,
        costKrw: entry.costKrw,
      };
    })
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

export async function getAcademyCostTransactions(
  academyId: string,
  filters: AcademyTransactionFilters = {},
): Promise<AcademyTransactionListResult> {
  const session = await requireAdminAuth();
  const elevated = session.role === "SUPER_ADMIN";
  const normalizedAcademyId = academyId.trim();

  if (!normalizedAcademyId) {
    return { kind: "invalid_input", error: "학원 ID가 필요합니다." };
  }

  const [academy, operationTypeRows] = await Promise.all([
    prisma.academy.findUnique({
      where: { id: normalizedAcademyId },
      select: { id: true, name: true },
    }),
    prisma.creditTransaction.findMany({
      where: {
        academyId: normalizedAcademyId,
        operationType: { not: null },
      },
      distinct: ["operationType"],
      select: { operationType: true },
    }),
  ]);

  if (!academy) return { kind: "not_found" };

  const operationTypes = operationTypeRows
    .map((row) => row.operationType)
    .filter((operationType): operationType is string => operationType !== null)
    .sort((a, b) =>
      getOperationTypeLabel(a).localeCompare(getOperationTypeLabel(b), "ko-KR"),
    );

  const limit = Math.min(Math.max(filters.limit ?? 30, 1), 200);
  const where: Prisma.CreditTransactionWhereInput = {
    academyId: normalizedAcademyId,
  };

  if (filters.type && filters.type !== "all") {
    if (!(TRANSACTION_TYPES as readonly string[]).includes(filters.type)) {
      return { kind: "invalid_input", error: "알 수 없는 거래 종류입니다." };
    }
    where.type = filters.type;
  }

  if (filters.operationType && filters.operationType !== "all") {
    if (!operationTypes.includes(filters.operationType)) {
      return { kind: "invalid_input", error: "알 수 없는 상품 종류입니다." };
    }
    where.operationType = filters.operationType;
  }

  const transactions = await prisma.creditTransaction.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
  });

  const hasMore = transactions.length > limit;
  const slice = hasMore ? transactions.slice(0, limit) : transactions;

  return {
    kind: "ok",
    academy,
    items: slice.map((tx) => ({
      id: tx.id,
      type: tx.type,
      typeLabel: getTransactionTypeLabel(tx.type),
      amount: tx.amount,
      balanceAfter: tx.balanceAfter,
      operationType: tx.operationType,
      operationLabel: getOperationTypeLabel(tx.operationType),
      description: tx.description,
      referenceId: tx.referenceId,
      referenceType: tx.referenceType,
      staffId: tx.staffId,
      adminId: tx.adminId,
      metadata: elevated ? tx.metadata : null,
      createdAt: tx.createdAt.toISOString(),
    })),
    nextCursor: hasMore ? slice[slice.length - 1].id : null,
    operationTypes,
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
