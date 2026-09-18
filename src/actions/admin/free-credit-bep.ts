import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  sumRevenue,
  topUpGrossWhere,
  topUpRefundWhere,
  type RevenueBreakdown,
} from "@/lib/admin-revenue";
import { getSignupCredits } from "@/lib/platform-settings";
import { isInternalAccount } from "@/actions/admin-members/_shared";

/**
 * 무료 크레딧(신규 가입 증정·보너스·어드민 지급) 프로그램의 손익분기(BEP) 분석.
 *
 * 원가는 학원 단위로만 기록되고 크레딧 지갑도 단일 잔액이라 "무료 크레딧 1개의
 * 실사용 원가"를 직접 추적할 수는 없다. 대신 같은 기간의 실측치로 blended 단가를
 * 구해 추정한다:
 *   평균 원가/크레딧 = Σ API 원가(platform_api_usage_costs) / Σ 순소모 크레딧
 *   순소모 = CONSUMPTION − 실패 자동환불(REFUND · referenceType CREDIT_TRANSACTION)
 * 이 단가를 무료·유료 크레딧에 공통 적용해 무료 프로그램 순손익과 BEP 전환율을 낸다.
 * 매출은 src/lib/admin-revenue.ts 단일 정의(D1)를 쓴다.
 */
export interface FreeCreditBep {
  /** 집계 기간 [start, end) */
  rangeLabel: string;
  /** 실측 blended 원가/크레딧(원). 데이터 부족 시 추정 폴백. */
  avgCostPerCreditKrw: number;
  rateSource: "actual" | "estimate";
  totalApiCostKrw: number;
  /** 순소모 크레딧(실패 자동환불 차감 후) */
  totalCreditsConsumed: number;
  /** 실패 자동환불로 돌려준 크레딧(순소모 계산에서 차감한 양) */
  refundedCredits: number;
  /**
   * 무료 지급 원가에 반영한 크레딧 —
   * 기간 내 무료 지급 총량에서 내부·테스트 계정(D16)과 단건 대량 지급을 뺀 값.
   * 총량·제외분은 freeGrantSplit 에 그대로 남는다(합계 보존).
   */
  freeCreditsGranted: number;
  freeCostKrw: number;
  /** 무료 지급 분리 표기(D16 · 단건 대량 지급) */
  freeGrantSplit: FreeGrantSplit;
  /** 유료 매출(admin-revenue 순매출) · 유료 크레딧 · 원가 · 이익 */
  paidRevenueKrw: number;
  revenue: RevenueBreakdown;
  paidCredits: number;
  paidCostKrw: number;
  grossProfitKrw: number;
  /** 유료 이익 − 무료 원가 */
  netKrw: number;
  /** 기간 내 신규 가입 학원 수 */
  newSignups: number;
  /** 기간 내 결제 완료(COMPLETED)가 있는 학원 수 — 재구매 학원도 포함 */
  payersInPeriod: number;
  /** 누적 전체 학원 수(내부·테스트·해지 포함) */
  totalAcademies: number;
  /** 누적 유료 학원(COMPLETED 결제 1회 이상) */
  payingAcademies: number;
  /** 누적 전환율 = payingAcademies / totalAcademies */
  conversionRate: number | null;
  /** 유료 학원 1곳당 이익(누적 기준) */
  profitPerPayerKrw: number | null;
  /** 가입 1곳당 무료 원가(구조적: 가입 지급량 × 평균원가) */
  freeCostPerSignupKrw: number;
  /** BEP 전환율 = freeCostPerSignup / profitPerPayer */
  bepConversionRate: number | null;
  /** 가입당 무료 지급 크레딧(플랫폼 설정 signup_credits) */
  assumedFreeCreditsPerSignup: number;
}

// 실측 소모 데이터가 없을 때 쓰는 blended 추정 원가/크레딧(원). 문제생성 계열 근사.
const FALLBACK_COST_PER_CREDIT_KRW = 17;

/**
 * 단건 대량 지급 임계(크레딧). 이 이상을 한 번에 지급한 건은 「무료 회원 프로그램」의
 * 구조적 원가가 아니라 개별 사건(특별 지급·베타 보상)이라 배지·원가에서 분리한다.
 * 실측 계기: 2026-05-11 다른영어학원 ALLOCATION 100,000,000C — 이 한 건이
 * 2026년 5월 무료 원가의 99.8% 를 차지해 「이 기간 적자 -₩535,365,633」을 만들었다.
 * DB 는 건드리지 않는다(D3) — 표시 계층 분리다.
 */
const LARGE_GRANT_CREDITS = 100_000;

/** 무료 지급 상위 표기 건수 */
const TOP_GRANT_ROWS = 3;

export interface FreeGrantItem {
  academyName: string;
  credits: number;
  description: string | null;
  /** 지급 시각(ISO) */
  occurredAt: string;
  kind: "internal" | "large" | "counted";
}

