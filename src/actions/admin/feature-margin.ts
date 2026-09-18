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
  // 지문 1편당 — 3.6-flash 1콜(자료 요약 입력 최대 수천 토큰 + 출력 ~400토큰).
  // PASSAGE_VARIANT($0.002, flash-lite·입력 지문 1편)의 2배 가정: 상위 모델 +
  // 자료(어법·단어장) 입력이 붙는 만큼만 올려 잡았다.
  PASSAGE_AUTHORING: 0.004,
  WEBTOON_IMAGE: 0.008,
  WEBTOON_IMAGE_PREMIUM: 0.02,
  WEBTOON_EXAM_DOWNLOAD: 0.0002,
  EXAM_ANALYSIS: 0.057, // 문항 1개당 — v3 직접분석 실측(26-07-06): 28문항 $1.59(E1a $0.18+E1b/c $1.40)/28
  EXAM_STUDENT_REPORT: 0.05, // 학생 1명당(5cr): E2 판독 $0.15(무과금분 포함)+E4 내러티브 ~$0.10 ≈ $0.25/5cr
  EXAM_ANALYSIS_BOOST: 0.05, // 문항 1개당 — E1b 개작 텍스트 배치(8문항/콜, vision 프로브 없음). E1b/c 실측 $1.40/28문항 준용
  EXAM_TREND_ANALYSIS: 0.1, // 학생 1명당 — 프리미엄 내러티브 1콜(E4 동급, 이력 집계 입력 포함) ~$0.10/콜
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
  "PASSAGE_AUTHORING",
  "WEBTOON_IMAGE",
  "WEBTOON_IMAGE_PREMIUM",
  "WEBTOON_EXAM_DOWNLOAD",
  "EXAM_ANALYSIS",
  "EXAM_STUDENT_REPORT",
  "EXAM_ANALYSIS_BOOST",
  "EXAM_TREND_ANALYSIS",
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
  WEBTOON_EXAM_DOWNLOAD: "검수 완료 기출 1장당",
  TEXT_EXTRACTION: "페이지 1장당 · 무료 제공",
  EXAM_ANALYSIS: "문항 1개당 · 최소 15크레딧",
  EXAM_STUDENT_REPORT: "학생 1명당",
  EXAM_ANALYSIS_BOOST: "문항 1개당",
  EXAM_TREND_ANALYSIS: "학생 1명당",
};

export interface MarginTierCell {
  label: string;
  perCredit: number;
  price: number;
  marginPct: number | null;
}

/**
 * 판매가 기준 단가 1행.
 *  - pack: DB 충전 상품(정가). 최근 90일 결제 완료 표본이 충분하면 실판매 단가로 마진 계산.
 *  - blended: 최근 90일 전체 결제의 가중 평균 단가(결제액 합 ÷ 지급 크레딧 합).
 */
export interface MarginTier {
  key: string;
  kind: "pack" | "blended";
  label: string;
  /** pack: 상품 크레딧 · blended: 90일 지급 크레딧 합 */
  credits: number;
  /** pack: 정가 · blended: 90일 결제액 합 */
  price: number;
  /** 정가 크레딧당(원, 반올림 전). blended 는 null */
  listPerCredit: number | null;
  /** 90일 실판매 크레딧당(원, 반올림 전). 결제 0건이면 null */
  realizedPerCredit: number | null;
  realizedCount: number;
  /** 마진 계산에 실제로 쓴 크레딧당 단가(원, 반올림 전 — 표시는 화면에서 소수 1자리) */
  perCredit: number;
  basis: "realized" | "list";
}

