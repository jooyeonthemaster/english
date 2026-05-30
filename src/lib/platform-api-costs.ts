import { Prisma } from "@prisma/client";
import { getExtractionAiModelName } from "@/lib/extraction/model-config";
import { prisma } from "@/lib/prisma";

export type PlatformCostUnitType = "TOKENS" | "PAGE" | "IMAGE" | "CALL";
export type PlatformCostProvider =
  | "GOOGLE_GEMINI"
  | "ANTHROPIC"
  | "GOOGLE_DOCUMENT_AI"
  | "ATLASCLOUD"
  | "UNKNOWN";

interface RecordApiUsageCostInput {
  sourceKey: string;
  sourceType: string;
  sourceId: string;
  sourceDetail?: string | null;
  academyId?: string | null;
  provider: PlatformCostProvider;
  model?: string | null;
  operationType?: string | null;
  unitType: PlatformCostUnitType;
  unitCount?: number;
  calls?: number;
  inputTokens?: number;
  outputTokens?: number;
  usageAt: Date;
  recordedCostUsd?: number | null;
  metadata?: Prisma.InputJsonValue;
}

interface RecordApiUsageCostOptions {
  existingPricingSource?: string | null;
  pricingRows?: PricingLookupRow[];
}

interface CostResolution {
  pricingId: string | null;
  pricingSource: "DB" | "ENV" | "RECORDED" | "MISSING";
  inputUsdPer1M: number | null;
  outputUsdPer1M: number | null;
  unitUsd: number | null;
  usdToKrwRate: number;
  costUsd: number;
  costKrw: number;
}

type PricingLookupRow = {
  id: string;
  provider: string;
  modelPattern: string | null;
  unitType: string;
  inputUsdPer1M: Prisma.Decimal | null;
  outputUsdPer1M: Prisma.Decimal | null;
  unitUsd: Prisma.Decimal | null;
  usdToKrwRate: Prisma.Decimal;
  effectiveFrom: Date;
  effectiveTo: Date | null;
};

const DEFAULT_USD_KRW_RATE = 1350;
const COST_SYNC_CONCURRENCY = 12;
const SOURCE_KEY_CHUNK_SIZE = 1000;

