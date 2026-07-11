"use client";

import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { PAYMENT_METHODS } from "@/lib/constants";
import { deriveInvoiceState, invoicePaid, invoiceOutstanding } from "@/lib/billing-status";
import { StatusPill, type PillTone } from "@/components/layout/page-frame";
import type { StudentInvoice } from "./types";

/** 수납 상태 → soft 3톤 (완납 emerald · 부분납 blue · 연체 rose · 그 외 slate) */
const BILLING_TONE: Record<string, PillTone> = {
  PAID: "emerald",
  PARTIAL: "blue",
  OVERDUE: "rose",
  PENDING: "slate",
  NONE: "slate",
};

/** 타임라인 점 색 — 배지 톤과 동일 계열 */
const DOT_COLOR: Record<string, string> = {
  PAID: "bg-emerald-500",
  PARTIAL: "bg-blue-500",
  OVERDUE: "bg-rose-500",
  PENDING: "bg-slate-400",
  NONE: "bg-slate-300",
};

function methodLabel(method: string): string {
  return PAYMENT_METHODS.find((m) => m.value === method)?.label ?? method;
}

export function PaymentTimeline({ invoices }: { invoices: StudentInvoice[] }) {
  if (invoices.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 px-4 py-10 text-center">
        <p className="text-[13px] font-semibold text-slate-400">
          아직 발행한 청구서가 없습니다
        </p>
        <p className="mt-1 text-[12px] font-medium text-slate-400">
          첫 청구서를 발행해 주세요.
        </p>
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
              !last && "before:absolute before:left-[3px] before:top-5 before:h-full before:w-px before:bg-slate-100",
            )}
          >
            <span
              className={cn(
                "mt-1.5 size-2 shrink-0 rounded-full",
                DOT_COLOR[state.state] ?? "bg-slate-300",
              )}
            />
            <div className="min-w-0 flex-1 pb-5">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-[13px] font-bold text-slate-900">{inv.title}</p>
                <span className="shrink-0 text-[13px] font-bold tabular-nums text-slate-900">
                  {formatCurrency(inv.finalAmount)}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <StatusPill tone={BILLING_TONE[state.state] ?? "slate"}>
                  {state.label}
                </StatusPill>
                {remaining > 0 && state.state !== "NONE" && (
                  <span className="text-[11.5px] font-bold text-rose-600">
                    미납 {formatCurrency(remaining)}
                  </span>
                )}
              </div>
              <p className="mt-1 text-[11px] font-medium text-slate-400">
                납부기한 {formatDate(inv.dueDate)}
                {state.daysOverdue > 0 && ` · ${state.daysOverdue}일 지남`}
              </p>

              {inv.payments.length > 0 && (
                <div className="mt-2 space-y-1 rounded-lg bg-slate-50 px-2.5 py-2">
                  {inv.payments.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between text-[11px] font-medium text-slate-400"
                    >
                      <span>
                        {methodLabel(p.method)} · {formatDate(p.paidAt)}
                      </span>
                      <span className="tabular-nums text-slate-600">
                        {formatCurrency(p.amount)}
                      </span>
                    </div>
                  ))}
                  {paid > 0 && state.state === "PARTIAL" && (
                    <p className="text-right text-[10px] font-bold text-blue-600">
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
