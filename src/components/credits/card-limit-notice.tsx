"use client";

import { AlertTriangle, CreditCard } from "lucide-react";
import { evaluateCardLimits } from "@/lib/card-payment-limits";
import { cn } from "@/lib/utils";

/**
 * 카드사 한도 안내.
 *
 * 환금성 업종 분류로 일부 카드사는 큰 금액을 결제창 단계에서 막는데, PG 응답이
 * "사용자가 결제를 취소하셨습니다"로만 와서 원인을 알 수 없다. 결제 전에 미리,
 * 실패 후에는 다시 한 번 "어떤 카드로 되는지"를 알려 이탈을 막는다.
 *
 * variant="inline"  결제 전 상품 선택 화면 (경고 톤 약하게)
 * variant="dialog"  결제 실패 안내 모달 (해결책 제시 톤)
 */
export function CardLimitNotice({
  amount,
  variant = "inline",
  className,
}: {
  amount: number;
  variant?: "inline" | "dialog";
  className?: string;
}) {
  const { allowed, blocked } = evaluateCardLimits(amount);
  if (blocked.length === 0) return null;

  const isDialog = variant === "dialog";

  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2.5 text-left",
        isDialog
          ? "border-amber-200 bg-amber-50"
          : "border-amber-200/70 bg-amber-50/60",
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle
          className="mt-0.5 size-4 shrink-0 text-amber-600"
          strokeWidth={2}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-semibold text-amber-900">
            {isDialog
              ? "카드사 한도 때문일 수 있습니다"
              : "일부 카드사는 이 금액을 결제할 수 없습니다"}
          </p>

          <p className="mt-1 text-[12px] leading-5 text-amber-800">
            {amount.toLocaleString("ko-KR")}원은 아래 카드사의 1회 결제 한도를
            넘습니다. 카드 잔액과 무관하게 결제창에서 막힙니다.
          </p>

          <ul className="mt-1.5 space-y-0.5">
            {blocked.map((b) => (
              <li
                key={b.name}
                className="text-[11.5px] leading-5 text-amber-800"
              >
                <span className="font-semibold">{b.name}</span>
                <span className="text-amber-700"> — {b.reason}</span>
              </li>
            ))}
          </ul>

          {allowed.length > 0 && (
            <div className="mt-2 flex items-start gap-1.5 rounded-md bg-white/70 px-2 py-1.5">
              <CreditCard
                className="mt-0.5 size-3.5 shrink-0 text-emerald-600"
                strokeWidth={2}
              />
              <p className="text-[11.5px] leading-5 text-emerald-800">
                <span className="font-semibold">
                  {allowed.join(" · ")}
                </span>
                {" 로는 결제하실 수 있습니다."}
              </p>
            </div>
          )}

          <p className="mt-1.5 text-[11px] leading-4 text-amber-700">
            무통장입금은 카드사 한도와 무관하게 전액 충전됩니다.
          </p>
        </div>
      </div>
    </div>
  );
}
