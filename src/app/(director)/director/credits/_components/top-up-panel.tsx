"use client";

import { OPERATION_LABELS } from "@/lib/credit-costs";
import type { OperationType } from "@/lib/credit-costs";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Banknote, Check, CheckCircle2, Clock, Coins, Copy, CreditCard, Flame, Landmark, MessageSquare, ReceiptText, Sparkles, Smartphone, WalletCards } from "lucide-react";
import { OPERATION_COLORS, OPERATION_ICONS } from "./credit-overview";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ComingSoonOverlay } from "./shared";

export interface CreditTopUp {
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
  depositorName?: string | null;
  confirmStartedAt?: string | null;
}

/** 주문 id에서 표시용 주문번호(끝 8자리, 대문자)를 만든다. */
export function formatOrderNo(id: string): string {
  return id.slice(-8).toUpperCase();
}

/** 문의 게시판 새 글(결제·환불) 작성 화면으로 진입하는 딥링크. 값이 있을 때만 채운다. */
function buildSupportComposeHref(
  params: { category?: string; title?: string; content?: string } = {},
): string {
  const sp = new URLSearchParams({ compose: "1" });
  if (params.category) sp.set("category", params.category);
  if (params.title) sp.set("title", params.title);
  if (params.content) sp.set("content", params.content);
  return `/director/help/support?${sp.toString()}`;
}

/** 무통장입금 안내 "문의하기" → 문의 게시판 새 글(결제·환불)로 주문번호를 채워 진입. */
function buildBankInquiryHref(orderNo: string): string {
  return buildSupportComposeHref({
    category: "BILLING",
    title: `주문번호 ${orderNo} 결제 건에 대한 문의`,
    content: `주문번호 ${orderNo} 결제 건에 대하여 문의 드립니다.\n\n`,
  });
}

export const BANK_DEPOSIT_ACCOUNT = {
  bankName: process.env.NEXT_PUBLIC_BANK_DEPOSIT_BANK_NAME ?? "",
  accountNumber: process.env.NEXT_PUBLIC_BANK_DEPOSIT_ACCOUNT_NUMBER ?? "",
  accountHolder: process.env.NEXT_PUBLIC_BANK_DEPOSIT_ACCOUNT_HOLDER ?? "",
};

