"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { deriveBillingState, invoiceOutstanding } from "@/lib/billing-status";
import { recordPayment } from "@/actions/billing";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { BillingStatusDot } from "./billing-status-dot";
import type { HubInvoice } from "./types";

const QUICK_METHODS = [
  { value: "CASH", label: "현금" },
  { value: "TRANSFER", label: "이체" },
  { value: "CARD", label: "카드" },
];

export function InlineBillingPopover({
  studentId,
  studentName,
  invoices,
}: {
  studentId: string;
  studentName: string;
  invoices: HubInvoice[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const inFlight = useRef(false);

  const billing = deriveBillingState(invoices);
  const current = invoices[0];
  const outstanding = current ? invoiceOutstanding(current) : 0;
  const canRecord = !!current && outstanding > 0;

  function markPaid(method: string) {
    if (!current) {
      toast.error("청구서를 불러올 수 없어요. 새로고침해 주세요.");
      setOpen(false);
      return;
    }
    if (inFlight.current) return;
    inFlight.current = true;
    startTransition(async () => {
      try {
        const result = await recordPayment(current.id, { amount: outstanding, method });
        if (result.success) {
          toast.success(`${studentName} 학생 원비를 완납 처리했어요.`);
          setOpen(false);
          router.refresh();
        } else {
          toast.error(result.error || "완납 처리에 실패했어요.");
        }
      } finally {
        inFlight.current = false;
      }
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 transition hover:bg-[#F2F4F6]"
        >
          <BillingStatusDot state={billing.state} label={billing.label} />
          {billing.outstanding > 0 && (
            <span className="text-[11px] font-bold tabular-nums text-[#F04452]">
              {formatCurrency(billing.outstanding)}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-64 rounded-xl border-[#E5E8EB] p-0 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-[#F2F4F6] px-3 py-2.5">
          <p className="text-sm font-bold text-[#191F28]">원비 · 이번 달</p>
          <p className="mt-0.5 text-[11px] font-medium text-[#8B95A1]">{studentName}</p>
        </div>

        <div className="px-3 py-3">
          {current ? (
            <>
              <div className="flex items-center justify-between">
                <BillingStatusDot state={billing.state} label={billing.label} />
                <span className="text-sm font-black text-[#191F28]">
                  {formatCurrency(current.finalAmount)}
                </span>
              </div>
              {outstanding > 0 && (
                <p className="mt-1 text-right text-xs font-bold text-[#F04452]">
                  미납 {formatCurrency(outstanding)}
                </p>
              )}
              <p className="mt-1 truncate text-[11px] font-medium text-[#8B95A1]">{current.title}</p>

              {canRecord && (
                <div className="mt-3">
                  <p className="mb-1.5 text-[11px] font-bold text-[#6B7684]">완납 처리 (결제수단)</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {QUICK_METHODS.map((m) => (
                      <button
                        key={m.value}
                        type="button"
                        disabled={isPending}
                        onClick={() => markPaid(m.value)}
                        className="flex h-8 items-center justify-center rounded-lg border border-[#E5E8EB] text-xs font-bold text-[#4E5968] transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50"
                      >
                        {isPending ? <Loader2 className="size-3.5 animate-spin" /> : m.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="py-2 text-center text-xs font-medium text-[#8B95A1]">
              이번 달 청구서가 없어요.
            </p>
          )}
        </div>

        <Link
          href={`/director/students/${studentId}?tab=billing`}
          className="flex items-center justify-between border-t border-[#F2F4F6] px-3 py-2.5 text-xs font-bold text-[#3182F6] transition hover:bg-[#F7F8FA]"
        >
          원비 상세 관리
          <ChevronRight className="size-4" />
        </Link>
        <p className="px-3 pb-2.5 text-[10px] font-medium leading-4 text-[#AEB5BC]">
          실제 결제는 연동되지 않으며 수동으로 기록·관리합니다.
        </p>
      </PopoverContent>
    </Popover>
  );
}
