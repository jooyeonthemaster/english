import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { ATLAS_GATEWAY_PROVIDER } from "@/lib/atlas-ai";
import { getExtractionAiModelName } from "@/lib/extraction/model-config";
import { resolveUsdKrwRate } from "@/lib/fx-rate";
import { resolveEstimatedPricing } from "@/lib/platform-api-cost-estimates";
import { prisma } from "@/lib/prisma";

export type PlatformCostUnitType = "TOKENS" | "PAGE" | "IMAGE" | "CALL";
export type PlatformCostProvider =
  | "GOOGLE_GEMINI"
  | "ANTHROPIC"
  | "GOOGLE_DOCUMENT_AI"
  | "ATLASCLOUD"
  | "OPENROUTER"
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
  pricingSource: "DB" | "ENV" | "ESTIMATE" | "RECORDED" | "MISSING";
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
        aiCostUsd: true,
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
      sourceKey: `extraction_page:${page.id}:atlas_text`,
      sourceType: "EXTRACTION_PAGE",
      sourceId: page.id,
      sourceDetail: "ATLASCLOUD_OCR",
      academyId: page.job.academyId,
      // OCR 텍스트 호출도 텍스트 게이트웨이(OpenRouter/AtlasCloud)를 통과한다.
      provider: ATLAS_GATEWAY_PROVIDER,
      model: page.modelUsed ?? getExtractionAiModelName("ocr"),
      operationType: "TEXT_EXTRACTION",
      unitType: "TOKENS",
      inputTokens: page.inputTokens ?? 0,
      outputTokens: page.outputTokens ?? 0,
      usageAt: page.completedAt,
      recordedCostUsd: Number(page.aiCostUsd ?? 0) > 0 ? Number(page.aiCostUsd) : null,
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

  if (candidates.length === 0) {
    // 워크벤치 등 sync 스캐너가 훑지 않는(직접 기록되는) 소스의 과거 MISSING
    // 레코드도 새 단가/추정치로 재해결한다.
    await reresolveMissingCosts(start, end);
    return;
  }

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

  // 워크벤치 AI 등 sync 스캐너가 다시 훑지 않고 잡 완료 시점에 직접 기록되는
  // 소스의 과거 MISSING(0원) 레코드를, 저장된 provider/model/토큰 값으로
  // DB→ENV→ESTIMATE 단가를 재적용해 되살린다. 이미 해결된 행은 다음부터 제외.
  await reresolveMissingCosts(start, end);
}

