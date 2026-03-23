"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  CreditCard,
  Printer,
  XCircle,
  User,
  Phone,
  School,
  Clock,
} from "lucide-react";
import { formatCurrency, formatDate, formatDateTime, cn } from "@/lib/utils";
import { INVOICE_STATUSES, PAYMENT_METHODS } from "@/lib/constants";
import { cancelInvoice } from "@/actions/billing";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PaymentDialog } from "@/components/billing/payment-dialog";

interface Payment {
  id: string;
  amount: number;
  method: string;
  paidAt: string | Date;
  reference: string | null;
  memo: string | null;
}

interface InvoiceDetail {
  id: string;
  title: string;
  amount: number;
  discount: number;
  finalAmount: number;
  dueDate: string | Date;
  paidDate: string | Date | null;
  status: string;
  memo: string | null;
  createdAt: string | Date;
  student: {
    id: string;
    name: string;
    grade: number;
    phone: string | null;
    school: { name: string } | null;
    parentLinks: {
      parent: { name: string; phone: string; relation: string | null };
    }[];
  };
  payments: Payment[];
}

interface Props {
  invoice: InvoiceDetail;
}

export function InvoiceDetailClient({ invoice }: Props) {
  const router = useRouter();
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);

  const totalPaid = invoice.payments.reduce((sum, p) => sum + p.amount, 0);
  const remaining = invoice.finalAmount - totalPaid;

  const statusInfo = INVOICE_STATUSES.find((s) => s.value === invoice.status);
  const canRecordPayment = ["PENDING", "PARTIAL", "OVERDUE"].includes(invoice.status);
  const canCancel = ["PENDING", "OVERDUE"].includes(invoice.status);

  function getMethodLabel(method: string) {
    return PAYMENT_METHODS.find((m) => m.value === method)?.label || method;
  }

  async function handleCancel() {
    if (!confirm("이 청구서를 취소하시겠습니까?")) return;
    const result = await cancelInvoice(invoice.id);
    if (result.success) {
      toast.success("청구서가 취소되었습니다.");
      router.refresh();
    } else {
      toast.error(result.error || "오류가 발생했습니다.");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/director/billing"
          className="flex size-9 items-center justify-center rounded-lg border border-[#E5E7EB] hover:bg-[#F8F9FA]"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-[24px] font-bold text-[#191F28]">청구서 상세</h1>
          <p className="mt-0.5 text-sm text-[#8B95A1]">
            생성일: {formatDate(invoice.createdAt)}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5">
            <Printer className="size-4" />
            인쇄 / 다운로드
          </Button>
          {canRecordPayment && (
            <Button
              size="sm"
              className="gap-1.5 bg-[#10B981] hover:bg-[#059669]"
              onClick={() => setPaymentDialogOpen(true)}
            >
              <CreditCard className="size-4" />
              수납 처리
            </Button>
          )}
          {canCancel && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-red-600 hover:bg-red-50"
              onClick={handleCancel}
            >
              <XCircle className="size-4" />
              취소
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-6">
        {/* Left: Invoice Details + Payment Timeline */}
        <div className="flex-1 space-y-6">
          {/* Invoice Details Card */}
          <div className="rounded-xl border border-[#F2F4F6] bg-white p-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[#191F28]">{invoice.title}</h2>
                <p className="mt-1 text-sm text-[#8B95A1]">
                  납부 기한: {formatDate(invoice.dueDate)}
                </p>
              </div>
              {statusInfo && (
                <span
                  className={cn(
                    "rounded-full px-3 py-1 text-sm font-medium",
                    statusInfo.color
                  )}
                >
                  {statusInfo.label}
                </span>
              )}
            </div>

            <div className="mt-6 grid grid-cols-2 gap-4 rounded-lg bg-[#F8F9FA] p-4 sm:grid-cols-4">
              <div>
                <p className="text-xs text-[#8B95A1]">청구 금액</p>
                <p className="mt-1 text-lg font-bold text-[#191F28]">
                  {formatCurrency(invoice.amount)}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#8B95A1]">할인</p>
                <p className="mt-1 text-lg font-bold text-[#8B95A1]">
                  {invoice.discount > 0 ? `-${formatCurrency(invoice.discount)}` : "-"}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#8B95A1]">최종 금액</p>
                <p className="mt-1 text-lg font-bold text-[#3B82F6]">
                  {formatCurrency(invoice.finalAmount)}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#8B95A1]">잔액</p>
                <p
                  className={cn(
                    "mt-1 text-lg font-bold",
                    remaining > 0 ? "text-red-600" : "text-emerald-600"
                  )}
                >
                  {formatCurrency(remaining)}
                </p>
              </div>
            </div>

            {invoice.memo && (
              <div className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {invoice.memo}
              </div>
            )}
          </div>

          {/* Payment History Timeline */}
          <div className="rounded-xl border border-[#F2F4F6] bg-white p-6">
            <h3 className="text-[16px] font-semibold text-[#191F28]">납부 내역</h3>

            {invoice.payments.length === 0 ? (
              <div className="mt-6 flex flex-col items-center gap-2 py-8 text-[#8B95A1]">
                <Clock className="size-8 text-[#ADB5BD]" />
                <p className="text-sm">아직 납부 내역이 없습니다.</p>
              </div>
            ) : (
              <div className="relative mt-4 ml-4 border-l-2 border-[#E5E7EB] pl-6">
                {invoice.payments.map((payment, index) => (
                  <div
                    key={payment.id}
                    className={cn(
                      "relative pb-6",
                      index === invoice.payments.length - 1 && "pb-0"
                    )}
                  >
                    {/* Timeline dot */}
                    <div className="absolute -left-[31px] flex size-4 items-center justify-center rounded-full border-2 border-emerald-500 bg-white">
                      <div className="size-2 rounded-full bg-emerald-500" />
                    </div>

                    <div className="rounded-lg border border-[#F2F4F6] p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-lg font-bold text-emerald-600">
                          {formatCurrency(payment.amount)}
                        </span>
                        <span className="rounded-full bg-[#F2F4F6] px-2.5 py-0.5 text-xs font-medium text-[#4E5968]">
                          {getMethodLabel(payment.method)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-[#8B95A1]">
                        {formatDateTime(payment.paidAt)}
                      </p>
                      {payment.reference && (
                        <p className="mt-1 text-xs text-[#8B95A1]">
                          참조: {payment.reference}
                        </p>
                      )}
                      {payment.memo && (
                        <p className="mt-1 text-xs text-[#8B95A1]">
                          메모: {payment.memo}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Student Info Sidebar */}
        <div className="hidden w-[300px] shrink-0 lg:block">
          <div className="rounded-xl border border-[#F2F4F6] bg-white p-6">
            <h3 className="text-[15px] font-semibold text-[#191F28]">학생 정보</h3>

            <div className="mt-4 space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-full bg-[#EFF6FF]">
                  <User className="size-5 text-[#3B82F6]" />
                </div>
                <div>
                  <p className="font-medium text-[#191F28]">{invoice.student.name}</p>
                  <p className="text-xs text-[#8B95A1]">{invoice.student.grade}학년</p>
                </div>
              </div>

              {invoice.student.phone && (
                <div className="flex items-center gap-3 text-sm text-[#4E5968]">
                  <Phone className="size-4 text-[#8B95A1]" />
                  {invoice.student.phone}
                </div>
              )}

              {invoice.student.school && (
                <div className="flex items-center gap-3 text-sm text-[#4E5968]">
                  <School className="size-4 text-[#8B95A1]" />
                  {invoice.student.school.name}
                </div>
              )}
            </div>

            {/* Parent Info */}
            {invoice.student.parentLinks.length > 0 && (
              <>
                <div className="my-4 border-t border-[#F2F4F6]" />
                <h4 className="text-sm font-medium text-[#8B95A1]">학부모 정보</h4>
                <div className="mt-2 space-y-3">
                  {invoice.student.parentLinks.map((link, i) => (
                    <div key={i} className="text-sm">
                      <p className="font-medium text-[#191F28]">
                        {link.parent.name}
                        {link.parent.relation && (
                          <span className="ml-1 text-xs text-[#8B95A1]">
                            ({link.parent.relation === "MOTHER"
                              ? "어머니"
                              : link.parent.relation === "FATHER"
                                ? "아버지"
                                : "보호자"})
                          </span>
                        )}
                      </p>
                      <p className="text-[#8B95A1]">{link.parent.phone}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Payment Dialog */}
      <PaymentDialog
        open={paymentDialogOpen}
        onOpenChange={setPaymentDialogOpen}
        invoice={{
          id: invoice.id,
          title: invoice.title,
          finalAmount: invoice.finalAmount,
          status: invoice.status,
          student: { name: invoice.student.name },
          payments: invoice.payments.map((p) => ({ amount: p.amount })),
        }}
      />
    </div>
  );
}
