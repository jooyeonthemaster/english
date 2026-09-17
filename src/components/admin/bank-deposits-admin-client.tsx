"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { Banknote, HandCoins, Link2, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AdminEmptyState,
  DataTable,
  DataTableBody,
  DataTableEmpty,
  DataTableHeader,
  FilterBar,
  FilterChipGroup,
  PageHeader,
  StatusBadge,
  Td,
  Th,
  Tr,
} from "@/components/admin/kit";
import { AdminHoverDetail } from "@/components/admin/hover-detail/admin-hover-detail";
import { BANK_DEPOSIT_STATUS, labelOf } from "@/lib/admin-labels";
import { cn } from "@/lib/utils";
import { depositRowDetail } from "./bank-deposits-admin-client-parts/deposit-hover-detail";
import { MatchOrderRow } from "./bank-deposits-admin-client-parts/match-order-row";
import { PendingOrdersPanel } from "./bank-deposits-admin-client-parts/pending-orders-panel";
import {
  formatShortDateTime,
  type DepositNotification,
  type PendingOrder,
} from "./bank-deposits-admin-client-parts/types";

// 결제 관리 > 입금 확인 탭. 은행 입금 문자 중 자동 매칭되지 못한 입금을 확인해
// 주문에 연결(match) · 수동지급 기록(manual_grant) · 무시(ignore) 한다.

const STATUS_FILTER_KEYS = [
  "UNMATCHED",
  "AMBIGUOUS",
  "FAILED",
  "MATCHED",
  "MANUAL_GRANT",
  "IGNORED",
] as const;

type FilterKey = "ACTION" | (typeof STATUS_FILTER_KEYS)[number] | "ALL";

// 상태 라벨은 레지스트리(BANK_DEPOSIT_STATUS)에서 가져온다. ACTION = 미매칭+확인 필요+처리 실패.
const FILTERS: ReadonlyArray<{ key: FilterKey; label: string; tone?: "alert" }> = [
  { key: "ACTION", label: "미처리", tone: "alert" },
  ...STATUS_FILTER_KEYS.map((key) => ({ key, label: labelOf(BANK_DEPOSIT_STATUS, key) })),
  { key: "ALL", label: "전체" },
];

const VALID_FILTERS = new Set<string>(FILTERS.map((f) => f.key));
const COLUMN_COUNT = 7;
const DESCRIPTION =
  "은행 입금 문자 중 자동 매칭되지 못한 입금을 확인하고 수동으로 주문에 연결하거나 무시합니다.";

function isActionable(status: string) {
  return status === "UNMATCHED" || status === "AMBIGUOUS" || status === "FAILED";
}

