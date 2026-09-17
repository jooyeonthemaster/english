"use client";

import { AlertTriangle, CreditCard } from "lucide-react";
import {
  CARD_PAYMENT_LIMITS,
  CARD_PAYMENT_LIMITS_AS_OF,
  evaluateCardLimits,
  type CardIssuerLimit,
} from "@/lib/card-payment-limits";
import { cn } from "@/lib/utils";

/**
 * 카드사 한도 안내.
 *
 * 환금성 업종 분류로 일부 카드사는 큰 금액을 결제창 단계에서 막는데, PG 응답이
 * "사용자가 결제를 취소하셨습니다"로만 와서 원인을 알 수 없다. 결제 전에 미리,
 * 실패 후에는 다시 한 번 "어떤 카드로 되는지"를 알려 이탈을 막는다.
 *
 * 1회 한도에 걸리는 카드사가 없는 금액이어도 하루 여러 번 충전하면 1일 한도·건수
 * 제한에 막힐 수 있고, 표와 실제가 어긋난 사례(49,500원 실패)도 있으므로 금액과
 * 무관하게 카드사별 한도 표를 항상 펼쳐 보여준다. 모달이 세로로 길어지지 않도록
 * 표는 카드사를 열로 눕힌다.
 *
 * variant="inline"  결제 수단 선택 모달
 * variant="dialog"  결제 실패 안내 모달
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
  const isDialog = variant === "dialog";
  const hasBlocked = blocked.length > 0;
  const amountText = `${amount.toLocaleString("ko-KR")}원`;

  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2.5 text-left",
        !hasBlocked
          ? "border-slate-200 bg-slate-50"
          : isDialog
            ? "border-amber-200 bg-amber-50"
            : "border-amber-200/70 bg-amber-50/60",
        className,
      )}
    >
      <div className="flex items-start gap-2">
        {hasBlocked ? (
          <AlertTriangle
            className="mt-0.5 size-4 shrink-0 text-amber-600"
            strokeWidth={2}
          />
        ) : (
          <CreditCard
            className="mt-0.5 size-4 shrink-0 text-slate-500"
            strokeWidth={2}
          />
        )}
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-[12.5px] font-semibold",
              hasBlocked ? "text-amber-900" : "text-slate-700",
            )}
          >
            {hasBlocked
              ? isDialog
                ? "카드사 한도 때문일 수 있습니다"
                : "일부 카드사는 이 금액을 결제할 수 없습니다"
              : isDialog
                ? "카드사 한도에 걸렸을 수 있습니다"
                : "카드사마다 충전 결제 한도가 있습니다"}
          </p>

          <p
            className={cn(
              "mt-1 text-[12px] leading-5",
              hasBlocked ? "text-amber-800" : "text-slate-600",
            )}
          >
            {hasBlocked ? (
              <>
                {amountText}은{" "}
                <span className="font-semibold">
                  {joinIssuerNames(blocked.map((b) => b.name))}
                </span>
                의 한도를 넘어, 카드 잔액과 무관하게 결제창에서 막힙니다.
              </>
            ) : (
              <>
                {amountText}은 모든 카드사의 1회 한도 안입니다. 같은 카드로
                하루에 여러 번 충전하면 1일 한도나 건수 제한에 걸려 결제창에서
                막힐 수 있습니다.
              </>
            )}
          </p>

          {hasBlocked && allowed.length > 0 && (
            <p className="mt-1 flex items-center gap-1.5 text-[12px] leading-5 text-emerald-800">
              <CreditCard
                className="size-3.5 shrink-0 text-emerald-600"
                strokeWidth={2}
              />
              <span>
                <span className="font-semibold">
                  {joinIssuerNames(allowed)}
                </span>
                로는 결제하실 수 있습니다.
              </span>
            </p>
          )}
        </div>
      </div>

      <CardLimitTable amount={amount} />

      <p
        className={cn(
          "mt-1.5 text-[11px] leading-4",
          hasBlocked ? "text-amber-700" : "text-slate-500",
        )}
      >
        무통장입금은 카드사 한도와 무관하게 전액 충전됩니다.
      </p>
    </div>
  );
}

/** ["비씨카드", "현대카드"] → "비씨·현대카드" */
function joinIssuerNames(names: string[]): string {
  return `${names.map(shortIssuerName).join("·")}카드`;
}

function shortIssuerName(name: string): string {
  return name.replace(/카드$/, "");
}

/** 5만원 → "5만", 110만원 → "110만", null → "—" */
function formatLimit(value: number | null): string {
  if (value === null) return "—";
  if (value % 10_000 === 0) return `${(value / 10_000).toLocaleString("ko-KR")}만`;
  return value.toLocaleString("ko-KR");
}

const SORTED_LIMITS = [...CARD_PAYMENT_LIMITS].sort((a, b) =>
  a.name.localeCompare(b.name, "ko"),
);

const LIMIT_ROWS: Array<{
  label: string;
  value: (issuer: CardIssuerLimit) => string;
}> = [
  { label: "1회", value: (i) => formatLimit(i.oncePerPayment) },
  { label: "1일", value: (i) => formatLimit(i.perDay) },
  { label: "1개월", value: (i) => formatLimit(i.perMonth) },
  {
    label: "하루 건수",
    value: (i) => (i.countPerDay === null ? "—" : `${i.countPerDay}건`),
  },
];

/**
 * 카드사별 한도 표. 카드사를 열로 눕혀 세로 길이를 줄인다.
 * 이 금액이 막히는 카드사 열은 강조한다. 좁은 화면에서는 가로 스크롤.
 */
function CardLimitTable({ amount }: { amount: number }) {
  const blockedNames = new Set(
    evaluateCardLimits(amount).blocked.map((b) => b.name),
  );

  return (
    <div className="mt-2 overflow-hidden rounded-md border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[440px] text-[11px] leading-4">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th
                scope="col"
                className="whitespace-nowrap px-2 py-1 text-left font-semibold"
              >
                한도
              </th>
              {SORTED_LIMITS.map((issuer) => (
                <th
                  key={issuer.name}
                  scope="col"
                  className={cn(
                    "whitespace-nowrap px-1 py-1 text-center font-semibold",
                    blockedNames.has(issuer.name) &&
                      "bg-amber-100 text-amber-800",
                  )}
                >
                  {shortIssuerName(issuer.name)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-slate-700">
            {LIMIT_ROWS.map((row) => (
              <tr key={row.label} className="border-t border-slate-100">
                <th
                  scope="row"
                  className="whitespace-nowrap px-2 py-1 text-left font-semibold text-slate-500"
                >
                  {row.label}
                </th>
                {SORTED_LIMITS.map((issuer) => (
                  <td
                    key={issuer.name}
                    className={cn(
                      "whitespace-nowrap px-1 py-1 text-center tabular-nums",
                      blockedNames.has(issuer.name) &&
                        "bg-amber-50 text-amber-800",
                    )}
                  >
                    {row.value(issuer)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-slate-100 px-2 py-1 text-[10.5px] text-slate-400">
        단위: 원
        {blockedNames.size > 0 && " · 노란 열은 이 금액 결제 불가"} ·{" "}
        {CARD_PAYMENT_LIMITS_AS_OF} 기준 · 카드사 정책에 따라 변경
      </p>
    </div>
  );
}
