"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Banknote, CheckCircle2, Link2, RefreshCw, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Notification = {
  id: string;
  amount: number;
  depositorName: string | null;
  bankName: string | null;
  status: string;
  source: string;
  rawText: string;
  note: string | null;
  matchedTopUpId: string | null;
  matchedAcademy: string | null;
  occurredAt: string | null;
  receivedAt: string;
};

type PendingOrder = {
  id: string;
  price: number;
  creditAmount: number;
  depositorName: string | null;
  academyName: string;
  createdAt: string;
};

const STATUS_LABELS: Record<string, string> = {
  MATCHED: "지급 완료",
  UNMATCHED: "미매칭",
  AMBIGUOUS: "확인 필요",
  IGNORED: "무시됨",
  FAILED: "처리 실패",
};

const STATUS_STYLES: Record<string, string> = {
  MATCHED: "bg-emerald-50 text-emerald-700",
  UNMATCHED: "bg-amber-50 text-amber-700",
  AMBIGUOUS: "bg-orange-50 text-orange-700",
  IGNORED: "bg-gray-100 text-gray-500",
  FAILED: "bg-red-50 text-red-600",
};

const FILTERS = [
  { value: "UNMATCHED", label: "미매칭" },
  { value: "AMBIGUOUS", label: "확인 필요" },
  { value: "MATCHED", label: "지급 완료" },
  { value: "IGNORED", label: "무시됨" },
  { value: "ALL", label: "전체" },
];

