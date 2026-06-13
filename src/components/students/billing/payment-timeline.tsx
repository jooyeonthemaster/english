"use client";

import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { PAYMENT_METHODS } from "@/lib/constants";
import { deriveInvoiceState, invoicePaid, invoiceOutstanding } from "@/lib/billing-status";
import { BillingStatusDot } from "@/app/(director)/director/tutor/_components/billing-status-dot";
import type { StudentInvoice } from "./types";

function methodLabel(method: string): string {
  return PAYMENT_METHODS.find((m) => m.value === method)?.label ?? method;
}

export function PaymentTimeline({ invoices }: { invoices: StudentInvoice[] }) {
  if (invoices.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[#E5E8EB] bg-[#F7F8FA] px-4 py-10 text-center">
        <p className="text-sm font-bold text-[#6B7684]">아직 발행한 청구서가 없어요</p>
        <p className="mt-1 text-xs font-medium text-[#8B95A1]">첫 청구서를 발행해 보세요.</p>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {invoices.map((inv, i) => {
        const state = deriveInvoiceState(inv);
        const paid = invoicePaid(inv);
        const remaining = invoiceOutstanding(inv);
        const last = i === invoices.length - 1;
        return (
          <div
            key={inv.id}
            className={cn(
              "relative flex gap-3 pl-1",
              !last && "before:absolute before:left-[3px] before:top-5 before:h-full before:w-px before:bg-[#F2F4F6]",
            )}
          >
            <span
              className={cn(
                "mt-1.5 size-2 shrink-0 rounded-full",
                {
                  PAID: "bg-[#15B86F]",
                  PARTIAL: "bg-[#3182F6]",
                  OVERDUE: "bg-[#F04452]",
                  PENDING: "bg-[#8B95A1]",
                  NONE: "bg-[#D1D6DB]",
                }[state.state],
              )}
            />
            <div className="min-w-0 flex-1 pb-5">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-bold text-[#191F28]">{inv.title}</p>
                <span className="shrink-0 text-sm font-black tabular-nums text-[#191F28]">
                  {formatCurrency(inv.finalAmount)}
                </span>
              </div>
              <div className="mt-0.5 flex items-center justify-between gap-2">
                <BillingStatusDot state={state.state} label={state.label} />
                {remaining > 0 && state.state !== "NONE" && (
                  <span className="text-xs font-bold text-[#F04452]">
                    미납 {formatCurrency(remaining)}
                  </span>
                )}
              </div>
              <p className="mt-1 text-[11px] font-medium text-[#8B95A1]">
                납부기한 {formatDate(inv.dueDate)}
                {state.daysOverdue > 0 && ` · ${state.daysOverdue}일 지남`}
              </p>

              {inv.payments.length > 0 && (
                <div className="mt-2 space-y-1 rounded-lg bg-[#F7F8FA] px-2.5 py-2">
                  {inv.payments.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between text-[11px] font-medium text-[#6B7684]"
                    >
                      <span>
                        {methodLabel(p.method)} · {formatDate(p.paidAt)}
                      </span>
                      <span className="tabular-nums text-[#4E5968]">
                        {formatCurrency(p.amount)}
                      </span>
                    </div>
                  ))}
                  {paid > 0 && state.state === "PARTIAL" && (
                    <p className="text-right text-[10px] font-bold text-[#3182F6]">
                      누적 {formatCurrency(paid)} 납부
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