export interface FeatureMarginRow {
  operationType: OperationType;
  label: string;
  note: string | null;
  /** 상수 크레딧(CREDIT_COSTS) — 판매가 계산에 쓰는 값 */
  credits: number;
  /**
   * 같은 기간 실청구 평균 크레딧 = Σ|CONSUMPTION| ÷ 소모 건수.
   * 최소 청구(EXAM_ANALYSIS 15C)·costOverride·부분환불 때문에 상수와 달라진다 —
   * 판매가는 상수 기준이므로 이 값과 다르면 화면에 함께 표기한다. 표본 0이면 null.
   */
  realizedCreditsPerAction: number | null;
  /** 실청구 표본(소모 거래 건수) */
  actionCount: number;
  costKrw: number;
  costUsd: number;
  costSource: "actual" | "estimate";
  /** 원가 표본 — API 호출 1행 단위(액션 1건과 1:1 이 아니다) */
  sampleCount: number;
  planSensitive: boolean;
  sell: MarginTierCell[];
}

export interface FeatureMarginAnalysis {
  fxRate: UsdKrwRateInfo;
  generatedAt: string;
  tiers: MarginTier[];
  /** 정가 출처 — DB 충전 상품(db) · 상품 없음 폴백(code: TOP_UP_PACKS) */
  listPriceSource: "db" | "code";
  /** 실판매 단가 표본 기간 [start, end) ISO · 표본 기준 건수 */
  realizedWindow: { start: string; end: string; days: number; minPackSample: number; minBlendedSample: number };
  features: FeatureMarginRow[];
}

// 실판매 단가 표본 — 최근 90일 결제 완료(COMPLETED) 충전. 표본이 부족하면 정가 폴백.
const REALIZED_WINDOW_DAYS = 90;
const MIN_PACK_SAMPLE = 5;
const MIN_BLENDED_SAMPLE = 10;
const round1 = (n: number) => Math.round(n * 10) / 10;
const num = (v: unknown) => (v == null ? 0 : Number(v));