export interface FreeGrantSplit {
  /** 기간 내 무료 지급 총량(분리 전) — counted + internal + large */
  totalCredits: number;
  totalCount: number;
  /** 내부·테스트 계정 지급(D16) */
  internalCredits: number;
  internalCount: number;
  /** 단건 {LARGE_GRANT_CREDITS}C 이상 지급(내부 계정분은 internal 로 먼저 분류) */
  largeCredits: number;
  largeCount: number;
  /** 원가·배지에 반영한 지급 */
  countedCredits: number;
  countedCount: number;
  largeThreshold: number;
  /** 지급액 상위 건(최대 3) */
  top: FreeGrantItem[];
}

/**
 * 무료 지급 = 양수 지급 중 유료 충전이 아닌 것.
 * Prisma 의 NOT { referenceType } 은 SQL `NOT (col = $1)` 이라 referenceType 이 NULL 인
 * 가입 지급(ALLOCATION) 행을 통째로 빠뜨린다(26-09-17 실측: 이번 달 3,800C 누락).
 * 유료 충전의 지급 거래(creditTopUp 연결)는 ADJUSTMENT 로 기록된 수동 지급까지 제외한다.
 */
function freeGrantWhere(range: { gte: Date; lt: Date }): Prisma.CreditTransactionWhereInput {
  return {
    amount: { gt: 0 },
    createdAt: range,
    type: { not: "REFUND" },
    AND: [
      { OR: [{ referenceType: null }, { NOT: { referenceType: "CREDIT_TOP_UP" } }] },
      { creditTopUp: { is: null } },
    ],
  };
}

type FreeGrantRow = {
  amount: number;
  description: string | null;
  createdAt: Date;
  academy: {
    name: string;
    staff: { name: string | null; email: string | null }[];
  };
};

/**
 * 무료 지급을 세 갈래로 나눈다 — 합계는 보존된다(counted + internal + large = total).
 *  - internal: 내부·테스트 계정(D16). 매출은 D2 대로 제외하지 않고 무료 원가에서만 뺀다.
 *  - large:    단건 LARGE_GRANT_CREDITS 이상. 프로그램 원가가 아니라 개별 사건.
 *  - counted:  나머지 — 무료 지급 원가·BEP 배지에 반영.
 */
function splitFreeGrants(rows: FreeGrantRow[]): FreeGrantSplit {
  const split: FreeGrantSplit = {
    totalCredits: 0,
    totalCount: 0,
    internalCredits: 0,
    internalCount: 0,
    largeCredits: 0,
    largeCount: 0,
    countedCredits: 0,
    countedCount: 0,
    largeThreshold: LARGE_GRANT_CREDITS,
    top: [],
  };
  const items: FreeGrantItem[] = [];
  for (const row of rows) {
    const staff = row.academy.staff[0];
    const internal = isInternalAccount({
      name: staff?.name,
      academyName: row.academy.name,
      email: staff?.email,
    });
    const kind: FreeGrantItem["kind"] = internal
      ? "internal"
      : row.amount >= LARGE_GRANT_CREDITS
        ? "large"
        : "counted";
    split.totalCredits += row.amount;
    split.totalCount += 1;
    if (kind === "internal") {
      split.internalCredits += row.amount;
      split.internalCount += 1;
    } else if (kind === "large") {
      split.largeCredits += row.amount;
      split.largeCount += 1;
    } else {
      split.countedCredits += row.amount;
      split.countedCount += 1;
    }
    items.push({
      academyName: row.academy.name,
      credits: row.amount,
      description: row.description,
      occurredAt: row.createdAt.toISOString(),
      kind,
    });
  }
  split.top = items
    .sort((a, b) => b.credits - a.credits)
    .slice(0, TOP_GRANT_ROWS);
  return split;
}

/** [start, end) 유료 충전 크레딧 = 결제일 기준 지급 − 환불일 기준 회수 */
async function sumPaidCredits(start: Date, end: Date): Promise<number> {
  const [gross, refunded] = await Promise.all([
    prisma.creditTopUp.aggregate({ _sum: { creditAmount: true }, where: topUpGrossWhere(start, end) }),
    prisma.creditTopUp.aggregate({ _sum: { creditAmount: true }, where: topUpRefundWhere(start, end) }),
  ]);
  return (gross._sum.creditAmount ?? 0) - (refunded._sum.creditAmount ?? 0);
}

