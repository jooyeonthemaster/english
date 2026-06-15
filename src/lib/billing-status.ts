// ---------------------------------------------------------------------------
// 원비(수강료) status derivation + Toss-palette colors.
//
// constants.ts INVOICE_STATUSES use amber tones (PENDING) which the global UI
// rule forbids. Rather than mutate that shared constant (it drives existing
// billing tables), the tutor hub + student billing section derive their own
// state here and color it with the Toss palette only.
// ---------------------------------------------------------------------------

export type BillingState = "PAID" | "PARTIAL" | "OVERDUE" | "PENDING" | "NONE";

export interface InvoiceLike {
  finalAmount: number;
  status: string;
  dueDate: Date | string;
  payments: { amount: number }[];
}

export interface DerivedBillingState {
  state: BillingState;
  label: string;
  /** Total unpaid amount across the considered invoices (KRW). */
  outstanding: number;
  /** Max days past due among unpaid invoices (0 if none overdue). */
  daysOverdue: number;
}

/** Sum of recorded payments for one invoice. */
export function invoicePaid(inv: InvoiceLike): number {
  return inv.payments.reduce((sum, p) => sum + p.amount, 0);
}

/** Remaining balance for one invoice (never negative). */
export function invoiceOutstanding(inv: InvoiceLike): number {
  if (inv.status === "CANCELLED" || inv.status === "REFUNDED") return 0;
  return Math.max(0, inv.finalAmount - invoicePaid(inv));
}

/** Derive the display state of a SINGLE invoice (timeline / detail card). */
export function deriveInvoiceState(inv: InvoiceLike): DerivedBillingState {
  if (inv.status === "CANCELLED") {
    return { state: "NONE", label: "취소", outstanding: 0, daysOverdue: 0 };
  }
  if (inv.status === "REFUNDED") {
    return { state: "NONE", label: "환불", outstanding: 0, daysOverdue: 0 };
  }
  const paid = invoicePaid(inv);
  const remaining = Math.max(0, inv.finalAmount - paid);
  if (remaining <= 0) {
    return { state: "PAID", label: "완납", outstanding: 0, daysOverdue: 0 };
  }
  const due = new Date(inv.dueDate).getTime();
  const daysOverdue =
    due < Date.now() ? Math.floor((Date.now() - due) / 86_400_000) : 0;
  if (daysOverdue > 0) {
    return { state: "OVERDUE", label: "연체", outstanding: remaining, daysOverdue };
  }
  if (paid > 0) {
    return { state: "PARTIAL", label: "부분납", outstanding: remaining, daysOverdue: 0 };
  }
  return { state: "PENDING", label: "미납", outstanding: remaining, daysOverdue: 0 };
}

/** Aggregate the billing state across a set of invoices (hub row / KPI). */
export function deriveBillingState(
  invoices: InvoiceLike[] | null | undefined
): DerivedBillingState {
  const active = (invoices ?? []).filter(
    (inv) => inv.status !== "CANCELLED" && inv.status !== "REFUNDED"
  );
  if (active.length === 0) {
    return { state: "NONE", label: "미발행", outstanding: 0, daysOverdue: 0 };
  }

  let outstanding = 0;
  let anyPaymentMade = false;
  let maxDaysOverdue = 0;
  let allPaid = true;

  for (const inv of active) {
    const paid = invoicePaid(inv);
    const remaining = Math.max(0, inv.finalAmount - paid);
    if (paid > 0) anyPaymentMade = true;
    if (remaining > 0) {
      allPaid = false;
      outstanding += remaining;
      const due = new Date(inv.dueDate).getTime();
      if (due < Date.now()) {
        const days = Math.floor((Date.now() - due) / 86_400_000);
        if (days > maxDaysOverdue) maxDaysOverdue = days;
      }
    }
  }

  if (allPaid) return { state: "PAID", label: "완납", outstanding: 0, daysOverdue: 0 };
  if (maxDaysOverdue > 0)
    return { state: "OVERDUE", label: "연체", outstanding, daysOverdue: maxDaysOverdue };
  if (anyPaymentMade)
    return { state: "PARTIAL", label: "부분납", outstanding, daysOverdue: 0 };
  return { state: "PENDING", label: "미납", outstanding, daysOverdue: 0 };
}

/** Toss-palette colors per billing state (dot bg + text). */
export const BILLING_STATE_COLOR: Record<BillingState, { dot: string; text: string }> = {
  PAID: { dot: "bg-[#15B86F]", text: "text-[#15B86F]" },
  PARTIAL: { dot: "bg-[#3182F6]", text: "text-[#3182F6]" },
  OVERDUE: { dot: "bg-[#F04452]", text: "text-[#F04452]" },
  PENDING: { dot: "bg-[#8B95A1]", text: "text-[#6B7684]" },
  NONE: { dot: "bg-[#D1D6DB]", text: "text-[#8B95A1]" },
};
