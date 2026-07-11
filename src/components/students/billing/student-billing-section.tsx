"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Wallet } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { StatusPill, type PillTone } from "@/components/layout/page-frame";
import { getStudentInvoices, cancelInvoice } from "@/actions/billing";
import { deriveInvoiceState, invoiceOutstanding } from "@/lib/billing-status";
import { PaymentTimeline } from "./payment-timeline";
import { IssueInvoiceDialog } from "./issue-invoice-dialog";
import { RecordPaymentDialog } from "./record-payment-dialog";
import type { StudentInvoice } from "./types";

/** 수납 상태 → soft 3톤 (완납 emerald · 부분납 blue · 연체 rose · 그 외 slate) */
const BILLING_TONE: Record<string, PillTone> = {
  PAID: "emerald",
  PARTIAL: "blue",
  OVERDUE: "rose",
  PENDING: "slate",
  NONE: "slate",
};

function monthKey(d: Date | string) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`;
}

export function StudentBillingSection({
  studentId,
  isDirector,
}: {
  studentId: string;
  isDirector: boolean;
}) {
  const router = useRouter();
  const [invoices, setInvoices] = useState<StudentInvoice[] | null>(null);
  const [issueOpen, setIssueOpen] = useState(false);
  const [payTarget, setPayTarget] = useState<StudentInvoice | null>(null);
  const [isPending, startTransition] = useTransition();

  async function load() {
    try {
      setInvoices(await getStudentInvoices(studentId));
    } catch {
      setInvoices([]);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  const thisMonth = monthKey(new Date());
  const current =
    invoices?.find((inv) => monthKey(inv.dueDate) === thisMonth) ?? null;
  const currentState = current ? deriveInvoiceState(current) : null;
  const outstanding = current ? invoiceOutstanding(current) : 0;
  const canCancel =
    !!current && ["PENDING", "OVERDUE", "PARTIAL"].includes(current.status);

  function handleCancel() {
    if (!current) return;
    if (!confirm("이 청구서를 취소하시겠습니까?")) return;
    startTransition(async () => {
      const result = await cancelInvoice(current.id);
      if (result.success) {
        toast.success("청구서를 취소했습니다.");
        await load();
        router.refresh();
      } else {
        toast.error(result.error || "취소에 실패했습니다.");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-[13px] font-bold text-slate-900">
            <Wallet className="size-4 text-blue-600" aria-hidden />
            이번 달 원비
          </p>
          {isDirector && (
            <Button
              onClick={() => setIssueOpen(true)}
              className="h-8 rounded-md bg-blue-600 px-3 text-[12.5px] font-semibold text-white hover:bg-blue-700"
            >
              <Plus className="size-3.5" aria-hidden />
              청구서 발행
            </Button>
          )}
        </div>

        {invoices === null ? (
          <div className="flex items-center justify-center py-10 text-slate-400">
            <Loader2 className="size-5 animate-spin" aria-hidden />
          </div>
        ) : current && currentState ? (
          <div className="mt-4 rounded-lg bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xl font-bold tracking-tight tabular-nums text-slate-900">
                  {formatCurrency(current.finalAmount)}
                </p>
                {outstanding > 0 && (
                  <p className="mt-0.5 text-[13px] font-bold text-rose-600">
                    미납 {formatCurrency(outstanding)}
                  </p>
                )}
                <p className="mt-1 text-[12.5px] font-medium text-slate-400">
                  {current.title} · 납부기한 {formatDate(current.dueDate)}
                  {currentState.daysOverdue > 0 && ` (${currentState.daysOverdue}일 지남)`}
                </p>
              </div>
              <StatusPill tone={BILLING_TONE[currentState.state] ?? "slate"}>
                {currentState.label}
              </StatusPill>
            </div>

            {isDirector && (outstanding > 0 || canCancel) && (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-200 pt-4">
                {outstanding > 0 && (
                  <Button
                    onClick={() => setPayTarget(current)}
                    className="h-8 rounded-md bg-blue-50 px-3 text-[12.5px] font-semibold text-blue-700 shadow-none hover:bg-blue-100"
                  >
                    완납 / 부분 납부
                  </Button>
                )}
                {canCancel && (
                  <Button
                    onClick={handleCancel}
                    variant="outline"
                    disabled={isPending}
                    className="h-8 rounded-md border-slate-200 bg-white px-3 text-[12.5px] font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    청구 취소
                  </Button>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50/50 px-4 py-8 text-center">
            <p className="text-[13px] font-semibold text-slate-400">
              이번 달 청구서가 없습니다
            </p>
            <p className="mt-1 text-[12px] font-medium text-slate-400">
              {isDirector
                ? "청구서 발행으로 시작해 주세요."
                : "원장이 청구서를 발행하면 표시됩니다."}
            </p>
          </div>
        )}

        <p className="mt-3 text-[11.5px] font-medium text-slate-400">
          실제 결제는 연동되지 않으며 수동으로 기록·관리합니다.
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <p className="mb-4 text-[13px] font-bold text-slate-900">납부 이력</p>
        {invoices === null ? (
          <div className="flex items-center justify-center py-6 text-slate-400">
            <Loader2 className="size-5 animate-spin" aria-hidden />
          </div>
        ) : (
          <PaymentTimeline invoices={invoices} />
        )}
      </div>

      <IssueInvoiceDialog
        open={issueOpen}
        onOpenChange={setIssueOpen}
        studentId={studentId}
        invoices={invoices ?? []}
        onDone={() => {
          void load();
          router.refresh();
        }}
      />
      <RecordPaymentDialog
        open={!!payTarget}
        onOpenChange={(o) => !o && setPayTarget(null)}
        invoice={payTarget}
        onDone={() => {
          setPayTarget(null);
          void load();
          router.refresh();
        }}
      />
    </div>
  );
}