export function BankDepositsAdminClient() {
  const [filter, setFilter] = useState("UNMATCHED");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [matchingFor, setMatchingFor] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

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
      }
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const act = useCallback(
    async (id: string, body: Record<string, unknown>) => {
      setBusyId(id);
      setMessage(null);
      try {
        const res = await fetch(`/api/admin/credits/bank-deposits/${id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "처리에 실패했습니다.");
        setMessage({
          type: "success",
          text:
            data.status === "MATCHED"
              ? data.credited
                ? `크레딧을 지급했습니다. (잔액 ${data.balanceAfter?.toLocaleString("ko-KR")})`
                : "이미 지급된 주문입니다."
              : "무시 처리했습니다.",
        });
        setMatchingFor(null);
        await fetchData();
      } catch (err) {
        setMessage({
          type: "error",
          text: err instanceof Error ? err.message : "처리 중 오류가 발생했습니다.",
        });
      } finally {
        setBusyId(null);
      }
    },
    [fetchData],
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-[20px] font-bold text-gray-900">
            <Banknote className="size-5 text-blue-600" strokeWidth={2} />
            무통장입금 검토
          </h1>
          <p className="mt-0.5 text-[13px] text-gray-400">
            자동 매칭되지 못한 입금 내역을 확인하고 수동으로 주문에 연결하거나 무시합니다.
          </p>
        </div>
        <button
          onClick={() => void fetchData()}
          className="flex h-9 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 text-[13px] font-medium text-gray-500 shadow-sm transition hover:border-gray-300 hover:text-gray-700"
        >
          <RefreshCw className="size-3.5" strokeWidth={1.8} />
          새로고침
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const active = filter === f.value;
          const count = f.value === "ALL" ? undefined : counts[f.value];
          return (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[12px] font-semibold transition",
                active
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-gray-200 bg-white text-gray-500 hover:border-blue-200",
              )}
            >
              {f.label}
              {typeof count === "number" && count > 0 && (
                <span className="rounded-full bg-gray-100 px-1.5 text-[10px] text-gray-500">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {message && (
        <div
          className={cn(
            "flex items-center gap-2 rounded-xl border px-4 py-3 text-[13px] font-medium",
            message.type === "success"
              ? "border-emerald-100 bg-emerald-50 text-emerald-700"
              : "border-red-100 bg-red-50 text-red-600",
          )}
        >
          {message.type === "success" ? (
            <CheckCircle2 className="size-4" strokeWidth={2} />
          ) : (
            <AlertCircle className="size-4" strokeWidth={2} />
          )}
          {message.text}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="size-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="py-16 text-center text-[13px] text-gray-400">
            해당하는 입금 내역이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left">
              <thead>
                <tr className="border-b border-gray-50 bg-gray-50/60 text-[11px] font-semibold text-gray-400">
                  <th className="px-5 py-3">수신시각</th>
                  <th className="px-4 py-3 text-right">금액</th>
                  <th className="px-4 py-3">입금자명</th>
                  <th className="px-4 py-3">은행</th>
                  <th className="px-4 py-3">상태</th>
                  <th className="px-4 py-3">원문 / 비고</th>
                  <th className="px-5 py-3 text-right">처리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {notifications.map((n) => {
                  const actionable = n.status === "UNMATCHED" || n.status === "AMBIGUOUS";
                  return (
                    <>
                      <tr key={n.id} className="align-top hover:bg-blue-50/20">
                        <td className="whitespace-nowrap px-5 py-3 text-[12px] text-gray-500">
                          {new Date(n.receivedAt).toLocaleString("ko-KR", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="px-4 py-3 text-right text-[13px] font-bold tabular-nums text-gray-900">
                          {n.amount.toLocaleString("ko-KR")}원
                        </td>
                        <td className="px-4 py-3 text-[12px] text-gray-700">
                          {n.depositorName ?? "-"}
                        </td>
                        <td className="px-4 py-3 text-[12px] text-gray-500">
                          {n.bankName ?? "-"}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              "inline-flex h-6 items-center rounded-md px-2 text-[11px] font-semibold",
                              STATUS_STYLES[n.status] ?? "bg-gray-100 text-gray-600",
                            )}
                          >
                            {STATUS_LABELS[n.status] ?? n.status}
                          </span>
                          {n.matchedAcademy && (
                            <div className="mt-1 text-[11px] text-gray-400">
                              {n.matchedAcademy}
                            </div>
                          )}
                        </td>
                        <td className="max-w-[260px] px-4 py-3 text-[11px] text-gray-400">
                          <div className="line-clamp-2">{n.rawText}</div>
                          {n.note && (
                            <div className="mt-0.5 text-orange-500">{n.note}</div>
                          )}
                        </td>
                        <td className="px-5 py-3 text-right">
                          {actionable ? (
                            <div className="flex justify-end gap-1.5">
                              <button
                                disabled={busyId === n.id}
                                onClick={() =>
                                  setMatchingFor(matchingFor === n.id ? null : n.id)
                                }
                                className="inline-flex h-7 items-center gap-1 rounded-md border border-blue-200 px-2 text-[11px] font-semibold text-blue-600 transition hover:bg-blue-50 disabled:opacity-50"
                              >
                                <Link2 className="size-3" strokeWidth={2} />
                                주문 연결
                              </button>
                              <button
                                disabled={busyId === n.id}
                                onClick={() => void act(n.id, { action: "ignore" })}
                                className="inline-flex h-7 items-center gap-1 rounded-md border border-gray-200 px-2 text-[11px] font-semibold text-gray-500 transition hover:bg-gray-50 disabled:opacity-50"
                              >
                                <X className="size-3" strokeWidth={2} />
                                무시
                              </button>
                            </div>
                          ) : (
                            <span className="text-[11px] text-gray-300">-</span>
                          )}
                        </td>
                      </tr>
                      {matchingFor === n.id && (
                        <tr key={`${n.id}-match`} className="bg-blue-50/30">
                          <td colSpan={7} className="px-5 py-3">
                            <p className="mb-2 text-[12px] font-semibold text-gray-600">
                              연결할 입금 대기 주문 선택 (금액 일치 항목이 위에 표시됨)
                            </p>
                            {pendingOrders.length === 0 ? (
                              <p className="text-[12px] text-gray-400">
                                입금 대기 중인 무통장입금 주문이 없습니다.
                              </p>
                            ) : (
                              <div className="flex flex-col gap-1.5">
                                {[...pendingOrders]
                                  .sort(
                                    (a, b) =>
                                      Number(b.price === n.amount) -
                                      Number(a.price === n.amount),
                                  )
                                  .map((o) => (
                                    <button
                                      key={o.id}
                                      disabled={busyId === n.id}
                                      onClick={() =>
                                        void act(n.id, {
                                          action: "match",
                                          topUpId: o.id,
                                        })
                                      }
                                      className={cn(
                                        "flex items-center justify-between rounded-lg border bg-white px-3 py-2 text-left text-[12px] transition hover:border-blue-300 disabled:opacity-50",
                                        o.price === n.amount
                                          ? "border-blue-300"
                                          : "border-gray-200",
                                      )}
                                    >
                                      <span className="font-medium text-gray-700">
                                        {o.academyName} · {o.depositorName ?? "이름없음"}
                                      </span>
                                      <span className="tabular-nums text-gray-500">
                                        {o.price.toLocaleString("ko-KR")}원 ·{" "}
                                        {o.creditAmount.toLocaleString("ko-KR")}C
                                        {o.price === n.amount && (
                                          <span className="ml-2 font-semibold text-blue-600">
                                            금액일치
                                          </span>
                                        )}
                                      </span>
                                    </button>
                                  ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
