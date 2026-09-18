"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminEmptyState } from "@/components/admin/kit";
import { cn } from "@/lib/utils";
import { getOperationTypeLabel, getTransactionTypeLabel } from "@/lib/admin-members-labels";
import { formatKstDateTimeShort } from "@/lib/admin-kst-format";
import type {
  AdminCreditActivity,
  AdminRelatedCreditTransaction,
  AdminWebhookEvent,
} from "./types";

// 결제 상세 팝업의 작은 구역 부품 — 값 카드·라벨 행·구역 제목·웹훅/크레딧 로그 목록.

export function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/50 px-3 py-2">
      <div className="text-[11px] font-medium text-gray-400">{label}</div>
      <div className="mt-1 truncate text-[13px] font-semibold tabular-nums text-gray-900">{value}</div>
    </div>
  );
}

export function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
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

export function DetailSection({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[12px] font-semibold text-gray-800">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

export function WebhookEventsSection({ events }: { events: AdminWebhookEvent[] }) {
  return (
    <DetailSection title="웹훅 이력">
      {events.length === 0 ? (
        <AdminEmptyState compact title="수신된 웹훅이 없습니다" />
      ) : (
        events.map((event) => (
          <div key={event.id} className="rounded-lg border border-gray-100 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[12px] font-semibold text-gray-800">{event.eventType}</span>
              <span className="text-[11px] text-gray-400">{event.status}</span>
            </div>
            <div className="mt-1 text-[11px] text-gray-400">{formatKstDateTimeShort(event.receivedAt)}</div>
            {event.errorMessage && (
              <div className="mt-1 text-[11px] text-rose-600">{event.errorMessage}</div>
            )}
          </div>
        ))
      )}
    </DetailSection>
  );
}

export function CreditLogSection({ transactions }: { transactions: AdminRelatedCreditTransaction[] }) {
  return (
    <DetailSection title="크레딧 감사 로그">
      {transactions.length === 0 ? (
        <AdminEmptyState compact title="연결된 크레딧 로그가 없습니다" />
      ) : (
        transactions.map((tx) => (
          <div key={tx.id} className="rounded-lg border border-gray-100 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span
                className={cn(
                  "text-[12px] font-semibold tabular-nums",
                  tx.amount < 0 ? "text-rose-700" : "text-blue-700",
                )}
              >
                {tx.amount > 0 ? "+" : ""}
                {tx.amount.toLocaleString("ko-KR")}C
              </span>
              <span className="text-[11px] tabular-nums text-gray-400">
                잔고 {tx.balanceAfter.toLocaleString("ko-KR")}C
              </span>
            </div>
            <div className="mt-1 text-[11px] text-gray-500">{tx.description ?? tx.type}</div>
            <div className="mt-1 text-[11px] text-gray-400">{formatKstDateTimeShort(tx.createdAt)}</div>
          </div>
        ))
      )}
    </DetailSection>
  );
}

/** 학원 크레딧 사용 로그 — 팝업 안에서 자체 페이지네이션(API 조회). */
export function AcademyCreditActivitySection({
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
      const data = (await res.json()) as { items: AdminCreditActivity[]; total: number };
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
          <span className="text-[11px] font-normal tabular-nums text-gray-400">
            누적 사용 {usageSummary.totalConsumed.toLocaleString("ko-KR")}C ·{" "}
            {usageSummary.consumptionCount.toLocaleString("ko-KR")}건
          </span>
        </span>
      }
    >
      {items.length === 0 ? (
        <AdminEmptyState compact title="크레딧 활동 내역이 없습니다" />
      ) : (
        <>
          <div className={cn("space-y-2 transition-opacity", loading && "opacity-60")}>
            {items.map((tx) => (
              <div key={tx.id} className="rounded-lg border border-gray-100 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="shrink-0 rounded-md bg-gray-100 px-1.5 py-0.5 text-[11px] font-semibold text-gray-500">
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
                      "shrink-0 text-[12px] font-semibold tabular-nums",
                      tx.amount < 0 ? "text-rose-700" : "text-blue-700",
                    )}
                  >
                    {tx.amount > 0 ? "+" : ""}
                    {tx.amount.toLocaleString("ko-KR")}C
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-[11px] text-gray-400">
                    {tx.description ?? formatKstDateTimeShort(tx.createdAt)}
                  </span>
                  <span className="shrink-0 text-[11px] tabular-nums text-gray-400">
                    잔고 {tx.balanceAfter.toLocaleString("ko-KR")}C
                  </span>
                </div>
                {tx.description && (
                  <div className="mt-0.5 text-[11px] text-gray-400">{formatKstDateTimeShort(tx.createdAt)}</div>
                )}
              </div>
            ))}
          </div>
          {totalPages > 1 && (
            <AdminPagination page={page} totalPages={totalPages} disabled={loading} onChange={goToPage} />
          )}
          <div className="text-center text-[11px] text-gray-400">
            전체 {total.toLocaleString("ko-KR")}건 · {page}/{totalPages} 페이지
          </div>
        </>
      )}
    </DetailSection>
  );
}
