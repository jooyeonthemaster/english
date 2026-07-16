"use client";

import { useEffect, useState } from "react";
import { OPERATION_LABELS } from "@/lib/credit-costs";
import type { OperationType } from "@/lib/credit-costs";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { cn } from "@/lib/utils";
import { AlertCircle, ArrowDownRight, ArrowUpRight, CheckCircle2, Coins, Filter, Gift, RefreshCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FILTER_OPTIONS, OverviewCard, TYPE_LABELS } from "./_components/credit-overview";
import type { DanalLegacyPaymentParams, DanalLegacyPaymentResponse } from "./_components/payment-sdk";
import { SubscriptionBillingPanel } from "./_components/subscription-billing-panel";
import { BankDepositGuide, TopUpHistory, TopUpMethodDialog, TopUpPanel } from "./_components/top-up-panel";
import { CouponRegisterCard } from "./_components/coupon-register-card";
import { useCreditsController } from "./_components/use-credits-controller";

declare global {
  interface Window {
    IMP?: {
      init: (userCode: string) => void;
      request_pay: (
        params: DanalLegacyPaymentParams,
        callback: (response: DanalLegacyPaymentResponse) => void,
      ) => void;
    };
  }
}

// ─── Page Component ─────────────────────────────────────────────────────────

// 소멸시효까지 남은 시간을 초 단위로 실시간 표시.
function ExpiryCountdown({ expiresAt }: { expiresAt: string }) {
  const target = new Date(expiresAt).getTime();
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // 마운트 전에는 서버/클라이언트 시간 차로 인한 hydration 불일치를 피한다.
  if (now === null) {
    return (
      <span className="font-semibold text-white tabular-nums">계산 중…</span>
    );
  }

  const diff = target - now;
  if (diff <= 0) {
    return <span className="font-semibold text-white tabular-nums">소멸됨</span>;
  }

  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <span className="font-semibold text-white tabular-nums">
      {days}일 {pad(hours)}시간 {pad(minutes)}분 {pad(seconds)}초
    </span>
  );
}

// 프로모션 링크로 진입했을 때(?promo=applied|expired) 상단에 뜨는 안내 배너.
// 클라이언트에서 쿼리를 읽고 즉시 URL에서 제거해 새로고침 시 재노출을 막는다.
function PromoNotice() {
  const [promo, setPromo] = useState<"applied" | "expired" | null>(null);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("promo");
    if (p === "applied" || p === "expired") {
      setPromo(p);
      const url = new URL(window.location.href);
      url.searchParams.delete("promo");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  if (!promo) return null;
  const expired = promo === "expired";
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3 rounded-xl border px-4 py-3",
        expired
          ? "border-amber-200 bg-amber-50"
          : "border-emerald-200 bg-emerald-50",
      )}
    >
      <div className="flex items-start gap-2">
        {expired ? (
          <AlertCircle
            className="mt-0.5 size-4 shrink-0 text-amber-600"
            strokeWidth={2}
          />
        ) : (
          <CheckCircle2
            className="mt-0.5 size-4 shrink-0 text-emerald-600"
            strokeWidth={2}
          />
        )}
        <p
          className={cn(
            "text-[13px] leading-5",
            expired ? "text-amber-800" : "text-emerald-800",
          )}
        >
          {expired ? (
            <>
              기간이 지난 프로모션입니다. 기본 크레딧 관리 페이지로 이동했어요.
            </>
          ) : (
            <>
              프로모션이 적용되었어요! 아래 충전 상품에서 혜택가·보너스 크레딧을
              확인하고 충전하세요.
            </>
          )}
        </p>
      </div>
      <button
        type="button"
        onClick={() => setPromo(null)}
        className={cn(
          "shrink-0 text-[12px] font-medium transition-colors",
          expired
            ? "text-amber-600 hover:text-amber-800"
            : "text-emerald-600 hover:text-emerald-800",
        )}
      >
        닫기
      </button>
    </div>
  );
}

