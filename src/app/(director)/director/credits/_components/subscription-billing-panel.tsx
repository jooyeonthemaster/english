"use client";

import { cn } from "@/lib/utils";
import { AlertCircle, CreditCard, RefreshCw, Repeat2, ShieldCheck, XCircle } from "lucide-react";
import Link from "next/link";
import { ComingSoonOverlay } from "./shared";

export interface SubscriptionBillingOverview {
  subscription: {
    id: string;
    status: string;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    cancelledAt: string | null;
    autoRenew: boolean;
    nextBillingAt: string | null;
    billingActivatedAt: string | null;
    billingFailureMessage: string | null;
    plan: {
      id: string;
      name: string;
      tier: string;
      monthlyPrice: number;
      monthlyCredits: number;
      pricing: {
        originalPrice: number;
        finalPrice: number;
        discountAmount: number;
        isPromotionActive: boolean;
      };
    };
    billingKey: {
      id: string;
      status: string;
      method: string;
      issuedAt: string | null;
      deletedAt: string | null;
    } | null;
  } | null;
  payments: SubscriptionPaymentPreview[];
}

interface SubscriptionPaymentPreview {
  id: string;
  paymentId: string;
  scheduleId: string | null;
  orderName: string;
  amount: number;
  currency: string;
  status: string;
  portoneStatus: string | null;
  paidAmount: number | null;
  receiptUrl: string | null;
  failureMessage: string | null;
  scheduledAt: string | null;
  paidAt: string | null;
  completedAt: string | null;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
}

const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  TRIAL: "체험",
  ACTIVE: "이용 중",
  PAST_DUE: "결제 확인 필요",
  CANCELLED: "해지",
  SUSPENDED: "정지",
};

const SUBSCRIPTION_PAYMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: "대기",
  SCHEDULED: "예약",
  PAID: "결제 완료",
  FAILED: "실패",
  CANCELLED: "취소",
  REFUNDED: "환불",
};

const SUBSCRIPTION_PAYMENT_STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-blue-50 text-blue-700",
  SCHEDULED: "bg-indigo-50 text-indigo-700",
  PAID: "bg-emerald-50 text-emerald-700",
  FAILED: "bg-red-50 text-red-600",
  CANCELLED: "bg-gray-100 text-gray-600",
  REFUNDED: "bg-amber-50 text-amber-700",
};

