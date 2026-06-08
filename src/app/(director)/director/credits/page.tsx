"use client";

import Link from "next/link";
import { useState, useEffect, useCallback, useRef } from "react";
import PortOne from "@portone/browser-sdk/v2";
import {
  AlertCircle,
  Coins,
  Calendar,
  CheckCircle2,
  Gift,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Filter,
  Zap,
  FileText,
  Brain,
  MessageSquare,
  Pencil,
  ScanText,
  BookOpen,
  Languages,
  GraduationCap,
  CreditCard,
  Landmark,
  ReceiptText,
  Smartphone,
  WalletCards,
  Repeat2,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CREDIT_COSTS,
  OPERATION_LABELS,
  type OperationType,
} from "@/lib/credit-costs";
import { FEATURE_FLAGS } from "@/lib/feature-flags";

// ─── Types ──────────────────────────────────────────────────────────────────

interface CreditSummary {
  balance: number;
  monthlyAllocation: number;
  bonusCredits: number;
  totalConsumed: number;
  totalAllocated: number;
  isLow: boolean;
  threshold: number;
  planName?: string;
  planTier?: string;
}

interface CreditTransaction {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  operationType?: string;
  description?: string;
  staffId?: string;
  createdAt: string;
}

interface CreditTopUp {
  id: string;
  paymentId: string | null;
  creditAmount: number;
  price: number;
  paymentMethod: string | null;
  paymentReference: string | null;
  status: string;
  portoneStatus: string | null;
  paidAmount: number | null;
  receiptUrl: string | null;
  failureMessage: string | null;
  createdAt: string;
  completedAt: string | null;
  paidAt: string | null;
}

interface CreditTopUpProduct {
  id: string;
  code: string;
  name: string;
  label: string;
  creditAmount: number;
  basePrice: number;
  price: number;
  discountRate: number;
  discountAmount: number;
  perCredit: number;
  estimatedAutoQuestionCount: number;
  perAutoQuestion: number;
  promotionName: string | null;
  promotionStartsAt: string | null;
  promotionEndsAt: string | null;
  isPromotionActive: boolean;
  hasScheduledPromotion: boolean;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
}

interface SubscriptionBillingOverview {
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

type TopUpPayMethod =
  | "CARD"
  | "EASY_PAY"
  | "TRANSFER"
  | "VIRTUAL_ACCOUNT"
  | "MOBILE";

type EasyPayProvider = "KAKAOPAY" | "NAVERPAY" | "TOSSPAY" | "PAYCO";

// ─── Constants ──────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  CONSUMPTION: "사용",
  ALLOCATION: "배정",
  TOP_UP: "충전",
  ADJUSTMENT: "조정",
  REFUND: "환불",
  RESET: "리셋",
  ROLLOVER: "이월",
};

const FILTER_OPTIONS = [
  { value: "", label: "전체" },
  { value: "CONSUMPTION", label: "사용" },
  { value: "ALLOCATION", label: "배정" },
  { value: "TOP_UP", label: "충전" },
  { value: "REFUND", label: "환불" },
  { value: "ADJUSTMENT", label: "조정" },
];

const PAY_METHOD_OPTIONS: Array<{
  value: TopUpPayMethod;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}> = [
  { value: "CARD", label: "카드", icon: CreditCard },
  { value: "EASY_PAY", label: "간편결제", icon: WalletCards },
  { value: "TRANSFER", label: "계좌이체", icon: Landmark },
  { value: "VIRTUAL_ACCOUNT", label: "가상계좌", icon: ReceiptText },
  { value: "MOBILE", label: "휴대폰", icon: Smartphone },
];

const VISIBLE_PAY_METHOD_OPTIONS = PAY_METHOD_OPTIONS.filter((option) =>
  getVisibleTopUpPayMethods().includes(option.value),
);

const EASY_PAY_PROVIDER_OPTIONS: Array<{
  value: EasyPayProvider;
  label: string;
}> = [
  { value: "KAKAOPAY", label: "카카오페이" },
  { value: "NAVERPAY", label: "네이버페이" },
  { value: "TOSSPAY", label: "토스페이" },
  { value: "PAYCO", label: "페이코" },
];

function getVisibleTopUpPayMethods() {
  const raw = process.env.NEXT_PUBLIC_PORTONE_TOP_UP_PAY_METHODS;
  if (!raw) return ["CARD"] satisfies TopUpPayMethod[];

  const methods = raw
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter((value): value is TopUpPayMethod =>
      PAY_METHOD_OPTIONS.some((option) => option.value === value),
    );

  return methods.length ? Array.from(new Set(methods)) : (["CARD"] satisfies TopUpPayMethod[]);
}

