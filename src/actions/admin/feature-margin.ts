import { Prisma } from "@prisma/client";
import {
  CREDIT_COSTS,
  OPERATION_LABELS,
  TOP_UP_PACKS,
  type OperationType,
} from "@/lib/credit-costs";
import {
  getUsdKrwRate,
  kstDateString,
  type UsdKrwRateInfo,
} from "@/lib/fx-rate";
import { prisma } from "@/lib/prisma";

/** 원가 집계 기간(반열림 구간 [start, end)). 미지정 시 전체 누적. */
export interface FeatureMarginRange {
  start: Date;
  end: Date;
}

// 기록이 없는(아직 실사용 데이터가 안 쌓인) 기능의 폴백 추정 원가(USD/1회).
// 조사 근거는 platform-api-cost-estimates.ts 및 프로덕션 실측 평균(2026-07).
const ESTIMATE_USD_PER_ACTION: Record<OperationType, number> = {
  QUESTION_GEN_SINGLE: 0.0228,
  QUESTION_GEN_VOCAB: 0.0204,
  AUTO_GEN_BATCH: 0.0217,
  LEARNING_QUESTION_GEN: 0.02,
  PASSAGE_ANALYSIS: 0.1088,
  GRAMMAR_ENHANCEMENT: 0.005,
  SENTENCE_RETRANSLATION: 0.001,
  QUESTION_EXPLANATION: 0.006,
  QUESTION_MODIFY: 0.005,
  AI_CHAT: 0.008,
  TEXT_EXTRACTION: 0.006,
  PASSAGE_RESTORATION: 0.0017,
  PASSAGE_TRANSFORM: 0.001,
  PASSAGE_VARIANT: 0.002,
  WEBTOON_IMAGE: 0.008,
  WEBTOON_IMAGE_PREMIUM: 0.02,
};

// 표시 순서(카테고리별).
const FEATURE_ORDER: OperationType[] = [
  "QUESTION_GEN_SINGLE",
  "QUESTION_GEN_VOCAB",
  "AUTO_GEN_BATCH",
  "LEARNING_QUESTION_GEN",
  "PASSAGE_ANALYSIS",
  "GRAMMAR_ENHANCEMENT",
  "SENTENCE_RETRANSLATION",
  "QUESTION_EXPLANATION",
  "QUESTION_MODIFY",
  "AI_CHAT",
  "PASSAGE_RESTORATION",
  "PASSAGE_TRANSFORM",
  "PASSAGE_VARIANT",
  "WEBTOON_IMAGE",
  "WEBTOON_IMAGE_PREMIUM",
  "TEXT_EXTRACTION",
];

// 문제생성 계열은 학원 플랜(STANDARD/PREMIUM)에 따라 모델이 달라 원가가 크게 바뀜.
const PLAN_SENSITIVE: ReadonlySet<OperationType> = new Set([
  "QUESTION_GEN_SINGLE",
  "QUESTION_GEN_VOCAB",
  "AUTO_GEN_BATCH",
  "LEARNING_QUESTION_GEN",
  "QUESTION_MODIFY",
]);

const FEATURE_NOTE: Partial<Record<OperationType, string>> = {
  AUTO_GEN_BATCH: "문제 1개당",
  AI_CHAT: "메시지 1개당",
  WEBTOON_IMAGE: "이미지 1장당",
  TEXT_EXTRACTION: "페이지 1장당 · 무료 제공",
};

export interface MarginTierCell {
  label: string;
  perCredit: number;
  price: number;
  marginPct: number | null;
}

export interface FeatureMarginRow {
  operationType: OperationType;
  label: string;
  note: string | null;
  credits: number;
  costKrw: number;
  costUsd: number;
  costSource: "actual" | "estimate";
  sampleCount: number;
  planSensitive: boolean;
  sell: MarginTierCell[];
}