export function SubscriptionBillingPanel({
  overview,
  consent,
  busy,
  onConsentChange,
  onStartBilling,
  onCancelBilling,
  disabled = false,
}: {
  overview: SubscriptionBillingOverview | null;
  consent: boolean;
  busy: "register" | "cancel" | null;
  onConsentChange: (checked: boolean) => void;
  onStartBilling: () => void;
  onCancelBilling: () => void;
  disabled?: boolean;
}) {
  const subscription = overview?.subscription ?? null;
  const latestPayments = overview?.payments ?? [];

  if (!subscription) {
    return (
      <div
        className={cn(
          "relative rounded-2xl border shadow-sm overflow-hidden",
          disabled ? "border-slate-200 bg-slate-100" : "border-gray-200/60 bg-white",
        )}
        aria-disabled={disabled}
      >
        {disabled && <ComingSoonOverlay />}
        <div
          className={cn(
            "flex flex-col gap-3 px-5 py-5 sm:flex-row sm:items-center sm:justify-between",
            disabled && "pointer-events-none select-none opacity-45 grayscale",
          )}
        >
          <div>
            <h2 className="text-[15px] font-semibold text-gray-900">
              구독 정기결제
            </h2>
            <p className="mt-0.5 text-[12px] text-gray-400">
              현재 연결된 유료 구독 플랜이 없습니다
            </p>
          </div>
          <Link
            href="/credits/products"
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 items-center justify-center rounded-lg border border-gray-200 px-3 text-[12px] font-semibold text-gray-600 transition hover:border-blue-200 hover:text-blue-600"
          >
            상품 정보
          </Link>
        </div>
      </div>
    );
  }

  const statusLabel =
    SUBSCRIPTION_STATUS_LABELS[subscription.status] ?? subscription.status;
  const billingKeyActive =
    subscription.billingKey?.status === "ISSUED" && subscription.autoRenew;
  const finalPrice = subscription.plan.pricing.finalPrice;
  const originalPrice = subscription.plan.pricing.originalPrice;
  const hasDiscount = subscription.plan.pricing.discountAmount > 0;

  return (
    <div
      className={cn(
        "relative rounded-2xl border shadow-sm overflow-hidden",
        disabled ? "border-slate-200 bg-slate-100" : "border-emerald-100 bg-white",
      )}
      aria-disabled={disabled}
    >
      {disabled && <ComingSoonOverlay />}
      <div className={cn(disabled && "pointer-events-none select-none opacity-45 grayscale")}>
      <div className="flex flex-col gap-4 border-b border-emerald-50 px-5 py-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[15px] font-semibold text-gray-900">
              구독 정기결제
            </h2>
            <span className="inline-flex h-6 items-center rounded-md bg-emerald-50 px-2 text-[11px] font-semibold text-emerald-700">
              {statusLabel}
            </span>
            <span
              className={cn(
                "inline-flex h-6 items-center rounded-md px-2 text-[11px] font-semibold",
                billingKeyActive
                  ? "bg-blue-50 text-blue-700"
                  : "bg-gray-100 text-gray-600",
              )}
            >
              {billingKeyActive ? "자동갱신 ON" : "자동갱신 OFF"}
            </span>
          </div>
          <p className="mt-1 text-[12px] text-gray-400">
            {subscription.plan.name} · 30일마다 신용카드로 자동 결제됩니다
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 text-[12px] font-semibold text-emerald-700">
          <Link
            href="/credits/products"
            target="_blank"
            rel="noreferrer"
            className="transition hover:text-emerald-800"
          >
            상품 정보
          </Link>
          <span className="text-slate-300">·</span>
          <Link
            href="/terms"
            target="_blank"
            rel="noreferrer"
            className="transition hover:text-emerald-800"
          >
            이용약관
          </Link>
          <span className="text-slate-300">·</span>
          <Link
            href="/refund-policy"
            target="_blank"
            rel="noreferrer"
            className="transition hover:text-emerald-800"
          >
            환불 정책
          </Link>
          <span className="text-slate-300">·</span>
          <Link
            href="/privacy"
            target="_blank"
            rel="noreferrer"
            className="transition hover:text-emerald-800"
          >
            개인정보처리방침
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="border-b border-emerald-50 px-5 py-5 lg:border-b-0 lg:border-r">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <BillingMetric
              label="결제 금액"
              value={`${finalPrice.toLocaleString("ko-KR")}원`}
              subValue={hasDiscount ? `${originalPrice.toLocaleString("ko-KR")}원` : "30일 기준"}
              strikeSubValue={hasDiscount}
            />
            <BillingMetric
              label="월 배정"
              value={`${subscription.plan.monthlyCredits.toLocaleString("ko-KR")}C`}
              subValue="결제 완료 시 지급"
            />
            <BillingMetric
              label="다음 결제"
              value={
                subscription.nextBillingAt
                  ? formatDateTime(subscription.nextBillingAt)
                  : "예약 없음"
              }
              subValue={
                subscription.currentPeriodEnd
                  ? `${formatDate(subscription.currentPeriodEnd)}까지 이용`
                  : undefined
              }
            />
          </div>

          <div className="mt-4 rounded-lg bg-slate-50 px-4 py-3">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={consent}
                onChange={(event) => onConsentChange(event.target.checked)}
                disabled={disabled}
                className="mt-0.5 size-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span className="text-[12px] leading-5 text-slate-600">
                30일마다 {finalPrice.toLocaleString("ko-KR")}원이 등록한
                신용카드로 자동 결제되는 데 동의합니다. 카드 원문 정보는
                SMOAT에 저장되지 않고 포트원 빌링키로 처리됩니다.
              </span>
            </label>
            {subscription.billingFailureMessage && (
              <div className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-[12px] leading-5 text-red-600">
                <AlertCircle className="mt-0.5 size-3.5 shrink-0" strokeWidth={2} />
                <span>{subscription.billingFailureMessage}</span>
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onStartBilling}
              disabled={disabled || busy !== null || !consent}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-[13px] font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {busy === "register" ? (
                <RefreshCw className="size-4 animate-spin" strokeWidth={2} />
              ) : (
                <Repeat2 className="size-4" strokeWidth={2} />
              )}
              {billingKeyActive ? "카드 변경" : "카드 등록 및 첫 결제"}
            </button>
            {subscription.autoRenew && (
              <button
                type="button"
                onClick={onCancelBilling}
                disabled={disabled || busy !== null}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 text-[13px] font-semibold text-gray-600 transition hover:border-red-200 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy === "cancel" ? (
                  <RefreshCw className="size-4 animate-spin" strokeWidth={2} />
                ) : (
                  <XCircle className="size-4" strokeWidth={2} />
                )}
                자동갱신 해지
              </button>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 font-medium text-blue-700">
              <CreditCard className="size-3" strokeWidth={2} />
              신용카드 정기결제
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 font-medium text-emerald-700">
              <ShieldCheck className="size-3" strokeWidth={2} />
              포트원 빌링키 저장
            </span>
          </div>
        </div>

        <div className="px-5 py-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[13px] font-semibold text-gray-800">
              구독 결제 내역
            </h3>
            <span className="text-[11px] text-gray-400">최근 8건</span>
          </div>
          {latestPayments.length === 0 ? (
            <div className="rounded-lg bg-slate-50 px-4 py-8 text-center text-[12px] text-gray-400">
              아직 구독 결제 내역이 없습니다.
            </div>
          ) : (
            <div className="space-y-2">
              {latestPayments.map((payment) => (
                <div
                  key={payment.id}
                  className="rounded-lg border border-gray-100 px-3 py-2.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-semibold text-gray-800">
                        {payment.orderName}
                      </p>
                      <p className="mt-0.5 text-[11px] text-gray-400">
                        {formatDate(payment.periodStart)} -{" "}
                        {formatDate(payment.periodEnd)}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "inline-flex h-6 shrink-0 items-center rounded-md px-2 text-[11px] font-semibold",
                        SUBSCRIPTION_PAYMENT_STATUS_STYLES[payment.status] ??
                          "bg-gray-100 text-gray-600",
                      )}
                    >
                      {SUBSCRIPTION_PAYMENT_STATUS_LABELS[payment.status] ??
                        payment.status}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[12px]">
                    <span className="font-semibold tabular-nums text-gray-900">
                      {payment.amount.toLocaleString("ko-KR")}원
                    </span>
                    {payment.receiptUrl ? (
                      <a
                        href={payment.receiptUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-blue-600 hover:text-blue-700"
                      >
                        영수증
                      </a>
                    ) : (
                      <span className="text-gray-400">
                        {payment.scheduledAt
                          ? `${formatDateTime(payment.scheduledAt)} 예정`
                          : "-"}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}

function BillingMetric({
  label,
  value,
  subValue,
  strikeSubValue = false,
}: {
  label: string;
  value: string;
  subValue?: string;
  strikeSubValue?: boolean;
}) {
  return (
    <div className="rounded-lg bg-emerald-50/60 px-4 py-3">
      <p className="text-[11px] font-semibold text-emerald-700">{label}</p>
      <p className="mt-1 break-words text-[18px] font-bold tracking-tight text-gray-950">
        {value}
      </p>
      {subValue && (
        <p
          className={cn(
            "mt-0.5 text-[11px] font-medium text-gray-400",
            strikeSubValue && "line-through",
          )}
        >
          {subValue}
        </p>
      )}
    </div>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
