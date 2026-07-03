import { OPERATION_LABELS, type OperationType } from "@/lib/credit-costs";
import type { BucketAccumulator, CostBucket, OperationsCostDashboard, PricingConfig, SourceAccumulator } from "./operations-cost-types";
export const DEFAULT_USD_KRW_RATE = 1350;
export function readPricingConfig(): PricingConfig {
  return {
    usdToKrwRate: readNumberEnv("PLATFORM_USD_KRW_RATE", DEFAULT_USD_KRW_RATE),
    atlasInputUsdPer1M:
      readOptionalPositiveNumberEnv("ATLASCLOUD_PRICE_INPUT_PER_1M_USD") ??
      readOptionalPositiveNumberEnv("OPENROUTER_PRICE_INPUT_PER_1M_USD"),
    atlasOutputUsdPer1M:
      readOptionalPositiveNumberEnv("ATLASCLOUD_PRICE_OUTPUT_PER_1M_USD") ??
      readOptionalPositiveNumberEnv("OPENROUTER_PRICE_OUTPUT_PER_1M_USD"),
    geminiInputUsdPer1M: readOptionalPositiveNumberEnv("GEMINI_PRICE_INPUT_PER_1M_USD"),
    geminiOutputUsdPer1M: readOptionalPositiveNumberEnv("GEMINI_PRICE_OUTPUT_PER_1M_USD"),
    anthropicInputUsdPer1M: readOptionalPositiveNumberEnv("ANTHROPIC_PRICE_INPUT_PER_1M_USD"),
    anthropicOutputUsdPer1M: readOptionalPositiveNumberEnv("ANTHROPIC_PRICE_OUTPUT_PER_1M_USD"),
    documentAiPageCostUsd: readOptionalPositiveNumberEnv("GOOGLE_DOC_AI_PAGE_COST_USD"),
    webtoonImageCostUsd: readOptionalPositiveNumberEnv("WEBTOON_IMAGE_COST_USD"),
    fixedMonthlyCostKrw: readNumberEnv("PLATFORM_FIXED_MONTHLY_COST_KRW", 0),
  };
}
export function readNumberEnv(name: string, fallback: number): number {
  const value = readOptionalNumberEnv(name);
  return value ?? fallback;
}
export function readOptionalNumberEnv(name: string): number | null {
  const raw = process.env[name];
  if (!raw || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}
export function readOptionalPositiveNumberEnv(name: string): number | null {
  const value = readOptionalNumberEnv(name);
  return value && value > 0 ? value : null;
}
export function readFormString(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}
export function readOptionalFormNumber(formData: FormData, name: string) {
  const raw = readFormString(formData, name);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}
export function hasProviderPricing(
  rows: Array<{ provider: string; unitType: string }>,
  provider: string,
  unitType: string,
) {
  return rows.some((row) => row.provider === provider && row.unitType === unitType);
}
export function buildBillingReconciliationSummary(
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
export function matchesBillingReconciliation(
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
export function modelPatternMatches(pattern: string | null, model: string | null) {
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
export function escapeRegExp(value: string) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}
export function billingPeriodOverlapRatio(
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
export function formatMissingPricingKey(cost: {
  provider: string;
  unitType: string;
  model: string | null;
}) {
  const model = cost.model ? ` / ${cost.model}` : "";
  return `${cost.provider} ${cost.unitType}${model}`;
}
export function getApiCostSourceKey(cost: {
  sourceType: string;
  sourceDetail: string | null;
  provider: string;
}) {
  if (cost.sourceType === "EXTRACTION_PAGE" && cost.sourceDetail === "DOCUMENT_AI_OCR") {
    return "google-document-ai";
  }
  if (cost.sourceType === "EXTRACTION_PAGE") return "atlascloud-ocr-extraction";
  if (cost.sourceType === "TUTOR_AI_LOG") return "Tutor AI";
  if (cost.sourceType === "WORKBENCH_AI_JOB") return "Workbench AI";
  if (cost.sourceType === "WEBTOON") return "Webtoon image";
  return cost.provider.toLowerCase();
}
export function getApiCostSourceLabel(cost: {
  sourceType: string;
  sourceDetail: string | null;
  provider: string;
}) {
  if (cost.sourceType === "EXTRACTION_PAGE" && cost.sourceDetail === "DOCUMENT_AI_OCR") {
    return "Google Document AI";
  }
  if (cost.sourceType === "EXTRACTION_PAGE") return "Atlas Cloud OCR/Extraction";
  if (cost.sourceType === "TUTOR_AI_LOG") return "Tutor AI";
  if (cost.sourceType === "WORKBENCH_AI_JOB") return "Workbench AI";
  if (cost.sourceType === "WEBTOON") return "Webtoon image";
  return cost.provider;
}
export function addBucketApiCost(
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
export function addSourceApiCost(
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
export function toCostBucket(bucket: BucketAccumulator): CostBucket {
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
export function toTotals(rows: CostBucket[]): OperationsCostDashboard["totals"] {
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
export function totalsToCostBucket(
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
export function emptyCostBucket(): CostBucket {
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
export function getOperationLabel(operationType: string) {
  if (operationType in OPERATION_LABELS) {
    return OPERATION_LABELS[operationType as OperationType];
  }
  if (operationType === "UNKNOWN") return "Unknown";
  return operationType;
}