export interface FeatureMarginAnalysis {
  fxRate: UsdKrwRateInfo;
  generatedAt: string;
  tiers: { label: string; credits: number; price: number; perCredit: number }[];
  features: FeatureMarginRow[];
}

interface OpAggregate {
  op: string;
  n_priced: number;
  avg_krw: number | null;
  avg_usd: number | null;
}

export async function getFeatureMarginAnalysis(
  range?: FeatureMarginRange,
  displayDate?: string,
): Promise<FeatureMarginAnalysis> {
  // 기간이 지정되면 usageAt 기준 반열림 구간으로 필터. 미지정 시 전체 누적.
  const rangeFilter = range
    ? Prisma.sql`AND "usageAt" >= ${range.start} AND "usageAt" < ${range.end}`
    : Prisma.empty;
  const [rawRows, fxRate] = await Promise.all([
    prisma.$queryRaw<OpAggregate[]>(Prisma.sql`
      SELECT "operationType" AS op,
        COUNT(*) FILTER (WHERE "pricingSource" <> 'MISSING' AND "costKrw" > 0)::int AS n_priced,
        ROUND(AVG("costKrw") FILTER (WHERE "pricingSource" <> 'MISSING' AND "costKrw" > 0))::int AS avg_krw,
        AVG("costUsd") FILTER (WHERE "pricingSource" <> 'MISSING' AND "costUsd" > 0) AS avg_usd
      FROM "platform_api_usage_costs"
      WHERE "operationType" IS NOT NULL
      ${rangeFilter}
      GROUP BY "operationType"
    `),
    // 선택 기간의 기준일(전일 종가) 환율. 미지정 시 오늘 기준.
    getUsdKrwRate(displayDate ?? kstDateString(new Date())),
  ]);

  const byOp = new Map<string, OpAggregate>();
  for (const row of rawRows) {
    byOp.set(row.op, {
      op: row.op,
      n_priced: Number(row.n_priced) || 0,
      avg_krw: row.avg_krw == null ? null : Number(row.avg_krw),
      avg_usd: row.avg_usd == null ? null : Number(row.avg_usd),
    });
  }

  const tiers = TOP_UP_PACKS.map((pack) => ({
    label: pack.label,
    credits: pack.credits,
    price: pack.price,
    perCredit: pack.price / pack.credits,
  }));

  const features: FeatureMarginRow[] = FEATURE_ORDER.map((op) => {
    const credits = CREDIT_COSTS[op];
    const agg = byOp.get(op);

    let costKrw: number;
    let costUsd: number;
    let costSource: "actual" | "estimate";
    let sampleCount: number;

    if (agg && agg.n_priced > 0 && agg.avg_krw != null) {
      costKrw = agg.avg_krw;
      costUsd = agg.avg_usd ?? costKrw / fxRate.rate;
      costSource = "actual";
      sampleCount = agg.n_priced;
    } else {
      costUsd = ESTIMATE_USD_PER_ACTION[op] ?? 0;
      costKrw = Math.round(costUsd * fxRate.rate);
      costSource = "estimate";
      sampleCount = 0;
    }

    const sell: MarginTierCell[] = tiers.map((tier) => {
      const price = Math.round(tier.perCredit * credits);
      const marginPct =
        price > 0 ? Math.round(((price - costKrw) / price) * 1000) / 10 : null;
      return {
        label: tier.label,
        perCredit: Math.round(tier.perCredit * 10) / 10,
        price,
        marginPct,
      };
    });

    return {
      operationType: op,
      label: OPERATION_LABELS[op],
      note: FEATURE_NOTE[op] ?? null,
      credits,
      costKrw,
      costUsd,
      costSource,
      sampleCount,
      planSensitive: PLAN_SENSITIVE.has(op),
      sell,
    };
  });

  return {
    fxRate,
    generatedAt: new Date().toISOString(),
    tiers: tiers.map((t) => ({
      label: t.label,
      credits: t.credits,
      price: t.price,
      perCredit: Math.round(t.perCredit * 10) / 10,
    })),
    features,
  };
}
