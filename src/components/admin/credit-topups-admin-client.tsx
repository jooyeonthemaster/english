"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { ReactNode, RefObject } from "react";
import { CheckCircle2, Clock3, Coins, CreditCard, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import {
  AdminDialog,
  AdminEmptyState,
  DataTable,
  DataTableBody,
  DataTableEmpty,
  DataTableHeader,
  ResultCount,
  StatCard,
  StatGrid,
  StatusBadge,
  TONE_SOFT,
  Td,
  Th,
  Tr,
} from "@/components/admin/kit";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminHoverDetail } from "@/components/admin/hover-detail/admin-hover-detail";
import { AcademyPaymentHistory } from "@/components/admin/credit-topups/academy-payment-history";
import {
  ManualCompleteModal,
  type ManualCompletePayload,
} from "@/components/admin/credit-topups-admin-parts/manual-complete-modal";
import {
  getPaymentsBlockDetail,
  markFailedTopUpReviewed,
} from "@/actions/admin/detail/payments";
import type { PaymentsBlockKey } from "@/lib/admin-block-detail/payments";
import type { AdminDetailRowActionHandler } from "@/lib/admin-detail-types";
import { TOPUP_STATUS, paymentMethodLabel, statusOf } from "@/lib/admin-labels";
import type { StatusMeta, Tone } from "@/lib/admin-labels/tone";
// 집계 타입 정본은 서버 집계 모듈(admin-credit-topup-stats.ts) — 매출 정의는 admin-revenue.ts(D1).
// 타입 전용 import 라 서버 모듈(prisma)이 클라이언트 번들로 끌려오지 않는다.
import type { AdminTopUpStats } from "@/lib/admin-credit-topup-stats";
import { formatKstDateTimeShort } from "@/lib/admin-kst-format";
import { PENDING_STALE_MINUTES } from "@/lib/admin-revenue-constants";
import {
  BANK_DEPOSIT_MATCH_WINDOW_MINUTES,
  TOPUP_PROGRESS_STALE_LABEL,
  TOPUP_REVIEW_WINDOW_DAYS,
  classifyTopUpProgress,
  topUpStaleTitle,
} from "@/lib/admin-topup-progress";
import { cn } from "@/lib/utils";
import { ReviewReadinessStrip } from "./credit-topups-admin-client-parts/review-readiness-strip";
import {
  TopUpDetailActions,
  TopUpDetailPanel,
} from "./credit-topups-admin-client-parts/topup-detail-panel";
import { topUpRowDetail } from "./credit-topups-admin-client-parts/topup-hover-detail";
import {
  formatOrderNo,
  getTopUpStatusMeta,
  readDepositorName,
} from "./credit-topups-admin-client-parts/topup-status";
import {
  TOPUPS_PAGE_SIZE,
  type AdminTopUp,
  type AdminTopUpDetail,
} from "./credit-topups-admin-client-parts/types";

// ============================================================================
// 결제 관리 > 충전 내역 탭. 실시간 스트림·지표·표·결제 상세 팝업(재조회/환불/수동 완료/가상계좌 말소).
// 상품 관리는 products-admin-client.tsx 로 분리됐다.
//
// 병합 메모(26-09-18) — 어드민 UI 규약(kit·hover 상세·PageHeader 연동)은 그대로 쓰고,
// 숫자·자구는 유입 분석 작업의 정의(docs/analytics/analytics-spec.md §9.2 F1·F2 / D3)를 따른다.
//   · 지표 카드·표·상태 배지는 「대기」를 「진행 중 / 미완료(이탈·만료)」로 갈라 부르고,
//     표의 금액 열은 「주문금액」(미결제는 흐리게) — 결제창 이탈분이 매출로 읽히지 않게.
//   · 그래서 카드·표·상태 배지는 parts/metric-cards.tsx·topups-table.tsx 대신 이 파일에서 그린다
//     (그쪽 부품 껍데기 — StatCard/DataTable/AdminHoverDetail/레지스트리 배지 — 는 그대로 사용).
//   · 결제 상세 팝업 본문·버튼 줄·수동 충전 완료는 그쪽 parts 를 그대로 쓰고, 그 위에 우리
//     「이 학원 결제 이력」 패널(§9.3)을 얹는다.
// 결제·충전·환불·무통장 매칭 실행 흐름은 어느 쪽도 손대지 않았다(집계·표시만).
// ============================================================================

