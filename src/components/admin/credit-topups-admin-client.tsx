"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Clock3,
  Coins,
  CreditCard,
  ExternalLink,
  Percent,
  RefreshCw,
  Radio,
  RotateCcw,
  ShieldCheck,
  Undo2,
  X,
  XCircle,
} from "lucide-react";
import {
  updateCreditTopUpProduct,
  type CreditProductUpdateData,
} from "@/actions/admin/credit-products";
import { cn } from "@/lib/utils";
import { SaveButton } from "@/components/ui/save-button";

type AdminTopUp = {
  id: string;
  academyId: string;
  creditAmount: number;
  price: number;
  paymentMethod: string | null;
  paymentReference: string | null;
  paymentId: string | null;
  orderName: string | null;
  storeId?: string | null;
  channelKey?: string | null;
  currency?: string;
  portoneStatus: string | null;
  portoneTransactionId: string | null;
  paidAmount: number | null;
  receiptUrl: string | null;
  failureCode?: string | null;
  failureMessage: string | null;
  status: string;
  completedAt: Date | string | null;
  verifiedAt?: Date | string | null;
  paidAt: Date | string | null;
  cancelledAt?: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  customData?: unknown;
  academy: {
    id: string;
    name: string;
    slug: string;
    creditBalance: {
      balance: number;
      bonusCredits: number;
      totalAllocated: number;
      monthlyAllocation?: number;
    } | null;
    staff: Array<{
      id: string;
      name: string;
      email: string;
    }>;
  };
  creditTransaction: {
    id: string;
    balanceAfter: number;
    createdAt: Date | string;
  } | null;
};

type AdminWebhookEvent = {
  id: string;
  webhookId: string;
  eventType: string;
  status: string;
  errorMessage: string | null;
  receivedAt: Date | string;
  processedAt: Date | string | null;
};

type AdminRelatedCreditTransaction = {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  description: string | null;
  referenceType: string | null;
  adminId: string | null;
  staffId: string | null;
  metadata: string | null;
  createdAt: Date | string;
};

type AdminTopUpDetail = AdminTopUp & {
  webhookEvents: AdminWebhookEvent[];
  relatedCreditTransactions: AdminRelatedCreditTransaction[];
};

type AdminTopUpStats = {
  todayCount: number;
  todayRevenue: number;
  todayCredits: number;
  pendingCount: number;
  completedCount: number;
  completedRevenue: number;
  completedCredits: number;
  failedCount: number;
};

type AdminCreditProduct = {
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
  createdAt: string;
  updatedAt: string;
};

type ProductFormState = {
  name: string;
  basePrice: string;
  discountRate: string;
  promotionName: string;
  promotionStartsAt: string;
  promotionEndsAt: string;
  description: string;
  isActive: boolean;
  sortOrder: string;
};

interface Props {
  initialTopUps: AdminTopUp[];
  initialStats: AdminTopUpStats;
  initialProducts: AdminCreditProduct[];
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: "결제 대기",
  WAITING_FOR_DEPOSIT: "입금 대기",
  COMPLETED: "충전 완료",
  FAILED: "실패",
  CANCELLED: "취소",
  REFUNDED: "환불 확인",
};

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-blue-50 text-blue-700",
  WAITING_FOR_DEPOSIT: "bg-sky-50 text-sky-700",
  COMPLETED: "bg-emerald-50 text-emerald-700",
  FAILED: "bg-rose-50 text-rose-700",
  CANCELLED: "bg-gray-100 text-gray-600",
  REFUNDED: "bg-amber-50 text-amber-700",
};

const BANK_WINDOW_MINUTES = (() => {
  const raw = Number(process.env.NEXT_PUBLIC_BANK_DEPOSIT_MATCH_WINDOW_MINUTES);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 30;
})();

// 무통장입금 입금 대기가 시간창을 넘기면 더이상 자동매칭되지 않으므로 "시간 초과"로 표기.
function getTopUpStatusDisplay(topUp: {
  paymentMethod: string | null;
  status: string;
  createdAt: Date | string;
}): { label: string; style: string } {
  const expired =
    topUp.paymentMethod === "BANK_TRANSFER" &&
    topUp.status === "WAITING_FOR_DEPOSIT" &&
    Date.now() - new Date(topUp.createdAt).getTime() >
      BANK_WINDOW_MINUTES * 60_000;
  if (expired) {
    return { label: "시간 초과", style: "bg-gray-100 text-gray-500" };
  }
  return {
    label: STATUS_LABELS[topUp.status] ?? topUp.status,
    style: STATUS_STYLES[topUp.status] ?? "bg-gray-100 text-gray-600",
  };
}

function formatOrderNo(id: string): string {
  return id.slice(-8).toUpperCase();
}

const CONFIRM_WINDOW_MS = 30 * 60_000;

function readConfirmStartedAt(customData: unknown): number | null {
  if (
    customData &&
    typeof customData === "object" &&
    !Array.isArray(customData)
  ) {
    const v = (customData as Record<string, unknown>).confirmStartedAt;
    if (typeof v === "string") {
      const t = new Date(v).getTime();
      return Number.isFinite(t) ? t : null;
    }
  }
  return null;
}

