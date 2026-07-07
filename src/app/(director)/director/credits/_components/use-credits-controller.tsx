import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import type { OperationType } from "@/lib/credit-costs";
import PortOne from "@portone/browser-sdk/v2";
import type { CreditSummary, CreditTransaction } from "./credit-overview";
import { isDanalLegacyPaymentRequest, requestDanalLegacyPayment } from "./payment-sdk";
import { clearCreditPaymentReturnParams } from "./return-params";
import type { SubscriptionBillingOverview } from "./subscription-billing-panel";
import {
  BANK_DEPOSIT_ACCOUNT,
  BANK_DEPOSIT_WINDOW_MINUTES,
  VISIBLE_PAY_METHOD_OPTIONS,
} from "./top-up-panel";
import type { BankDepositGuideData, CreditTopUp, CreditTopUpProduct, EasyPayProvider, TopUpPayMethod } from "./top-up-panel";
import type { HeldCoupon } from "@/lib/printable-coupon-discount";

export function useCreditsController() {
  const [summary, setSummary] = useState<CreditSummary | null>(null);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [totalTx, setTotalTx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [txLoading, setTxLoading] = useState(false);
  const [filterType, setFilterType] = useState("");
  const [page, setPage] = useState(0);
  const [topUps, setTopUps] = useState<CreditTopUp[]>([]);
  const [topUpTotal, setTopUpTotal] = useState(0);
  const [topUpPage, setTopUpPage] = useState(0);
  const [topUpProducts, setTopUpProducts] = useState<CreditTopUpProduct[]>([]);
  const [cardEnabled, setCardEnabled] = useState(false);
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
  const [depositorName, setDepositorName] = useState("");
  const [bankDepositGuide, setBankDepositGuide] =
    useState<BankDepositGuideData | null>(null);
  const [bankDepositCompleted, setBankDepositCompleted] = useState(false);
  const bankDepositGuideRef = useRef<BankDepositGuideData | null>(null);
  bankDepositGuideRef.current = bankDepositGuide;
  const [selectedProduct, setSelectedProduct] =
    useState<CreditTopUpProduct | null>(null);
  // 보유 실물 할인 쿠폰 + 선택(충전 결제 시 서버가 프로모와 비교해 더 저렴한 쪽 적용).
  const [heldCoupons, setHeldCoupons] = useState<HeldCoupon[]>([]);
  const [selectedCouponId, setSelectedCouponId] = useState<string | null>(null);
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
  const topUpPageSize = 8;
  const isFirstRender = useRef(true);
  const isFirstTopUpRender = useRef(true);
  const topUpPageRef = useRef(0);
  topUpPageRef.current = topUpPage;
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
      const params = new URLSearchParams({
        limit: String(topUpPageSize),
        offset: String(topUpPage * topUpPageSize),
      });
      const res = await fetch(`/api/credits/top-ups?${params}`);
      if (res.ok) {
        const data = await res.json();
        setTopUps(data.topUps);
        if (typeof data.total === "number") setTopUpTotal(data.total);
      }
    } catch {
      /* ignore */
    }
  }, [topUpPage]);

  const fetchTopUpProducts = useCallback(async () => {
    try {
      const res = await fetch("/api/credits/top-up-products", {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setTopUpProducts(data.products);
        setCardEnabled(Boolean(data.cardEnabled));
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

  const fetchHeldCoupons = useCallback(async () => {
    try {
      const res = await fetch("/api/coupons/printable/held", {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        const coupons: HeldCoupon[] = data.coupons ?? [];
        setHeldCoupons(coupons);
        // 선택된 쿠폰이 더 이상 보유목록에 없으면(사용/만료) 선택 해제.
        setSelectedCouponId((prev) =>
          prev && coupons.some((c) => c.id === prev) ? prev : null,
        );
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
      fetchHeldCoupons(),
    ]);
  }, [
    fetchSummary,
    fetchTransactions,
    fetchTopUps,
    fetchTopUpProducts,
    fetchSubscriptionBilling,
    fetchHeldCoupons,
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
        clearCreditPaymentReturnParams();
      }
    },
    [refreshAllCreditData],
  );

  const startBankDeposit = useCallback(
    async (product: CreditTopUpProduct) => {
      const trimmedName = depositorName.trim();
      if (!trimmedName) {
        setPaymentMessage({
          type: "error",
          text: "입금자명을 입력해주세요. 실제 입금하실 분의 성함이 필요합니다.",
        });
        return;
      }
      setPayingCredits(product.creditAmount);
      setPaymentMessage(null);
      setBankDepositGuide(null);
      setBankDepositCompleted(false);
      try {
        const res = await fetch("/api/credits/top-ups/bank-deposit/prepare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            credits: product.creditAmount,
            depositorName: trimmedName,
            couponCodeId: selectedCouponId ?? undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error ?? "입금 안내 생성에 실패했습니다.");
        }
        setBankDepositGuide({
          topUpId: data.topUpId,
          amount: data.amount,
          creditAmount: data.creditAmount,
          depositorName: data.depositorName,
          account: data.account,
          windowMinutes: data.windowMinutes,
          expiresAt:
            (data.createdAt ? new Date(data.createdAt).getTime() : Date.now()) +
            data.windowMinutes * 60_000,
          confirmStartedAt: null,
        });
        await fetchTopUps();
      } catch (err) {
        setPaymentMessage({
          type: "error",
          text:
            err instanceof Error
              ? err.message
              : "입금 안내 생성 중 오류가 발생했습니다.",
        });
      } finally {
        setPayingCredits(null);
      }
    },
    [depositorName, fetchTopUps, selectedCouponId],
  );

  const startTopUp = useCallback(
    async (product: CreditTopUpProduct) => {
      if (payMethod === "BANK_TRANSFER") {
        await startBankDeposit(product);
        return;
      }
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
            couponCodeId: selectedCouponId ?? undefined,
          }),
        });
        const prepared = await prepareRes.json();
        if (!prepareRes.ok) {
          throw new Error(prepared.error ?? "결제 준비에 실패했습니다.");
        }

        if (isDanalLegacyPaymentRequest(prepared.paymentRequest)) {
          const payment = await requestDanalLegacyPayment(prepared.paymentRequest);
          await completePayment(payment.paymentId);
          return;
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
    [
      completePayment,
      easyPayProvider,
      fetchTopUps,
      payMethod,
      startBankDeposit,
      selectedCouponId,
    ],
  );

  // 충전 요청 목록에서 무통장입금 주문을 클릭하면 해당 주문의 입금 안내 모달을 연다.
  const openBankGuideForTopUp = useCallback((topUp: CreditTopUp) => {
    if (topUp.paymentMethod !== "BANK_TRANSFER") return;
    const createdMs = new Date(topUp.createdAt).getTime();
    setBankDepositGuide({
      topUpId: topUp.id,
      amount: topUp.price,
      creditAmount: topUp.creditAmount,
      depositorName: topUp.depositorName ?? "",
      account: { ...BANK_DEPOSIT_ACCOUNT },
      windowMinutes: BANK_DEPOSIT_WINDOW_MINUTES,
      expiresAt: createdMs + BANK_DEPOSIT_WINDOW_MINUTES * 60_000,
      confirmStartedAt: topUp.confirmStartedAt ?? null,
    });
    setBankDepositCompleted(topUp.status === "COMPLETED");
  }, []);

  // 입금 안내에서 "입금 완료" 클릭 → 확인 시작 시각을 서버에 기록하고 목록 갱신.
  const markBankDepositPaid = useCallback(
    async (topUpId: string) => {
      try {
        await fetch(`/api/credits/top-ups/bank-deposit/${topUpId}/mark-paid`, {
          method: "POST",
        });
      } catch {
        /* ignore — 낙관적으로 이미 표시됨 */
      }
      await fetchTopUps();
    },
    [fetchTopUps],
  );

  // 결제수단 선택 모달에서 "결제하기" 확정 시 호출 — 선택된 상품으로 기존 흐름 실행.
  // 모달을 먼저 닫아야 PG 결제창(다날 등)의 클릭이 Radix 오버레이에 막히지 않는다.
  const confirmSelectedTopUp = useCallback(() => {
    const product = selectedProduct;
    if (!product) return;
    setSelectedProduct(null);
    void startTopUp(product);
  }, [selectedProduct, startTopUp]);

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
      fetchHeldCoupons(),
    ]).then(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 무통장입금: (1) 대기 주문/안내가 있는 동안 폴링으로 데이터만 갱신하고,
  //            (2) 별도 effect에서 topUps의 COMPLETED 전환을 감지해 알림/모달 표시.
  const hasPendingBankOrder = topUps.some(
    (t) =>
      t.paymentMethod === "BANK_TRANSFER" &&
      (t.status === "WAITING_FOR_DEPOSIT" || t.status === "PENDING"),
  );
  const shouldPollBank =
    hasPendingBankOrder || (bankDepositGuide !== null && !bankDepositCompleted);

  useEffect(() => {
    if (!shouldPollBank) return;
    const startedAt = Date.now();
    const MAX_MS = 45 * 60 * 1000;
    const interval = setInterval(async () => {
      if (Date.now() - startedAt > MAX_MS) {
        clearInterval(interval);
        return;
      }
      try {
        const params = new URLSearchParams({
          limit: String(topUpPageSize),
          offset: String(topUpPageRef.current * topUpPageSize),
        });
        const res = await fetch(`/api/credits/top-ups?${params}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = await res.json();
        setTopUps(data.topUps ?? []);
        if (typeof data.total === "number") setTopUpTotal(data.total);
      } catch {
        /* ignore */
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [shouldPollBank]);

  // 무통장입금 주문이 "대기 → 충전 완료"로 바뀌는 순간을 감지 (중복 알림 방지)
  const prevBankStatusRef = useRef<Map<string, string>>(new Map());
  const notifiedBankIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const bankOrders = topUps.filter((t) => t.paymentMethod === "BANK_TRANSFER");
    for (const order of bankOrders) {
      const prev = prevBankStatusRef.current.get(order.id);
      const justCompleted =
        order.status === "COMPLETED" &&
        prev !== undefined &&
        prev !== "COMPLETED";
      if (justCompleted && !notifiedBankIdsRef.current.has(order.id)) {
        notifiedBankIdsRef.current.add(order.id);
        void Promise.all([fetchSummary(), fetchTransactions()]);
        if (bankDepositGuideRef.current?.topUpId === order.id) {
          // 안내 모달이 열려 있으면 모달에서 완료 화면 표시
          setBankDepositCompleted(true);
          setPaymentMessage(null);
        } else {
          setPaymentMessage({
            type: "success",
            text: `무통장입금이 확인되어 ${order.creditAmount.toLocaleString("ko-KR")} 크레딧이 지급되었습니다.`,
          });
          toast.success("무통장입금 충전 완료", {
            description: `${order.creditAmount.toLocaleString("ko-KR")} 크레딧이 지급되었습니다.`,
          });
        }
      }
    }
    const nextMap = new Map<string, string>();
    for (const order of bankOrders) nextMap.set(order.id, order.status);
    prevBankStatusRef.current = nextMap;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topUps]);


  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const paymentId = params.get("paymentId") ?? params.get("merchant_uid");
    const paymentFailed =
      params.get("imp_success") === "false" || params.get("success") === "false";
    if (paymentId && !paymentFailed) {
      void completePayment(paymentId);
    } else if (paymentFailed) {
      setPaymentMessage({
        type: "error",
        text:
          params.get("error_msg") ??
          params.get("message") ??
          "결제가 완료되지 않았습니다.",
      });
      clearCreditPaymentReturnParams();
      void fetchTopUps();
    }
    const billingKey = params.get("billingKey");
    if (billingKey) {
      void registerSubscriptionBilling(billingKey, params.get("issueId"));
    }
  }, [completePayment, fetchTopUps, registerSubscriptionBilling]);

  // Re-fetch when page or filterType changes (skip initial)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    fetchTransactions();
  }, [page, filterType, fetchTransactions]);

  // 충전 요청 페이지 변경 시 재조회 (초기 로드 제외)
  useEffect(() => {
    if (isFirstTopUpRender.current) {
      isFirstTopUpRender.current = false;
      return;
    }
    fetchTopUps();
  }, [topUpPage, fetchTopUps]);

  const costEntries = Object.entries(CREDIT_COSTS) as [OperationType, number][];

  const totalPages = Math.ceil(totalTx / pageSize);
  const topUpTotalPages = Math.ceil(topUpTotal / topUpPageSize);
  const usagePercent = summary
    ? summary.monthlyAllocation > 0
      ? Math.round(
          ((summary.monthlyAllocation - summary.balance + summary.bonusCredits) /
            summary.monthlyAllocation) *
            100,
        )
      : 0
    : 0;

  return {
    bankDepositCompleted,
    bankDepositGuide,
    cancelSubscriptionBilling,
    cardEnabled,
    clearBankDepositGuide: () => {
      setBankDepositGuide(null);
      setBankDepositCompleted(false);
    },
    confirmSelectedTopUp,
    costEntries,
    depositorName,
    easyPayProvider,
    filterType,
    markBankDepositPaid,
    openBankGuideForTopUp,
    loading,
    page,
    pageSize,
    payMethod,
    payingCredits,
    paymentMessage,
    clearPaymentMessage: () => setPaymentMessage(null),
    refreshAllCreditData,
    selectedProduct,
    heldCoupons,
    selectedCouponId,
    setSelectedCouponId,
    setDepositorName,
    setEasyPayProvider,
    setFilterType,
    setPage,
    setPayMethod,
    setSelectedProduct,
    setSubscriptionConsent,
    startSubscriptionBilling,
    startTopUp,
    subscriptionBilling,
    subscriptionBusy,
    subscriptionConsent,
    subscriptionMessage,
    summary,
    topUpPage,
    topUpPageSize,
    topUpProducts,
    topUps,
    topUpTotal,
    topUpTotalPages,
    setTopUpPage,
    totalPages,
    totalTx,
    transactions,
    txLoading,
    usagePercent,
  };
}