export type PaymentsLiveState = { connected: boolean; refreshing: boolean };

/** 결제가 성립하지 않은 상태 — 금액은 주문금액일 뿐 매출이 아니다(표에서 흐리게). */
const UNPAID_TOPUP_STATUSES = new Set(["PENDING", "WAITING_FOR_DEPOSIT", "FAILED", "CANCELLED"]);

const ZERO_STATS: AdminTopUpStats = {
  todayRevenue: 0,
  todayCount: 0,
  todayCredits: 0,
  todayRefundCount: 0,
  todayRefundAmount: 0,
  completedCredits: 0,
  completedCount: 0,
  completedRevenue: 0,
  pendingActiveCount: 0,
  pendingStaleCount: 0,
  pendingStaleAmount: 0,
  pendingStaleMinutes: PENDING_STALE_MINUTES,
  bankStaleMinutes: BANK_DEPOSIT_MATCH_WINDOW_MINUTES,
  failedCount: 0,
  cancelledCount: 0,
  refundedCount: 0,
  reviewWindowDays: TOPUP_REVIEW_WINDOW_DAYS,
};

// ---------------------------------------------------------------------------
// 상태 표시 — 라벨·색은 admin-labels 레지스트리(그쪽 규약)를 쓰고, 「미완료(이탈·만료)」 판정은
// admin-topup-progress.ts 가 단일 소스(표·카드·이력 패널·대시보드가 같은 자구를 쓴다).
// DB 상태는 바꾸지 않는다(spec §9.2 D3).
// ---------------------------------------------------------------------------

type TopUpStatusLike = {
  paymentMethod: string | null;
  status: string;
  createdAt: Date | string;
  customData?: unknown;
};

const CONFIRM_WINDOW_MS = 30 * 60_000;

function resolveTopUpStatus(topUp: TopUpStatusLike): { meta: StatusMeta; title?: string } {
  const progress = classifyTopUpProgress(topUp.status, topUp.createdAt);
  if (progress.state === "stale") {
    const base = statusOf(TOPUP_STATUS, topUp.status);
    return {
      meta: { label: TOPUP_PROGRESS_STALE_LABEL, tone: "gray" },
      title: topUpStaleTitle(base.label, topUp.status, progress.windowMinutes),
    };
  }
  // 수동 충전 완료 등 그쪽 레지스트리 판정을 그대로 쓴다.
  return { meta: getTopUpStatusMeta(topUp) };
}

function readCustomString(customData: unknown, key: string): string | null {
  if (customData && typeof customData === "object" && !Array.isArray(customData)) {
    const v = (customData as Record<string, unknown>)[key];
    if (typeof v === "string" && v) return v;
  }
  return null;
}

function readConfirmStartedAt(customData: unknown): number | null {
  const v = readCustomString(customData, "confirmStartedAt");
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}

function LiveBadge({
  tone,
  title,
  children,
}: {
  tone: Tone;
  title?: string;
  children: ReactNode;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-md px-2 text-[11px] font-semibold tabular-nums",
        TONE_SOFT[tone],
      )}
    >
      {children}
    </span>
  );
}

