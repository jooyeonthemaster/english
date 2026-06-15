"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Wallet } from "lucide-react";
import { toast } from "sonner";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { getStudentInvoices, cancelInvoice } from "@/actions/billing";
import { deriveInvoiceState, invoiceOutstanding } from "@/lib/billing-status";
import { BillingStatusDot } from "@/app/(director)/director/tutor/_components/billing-status-dot";
import { PaymentTimeline } from "./payment-timeline";
import { IssueInvoiceDialog } from "./issue-invoice-dialog";
import { RecordPaymentDialog } from "./record-payment-dialog";
import type { StudentInvoice } from "./types";

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
    if (!confirm("이 청구서를 취소할까요?")) return;
    startTransition(async () => {
      const result = await cancelInvoice(current.id);
      if (result.success) {
        toast.success("청구서를 취소했어요.");
        await load();
        router.refresh();
      } else {
        toast.error(result.error || "취소에 실패했어요.");
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-[#E5E8EB] bg-white p-5">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2 text-sm font-bold text-[#191F28]">
            <Wallet className="size-4 text-[#3182F6]" />
            이번 달 원비
          </p>
          {isDirector && (
            <Button
              onClick={() => setIssueOpen(true)}
              className="h-9 rounded-lg bg-blue-600 text-sm font-bold text-white hover:bg-blue-700"
            >
              <Plus className="size-4" />
              청구서 발행
            </Button>
          )}
        </div>

        {invoices === null ? (
          <div className="flex items-center justify-center py-10 text-[#8B95A1]">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : current && currentState ? (
          <div className="mt-4 rounded-xl bg-[#F7F8FA] p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[22px] font-black tracking-tight text-[#191F28]">
                  {formatCurrency(current.finalAmount)}
                </p>
                {outstanding > 0 && (
                  <p className="mt-0.5 text-sm font-bold text-[#F04452]">
                    미납 {formatCurrency(outstanding)}
                  </p>
                )}
                <p className="mt-1 text-[13px] font-medium text-[#8B95A1]">
                  {current.title} · 납부기한 {formatDate(current.dueDate)}
                  {currentState.daysOverdue > 0 && ` (${currentState.daysOverdue}일 지남)`}
                </p>
              </div>
              <BillingStatusDot state={currentState.state} label={currentState.label} />
            </div>

            {isDirector && (outstanding > 0 || canCancel) && (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-[#E5E8EB] pt-4">
                {outstanding > 0 && (
                  <Button
                    onClick={() => setPayTarget(current)}
                    className="h-9 rounded-lg bg-[#E8F3FF] text-sm font-bold text-[#3182F6] shadow-none hover:bg-[#D8EBFF]"
                  >
                    완납 / 부분 납부
                  </Button>
                )}
                {canCancel && (
                  <Button
                    onClick={handleCancel}
                    variant="outline"
                    disabled={isPending}
                    className={cn(
                      "h-9 rounded-lg border-[#E5E8EB] text-sm font-bold text-[#6B7684] hover:bg-[#F7F8FA]",
                    )}
                  >
                    청구 취소
                  </Button>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="mt-4 rounded-xl bg-[#F7F8FA] px-4 py-8 text-center">
            <p className="text-sm font-bold text-[#6B7684]">이번 달 청구서가 없어요</p>
            <p className="mt-1 text-xs font-medium text-[#8B95A1]">
              {isDirector ? "청구서 발행으로 시작하세요." : "원장이 청구서를 발행하면 표시돼요."}
            </p>
          </div>
        )}

        <p className="mt-3 text-[12px] font-medium text-[#AEB5BC]">
          실제 결제는 연동되지 않으며 수동으로 기록·관리합니다.
        </p>
      </div>

      <div className="rounded-xl border border-[#E5E8EB] bg-white p-5">
        <p className="mb-4 text-sm font-bold text-[#191F28]">납부 이력</p>
        {invoices === null ? (
          <div className="flex items-center justify-center py-6 text-[#8B95A1]">
            <Loader2 className="size-5 animate-spin" />
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
