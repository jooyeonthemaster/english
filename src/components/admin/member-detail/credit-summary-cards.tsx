// 회원 상세 개요 탭 상단 KPI 2장 — 「누적 지급(무료+유료)」과 「누적 사용」.
// 두 숫자는 서로 다른 출처(CreditBalance 집계 vs 거래 원장)라 어긋날 수 있어,
// 각 카드가 자기 근거를 한 줄로 밝히고 어긋나면 화면에서 경고한다.

import { TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { CreditKpi } from "@/components/admin/member-detail/atoms";
import type { MemberDetail } from "@/actions/admin-members";

interface CreditSummaryCardsProps {
  /** CreditBalance.totalAllocated — 무료·유료가 한 숫자로 섞여 있다. */
  totalAllocated: number;
  /** CreditBalance.totalConsumed — 실패 환급 때 차감된 「순」 사용량. */
  totalConsumed: number;
  /** 거래 원장 기준 유입 분해(C). */
  inflow: MemberDetail["creditInflow"];
  /** 결제 이력(credit_top_ups) 기준 결제 완료분 — inflow.paid 와 대조용. */
  paidTopUps: MemberDetail["paidTopUps"];
  /** 최근 30일 순사용 합계(사용 − 실패 환급). 누적 사용보다 클 수 없다. */
  last30dTotal: number;
}

export function CreditSummaryCards({
  totalAllocated,
  totalConsumed,
  inflow,
  paidTopUps,
  last30dTotal,
}: CreditSummaryCardsProps) {
  // 무통장 결제가 원장에 수동 지급(ADJUSTMENT)으로 들어오면 「유료 충전」이 실제 결제분보다
  // 작아진다(26-09-18 실측: PH 입시영어학원 181,500원 결제 · 유료 충전 450C).
  const paidGap = paidTopUps.credits - inflow.paid;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <CreditKpi
        label="누적 지급 (무료+유료)"
        value={totalAllocated}
        icon={<TrendingUp />}
        accent="emerald"
        suffix={
          <span className="block space-y-0.5">
            <span
              className="block text-[11px] text-gray-400 tabular-nums"
              title="거래 원장 기준 · 유료 충전=결제 충전(결제 환불 회수 차감) · 무료 지급=가입·미션·쿠폰·추천 · 수동 지급은 관리자가 직접 넣은 크레딧이며 무통장 결제분이 여기 잡힐 수 있습니다(누적 지급에는 포함되지 않습니다)"
            >
              유료 충전 {inflow.paid.toLocaleString("ko-KR")} · 무료 지급{" "}
              {inflow.free.toLocaleString("ko-KR")}
              {inflow.admin !== 0 &&
                ` · 수동 지급(무통장·보상) ${inflow.admin > 0 ? "+" : "−"}${Math.abs(
                  inflow.admin,
                ).toLocaleString("ko-KR")}(별도)`}
            </span>
            {paidTopUps.count > 0 && (
              <span
                className={cn(
                  "block text-[11px] tabular-nums",
                  paidGap > 0 ? "text-amber-600 font-medium" : "text-gray-400",
                )}
                title={
                  paidGap > 0
                    ? "결제 이력에는 완료 건이 있는데 원장의 유료 충전이 그보다 적습니다 — 무통장 결제가 수동 지급(ADJUSTMENT)으로 들어왔을 수 있습니다. 거래 이력에서 확인하세요."
                    : "결제 이력(credit_top_ups)의 결제 완료 건"
                }
              >
                결제 완료 {paidTopUps.count.toLocaleString("ko-KR")}건 ·{" "}
                {paidTopUps.amount.toLocaleString("ko-KR")}원 ·{" "}
                {paidTopUps.credits.toLocaleString("ko-KR")} C
                {paidGap > 0 && ` · 유료 충전에 ${paidGap.toLocaleString("ko-KR")} C 미반영`}
              </span>
            )}
          </span>
        }
      />
      <CreditKpi
        label="누적 사용"
        value={totalConsumed}
        icon={<TrendingDown />}
        accent="rose"
        suffix={
          <span
            className="text-[11px] text-gray-400 tabular-nums"
            title="최근 30일도 누적 사용과 같은 기준(사용 − 생성 실패 환급)이라 누적 사용보다 클 수 없습니다"
          >
            최근 30일 {last30dTotal.toLocaleString("ko-KR")}
          </span>
        }
      />
    </div>
  );
}