/**
 * 무통장입금 입금 대기 주문의 라이브 배지: 입금 대기(카운트다운) / 입금 확인중(카운트업) /
 * 입금 확인 실패 / 미완료(이탈·만료). 매칭 시간창은 디렉터 화면과 같은 값이고,
 * 창을 넘긴 뒤의 자구는 표·카드·이력 패널과 하나로 맞춘다(admin-topup-progress.ts).
 */
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
      return <LiveBadge tone="rose">입금 확인 실패</LiveBadge>;
    }
    const mm = Math.floor(elapsed / 60_000);
    const ss = Math.floor((elapsed % 60_000) / 1000);
    return (
      <LiveBadge tone="violet">
        <Clock3 className="size-3" strokeWidth={2.2} />
        입금 확인중 {pad(mm)}:{pad(ss)}
      </LiveBadge>
    );
  }

  const expiresAt = new Date(createdAt).getTime() + BANK_DEPOSIT_MATCH_WINDOW_MINUTES * 60_000;
  const leftMs = Math.max(expiresAt - now, 0);
  if (leftMs <= 0) {
    // 표·카드·이력 패널과 같은 자구. 무통장 매칭창(분)은 배지가 아니라 툴팁 보조문구로.
    return (
      <LiveBadge
        tone="gray"
        title={topUpStaleTitle(
          "입금 대기",
          "WAITING_FOR_DEPOSIT",
          BANK_DEPOSIT_MATCH_WINDOW_MINUTES,
        )}
      >
        {TOPUP_PROGRESS_STALE_LABEL}
      </LiveBadge>
    );
  }
  const mm = Math.floor(leftMs / 60_000);
  const ss = Math.floor((leftMs % 60_000) / 1000);
  const urgent = leftMs <= 5 * 60_000;
  return (
    <LiveBadge
      tone={urgent ? "amber" : "sky"}
      title={`무통장 입금 자동 매칭 ${BANK_DEPOSIT_MATCH_WINDOW_MINUTES}분 창 — 남은 시간`}
    >
      <Clock3 className="size-3" strokeWidth={2.2} />
      입금 대기 {pad(mm)}:{pad(ss)}
    </LiveBadge>
  );
}

/** 표·상세 공용 상태 뱃지 — 무통장 입금 대기만 라이브 카운트다운, 나머지는 레지스트리 뱃지. */
function TopUpStatusCell({ topUp }: { topUp: TopUpStatusLike }) {
  if (topUp.paymentMethod === "BANK_TRANSFER" && topUp.status === "WAITING_FOR_DEPOSIT") {
    return <BankWaitingBadge createdAt={topUp.createdAt} customData={topUp.customData} />;
  }
  const { meta, title } = resolveTopUpStatus(topUp);
  return (
    <span title={title}>
      <StatusBadge status={meta} />
    </span>
  );
}

// ---------------------------------------------------------------------------
// 상단 지표 카드 — 카드 정의(집계 기준·자구)는 우리 쪽, 호버 상세는 그쪽 규약.
// 집계 정의: src/lib/admin-credit-topup-stats.ts (매출 = admin-revenue.ts D1)
// ---------------------------------------------------------------------------

function HoverStatCard({
  detailKey,
  label,
  value,
  sub,
  icon,
  tone,
  title,
  onRowAction,
}: {
  detailKey: PaymentsBlockKey;
  label: string;
  value: string;
  sub: string;
  icon: LucideIcon;
  tone: Tone;
  /** 집계 기준 설명(툴팁) */
  title?: string;
  /** 상세 팝업 표의 행 버튼 동작(확인 필요 → 실패 건 확인 처리) */
  onRowAction?: AdminDetailRowActionHandler;
}) {
  return (
    <AdminHoverDetail
      title={label}
      load={() => getPaymentsBlockDetail(detailKey)}
      cacheKey={`payments:${detailKey}`}
      onRowAction={onRowAction}
    >
      {/* StatCard 는 DOM 이벤트를 받지 않으므로 호버·클릭은 이 래퍼가 받는다. */}
      <div className="cursor-pointer rounded-xl outline-none transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-blue-500/30">
        <StatCard label={label} value={value} sub={sub} icon={icon} tone={tone} title={title} />
      </div>
    </AdminHoverDetail>
  );
}

