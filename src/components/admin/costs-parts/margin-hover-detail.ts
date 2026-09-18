import type { FeatureMarginAnalysis, FeatureMarginRow } from "@/actions/admin/feature-margin";
import type { FreeCreditBep } from "@/actions/admin/free-credit-bep";
import { detailFields, type AdminDetail } from "@/lib/admin-detail-types";
import { formatCurrency, formatNumber as num } from "@/lib/utils";

// 기능별 마진 화면(무료 크레딧 BEP 카드 · 기능별 마진 표) 호버·팝업 상세.
// 서버에서 이미 계산해 내려온 값으로 계산식의 입력값을 풀어 보여준다(추가 조회 없음).

const won = (n: number) => formatCurrency(Math.round(n));
const pct = (rate: number | null) => (rate == null ? "—" : `${(rate * 100).toFixed(1)}%`);

// ─── 무료 크레딧 BEP 카드 ───────────────────────────────────────────────

export type BepDetailKey =
  | "conversion"
  | "bep"
  | "freePerSignup"
  | "avgCost"
  | "freeCost"
  | "paid"
  | "profitPerPayer";

export function bepDetails(d: FreeCreditBep): Record<BepDetailKey, AdminDetail> {
  const rateNote =
    d.rateSource === "actual"
      ? "실측 (기간 API 원가 ÷ 기간 소모 크레딧)"
      : "추정 (실측 소모 데이터 부족 → 고정 추정 단가)";
  const rateInputs = detailFields([
    ["기간 API 원가", won(d.totalApiCostKrw)],
    ["기간 소모 크레딧", `${num(d.totalCreditsConsumed)}C`],
    ["평균 원가/크레딧", `${won(d.avgCostPerCreditKrw)} (${d.avgCostPerCreditKrw.toFixed(2)}원)`],
    ["단가 근거", rateNote, true],
  ]);
  const gap =
    d.conversionRate != null && d.bepConversionRate != null
      ? `${((d.conversionRate - d.bepConversionRate) * 100).toFixed(1)}%p`
      : null;

  return {
    conversion: {
      title: "누적 전환율",
      subtitle: "누적 기준 — 한 번이라도 충전을 완료한 학원 ÷ 전체 학원",
      fields: detailFields([
        ["전체 학원(누적)", `${num(d.totalAcademies)}곳`],
        ["유료 전환 학원(누적)", `${num(d.payingAcademies)}곳`],
        ["누적 전환율", pct(d.conversionRate)],
        ["BEP 전환율", pct(d.bepConversionRate)],
        ["BEP 대비", gap],
        ["이 기간 신규 가입", `${num(d.newSignups)}곳`],
        ["이 기간 결제 학원", `${num(d.payersInPeriod)}곳`],
      ]),
    },
    bep: {
      title: "BEP 전환율",
      subtitle: "BEP = 가입 1인당 무료 원가 ÷ 전환 1인당 이익(누적)",
      fields: detailFields([
        ["가입 1인당 무료 원가", won(d.freeCostPerSignupKrw)],
        ["전환 1인당 이익(누적)", d.profitPerPayerKrw != null ? won(d.profitPerPayerKrw) : "계산 불가(유료 학원 없음)"],
        ["BEP 전환율", pct(d.bepConversionRate)],
        ["현재 누적 전환율", pct(d.conversionRate)],
        ["BEP 대비", gap],
      ]),
    },
    freePerSignup: {
      title: "1인당 무료 원가",
      subtitle: "가입 증정 크레딧(가정) × 평균 원가/크레딧",
      fields: [
        ...detailFields([
          ["가입당 증정(가정)", `${num(d.assumedFreeCreditsPerSignup)}C`],
          ["1인당 무료 원가", won(d.freeCostPerSignupKrw)],
          [
            "이 기간 실제 1인당 지급",
            d.newSignups > 0 && `${num(Math.round(d.freeCreditsGranted / d.newSignups))}C (신규 ${num(d.newSignups)}곳)`,
          ],
        ]),
        ...rateInputs,
      ],
    },
    avgCost: {
      title: "평균 원가/크레딧",
      subtitle: "무료·유료 크레딧에 공통 적용하는 blended 단가",
      fields: rateInputs,
    },
    freeCost: {
      title: "무료 지급 원가",
      subtitle: "기간 내 무료 지급 크레딧(유료 충전·환불 제외) × 평균 원가/크레딧",
      fields: detailFields([
        ["무료 지급 크레딧", `${num(d.freeCreditsGranted)}C`],
        ["평균 원가/크레딧", won(d.avgCostPerCreditKrw)],
        ["무료 지급 원가", won(d.freeCostKrw)],
        ["이 기간 신규 가입", `${num(d.newSignups)}곳`],
        ["유료 이익", won(d.grossProfitKrw)],
        ["순손익(유료 이익 − 무료 원가)", won(d.netKrw)],
      ]),
    },
    paid: {
      title: "유료 매출 · 이익",
      subtitle: "기간 내 완료된 크레딧 충전 기준",
      fields: detailFields([
        ["유료 매출", won(d.paidRevenueKrw)],
        ["유료 크레딧", `${num(d.paidCredits)}C`],
        ["유료 크레딧 원가", `${won(d.paidCostKrw)} (${num(d.paidCredits)}C × ${won(d.avgCostPerCreditKrw)})`],
        ["유료 이익", won(d.grossProfitKrw)],
        ["이익률", d.paidRevenueKrw > 0 && `${((d.grossProfitKrw / d.paidRevenueKrw) * 100).toFixed(1)}%`],
        ["결제 학원", `${num(d.payersInPeriod)}곳`],
        ["무료 지급 원가", won(d.freeCostKrw)],
        ["순손익", won(d.netKrw)],
      ]),
    },
    profitPerPayer: {
      title: "전환 1인 이익",
      subtitle: "누적 충전 이익 ÷ 누적 유료 전환 학원",
      fields: detailFields([
        ["전환 1인 이익", d.profitPerPayerKrw != null ? won(d.profitPerPayerKrw) : "—"],
        ["유료 전환 학원(누적)", `${num(d.payingAcademies)}곳`],
        ["가입 1인당 무료 원가", won(d.freeCostPerSignupKrw)],
        [
          "무료 가입자 커버",
          d.profitPerPayerKrw != null &&
            d.freeCostPerSignupKrw > 0 &&
            `전환 1명이 무료 ${num(Math.floor(d.profitPerPayerKrw / d.freeCostPerSignupKrw))}명 원가를 커버`,
          true,
        ],
      ]),
    },
  };
}

