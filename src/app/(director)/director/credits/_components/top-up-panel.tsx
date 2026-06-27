"use client";

import { OPERATION_LABELS } from "@/lib/credit-costs";
import type { OperationType } from "@/lib/credit-costs";
import { cn } from "@/lib/utils";
import { CreditCard, Landmark, ReceiptText, Smartphone, WalletCards } from "lucide-react";
import Link from "next/link";
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
}

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
  | "MOBILE";

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

export const VISIBLE_PAY_METHOD_OPTIONS = PAY_METHOD_OPTIONS.filter((option) =>
  VISIBLE_TOP_UP_PAY_METHODS.includes(option.value),
);

const TOP_UP_GRANT_TEXT = VISIBLE_TOP_UP_PAY_METHODS.includes("VIRTUAL_ACCOUNT")
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

export function TopUpPanel({
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

export function TopUpHistory({ topUps }: { topUps: CreditTopUp[] }) {
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