async function loadPriceTiers(anchor: Date): Promise<{
  tiers: MarginTier[];
  listPriceSource: "db" | "code";
  window: { start: Date; end: Date };
}> {
  const window = {
    start: new Date(anchor.getTime() - REALIZED_WINDOW_DAYS * 86_400_000),
    end: anchor,
  };
  const [products, realizedRows] = await Promise.all([
    prisma.creditTopUpProduct.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { creditAmount: "asc" }],
      select: { code: true, name: true, creditAmount: true, basePrice: true },
    }),
    // 상품 코드는 결제 시점 customData.productCode(프로모션 보너스가 붙어도 코드 유지).
    prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
      SELECT COALESCE("customData"->>'productCode', '') AS code,
        COUNT(*)::int AS n,
        SUM(COALESCE("paidAmount", "price"))::bigint AS paid,
        SUM("creditAmount")::bigint AS credits
      FROM "credit_top_ups"
      WHERE "status" = 'COMPLETED'
        AND COALESCE("paidAt", "completedAt") >= ${window.start}
        AND COALESCE("paidAt", "completedAt") < ${window.end}
      GROUP BY 1
    `),
  ]);
  const listPriceSource: "db" | "code" = products.length > 0 ? "db" : "code";
  const packs = products.length > 0
    ? products.map((p) => ({ code: p.code, label: p.name, credits: p.creditAmount, price: p.basePrice }))
    : TOP_UP_PACKS.map((p) => ({ code: `CREDIT_${p.credits}`, label: p.label, credits: p.credits, price: p.price }));

  const realized = new Map(
    realizedRows.map((r) => [String(r.code ?? ""), { n: num(r.n), paid: num(r.paid), credits: num(r.credits) }]),
  );
  const tiers: MarginTier[] = packs.map((pack) => {
    const r = realized.get(pack.code);
    const listPerCredit = pack.price / pack.credits;
    const realizedPerCredit = r && r.credits > 0 ? r.paid / r.credits : null;
    const useRealized = realizedPerCredit != null && (r?.n ?? 0) >= MIN_PACK_SAMPLE;
    return {
      key: pack.code,
      kind: "pack",
      label: pack.label,
      credits: pack.credits,
      price: pack.price,
      listPerCredit,
      realizedPerCredit,
      realizedCount: r?.n ?? 0,
      perCredit: useRealized && realizedPerCredit != null ? realizedPerCredit : listPerCredit,
      basis: useRealized ? "realized" : "list",
    };
  });

  const total = Array.from(realized.values()).reduce(
    (acc, r) => ({ n: acc.n + r.n, paid: acc.paid + r.paid, credits: acc.credits + r.credits }),
    { n: 0, paid: 0, credits: 0 },
  );
  if (total.n >= MIN_BLENDED_SAMPLE && total.credits > 0) {
    const perCredit = total.paid / total.credits;
    tiers.push({
      key: "REALIZED_BLENDED",
      kind: "blended",
      label: "실판매 평균",
      credits: total.credits,
      price: total.paid,
      listPerCredit: null,
      realizedPerCredit: perCredit,
      realizedCount: total.n,
      perCredit,
      basis: "realized",
    });
  }
  return { tiers, listPriceSource, window };
}

interface OpAggregate {
  op: string;
  n_priced: number;
  avg_krw: number | null;
  avg_usd: number | null;
}

interface OpConsumption {
  op: string;
  actions: number;
  credits: number;
}

export async function getFeatureMarginAnalysis(
  range?: FeatureMarginRange,
  displayDate?: string,
): Promise<FeatureMarginAnalysis> {
  // 기간이 지정되면 usageAt 기준 반열림 구간으로 필터. 미지정 시 전체 누적.
  const rangeFilter = range
    ? Prisma.sql`AND "usageAt" >= ${range.start} AND "usageAt" < ${range.end}`
    : Prisma.empty;
  // 실판매 단가 표본은 선택 기간 종료 시점(미래면 지금)까지의 최근 90일.
  const anchor = new Date(Math.min(range?.end.getTime() ?? Date.now(), Date.now()));
  // 실청구 크레딧은 크레딧 거래(createdAt) 기준 — 원가 쪽 usageAt 과 같은 구간.
  const consumptionRangeFilter = range
    ? Prisma.sql`AND "createdAt" >= ${range.start} AND "createdAt" < ${range.end}`
    : Prisma.empty;
  const [rawRows, consumptionRows, fxRate, priceTiers] = await Promise.all([
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
    prisma.$queryRaw<OpConsumption[]>(Prisma.sql`
      SELECT "operationType" AS op,
        COUNT(*)::int AS actions,
        SUM(ABS("amount"))::int AS credits
      FROM "credit_transactions"
      WHERE "type" = 'CONSUMPTION' AND "operationType" IS NOT NULL
      ${consumptionRangeFilter}
      GROUP BY "operationType"
    `),
    // 선택 기간의 기준일(전일 종가) 환율. 미지정 시 오늘 기준.
    getUsdKrwRate(displayDate ?? kstDateString(new Date())),
    loadPriceTiers(anchor),
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

  const consumptionByOp = new Map<string, OpConsumption>();
  for (const row of consumptionRows) {
    consumptionByOp.set(row.op, {
      op: row.op,
      actions: Number(row.actions) || 0,
      credits: Number(row.credits) || 0,
    });
  }

  const { tiers } = priceTiers;

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
      return { label: tier.key, perCredit: round1(tier.perCredit), price, marginPct };
    });

    const consumption = consumptionByOp.get(op);
    const realizedCreditsPerAction =
      consumption && consumption.actions > 0
        ? consumption.credits / consumption.actions
        : null;

    return {
      operationType: op,
      label: OPERATION_LABELS[op],
      note: FEATURE_NOTE[op] ?? null,
      credits,
      realizedCreditsPerAction,
      actionCount: consumption?.actions ?? 0,
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
    tiers,
    listPriceSource: priceTiers.listPriceSource,
    realizedWindow: {
      start: priceTiers.window.start.toISOString(),
      end: priceTiers.window.end.toISOString(),
      days: REALIZED_WINDOW_DAYS,
      minPackSample: MIN_PACK_SAMPLE,
      minBlendedSample: MIN_BLENDED_SAMPLE,
    },
    features,
  };
}
