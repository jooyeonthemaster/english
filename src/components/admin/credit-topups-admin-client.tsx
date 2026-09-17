"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { RefObject } from "react";
import { toast } from "sonner";
import { AdminDialog } from "@/components/admin/kit";
import {
  ManualCompleteModal,
  type ManualCompletePayload,
} from "@/components/admin/credit-topups-admin-parts/manual-complete-modal";
import { markFailedTopUpReviewed } from "@/actions/admin/detail/payments";
import { PaymentMetricCards } from "./credit-topups-admin-client-parts/metric-cards";
import { ReviewReadinessStrip } from "./credit-topups-admin-client-parts/review-readiness-strip";
import { TopUpsTable } from "./credit-topups-admin-client-parts/topups-table";
import {
  TopUpDetailActions,
  TopUpDetailPanel,
} from "./credit-topups-admin-client-parts/topup-detail-panel";
import { readDepositorName, TopUpStatusBadge } from "./credit-topups-admin-client-parts/topup-status";
import {
  TOPUPS_PAGE_SIZE,
  ZERO_STATS,
  type AdminTopUp,
  type AdminTopUpDetail,
  type AdminTopUpStats,
} from "./credit-topups-admin-client-parts/types";

// 결제 관리 > 충전 내역 탭. 실시간 스트림·지표·표·결제 상세 팝업(재조회/환불/수동 완료/가상계좌 말소).
// 상품 관리는 products-admin-client.tsx 로 분리됐다.

export type PaymentsLiveState = { connected: boolean; refreshing: boolean };

interface Props {
  initialTopUps?: AdminTopUp[];
  initialStats?: AdminTopUpStats;
  initialTopUpsTotal?: number;
  /** 페이지 머리의 연결 상태 뱃지·새로고침 스피너를 부모(PageHeader)가 그리도록 상태를 올려보낸다. */
  onLiveStateChange?: (state: PaymentsLiveState) => void;
  /** 부모의 새로고침 버튼이 호출할 함수를 여기에 등록한다. */
  refreshRef?: RefObject<() => void>;
}

