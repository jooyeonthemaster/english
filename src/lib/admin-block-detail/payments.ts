// ============================================================================
// 결제 관리 상단 지표 카드의 호버/클릭 상세.
//
// 불변식: **여기 숫자는 카드 숫자(`src/lib/admin-credit-topup-stats.ts`)와 같은 집합·
// 같은 금액 규칙이어야 한다.** 카드와 팝업이 서로 다른 값을 말하면 둘 다 못 믿는다.
//  - 금액·기간: `admin-revenue.ts`(D1) — 결제일 gross(COMPLETED+REFUNDED) · `COALESCE(paidAmount, price)` ·
//    환불은 환불일에 따로. KST 자정 경계(`getTodayKST`/`getTomorrowKST`).
//  - 대기 분류: `admin-topup-progress.ts`(F2·D3) — 「진행 중」/「미완료(이탈·만료)」. **DB 상태는 바꾸지 않는다.**
//  - 라벨: `admin-labels` 레지스트리(docs/ADMIN-UI-CONVENTION.md) — 이 파일 안에 라벨 표를 두지 않는다.
// 계약: docs/analytics/analytics-spec.md §9.2 F1·F2·F3·D1·D3
// ============================================================================

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getTodayKST, getTomorrowKST } from "@/lib/date-utils";
import {
  DETAIL_ROW_ID_KEY,
  type AdminDetail,
  type AdminDetailSection,
} from "@/lib/admin-detail-types";
import { kstDateTime, num, truncate, won } from "@/lib/admin-dashboard-detail/format";
import { TOPUP_STATUS, labelOf, paymentMethodLabel } from "@/lib/admin-labels";
import {
  PENDING_STALE_MINUTES,
  manualGrantAt,
  topUpAmount,
  topUpGrossWhere,
  topUpPaidAt,
  topUpRefundWhere,
  topUpRefundedAt,
} from "@/lib/admin-revenue";
import {
  BANK_DEPOSIT_MATCH_WINDOW_MINUTES,
  TOPUP_PROGRESS_ACTIVE_LABEL,
  TOPUP_PROGRESS_STALE_LABEL,
  TOPUP_REVIEW_WINDOW_DAYS,
  classifyTopUpProgress,
  topUpProgressWindowMinutes,
} from "@/lib/admin-topup-progress";

export type PaymentsBlockKey = "today" | "completed" | "pending" | "failed";

/** 결제수단 문구는 레지스트리(PAYMENT_METHOD)에서만 — 파일 안에 표를 두지 않는다. */
const method = (m: string | null) => paymentMethodLabel(m);

const LIST_SELECT = {
  id: true,
  price: true,
  // 부분취소·수수료가 생기면 결제액은 price 가 아니라 paidAmount 다(D1).
  paidAmount: true,
  creditAmount: true,
  paymentMethod: true,
  status: true,
  failureMessage: true,
  createdAt: true,
  paidAt: true,
  completedAt: true,
  cancelledAt: true,
  updatedAt: true,
  academy: { select: { name: true } },
} as const;

const TAKE = 100;

export async function paymentsBlockDetail(key: PaymentsBlockKey): Promise<AdminDetail> {
  switch (key) {
    case "today":
      return todayDetail();
    case "completed":
      return completedDetail();
    case "pending":
      return pendingDetail();
    case "failed":
      return failedDetail();
  }
}