const TOP_UP_STATUS_LABELS: Record<string, string> = {
  PENDING: "결제 대기",
  WAITING_FOR_DEPOSIT: "입금 대기",
  COMPLETED: "충전 완료",
  FAILED: "실패",
  CANCELLED: "취소",
  REFUNDED: "환불 확인",
};

const TOP_UP_STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-blue-50 text-blue-700",
  WAITING_FOR_DEPOSIT: "bg-sky-50 text-sky-700",
  COMPLETED: "bg-emerald-50 text-emerald-700",
  FAILED: "bg-red-50 text-red-600",
  CANCELLED: "bg-gray-100 text-gray-600",
  REFUNDED: "bg-amber-50 text-amber-700",
};

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

// 기능별 아이콘 매핑
const OPERATION_ICONS: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  QUESTION_GEN_SINGLE: FileText,
  QUESTION_GEN_VOCAB: BookOpen,
  AUTO_GEN_BATCH: Zap,
  LEARNING_QUESTION_GEN: GraduationCap,
  PASSAGE_ANALYSIS: Brain,
  GRAMMAR_ENHANCEMENT: Languages,
  SENTENCE_RETRANSLATION: Languages,
  QUESTION_EXPLANATION: FileText,
  QUESTION_MODIFY: Pencil,
  AI_CHAT: MessageSquare,
  TEXT_EXTRACTION: ScanText,
};

// 기능별 색상 매핑
const OPERATION_COLORS: Record<string, { bg: string; text: string }> = {
  QUESTION_GEN_SINGLE: { bg: "bg-blue-50", text: "text-blue-500" },
  QUESTION_GEN_VOCAB: { bg: "bg-sky-50", text: "text-sky-500" },
  AUTO_GEN_BATCH: { bg: "bg-violet-50", text: "text-violet-500" },
  LEARNING_QUESTION_GEN: { bg: "bg-indigo-50", text: "text-indigo-500" },
  PASSAGE_ANALYSIS: { bg: "bg-emerald-50", text: "text-emerald-500" },
  GRAMMAR_ENHANCEMENT: { bg: "bg-teal-50", text: "text-teal-500" },
  SENTENCE_RETRANSLATION: { bg: "bg-cyan-50", text: "text-cyan-500" },
  QUESTION_EXPLANATION: { bg: "bg-blue-50", text: "text-blue-500" },
  QUESTION_MODIFY: { bg: "bg-slate-100", text: "text-slate-500" },
  AI_CHAT: { bg: "bg-pink-50", text: "text-pink-500" },
  TEXT_EXTRACTION: { bg: "bg-gray-100", text: "text-gray-500" },
};

// ─── Page Component ─────────────────────────────────────────────────────────