function PaymentMetricCards({
  stats,
  onFailedRowAction,
}: {
  stats: AdminTopUpStats;
  onFailedRowAction: AdminDetailRowActionHandler;
}) {
  const todaySub = `${stats.todayCount.toLocaleString("ko-KR")}건 · ${stats.todayCredits.toLocaleString("ko-KR")}C${
    stats.todayRefundCount > 0
      ? ` · 환불 ${stats.todayRefundAmount.toLocaleString("ko-KR")}원(${stats.todayRefundCount}건)`
      : ""
  }`;

  return (
    <StatGrid cols={4}>
      <HoverStatCard
        detailKey="today"
        label="오늘 결제(완료 · KST)"
        value={`${stats.todayRevenue.toLocaleString("ko-KR")}원`}
        sub={todaySub}
        icon={CreditCard}
        tone="blue"
      />
      <HoverStatCard
        detailKey="completed"
        label="누적 충전 완료(전체 기간)"
        value={`${stats.completedCredits.toLocaleString("ko-KR")}C`}
        sub={`${stats.completedCount.toLocaleString("ko-KR")}건 · ${stats.completedRevenue.toLocaleString("ko-KR")}원 · 환불 건 제외`}
        icon={CheckCircle2}
        tone="emerald"
      />
      <HoverStatCard
        detailKey="pending"
        label="결제 진행 중"
        value={`${stats.pendingActiveCount.toLocaleString("ko-KR")}건`}
        sub={`미완료(이탈·만료) ${stats.pendingStaleCount.toLocaleString("ko-KR")}건 · 주문 ${stats.pendingStaleAmount.toLocaleString("ko-KR")}원 — 매출 아님`}
        title={`카드 결제 ${stats.pendingStaleMinutes}분 · 무통장 입금 ${stats.bankStaleMinutes}분(자동 매칭 창) 이내면 「진행 중」, 넘기면 「미완료(이탈·만료)」로 봅니다. DB 상태는 바꾸지 않습니다.`}
        icon={Clock3}
        tone="sky"
      />
      <HoverStatCard
        detailKey="failed"
        label={`확인 필요 · 결제 실패(최근 ${stats.reviewWindowDays}일 주문)`}
        value={`${stats.failedCount.toLocaleString("ko-KR")}건`}
        sub={`최근 ${stats.reviewWindowDays}일 주문 중 취소 ${stats.cancelledCount.toLocaleString("ko-KR")}건 · 같은 기간 환불 ${stats.refundedCount.toLocaleString("ko-KR")}건(환불일 기준)`}
        title="실패·취소는 주문 생성일 기준, 환불은 환불일 기준으로 셉니다(매출 정의와 동일)."
        icon={XCircle}
        tone="rose"
        onRowAction={onFailedRowAction}
      />
    </StatGrid>
  );
}

// ---------------------------------------------------------------------------
// 충전 내역 표 — 행 호버 = 요약 팝오버(그쪽), 행 클릭 = 결제 상세 팝업(부모가 연다).
// 금액 열은 「주문금액」이고 미결제 상태는 흐리게 — 주문이 매출로 읽히지 않게(§9.2 F2).
// ---------------------------------------------------------------------------

const COLUMN_COUNT = 9;