// ---------------------------------------------------------------------------
// 오늘 결제 — 카드 `todayRevenue`/`todayCount`/`todayCredits` + 환불(`todayRefund*`)
// 이전 구현은 COMPLETED 만, `price` 로, 상한 없이(`>= todayStart`) 셌다. 셋 다 카드와 다른
// 집합이라 환불이 하루 안에 일어나거나 paidAmount 가 price 와 갈리는 순간 값이 어긋난다.
// ---------------------------------------------------------------------------
async function todayDetail(): Promise<AdminDetail> {
  const todayStart = getTodayKST();
  const tomorrowStart = getTomorrowKST();
  // 하루치라 행 수가 작다 — 합계는 전 행으로 내고 표시만 TAKE 로 자른다(합계·건수는 항상 정확).
  const [paid, refunded] = await Promise.all([
    prisma.creditTopUp.findMany({
      where: topUpGrossWhere(todayStart, tomorrowStart),
      orderBy: { createdAt: "desc" },
      select: LIST_SELECT,
    }),
    prisma.creditTopUp.findMany({
      where: topUpRefundWhere(todayStart, tomorrowStart),
      orderBy: { createdAt: "desc" },
      select: LIST_SELECT,
    }),
  ]);

  const gross = paid.reduce((s, r) => s + topUpAmount(r), 0);
  const credits = paid.reduce((s, r) => s + r.creditAmount, 0);
  const refundTotal = refunded.reduce((s, r) => s + topUpAmount(r), 0);

  const sections: AdminDetailSection[] = [
    {
      title: "결제(결제일 기준)",
      columns: [
        { key: "at", label: "결제" },
        { key: "academy", label: "학원" },
        { key: "status", label: "상태" },
        { key: "method", label: "수단" },
        { key: "credits", label: "크레딧", align: "right" },
        { key: "price", label: "결제액", align: "right" },
      ],
      rows: paid.slice(0, TAKE).map((r) => ({
        at: kstDateTime(topUpPaidAt(r)),
        academy: r.academy.name,
        status: labelOf(TOPUP_STATUS, r.status),
        method: method(r.paymentMethod),
        credits: `${num(r.creditAmount)}C`,
        price: won(topUpAmount(r)),
      })),
      emptyText: "오늘 결제된 건이 없습니다",
    },
  ];

  // 환불은 「오늘 결제」에서 빼지 않는다(결제일엔 매출이었다 — D1). 환불일 기준으로 따로 센다.
  if (refunded.length > 0) {
    sections.push({
      title: "환불(환불일 기준 · 위 결제액에서 빼지 않음)",
      columns: [
        { key: "at", label: "환불" },
        { key: "academy", label: "학원" },
        { key: "method", label: "수단" },
        { key: "price", label: "환불액", align: "right" },
      ],
      rows: refunded.slice(0, TAKE).map((r) => ({
        at: kstDateTime(topUpRefundedAt(r)),
        academy: r.academy.name,
        method: method(r.paymentMethod),
        price: won(topUpAmount(r)),
      })),
    });
  }

  return {
    title: "오늘 결제",
    subtitle:
      "KST 자정 기준. 결제액은 결제일 gross(이후 환불된 건 포함), 환불은 환불일에 따로 셉니다.",
    summary: [
      { label: "결제액", value: won(gross) },
      { label: "건수", value: `${num(paid.length)}건` },
      { label: "크레딧", value: `${num(credits)}C` },
      ...(refunded.length > 0
        ? [{ label: "환불", value: `${won(refundTotal)} · ${num(refunded.length)}건` }]
        : []),
    ],
    sections,
  };
}

// ---------------------------------------------------------------------------
// 충전 완료 — 카드 `completedCredits`/`completedCount`/`completedRevenue`
// 금액은 `COALESCE(paidAmount, price)`(D1). Prisma groupBy 로는 COALESCE 를 못 쓰므로
// `sumTopUpAmounts`(카드 쪽)와 같은 방식으로 paidAmount 유무 두 갈래를 합친다.
// ---------------------------------------------------------------------------
type MethodTotals = { count: number; amount: number; credits: number };

