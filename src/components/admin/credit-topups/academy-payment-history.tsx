"use client";

// 결제 상세 모달 최상단 — 「이 학원 결제 이력」 요약 칩 + 최신순 목록 + 회원/학원/유입 경로 이동.
// 데이터: GET /api/admin/credits/academies/[academyId]/top-ups (계약: analytics-spec.md §9.3)
// 대기 주문 판정(진행 중/미완료)은 admin-topup-progress.ts 가 단일 소스 — 표·카드와 같은 자구를 쓴다.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Building2, Compass, History, RotateCcw, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatKstDateTimeShort } from "@/lib/admin-kst-format";
import {
  BANK_DEPOSIT_MATCH_WINDOW_MINUTES,
  TOPUP_PROGRESS_ACTIVE_LABEL,
  TOPUP_PROGRESS_STALE_LABEL,
} from "@/lib/admin-topup-progress";
import { PENDING_STALE_MINUTES } from "@/lib/admin-revenue-constants";
import {
  AcademyPaymentHistoryItems,
  type HistoryItem,
} from "@/components/admin/credit-topups/academy-payment-history-items";

type HistoryResponse = {
  academy: {
    id: string;
    name: string;
    directorStaffId: string | null;
    directorName: string | null;
    createdAt: string;
  };
  summary: {
    paidTotal: number;
    paidCount: number;
    refundTotal: number;
    refundCount: number;
    firstPaidAt: string | null;
    lastPaidAt: string | null;
    pendingRecent: number;
    abandoned: number;
  };
  items: HistoryItem[];
  total?: number;
};

interface Props {
  academyId: string;
  currentTopUpId: string;
  onSelectTopUp: (topUpId: string) => void;
  /** 바뀌면 이전 결과를 유지한 채 다시 불러온다(결제 상태 변경 후 갱신용). */
  refreshKey?: string;
}

function won(n: number): string {
  return `${n.toLocaleString("ko-KR")}원`;
}

const LINK_BUTTON =
  "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-semibold transition";