export default function CreditsPage() {
  const [summary, setSummary] = useState<CreditSummary | null>(null);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [totalTx, setTotalTx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [txLoading, setTxLoading] = useState(false);
  const [filterType, setFilterType] = useState("");
  const [page, setPage] = useState(0);
  const [topUps, setTopUps] = useState<CreditTopUp[]>([]);
  const [topUpProducts, setTopUpProducts] = useState<CreditTopUpProduct[]>([]);
  const [subscriptionBilling, setSubscriptionBilling] =
    useState<SubscriptionBillingOverview | null>(null);
  const [subscriptionConsent, setSubscriptionConsent] = useState(false);
  const [subscriptionBusy, setSubscriptionBusy] = useState<
    "register" | "cancel" | null
  >(null);
  const [payMethod, setPayMethod] = useState<TopUpPayMethod>(
    VISIBLE_PAY_METHOD_OPTIONS[0]?.value ?? "CARD",
  );
  const [easyPayProvider, setEasyPayProvider] =
    useState<EasyPayProvider>("KAKAOPAY");
  const [payingCredits, setPayingCredits] = useState<number | null>(null);
  const [paymentMessage, setPaymentMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const [subscriptionMessage, setSubscriptionMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const pageSize = 20;
  const isFirstRender = useRef(true);
  const completingPaymentRef = useRef(false);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch("/api/credits/balance");
      if (res.ok) setSummary(await res.json());
    } catch {
      /* ignore */
    }
  }, []);

  const fetchTransactions = useCallback(async () => {
    setTxLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(page * pageSize),
      });
      if (filterType) params.set("type", filterType);
      const res = await fetch(`/api/credits/transactions?${params}`);
      if (res.ok) {
        const data = await res.json();
        setTransactions(data.transactions);
        setTotalTx(data.total);
      }
    } catch {
      /* ignore */
    } finally {
      setTxLoading(false);
    }
  }, [page, filterType]);

  const fetchTopUps = useCallback(async () => {
    try {
      const res = await fetch("/api/credits/top-ups?limit=8");
      if (res.ok) {
        const data = await res.json();
        setTopUps(data.topUps);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const fetchTopUpProducts = useCallback(async () => {
    try {
      const res = await fetch("/api/credits/top-up-products", {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setTopUpProducts(data.products);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const fetchSubscriptionBilling = useCallback(async () => {
    try {
      const res = await fetch("/api/subscriptions/portone", {
        cache: "no-store",
      });
      if (res.ok) {
        setSubscriptionBilling(await res.json());
      }
    } catch {
      /* ignore */
    }
  }, []);

  const refreshAllCreditData = useCallback(async () => {
    await Promise.all([
      fetchSummary(),
      fetchTransactions(),
      fetchTopUps(),
      fetchTopUpProducts(),
      fetchSubscriptionBilling(),
    ]);
  }, [
    fetchSummary,
    fetchTransactions,
    fetchTopUps,
    fetchTopUpProducts,
    fetchSubscriptionBilling,
  ]);

  const completePayment = useCallback(
    async (paymentId: string) => {
      if (completingPaymentRef.current) return;
      completingPaymentRef.current = true;
      setPaymentMessage({ type: "info", text: "결제 승인 내역을 확인 중입니다." });
      try {
        const res = await fetch("/api/credits/top-ups/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentId }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error ?? "결제 검증에 실패했습니다.");
        }
        await refreshAllCreditData();
        setPaymentMessage({
          type: "success",
          text: data.credited
            ? "크레딧 충전이 완료되었습니다."
            : "이미 처리된 결제입니다. 최신 잔고를 반영했습니다.",
        });
      } catch (err) {
        setPaymentMessage({
          type: "error",
          text:
            err instanceof Error
              ? err.message
              : "결제 검증 중 오류가 발생했습니다.",
        });
      } finally {
        completingPaymentRef.current = false;
        if (typeof window !== "undefined") {
          const url = new URL(window.location.href);
          if (url.searchParams.has("paymentId")) {
            url.searchParams.delete("paymentId");
            window.history.replaceState(null, "", url.toString());
          }
        }
      }
    },
    [refreshAllCreditData],
  );

  const startTopUp = useCallback(
    async (product: CreditTopUpProduct) => {
      setPayingCredits(product.creditAmount);
      setPaymentMessage(null);
      try {
        const prepareRes = await fetch("/api/credits/top-ups/prepare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            credits: product.creditAmount,
            payMethod,
            easyPayProvider,
          }),
        });
        const prepared = await prepareRes.json();
        if (!prepareRes.ok) {
          throw new Error(prepared.error ?? "결제 준비에 실패했습니다.");
        }

        const payment = await PortOne.requestPayment(prepared.paymentRequest);
        if (!payment) {
          setPaymentMessage({
            type: "info",
            text: "결제창에서 돌아오면 충전 상태가 자동으로 확인됩니다.",
          });
          return;
        }
        if (payment.code) {
          setPaymentMessage({
            type: "error",
            text: payment.message ?? "결제가 완료되지 않았습니다.",
          });
          await fetchTopUps();
          return;
        }

        await completePayment(payment.paymentId);
      } catch (err) {
        setPaymentMessage({
          type: "error",
          text:
            err instanceof Error
              ? err.message
              : "결제 요청 중 오류가 발생했습니다.",
        });
      } finally {
        setPayingCredits(null);
      }
    },
    [completePayment, easyPayProvider, fetchTopUps, payMethod],
  );

  const registerSubscriptionBilling = useCallback(
    async (billingKey: string, issueId?: string | null) => {
      setSubscriptionBusy("register");
      setSubscriptionMessage({
        type: "info",
        text: "정기결제 카드를 확인하고 첫 결제를 진행 중입니다.",
      });
      try {
        const res = await fetch("/api/subscriptions/portone/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            billingKey,
            issueId: issueId || undefined,
            chargeNow: true,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error ?? "정기결제 등록에 실패했습니다.");
        }
        await refreshAllCreditData();
        setSubscriptionMessage({
          type: "success",
          text: "카드 정기결제가 등록되었습니다. 첫 30일 결제와 다음 갱신 예약을 확인했습니다.",
        });
      } catch (err) {
        setSubscriptionMessage({
          type: "error",
          text:
            err instanceof Error
              ? err.message
              : "정기결제 등록 중 오류가 발생했습니다.",
        });
      } finally {
        setSubscriptionBusy(null);
        if (typeof window !== "undefined") {
          const url = new URL(window.location.href);
          ["billingKey", "billingIssue", "issueId", "code", "message"].forEach(
            (key) => url.searchParams.delete(key),
          );
          window.history.replaceState(null, "", url.toString());
        }
      }
    },
    [refreshAllCreditData],
  );

  const startSubscriptionBilling = useCallback(async () => {
    if (!subscriptionConsent) {
      setSubscriptionMessage({
        type: "error",
        text: "30일마다 자동 결제되는 정기결제 조건에 동의해주세요.",
      });
      return;
    }

    setSubscriptionBusy("register");
    setSubscriptionMessage(null);
    try {
      const issueRes = await fetch("/api/subscriptions/portone/issue", {
        method: "POST",
      });
      const prepared = await issueRes.json();
      if (!issueRes.ok) {
        throw new Error(prepared.error ?? "정기결제 카드 등록 준비에 실패했습니다.");
      }

      const issueResponse = await PortOne.requestIssueBillingKey(
        prepared.issueRequest,
      );
      if (!issueResponse) {
        setSubscriptionMessage({
          type: "info",
          text: "카드 등록창에서 돌아오면 정기결제 상태가 자동으로 확인됩니다.",
        });
        return;
      }
      if (issueResponse.code) {
        setSubscriptionMessage({
          type: "error",
          text:
            issueResponse.message ?? "정기결제 카드 등록이 완료되지 않았습니다.",
        });
        return;
      }

      await registerSubscriptionBilling(
        issueResponse.billingKey,
        prepared.issueId,
      );
    } catch (err) {
      setSubscriptionMessage({
        type: "error",
        text:
          err instanceof Error
            ? err.message
            : "정기결제 요청 중 오류가 발생했습니다.",
      });
    } finally {
      setSubscriptionBusy(null);
    }
  }, [registerSubscriptionBilling, subscriptionConsent]);

  const cancelSubscriptionBilling = useCallback(async () => {
    if (!window.confirm("다음 30일 자동갱신을 해지할까요?")) return;

    setSubscriptionBusy("cancel");
    setSubscriptionMessage(null);
    try {
      const res = await fetch("/api/subscriptions/portone/cancel", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "정기결제 해지에 실패했습니다.");
      }
      await refreshAllCreditData();
      setSubscriptionConsent(false);
      setSubscriptionMessage({
        type: "success",
        text: "다음 30일 자동갱신을 해지했습니다. 현재 이용 기간은 종료일까지 유지됩니다.",
      });
    } catch (err) {
      setSubscriptionMessage({
        type: "error",
        text:
          err instanceof Error
            ? err.message
            : "정기결제 해지 중 오류가 발생했습니다.",
      });
    } finally {
      setSubscriptionBusy(null);
    }
  }, [refreshAllCreditData]);

  // Initial load
  useEffect(() => {
    Promise.all([
      fetchSummary(),
      fetchTransactions(),
      fetchTopUps(),
      fetchTopUpProducts(),
      fetchSubscriptionBilling(),
    ]).then(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const paymentId = params.get("paymentId");
    if (paymentId) void completePayment(paymentId);
    const billingKey = params.get("billingKey");
    if (billingKey) {
      void registerSubscriptionBilling(billingKey, params.get("issueId"));
    }
  }, [completePayment, registerSubscriptionBilling]);

  // Re-fetch when page or filterType changes (skip initial)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    fetchTransactions();
  }, [page, filterType, fetchTransactions]);

  const costEntries = Object.entries(CREDIT_COSTS) as [OperationType, number][];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-[13px] text-gray-500 font-medium">
            로딩 중...
          </span>
        </div>
      </div>
    );
  }

  const totalPages = Math.ceil(totalTx / pageSize);
  const usagePercent = summary
    ? summary.monthlyAllocation > 0
      ? Math.round(
          ((summary.monthlyAllocation - summary.balance + summary.bonusCredits) /
            summary.monthlyAllocation) *
            100,
        )
      : 0
    : 0;

  return (
    <div className="space-y-5 -mx-1">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-bold text-gray-900">크레딧 관리</h1>
          <p className="text-[13px] text-gray-400 mt-0.5">
            AI 기능 사용 크레딧 현황 및 내역을 확인하세요
          </p>
        </div>
        <button
          onClick={() => {
            void refreshAllCreditData();
          }}
          className="flex items-center gap-1.5 h-9 px-3.5 text-[13px] font-medium text-gray-500 bg-white rounded-xl border border-gray-200 hover:border-gray-300 hover:text-gray-700 transition-all duration-200 shadow-sm"
        >
          <RefreshCw className="size-3.5" strokeWidth={1.8} />
          새로고침
        </button>
      </div>

      {FEATURE_FLAGS.SHOW_SUBSCRIPTION_BILLING && (
        <>
          <SubscriptionBillingPanel
            overview={subscriptionBilling}
            consent={subscriptionConsent}
            busy={subscriptionBusy}
            onConsentChange={setSubscriptionConsent}
            onStartBilling={startSubscriptionBilling}
            onCancelBilling={cancelSubscriptionBilling}
          />

          {subscriptionMessage && (
            <div
              className={cn(
                "flex items-center gap-2 rounded-xl border px-4 py-3 text-[13px] font-medium",
                subscriptionMessage.type === "success" &&
                  "border-emerald-100 bg-emerald-50 text-emerald-700",
                subscriptionMessage.type === "error" &&
                  "border-red-100 bg-red-50 text-red-600",
                subscriptionMessage.type === "info" &&
                  "border-blue-100 bg-blue-50 text-blue-700",
              )}
            >
              {subscriptionMessage.type === "success" ? (
                <CheckCircle2 className="size-4 shrink-0" strokeWidth={2} />
              ) : (
                <AlertCircle className="size-4 shrink-0" strokeWidth={2} />
              )}
              <span>{subscriptionMessage.text}</span>
            </div>
          )}
        </>
      )}

      <TopUpPanel
        products={topUpProducts}
        costEntries={costEntries}
        payMethod={payMethod}
        onPayMethodChange={setPayMethod}
        easyPayProvider={easyPayProvider}
        onEasyPayProviderChange={setEasyPayProvider}
        payingCredits={payingCredits}
        onStartTopUp={startTopUp}
        disabled={!FEATURE_FLAGS.SHOW_CREDIT_TOP_UP}
      />

      {paymentMessage && (
        <div
          className={cn(
            "flex items-center gap-2 rounded-xl border px-4 py-3 text-[13px] font-medium",
            paymentMessage.type === "success" &&
              "border-emerald-100 bg-emerald-50 text-emerald-700",
            paymentMessage.type === "error" &&
              "border-red-100 bg-red-50 text-red-600",
            paymentMessage.type === "info" &&
              "border-blue-100 bg-blue-50 text-blue-700",
          )}
        >
          {paymentMessage.type === "success" ? (
            <CheckCircle2 className="size-4" strokeWidth={2} />
          ) : (
            <AlertCircle className="size-4" strokeWidth={2} />
          )}
          {paymentMessage.text}
        </div>
      )}

      {/* Overview cards — 2x2 grid with usage bar */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* 현재 잔액 — 강조 카드 */}
          <div className="col-span-2 bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-5 text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-8 translate-x-8" />
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-6 -translate-x-6" />
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[12px] font-medium text-blue-200">현재 잔액</span>
                {summary.planName && (
                  <span className="text-[10px] font-semibold bg-white/15 backdrop-blur-sm px-2 py-0.5 rounded-md">
                    {summary.planName}
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-[36px] font-extrabold tabular-nums tracking-tight leading-none">
                  {summary.balance.toLocaleString()}
                </span>
                <span className="text-[13px] font-medium text-blue-200">크레딧</span>
              </div>
              {/* Usage progress bar */}
              <div className="mt-4">
                <div className="flex items-center justify-between text-[11px] text-blue-200 mb-1.5">
                  <span>이번 달 사용량</span>
                  <span className="font-semibold text-white">{usagePercent}%</span>
                </div>
                <div className="w-full h-1.5 bg-white/15 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-white/80 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(usagePercent, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          <OverviewCard
            label="월간 배정"
            value={summary.monthlyAllocation}
            icon={Calendar}
            accent="blue"
          />
          <OverviewCard
            label="보너스"
            value={summary.bonusCredits}
            icon={Gift}
            accent="indigo"
          />
        </div>
      )}

      {/* Usage breakdown — compact grid */}
      <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-[14px] font-semibold text-gray-800">
            기능별 크레딧 비용
          </h2>
          <p className="text-[12px] text-gray-400 mt-0.5">
            구매한 크레딧 상품과 관계없이 동일하게 적용되는 기능별 차감 기준
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {costEntries.map(([op, cost], idx) => {
            const OpIcon = OPERATION_ICONS[op] || Coins;
            const colors = OPERATION_COLORS[op] || { bg: "bg-gray-100", text: "text-gray-500" };
            return (
              <div
                key={op}
                className={cn(
                  "flex items-center justify-between px-5 py-3.5 hover:bg-gray-50/50 transition-colors",
                  // grid borders
                  idx < costEntries.length - (costEntries.length % 3 || 3) && "border-b border-gray-50",
                  (idx + 1) % 3 !== 0 && "lg:border-r lg:border-gray-50",
                  (idx + 1) % 2 !== 0 && "sm:border-r sm:border-gray-50 lg:border-r-0",
                )}
              >
                <div className="flex items-center gap-2.5">
                  <div className={cn("flex items-center justify-center w-7 h-7 rounded-lg", colors.bg)}>
                    <OpIcon className={cn("size-3.5", colors.text)} strokeWidth={1.8} />
                  </div>
                  <span className="text-[13px] font-medium text-gray-700">
                    {OPERATION_LABELS[op] || op}
                  </span>
                </div>
                <span className={cn(
                  "text-[13px] font-bold tabular-nums",
                  cost >= 5 ? "text-blue-600" : "text-gray-600",
                )}>
                  {cost}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <TopUpHistory topUps={topUps} />

      {/* Transaction history */}
      <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-[14px] font-semibold text-gray-800">
              크레딧 사용 내역
            </h2>
            <p className="text-[12px] text-gray-400 mt-0.5">
              총 {totalTx.toLocaleString()}건
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Filter className="size-3.5 text-gray-400" strokeWidth={1.8} />
            <select
              value={filterType}
              onChange={(e) => {
                setFilterType(e.target.value);
                setPage(0);
              }}
              className="text-[12px] font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded-lg h-8 px-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 transition-all"
            >
              {FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {txLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Coins className="size-8 mb-2" strokeWidth={1.2} />
            <span className="text-[13px] font-medium">
              크레딧 사용 내역이 없습니다
            </span>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider bg-gray-50/50">
                    <th className="px-5 py-2.5">일시</th>
                    <th className="px-4 py-2.5">유형</th>
                    <th className="px-4 py-2.5">기능</th>
                    <th className="px-4 py-2.5 text-right">금액</th>
                    <th className="px-5 py-2.5 text-right">잔액</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {transactions.map((tx) => {
                    const isPositive = tx.amount > 0;
                    return (
                      <tr
                        key={tx.id}
                        className="hover:bg-gray-50/50 transition-colors"
                      >
                        <td className="px-5 py-3 text-[12px] text-gray-500 tabular-nums whitespace-nowrap">
                          {new Date(tx.createdAt).toLocaleDateString("ko-KR", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              "inline-flex items-center h-[20px] px-2 text-[10px] font-semibold rounded-md",
                              isPositive
                                ? "text-emerald-600 bg-emerald-500/[0.08]"
                                : "text-red-500 bg-red-500/[0.08]",
                            )}
                          >
                            {TYPE_LABELS[tx.type] || tx.type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[12px] text-gray-600">
                          {tx.operationType
                            ? OPERATION_LABELS[
                                tx.operationType as OperationType
                              ] || tx.operationType
                            : tx.description || "-"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span
                            className={cn(
                              "inline-flex items-center gap-0.5 text-[13px] font-semibold tabular-nums",
                              isPositive
                                ? "text-emerald-600"
                                : "text-red-500",
                            )}
                          >
                            {isPositive ? (
                              <ArrowUpRight className="size-3" />
                            ) : (
                              <ArrowDownRight className="size-3" />
                            )}
                            {isPositive ? "+" : ""}
                            {tx.amount.toLocaleString()}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right text-[12px] font-medium text-gray-500 tabular-nums">
                          {tx.balanceAfter.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
                <span className="text-[12px] text-gray-400">
                  {page * pageSize + 1}-
                  {Math.min((page + 1) * pageSize, totalTx)} / {totalTx}건
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="h-7 px-2.5 text-[12px] font-medium text-gray-500 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    이전
                  </button>
                  <button
                    onClick={() =>
                      setPage((p) => Math.min(totalPages - 1, p + 1))
                    }
                    disabled={page >= totalPages - 1}
                    className="h-7 px-2.5 text-[12px] font-medium text-gray-500 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    다음
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

    </div>
  );
}

function SubscriptionBillingPanel({
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

function ComingSoonOverlay({
  message = "PG 심사 준비가 완료되면 결제 기능을 다시 열 예정입니다.",
}: {
  message?: string;
}) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-100/65 backdrop-blur-[1px]">
      <div className="rounded-xl border border-slate-200 bg-white/95 px-5 py-3 text-center shadow-sm">
        <p className="text-[13px] font-bold text-slate-900">기능 준비중</p>
        <p className="mt-1 text-[12px] font-medium text-slate-500">
          {message}
        </p>
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

function TopUpPanel({
  products,
  costEntries,
  payMethod,
  onPayMethodChange,
  easyPayProvider,
  onEasyPayProviderChange,
  payingCredits,
  onStartTopUp,
  disabled = false,
}: {
  products: CreditTopUpProduct[];
  costEntries: [OperationType, number][];
  payMethod: TopUpPayMethod;
  onPayMethodChange: (method: TopUpPayMethod) => void;
  easyPayProvider: EasyPayProvider;
  onEasyPayProviderChange: (provider: EasyPayProvider) => void;
  payingCredits: number | null;
  onStartTopUp: (product: CreditTopUpProduct) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative rounded-2xl border shadow-sm overflow-hidden",
        disabled ? "border-slate-200 bg-slate-100" : "border-blue-100 bg-white",
      )}
      aria-disabled={disabled}
    >
      {disabled && (
        <ComingSoonOverlay message="PG 심사 준비가 완료되면 크레딧 충전을 다시 열 예정입니다." />
      )}

      <div
        className={cn(
          disabled && "pointer-events-none select-none opacity-45 grayscale",
        )}
      >
      <div className="px-5 py-4 border-b border-blue-50 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="shrink-0">
          <h2 className="text-[15px] font-semibold text-gray-900">
            크레딧 충전
          </h2>
          <p className="text-[12px] text-gray-400 mt-0.5">
            포트원 PG 결제로 즉시 잔고에 반영됩니다
          </p>
        </div>
        <div className="flex w-full flex-col items-start gap-2 lg:w-auto">
          <div className="flex flex-wrap gap-1.5">
            {VISIBLE_PAY_METHOD_OPTIONS.map((option) => {
              const Icon = option.icon;
              const active = payMethod === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    if (!disabled) onPayMethodChange(option.value);
                  }}
                  disabled={disabled}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-semibold transition",
                    active
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-gray-200 bg-white text-gray-500 hover:border-blue-200 hover:text-blue-600",
                  )}
                >
                  <Icon className="size-3.5" strokeWidth={2} />
                  {option.label}
                </button>
              );
            })}
          </div>
          {payMethod === "EASY_PAY" && (
            <div className="flex flex-wrap gap-1.5">
              {EASY_PAY_PROVIDER_OPTIONS.map((option) => {
                const active = easyPayProvider === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      if (!disabled) onEasyPayProviderChange(option.value);
                    }}
                    disabled={disabled}
                    className={cn(
                      "inline-flex h-7 items-center rounded-lg border px-2.5 text-[11px] font-semibold transition",
                      active
                        ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                        : "border-gray-200 bg-white text-gray-500 hover:border-emerald-200 hover:text-emerald-600",
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <div className="border-b border-blue-50 bg-slate-50/60 px-5 py-3">
        <div className="flex flex-col gap-3 text-[12px] leading-5 text-slate-500 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-1">
            <p className="font-semibold text-slate-700">SMOAT 크레딧</p>
            <p>
              문제 생성, 자동 출제, 학습지 생성, OCR, 해설 생성 등 SMOAT 내부 AI
              기능을 이용하기 위한 디지털 이용권입니다. 배송이 없는 상품이며,
              결제 승인 또는 가상계좌 입금 확인 후 잔고에 즉시 지급됩니다.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2 font-semibold text-blue-600">
            <Link
              href="/credits/products"
              target="_blank"
              rel="noreferrer"
              className="transition hover:text-blue-700"
            >
              상품 정보
            </Link>
            <span className="text-slate-300">·</span>
            <Link
              href="/terms"
              target="_blank"
              rel="noreferrer"
              className="transition hover:text-blue-700"
            >
              이용약관
            </Link>
            <span className="text-slate-300">·</span>
            <Link
              href="/privacy"
              target="_blank"
              rel="noreferrer"
              className="transition hover:text-blue-700"
            >
              개인정보처리방침
            </Link>
            <span className="text-slate-300">·</span>
            <Link
              href="/refund-policy"
              target="_blank"
              rel="noreferrer"
              className="transition hover:text-blue-700"
            >
              환불 정책
            </Link>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-blue-50">
        {products.length === 0 ? (
          <div className="col-span-full px-5 py-12 text-center text-[13px] text-gray-400">
            현재 노출 중인 크레딧 상품이 없습니다.
          </div>
        ) : products.map((product) => {
          const loading = payingCredits === product.creditAmount;
          return (
            <button
              key={product.id}
              type="button"
              onClick={() => {
                if (!disabled) onStartTopUp(product);
              }}
              disabled={disabled || payingCredits !== null}
              className="group min-h-[128px] text-left px-5 py-4 transition hover:bg-blue-50/50 disabled:cursor-wait disabled:opacity-70"
            >
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-semibold text-blue-600">
                  {product.name}
                </span>
                <span className="text-[11px] font-medium text-gray-400">
                  {product.perAutoQuestion.toLocaleString("ko-KR")}원/문항
                </span>
              </div>
              <div className="mt-2 text-[11px] font-medium text-gray-500">
                자동출제 약{" "}
                {product.estimatedAutoQuestionCount.toLocaleString("ko-KR")}
                문항 · {product.creditAmount.toLocaleString("ko-KR")}C
              </div>
              {product.isPromotionActive && (
                <div className="mt-2 inline-flex rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                  {product.promotionName || "프로모션"} · {product.discountRate}% 할인
                </div>
              )}
              <div className="mt-3 text-[24px] font-bold tracking-tight text-gray-950">
                {product.price.toLocaleString("ko-KR")}원
              </div>
              {product.isPromotionActive && (
                <div className="mt-1 text-[11px] font-medium text-gray-400 line-through">
                  {product.basePrice.toLocaleString("ko-KR")}원
                </div>
              )}
              <div className="mt-3 inline-flex h-8 items-center rounded-lg bg-blue-600 px-3 text-[12px] font-semibold text-white transition group-hover:bg-blue-700">
                {loading ? "결제 준비 중" : "충전하기"}
              </div>
            </button>
          );
        })}
      </div>
      <div className="border-t border-blue-50 px-5 py-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[13px] font-semibold text-gray-800">
            크레딧 사용 가능 기능 및 차감 기준
          </h3>
          <span className="text-[11px] text-gray-400">
            구매 단가와 별도 적용
          </span>
        </div>
        <p className="mb-3 text-[11px] leading-5 text-gray-400">
          큰 단위로 충전하면 1C당 구매 단가는 낮아질 수 있지만, 같은 기능을
          실행할 때 차감되는 크레딧 수는 동일합니다.
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {costEntries.map(([op, cost]) => (
            <div
              key={op}
              className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2"
            >
              <span className="truncate pr-3 text-[12px] font-medium text-slate-600">
                {OPERATION_LABELS[op]}
              </span>
              <span className="shrink-0 text-[12px] font-black tabular-nums text-slate-900">
                {cost}C
              </span>
            </div>
          ))}
        </div>
      </div>
      </div>
    </div>
  );
}

function TopUpHistory({ topUps }: { topUps: CreditTopUp[] }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-[14px] font-semibold text-gray-800">
            충전 요청
          </h2>
          <p className="text-[12px] text-gray-400 mt-0.5">
            최근 결제 요청 상태
          </p>
        </div>
      </div>
      {topUps.length === 0 ? (
        <div className="py-12 text-center text-[13px] text-gray-400">
          충전 요청이 없습니다
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50/50 text-[11px] font-semibold text-gray-400">
                <th className="px-5 py-2.5">일시</th>
                <th className="px-4 py-2.5">상태</th>
                <th className="px-4 py-2.5 text-right">결제금액</th>
                <th className="px-4 py-2.5 text-right">크레딧</th>
                <th className="px-5 py-2.5">영수증</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {topUps.map((topUp) => (
                <tr key={topUp.id} className="hover:bg-gray-50/60 transition">
                  <td className="px-5 py-3 text-[12px] text-gray-500 whitespace-nowrap">
                    {new Date(topUp.createdAt).toLocaleDateString("ko-KR", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "inline-flex h-6 items-center rounded-md px-2 text-[11px] font-semibold",
                        TOP_UP_STATUS_STYLES[topUp.status] ??
                          "bg-gray-100 text-gray-600",
                      )}
                    >
                      {TOP_UP_STATUS_LABELS[topUp.status] ?? topUp.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-[13px] font-semibold tabular-nums text-gray-900">
                    {topUp.price.toLocaleString("ko-KR")}원
                  </td>
                  <td className="px-4 py-3 text-right text-[13px] font-semibold tabular-nums text-blue-700">
                    {topUp.creditAmount.toLocaleString("ko-KR")}C
                  </td>
                  <td className="px-5 py-3 text-[12px]">
                    {topUp.receiptUrl ? (
                      <a
                        href={topUp.receiptUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-blue-600 hover:text-blue-700"
                      >
                        보기
                      </a>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Overview Card (compact) ────────────────────────────────────────────────

function OverviewCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  accent: "emerald" | "blue" | "indigo" | "gray" | "red";
}) {
  const accentMap = {
    emerald: { bg: "bg-emerald-50", text: "text-emerald-500", value: "text-emerald-700" },
    blue: { bg: "bg-blue-50", text: "text-blue-500", value: "text-blue-700" },
    indigo: { bg: "bg-indigo-50", text: "text-indigo-500", value: "text-indigo-700" },
    gray: { bg: "bg-gray-100", text: "text-gray-500", value: "text-gray-700" },
    red: { bg: "bg-red-50", text: "text-red-500", value: "text-red-700" },
  };
  const colors = accentMap[accent];

  return (
    <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[12px] font-medium text-gray-400">{label}</span>
        <div className={cn("flex items-center justify-center w-7 h-7 rounded-lg", colors.bg)}>
          <Icon className={cn("size-3.5", colors.text)} strokeWidth={1.8} />
        </div>
      </div>
      <div className="flex items-baseline gap-1">
        <span className={cn("text-[22px] font-bold tabular-nums tracking-tight", colors.value)}>
          {value.toLocaleString()}
        </span>
        <span className="text-[11px] text-gray-400 font-medium">크레딧</span>
      </div>
    </div>
  );
}
