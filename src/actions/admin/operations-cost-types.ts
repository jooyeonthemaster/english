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
  estimatedCalls: number;
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
  directorName: string | null;
  directorEmail: string | null;
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
    hasAtlasCloudTokenPricing: boolean;
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
    atlasConfigured: boolean;
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
export interface AcademyTransactionFilters {
  type?: string;
  operationType?: string;
  cursor?: string | null;
  limit?: number;
}
export interface AcademyTransactionListItem {
  id: string;
  type: string;
  typeLabel: string;
  amount: number;
  balanceAfter: number;
  operationType: string | null;
  operationLabel: string;
  description: string | null;
  referenceId: string | null;
  referenceType: string | null;
  staffId: string | null;
  adminId: string | null;
  metadata: string | null;
  createdAt: string;
}
export type AcademyTransactionListResult =
  | {
      kind: "ok";
      academy: { id: string; name: string };
      items: AcademyTransactionListItem[];
      nextCursor: string | null;
      operationTypes: string[];
    }
  | { kind: "not_found" }
  | { kind: "invalid_input"; error: string };
export type BucketAccumulator = {
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
export type SourceAccumulator = {
  key: string;
  label: string;
  calls: number;
  unpricedCalls: number;
  unpricedInputTokens: number;
  unpricedOutputTokens: number;
  estimatedCalls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  costKrw: number;
};
export type AcademyUsageAccumulator = {
  academyId: string | null;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  costKrw: number;
};
export type PricingConfig = {
  usdToKrwRate: number;
  atlasInputUsdPer1M: number | null;
  atlasOutputUsdPer1M: number | null;
  geminiInputUsdPer1M: number | null;
  geminiOutputUsdPer1M: number | null;
  anthropicInputUsdPer1M: number | null;
  anthropicOutputUsdPer1M: number | null;
  documentAiPageCostUsd: number | null;
  webtoonImageCostUsd: number | null;
  fixedMonthlyCostKrw: number;
};
export type RangeBucket = {
  key: string;
  label: string;
  year: number;
  monthIndex: number;
  day?: number;
};
export type CostRange = {
  start: Date;
  end: Date;
  buckets: RangeBucket[];
  summaryMode: CostSummaryMode;
  summaryLabel: string;
  summaryKey?: string;
};
