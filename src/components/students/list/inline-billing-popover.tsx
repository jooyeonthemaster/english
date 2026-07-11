"use client";

// ============================================================================
// 로스터 수납 셀 팝오버 — 구 튜터 허브 InlineBillingPopover 복제·슬레이트 리스킨
//
// 원본: src/app/(director)/director/tutor/_components/inline-billing-popover.tsx
// (토스 hex → 디자인 바이블 §2 slate/blue). 원본은 구 로스터가 계속 쓰므로
// 수정하지 않는다. 트리거는 로스터 셀 표시(StatusPill + 미수액)를 유지하되
// OVERDUE pill 옆에 연체 D+N을 상시 표기하고, 클릭 시 당월 청구 제목·납기·
// 납부/총액·연체 일수를 팝오버로 확인 + "수납 탭 열기" 딥링크.
// ============================================================================

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import {
  deriveBillingState,
  invoiceOutstanding,
  invoicePaid,
  type BillingState,
} from "@/lib/billing-status";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { StatusPill, type PillTone } from "@/components/layout/page-frame";
import type { HubInvoice } from "@/app/(director)/director/tutor/_components/types";

/** 수납 상태 → pill 톤 (NONE=미발행은 pill 없이 옅은 텍스트) */
const BILLING_TONE: Record<BillingState, PillTone | null> = {
  PAID: "emerald",
  PARTIAL: "blue",
  OVERDUE: "rose",
  PENDING: "slate",
  NONE: null,
};

function formatDueDate(due: string | Date): string {
  const d = new Date(due);
  if (Number.isNaN(d.getTime())) return "-";
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
}

export function InlineBillingPopover({
  studentId,
  studentName,
  invoices,
}: {
  studentId: string;
  studentName: string;
  invoices: HubInvoice[];
}) {
  const [open, setOpen] = useState(false);

  const billing = deriveBillingState(invoices);
  const tone = BILLING_TONE[billing.state];
  const current = invoices.find(
    (inv) => inv.status !== "CANCELLED" && inv.status !== "REFUNDED",
  );
  const paid = current ? invoicePaid(current) : 0;
  const outstanding = current ? invoiceOutstanding(current) : 0;

  const rowClass = "flex items-center justify-between gap-2 text-[12px]";
  const labelClass = "shrink-0 font-medium text-slate-400";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          aria-label={`${studentName} 이번 달 수납: ${billing.label} — 상세 열기`}
          className="-mx-1.5 flex flex-col items-start gap-0.5 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-slate-100"
        >
          {tone ? (
            <>
              <span className="flex items-center gap-1.5">
                <StatusPill tone={tone}>{billing.label}</StatusPill>
                {billing.state === "OVERDUE" && billing.daysOverdue > 0 ? (
                  <span className="text-[11px] font-bold text-rose-600 tabular-nums">
                    D+{billing.daysOverdue}
                  </span>
                ) : null}
              </span>
              {billing.outstanding > 0 ? (
                <span className="text-[10.5px] text-slate-400 tabular-nums">
                  미수 {billing.outstanding.toLocaleString()}원
                </span>
              ) : null}
            </>
          ) : (
            <span className="text-[11.5px] text-slate-300">미발행</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-64 rounded-xl border-slate-200 p-0 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-100 px-3 py-2.5">
          <p className="text-sm font-bold text-slate-900">이번 달 수납</p>
          <p className="mt-0.5 text-[11px] font-medium text-slate-400">{studentName}</p>
        </div>

        <div className="px-3 py-3">
          {current ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 truncate text-[12.5px] font-bold text-slate-800">
                  {current.title}
                </p>
                {tone ? <StatusPill tone={tone}>{billing.label}</StatusPill> : null}
              </div>

              <div className="space-y-1.5 rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-2">
                <div className={rowClass}>
                  <span className={labelClass}>납기</span>
                  <span className="text-right font-semibold text-slate-600 tabular-nums">
                    {formatDueDate(current.dueDate)}
                    {billing.state === "OVERDUE" && billing.daysOverdue > 0 ? (
                      <span className="ml-1.5 font-bold text-rose-600">
                        연체 D+{billing.daysOverdue}
                      </span>
                    ) : null}
                  </span>
                </div>
                <div className={rowClass}>
                  <span className={labelClass}>납부 / 총액</span>
                  <span className="text-right font-semibold text-slate-600 tabular-nums">
                    {formatCurrency(paid)}
                    <span className="text-slate-300"> / </span>
                    {formatCurrency(current.finalAmount)}
                  </span>
                </div>
                {outstanding > 0 ? (
                  <div className={rowClass}>
                    <span className={labelClass}>미수</span>
                    <span className="text-right font-bold text-rose-600 tabular-nums">
                      {formatCurrency(outstanding)}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="py-2 text-center text-xs font-medium text-slate-400">
              이번 달 청구서가 없습니다.
            </p>
          )}
        </div>

        <Link
          href={`/director/students/${studentId}?tab=billing`}
          className="flex items-center justify-between border-t border-slate-100 px-3 py-2.5 text-xs font-bold text-blue-600 transition-colors hover:bg-slate-50"
        >
          수납 탭 열기
          <ChevronRight className="size-4" />
        </Link>
      </PopoverContent>
    </Popover>
  );
}