export interface CreditTopUpProduct {
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

export type TopUpPayMethod =
  | "CARD"
  | "EASY_PAY"
  | "TRANSFER"
  | "VIRTUAL_ACCOUNT"
  | "MOBILE"
  | "BANK_TRANSFER";

export interface BankDepositGuideData {
  topUpId: string;
  amount: number;
  creditAmount: number;
  depositorName: string;
  account: {
    bankName: string;
    accountNumber: string;
    accountHolder: string;
  };
  windowMinutes: number;
  expiresAt: number;
  confirmStartedAt: string | null;
}

export type EasyPayProvider = "KAKAOPAY" | "NAVERPAY" | "TOSSPAY" | "PAYCO";

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

const VISIBLE_TOP_UP_PAY_METHODS = getVisibleTopUpPayMethods();

export const BANK_DEPOSIT_ENABLED =
  process.env.NEXT_PUBLIC_BANK_DEPOSIT_ENABLED === "true";

const BANK_DEPOSIT_OPTION = {
  value: "BANK_TRANSFER" as const,
  label: "무통장입금",
  icon: Banknote,
};

export const VISIBLE_PAY_METHOD_OPTIONS = [
  ...PAY_METHOD_OPTIONS.filter((option) =>
    VISIBLE_TOP_UP_PAY_METHODS.includes(option.value),
  ),
  ...(BANK_DEPOSIT_ENABLED ? [BANK_DEPOSIT_OPTION] : []),
];

const TOP_UP_GRANT_TEXT = BANK_DEPOSIT_ENABLED
  ? "결제 승인 또는 무통장입금 확인 후 잔고에 즉시 지급됩니다."
  : VISIBLE_TOP_UP_PAY_METHODS.includes("VIRTUAL_ACCOUNT")
    ? "결제 승인 또는 가상계좌 입금 확인 후 잔고에 즉시 지급됩니다."
    : "신용카드 결제 승인 확인 후 잔고에 즉시 지급됩니다.";

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

const TOP_UP_METHOD_LABELS: Record<string, string> = {
  CARD: "카드",
  EASY_PAY: "간편결제",
  TRANSFER: "계좌이체",
  VIRTUAL_ACCOUNT: "가상계좌",
  MOBILE: "휴대폰",
  BANK_TRANSFER: "무통장입금",
};

const TOP_UP_METHOD_STYLES: Record<string, string> = {
  BANK_TRANSFER: "bg-sky-50 text-sky-700",
};

export const BANK_DEPOSIT_WINDOW_MINUTES = (() => {
  const raw = Number(process.env.NEXT_PUBLIC_BANK_DEPOSIT_MATCH_WINDOW_MINUTES);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 30;
})();

// "입금 완료"를 누른 시각(=입금 확인 시작)은 서버(주문 customData.confirmStartedAt)에
// 저장된다. 이 시각으로부터 30분 동안을 "입금 확인중", 지나면 "입금 확인 실패"로 표시.
const CONFIRM_WINDOW_MS = 30 * 60_000;

export function parseConfirmStartedAt(
  value: string | null | undefined,
): number | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// 무통장입금 입금 대기 주문이 시간창을 넘기면 더이상 자동매칭되지 않으므로
// "시간 초과"로 표시한다(상태 자체는 DB에서 WAITING_FOR_DEPOSIT 유지).
function getTopUpDisplayStatus(topUp: CreditTopUp): {
  label: string;
  style: string;
} {
  const expired =
    topUp.paymentMethod === "BANK_TRANSFER" &&
    topUp.status === "WAITING_FOR_DEPOSIT" &&
    Date.now() - new Date(topUp.createdAt).getTime() >
      BANK_DEPOSIT_WINDOW_MINUTES * 60_000;
  if (expired) {
    return { label: "시간 초과", style: "bg-gray-100 text-gray-500" };
  }
  return {
    label: TOP_UP_STATUS_LABELS[topUp.status] ?? topUp.status,
    style: TOP_UP_STATUS_STYLES[topUp.status] ?? "bg-gray-100 text-gray-600",
  };
}

interface ProductDeal {
  listPrice: number;
  saveAmount: number;
  offRate: number;
  isBestDeal: boolean;
}

// 묶음(볼륨) 할인 계산: 가장 1C 단가가 비싼 팩(스타터)을 "정가" 기준으로 삼아
// 각 팩이 그 기준가 대비 얼마나 저렴한지를 마케팅용 할인율로 환산한다.
// product.price 는 프로모션이 적용된 실제 결제가이므로 프로모션 할인도 함께 반영된다.
function computeProductDeals(
  products: CreditTopUpProduct[],
): Map<string, ProductDeal> {
  const baselinePerCredit = products.reduce(
    (max, p) =>
      p.creditAmount > 0 ? Math.max(max, p.basePrice / p.creditAmount) : max,
    0,
  );

  const deals = products.map((product) => {
    const listPrice =
      baselinePerCredit > 0
        ? Math.round(product.creditAmount * baselinePerCredit)
        : product.basePrice;
    const saveAmount = Math.max(listPrice - product.price, 0);
    const offRate = listPrice > 0 ? Math.round((saveAmount / listPrice) * 100) : 0;
    return { product, listPrice, saveAmount, offRate };
  });

  const maxOff = deals.reduce((max, d) => Math.max(max, d.offRate), 0);

  return new Map(
    deals.map((d) => [
      d.product.id,
      {
        listPrice: d.listPrice,
        saveAmount: d.saveAmount,
        offRate: d.offRate,
        isBestDeal: maxOff > 0 && d.offRate === maxOff,
      } satisfies ProductDeal,
    ]),
  );
}

export function TopUpPanel({
  products,
  costEntries,
  payingCredits,
  onSelectProduct,
  disabled = false,
}: {
  products: CreditTopUpProduct[];
  costEntries: [OperationType, number][];
  payingCredits: number | null;
  onSelectProduct: (product: CreditTopUpProduct) => void;
  disabled?: boolean;
}) {
  const productDeals = computeProductDeals(products);

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
      <div className="px-5 py-4 border-b border-blue-50">
        <h2 className="text-[15px] font-semibold text-gray-900">크레딧 충전</h2>
        <p className="text-[12px] text-gray-400 mt-0.5">
          충전할 상품을 선택하면 결제 수단(카드·무통장입금)을 고를 수 있어요
        </p>
      </div>
      <div className="border-b border-blue-50 bg-slate-50/60 px-5 py-3">
        <div className="flex flex-col gap-3 text-[12px] leading-5 text-slate-500 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-1">
            <p className="font-semibold text-slate-700">SMOAT 크레딧</p>
            <p>
              문제 생성, 자동 출제, 학습지 생성, OCR, 해설 생성 등 SMOAT 내부 AI
              기능을 이용하기 위한 디지털 이용권입니다. 배송이 없는 상품이며{" "}
              {TOP_UP_GRANT_TEXT}
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
          const deal = productDeals.get(product.id)!;
          return (
            <button
              key={product.id}
              type="button"
              onClick={() => {
                if (!disabled) onSelectProduct(product);
              }}
              disabled={disabled || payingCredits !== null}
              className={cn(
                "group relative flex min-h-[128px] flex-col text-left px-5 py-4 transition hover:bg-blue-50/50 disabled:cursor-wait disabled:opacity-70",
                deal.isBestDeal && "bg-gradient-to-b from-rose-50/70 to-transparent",
              )}
            >
              {deal.isBestDeal && deal.offRate > 0 && (
                <span className="absolute right-3 top-3 inline-flex items-center gap-0.5 rounded-full bg-gradient-to-r from-rose-500 to-orange-500 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
                  <Sparkles className="size-2.5" strokeWidth={2.6} />
                  최대 할인
                </span>
              )}
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] font-semibold text-blue-600">
                  {product.name}
                </span>
                <span className="inline-flex rounded-md bg-blue-50 px-1.5 py-0.5 text-[11px] font-bold text-blue-600 tabular-nums">
                  {product.creditAmount.toLocaleString("ko-KR")}C
                </span>
              </div>
              <div className="mt-2 text-[11px] font-medium text-gray-500">
                자동출제 약{" "}
                {product.estimatedAutoQuestionCount.toLocaleString("ko-KR")}
                문항 · {product.perAutoQuestion.toLocaleString("ko-KR")}원/문항
              </div>

              {deal.offRate > 0 ? (
                <>
                  <div className="mt-3 flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-0.5 rounded-md bg-rose-100 px-1.5 py-0.5 text-[12px] font-extrabold tabular-nums text-rose-600">
                      <Flame className="size-3" strokeWidth={2.6} />
                      {deal.offRate}% OFF
                    </span>
                    <span className="text-[11px] font-bold text-rose-600 tabular-nums">
                      {deal.saveAmount.toLocaleString("ko-KR")}원 절약
                    </span>
                    {product.isPromotionActive && (
                      <span className="inline-flex rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                        {product.promotionName || "프로모션"} 적용
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 leading-tight tracking-tight tabular-nums">
                    <span className="whitespace-nowrap text-[24px] font-bold text-gray-400 line-through">
                      {deal.listPrice.toLocaleString("ko-KR")}원
                    </span>
                    <span className="whitespace-nowrap text-[24px] font-bold text-gray-950">
                      {product.price.toLocaleString("ko-KR")}원
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div className="mt-3 inline-flex w-fit rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                    기준 단가
                  </div>
                  <div className="mt-2 whitespace-nowrap text-[24px] font-bold leading-tight tracking-tight text-gray-950 tabular-nums">
                    {product.price.toLocaleString("ko-KR")}원
                  </div>
                  {product.isPromotionActive && (
                    <div className="mt-0.5 text-[11px] font-medium text-gray-400 line-through tabular-nums">
                      {product.basePrice.toLocaleString("ko-KR")}원
                    </div>
                  )}
                </>
              )}

              <div className="mt-auto pt-4">
                <div
                  className={cn(
                    "topup-cta-glow inline-flex h-11 w-full items-center justify-center rounded-xl bg-blue-600 px-4 text-[14px] font-bold text-white transition group-hover:bg-blue-700 group-hover:scale-[1.02]",
                    loading && "opacity-80",
                  )}
                >
                  {loading ? "결제 준비 중" : "충전하기"}
                </div>
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
        <div className="grid grid-cols-1 overflow-hidden rounded-xl border border-gray-100 sm:grid-cols-2 lg:grid-cols-3">
          {costEntries.map(([op, cost], idx) => {
            const OpIcon = OPERATION_ICONS[op] || Coins;
            const colors =
              OPERATION_COLORS[op] || { bg: "bg-gray-100", text: "text-gray-500" };
            return (
              <div
                key={op}
                className={cn(
                  "flex items-center justify-between px-4 py-3 transition-colors hover:bg-gray-50/60",
                  idx < costEntries.length - (costEntries.length % 3 || 3) &&
                    "border-b border-gray-50",
                  (idx + 1) % 3 !== 0 && "lg:border-r lg:border-gray-50",
                  (idx + 1) % 2 !== 0 && "sm:border-r sm:border-gray-50 lg:border-r-0",
                )}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-lg",
                      colors.bg,
                    )}
                  >
                    <OpIcon className={cn("size-3.5", colors.text)} strokeWidth={1.8} />
                  </div>
                  <span className="text-[13px] font-medium text-gray-700">
                    {OPERATION_LABELS[op] || op}
                  </span>
                </div>
                <span
                  className={cn(
                    "text-[13px] font-bold tabular-nums",
                    cost >= 5 ? "text-blue-600" : "text-gray-600",
                  )}
                >
                  {cost}C
                </span>
              </div>
            );
          })}
        </div>
      </div>
      </div>
    </div>
  );
}