async function completedDetail(): Promise<AdminDetail> {
  const where: Prisma.CreditTopUpWhereInput = { status: "COMPLETED" };
  const [withPaid, withoutPaid, recent, grants] = await Promise.all([
    prisma.creditTopUp.groupBy({
      by: ["paymentMethod"],
      where: { ...where, paidAmount: { not: null } },
      _sum: { paidAmount: true, creditAmount: true },
      _count: { _all: true },
    }),
    prisma.creditTopUp.groupBy({
      by: ["paymentMethod"],
      where: { ...where, paidAmount: null },
      _sum: { price: true, creditAmount: true },
      _count: { _all: true },
    }),
    prisma.creditTopUp.findMany({
      where,
      orderBy: { completedAt: "desc" },
      take: TAKE,
      select: LIST_SELECT,
    }),
    // 충전 주문 없이 입금만 기록된 무통장 수동지급. 매출 정의(D1)에는 들어가지만
    // 이 카드(credit_top_ups 집계)에는 구조적으로 못 들어온다 — 합계와 섞지 않고 따로 보인다.
    prisma.bankDepositNotification.findMany({
      where: { status: "MANUAL_GRANT", matchedTopUpId: null },
      orderBy: { receivedAt: "desc" },
      take: TAKE,
      select: { amount: true, depositorName: true, occurredAt: true, receivedAt: true },
    }),
  ]);

  const byMethod = new Map<string | null, MethodTotals>();
  const add = (m: string | null, count: number, amount: number, credits: number) => {
    const cur = byMethod.get(m) ?? { count: 0, amount: 0, credits: 0 };
    byMethod.set(m, {
      count: cur.count + count,
      amount: cur.amount + amount,
      credits: cur.credits + credits,
    });
  };
  for (const r of withPaid) {
    add(r.paymentMethod, r._count._all, r._sum.paidAmount ?? 0, r._sum.creditAmount ?? 0);
  }
  for (const r of withoutPaid) {
    add(r.paymentMethod, r._count._all, r._sum.price ?? 0, r._sum.creditAmount ?? 0);
  }

  const totals = [...byMethod.values()].reduce<MethodTotals>(
    (s, t) => ({
      count: s.count + t.count,
      amount: s.amount + t.amount,
      credits: s.credits + t.credits,
    }),
    { count: 0, amount: 0, credits: 0 },
  );

  const sections: AdminDetailSection[] = [
    {
      title: "결제수단별",
      columns: [
        { key: "method", label: "수단" },
        { key: "count", label: "건수", align: "right" },
        { key: "credits", label: "크레딧", align: "right" },
        { key: "price", label: "결제액", align: "right" },
      ],
      rows: [...byMethod.entries()]
        .sort((a, b) => b[1].amount - a[1].amount)
        .map(([m, t]) => ({
          method: method(m),
          count: `${num(t.count)}건`,
          credits: `${num(t.credits)}C`,
          price: won(t.amount),
        })),
      emptyText: "완료된 충전이 없습니다",
    },
    {
      title: `최근 완료 ${TAKE}건`,
      columns: [
        { key: "at", label: "완료" },
        { key: "academy", label: "학원" },
        { key: "method", label: "수단" },
        { key: "price", label: "결제액", align: "right" },
      ],
      rows: recent.map((r) => ({
        at: kstDateTime(r.completedAt),
        academy: r.academy.name,
        method: method(r.paymentMethod),
        price: won(topUpAmount(r)),
      })),
    },
  ];

  if (grants.length > 0) {
    sections.push({
      title: "무통장 수동지급 — 충전 주문 없이 입금만 기록(위 합계에 미포함 · 매출 정의 D1 에는 포함)",
      columns: [
        { key: "at", label: "입금" },
        { key: "depositor", label: "입금자" },
        { key: "price", label: "입금액", align: "right" },
      ],
      rows: grants.map((g) => ({
        at: kstDateTime(manualGrantAt(g)),
        depositor: g.depositorName ?? "—",
        price: won(g.amount),
      })),
    });
  }

  return {
    title: "충전 완료",
    subtitle: "전체 기간 완료된 충전(환불 건 제외). 금액은 실결제액 기준입니다.",
    summary: [
      { label: "크레딧", value: `${num(totals.credits)}C` },
      { label: "건수", value: `${num(totals.count)}건` },
      { label: "결제액", value: won(totals.amount) },
    ],
    sections,
  };
}