// ─── 기능별 마진 표 ─────────────────────────────────────────────────────

export function featureRowDetail(f: FeatureMarginRow, fxRate: number): AdminDetail {
  return {
    title: f.label,
    subtitle: `${f.operationType} · 판매가 = ${f.credits}C × 팩별 크레딧 단가`,
    fields: detailFields([
      ["소모 크레딧", f.credits === 0 ? "무료" : `${num(f.credits)}C`],
      ["1회 원가", `${won(f.costKrw)} · $${f.costUsd.toFixed(4)}`],
      [
        "원가 근거",
        f.costSource === "actual"
          ? `실측 평균 (단가 확인된 호출 ${num(f.sampleCount)}건)`
          : `추정 (USD × 환율 ${num(fxRate)}원)`,
      ],
      ["플랜별 원가 차이", f.planSensitive && "PREMIUM 플랜은 Claude 모델 사용으로 원가 3~5배"],
      ["비고", f.note, true],
    ]),
    sections: [
      {
        title: "팩별 판매가 · 1회 이익",
        columns: [
          { key: "tier", label: "팩" },
          { key: "perCredit", label: "크레딧당", align: "right" },
          { key: "price", label: "판매가", align: "right" },
          { key: "profit", label: "1회 이익", align: "right" },
          { key: "margin", label: "마진율", align: "right" },
        ],
        rows: f.sell.map((cell) => ({
          tier: cell.label,
          perCredit: `${cell.perCredit}원`,
          price: f.credits === 0 ? "—" : won(cell.price),
          profit: won(cell.price - f.costKrw),
          margin: cell.marginPct === null ? "순비용" : `${cell.marginPct}%`,
        })),
      },
    ],
  };
}

export function tierRowDetail(
  tier: FeatureMarginAnalysis["tiers"][number],
  features: FeatureMarginRow[],
): AdminDetail {
  const rows = features
    .map((f) => ({ f, cell: f.sell.find((c) => c.label === tier.label) }))
    .filter((x): x is { f: FeatureMarginRow; cell: NonNullable<typeof x.cell> } => Boolean(x.cell))
    // 마진이 낮은(위험한) 기능부터
    .sort((a, b) => (a.cell.marginPct ?? -Infinity) - (b.cell.marginPct ?? -Infinity));
  return {
    title: `${tier.label} 팩`,
    subtitle: `${num(tier.credits)}C · ${won(tier.price)} · 크레딧당 ${tier.perCredit}원 — 이 팩 기준 기능별 마진(낮은 순)`,
    sections: [
      {
        title: "기능별 마진",
        columns: [
          { key: "feature", label: "기능" },
          { key: "credits", label: "크레딧", align: "right" },
          { key: "cost", label: "원가", align: "right" },
          { key: "price", label: "판매가", align: "right" },
          { key: "margin", label: "마진율", align: "right" },
        ],
        rows: rows.map(({ f, cell }) => ({
          feature: f.label,
          credits: f.credits === 0 ? "무료" : `${f.credits}C`,
          cost: won(f.costKrw),
          price: f.credits === 0 ? "—" : won(cell.price),
          margin: cell.marginPct === null ? "순비용" : `${cell.marginPct}%`,
        })),
      },
    ],
  };
}