function TopUpsTable({
  topUps,
  selectedId,
  onSelect,
  page,
  totalPages,
  total,
  pending,
  onPageChange,
}: {
  topUps: AdminTopUp[];
  selectedId: string | null;
  onSelect: (topUpId: string) => void;
  page: number;
  totalPages: number;
  total: number;
  /** 페이지 이동 중(표를 흐리게) */
  pending: boolean;
  onPageChange: (page: number) => void;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-gray-100 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-5 py-4">
        <div>
          <h2 className="text-[15px] font-semibold text-gray-900">충전 내역</h2>
          <p className="mt-0.5 text-[12px] text-gray-400">행을 클릭하면 결제 상세가 열립니다</p>
        </div>
        <ResultCount total={total} page={Math.min(page, totalPages)} totalPages={totalPages} />
      </div>

      <div className={pending ? "opacity-60 transition-opacity" : "transition-opacity"}>
        <DataTable bare minWidth={920}>
          <DataTableHeader>
            <Tr>
              <Th>주문번호</Th>
              <Th>일시</Th>
              <Th>학원</Th>
              <Th>상태</Th>
              <Th align="right">주문금액</Th>
              <Th align="right">크레딧</Th>
              <Th>결제수단</Th>
              <Th>포트원 결제 ID</Th>
              <Th align="right">충전 후 잔고</Th>
            </Tr>
          </DataTableHeader>
          <DataTableBody>
            {topUps.length === 0 ? (
              <DataTableEmpty colSpan={COLUMN_COUNT}>
                <AdminEmptyState icon={Coins} title="충전 내역이 없습니다" />
              </DataTableEmpty>
            ) : (
              topUps.map((topUp) => {
                const unpaid = UNPAID_TOPUP_STATUSES.has(topUp.status);
                return (
                  <AdminHoverDetail
                    key={topUp.id}
                    title={topUp.academy.name}
                    detail={topUpRowDetail(topUp, {
                      status: resolveTopUpStatus(topUp).meta.label,
                      payMethod: paymentMethodLabel(topUp.paymentMethod),
                    })}
                    click="none"
                  >
                    <Tr
                      clickable
                      selected={selectedId === topUp.id}
                      onClick={() => onSelect(topUp.id)}
                    >
                      <Td className="text-[12px] font-medium tabular-nums text-gray-600">
                        {formatOrderNo(topUp.id)}
                      </Td>
                      <Td muted>{formatKstDateTimeShort(topUp.createdAt)}</Td>
                      <Td>
                        <div className="text-[13px] font-semibold text-gray-900">
                          {topUp.academy.name}
                        </div>
                        <div className="text-[11px] text-gray-400">
                          {topUp.academy.staff[0]?.name ?? "원장 미지정"}
                        </div>
                      </Td>
                      <Td>
                        <TopUpStatusCell topUp={topUp} />
                      </Td>
                      <Td
                        align="right"
                        title={unpaid ? "미결제 주문 — 매출 아님" : undefined}
                        className={cn("whitespace-nowrap font-semibold", unpaid && "text-gray-400")}
                      >
                        {topUp.price.toLocaleString("ko-KR")}원
                      </Td>
                      <Td align="right" className="font-semibold text-blue-700">
                        {topUp.creditAmount.toLocaleString("ko-KR")}C
                      </Td>
                      <Td muted>{paymentMethodLabel(topUp.paymentMethod)}</Td>
                      <Td muted className="max-w-[190px] truncate">
                        {topUp.paymentId ?? "-"}
                      </Td>
                      <Td align="right" className="text-[12px] text-gray-600">
                        {topUp.creditTransaction
                          ? `${topUp.creditTransaction.balanceAfter.toLocaleString("ko-KR")}C`
                          : "-"}
                      </Td>
                    </Tr>
                  </AdminHoverDetail>
                );
              })
            )}
          </DataTableBody>
        </DataTable>
      </div>

      <AdminPagination
        page={page}
        totalPages={totalPages}
        disabled={pending}
        onChange={onPageChange}
      />
    </section>
  );
}

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
  // 학원 결제 이력 무효화 신호 — 결제 상태를 바꾸는 액션·수동 새로고침 뒤에만 올린다.
  const [historyNonce, setHistoryNonce] = useState(0);
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
  }, [selectedTopUpId]);

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
    // 학원 결제 이력은 academyId 단위로 유지하고, 여기(수동 새로고침 · 포트원 재조회 · 환불 ·
    // 수동 완료 · 가상계좌 말소 성공 뒤)에서만 무효화한다 — 행을 바꿔 볼 때마다 다시 부르지 않는다.
    setHistoryNonce((n) => n + 1);
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

  // 환불(부분취소)은 포트원 결제건에만 성립한다 — 무통장 입금은 paymentId 가 없어 API 가 반드시
  // 실패한다. 폼을 열기 전에 막아 줄 뿐, 환불 실행 흐름 코드는 건드리지 않는다.
  function openCancelForm() {
    if (selectedTopUp && !selectedTopUp.paymentId) {
      toast.info(
        "무통장 입금 건은 시스템 밖(계좌 이체)에서 환불합니다 — 포트원 환불 API 대상이 아닙니다.",
      );
      return;
    }
    setShowCancelForm(true);
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
            {selectedTopUp && <TopUpStatusCell topUp={selectedTopUp} />}
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
              onOpenCancelForm={openCancelForm}
              onCloseVirtualAccount={closeSelectedVirtualAccount}
            />
          ) : undefined
        }
      >
        {/* 최상단: 이 학원 결제 이력(요약·목록·회원/학원/유입 경로 이동) — spec §9.3 */}
        {selectedTopUp && (
          <div className="mb-5 border-b border-gray-100 pb-5">
            <AcademyPaymentHistory
              key={selectedTopUp.academyId}
              academyId={selectedTopUp.academyId}
              currentTopUpId={selectedTopUp.id}
              onSelectTopUp={selectTopUp}
              // 같은 학원 안에서 결제 건만 바꿀 때는 재조회하지 않는다(행 클릭 1회 = 상세 API 1회).
              refreshKey={String(historyNonce)}
            />
          </div>
        )}
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