export function BankDepositsAdminClient({
  initialStatus,
  focusPending = false,
  hideTitle = false,
  onActionCountChange,
}: {
  /** 대시보드 등에서 넘어올 때 초기 필터(status) */
  initialStatus?: string;
  /** 입금 대기 주문 패널을 상단에 강조 표시(대시보드 "입금 대기"에서 진입) */
  focusPending?: boolean;
  /** 결제 관리 탭 안에 들어갈 때 페이지 제목 숨김(탭이 제목 역할) */
  hideTitle?: boolean;
  /** 처리 필요(미매칭+확인 필요+처리 실패) 건수가 갱신될 때 — 탭 배지용 */
  onActionCountChange?: (count: number) => void;
}) {
  const [filter, setFilter] = useState<FilterKey>(
    initialStatus && VALID_FILTERS.has(initialStatus) ? (initialStatus as FilterKey) : "UNMATCHED",
  );
  const [notifications, setNotifications] = useState<DepositNotification[]>([]);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [matchingFor, setMatchingFor] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/credits/bank-deposits?status=${filter}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications);
        setPendingOrders(data.pendingOrders);
        setCounts(data.counts ?? {});
        onActionCountChange?.(data.counts?.ACTION ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [filter, onActionCountChange]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const act = useCallback(
    async (id: string, body: Record<string, unknown>) => {
      setBusyId(id);
      try {
        const res = await fetch(`/api/admin/credits/bank-deposits/${id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "처리에 실패했습니다.");
        toast.success(
          data.status === "MATCHED"
            ? data.credited
              ? `크레딧을 지급했습니다. (잔액 ${data.balanceAfter?.toLocaleString("ko-KR")})`
              : "이미 지급된 주문입니다."
            : data.status === "MANUAL_GRANT"
              ? "수동지급 처리했습니다. (크레딧은 별도로 이미 지급됨)"
              : "무시 처리했습니다.",
        );
        setMatchingFor(null);
        await fetchData();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "처리 중 오류가 발생했습니다.");
      } finally {
        setBusyId(null);
      }
    },
    [fetchData],
  );

  // "전체" 칩에는 건수를 붙이지 않는다(API counts 에 ALL 이 없고, 있어도 의미가 다름).
  const chipCounts = Object.fromEntries(
    Object.entries(counts).filter(([key]) => key !== "ALL"),
  ) as Partial<Record<FilterKey, number>>;
  const initialLoading = loading && notifications.length === 0;

  return (
    <div className="space-y-6">
      {hideTitle ? (
        <p className="text-[12px] text-gray-400">{DESCRIPTION}</p>
      ) : (
        <PageHeader title="입금 확인" description={DESCRIPTION} />
      )}

      {focusPending && <PendingOrdersPanel orders={pendingOrders} />}

      <FilterBar
        right={
          <Button type="button" variant="outline" size="sm" onClick={() => void fetchData()}>
            <RefreshCw className={cn("size-4", loading && "animate-spin")} strokeWidth={2} />
            새로고침
          </Button>
        }
      >
        <FilterChipGroup
          options={FILTERS}
          value={filter}
          onChange={setFilter}
          counts={chipCounts}
          ariaLabel="입금 상태 필터"
        />
      </FilterBar>

      <div className={cn("transition-opacity", loading && !initialLoading && "opacity-60")}>
        <DataTable minWidth={860}>
          <DataTableHeader>
            <Tr>
              <Th>수신시각</Th>
              <Th align="right">금액</Th>
              <Th>입금자명</Th>
              <Th>은행</Th>
              <Th>상태</Th>
              <Th>원문 / 비고</Th>
              <Th align="right">처리</Th>
            </Tr>
          </DataTableHeader>
          <DataTableBody>
            {initialLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Tr key={i} className="hover:bg-transparent">
                  <Td colSpan={COLUMN_COUNT}>
                    <Skeleton className="h-5 w-full rounded-md" />
                  </Td>
                </Tr>
              ))
            ) : notifications.length === 0 ? (
              <DataTableEmpty colSpan={COLUMN_COUNT}>
                <AdminEmptyState icon={Banknote} title="해당하는 입금 내역이 없습니다" />
              </DataTableEmpty>
            ) : (
              notifications.map((n) => {
                const busy = busyId === n.id;
                return (
                  <Fragment key={n.id}>
                    <AdminHoverDetail
                      title={`${n.amount.toLocaleString("ko-KR")}원 입금`}
                      detail={depositRowDetail(n, labelOf(BANK_DEPOSIT_STATUS, n.status))}
                    >
                      <Tr clickable className="[&>td]:align-top">
                        <Td muted className="whitespace-nowrap">
                          {formatShortDateTime(n.receivedAt)}
                        </Td>
                        <Td align="right" className="font-bold">
                          {n.amount.toLocaleString("ko-KR")}원
                        </Td>
                        <Td className="text-[12px]">{n.depositorName ?? "-"}</Td>
                        <Td muted>{n.bankName ?? "-"}</Td>
                        <Td>
                          <StatusBadge map={BANK_DEPOSIT_STATUS} value={n.status} />
                          {n.matchedAcademy && (
                            <div className="mt-1 text-[11px] text-gray-400">{n.matchedAcademy}</div>
                          )}
                        </Td>
                        <Td className="max-w-[260px] whitespace-normal text-[11px] text-gray-400">
                          <div className="line-clamp-2">{n.rawText}</div>
                          {n.note && <div className="mt-0.5 text-amber-600">{n.note}</div>}
                        </Td>
                        <Td align="right" data-no-detail>
                          {isActionable(n.status) ? (
                            <div className="flex justify-end gap-1.5">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={busy}
                                onClick={() => setMatchingFor(matchingFor === n.id ? null : n.id)}
                                className="text-blue-700 hover:text-blue-800"
                              >
                                <Link2 className="size-3.5" strokeWidth={2} />
                                주문 연결
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={busy}
                                onClick={() => void act(n.id, { action: "manual_grant" })}
                                title="이미 수동으로 크레딧을 지급한 입금 — 상태만 '수동지급'으로 기록(재지급 안 함)"
                                className="text-teal-700 hover:text-teal-800"
                              >
                                <HandCoins className="size-3.5" strokeWidth={2} />
                                수동지급
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={busy}
                                onClick={() => void act(n.id, { action: "ignore" })}
                              >
                                <X className="size-3.5" strokeWidth={2} />
                                무시
                              </Button>
                            </div>
                          ) : (
                            <span className="text-[11px] text-gray-300">-</span>
                          )}
                        </Td>
                      </Tr>
                    </AdminHoverDetail>
                    {matchingFor === n.id && (
                      <MatchOrderRow
                        amount={n.amount}
                        pendingOrders={pendingOrders}
                        busy={busy}
                        colSpan={COLUMN_COUNT}
                        onMatch={(topUpId) => void act(n.id, { action: "match", topUpId })}
                      />
                    )}
                  </Fragment>
                );
              })
            )}
          </DataTableBody>
        </DataTable>
      </div>
    </div>
  );
}