export async function getFreeCreditBep(
  range: { start: Date; end: Date },
  rangeLabel: string,
): Promise<FreeCreditBep> {
  const where = { gte: range.start, lt: range.end };
  const allTimeStart = new Date(0);
  const now = new Date();

  const [
    apiCost,
    consumed,
    refunded,
    freeGrantRows,
    revenue,
    paidCredits,
    periodPayerRows,
    newSignups,
    totalAcademies,
    allTimePayerRows,
    allTimeRevenue,
    allTimePaidCredits,
    signupCredits,
  ] = await Promise.all([
    prisma.platformApiUsageCost.aggregate({
      _sum: { costKrw: true },
      where: { usageAt: where },
    }),
    prisma.creditTransaction.aggregate({
      _sum: { amount: true },
      where: { type: "CONSUMPTION", createdAt: where },
    }),
    prisma.creditTransaction.aggregate({
      _sum: { amount: true },
      where: { type: "REFUND", referenceType: "CREDIT_TRANSACTION", createdAt: where },
    }),
    // 무료 지급은 행 단위로 읽는다 — 내부·테스트(D16)·단건 대량 지급을 분리 표기해야 한다.
    prisma.creditTransaction.findMany({
      where: freeGrantWhere(where),
      select: {
        amount: true,
        description: true,
        createdAt: true,
        academy: {
          select: {
            name: true,
            staff: {
              select: { name: true, email: true },
              orderBy: { createdAt: "asc" },
              take: 1,
            },
          },
        },
      },
    }),
    sumRevenue(range.start, range.end),
    sumPaidCredits(range.start, range.end),
    prisma.creditTopUp.findMany({
      where: { ...topUpGrossWhere(range.start, range.end), status: "COMPLETED" },
      distinct: ["academyId"],
      select: { academyId: true },
    }),
    prisma.academy.count({ where: { createdAt: where } }),
    // 전환율은 하루 단위론 왜곡되므로(가입-결제 시점 불일치) 누적 기준으로 본다.
    prisma.academy.count(),
    prisma.creditTopUp.findMany({
      where: { status: "COMPLETED" },
      distinct: ["academyId"],
      select: { academyId: true },
    }),
    sumRevenue(allTimeStart, now),
    sumPaidCredits(allTimeStart, now),
    getSignupCredits(),
  ]);

  const totalApiCostKrw = apiCost._sum.costKrw ?? 0;
  const refundedCredits = Math.max(0, refunded._sum.amount ?? 0);
  const totalCreditsConsumed = Math.max(
    0,
    Math.abs(consumed._sum.amount ?? 0) - refundedCredits,
  );
  const freeGrantSplit = splitFreeGrants(freeGrantRows);
  // 무료 원가·배지에는 분리 후 값만 쓴다(D16 내부·테스트 제외 + 단건 대량 지급 분리).
  const freeCreditsGranted = freeGrantSplit.countedCredits;
  const paidRevenueKrw = revenue.net;
  const payersInPeriod = periodPayerRows.length;
  const payingAcademies = allTimePayerRows.length;

  const rateSource: "actual" | "estimate" =
    totalCreditsConsumed > 0 && totalApiCostKrw > 0 ? "actual" : "estimate";
  const avgCostPerCreditKrw =
    rateSource === "actual"
      ? totalApiCostKrw / totalCreditsConsumed
      : FALLBACK_COST_PER_CREDIT_KRW;

  // 기간 손익
  const freeCostKrw = Math.round(freeCreditsGranted * avgCostPerCreditKrw);
  const paidCostKrw = Math.round(paidCredits * avgCostPerCreditKrw);
  const grossProfitKrw = paidRevenueKrw - paidCostKrw;
  const netKrw = grossProfitKrw - freeCostKrw;

  // 전환율·BEP: 누적/구조적 기준
  const conversionRate =
    totalAcademies > 0 ? payingAcademies / totalAcademies : null;
  const allTimeGrossProfitKrw =
    allTimeRevenue.net - Math.round(allTimePaidCredits * avgCostPerCreditKrw);
  const profitPerPayerKrw =
    payingAcademies > 0 ? allTimeGrossProfitKrw / payingAcademies : null;
  // 가입 1곳당 무료 원가 = 가입 지급 크레딧(플랫폼 설정) × 평균 원가/크레딧
  const freeCostPerSignupKrw = Math.round(signupCredits * avgCostPerCreditKrw);
  const bepConversionRate =
    profitPerPayerKrw != null && profitPerPayerKrw > 0
      ? freeCostPerSignupKrw / profitPerPayerKrw
      : null;

  return {
    rangeLabel,
    avgCostPerCreditKrw,
    rateSource,
    totalApiCostKrw,
    totalCreditsConsumed,
    refundedCredits,
    freeCreditsGranted,
    freeCostKrw,
    freeGrantSplit,
    paidRevenueKrw,
    revenue,
    paidCredits,
    paidCostKrw,
    grossProfitKrw,
    netKrw,
    newSignups,
    payersInPeriod,
    totalAcademies,
    payingAcademies,
    conversionRate,
    profitPerPayerKrw,
    freeCostPerSignupKrw,
    bepConversionRate,
    assumedFreeCreditsPerSignup: signupCredits,
  };
}