export async function syncPlatformApiUsageCostsForRange(
  start: Date,
  end: Date,
) {
  const [extractionPages, documentAiPages, tutorLogs, webtoons] = await Promise.all([
    prisma.extractionPage.findMany({
      where: {
        completedAt: { gte: start, lt: end },
        OR: [
          { inputTokens: { not: null } },
          { outputTokens: { not: null } },
          { status: "SUCCESS" },
        ],
      },
      select: {
        id: true,
        completedAt: true,
        inputTokens: true,
        outputTokens: true,
        modelUsed: true,
        job: { select: { academyId: true, mode: true } },
      },
    }),
    prisma.extractionPage.findMany({
      where: {
        completedAt: { gte: start, lt: end },
        documentAiRawText: { not: null },
      },
      select: {
        id: true,
        completedAt: true,
        job: { select: { academyId: true, mode: true } },
      },
    }),
    prisma.tutorAiLog.findMany({
      where: { createdAt: { gte: start, lt: end } },
      select: {
        id: true,
        academyId: true,
        kind: true,
        model: true,
        tokensIn: true,
        tokensOut: true,
        costUsd: true,
        status: true,
        createdAt: true,
      },
    }),
    prisma.webtoon.findMany({
      where: {
        completedAt: { gte: start, lt: end },
        status: "COMPLETED",
      },
      select: {
        id: true,
        academyId: true,
        imageModel: true,
        imageSize: true,
        imageQuality: true,
        completedAt: true,
      },
    }),
  ]);

  const candidates: RecordApiUsageCostInput[] = [];

  for (const page of extractionPages) {
    if (!page.completedAt) continue;
    candidates.push({
      sourceKey: `extraction_page:${page.id}:gemini`,
      sourceType: "EXTRACTION_PAGE",
      sourceId: page.id,
      sourceDetail: "GEMINI_OCR",
      academyId: page.job.academyId,
      provider: "GOOGLE_GEMINI",
      model: page.modelUsed ?? getExtractionAiModelName("ocr"),
      operationType: "TEXT_EXTRACTION",
      unitType: "TOKENS",
      inputTokens: page.inputTokens ?? 0,
      outputTokens: page.outputTokens ?? 0,
      usageAt: page.completedAt,
      metadata: { mode: page.job.mode },
    });
  }

  for (const page of documentAiPages) {
    if (!page.completedAt) continue;
    candidates.push({
      sourceKey: `extraction_page:${page.id}:document_ai`,
      sourceType: "EXTRACTION_PAGE",
      sourceId: page.id,
      sourceDetail: "DOCUMENT_AI_OCR",
      academyId: page.job.academyId,
      provider: "GOOGLE_DOCUMENT_AI",
      model: "document-ai",
      operationType: "TEXT_EXTRACTION",
      unitType: "PAGE",
      unitCount: 1,
      calls: 1,
      usageAt: page.completedAt,
      metadata: { mode: page.job.mode },
    });
  }

  for (const log of tutorLogs) {
    candidates.push({
      sourceKey: `tutor_ai_log:${log.id}`,
      sourceType: "TUTOR_AI_LOG",
      sourceId: log.id,
      sourceDetail: log.kind,
      academyId: log.academyId,
      provider: providerFromModel(log.model),
      model: log.model,
      operationType: log.kind,
      unitType: "TOKENS",
      inputTokens: log.tokensIn,
      outputTokens: log.tokensOut,
      usageAt: log.createdAt,
      recordedCostUsd: Number(log.costUsd) > 0 ? Number(log.costUsd) : null,
      metadata: { status: log.status },
    });
  }

  for (const webtoon of webtoons) {
    if (!webtoon.completedAt) continue;
    candidates.push({
      sourceKey: `webtoon:${webtoon.id}:image`,
      sourceType: "WEBTOON",
      sourceId: webtoon.id,
      sourceDetail: "IMAGE_GENERATION",
      academyId: webtoon.academyId,
      provider: "ATLASCLOUD",
      model: webtoon.imageModel,
      operationType: "WEBTOON_IMAGE",
      unitType: "IMAGE",
      unitCount: 1,
      calls: 1,
      usageAt: webtoon.completedAt,
      metadata: {
        imageSize: webtoon.imageSize,
        imageQuality: webtoon.imageQuality,
      },
    });
  }

  if (candidates.length === 0) return;

  const [existingCosts, pricingRows] = await Promise.all([
    getExistingCostMap(candidates.map((candidate) => candidate.sourceKey)),
    prisma.providerPricing.findMany({
      where: { isActive: true },
      select: {
        id: true,
        provider: true,
        modelPattern: true,
        unitType: true,
        inputUsdPer1M: true,
        outputUsdPer1M: true,
        unitUsd: true,
        usdToKrwRate: true,
        effectiveFrom: true,
        effectiveTo: true,
      },
    }),
  ]);

  const workItems = candidates
    .map((candidate) => ({
      candidate,
      existingPricingSource: existingCosts.get(candidate.sourceKey) ?? null,
    }))
    .filter(({ candidate, existingPricingSource }) => {
      if (existingPricingSource === null) return true;
      if (existingPricingSource !== "MISSING") return false;
      return hasPotentialPricing(candidate, pricingRows);
    });

  await mapWithConcurrency(workItems, COST_SYNC_CONCURRENCY, (item) =>
    recordPlatformApiUsageCost(item.candidate, {
      existingPricingSource: item.existingPricingSource,
      pricingRows,
    }),
  );
}

export async function recordPlatformApiUsageCost(
  input: RecordApiUsageCostInput,
  options: RecordApiUsageCostOptions = {},
) {
  if (options.existingPricingSource !== undefined) {
    if (options.existingPricingSource && options.existingPricingSource !== "MISSING") {
      return { id: "", pricingSource: options.existingPricingSource };
    }
  } else {
    const existing = await prisma.platformApiUsageCost.findUnique({
      where: { sourceKey: input.sourceKey },
      select: { id: true, pricingSource: true },
    });
    if (existing && existing.pricingSource !== "MISSING") {
      return existing;
    }
  }

  const resolution = await resolveCost(input, options.pricingRows);
  const data = {
    academyId: input.academyId ?? null,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    sourceDetail: input.sourceDetail ?? null,
    provider: input.provider,
    model: input.model ?? null,
    operationType: input.operationType ?? null,
    unitType: input.unitType,
    unitCount: sanitizeCount(input.unitCount ?? 1),
    calls: sanitizeCount(input.calls ?? 1),
    inputTokens: sanitizeCount(input.inputTokens ?? 0),
    outputTokens: sanitizeCount(input.outputTokens ?? 0),
    inputUsdPer1M: decimalOrNull(resolution.inputUsdPer1M),
    outputUsdPer1M: decimalOrNull(resolution.outputUsdPer1M),
    unitUsd: decimalOrNull(resolution.unitUsd),
    usdToKrwRate: new Prisma.Decimal(resolution.usdToKrwRate),
    costUsd: new Prisma.Decimal(resolution.costUsd),
    costKrw: resolution.costKrw,
    pricingSource: resolution.pricingSource,
    pricingId: resolution.pricingId,
    metadata: input.metadata ?? Prisma.JsonNull,
    usageAt: input.usageAt,
  };

  return prisma.platformApiUsageCost.upsert({
    where: { sourceKey: input.sourceKey },
    create: { sourceKey: input.sourceKey, ...data },
    update: data,
    select: { id: true, pricingSource: true },
  });
}