// 무통장입금 입금 대기 주문의 라이브 배지: 입금 대기(카운트다운) / 입금 확인중(카운트업) /
// 입금 확인 실패 / 시간 초과. 디렉터 화면과 동일 기준.
function BankWaitingBadge({
  createdAt,
  customData,
}: {
  createdAt: Date | string;
  customData: unknown;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const pad = (n: number) => String(n).padStart(2, "0");

  const confirmAt = readConfirmStartedAt(customData);
  if (confirmAt != null) {
    const elapsed = now - confirmAt;
    if (elapsed >= CONFIRM_WINDOW_MS) {
      return (
        <span className="inline-flex h-6 items-center rounded-md bg-rose-50 px-2 text-[11px] font-semibold text-rose-600">
          입금 확인 실패
        </span>
      );
    }
    const mm = Math.floor(elapsed / 60_000);
    const ss = Math.floor((elapsed % 60_000) / 1000);
    return (
      <span className="inline-flex h-6 items-center gap-1 rounded-md bg-indigo-50 px-2 text-[11px] font-semibold tabular-nums text-indigo-700">
        <Clock3 className="size-3" strokeWidth={2.2} />
        입금 확인중 {pad(mm)}:{pad(ss)}
      </span>
    );
  }

  const expiresAt =
    new Date(createdAt).getTime() + BANK_WINDOW_MINUTES * 60_000;
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
      <Clock3 className="size-3" strokeWidth={2.2} />
      입금 대기 {pad(mm)}:{pad(ss)}
    </span>
  );
}

const BANK_OPTIONS = [
  { value: "SHINHAN", label: "신한은행" },
  { value: "KOOKMIN", label: "국민은행" },
  { value: "HANA", label: "하나은행" },
  { value: "WOORI", label: "우리은행" },
  { value: "IBK", label: "기업은행" },
  { value: "NONGHYUP", label: "NH농협은행" },
  { value: "KAKAO", label: "카카오뱅크" },
  { value: "K_BANK", label: "케이뱅크" },
  { value: "TOSS", label: "토스뱅크" },
];