export default function CreditsPage() {
  const {
    bankDepositCompleted,
    bankDepositGuide,
    cancelSubscriptionBilling,
    clearBankDepositGuide,
    confirmSelectedTopUp,
    costEntries,
    markBankDepositPaid,
    depositorName,
    easyPayProvider,
    filterType,
    loading,
    openBankGuideForTopUp,
    page,
    pageSize,
    payMethod,
    payingCredits,
    paymentMessage,
    clearPaymentMessage,
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
  } = useCreditsController();

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

  return (
    <>
      <div className="space-y-5 -mx-1">
      <PromoNotice />
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

      <CouponRegisterCard onRegistered={refreshAllCreditData} />

      <TopUpPanel
        products={topUpProducts}
        costEntries={costEntries}
        payingCredits={payingCredits}
        onSelectProduct={setSelectedProduct}
        disabled={!FEATURE_FLAGS.SHOW_CREDIT_TOP_UP}
      />

      <TopUpMethodDialog
        product={selectedProduct}
        payMethod={payMethod}
        onPayMethodChange={setPayMethod}
        easyPayProvider={easyPayProvider}
        onEasyPayProviderChange={setEasyPayProvider}
        depositorName={depositorName}
        onDepositorNameChange={setDepositorName}
        payingCredits={payingCredits}
        heldCoupons={heldCoupons}
        selectedCouponId={selectedCouponId}
        onSelectCoupon={setSelectedCouponId}
        onConfirm={confirmSelectedTopUp}
        onClose={() => setSelectedProduct(null)}
      />

      {bankDepositGuide && (
        <BankDepositGuide
          key={bankDepositGuide.topUpId}
          guide={bankDepositGuide}
          completed={bankDepositCompleted}
          onMarkPaid={() => markBankDepositPaid(bankDepositGuide.topUpId)}
          onClose={clearBankDepositGuide}
        />
      )}

      {/* 오류는 팝업으로(사용자가 직접 닫음), 진행/완료 안내는 인라인 배너로 */}
      {paymentMessage && paymentMessage.type !== "error" && (
        <div
          className={cn(
            "flex items-center gap-2 rounded-xl border px-4 py-3 text-[13px] font-medium",
            paymentMessage.type === "success" &&
              "border-emerald-100 bg-emerald-50 text-emerald-700",
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

      <Dialog
        open={paymentMessage?.type === "error"}
        onOpenChange={(open) => {
          if (!open) clearPaymentMessage();
        }}
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-1.5 text-red-600">
              <AlertCircle className="size-4" strokeWidth={2} />
              안내
            </DialogTitle>
            <DialogDescription className="pt-1 text-[13px] leading-6 text-gray-600">
              {paymentMessage?.type === "error" ? paymentMessage.text : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={clearPaymentMessage}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-blue-600 px-4 text-[13px] font-semibold text-white transition hover:bg-blue-700"
            >
              확인
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Overview cards — 2x2 grid with usage bar */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
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
              {/* 누적 사용 크레딧 */}
              <div className="mt-4 flex items-baseline justify-between text-[12px] text-blue-200">
                <span>총 사용량</span>
                <span className="font-semibold text-white tabular-nums">
                  {summary.totalConsumed.toLocaleString()} 크레딧
                </span>
              </div>
              {/* 크레딧 소멸 예정일 + 실시간 카운트다운 */}
              {summary.balance > 0 && summary.expiresAt && (
                <div className="mt-3 border-t border-white/15 pt-3">
                  <div className="flex items-baseline justify-between text-[12px] text-blue-200">
                    <span>소멸 예정일</span>
                    <span className="font-semibold text-white tabular-nums">
                      {new Date(summary.expiresAt).toLocaleDateString("ko-KR")}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-baseline justify-between text-[12px] text-blue-200">
                    <span>소멸까지</span>
                    <ExpiryCountdown expiresAt={summary.expiresAt} />
                  </div>
                </div>
              )}
            </div>
          </div>

          <OverviewCard
            label="보너스"
            value={summary.bonusCredits}
            icon={Gift}
            accent="indigo"
          />
        </div>
      )}

      <TopUpHistory
        topUps={topUps}
        onSelectTopUp={openBankGuideForTopUp}
        page={topUpPage}
        pageSize={topUpPageSize}
        total={topUpTotal}
        totalPages={topUpTotalPages}
        onPageChange={setTopUpPage}
      />

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
                    <th className="px-4 py-2.5 whitespace-nowrap">일시</th>
                    <th className="px-3 py-2.5 whitespace-nowrap">유형</th>
                    <th className="px-3 py-2.5">기능</th>
                    <th className="px-4 py-2.5 text-right whitespace-nowrap">금액</th>
                    <th className="px-5 py-2.5 text-right whitespace-nowrap">잔액</th>
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
                        <td className="px-4 py-3 text-[12px] text-gray-500 tabular-nums whitespace-nowrap leading-tight">
                          <div>
                            {new Date(tx.createdAt).toLocaleDateString(
                              "ko-KR",
                              { month: "short", day: "numeric" },
                            )}
                          </div>
                          <div className="text-gray-400">
                            {new Date(tx.createdAt).toLocaleTimeString(
                              "ko-KR",
                              {
                                hour: "2-digit",
                                minute: "2-digit",
                                hour12: false,
                              },
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span
                            className={cn(
                              "inline-flex items-center h-[20px] px-2 text-[10px] font-semibold rounded-md whitespace-nowrap",
                              isPositive
                                ? "text-emerald-600 bg-emerald-500/[0.08]"
                                : "text-red-500 bg-red-500/[0.08]",
                            )}
                          >
                            {TYPE_LABELS[tx.type] || tx.type}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-[12px] text-gray-600">
                          {/* 알려진 AI 작업은 매핑 라벨, 그 외에는 사람이 읽을 수 있는
                              description(예: "실물쿠폰 …") 우선, 그마저 없으면 원문. */}
                          {(tx.operationType &&
                            OPERATION_LABELS[
                              tx.operationType as OperationType
                            ]) ||
                            tx.description ||
                            tx.operationType ||
                            "-"}
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
    </>
  );
}

// ─── Overview Card (compact) ────────────────────────────────────────────────