export function readAiUsageTokens(usage: unknown) {
  const record = usage && typeof usage === "object" ? (usage as Record<string, unknown>) : {};
  return {
    inputTokens: Number(record.inputTokens ?? record.promptTokens ?? 0) || 0,
    outputTokens: Number(record.outputTokens ?? record.completionTokens ?? 0) || 0,
  };
}

async function resolveCost(
  input: RecordApiUsageCostInput,
  pricingRows?: PricingLookupRow[],
): Promise<CostResolution> {
  const recordedCostUsd = input.recordedCostUsd ?? 0;
  const envUsdToKrwRate = readNumberEnv("PLATFORM_USD_KRW_RATE", DEFAULT_USD_KRW_RATE);

  if (recordedCostUsd > 0) {
    return {
      pricingId: null,
      pricingSource: "RECORDED",
      inputUsdPer1M: null,
      outputUsdPer1M: null,
      unitUsd: null,
      usdToKrwRate: envUsdToKrwRate,
      costUsd: roundUsd(recordedCostUsd),
      costKrw: Math.round(recordedCostUsd * envUsdToKrwRate),
    };
  }

  const dbPricing = pricingRows
    ? findProviderPricingInRows(input, pricingRows)
    : await findProviderPricing(input);
  if (dbPricing) {
    const cost = calculateCostUsd({
      unitType: input.unitType,
      unitCount: sanitizeCount(input.unitCount ?? 1),
      inputTokens: sanitizeCount(input.inputTokens ?? 0),
      outputTokens: sanitizeCount(input.outputTokens ?? 0),
      inputUsdPer1M: decimalToNumber(dbPricing.inputUsdPer1M),
      outputUsdPer1M: decimalToNumber(dbPricing.outputUsdPer1M),
      unitUsd: decimalToNumber(dbPricing.unitUsd),
    });
    const usdToKrwRate = decimalToNumber(dbPricing.usdToKrwRate) ?? envUsdToKrwRate;
    return {
      pricingId: dbPricing.id,
      pricingSource: "DB",
      inputUsdPer1M: decimalToNumber(dbPricing.inputUsdPer1M),
      outputUsdPer1M: decimalToNumber(dbPricing.outputUsdPer1M),
      unitUsd: decimalToNumber(dbPricing.unitUsd),
      usdToKrwRate,
      costUsd: roundUsd(cost),
      costKrw: Math.round(cost * usdToKrwRate),
    };
  }

  const envPricing = readEnvPricing(input.provider, input.unitType);
  if (envPricing) {
    const cost = calculateCostUsd({
      unitType: input.unitType,
      unitCount: sanitizeCount(input.unitCount ?? 1),
      inputTokens: sanitizeCount(input.inputTokens ?? 0),
      outputTokens: sanitizeCount(input.outputTokens ?? 0),
      ...envPricing,
    });
    return {
      pricingId: null,
      pricingSource: "ENV",
      inputUsdPer1M: envPricing.inputUsdPer1M,
      outputUsdPer1M: envPricing.outputUsdPer1M,
      unitUsd: envPricing.unitUsd,
      usdToKrwRate: envUsdToKrwRate,
      costUsd: roundUsd(cost),
      costKrw: Math.round(cost * envUsdToKrwRate),
    };
  }

  return {
    pricingId: null,
    pricingSource: "MISSING",
    inputUsdPer1M: null,
    outputUsdPer1M: null,
    unitUsd: null,
    usdToKrwRate: envUsdToKrwRate,
    costUsd: 0,
    costKrw: 0,
  };
}

async function findProviderPricing(input: RecordApiUsageCostInput) {
  const rows = await prisma.providerPricing.findMany({
    where: {
      provider: input.provider,
      unitType: input.unitType,
      isActive: true,
      effectiveFrom: { lte: input.usageAt },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: input.usageAt } }],
    },
    orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
  });

  return rows
    .map((row) => ({ row, score: modelPatternScore(row.modelPattern, input.model) }))
    .filter((item) => item.score >= 0)
    .sort((a, b) => b.score - a.score)[0]?.row ?? null;
}

function findProviderPricingInRows(
  input: RecordApiUsageCostInput,
  rows: PricingLookupRow[],
) {
  return rows
    .filter(
      (row) =>
        row.provider === input.provider &&
        row.unitType === input.unitType &&
        row.effectiveFrom <= input.usageAt &&
        (!row.effectiveTo || row.effectiveTo > input.usageAt),
    )
    .map((row) => ({ row, score: modelPatternScore(row.modelPattern, input.model) }))
    .filter((item) => item.score >= 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.row.effectiveFrom.getTime() - a.row.effectiveFrom.getTime();
    })[0]?.row ?? null;
}