function toDatetimeLocal(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function toIsoOrNull(value: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function productToForm(product: AdminCreditProduct): ProductFormState {
  return {
    name: product.name,
    basePrice: String(product.basePrice),
    discountRate: String(product.discountRate),
    promotionName: product.promotionName ?? "",
    promotionStartsAt: toDatetimeLocal(product.promotionStartsAt),
    promotionEndsAt: toDatetimeLocal(product.promotionEndsAt),
    description: product.description ?? "",
    isActive: product.isActive,
    sortOrder: String(product.sortOrder),
  };
}

export function CreditTopUpsAdminClient({
  initialTopUps,
  initialStats,
  initialProducts,
}: Props) {
  const [topUps, setTopUps] = useState(initialTopUps);
  const [stats, setStats] = useState(initialStats);
  const [products, setProducts] = useState(initialProducts);
  const [productForms, setProductForms] = useState<Record<string, ProductFormState>>(
    () =>
      Object.fromEntries(
        initialProducts.map((product) => [product.id, productToForm(product)]),
      ),
  );
  const [connected, setConnected] = useState(false);
  const [selectedTopUpId, setSelectedTopUpId] = useState<string | null>(
    initialTopUps[0]?.id ?? null,
  );
  const [selectedTopUp, setSelectedTopUp] =
    useState<AdminTopUpDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [closingVirtualAccount, setClosingVirtualAccount] = useState(false);
  const [actionMessage, setActionMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState("고객 요청");
  const [refundBank, setRefundBank] = useState("SHINHAN");
  const [refundAccountNumber, setRefundAccountNumber] = useState("");
  const [refundHolderName, setRefundHolderName] = useState("");
  const [refundHolderPhoneNumber, setRefundHolderPhoneNumber] = useState("");
  const [savingProductId, setSavingProductId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const source = new EventSource("/api/admin/credits/top-ups/stream");
    source.addEventListener("open", () => setConnected(true));
    source.addEventListener("topups", (event) => {
      const data = JSON.parse((event as MessageEvent).data) as {
        topUps: AdminTopUp[];
        stats: AdminTopUpStats;
      };
      setTopUps(data.topUps);
      setStats(data.stats);
      setConnected(true);
    });
    source.addEventListener("error", () => setConnected(false));
    return () => source.close();
  }, []);

  useEffect(() => {
    if (!selectedTopUpId && topUps[0]) {
      setSelectedTopUpId(topUps[0].id);
    }
  }, [selectedTopUpId, topUps]);

  useEffect(() => {
    if (!selectedTopUpId) {
      setSelectedTopUp(null);
      return;
    }
    void loadTopUpDetail(selectedTopUpId);
  }, [selectedTopUpId]);

  const latestCompleted = useMemo(
    () => topUps.find((item) => item.status === "COMPLETED") ?? null,
    [topUps],
  );

  async function loadTopUpDetail(topUpId: string, clearMessage = true) {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/credits/top-ups/${topUpId}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        throw new Error("상세 내역을 불러오지 못했습니다.");
      }
      const data = (await res.json()) as { topUp: AdminTopUpDetail };
      setSelectedTopUp(data.topUp);
      if (clearMessage) setActionMessage(null);
    } catch (err) {
      setActionMessage({
        type: "error",
        text:
          err instanceof Error
            ? err.message
            : "상세 내역을 불러오지 못했습니다.",
      });
    } finally {
      setDetailLoading(false);
    }
  }

  function refresh() {
    startTransition(async () => {
      const res = await fetch("/api/admin/credits/top-ups?limit=50", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        topUps: AdminTopUp[];
        stats: AdminTopUpStats;
      };
      setTopUps(data.topUps);
      setStats(data.stats);
      if (selectedTopUpId) {
        await loadTopUpDetail(selectedTopUpId, false);
      }
    });
  }

  async function syncSelectedTopUp() {
    if (!selectedTopUpId) return;
    setSyncing(true);
    setActionMessage({ type: "info", text: "포트원 결제 상태를 재조회 중입니다." });
    try {
      const res = await fetch(
        `/api/admin/credits/top-ups/${selectedTopUpId}/sync`,
        { method: "POST" },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "포트원 재조회에 실패했습니다.");
      }
      setSelectedTopUp(data.topUp);
      setActionMessage({
        type: "success",
        text: "포트원 결제 상태를 최신 값으로 동기화했습니다.",
      });
      refresh();
    } catch (err) {
      setActionMessage({
        type: "error",
        text:
          err instanceof Error
            ? err.message
            : "포트원 재조회에 실패했습니다.",
      });
    } finally {
      setSyncing(false);
    }
  }

  async function cancelSelectedTopUp() {
    if (!selectedTopUpId || !selectedTopUp) return;
    setCancelling(true);
    setActionMessage({ type: "info", text: "포트원 결제 취소를 요청 중입니다." });
    try {
      const needsRefundAccount =
        selectedTopUp.paymentMethod === "VIRTUAL_ACCOUNT";
      const res = await fetch(
        `/api/admin/credits/top-ups/${selectedTopUpId}/cancel`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reason: cancelReason,
            ...(needsRefundAccount
              ? {
                  refundAccount: {
                    bank: refundBank,
                    number: refundAccountNumber,
                    holderName: refundHolderName,
                    holderPhoneNumber: refundHolderPhoneNumber || undefined,
                  },
                }
              : {}),
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "결제 취소에 실패했습니다.");
      }
      setSelectedTopUp(data.topUp);
      setShowCancelForm(false);
      setActionMessage({
        type: "success",
        text:
          data.result?.cancellation?.status === "SUCCEEDED"
            ? "결제 취소와 크레딧 회수가 완료되었습니다."
            : "결제 취소 요청이 접수되었습니다.",
      });
      refresh();
    } catch (err) {
      setActionMessage({
        type: "error",
        text:
          err instanceof Error ? err.message : "결제 취소에 실패했습니다.",
      });
    } finally {
      setCancelling(false);
    }
  }

  async function closeSelectedVirtualAccount() {
    if (!selectedTopUpId) return;
    setClosingVirtualAccount(true);
    setActionMessage({ type: "info", text: "가상계좌 말소를 요청 중입니다." });
    try {
      const res = await fetch(
        `/api/admin/credits/top-ups/${selectedTopUpId}/close-virtual-account`,
        { method: "POST" },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "가상계좌 말소에 실패했습니다.");
      }
      setSelectedTopUp(data.topUp);
      setActionMessage({
        type: "success",
        text: "입금 전 가상계좌를 말소하고 충전 요청을 취소했습니다.",
      });
      refresh();
    } catch (err) {
      setActionMessage({
        type: "error",
        text:
          err instanceof Error ? err.message : "가상계좌 말소에 실패했습니다.",
      });
    } finally {
      setClosingVirtualAccount(false);
    }
  }

  function selectTopUp(topUpId: string) {
    setSelectedTopUpId(topUpId);
    setShowCancelForm(false);
  }

  function updateProductField<K extends keyof ProductFormState>(
    productId: string,
    field: K,
    value: ProductFormState[K],
  ) {
    setProductForms((current) => ({
      ...current,
      [productId]: {
        ...current[productId],
        [field]: value,
      },
    }));
  }

  function saveProduct(product: AdminCreditProduct) {
    const form = productForms[product.id];
    if (!form) return;

    const payload: CreditProductUpdateData = {
      name: form.name,
      basePrice: Number(form.basePrice || 0),
      discountRate: Number(form.discountRate || 0),
      promotionName: form.promotionName,
      promotionStartsAt: toIsoOrNull(form.promotionStartsAt),
      promotionEndsAt: toIsoOrNull(form.promotionEndsAt),
      description: form.description,
      isActive: form.isActive,
      sortOrder: Number(form.sortOrder || 0),
    };

    setSavingProductId(product.id);
    setActionMessage(null);
    startTransition(async () => {
      const result = await updateCreditTopUpProduct(product.id, payload);

      if (!result.success || !result.product) {
        setActionMessage({
          type: "error",
          text: result.error ?? "크레딧 상품을 저장하지 못했습니다.",
        });
        setSavingProductId(null);
        return;
      }

      setProducts((current) =>
        current
          .map((item) => (item.id === product.id ? result.product! : item))
          .sort((a, b) => a.sortOrder - b.sortOrder),
      );
      setProductForms((current) => ({
        ...current,
        [product.id]: productToForm(result.product!),
      }));
      setActionMessage({
        type: "success",
        text: "크레딧 상품 설정을 저장했습니다. 결제 화면과 상품 정보에 즉시 반영됩니다.",
      });
      setSavingProductId(null);
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-gray-950">크레딧 결제</h1>
          <p className="mt-1 text-[13px] text-gray-500">
            포트원 결제 기반 크레딧 충전 현황
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-[12px] font-medium",
              connected
                ? "border-blue-100 bg-blue-50 text-blue-700"
                : "border-gray-200 bg-white text-gray-500",
            )}
          >
            <Radio className="size-3.5" strokeWidth={2} />
            {connected ? "연결됨" : "대기 중"}
          </span>
          <button
            type="button"
            onClick={refresh}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-600 shadow-sm transition hover:border-blue-200 hover:text-blue-700"
          >
            <RefreshCw
              className={cn("size-3.5", isPending && "animate-spin")}
              strokeWidth={2}
            />
            새로고침
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <MetricCard
          label="오늘 결제"
          value={`${stats.todayRevenue.toLocaleString("ko-KR")}원`}
          sub={`${stats.todayCount.toLocaleString("ko-KR")}건 · ${stats.todayCredits.toLocaleString("ko-KR")}C`}
          icon={<CreditCard />}
          accent="blue"
        />
        <MetricCard
          label="충전 완료"
          value={`${stats.completedCredits.toLocaleString("ko-KR")}C`}
          sub={`${stats.completedCount.toLocaleString("ko-KR")}건 · ${stats.completedRevenue.toLocaleString("ko-KR")}원`}
          icon={<CheckCircle2 />}
          accent="emerald"
        />
        <MetricCard
          label="대기"
          value={`${stats.pendingCount.toLocaleString("ko-KR")}건`}
          sub="결제 또는 입금 확인 중"
          icon={<Clock3 />}
          accent="sky"
        />
        <MetricCard
          label="확인 필요"
          value={`${stats.failedCount.toLocaleString("ko-KR")}건`}
          sub={latestCompleted ? `최근 ${formatDate(latestCompleted.completedAt)}` : "완료 내역 없음"}
          icon={<XCircle />}
          accent="rose"
        />
      </div>

      <ReviewReadinessStrip />

      <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        <div className="flex flex-col gap-1 border-b border-gray-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <Coins className="size-4 text-blue-600" strokeWidth={2} />
            <h2 className="text-[15px] font-semibold text-gray-900">
              충전 상품 설정
            </h2>
          </div>
          <p className="text-[12px] leading-5 text-gray-500">
            정가와 프로모션 할인율은 고객 결제 화면, 상품 정보, 포트원 결제
            사전등록 금액에 같은 값으로 반영됩니다.
          </p>
        </div>

        <div className="grid gap-3 p-5 xl:grid-cols-2">
          {products.map((product) => {
            const form = productForms[product.id] ?? productToForm(product);
            const saving = savingProductId === product.id;

            return (
              <div
                key={product.id}
                className="rounded-lg border border-gray-200 bg-gray-50 p-4"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-bold text-gray-900">
                        {product.creditAmount.toLocaleString("ko-KR")}C
                      </span>
                      <span
                        className={cn(
                          "inline-flex h-6 items-center rounded-md px-2 text-[11px] font-semibold",
                          product.isActive
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-gray-100 text-gray-500",
                        )}
                      >
                        {product.isActive ? "노출 중" : "비활성"}
                      </span>
                      {product.isPromotionActive && (
                        <span className="inline-flex h-6 items-center rounded-md bg-blue-50 px-2 text-[11px] font-semibold text-blue-700">
                          {product.discountRate}% 할인 중
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[12px] text-gray-500">
                      현재 결제금액 {product.price.toLocaleString("ko-KR")}원 ·{" "}
                      자동출제 약{" "}
                      {product.estimatedAutoQuestionCount.toLocaleString("ko-KR")}
                      문항 · 문항당{" "}
                      {product.perAutoQuestion.toLocaleString("ko-KR")}원
                    </p>
                  </div>

                  <SaveButton onClick={() => saveProduct(product)} saving={saving} />
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <AdminField label="상품명">
                    <input
                      value={form.name}
                      onChange={(event) =>
                        updateProductField(product.id, "name", event.target.value)
                      }
                      className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-[13px] outline-none transition focus:border-blue-300"
                    />
                  </AdminField>
                  <AdminField label="정가">
                    <input
                      type="number"
                      min={100}
                      step={1000}
                      value={form.basePrice}
                      onChange={(event) =>
                        updateProductField(
                          product.id,
                          "basePrice",
                          event.target.value,
                        )
                      }
                      className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-[13px] outline-none transition focus:border-blue-300"
                    />
                  </AdminField>
                  <AdminField label="할인율">
                    <div className="relative">
                      <input
                        type="number"
                        min={0}
                        max={99}
                        value={form.discountRate}
                        onChange={(event) =>
                          updateProductField(
                            product.id,
                            "discountRate",
                            event.target.value,
                          )
                        }
                        className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 pr-8 text-[13px] outline-none transition focus:border-blue-300"
                      />
                      <Percent className="pointer-events-none absolute right-2.5 top-2.5 size-4 text-gray-400" />
                    </div>
                  </AdminField>
                  <AdminField label="정렬">
                    <input
                      type="number"
                      min={0}
                      value={form.sortOrder}
                      onChange={(event) =>
                        updateProductField(
                          product.id,
                          "sortOrder",
                          event.target.value,
                        )
                      }
                      className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-[13px] outline-none transition focus:border-blue-300"
                    />
                  </AdminField>
                  <AdminField label="프로모션 이름">
                    <input
                      value={form.promotionName}
                      onChange={(event) =>
                        updateProductField(
                          product.id,
                          "promotionName",
                          event.target.value,
                        )
                      }
                      placeholder="예: 신학기 할인"
                      className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-[13px] outline-none transition focus:border-blue-300"
                    />
                  </AdminField>
                  <AdminField label="노출 여부">
                    <label className="flex h-9 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-[13px] font-medium text-gray-600">
                      <input
                        type="checkbox"
                        checked={form.isActive}
                        onChange={(event) =>
                          updateProductField(
                            product.id,
                            "isActive",
                            event.target.checked,
                          )
                        }
                        className="size-4 accent-blue-600"
                      />
                      결제 화면에 노출
                    </label>
                  </AdminField>
                  <AdminField label="시작일">
                    <input
                      type="datetime-local"
                      value={form.promotionStartsAt}
                      onChange={(event) =>
                        updateProductField(
                          product.id,
                          "promotionStartsAt",
                          event.target.value,
                        )
                      }
                      className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-[13px] outline-none transition focus:border-blue-300"
                    />
                  </AdminField>
                  <AdminField label="종료일">
                    <input
                      type="datetime-local"
                      value={form.promotionEndsAt}
                      onChange={(event) =>
                        updateProductField(
                          product.id,
                          "promotionEndsAt",
                          event.target.value,
                        )
                      }
                      className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-[13px] outline-none transition focus:border-blue-300"
                    />
                  </AdminField>
                </div>

                <AdminField label="상품 설명" className="mt-3">
                  <textarea
                    value={form.description}
                    onChange={(event) =>
                      updateProductField(
                        product.id,
                        "description",
                        event.target.value,
                      )
                    }
                    className="min-h-16 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-[13px] outline-none transition focus:border-blue-300"
                  />
                </AdminField>
              </div>
            );
          })}
        </div>
      </div>

      {actionMessage && (
        <div
          className={cn(
            "flex items-center gap-2 rounded-xl border px-4 py-3 text-[13px] font-medium",
            actionMessage.type === "success" &&
              "border-emerald-100 bg-emerald-50 text-emerald-700",
            actionMessage.type === "error" &&
              "border-rose-100 bg-rose-50 text-rose-700",
            actionMessage.type === "info" &&
              "border-blue-100 bg-blue-50 text-blue-700",
          )}
        >
          {actionMessage.type === "error" ? (
            <AlertTriangle className="size-4" strokeWidth={2} />
          ) : (
            <ShieldCheck className="size-4" strokeWidth={2} />
          )}
          {actionMessage.text}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-gray-900">
              충전 내역
            </h2>
            <p className="mt-0.5 text-[12px] text-gray-400">
              최근 {topUps.length.toLocaleString("ko-KR")}건
            </p>
          </div>
        </div>

        {topUps.length === 0 ? (
          <div className="px-5 py-16 text-center text-[13px] text-gray-400">
            충전 내역이 없습니다
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left">
              <thead>
                <tr className="border-b border-gray-50 bg-gray-50/60 text-[11px] font-semibold text-gray-400">
                  <th className="px-5 py-3">주문번호</th>
                  <th className="px-4 py-3">일시</th>
                  <th className="px-4 py-3">학원</th>
                  <th className="px-4 py-3">상태</th>
                  <th className="px-4 py-3 text-right">결제금액</th>
                  <th className="px-4 py-3 text-right">크레딧</th>
                  <th className="px-4 py-3">결제수단</th>
                  <th className="px-4 py-3">포트원 결제 ID</th>
                  <th className="px-5 py-3 text-right">충전 후 잔고</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {topUps.map((topUp) => {
                  const selected = selectedTopUpId === topUp.id;
                  const statusDisplay = getTopUpStatusDisplay(topUp);
                  return (
                  <tr
                    key={topUp.id}
                    onClick={() => selectTopUp(topUp.id)}
                    className={cn(
                      "cursor-pointer transition hover:bg-blue-50/30",
                      selected && "bg-blue-50/60",
                    )}
                  >
                    <td className="px-5 py-3 text-[12px] font-medium tabular-nums text-gray-600">
                      {formatOrderNo(topUp.id)}
                    </td>
                    <td className="px-4 py-3 text-[12px] text-gray-500">
                      {formatDate(topUp.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-[13px] font-semibold text-gray-900">
                        {topUp.academy.name}
                      </div>
                      <div className="text-[11px] text-gray-400">
                        {topUp.academy.staff[0]?.name ?? "원장 미지정"}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {topUp.paymentMethod === "BANK_TRANSFER" &&
                      topUp.status === "WAITING_FOR_DEPOSIT" ? (
                        <BankWaitingBadge
                          createdAt={topUp.createdAt}
                          customData={topUp.customData}
                        />
                      ) : (
                        <span
                          className={cn(
                            "inline-flex h-6 items-center rounded-md px-2 text-[11px] font-semibold",
                            statusDisplay.style,
                          )}
                        >
                          {statusDisplay.label}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-[13px] font-semibold tabular-nums text-gray-900">
                      {topUp.price.toLocaleString("ko-KR")}원
                    </td>
                    <td className="px-4 py-3 text-right text-[13px] font-semibold tabular-nums text-blue-700">
                      {topUp.creditAmount.toLocaleString("ko-KR")}C
                    </td>
                    <td className="px-4 py-3 text-[12px] text-gray-500">
                      {formatPayMethod(topUp.paymentMethod)}
                    </td>
                    <td className="max-w-[190px] truncate px-4 py-3 text-[12px] text-gray-500">
                      {topUp.paymentId ?? "-"}
                    </td>
                    <td className="px-5 py-3 text-right text-[12px] font-medium tabular-nums text-gray-600">
                      {topUp.creditTransaction
                        ? `${topUp.creditTransaction.balanceAfter.toLocaleString("ko-KR")}C`
                        : "-"}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <TopUpDetailPanel
        topUp={selectedTopUp}
        loading={detailLoading}
        syncing={syncing}
        cancelling={cancelling}
        closingVirtualAccount={closingVirtualAccount}
        showCancelForm={showCancelForm}
        cancelReason={cancelReason}
        refundBank={refundBank}
        refundAccountNumber={refundAccountNumber}
        refundHolderName={refundHolderName}
        refundHolderPhoneNumber={refundHolderPhoneNumber}
        onSync={syncSelectedTopUp}
        onOpenCancelForm={() => setShowCancelForm(true)}
        onCloseCancelForm={() => setShowCancelForm(false)}
        onCancel={cancelSelectedTopUp}
        onCloseVirtualAccount={closeSelectedVirtualAccount}
        onCancelReasonChange={setCancelReason}
        onRefundBankChange={setRefundBank}
        onRefundAccountNumberChange={setRefundAccountNumber}
        onRefundHolderNameChange={setRefundHolderName}
        onRefundHolderPhoneNumberChange={setRefundHolderPhoneNumber}
      />
      </div>
    </div>
  );
}

function ReviewReadinessStrip() {
  const items = [
    { label: "서버 검증", value: "금액·상점 대조" },
    { label: "웹훅", value: "수신 이력 보존" },
    { label: "재조회", value: "누락 복구" },
    { label: "환불", value: "API 취소·크레딧 회수" },
  ];

  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.label}
          className="flex h-12 items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50/60 px-3"
        >
          <span className="inline-flex size-7 items-center justify-center rounded-lg bg-white text-emerald-700">
            <ShieldCheck className="size-3.5" strokeWidth={2} />
          </span>
          <div>
            <div className="text-[12px] font-semibold text-emerald-800">
              {item.label}
            </div>
            <div className="text-[11px] text-emerald-600">{item.value}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function TopUpDetailPanel({
  topUp,
  loading,
  syncing,
  cancelling,
  closingVirtualAccount,
  showCancelForm,
  cancelReason,
  refundBank,
  refundAccountNumber,
  refundHolderName,
  refundHolderPhoneNumber,
  onSync,
  onOpenCancelForm,
  onCloseCancelForm,
  onCancel,
  onCloseVirtualAccount,
  onCancelReasonChange,
  onRefundBankChange,
  onRefundAccountNumberChange,
  onRefundHolderNameChange,
  onRefundHolderPhoneNumberChange,
}: {
  topUp: AdminTopUpDetail | null;
  loading: boolean;
  syncing: boolean;
  cancelling: boolean;
  closingVirtualAccount: boolean;
  showCancelForm: boolean;
  cancelReason: string;
  refundBank: string;
  refundAccountNumber: string;
  refundHolderName: string;
  refundHolderPhoneNumber: string;
  onSync: () => void;
  onOpenCancelForm: () => void;
  onCloseCancelForm: () => void;
  onCancel: () => void;
  onCloseVirtualAccount: () => void;
  onCancelReasonChange: (value: string) => void;
  onRefundBankChange: (value: string) => void;
  onRefundAccountNumberChange: (value: string) => void;
  onRefundHolderNameChange: (value: string) => void;
  onRefundHolderPhoneNumberChange: (value: string) => void;
}) {
  const canSync = Boolean(topUp?.paymentId);
  const canCancel = topUp?.status === "COMPLETED";
  const canCloseVirtualAccount =
    topUp?.status === "WAITING_FOR_DEPOSIT" &&
    topUp.paymentMethod === "VIRTUAL_ACCOUNT";
  const needsRefundAccount = topUp?.paymentMethod === "VIRTUAL_ACCOUNT";

  return (
    <aside className="rounded-xl border border-gray-100 bg-white shadow-sm">
      <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
        <div>
          <h2 className="text-[15px] font-semibold text-gray-900">
            결제 상세
          </h2>
          <p className="mt-0.5 text-[12px] text-gray-400">
            상태 검증 및 운영 처리
          </p>
        </div>
        {topUp &&
          (topUp.paymentMethod === "BANK_TRANSFER" &&
          topUp.status === "WAITING_FOR_DEPOSIT" ? (
            <BankWaitingBadge
              createdAt={topUp.createdAt}
              customData={topUp.customData}
            />
          ) : (
            <span
              className={cn(
                "inline-flex h-6 items-center rounded-md px-2 text-[11px] font-semibold",
                getTopUpStatusDisplay(topUp).style,
              )}
            >
              {getTopUpStatusDisplay(topUp).label}
            </span>
          ))}
      </div>

      {!topUp ? (
        <div className="px-5 py-12 text-center text-[13px] text-gray-400">
          {loading ? "상세 내역을 불러오는 중입니다" : "충전 내역을 선택해주세요"}
        </div>
      ) : (
        <div className="space-y-5 p-5">
          <div className="grid grid-cols-2 gap-3">
            <DetailItem label="학원" value={topUp.academy.name} />
            <DetailItem
              label="현재 잔고"
              value={`${(topUp.academy.creditBalance?.balance ?? 0).toLocaleString("ko-KR")}C`}
            />
            <DetailItem
              label="결제금액"
              value={`${topUp.price.toLocaleString("ko-KR")}원`}
            />
            <DetailItem
              label="크레딧"
              value={`${topUp.creditAmount.toLocaleString("ko-KR")}C`}
            />
          </div>

          <div className="space-y-2 rounded-xl border border-gray-100 p-3">
            <DetailRow label="주문번호" value={formatOrderNo(topUp.id)} mono />
            <DetailRow label="주문명" value={topUp.orderName ?? "-"} />
            <DetailRow label="결제수단" value={formatPayMethod(topUp.paymentMethod)} />
            <DetailRow label="포트원 상태" value={topUp.portoneStatus ?? "-"} />
            <DetailRow label="결제 ID" value={topUp.paymentId ?? "-"} mono />
            <DetailRow
              label="거래 ID"
              value={topUp.portoneTransactionId ?? topUp.paymentReference ?? "-"}
              mono
            />
            <DetailRow label="Store ID" value={maskLongValue(topUp.storeId)} mono />
            <DetailRow
              label="검증 시각"
              value={formatDate(topUp.verifiedAt ?? null)}
            />
            {topUp.receiptUrl && (
              <a
                href={topUp.receiptUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-blue-100 px-2.5 text-[12px] font-semibold text-blue-700 transition hover:bg-blue-50"
              >
                <ExternalLink className="size-3.5" strokeWidth={2} />
                영수증 보기
              </a>
            )}
          </div>

          {topUp.failureMessage && (
            <div className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-[12px] font-medium text-rose-700">
              {topUp.failureMessage}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onSync}
              disabled={!canSync || syncing || cancelling || closingVirtualAccount}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-[12px] font-semibold text-gray-700 shadow-sm transition hover:border-blue-200 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RotateCcw
                className={cn("size-3.5", syncing && "animate-spin")}
                strokeWidth={2}
              />
              포트원 재조회
            </button>
            <button
              type="button"
              onClick={onOpenCancelForm}
              disabled={!canCancel || syncing || cancelling || closingVirtualAccount}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-rose-100 bg-rose-50 px-3 text-[12px] font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Undo2 className="size-3.5" strokeWidth={2} />
              환불 처리
            </button>
            <button
              type="button"
              onClick={onCloseVirtualAccount}
              disabled={
                !canCloseVirtualAccount ||
                syncing ||
                cancelling ||
                closingVirtualAccount
              }
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-amber-100 bg-amber-50 px-3 text-[12px] font-semibold text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <XCircle
                className={cn("size-3.5", closingVirtualAccount && "animate-pulse")}
                strokeWidth={2}
              />
              가상계좌 말소
            </button>
          </div>

          {showCancelForm && (
            <div className="space-y-3 rounded-xl border border-rose-100 bg-rose-50/50 p-3">
              <div className="flex items-center justify-between">
                <div className="text-[13px] font-semibold text-rose-800">
                  결제 취소
                </div>
                <button
                  type="button"
                  onClick={onCloseCancelForm}
                  className="inline-flex size-7 items-center justify-center rounded-lg text-rose-600 transition hover:bg-white"
                >
                  <X className="size-4" strokeWidth={2} />
                </button>
              </div>
              <input
                value={cancelReason}
                onChange={(event) => onCancelReasonChange(event.target.value)}
                className="h-9 w-full rounded-lg border border-rose-100 bg-white px-3 text-[12px] text-gray-800 outline-none transition focus:border-rose-300"
                placeholder="환불 사유"
              />
              {needsRefundAccount && (
                <div className="grid grid-cols-1 gap-2">
                  <select
                    value={refundBank}
                    onChange={(event) => onRefundBankChange(event.target.value)}
                    className="h-9 rounded-lg border border-rose-100 bg-white px-3 text-[12px] text-gray-800 outline-none transition focus:border-rose-300"
                  >
                    {BANK_OPTIONS.map((bank) => (
                      <option key={bank.value} value={bank.value}>
                        {bank.label}
                      </option>
                    ))}
                  </select>
                  <input
                    value={refundAccountNumber}
                    onChange={(event) =>
                      onRefundAccountNumberChange(event.target.value)
                    }
                    className="h-9 rounded-lg border border-rose-100 bg-white px-3 text-[12px] text-gray-800 outline-none transition focus:border-rose-300"
                    placeholder="환불 계좌번호"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={refundHolderName}
                      onChange={(event) =>
                        onRefundHolderNameChange(event.target.value)
                      }
                      className="h-9 rounded-lg border border-rose-100 bg-white px-3 text-[12px] text-gray-800 outline-none transition focus:border-rose-300"
                      placeholder="예금주"
                    />
                    <input
                      value={refundHolderPhoneNumber}
                      onChange={(event) =>
                        onRefundHolderPhoneNumberChange(event.target.value)
                      }
                      className="h-9 rounded-lg border border-rose-100 bg-white px-3 text-[12px] text-gray-800 outline-none transition focus:border-rose-300"
                      placeholder="연락처"
                    />
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={onCancel}
                disabled={cancelling}
                className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-rose-600 px-3 text-[12px] font-semibold text-white transition hover:bg-rose-700 disabled:cursor-wait disabled:opacity-60"
              >
                <Banknote className="size-3.5" strokeWidth={2} />
                {cancelling ? "취소 요청 중" : "포트원 취소 실행"}
              </button>
            </div>
          )}

          <DetailSection title="웹훅 이력">
            {topUp.webhookEvents.length === 0 ? (
              <EmptyLine text="수신된 웹훅이 없습니다" />
            ) : (
              topUp.webhookEvents.map((event) => (
                <div
                  key={event.id}
                  className="rounded-lg border border-gray-100 px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[12px] font-semibold text-gray-800">
                      {event.eventType}
                    </span>
                    <span className="text-[11px] text-gray-400">
                      {event.status}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-gray-400">
                    {formatDate(event.receivedAt)}
                  </div>
                  {event.errorMessage && (
                    <div className="mt-1 text-[11px] text-rose-600">
                      {event.errorMessage}
                    </div>
                  )}
                </div>
              ))
            )}
          </DetailSection>

          <DetailSection title="크레딧 감사 로그">
            {topUp.relatedCreditTransactions.length === 0 ? (
              <EmptyLine text="연결된 크레딧 로그가 없습니다" />
            ) : (
              topUp.relatedCreditTransactions.map((tx) => (
                <div
                  key={tx.id}
                  className="rounded-lg border border-gray-100 px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        "text-[12px] font-semibold",
                        tx.amount < 0 ? "text-rose-700" : "text-blue-700",
                      )}
                    >
                      {tx.amount > 0 ? "+" : ""}
                      {tx.amount.toLocaleString("ko-KR")}C
                    </span>
                    <span className="text-[11px] text-gray-400">
                      잔고 {tx.balanceAfter.toLocaleString("ko-KR")}C
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-gray-500">
                    {tx.description ?? tx.type}
                  </div>
                  <div className="mt-1 text-[11px] text-gray-400">
                    {formatDate(tx.createdAt)}
                  </div>
                </div>
              ))
            )}
          </DetailSection>
        </div>
      )}
    </aside>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/50 px-3 py-2">
      <div className="text-[11px] font-medium text-gray-400">{label}</div>
      <div className="mt-1 truncate text-[13px] font-semibold text-gray-900">
        {value}
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 text-[12px]">
      <span className="shrink-0 text-gray-400">{label}</span>
      <span
        className={cn(
          "min-w-0 break-all text-right font-medium text-gray-700",
          mono && "font-mono text-[11px]",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 text-[12px] font-semibold text-gray-800">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-200 px-3 py-4 text-center text-[12px] text-gray-400">
      {text}
    </div>
  );
}

function MetricCard({
  label,
  value,
  sub,
  icon,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  icon: ReactNode;
  accent: "blue" | "emerald" | "sky" | "rose";
}) {
  const colors = {
    blue: "bg-blue-50 text-blue-700",
    emerald: "bg-emerald-50 text-emerald-700",
    sky: "bg-sky-50 text-sky-700",
    rose: "bg-rose-50 text-rose-700",
  };

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium text-gray-400">{label}</span>
        <span
          className={cn(
            "inline-flex size-8 items-center justify-center rounded-lg [&_svg]:size-4",
            colors[accent],
          )}
        >
          {icon}
        </span>
      </div>
      <div className="mt-3 text-[22px] font-bold tracking-tight text-gray-950">
        {value}
      </div>
      <div className="mt-1 text-[12px] text-gray-400">{sub}</div>
    </div>
  );
}

function AdminField({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="text-[12px] font-semibold text-gray-500">{label}</span>
      {children}
    </label>
  );
}

function formatDate(value: Date | string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPayMethod(value: string | null) {
  const labels: Record<string, string> = {
    CARD: "카드",
    EASY_PAY: "간편결제",
    TRANSFER: "계좌이체",
    VIRTUAL_ACCOUNT: "가상계좌",
    MOBILE: "휴대폰",
    BANK_TRANSFER: "무통장입금",
  };
  return value ? labels[value] ?? value : "-";
}

function maskLongValue(value?: string | null) {
  if (!value) return "-";
  if (value.length <= 18) return value;
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
}