export function TopUpMethodDialog({
  product,
  payMethod,
  onPayMethodChange,
  easyPayProvider,
  onEasyPayProviderChange,
  depositorName,
  onDepositorNameChange,
  payingCredits,
  cardEnabled,
  onConfirm,
  onClose,
}: {
  product: CreditTopUpProduct | null;
  payMethod: TopUpPayMethod;
  onPayMethodChange: (method: TopUpPayMethod) => void;
  easyPayProvider: EasyPayProvider;
  onEasyPayProviderChange: (provider: EasyPayProvider) => void;
  depositorName: string;
  onDepositorNameChange: (name: string) => void;
  payingCredits: number | null;
  cardEnabled: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const isBank = payMethod === "BANK_TRANSFER";
  const bankNeedsName = isBank && depositorName.trim().length === 0;
  const loading = payingCredits !== null;
  // 카드(PG) = BANK_TRANSFER 외 결제수단. 허용 계정이 아니면 비활성화한다.
  const payMethodDisabled = payMethod !== "BANK_TRANSFER" && !cardEnabled;

  // 카드가 비활성화된 계정에서 모달이 열리면 무통장입금으로 자동 선택.
  useEffect(() => {
    if (product && !cardEnabled && payMethod !== "BANK_TRANSFER") {
      onPayMethodChange("BANK_TRANSFER");
    }
  }, [product, cardEnabled, payMethod, onPayMethodChange]);

  return (
    <Dialog
      open={product !== null}
      onOpenChange={(open) => {
        if (!open && !loading) onClose();
      }}
    >
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>결제 수단 선택</DialogTitle>
          <DialogDescription>
            {product
              ? `${product.name} · ${product.creditAmount.toLocaleString("ko-KR")}C · ${product.price.toLocaleString("ko-KR")}원`
              : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {VISIBLE_PAY_METHOD_OPTIONS.map((option) => {
              const Icon = option.icon;
              const active = payMethod === option.value;
              const optDisabled = option.value !== "BANK_TRANSFER" && !cardEnabled;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    if (optDisabled) {
                      toast.info(
                        "해당 기능은 현재 준비중입니다. 준비가 완료될 때까지 무통장입금을 사용해주세요.",
                      );
                      return;
                    }
                    onPayMethodChange(option.value);
                  }}
                  className={cn(
                    "inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border text-[13px] font-semibold transition",
                    optDisabled
                      ? "border-gray-100 bg-gray-50 text-gray-300 hover:bg-gray-100"
                      : active
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-gray-200 bg-white text-gray-500 hover:border-blue-200 hover:text-blue-600",
                  )}
                >
                  <Icon className="size-4" strokeWidth={2} />
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
                    onClick={() => onEasyPayProviderChange(option.value)}
                    className={cn(
                      "inline-flex h-8 items-center rounded-lg border px-2.5 text-[12px] font-semibold transition",
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

          {isBank && (
            <div className="space-y-1.5">
              <input
                type="text"
                value={depositorName}
                onChange={(e) => onDepositorNameChange(e.target.value)}
                maxLength={40}
                placeholder="입금자명 (예: 홍길동)"
                className="h-10 w-full rounded-xl border border-gray-200 px-3 text-[13px] font-medium text-gray-700 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-500/20"
              />
              <p className="text-[11px] font-medium text-red-500">
                입금자명을 정확하게 입력해주세요.
                <br />
                (입금자명으로 입금 내역이 확인됩니다.)
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 px-4 text-[13px] font-semibold text-gray-500 transition hover:bg-gray-50 disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            disabled={loading || bankNeedsName || payMethodDisabled}
            onClick={onConfirm}
            className="inline-flex h-10 items-center justify-center gap-1 rounded-xl bg-blue-600 px-4 text-[13px] font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "진행 중…" : isBank ? "다음으로" : "결제하기"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CopyField({
  label,
  value,
  suffix,
  className,
  singleLine = false,
}: {
  label: string;
  value: string;
  suffix?: string;
  className?: string;
  singleLine?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-2 rounded-lg bg-white px-3 py-2.5",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium text-gray-400">{label}</p>
        <p
          className={cn(
            "text-[14px] font-bold tabular-nums leading-snug text-gray-900",
            singleLine ? "whitespace-nowrap" : "break-all",
          )}
        >
          {value}
          {suffix && (
            <span className="ml-1.5 text-[12px] font-medium text-gray-400">
              ({suffix})
            </span>
          )}
        </p>
      </div>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
        className="mt-0.5 inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-gray-200 px-2 text-[11px] font-semibold text-gray-500 transition hover:border-blue-300 hover:text-blue-600"
      >
        {copied ? (
          <Check className="size-3" strokeWidth={2.4} />
        ) : (
          <Copy className="size-3" strokeWidth={2} />
        )}
        {copied ? "복사됨" : "복사"}
      </button>
    </div>
  );
}

function DepositCountdown({ expiresAt }: { expiresAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const leftMs = Math.max(expiresAt - now, 0);
  const expired = leftMs <= 0;
  const urgent = !expired && leftMs <= 5 * 60_000;
  const mm = Math.floor(leftMs / 60_000);
  const ss = Math.floor((leftMs % 60_000) / 1000);

  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-xl border px-3.5 py-2.5",
        expired
          ? "border-rose-200 bg-rose-50"
          : urgent
            ? "border-amber-200 bg-amber-50"
            : "border-sky-200 bg-sky-50",
      )}
    >
      <div className="flex items-center gap-2">
        <Clock
          className={cn(
            "size-4",
            expired ? "text-rose-500" : urgent ? "text-amber-500" : "text-sky-600",
          )}
          strokeWidth={2}
        />
        <span
          className={cn(
            "text-[12px] font-semibold",
            expired ? "text-rose-700" : urgent ? "text-amber-700" : "text-sky-700",
          )}
        >
          {expired ? "입금 가능 시간이 지났어요" : "입금 마감까지 남은 시간"}
        </span>
      </div>
      <span
        className={cn(
          "text-[18px] font-extrabold tabular-nums",
          expired ? "text-rose-600" : urgent ? "text-amber-600" : "text-sky-700",
        )}
      >
        {expired
          ? "00:00"
          : `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`}
      </span>
    </div>
  );
}

// 충전 요청 목록의 "입금 대기" 배지 — 남은 시간을 매초 표시하고, 지나면 "시간 초과".
export function WaitingDepositBadge({
  confirmStartedAt,
  expiresAt,
}: {
  confirmStartedAt: number | null;
  expiresAt: number;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // 사용자가 "입금 완료"를 누른 경우 → 입금 확인중(카운트업) / 입금 확인 실패
  const confirmAt = confirmStartedAt;
  if (confirmAt != null) {
    const elapsed = now - confirmAt;
    if (elapsed >= CONFIRM_WINDOW_MS) {
      return (
        <span className="inline-flex h-6 items-center rounded-md bg-rose-50 px-2 text-[11px] font-semibold text-rose-600">
          입금 확인 실패
        </span>
      );
    }
    const upMm = Math.floor(elapsed / 60_000);
    const upSs = Math.floor((elapsed % 60_000) / 1000);
    return (
      <span className="inline-flex h-6 items-center gap-1 rounded-md bg-indigo-50 px-2 text-[11px] font-semibold tabular-nums text-indigo-700">
        <Clock className="size-3" strokeWidth={2.2} />
        입금 확인중 {pad2(upMm)}:{pad2(upSs)}
      </span>
    );
  }

  // 입금 완료 미클릭 → 입금 대기 카운트다운 / 시간 초과
  const leftMs = Math.max(expiresAt - now, 0);
  if (leftMs <= 0) {
    return (
      <span className="inline-flex h-6 items-center rounded-md bg-gray-100 px-2 text-[11px] font-semibold text-gray-500">
        시간 초과
      </span>
    );
  }
  const mm = Math.floor(leftMs / 60_000);
  const ss = Math.floor((leftMs % 60_000) / 1000);
  const urgent = leftMs <= 5 * 60_000;
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-md px-2 text-[11px] font-semibold tabular-nums",
        urgent ? "bg-amber-50 text-amber-700" : "bg-sky-50 text-sky-700",
      )}
    >
      <Clock className="size-3" strokeWidth={2.2} />
      입금 대기 {pad2(mm)}:{pad2(ss)}
    </span>
  );
}

export function BankDepositGuide({
  guide,
  completed,
  onMarkPaid,
  onClose,
}: {
  guide: BankDepositGuideData;
  completed: boolean;
  onMarkPaid: () => void;
  onClose: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // 입금 확인 시작 시각은 서버(guide.confirmStartedAt)에서 오며, "입금 완료" 클릭 시
  // 낙관적으로 즉시 반영한다. guide.topUpId 변경 시 부모가 key로 리마운트한다.
  const [confirmStartedAt, setConfirmStartedAt] = useState<number | null>(() =>
    parseConfirmStartedAt(guide.confirmStartedAt),
  );

  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  const orderNo = formatOrderNo(guide.topUpId);
  const elapsed = confirmStartedAt != null ? now - confirmStartedAt : 0;
  const confirming =
    !completed && confirmStartedAt != null && elapsed < CONFIRM_WINDOW_MS;
  const failed =
    !completed && confirmStartedAt != null && elapsed >= CONFIRM_WINDOW_MS;
  const waiting = !completed && confirmStartedAt == null;

  const handleMarkPaid = () => {
    setConfirmStartedAt((prev) => prev ?? Date.now()); // 낙관적 반영
    onMarkPaid();
    setShowCloseConfirm(false);
  };

  // X·바깥클릭·ESC로 닫으려 할 때: 아직 "입금 완료"를 안 눌렀으면 확인창.
  const requestClose = () => {
    if (waiting) setShowCloseConfirm(true);
    else onClose();
  };

  const upMm = Math.floor(Math.min(elapsed, CONFIRM_WINDOW_MS) / 60_000);
  const upSs = Math.floor((Math.min(elapsed, CONFIRM_WINDOW_MS) % 60_000) / 1000);

  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) requestClose();
        }}
      >
        <DialogContent className="sm:max-w-[560px]">
          {completed ? (
            <div className="flex flex-col items-center py-3 text-center">
              <div className="flex size-14 items-center justify-center rounded-full bg-emerald-100">
                <CheckCircle2
                  className="size-8 text-emerald-600"
                  strokeWidth={2}
                />
              </div>
              <DialogTitle className="mt-4 text-[18px] text-emerald-700">
                충전이 완료되었습니다!
              </DialogTitle>
              <DialogDescription className="mt-1">
                {guide.creditAmount.toLocaleString("ko-KR")} 크레딧이 잔고에
                지급되었습니다.
              </DialogDescription>
              <p className="mt-1 text-[11px] font-medium text-gray-400">
                주문번호 {orderNo}
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-5 inline-flex h-10 w-full items-center justify-center rounded-xl bg-emerald-600 px-4 text-[13px] font-semibold text-white transition hover:bg-emerald-700"
              >
                닫기
              </button>
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-1.5">
                  <Banknote className="size-4 text-sky-600" strokeWidth={2} />
                  무통장입금 안내
                </DialogTitle>
                <DialogDescription>
                  아래 계좌로 <b>정확한 금액</b>을 입금하시면 확인 즉시 자동으로
                  크레딧이 지급됩니다.
                </DialogDescription>
              </DialogHeader>

              <p className="-mt-1 text-[11px] font-medium text-gray-400">
                주문번호 {orderNo}
              </p>

              {failed ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5">
                  <p className="text-[13px] font-bold text-rose-700">
                    입금 확인 실패
                  </p>
                  <p className="mt-0.5 text-[12px] font-semibold text-rose-600">
                    입금 확인이 되지 않았습니다. 관리자에게 문의하세요.
                  </p>
                </div>
              ) : confirming ? (
                <div className="flex items-center justify-between rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2.5">
                  <div className="flex items-center gap-2">
                    <Clock
                      className="size-4 text-indigo-600"
                      strokeWidth={2}
                    />
                    <span className="text-[12px] font-semibold text-indigo-700">
                      입금 확인중 · 경과 시간
                    </span>
                  </div>
                  <span className="text-[18px] font-extrabold tabular-nums text-indigo-700">
                    {pad2(upMm)}:{pad2(upSs)}
                  </span>
                </div>
              ) : (
                <DepositCountdown expiresAt={guide.expiresAt} />
              )}

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <CopyField
                  label="입금 계좌"
                  value={`${guide.account.bankName} ${guide.account.accountNumber}`}
                  suffix={guide.account.accountHolder}
                  className="sm:col-span-2"
                  singleLine
                />
                <CopyField
                  label="입금 금액"
                  value={`${guide.amount.toLocaleString("ko-KR")}원`}
                />
                <CopyField label="입금자명" value={guide.depositorName} />
              </div>

              {!failed && (
                <div className="space-y-1 text-[12px] text-sky-800">
                  <p>
                    · 충전 크레딧:{" "}
                    <b>{guide.creditAmount.toLocaleString("ko-KR")}C</b>
                  </p>
                  {confirming ? (
                    <p>
                      · 입금을 확인하고 있어요. 확인되면 이 창에서 바로 완료
                      안내가 표시됩니다.
                    </p>
                  ) : (
                    <>
                      <p>
                        · 입력하신 <b>입금자명</b>과 <b>금액</b>이 정확히 일치해야
                        자동 확인됩니다.
                      </p>
                      <p>
                        · 입금하셨다면 아래 <b>입금 완료</b> 버튼을 눌러주세요.
                        자동 확인이 시작됩니다.
                      </p>
                      <p className="text-sky-600">
                        · 위 타이머({guide.windowMinutes}분) 안에 입금해주세요.
                        시간이 지나거나 금액이 다르면 자동 확인이 지연되어 관리자
                        확인이 필요할 수 있습니다.
                      </p>
                    </>
                  )}
                </div>
              )}

              <DialogFooter className="sm:justify-between">
                <Link
                  href={buildBankInquiryHref(orderNo)}
                  className={cn(
                    "inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border px-4 text-[13px] font-semibold transition",
                    failed
                      ? "animate-red-glow border-rose-500 bg-rose-600 text-white hover:bg-rose-700"
                      : "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100",
                  )}
                >
                  <MessageSquare className="size-3.5" strokeWidth={2} />
                  문의하기
                </Link>
                {waiting ? (
                  <button
                    type="button"
                    onClick={handleMarkPaid}
                    className="inline-flex h-10 items-center justify-center rounded-xl bg-blue-600 px-4 text-[13px] font-semibold text-white transition hover:bg-blue-700"
                  >
                    입금 완료
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onClose}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 px-4 text-[13px] font-semibold text-gray-500 transition hover:bg-gray-50"
                  >
                    닫기
                  </button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* "입금 완료" 미클릭 상태에서 닫으려 할 때 확인창 */}
      <Dialog
        open={showCloseConfirm}
        onOpenChange={(open) => {
          if (!open) setShowCloseConfirm(false);
        }}
      >
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>입금 완료를 누르지 않으셨습니다</DialogTitle>
            <DialogDescription>
              아직 입금 완료를 누르지 않으셨습니다. 그래도 닫으시겠습니까?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <button
              type="button"
              onClick={() => setShowCloseConfirm(false)}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 px-4 text-[13px] font-semibold text-gray-500 transition hover:bg-gray-50"
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCloseConfirm(false);
                onClose();
              }}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 px-4 text-[13px] font-semibold text-gray-600 transition hover:bg-gray-50"
            >
              닫기
            </button>
            <button
              type="button"
              onClick={handleMarkPaid}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-blue-600 px-4 text-[13px] font-semibold text-white transition hover:bg-blue-700"
            >
              입금 완료
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function TopUpHistory({
  topUps,
  onSelectTopUp,
  page = 0,
  pageSize = 8,
  total = 0,
  totalPages = 0,
  onPageChange,
}: {
  topUps: CreditTopUp[];
  onSelectTopUp?: (topUp: CreditTopUp) => void;
  page?: number;
  pageSize?: number;
  total?: number;
  totalPages?: number;
  onPageChange?: (updater: (p: number) => number) => void;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[14px] font-semibold text-gray-800">
            충전 요청
          </h2>
          <p className="text-[12px] text-gray-400 mt-0.5">
            결제 요청 상태 · 무통장입금 건은 클릭하면 입금 안내가 열려요
          </p>
        </div>
        <Link
          href={buildSupportComposeHref({ category: "BILLING" })}
          className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 text-[12px] font-semibold text-blue-700 transition hover:bg-blue-100"
        >
          <MessageSquare className="size-3.5" strokeWidth={2} />
          문의하기
        </Link>
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
                <th className="px-5 py-2.5">주문번호</th>
                <th className="px-4 py-2.5">일시</th>
                <th className="px-4 py-2.5">결제수단</th>
                <th className="px-4 py-2.5">상태</th>
                <th className="px-4 py-2.5 text-right">결제금액</th>
                <th className="px-4 py-2.5 text-right">크레딧</th>
                <th className="px-5 py-2.5">영수증</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {topUps.map((topUp) => {
                const displayStatus = getTopUpDisplayStatus(topUp);
                const clickable =
                  topUp.paymentMethod === "BANK_TRANSFER" && !!onSelectTopUp;
                return (
                <tr
                  key={topUp.id}
                  onClick={clickable ? () => onSelectTopUp?.(topUp) : undefined}
                  className={cn(
                    "transition",
                    clickable
                      ? "cursor-pointer hover:bg-sky-50/70"
                      : "hover:bg-gray-50/60",
                  )}
                >
                  <td className="px-5 py-3 text-[12px] font-medium tabular-nums text-gray-600 whitespace-nowrap">
                    {formatOrderNo(topUp.id)}
                  </td>
                  <td className="px-4 py-3 text-[12px] text-gray-500 whitespace-nowrap">
                    {new Date(topUp.createdAt).toLocaleDateString("ko-KR", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-3">
                    {topUp.paymentMethod ? (
                      <span
                        className={cn(
                          "inline-flex h-6 items-center rounded-md px-2 text-[11px] font-semibold",
                          TOP_UP_METHOD_STYLES[topUp.paymentMethod] ??
                            "bg-gray-100 text-gray-600",
                        )}
                      >
                        {TOP_UP_METHOD_LABELS[topUp.paymentMethod] ??
                          topUp.paymentMethod}
                      </span>
                    ) : (
                      <span className="text-[12px] text-gray-300">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {topUp.paymentMethod === "BANK_TRANSFER" &&
                    topUp.status === "WAITING_FOR_DEPOSIT" ? (
                      <WaitingDepositBadge
                        confirmStartedAt={parseConfirmStartedAt(
                          topUp.confirmStartedAt,
                        )}
                        expiresAt={
                          new Date(topUp.createdAt).getTime() +
                          BANK_DEPOSIT_WINDOW_MINUTES * 60_000
                        }
                      />
                    ) : (
                      <span
                        className={cn(
                          "inline-flex h-6 items-center rounded-md px-2 text-[11px] font-semibold",
                          displayStatus.style,
                        )}
                      >
                        {displayStatus.label}
                      </span>
                    )}
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
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {onPageChange && totalPages > 1 && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
          <span className="text-[12px] text-gray-400">
            {page * pageSize + 1}-{Math.min((page + 1) * pageSize, total)} /{" "}
            {total}건
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onPageChange((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="h-7 px-2.5 text-[12px] font-medium text-gray-500 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              이전
            </button>
            <button
              onClick={() => onPageChange((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="h-7 px-2.5 text-[12px] font-medium text-gray-500 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              다음
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