async function getExistingCostMap(sourceKeys: string[]) {
  const rows = await Promise.all(
    chunkArray(sourceKeys, SOURCE_KEY_CHUNK_SIZE).map((chunk) =>
      prisma.platformApiUsageCost.findMany({
        where: { sourceKey: { in: chunk } },
        select: { sourceKey: true, pricingSource: true },
      }),
    ),
  );

  return new Map(
    rows.flat().map((row) => [row.sourceKey, row.pricingSource] as const),
  );
}

function hasPotentialPricing(
  input: RecordApiUsageCostInput,
  pricingRows: PricingLookupRow[],
) {
  return (
    findProviderPricingInRows(input, pricingRows) !== null ||
    readEnvPricing(input.provider, input.unitType) !== null
  );
}

function modelPatternScore(pattern: string | null, model?: string | null) {
  if (!pattern) return 0;
  if (!model) return -1;
  const lowerPattern = pattern.trim().toLowerCase();
  const lowerModel = model.toLowerCase();
  if (lowerPattern === lowerModel) return 3;
  if (lowerPattern.includes("*")) {
    const re = new RegExp(`^${escapeRegExp(lowerPattern).replaceAll("\\*", ".*")}$`);
    return re.test(lowerModel) ? 2 : -1;
  }
  return lowerModel.includes(lowerPattern) ? 1 : -1;
}

export function providerFromModel(model: string): PlatformCostProvider {
  const lower = model.toLowerCase();
  if (lower.includes("claude") || lower.includes("anthropic")) return "ANTHROPIC";
  if (lower.includes("gemini") || lower.includes("google")) return "GOOGLE_GEMINI";
  return "UNKNOWN";
}

function readEnvPricing(provider: PlatformCostProvider, unitType: PlatformCostUnitType) {
  if (unitType === "TOKENS" && provider === "GOOGLE_GEMINI") {
    const inputUsdPer1M = readPositiveEnv("GEMINI_PRICE_INPUT_PER_1M_USD");
    const outputUsdPer1M = readPositiveEnv("GEMINI_PRICE_OUTPUT_PER_1M_USD");
    if (inputUsdPer1M !== null || outputUsdPer1M !== null) {
      return { inputUsdPer1M, outputUsdPer1M, unitUsd: null };
    }
  }
  if (unitType === "TOKENS" && provider === "ANTHROPIC") {
    const inputUsdPer1M = readPositiveEnv("ANTHROPIC_PRICE_INPUT_PER_1M_USD");
    const outputUsdPer1M = readPositiveEnv("ANTHROPIC_PRICE_OUTPUT_PER_1M_USD");
    if (inputUsdPer1M !== null || outputUsdPer1M !== null) {
      return { inputUsdPer1M, outputUsdPer1M, unitUsd: null };
    }
  }
  if (unitType === "PAGE" && provider === "GOOGLE_DOCUMENT_AI") {
    const unitUsd = readPositiveEnv("GOOGLE_DOC_AI_PAGE_COST_USD");
    if (unitUsd !== null) return { inputUsdPer1M: null, outputUsdPer1M: null, unitUsd };
  }
  if (unitType === "IMAGE" && provider === "ATLASCLOUD") {
    const unitUsd = readPositiveEnv("WEBTOON_IMAGE_COST_USD");
    if (unitUsd !== null) return { inputUsdPer1M: null, outputUsdPer1M: null, unitUsd };
  }
  return null;
}

function calculateCostUsd({
  unitType,
  unitCount,
  inputTokens,
  outputTokens,
  inputUsdPer1M,
  outputUsdPer1M,
  unitUsd,
}: {
  unitType: PlatformCostUnitType;
  unitCount: number;
  inputTokens: number;
  outputTokens: number;
  inputUsdPer1M: number | null;
  outputUsdPer1M: number | null;
  unitUsd: number | null;
}) {
  const tokenCost =
    (inputTokens * (inputUsdPer1M ?? 0) + outputTokens * (outputUsdPer1M ?? 0)) /
    1_000_000;
  const unitCost = unitType === "TOKENS" ? 0 : unitCount * (unitUsd ?? 0);
  return tokenCost + unitCost;
}

function readPositiveEnv(name: string) {
  const value = readNumberEnv(name, 0);
  return value > 0 ? value : null;
}

function readNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw || raw.trim() === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function decimalToNumber(value: Prisma.Decimal | null | undefined) {
  if (value === null || value === undefined) return null;
  return Number(value);
}

function decimalOrNull(value: number | null) {
  return value === null ? null : new Prisma.Decimal(value);
}

function sanitizeCount(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function roundUsd(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function escapeRegExp(value: string) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<unknown>,
) {
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        await worker(items[index]);
      }
    }),
  );
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}