export function AcademyPaymentHistory({
  academyId,
  currentTopUpId,
  onSelectTopUp,
  refreshKey,
}: Props) {
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const load = useCallback(
    async (signal: AbortSignal) => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/admin/credits/academies/${encodeURIComponent(academyId)}/top-ups`,
          { cache: "no-store", signal },
        );
        const json = (await res.json()) as HistoryResponse | { error?: string };
        if (!res.ok || !("summary" in json)) {
          throw new Error(("error" in json && json.error) || "결제 이력을 불러오지 못했습니다.");
        }
        setData(json);
        setError(null);
      } catch (err) {
        if (signal.aborted) return;
        // 이전 결과가 있으면 유지하고 오류만 알린다(백지 플래시 금지).
        setError(err instanceof Error ? err.message : "결제 이력을 불러오지 못했습니다.");
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [academyId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, refreshKey, reloadNonce]);

  const directorId = data?.academy.directorStaffId ?? null;
  const cancelledOrFailed = data
    ? data.items.filter((i) => i.status === "CANCELLED" || i.status === "FAILED").length
    : 0;

  return (
    <section className="space-y-3" aria-label="이 학원 결제 이력">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <History className="size-4 text-blue-600" strokeWidth={2} />
            <h3 className="text-[14px] font-semibold text-gray-900">이 학원 결제 이력</h3>
            {loading && data && <span className="text-[11px] text-gray-400">갱신 중…</span>}
          </div>
          <p className="mt-0.5 truncate text-[12px] text-gray-400">
            {data
              ? `${data.academy.name} · 원장 ${data.academy.directorName ?? "미지정"} · 가입 ${formatKstDateTimeShort(data.academy.createdAt)}`
              : "불러오는 중"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* 아직 불러오는 중이면 「원장 없음」 비활성과 구분되도록 스켈레톤을 보여준다. */}
          {!data && !error ? (
            <span
              aria-hidden
              className="h-8 w-[88px] animate-pulse rounded-lg border border-gray-100 bg-gray-100"
            />
          ) : directorId ? (
            <Link
              href={`/admin/members/${directorId}`}
              prefetch={false}
              className={cn(LINK_BUTTON, "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100")}
            >
              <UserRound className="size-3.5" strokeWidth={2} />
              회원 상세
            </Link>
          ) : (
            <span
              aria-disabled="true"
              title="이 학원에 원장(DIRECTOR) 계정이 없어 회원 상세로 갈 수 없습니다"
              className={cn(LINK_BUTTON, "cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400")}
            >
              <UserRound className="size-3.5" strokeWidth={2} />
              회원 상세
            </span>
          )}
          <Link
            href={`/admin/academies/${academyId}`}
            prefetch={false}
            className={cn(
              LINK_BUTTON,
              "border-gray-200 bg-white text-gray-700 hover:border-blue-200 hover:text-blue-700",
            )}
          >
            <Building2 className="size-3.5" strokeWidth={2} />
            학원 상세
          </Link>
          <Link
            href={`/admin/analytics/sessions?academyId=${encodeURIComponent(academyId)}&all=1`}
            prefetch={false}
            className={cn(
              LINK_BUTTON,
              "border-gray-200 bg-white text-gray-700 hover:border-blue-200 hover:text-blue-700",
            )}
          >
            <Compass className="size-3.5" strokeWidth={2} />
            유입 경로 보기
          </Link>
        </div>
      </div>

      {error && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
          {error}
          <button
            type="button"
            onClick={() => setReloadNonce((n) => n + 1)}
            className="inline-flex items-center gap-1 font-semibold underline-offset-2 hover:underline"
          >
            <RotateCcw className="size-3" strokeWidth={2} />
            다시 시도
          </button>
        </div>
      )}

      {!data ? (
        !error && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-hidden>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-100" />
            ))}
          </div>
        )
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <SummaryChip
              label="총 결제"
              value={`${data.summary.paidCount.toLocaleString("ko-KR")}건 · ${won(data.summary.paidTotal)}`}
              tone="blue"
            />
            <SummaryChip
              label="환불"
              value={`${data.summary.refundCount.toLocaleString("ko-KR")}건 · ${won(data.summary.refundTotal)}`}
              tone={data.summary.refundCount > 0 ? "amber" : "gray"}
            />
            <SummaryChip label="첫 결제" value={formatKstDateTimeShort(data.summary.firstPaidAt)} />
            <SummaryChip label="마지막 결제" value={formatKstDateTimeShort(data.summary.lastPaidAt)} />
            <SummaryChip
              label={TOPUP_PROGRESS_ACTIVE_LABEL}
              value={`${data.summary.pendingRecent.toLocaleString("ko-KR")}건`}
              tone={data.summary.pendingRecent > 0 ? "sky" : "gray"}
              title={`결제 대기 ${PENDING_STALE_MINUTES}분 · 무통장 입금 ${BANK_DEPOSIT_MATCH_WINDOW_MINUTES}분(자동 매칭 창) 이내`}
            />
            <SummaryChip
              label={TOPUP_PROGRESS_STALE_LABEL}
              value={`${data.summary.abandoned.toLocaleString("ko-KR")}건`}
              title="시간창을 넘긴 대기 주문 — 매출 아님(DB 상태는 그대로)"
            />
            <SummaryChip label="취소·실패" value={`${cancelledOrFailed.toLocaleString("ko-KR")}건`} />
          </div>

          {data.items.length === 0 ? (
            <div className="rounded-lg border border-gray-100 px-3 py-6 text-center text-[12px] text-gray-400">
              이 학원의 충전 주문이 없습니다
            </div>
          ) : (
            <AcademyPaymentHistoryItems
              items={data.items}
              currentTopUpId={currentTopUpId}
              onSelectTopUp={onSelectTopUp}
            />
          )}
          {typeof data.total === "number" && data.total > data.items.length && (
            <p className="text-[11px] text-gray-400">
              최근 {data.items.length.toLocaleString("ko-KR")}건만 표시 · 전체{" "}
              {data.total.toLocaleString("ko-KR")}건(요약은 전체 기준)
            </p>
          )}
        </>
      )}
    </section>
  );
}

function SummaryChip({
  label,
  value,
  tone = "gray",
  title,
}: {
  label: string;
  value: string;
  tone?: "gray" | "blue" | "amber" | "sky";
  title?: string;
}) {
  const tones = {
    gray: "border-gray-100 bg-gray-50/70 text-gray-800",
    blue: "border-blue-100 bg-blue-50/70 text-blue-800",
    amber: "border-amber-100 bg-amber-50/70 text-amber-800",
    sky: "border-sky-100 bg-sky-50/70 text-sky-800",
  };
  return (
    <div className={cn("rounded-lg border px-2.5 py-1.5", tones[tone])} title={title}>
      <div className="text-[11px] font-medium text-gray-400">{label}</div>
      <div className="text-[13px] font-semibold tabular-nums">{value}</div>
    </div>
  );
}