// ---------------------------------------------------------------------------
// 대기 — 카드 `pendingActiveCount`/`pendingStaleCount`/`pendingStaleAmount`
// 이전 구현은 전 건을 「입금 대기 / 결제 대기」로만 적어, 카드가 「진행 중 0건 · 미완료 14건」
// 이라고 말하는 순간에도 팝업은 14건을 진행 중인 주문처럼 보여 줬다(F2).
// ---------------------------------------------------------------------------
async function pendingDetail(): Promise<AdminDetail> {
  const now = Date.now();
  // 시간창은 상태마다 다르다 — 값의 단일 소스는 admin-topup-progress 다.
  const cutoff = (status: string) =>
    new Date(now - (topUpProgressWindowMinutes(status) ?? 0) * 60_000);
  const activeWhere: Prisma.CreditTopUpWhereInput = {
    OR: [
      { status: "PENDING", createdAt: { gte: cutoff("PENDING") } },
      { status: "WAITING_FOR_DEPOSIT", createdAt: { gte: cutoff("WAITING_FOR_DEPOSIT") } },
    ],
  };
  const staleWhere: Prisma.CreditTopUpWhereInput = {
    OR: [
      { status: "PENDING", createdAt: { lt: cutoff("PENDING") } },
      { status: "WAITING_FOR_DEPOSIT", createdAt: { lt: cutoff("WAITING_FOR_DEPOSIT") } },
    ],
  };

  const [rows, activeCount, staleAgg] = await Promise.all([
    prisma.creditTopUp.findMany({
      where: { status: { in: ["PENDING", "WAITING_FOR_DEPOSIT"] } },
      orderBy: { createdAt: "desc" },
      take: TAKE,
      select: LIST_SELECT,
    }),
    prisma.creditTopUp.count({ where: activeWhere }),
    prisma.creditTopUp.aggregate({
      where: staleWhere,
      _count: { _all: true },
      _sum: { price: true },
    }),
  ]);

  // 행 라벨도 같은 함수로 판정한다 — 위 where 와 아래 표가 따로 놀 수 없게.
  const stateOf = (r: (typeof rows)[number]) =>
    classifyTopUpProgress(r.status, r.createdAt, now).state;
  const active = rows.filter((r) => stateOf(r) === "in_progress");
  const stale = rows.filter((r) => stateOf(r) === "stale");

  // 금액 열은 「주문금액」이다 — 아직 결제된 돈이 아니다(F3).
  const columns = [
    { key: "at", label: "주문" },
    { key: "academy", label: "학원" },
    { key: "status", label: "원 상태" },
    { key: "method", label: "수단" },
    { key: "price", label: "주문금액", align: "right" as const },
  ];
  const row = (r: (typeof rows)[number]) => ({
    at: kstDateTime(r.createdAt),
    academy: r.academy.name,
    status: labelOf(TOPUP_STATUS, r.status),
    method: method(r.paymentMethod),
    price: won(r.price),
  });

  return {
    title: "대기 중인 결제",
    subtitle:
      `카드 결제 ${PENDING_STALE_MINUTES}분 · 무통장 입금 ${BANK_DEPOSIT_MATCH_WINDOW_MINUTES}분(자동 매칭 창) 이내면 ` +
      `「${TOPUP_PROGRESS_ACTIVE_LABEL}」, 넘기면 「${TOPUP_PROGRESS_STALE_LABEL}」로 봅니다. 표시 분류일 뿐 DB 상태는 바꾸지 않습니다.`,
    summary: [
      { label: TOPUP_PROGRESS_ACTIVE_LABEL, value: `${num(activeCount)}건` },
      { label: TOPUP_PROGRESS_STALE_LABEL, value: `${num(staleAgg._count._all)}건` },
      { label: "미완료 주문금액", value: `${won(staleAgg._sum.price ?? 0)} — 매출 아님` },
    ],
    sections: [
      {
        title: TOPUP_PROGRESS_ACTIVE_LABEL,
        columns,
        rows: active.map(row),
        emptyText: "진행 중인 결제가 없습니다",
      },
      {
        title: `${TOPUP_PROGRESS_STALE_LABEL} — 매출 아님`,
        columns,
        rows: stale.map(row),
        emptyText: "미완료 주문이 없습니다",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// 확인 필요 — 카드 `failedCount`(최근 TOPUP_REVIEW_WINDOW_DAYS 일 **주문 생성일** 기준 ·
// 관리자가 확인 처리한 건 제외). 이전 구현은 기간 제한이 없어 카드가 1건이라 말할 때
// 팝업은 9건을 펼쳤다.
// ---------------------------------------------------------------------------
async function failedDetail(): Promise<AdminDetail> {
  const reviewStart = new Date(Date.now() - TOPUP_REVIEW_WINDOW_DAYS * 24 * 60 * 60_000);
  const open: Prisma.CreditTopUpWhereInput = { status: "FAILED", failureReviewedAt: null };
  const [rows, olderCount] = await Promise.all([
    prisma.creditTopUp.findMany({
      where: { ...open, createdAt: { gte: reviewStart } },
      orderBy: { createdAt: "desc" },
      take: TAKE,
      select: LIST_SELECT,
    }),
    prisma.creditTopUp.count({ where: { ...open, createdAt: { lt: reviewStart } } }),
  ]);
  return {
    title: "확인 필요",
    subtitle:
      `최근 ${TOPUP_REVIEW_WINDOW_DAYS}일 주문 중 카드 거절·한도·잔액 부족 등 실제 실패` +
      `(사용자 취소·확인 처리한 건 제외)` +
      (olderCount > 0
        ? ` · ${TOPUP_REVIEW_WINDOW_DAYS}일 이전 미확인 ${num(olderCount)}건은 이 카드에서 빠집니다`
        : ""),
    summary: [{ label: "건수", value: `${num(rows.length)}건` }],
    sections: [
      {
        columns: [
          { key: "at", label: "주문" },
          { key: "academy", label: "학원" },
          { key: "price", label: "주문금액", align: "right" },
          { key: "reason", label: "실패 사유", wide: true },
        ],
        // 행 버튼 동작은 결제 관리 화면이 넘긴다(markFailedTopUpReviewed).
        rowAction: { label: "확인", doneLabel: "확인됨" },
        rows: rows.map((r) => ({
          [DETAIL_ROW_ID_KEY]: r.id,
          at: kstDateTime(r.createdAt),
          academy: r.academy.name,
          price: won(r.price),
          reason: truncate(r.failureMessage, 300),
        })),
        emptyText: "확인이 필요한 실패 건이 없습니다",
      },
    ],
  };
}
