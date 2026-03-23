"use client";

import { useState, useEffect, useCallback } from "react";
import {
  CreditCard,
  AlertCircle,
  Clock,
  CheckCircle2,
  Receipt,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn, formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getChildBillingInfo } from "@/actions/parent";
import type { ChildSummary, ChildBillingData } from "@/actions/parent";

const INVOICE_STATUS_MAP: Record<
  string,
  { label: string; color: string; icon: React.ElementType }
> = {
  PENDING: {
    label: "미납",
    color: "bg-amber-100 text-amber-700",
    icon: Clock,
  },
  OVERDUE: {
    label: "연체",
    color: "bg-red-100 text-red-700",
    icon: AlertCircle,
  },
  PAID: {
    label: "완납",
    color: "bg-emerald-100 text-emerald-700",
    icon: CheckCircle2,
  },
  REFUNDED: {
    label: "환불",
    color: "bg-gray-100 text-gray-500",
    icon: Receipt,
  },
};

const PAYMENT_METHOD_MAP: Record<string, string> = {
  CARD: "카드",
  TRANSFER: "계좌이체",
  CASH: "현금",
  KAKAO_PAY: "카카오페이",
  NAVER_PAY: "네이버페이",
  TOSS: "토스",
};

function ChildSwitcher({
  children,
  selectedId,
  onSelect,
}: {
  children: { id: string; name: string }[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  if (children.length <= 1) return null;

  return (
    <div className="flex gap-2 px-1 py-1 bg-gray-100 rounded-xl" role="tablist" aria-label="자녀 선택">
      {children.map((child) => (
        <button
          key={child.id}
          onClick={() => onSelect(child.id)}
          className={cn(
            "flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all duration-200 min-h-[44px]",
            selectedId === child.id
              ? "bg-white text-blue-600 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          )}
          role="tab"
          aria-selected={selectedId === child.id}
        >
          {child.name}
        </button>
      ))}
    </div>
  );
}

export function BillingClient({
  children,
  initialBilling,
}: {
  children: ChildSummary[];
  initialBilling: ChildBillingData | null;
}) {
  const [selectedChildId, setSelectedChildId] = useState(
    children[0]?.id || ""
  );
  const [billing, setBilling] = useState<ChildBillingData | null>(
    initialBilling
  );
  const [loading, setLoading] = useState(false);
  const [showAllPayments, setShowAllPayments] = useState(false);

  const fetchBilling = useCallback(async (studentId: string) => {
    setLoading(true);
    try {
      const data = await getChildBillingInfo(studentId);
      setBilling(data);
    } catch {
      setBilling(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedChildId && selectedChildId !== children[0]?.id) {
      fetchBilling(selectedChildId);
    }
  }, [selectedChildId, children, fetchBilling]);

  function handleChildSwitch(id: string) {
    setSelectedChildId(id);
    setShowAllPayments(false);
    if (id !== children[0]?.id || !initialBilling) {
      fetchBilling(id);
    } else {
      setBilling(initialBilling);
    }
  }

  if (loading) {
    return (
      <div className="px-5 pt-6 space-y-6">
        <ChildSwitcher
          children={children.map((c) => ({ id: c.id, name: c.name }))}
          selectedId={selectedChildId}
          onSelect={handleChildSwitch}
        />
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!billing) {
    return (
      <div className="px-5 pt-6 space-y-6">
        <ChildSwitcher
          children={children.map((c) => ({ id: c.id, name: c.name }))}
          selectedId={selectedChildId}
          onSelect={handleChildSwitch}
        />
        <div className="text-center py-20 text-sm text-gray-400">
          수납 데이터가 없습니다
        </div>
      </div>
    );
  }

  const displayedPayments = showAllPayments
    ? billing.pastPayments
    : billing.pastPayments.slice(0, 5);

  return (
    <div className="px-5 pt-6 pb-4 space-y-6">
      {/* Child Switcher */}
      <ChildSwitcher
        children={children.map((c) => ({ id: c.id, name: c.name }))}
        selectedId={selectedChildId}
        onSelect={handleChildSwitch}
      />

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">수납 현황</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {children.find((c) => c.id === selectedChildId)?.name}의 청구/결제 내역
        </p>
      </div>

      {/* Overdue Alert */}
      {billing.hasOverdue && (
        <div
          className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-2xl"
          role="alert"
        >
          <AlertCircle className="size-5 text-red-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-700">
              미납 청구서가 있습니다
            </p>
            <p className="text-xs text-red-500 mt-0.5">
              아래에서 확인 후 결제해주세요
            </p>
          </div>
        </div>
      )}

      {/* Active Invoices */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <CreditCard className="size-4 text-blue-500" />
          <h2 className="text-sm font-semibold text-gray-800">현재 청구서</h2>
        </div>
        {billing.activeInvoices.length === 0 ? (
          <div className="text-center py-8 bg-emerald-50/60 rounded-2xl">
            <CheckCircle2 className="size-8 text-emerald-400 mx-auto mb-2" />
            <p className="text-sm text-emerald-700 font-medium">
              미납 청구서가 없습니다
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {billing.activeInvoices.map((invoice) => {
              const statusInfo =
                INVOICE_STATUS_MAP[invoice.status] ||
                INVOICE_STATUS_MAP.PENDING;
              const StatusIcon = statusInfo.icon;

              return (
                <div
                  key={invoice.id}
                  className={cn(
                    "rounded-2xl border p-4",
                    invoice.status === "OVERDUE"
                      ? "border-red-200 bg-red-50/30"
                      : "border-gray-100 bg-white"
                  )}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800">
                        {invoice.title}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        납부기한: {formatDate(invoice.dueDate)}
                      </p>
                    </div>
                    <Badge
                      className={cn(
                        "text-[10px] font-semibold flex items-center gap-1",
                        statusInfo.color
                      )}
                    >
                      <StatusIcon className="size-3" />
                      {statusInfo.label}
                    </Badge>
                  </div>
                  <div className="flex items-end justify-between">
                    <p className="text-2xl font-bold text-gray-900">
                      {formatCurrency(invoice.finalAmount)}
                    </p>
                    <Button
                      size="sm"
                      className="gradient-primary text-white text-xs font-semibold px-5 min-h-[44px] rounded-xl"
                    >
                      결제하기
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Payment History */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Receipt className="size-4 text-emerald-500" />
          <h2 className="text-sm font-semibold text-gray-800">결제 내역</h2>
        </div>
        {billing.pastPayments.length === 0 ? (
          <div className="text-center py-8 text-sm text-gray-400">
            결제 내역이 없습니다
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {displayedPayments.map((payment) => (
                <div
                  key={payment.id}
                  className="flex items-center justify-between p-3.5 bg-gray-50 rounded-xl"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {payment.invoiceTitle}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {formatDate(payment.paidAt)} |{" "}
                      {PAYMENT_METHOD_MAP[payment.method] || payment.method}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0 ml-3">
                    <p className="text-sm font-bold text-gray-900">
                      {formatCurrency(payment.amount)}
                    </p>
                    <button
                      className="text-[11px] text-blue-500 font-medium mt-0.5 min-h-[24px]"
                      aria-label={`${payment.invoiceTitle} 영수증 보기`}
                    >
                      영수증
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {billing.pastPayments.length > 5 && (
              <button
                onClick={() => setShowAllPayments(!showAllPayments)}
                className="flex items-center justify-center w-full mt-2 py-2.5 text-xs text-blue-500 font-medium min-h-[44px]"
              >
                {showAllPayments ? (
                  <>
                    접기 <ChevronUp className="size-3.5 ml-1" />
                  </>
                ) : (
                  <>
                    더보기 ({billing.pastPayments.length - 5}건)
                    <ChevronDown className="size-3.5 ml-1" />
                  </>
                )}
              </button>
            )}
          </>
        )}
      </section>
    </div>
  );
}
