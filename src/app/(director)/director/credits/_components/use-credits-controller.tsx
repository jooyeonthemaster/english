import { useCallback, useEffect, useRef, useState } from "react";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import type { OperationType } from "@/lib/credit-costs";
import PortOne from "@portone/browser-sdk/v2";
import { CREDIT_BETA_NOTICE_HIDE_UNTIL_KEY, ONE_DAY_MS } from "./beta-notice-dialog";
import type { CreditSummary, CreditTransaction } from "./credit-overview";
import { isDanalLegacyPaymentRequest, requestDanalLegacyPayment } from "./payment-sdk";
import { clearCreditPaymentReturnParams } from "./return-params";
import type { SubscriptionBillingOverview } from "./subscription-billing-panel";
import { VISIBLE_PAY_METHOD_OPTIONS } from "./top-up-panel";
import type { CreditTopUp, CreditTopUpProduct, EasyPayProvider, TopUpPayMethod } from "./top-up-panel";

export function useCreditsController() {
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
  const [showBetaNotice, setShowBetaNotice] = useState(false);
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
        clearCreditPaymentReturnParams();
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
    const hiddenUntil = Number(
      window.localStorage.getItem(CREDIT_BETA_NOTICE_HIDE_UNTIL_KEY),
    );
    if (!Number.isFinite(hiddenUntil) || hiddenUntil <= Date.now()) {
      setShowBetaNotice(true);
    }
  }, []);

  const closeBetaNotice = useCallback(() => {
    setShowBetaNotice(false);
  }, []);

  const hideBetaNoticeForDay = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        CREDIT_BETA_NOTICE_HIDE_UNTIL_KEY,
        String(Date.now() + ONE_DAY_MS),
      );
    }
    setShowBetaNotice(false);
  }, []);

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

  const costEntries = Object.entries(CREDIT_COSTS) as [OperationType, number][];

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

  return {
    cancelSubscriptionBilling,
    closeBetaNotice,
    costEntries,
    easyPayProvider,
    filterType,
    hideBetaNoticeForDay,
    loading,
    page,
    pageSize,
    payMethod,
    payingCredits,
    paymentMessage,
    refreshAllCreditData,
    setEasyPayProvider,
    setFilterType,
    setPage,
    setPayMethod,
    setSubscriptionConsent,
    showBetaNotice,
    startSubscriptionBilling,
    startTopUp,
    subscriptionBilling,
    subscriptionBusy,
    subscriptionConsent,
    subscriptionMessage,
    summary,
    topUpProducts,
    topUps,
    totalPages,
    totalTx,
    transactions,
    txLoading,
    usagePercent,
  };
}