async function reresolveMissingCosts(start: Date, end: Date) {
  const missingRows = await prisma.platformApiUsageCost.findMany({
    where: { pricingSource: "MISSING", usageAt: { gte: start, lt: end } },
    select: {
      id: true,
      provider: true,
      model: true,
      unitType: true,
      unitCount: true,
      calls: true,
      inputTokens: true,
      outputTokens: true,
      usageAt: true,
    },
  });
  if (missingRows.length === 0) return;

  const pricingRows = await prisma.providerPricing.findMany({
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
  });

  await mapWithConcurrency(missingRows, COST_SYNC_CONCURRENCY, async (row) => {
    const resolution = await resolveCost(
      {
        sourceKey: "",
        sourceType: "",
        sourceId: "",
        provider: row.provider as PlatformCostProvider,
        model: row.model,
        unitType: row.unitType as PlatformCostUnitType,
        unitCount: row.unitCount,
        calls: row.calls,
        inputTokens: row.inputTokens,
        outputTokens: row.outputTokens,
        usageAt: row.usageAt,
      },
      pricingRows,
    );
    if (resolution.pricingSource === "MISSING") return;
    await prisma.platformApiUsageCost.update({
      where: { id: row.id },
      data: {
        inputUsdPer1M: decimalOrNull(resolution.inputUsdPer1M),
        outputUsdPer1M: decimalOrNull(resolution.outputUsdPer1M),
        unitUsd: decimalOrNull(resolution.unitUsd),
        usdToKrwRate: new Prisma.Decimal(resolution.usdToKrwRate),
        costUsd: new Prisma.Decimal(resolution.costUsd),
        costKrw: resolution.costKrw,
        pricingSource: resolution.pricingSource,
        pricingId: resolution.pricingId,
      },
    });
  });
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

/**
 * 인터랙티브 AI 호출(잡/로그 엔티티가 없는 1회성 호출)의 원가를 기록하는 헬퍼.
 * - sourceKey는 매 호출마다 유니크(중복 upsert 방지) — 각 호출 = 1 원가행.
 * - provider는 model 문자열에서 자동 판별(providerFromModel).
 * - usage(Vercel AI SDK / SDK 원본)를 주면 토큰을 자동 파싱, 아니면 명시값 사용.
 * - 절대 사용자 경로를 깨지 않도록 내부에서 예외를 삼킨다.
 */
export async function recordAiCost(input: {
  sourceType: string;
  sourceDetail?: string | null;
  academyId?: string | null;
  model: string;
  operationType?: string | null;
  usage?: unknown;
  inputTokens?: number;
  outputTokens?: number;
  /** 게이트웨이가 돌려준 실측 청구액(USD). 없으면 usage 객체에서 자동 추출. */
  recordedCostUsd?: number | null;
  usageAt?: Date;
  metadata?: Prisma.InputJsonValue;
}): Promise<void> {
  try {
    if (!input.model) return;
    const tokens = input.usage
      ? readAiUsageTokens(input.usage)
      : {
          inputTokens: input.inputTokens ?? 0,
          outputTokens: input.outputTokens ?? 0,
        };
    // OpenRouter 실측 원가: atlasUsageWithCost()/REST usageMetadata 가 usage 에
    // 병합해 둔 costUsd·generationId 를 읽어 RECORDED 단가로 기록한다.
    const actual = readAiUsageCost(input.usage);
    const recordedCostUsd = input.recordedCostUsd ?? actual.costUsd;
    const auditMetadata: Record<string, string> = {};
    if (actual.generationId) auditMetadata.generationId = actual.generationId;
    if (actual.upstreamProvider) auditMetadata.upstreamProvider = actual.upstreamProvider;
    if (actual.servedModel && actual.servedModel !== input.model) {
      auditMetadata.servedModel = actual.servedModel;
    }
    const metadata =
      Object.keys(auditMetadata).length > 0
        ? {
            ...(isJsonObject(input.metadata) ? input.metadata : {}),
            ...auditMetadata,
          }
        : input.metadata;
    await recordPlatformApiUsageCost({
      sourceKey: `${input.sourceType.toLowerCase()}:${randomUUID()}`,
      sourceType: input.sourceType,
      sourceId: randomUUID(),
      sourceDetail: input.sourceDetail ?? null,
      academyId: input.academyId ?? null,
      provider: providerFromModel(input.model),
      model: input.model,
      operationType: input.operationType ?? null,
      unitType: "TOKENS",
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
      recordedCostUsd,
      usageAt: input.usageAt ?? new Date(),
      metadata,
    });
  } catch (error) {
    console.warn(`[ai-cost] failed to record ${input.sourceType}`, error);
  }
}

function isJsonObject(
  value: Prisma.InputJsonValue | undefined,
): value is Prisma.JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * usage 객체(atlasUsageWithCost 병합본 또는 REST usageMetadata)에서 실측 원가
 * 필드를 읽는다. 없으면 전부 null — 호출측은 기존 단가표 폴백으로 진행.
 */
export function readAiUsageCost(usage: unknown): {
  costUsd: number | null;
  generationId: string | null;
  upstreamProvider: string | null;
  servedModel: string | null;
} {
  const record = usage && typeof usage === "object" ? (usage as Record<string, unknown>) : {};
  const meta =
    record.usageMetadata && typeof record.usageMetadata === "object"
      ? (record.usageMetadata as Record<string, unknown>)
      : record;
  const rawCost = meta.costUsd ?? meta.cost;
  const costUsd =
    typeof rawCost === "number" && Number.isFinite(rawCost) && rawCost > 0
      ? rawCost
      : null;
  return {
    costUsd,
    generationId: typeof meta.generationId === "string" ? meta.generationId : null,
    upstreamProvider:
      typeof meta.upstreamProvider === "string" ? meta.upstreamProvider : null,
    servedModel: typeof meta.servedModel === "string" ? meta.servedModel : null,
  };
}

export function readAiUsageTokens(usage: unknown) {
  const record = usage && typeof usage === "object" ? (usage as Record<string, unknown>) : {};
  // Vercel AI SDK usage / Anthropic usage / raw Gemini usageMetadata 모두 지원.
  // Gemini REST는 { usageMetadata: { promptTokenCount, candidatesTokenCount } } 형태라
  // 중첩 usageMetadata 도 함께 훑는다.
  const meta =
    record.usageMetadata && typeof record.usageMetadata === "object"
      ? (record.usageMetadata as Record<string, unknown>)
      : record;
  return {
    inputTokens:
      Number(
        meta.inputTokens ?? meta.promptTokens ?? meta.promptTokenCount ?? 0,
      ) || 0,
    outputTokens:
      Number(
        meta.outputTokens ??
          meta.completionTokens ??
          meta.candidatesTokenCount ??
          0,
      ) || 0,
  };
}

async function resolveCost(
  input: RecordApiUsageCostInput,
  pricingRows?: PricingLookupRow[],
): Promise<CostResolution> {
  const recordedCostUsd = input.recordedCostUsd ?? 0;
  // Daily market rate for the usage date (ECB via Frankfurter), self-healing.
  // Falls back internally to the most recent known rate, then PLATFORM_USD_KRW_RATE.
  const usdToKrwRate = await resolveUsdKrwRate(input.usageAt);

  if (recordedCostUsd > 0) {
    return {
      pricingId: null,
      pricingSource: "RECORDED",
      inputUsdPer1M: null,
      outputUsdPer1M: null,
      unitUsd: null,
      usdToKrwRate,
      costUsd: roundUsd(recordedCostUsd),
      costKrw: Math.round(recordedCostUsd * usdToKrwRate),
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
      usdToKrwRate,
      costUsd: roundUsd(cost),
      costKrw: Math.round(cost * usdToKrwRate),
    };
  }

  // 공개 리스트 가격 기반 추정 단가. DB/ENV 단가가 없어도 원가를 0원 처리하지
  // 않고 추정치로 반영한다. 정확한 값은 어드민 단가 등록/청구 정산으로 보정.
  const estimatedPricing = resolveEstimatedPricing(
    input.provider,
    input.unitType,
    input.model,
    input.inputTokens,
  );
  if (estimatedPricing) {
    const cost = calculateCostUsd({
      unitType: input.unitType,
      unitCount: sanitizeCount(input.unitCount ?? 1),
      inputTokens: sanitizeCount(input.inputTokens ?? 0),
      outputTokens: sanitizeCount(input.outputTokens ?? 0),
      ...estimatedPricing,
    });
    return {
      pricingId: null,
      pricingSource: "ESTIMATE",
      inputUsdPer1M: estimatedPricing.inputUsdPer1M,
      outputUsdPer1M: estimatedPricing.outputUsdPer1M,
      unitUsd: estimatedPricing.unitUsd,
      usdToKrwRate,
      costUsd: roundUsd(cost),
      costKrw: Math.round(cost * usdToKrwRate),
    };
  }

  return {
    pricingId: null,
    pricingSource: "MISSING",
    inputUsdPer1M: null,
    outputUsdPer1M: null,
    unitUsd: null,
    usdToKrwRate,
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
    readEnvPricing(input.provider, input.unitType) !== null ||
    resolveEstimatedPricing(input.provider, input.unitType, input.model) !== null
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
  if (
    lower.includes("claude") ||
    lower.includes("anthropic") ||
    lower.includes("gemini") ||
    lower.includes("google/") ||
    lower.includes("openrouter") ||
    lower.includes("moonshot") ||
    lower.includes("kimi") ||
    lower.includes("x-ai/") ||
    lower.includes("grok")
  ) {
    // 실제 트래픽이 통과하는 게이트웨이 버킷(OPENROUTER | ATLASCLOUD).
    // 과거 행은 ATLASCLOUD 로 남고 새 행부터 활성 게이트웨이로 기록된다.
    return ATLAS_GATEWAY_PROVIDER;
  }
  return "UNKNOWN";
}

function readEnvPricing(provider: PlatformCostProvider, unitType: PlatformCostUnitType) {
  if (unitType === "TOKENS" && (provider === "ATLASCLOUD" || provider === "OPENROUTER")) {
    const inputUsdPer1M =
      provider === "OPENROUTER"
        ? readPositiveEnv("OPENROUTER_PRICE_INPUT_PER_1M_USD") ??
          readPositiveEnv("ATLASCLOUD_PRICE_INPUT_PER_1M_USD")
        : readPositiveEnv("ATLASCLOUD_PRICE_INPUT_PER_1M_USD") ??
          readPositiveEnv("OPENROUTER_PRICE_INPUT_PER_1M_USD");
    const outputUsdPer1M =
      provider === "OPENROUTER"
        ? readPositiveEnv("OPENROUTER_PRICE_OUTPUT_PER_1M_USD") ??
          readPositiveEnv("ATLASCLOUD_PRICE_OUTPUT_PER_1M_USD")
        : readPositiveEnv("ATLASCLOUD_PRICE_OUTPUT_PER_1M_USD") ??
          readPositiveEnv("OPENROUTER_PRICE_OUTPUT_PER_1M_USD");
    if (inputUsdPer1M !== null || outputUsdPer1M !== null) {
      return { inputUsdPer1M, outputUsdPer1M, unitUsd: null };
    }
  }
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