export function CreditTopUpsAdminClient({
  initialTopUps = [],
  initialStats = ZERO_STATS,
  initialTopUpsTotal,
  onLiveStateChange,
  refreshRef,
}: Props) {
  const [topUps, setTopUps] = useState(initialTopUps);
  const [stats, setStats] = useState(initialStats);
  const [page, setPage] = useState(1);
  const [totalTopUps, setTotalTopUps] = useState(initialTopUpsTotal ?? initialTopUps.length);
  const pageRef = useRef(1);
  const [connected, setConnected] = useState(false);
  // 상세는 모달이므로 기본은 닫힘(null). 행을 클릭해야 열린다.
  const [selectedTopUpId, setSelectedTopUpId] = useState<string | null>(null);
  const [selectedTopUp, setSelectedTopUp] = useState<AdminTopUpDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [closingVirtualAccount, setClosingVirtualAccount] = useState(false);
  const [showManualComplete, setShowManualComplete] = useState(false);
  const [manualCompleting, setManualCompleting] = useState(false);
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState("고객 요청");
  const [refundBank, setRefundBank] = useState("SHINHAN");
  const [refundAccountNumber, setRefundAccountNumber] = useState("");
  const [refundHolderName, setRefundHolderName] = useState("");
  const [refundHolderPhoneNumber, setRefundHolderPhoneNumber] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
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
  }, []);

  useEffect(() => {
    onLiveStateChange?.({ connected, refreshing: isPending });
  }, [connected, isPending, onLiveStateChange]);

  // The payment detail opens as a modal on row click — no auto-selection, so
  // it stays closed until an admin picks a row.
  useEffect(() => {
    if (!selectedTopUpId) {
      setSelectedTopUp(null);
      return;
    }
    void loadTopUpDetail(selectedTopUpId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTopUpId]);

  const latestCompleted = useMemo(
    () => topUps.find((item) => item.status === "COMPLETED") ?? null,
    [topUps],
  );
  const totalPages = Math.max(1, Math.ceil(totalTopUps / TOPUPS_PAGE_SIZE));

  async function loadTopUpDetail(topUpId: string) {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/credits/top-ups/${topUpId}`, { cache: "no-store" });
      if (!res.ok) throw new Error("상세 내역을 불러오지 못했습니다.");
      const data = (await res.json()) as { topUp: AdminTopUpDetail };
      setSelectedTopUp(data.topUp);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "상세 내역을 불러오지 못했습니다.");
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
        await loadTopUpDetail(selectedTopUpId);
      }
    });
  }

  function refresh() {
    fetchTopUpsPage(pageRef.current, true);
  }

  // 부모 PageHeader 의 새로고침 버튼이 최신 closure 를 부르도록 매 렌더마다 갱신한다.
  useEffect(() => {
    if (refreshRef) refreshRef.current = refresh;
  });

  function goToPage(targetPage: number) {
    const next = Math.min(Math.max(targetPage, 1), totalPages);
    if (next === pageRef.current) return;
    fetchTopUpsPage(next);
  }

  async function syncSelectedTopUp() {
    if (!selectedTopUpId) return;
    setSyncing(true);
    const toastId = toast.loading("포트원 결제 상태를 재조회 중입니다.");
    try {
      const res = await fetch(`/api/admin/credits/top-ups/${selectedTopUpId}/sync`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "포트원 재조회에 실패했습니다.");
      setSelectedTopUp(data.topUp);
      toast.success("포트원 결제 상태를 최신 값으로 동기화했습니다.", { id: toastId });
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "포트원 재조회에 실패했습니다.", {
        id: toastId,
      });
    } finally {
      setSyncing(false);
    }
  }

  async function cancelSelectedTopUp() {
    if (!selectedTopUpId || !selectedTopUp) return;
    setCancelling(true);
    const toastId = toast.loading("포트원 결제 취소를 요청 중입니다.");
    try {
      const needsRefundAccount = selectedTopUp.paymentMethod === "VIRTUAL_ACCOUNT";
      const res = await fetch(`/api/admin/credits/top-ups/${selectedTopUpId}/cancel`, {
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
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "결제 취소에 실패했습니다.");
      setSelectedTopUp(data.topUp);
      setShowCancelForm(false);
      toast.success(
        data.result?.cancellation?.status === "SUCCEEDED"
          ? "결제 취소와 크레딧 회수가 완료되었습니다."
          : "결제 취소 요청이 접수되었습니다.",
        { id: toastId },
      );
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "결제 취소에 실패했습니다.", { id: toastId });
    } finally {
      setCancelling(false);
    }
  }

  // 시스템 밖에서 이미 지급한 건을 주문에 반영한다. 크레딧은 추가 지급하지 않는다.
  async function manualCompleteSelectedTopUp(payload: ManualCompletePayload) {
    if (!selectedTopUpId) return;
    setManualCompleting(true);
    const toastId = toast.loading("수동 충전 완료 처리 중입니다.");
    try {
      const res = await fetch(`/api/admin/credits/top-ups/${selectedTopUpId}/manual-complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "수동 완료 처리에 실패했습니다.");
      setSelectedTopUp(data.topUp);
      setShowManualComplete(false);
      toast.success("수동 충전 완료로 처리했습니다. 고객 화면과 매출 집계에 반영됩니다.", {
        id: toastId,
      });
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "수동 완료 처리에 실패했습니다.", {
        id: toastId,
      });
    } finally {
      setManualCompleting(false);
    }
  }

  async function closeSelectedVirtualAccount() {
    if (!selectedTopUpId) return;
    setClosingVirtualAccount(true);
    const toastId = toast.loading("가상계좌 말소를 요청 중입니다.");
    try {
      const res = await fetch(
        `/api/admin/credits/top-ups/${selectedTopUpId}/close-virtual-account`,
        { method: "POST" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "가상계좌 말소에 실패했습니다.");
      setSelectedTopUp(data.topUp);
      toast.success("입금 전 가상계좌를 말소하고 충전 요청을 취소했습니다.", { id: toastId });
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "가상계좌 말소에 실패했습니다.", {
        id: toastId,
      });
    } finally {
      setClosingVirtualAccount(false);
    }
  }

  function selectTopUp(topUpId: string) {
    setSelectedTopUpId(topUpId);
    setShowCancelForm(false);
  }

  function closeDetail() {
    setSelectedTopUpId(null);
    setShowCancelForm(false);
  }

  return (
    <div className="space-y-6">
      <PaymentMetricCards
        stats={stats}
        latestCompleted={latestCompleted}
        onFailedRowAction={async (topUpId, reviewed) => {
          await markFailedTopUpReviewed(topUpId, reviewed);
          setStats((prev) => ({
            ...prev,
            failedCount: Math.max(0, prev.failedCount + (reviewed ? -1 : 1)),
          }));
        }}
      />

      <ReviewReadinessStrip />

      <TopUpsTable
        topUps={topUps}
        selectedId={selectedTopUpId}
        onSelect={selectTopUp}
        page={page}
        totalPages={totalPages}
        total={totalTopUps}
        pending={isPending}
        onPageChange={goToPage}
      />

      <AdminDialog
        open={!!selectedTopUpId}
        onOpenChange={(next) => {
          if (!next) closeDetail();
        }}
        size="xl"
        title={
          <span className="flex flex-wrap items-center gap-2">
            결제 상세
            {selectedTopUp && <TopUpStatusBadge topUp={selectedTopUp} />}
          </span>
        }
        description="상태 검증 및 운영 처리"
        bodyClassName="px-5 py-5"
        footer={
          selectedTopUp ? (
            <TopUpDetailActions
              topUp={selectedTopUp}
              busy={{ syncing, cancelling, closingVirtualAccount, manualCompleting }}
              onOpenManualComplete={() => setShowManualComplete(true)}
              onSync={syncSelectedTopUp}
              onOpenCancelForm={() => setShowCancelForm(true)}
              onCloseVirtualAccount={closeSelectedVirtualAccount}
            />
          ) : undefined
        }
      >
        <TopUpDetailPanel
          topUp={selectedTopUp}
          loading={detailLoading}
          cancelling={cancelling}
          cancelForm={{
            open: showCancelForm,
            reason: cancelReason,
            refundBank,
            refundAccountNumber,
            refundHolderName,
            refundHolderPhoneNumber,
          }}
          cancelHandlers={{
            onClose: () => setShowCancelForm(false),
            onSubmit: cancelSelectedTopUp,
            onReasonChange: setCancelReason,
            onRefundBankChange: setRefundBank,
            onRefundAccountNumberChange: setRefundAccountNumber,
            onRefundHolderNameChange: setRefundHolderName,
            onRefundHolderPhoneNumberChange: setRefundHolderPhoneNumber,
          }}
        />
      </AdminDialog>

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
    </div>
  );
}
