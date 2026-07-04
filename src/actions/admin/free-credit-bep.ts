import { prisma } from "@/lib/prisma";

/**
 * 무료 크레딧(신규 가입 증정·보너스·어드민 지급) 프로그램의 손익분기(BEP) 분석.
 *
 * 원가는 학원 단위로만 기록되고 크레딧 지갑도 단일 잔액이라 "무료 크레딧 1개의
 * 실사용 원가"를 직접 추적할 수는 없다. 대신 같은 기간의 실측치로 blended 단가를
 * 구해 추정한다:
 *   평균 원가/크레딧 = Σ API 원가(platform_api_usage_costs) / Σ 소모 크레딧(CONSUMPTION)
 * 이 단가를 무료·유료 크레딧에 공통 적용해 무료 프로그램 순손익과 BEP 전환율을 낸다.
 */
export interface FreeCreditBep {
  /** 집계 기간 [start, end) */
  rangeLabel: string;
  /** 실측 blended 원가/크레딧(원). 데이터 부족 시 추정 폴백. */
  avgCostPerCreditKrw: number;
  rateSource: "actual" | "estimate";
  totalApiCostKrw: number;
  totalCreditsConsumed: number;
  /** 무료로 지급된 크레딧(유료 충전 제외 양수 지급) */
  freeCreditsGranted: number;
  freeCostKrw: number;
  /** 유료 충전(완료) 매출·크레딧·원가·이익 */
  paidRevenueKrw: number;
  paidCredits: number;
  paidCostKrw: number;
  grossProfitKrw: number;
  /** 유료 이익 − 무료 원가 */
  netKrw: number;
  /** 기간 내 신규 가입 학원 수 */
  newSignups: number;
  /** 기간 내 유료 전환(완료 결제) 학원 수 */
  payersInPeriod: number;
  /** 누적 전체 학원 수 */
  totalAcademies: number;
  /** 누적 유료 전환(한 번이라도 결제한) 학원 수 */
  payingAcademies: number;
  /** 누적 전환율 = payingAcademies / totalAcademies */
  conversionRate: number | null;
  /** 유료 전환 1인당 이익(누적 기준) */
  profitPerPayerKrw: number | null;
  /** 가입 1인당 무료 원가(구조적: 가정 지급량 × 평균원가) */
  freeCostPerSignupKrw: number;
  /** BEP 전환율 = freeCostPerSignup / profitPerPayer */
  bepConversionRate: number | null;
  /** 가입당 무료 지급 가정 크레딧 */
  assumedFreeCreditsPerSignup: number;
}

// 실측 소모 데이터가 없을 때 쓰는 blended 추정 원가/크레딧(원). 문제생성 계열 근사.
const FALLBACK_COST_PER_CREDIT_KRW = 17;
// 가입 1인당 무료 증정 크레딧(구조적 BEP 계산 전제). 실제 지급 정책과 맞춤.
const ASSUMED_FREE_CREDITS_PER_SIGNUP = 100;

export async function getFreeCreditBep(
  range: { start: Date; end: Date },
  rangeLabel: string,
): Promise<FreeCreditBep> {
  const where = { gte: range.start, lt: range.end };

  const [
    apiCost,
    consumed,
    freeGranted,
    paidAgg,
    periodPayerRows,
    newSignups,
    totalAcademies,
    allTimePayerRows,
    allTimePaid,
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
      where: {
        amount: { gt: 0 },
        createdAt: where,
        type: { not: "REFUND" },
        NOT: { referenceType: "CREDIT_TOP_UP" }, // 유료 충전 제외
      },
    }),
    prisma.creditTopUp.aggregate({
      _sum: { price: true, creditAmount: true },
      where: { status: "COMPLETED", completedAt: where },
    }),
    prisma.creditTopUp.findMany({
      where: { status: "COMPLETED", completedAt: where },
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
    prisma.creditTopUp.aggregate({
      _sum: { price: true, creditAmount: true },
      where: { status: "COMPLETED" },
    }),
  ]);

  const totalApiCostKrw = apiCost._sum.costKrw ?? 0;
  const totalCreditsConsumed = Math.abs(consumed._sum.amount ?? 0);
  const freeCreditsGranted = freeGranted._sum.amount ?? 0;
  const paidRevenueKrw = paidAgg._sum.price ?? 0;
  const paidCredits = paidAgg._sum.creditAmount ?? 0;
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
    (allTimePaid._sum.price ?? 0) -
    Math.round((allTimePaid._sum.creditAmount ?? 0) * avgCostPerCreditKrw);
  const profitPerPayerKrw =
    payingAcademies > 0 ? allTimeGrossProfitKrw / payingAcademies : null;
  // 가입 1인당 무료 원가 = 가정 지급 크레딧(100C) × 평균 원가/크레딧
  const freeCostPerSignupKrw = Math.round(
    ASSUMED_FREE_CREDITS_PER_SIGNUP * avgCostPerCreditKrw,
  );
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
    freeCreditsGranted,
    freeCostKrw,
    paidRevenueKrw,
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
    assumedFreeCreditsPerSignup: ASSUMED_FREE_CREDITS_PER_SIGNUP,
  };
}
