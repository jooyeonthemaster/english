"use client";

import { OPERATION_LABELS } from "@/lib/credit-costs";
import type { OperationType } from "@/lib/credit-costs";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { cn } from "@/lib/utils";
import { AlertCircle, ArrowDownRight, ArrowUpRight, Calendar, CheckCircle2, Coins, Filter, Gift, RefreshCw } from "lucide-react";
import { CreditBetaNoticeDialog } from "./_components/beta-notice-dialog";
import { FILTER_OPTIONS, OPERATION_COLORS, OPERATION_ICONS, OverviewCard, TYPE_LABELS } from "./_components/credit-overview";
import type { DanalLegacyPaymentParams, DanalLegacyPaymentResponse } from "./_components/payment-sdk";
import { SubscriptionBillingPanel } from "./_components/subscription-billing-panel";
import { BankDepositGuide, TopUpHistory, TopUpPanel } from "./_components/top-up-panel";
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

export default function CreditsPage() {
  const {
    bankDepositGuide,
    cancelSubscriptionBilling,
    clearBankDepositGuide,
    closeBetaNotice,
    costEntries,
    depositorName,
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
    setDepositorName,
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
      <CreditBetaNoticeDialog
        open={showBetaNotice}
        onClose={closeBetaNotice}
        onHideForDay={hideBetaNoticeForDay}
      />
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
        depositorName={depositorName}
        onDepositorNameChange={setDepositorName}
        payingCredits={payingCredits}
        onStartTopUp={startTopUp}
        disabled={!FEATURE_FLAGS.SHOW_CREDIT_TOP_UP}
      />

      {bankDepositGuide && (
        <BankDepositGuide
          guide={bankDepositGuide}
          onClose={clearBankDepositGuide}
        />
      )}

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
    </>
  );
}

// ─── Overview Card (compact) ────────────────────────────────────────────────
