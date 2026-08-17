"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { AdminPagination } from "@/components/admin/admin-pagination";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Coins,
  CreditCard,
  ExternalLink,
  Tag,
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
import type {
  AdminCreditProductView,
  AdminPromotionView,
} from "@/lib/credit-top-up-products";
import {
  AdminField,
  ToggleSwitch,
  formatDate,
} from "@/components/admin/credit-promotion-editor";
import { cn } from "@/lib/utils";
import { resolveCompletedDisplay, isManualGrantTopUp } from "@/lib/credit-topup-status";
import {
  ManualCompleteModal,
  type ManualCompletePayload,
  type ManualGrantCandidate,
  type DuplicateNotificationCandidate,
} from "@/components/admin/credit-topups-admin-parts/manual-complete-modal";
import {
  getTransactionTypeLabel,
  getOperationTypeLabel,
} from "@/lib/admin-members-labels";
import { SaveButton } from "@/components/ui/save-button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

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

type AdminCreditActivity = {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  operationType: string | null;
  description: string | null;
  staffId: string | null;
  createdAt: Date | string;
};

type AdminTopUpDetail = AdminTopUp & {
  /** 수동 충전 완료 처리 가능 여부(미지급 + 대기 상태) */
  canManualComplete?: boolean;
  manualGrantCandidates?: ManualGrantCandidate[];
  duplicateNotificationCandidates?: DuplicateNotificationCandidate[];
  webhookEvents: AdminWebhookEvent[];
  relatedCreditTransactions: AdminRelatedCreditTransaction[];
  academyCreditActivity: AdminCreditActivity[];
  academyActivityTotal: number;
  academyActivityPageSize: number;
  academyUsageSummary: {
    totalConsumed: number;
    consumptionCount: number;
  };
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

// 상품 뷰(기본정보 + 계산된 요약 + 프로모션 목록)는 서버 lib 타입을 그대로 사용.
type AdminCreditProduct = AdminCreditProductView;

// 상품 기본 정보 폼(프로모션은 /admin/promotions 프로모션 관리에서 CRUD).
type ProductFormState = {
  name: string;
  basePrice: string;
  expiryDays: string;
  description: string;
  isActive: boolean;
  sortOrder: string;
};

interface Props {
  // 페이지 분리: "products"=상품 관리(충전 상품 설정만), "payments"=결제 관리(내역·통계).
  mode: "products" | "payments";
  initialTopUps?: AdminTopUp[];
  initialStats?: AdminTopUpStats;
  initialProducts?: AdminCreditProduct[];
  initialTopUpsTotal?: number;
  hideTitle?: boolean;
}

const ZERO_STATS: AdminTopUpStats = {
  todayRevenue: 0,
  todayCount: 0,
  todayCredits: 0,
  completedCredits: 0,
  completedCount: 0,
  completedRevenue: 0,
  pendingCount: 0,
  failedCount: 0,
};

const TOPUPS_PAGE_SIZE = 50;

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
  customData?: unknown;
}): { label: string; style: string } {
  const expired =
    topUp.paymentMethod === "BANK_TRANSFER" &&
    topUp.status === "WAITING_FOR_DEPOSIT" &&
    Date.now() - new Date(topUp.createdAt).getTime() >
      BANK_WINDOW_MINUTES * 60_000;
  if (expired) {
    return { label: "시간 초과", style: "bg-gray-100 text-gray-500" };
  }
  return resolveCompletedDisplay({
    status: topUp.status,
    manualGrant: isManualGrantTopUp(topUp.customData),
    fallbackLabel: STATUS_LABELS[topUp.status] ?? topUp.status,
    fallbackStyle: STATUS_STYLES[topUp.status] ?? "bg-gray-100 text-gray-600",
  });
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

function productToForm(product: AdminCreditProduct): ProductFormState {
  return {
    name: product.name,
    basePrice: String(product.basePrice),
    expiryDays: product.expiryDays != null ? String(product.expiryDays) : "",
    description: product.description ?? "",
    isActive: product.isActive,
    sortOrder: String(product.sortOrder),
  };
}

export function CreditTopUpsAdminClient({
  mode,
  initialTopUps = [],
  initialStats = ZERO_STATS,
  initialProducts = [],
  initialTopUpsTotal,
  hideTitle = false,
}: Props) {
  const isProducts = mode === "products";
  const isPayments = mode === "payments";
  const [topUps, setTopUps] = useState(initialTopUps);
  const [stats, setStats] = useState(initialStats);
  const [products, setProducts] = useState(initialProducts);
  const [page, setPage] = useState(1);
  const [totalTopUps, setTotalTopUps] = useState(
    initialTopUpsTotal ?? initialTopUps.length,
  );
  const pageRef = useRef(1);
  const [productForms, setProductForms] = useState<Record<string, ProductFormState>>(
    () =>
      Object.fromEntries(
        initialProducts.map((product) => [product.id, productToForm(product)]),
      ),
  );
  // Product cards are collapsed by default; admins expand the ones they edit.
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(
    () => new Set(),
  );
  const toggleProduct = (id: string) =>
    setExpandedProducts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allExpanded =
    products.length > 0 && products.every((p) => expandedProducts.has(p.id));
  const toggleAllProducts = () =>
    setExpandedProducts(
      allExpanded ? new Set() : new Set(products.map((p) => p.id)),
    );
  const [connected, setConnected] = useState(false);
  // 상세는 모달이므로 기본은 닫힘(null). 행을 클릭해야 열린다.
  const [selectedTopUpId, setSelectedTopUpId] = useState<string | null>(null);
  const [selectedTopUp, setSelectedTopUp] =
    useState<AdminTopUpDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [closingVirtualAccount, setClosingVirtualAccount] = useState(false);
  const [showManualComplete, setShowManualComplete] = useState(false);
  const [manualCompleting, setManualCompleting] = useState(false);
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
    // 결제 관리 모드에서만 실시간 스트림을 연결한다(상품 관리 페이지는 불필요).
    if (mode !== "payments") return;
    const source = new EventSource("/api/admin/credits/top-ups/stream");
    source.addEventListener("open", () => setConnected(true));
    source.addEventListener("topups", (event) => {
      const data = JSON.parse((event as MessageEvent).data) as {
        topUps: AdminTopUp[];
        stats: AdminTopUpStats;
      };
      setStats(data.stats);
      // 실시간 스트림은 최신 페이지(1페이지)를 볼 때만 목록을 갱신한다.
      // 다른 페이지를 보는 중이면 화면이 튀지 않도록 목록 교체를 건너뛴다.
      if (pageRef.current === 1) {
        setTopUps(data.topUps);
        setTotalTopUps((prev) => Math.max(prev, data.topUps.length));
      }
      setConnected(true);
    });
    source.addEventListener("error", () => setConnected(false));
    return () => source.close();
  }, [mode]);

  // The payment detail opens as a modal on row click — no auto-selection, so
  // it stays closed until an admin picks a row.
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

  function fetchTopUpsPage(targetPage: number, reloadDetail = false) {
    startTransition(async () => {
      const res = await fetch(
        `/api/admin/credits/top-ups?page=${targetPage}&pageSize=${TOPUPS_PAGE_SIZE}`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const data = (await res.json()) as {
        topUps: AdminTopUp[];
        stats: AdminTopUpStats;
        total: number;
        page: number;
      };
      setTopUps(data.topUps);
      setStats(data.stats);
      setTotalTopUps(data.total);
      pageRef.current = data.page;
      setPage(data.page);
      if (reloadDetail && selectedTopUpId) {
        await loadTopUpDetail(selectedTopUpId, false);
      }
    });
  }

  function refresh() {
    fetchTopUpsPage(pageRef.current, true);
  }

  function goToPage(targetPage: number) {
    const totalPages = Math.max(1, Math.ceil(totalTopUps / TOPUPS_PAGE_SIZE));
    const next = Math.min(Math.max(targetPage, 1), totalPages);
    if (next === pageRef.current) return;
    fetchTopUpsPage(next);
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

  // 시스템 밖에서 이미 지급한 건을 주문에 반영한다. 크레딧은 추가 지급하지 않는다.
  async function manualCompleteSelectedTopUp(payload: ManualCompletePayload) {
    if (!selectedTopUpId) return;
    setManualCompleting(true);
    setActionMessage({ type: "info", text: "수동 충전 완료 처리 중입니다." });
    try {
      const res = await fetch(
        `/api/admin/credits/top-ups/${selectedTopUpId}/manual-complete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "수동 완료 처리에 실패했습니다.");
      }
      setSelectedTopUp(data.topUp);
      setShowManualComplete(false);
      setActionMessage({
        type: "success",
        text: "수동 충전 완료로 처리했습니다. 고객 화면과 매출 집계에 반영됩니다.",
      });
      refresh();
    } catch (err) {
      setActionMessage({
        type: "error",
        text:
          err instanceof Error ? err.message : "수동 완료 처리에 실패했습니다.",
      });
    } finally {
      setManualCompleting(false);
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
      expiryDays: Number(form.expiryDays || 0),
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
      <div
        className={cn(
          "flex flex-col gap-3 md:flex-row md:items-center",
          hideTitle ? "md:justify-end" : "md:justify-between",
        )}
      >
        {!hideTitle && (
          <div>
            <h1 className="text-[22px] font-bold text-gray-950">크레딧 결제</h1>
            <p className="mt-1 text-[13px] text-gray-500">
              포트원 결제 기반 크레딧 충전 현황
            </p>
          </div>
        )}
        {isPayments && (
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
        )}
      </div>

      {isPayments && (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
      )}

      {isPayments && <ReviewReadinessStrip />}

      {isProducts && (
      <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div className="flex flex-col gap-1">
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
          {products.length > 0 && (
            <button
              type="button"
              onClick={toggleAllProducts}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[12px] font-medium text-gray-600 transition hover:bg-gray-50 hover:text-gray-900"
            >
              <ChevronDown
                className={cn(
                  "size-3.5 transition-transform",
                  allExpanded && "rotate-180",
                )}
                strokeWidth={2}
              />
              {allExpanded ? "모두 접기" : "모두 펼치기"}
            </button>
          )}
        </div>

        <div className="grid gap-3 p-5">
          {products.map((product) => {
            const form = productForms[product.id] ?? productToForm(product);
            const saving = savingProductId === product.id;
            const expanded = expandedProducts.has(product.id);

            return (
              <div
                key={product.id}
                className={cn(
                  "self-start rounded-lg border bg-gray-50 transition",
                  expanded ? "border-blue-200" : "border-gray-200",
                )}
              >
                {/* Header — click anywhere to expand/collapse */}
                <div className="flex items-start justify-between gap-3 p-4">
                  <button
                    type="button"
                    onClick={() => toggleProduct(product.id)}
                    aria-expanded={expanded}
                    className="flex flex-1 items-start gap-2.5 text-left outline-none"
                  >
                    <ChevronDown
                      className={cn(
                        "mt-1 size-4 shrink-0 text-gray-400 transition-transform",
                        expanded && "rotate-180",
                      )}
                      strokeWidth={2}
                    />
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[14px] font-bold text-gray-900">
                          {product.name}
                        </span>
                        <span className="text-[12px] font-medium text-gray-400">
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
                        {product.isPromotionActive && product.discountRate > 0 && (
                          <span className="inline-flex h-6 items-center rounded-md bg-blue-50 px-2 text-[11px] font-semibold text-blue-700">
                            {product.discountRate}% 할인 중
                          </span>
                        )}
                        {product.isPromotionActive && product.bonusRate > 0 && (
                          <span className="inline-flex h-6 items-center rounded-md bg-emerald-50 px-2 text-[11px] font-semibold text-emerald-700">
                            크레딧 +{product.bonusRate}% 중
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-[12px] text-gray-500">
                        현재 결제금액 {product.price.toLocaleString("ko-KR")}원 ·{" "}
                        {product.bonusCredits > 0 ? (
                          <>
                            지급{" "}
                            <span className="font-semibold text-emerald-600">
                              {product.grantedCreditAmount.toLocaleString("ko-KR")}C
                            </span>{" "}
                            (+{product.bonusCredits.toLocaleString("ko-KR")}C) ·{" "}
                          </>
                        ) : null}
                        자동출제 약{" "}
                        {product.estimatedAutoQuestionCount.toLocaleString("ko-KR")}
                        문항 · 문항당{" "}
                        {product.perAutoQuestion.toLocaleString("ko-KR")}원
                      </p>
                    </div>
                  </button>

                  {expanded && (
                    <div className="flex shrink-0 items-center gap-3">
                      <ToggleSwitch
                        checked={form.isActive}
                        onChange={(v) =>
                          updateProductField(product.id, "isActive", v)
                        }
                        label="결제 화면 노출"
                      />
                      <SaveButton
                        onClick={() => saveProduct(product)}
                        saving={saving}
                      />
                    </div>
                  )}
                </div>

                {/* Collapsible body — 좌: 기본 설정 / 우: 프로모션 (넓은 화면 2단) */}
                {expanded && (
                  <div className="grid gap-5 border-t border-gray-200/70 px-4 pb-4 pt-4 lg:grid-cols-2 lg:items-start">
                    <section className="space-y-3">
                      <ProductSectionLabel icon={Coins} title="기본 설정" />
                      <div className="grid gap-3 md:grid-cols-2">
                        <AdminField label="상품명">
                          <input
                            value={form.name}
                            onChange={(event) =>
                              updateProductField(
                                product.id,
                                "name",
                                event.target.value,
                              )
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
                        <AdminField label="크레딧 소멸기한 (일)">
                          <input
                            type="number"
                            min={0}
                            step={1}
                            placeholder="0 = 무기한"
                            value={form.expiryDays}
                            onChange={(event) =>
                              updateProductField(
                                product.id,
                                "expiryDays",
                                event.target.value,
                              )
                            }
                            className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-[13px] outline-none transition focus:border-blue-300"
                          />
                          <p className="mt-1 text-[11px] leading-4 text-gray-400">
                            결제일 기준 유효일수. 구매 시 잔여 소멸기한에 더해
                            갱신됩니다. 비우거나 0이면 무기한.
                          </p>
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
                      </div>
                      <AdminField label="상품 설명">
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
                    </section>

                    <section className="space-y-3">
                      <div className="flex items-center gap-2">
                        <ProductSectionLabel icon={Tag} title="프로모션" />
                        {product.promotions.length > 0 && (
                          <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold text-gray-500 tabular-nums">
                            {product.promotions.length}
                          </span>
                        )}
                      </div>

                      <ProductPromotionSummary promotions={product.promotions} />
                    </section>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      )}

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

      {isPayments && (
      <>
      <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-gray-900">
              충전 내역
            </h2>
            <p className="mt-0.5 text-[12px] text-gray-400">
              총 {totalTopUps.toLocaleString("ko-KR")}건 ·{" "}
              {Math.min(page, Math.max(1, Math.ceil(totalTopUps / TOPUPS_PAGE_SIZE)))}/
              {Math.max(1, Math.ceil(totalTopUps / TOPUPS_PAGE_SIZE))} 페이지 · 행을
              클릭하면 결제 상세가 열립니다
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

        <AdminPagination
          page={page}
          totalPages={Math.max(1, Math.ceil(totalTopUps / TOPUPS_PAGE_SIZE))}
          disabled={isPending}
          onChange={goToPage}
        />
      </div>

      <Dialog
        open={!!selectedTopUpId}
        onOpenChange={(next) => {
          if (!next) {
            setSelectedTopUpId(null);
            setShowCancelForm(false);
          }
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="gap-0 overflow-y-auto p-0 sm:max-w-[880px] lg:max-w-[1180px]"
        >
          <DialogTitle className="sr-only">결제 상세</DialogTitle>
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
            manualCompleting={manualCompleting}
            onOpenManualComplete={() => setShowManualComplete(true)}
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
        </DialogContent>
      </Dialog>
      <ManualCompleteModal
        open={showManualComplete}
        submitting={manualCompleting}
        topUp={
          selectedTopUp
            ? {
                id: selectedTopUp.id,
                price: selectedTopUp.price,
                creditAmount: selectedTopUp.creditAmount,
                academyName: selectedTopUp.academy.name,
                depositorName: readDepositorName(selectedTopUp.customData),
                createdAt: selectedTopUp.createdAt,
              }
            : null
        }
        candidates={selectedTopUp?.manualGrantCandidates ?? []}
        duplicates={selectedTopUp?.duplicateNotificationCandidates ?? []}
        onSubmit={manualCompleteSelectedTopUp}
        onClose={() => setShowManualComplete(false)}
      />
      </>
      )}
    </div>
  );
}

/** 무통장입금 주문의 customData 에 저장된 입금자명. */
function readDepositorName(customData: unknown): string | null {
  if (customData && typeof customData === "object" && !Array.isArray(customData)) {
    const v = (customData as Record<string, unknown>).depositorName;
    if (typeof v === "string" && v) return v;
  }
  return null;
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
  manualCompleting,
  showCancelForm,
  cancelReason,
  refundBank,
  refundAccountNumber,
  refundHolderName,
  refundHolderPhoneNumber,
  onOpenManualComplete,
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
  manualCompleting: boolean;
  showCancelForm: boolean;
  cancelReason: string;
  refundBank: string;
  refundAccountNumber: string;
  refundHolderName: string;
  refundHolderPhoneNumber: string;
  onOpenManualComplete: () => void;
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
  // 서버가 판정한다(미지급 + 입금대기/결제대기). 필드가 없는 옛 응답은 보수적으로 숨김.
  const canManualComplete = Boolean(topUp?.canManualComplete);
  const canCloseVirtualAccount =
    topUp?.status === "WAITING_FOR_DEPOSIT" &&
    topUp.paymentMethod === "VIRTUAL_ACCOUNT";
  const needsRefundAccount = topUp?.paymentMethod === "VIRTUAL_ACCOUNT";

  return (
    <div className="bg-white">
      <div className="border-b border-gray-100 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[15px] font-semibold text-gray-900">
              결제 상세
            </h2>
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
          <div className="flex items-center gap-2">
            {topUp && (
            <div className="flex flex-wrap items-center gap-2">
              {canManualComplete && (
                <button
                  type="button"
                  onClick={onOpenManualComplete}
                  disabled={manualCompleting || syncing || cancelling}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-2.5 text-[12px] font-semibold text-teal-700 shadow-sm transition hover:border-teal-300 hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ShieldCheck className="size-3.5" strokeWidth={2} />
                  수동 충전 완료
                </button>
              )}
              <button
              type="button"
              onClick={onSync}
              disabled={!canSync || syncing || cancelling || closingVirtualAccount}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 text-[12px] font-semibold text-gray-700 shadow-sm transition hover:border-blue-200 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
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
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-rose-100 bg-rose-50 px-2.5 text-[12px] font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
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
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-amber-100 bg-amber-50 px-2.5 text-[12px] font-semibold text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <XCircle
                className={cn("size-3.5", closingVirtualAccount && "animate-pulse")}
                strokeWidth={2}
              />
              가상계좌 말소
            </button>
            </div>
            )}
            <DialogClose className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
              <X className="size-4" strokeWidth={2} />
              <span className="sr-only">닫기</span>
            </DialogClose>
          </div>
        </div>
        <p className="mt-1.5 text-[12px] text-gray-400">
          상태 검증 및 운영 처리
        </p>
      </div>

      {!topUp ? (
        <div className="px-5 py-12 text-center text-[13px] text-gray-400">
          {loading ? "상세 내역을 불러오는 중입니다" : "충전 내역을 선택해주세요"}
        </div>
      ) : (
        <div className="grid gap-5 p-5 lg:grid-cols-3 lg:items-start">
          {/* 왼쪽: 결제 정보 · 운영 처리 */}
          <div className="space-y-5">
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
          </div>

          {/* 오른쪽: 웹훅 · 크레딧 감사 로그 */}
          <div className="space-y-5">
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

          {/* 오른쪽 3열: 학원 크레딧 사용 로그 (전체·페이지네이션) */}
          <div className="space-y-5">
            <AcademyCreditActivitySection
              key={topUp.id}
              academyId={topUp.academyId}
              initialItems={topUp.academyCreditActivity}
              initialTotal={topUp.academyActivityTotal}
              pageSize={topUp.academyActivityPageSize}
              usageSummary={topUp.academyUsageSummary}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function AcademyCreditActivitySection({
  academyId,
  initialItems,
  initialTotal,
  pageSize,
  usageSummary,
}: {
  academyId: string;
  initialItems: AdminCreditActivity[];
  initialTotal: number;
  pageSize: number;
  usageSummary: { totalConsumed: number; consumptionCount: number };
}) {
  const [page, setPage] = useState(1);
  const [items, setItems] = useState(initialItems);
  const [total, setTotal] = useState(initialTotal);
  const [loading, setLoading] = useState(false);
  const totalPages = Math.max(1, Math.ceil(total / Math.max(pageSize, 1)));

  async function goToPage(next: number) {
    if (next === page || loading || next < 1 || next > totalPages) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/credits/academies/${academyId}/credit-activity?page=${next}&pageSize=${pageSize}`,
      );
      if (!res.ok) throw new Error("failed");
      const data = (await res.json()) as {
        items: AdminCreditActivity[];
        total: number;
      };
      setItems(data.items);
      setTotal(data.total);
      setPage(next);
    } catch {
      // 조회 실패 시 현재 페이지 유지
    } finally {
      setLoading(false);
    }
  }

  return (
    <DetailSection
      title={
        <span className="flex items-center justify-between gap-2">
          <span>학원 크레딧 사용 로그</span>
          <span className="text-[11px] font-normal text-gray-400">
            누적 사용 {usageSummary.totalConsumed.toLocaleString("ko-KR")}C ·{" "}
            {usageSummary.consumptionCount.toLocaleString("ko-KR")}건
          </span>
        </span>
      }
    >
      {items.length === 0 ? (
        <EmptyLine text="크레딧 활동 내역이 없습니다" />
      ) : (
        <>
          <div className={cn("space-y-2 transition-opacity", loading && "opacity-40")}>
            {items.map((tx) => (
              <div
                key={tx.id}
                className="rounded-lg border border-gray-100 px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="shrink-0 rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">
                      {getTransactionTypeLabel(tx.type)}
                    </span>
                    {tx.operationType && (
                      <span className="truncate text-[11px] text-gray-500">
                        {getOperationTypeLabel(tx.operationType)}
                      </span>
                    )}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 text-[12px] font-semibold",
                      tx.amount < 0 ? "text-rose-700" : "text-blue-700",
                    )}
                  >
                    {tx.amount > 0 ? "+" : ""}
                    {tx.amount.toLocaleString("ko-KR")}C
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-[11px] text-gray-400">
                    {tx.description ?? formatDate(tx.createdAt)}
                  </span>
                  <span className="shrink-0 text-[11px] text-gray-400">
                    잔고 {tx.balanceAfter.toLocaleString("ko-KR")}C
                  </span>
                </div>
                {tx.description && (
                  <div className="mt-0.5 text-[11px] text-gray-400">
                    {formatDate(tx.createdAt)}
                  </div>
                )}
              </div>
            ))}
          </div>
          {totalPages > 1 && (
            <AdminPagination
              page={page}
              totalPages={totalPages}
              disabled={loading}
              onChange={goToPage}
            />
          )}
          <div className="text-center text-[11px] text-gray-400">
            전체 {total.toLocaleString("ko-KR")}건 · {page}/{totalPages} 페이지
          </div>
        </>
      )}
    </DetailSection>
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
  title: ReactNode;
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


/**
 * 상품 블록 내 프로모션 요약 — CRUD는 /admin/promotions(프로모션 관리)로 이동했고,
 * 여기서는 적용 중 개수와 관리 탭으로 가는 링크만 노출한다.
 */
function ProductPromotionSummary({
  promotions,
}: {
  promotions: AdminPromotionView[];
}) {
  const running = promotions.filter((p) => p.isInWindow).length;
  return (
    <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-3">
      <p className="text-[13px] font-semibold text-gray-800">
        적용 중 프로모션 {running.toLocaleString("ko-KR")}개
        <span className="ml-1.5 text-[11px] font-medium text-gray-400">
          · 등록 {promotions.length.toLocaleString("ko-KR")}개
        </span>
      </p>
      <p className="text-[11px] leading-4 text-gray-400">
        프로모션의 생성·편집·링크 발급은 프로모션 관리에서 합니다.
      </p>
      <Link
        href="/admin/promotions"
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 text-[12px] font-semibold text-blue-700 transition hover:bg-blue-100"
      >
        <Tag className="size-3.5" strokeWidth={2} />
        프로모션 관리에서 편집
      </Link>
    </div>
  );
}

function ProductSectionLabel({
  icon: Icon,
  title,
}: {
  icon: typeof Coins;
  title: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="size-3.5 text-gray-400" strokeWidth={2} />
      <span className="text-[12px] font-bold uppercase tracking-wide text-gray-500">
        {title}
      </span>
    </div>
  );
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

