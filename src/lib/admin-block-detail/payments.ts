import { prisma } from "@/lib/prisma";
import { getTodayKST } from "@/lib/date-utils";
import { DETAIL_ROW_ID_KEY, type AdminDetail } from "@/lib/admin-detail-types";
import { kstDateTime, num, truncate, won } from "@/lib/admin-dashboard-detail/format";

// 결제 관리 상단 지표 카드 상세. 카드 숫자(getAdminCreditTopUpStats)와 같은 기준을 쓴다.

export type PaymentsBlockKey = "today" | "completed" | "pending" | "failed";

const METHOD_LABELS: Record<string, string> = {
  CARD: "카드",
  BANK_TRANSFER: "무통장",
  EASY_PAY: "간편결제",
  TRANSFER: "계좌이체",
  VIRTUAL_ACCOUNT: "가상계좌",
};
const method = (m: string | null) => (m ? (METHOD_LABELS[m] ?? m) : "—");

const LIST_SELECT = {
  id: true,
  price: true,
  creditAmount: true,
  paymentMethod: true,
  status: true,
  failureMessage: true,
  createdAt: true,
  paidAt: true,
  completedAt: true,
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

async function todayDetail(): Promise<AdminDetail> {
  const todayStart = getTodayKST();
  const rows = await prisma.creditTopUp.findMany({
    where: {
      status: "COMPLETED",
      OR: [{ paidAt: { gte: todayStart } }, { paidAt: null, completedAt: { gte: todayStart } }],
    },
    orderBy: { completedAt: "desc" },
    select: LIST_SELECT,
  });
  return {
    title: "오늘 결제",
    subtitle: "오늘 완료된 충전(결제·입금 시각 기준)",
    summary: [
      { label: "매출", value: won(rows.reduce((s, r) => s + r.price, 0)) },
      { label: "건수", value: `${num(rows.length)}건` },
      { label: "크레딧", value: `${num(rows.reduce((s, r) => s + r.creditAmount, 0))}C` },
    ],
    sections: [
      {
        columns: [
          { key: "at", label: "결제" },
          { key: "academy", label: "학원" },
          { key: "method", label: "수단" },
          { key: "credits", label: "크레딧", align: "right" },
          { key: "price", label: "금액", align: "right" },
        ],
        rows: rows.map((r) => ({
          at: kstDateTime(r.paidAt ?? r.completedAt),
          academy: r.academy.name,
          method: method(r.paymentMethod),
          credits: `${num(r.creditAmount)}C`,
          price: won(r.price),
        })),
        emptyText: "오늘 완료된 결제가 없습니다",
      },
    ],
  };
}

async function completedDetail(): Promise<AdminDetail> {
  const [byMethod, recent] = await Promise.all([
    prisma.creditTopUp.groupBy({
      by: ["paymentMethod"],
      where: { status: "COMPLETED" },
      _sum: { price: true, creditAmount: true },
      _count: { _all: true },
    }),
    prisma.creditTopUp.findMany({
      where: { status: "COMPLETED" },
      orderBy: { completedAt: "desc" },
      take: TAKE,
      select: LIST_SELECT,
    }),
  ]);
  return {
    title: "충전 완료",
    subtitle: "전체 기간 완료된 충전",
    sections: [
      {
        title: "결제수단별",
        columns: [
          { key: "method", label: "수단" },
          { key: "count", label: "건수", align: "right" },
          { key: "credits", label: "크레딧", align: "right" },
          { key: "price", label: "금액", align: "right" },
        ],
        rows: byMethod
          .sort((a, b) => (b._sum.price ?? 0) - (a._sum.price ?? 0))
          .map((r) => ({
            method: method(r.paymentMethod),
            count: `${num(r._count._all)}건`,
            credits: `${num(r._sum.creditAmount ?? 0)}C`,
            price: won(r._sum.price ?? 0),
          })),
      },
      {
        title: `최근 완료 ${TAKE}건`,
        columns: [
          { key: "at", label: "완료" },
          { key: "academy", label: "학원" },
          { key: "method", label: "수단" },
          { key: "price", label: "금액", align: "right" },
        ],
        rows: recent.map((r) => ({
          at: kstDateTime(r.completedAt),
          academy: r.academy.name,
          method: method(r.paymentMethod),
          price: won(r.price),
        })),
      },
    ],
  };
}

async function pendingDetail(): Promise<AdminDetail> {
  const rows = await prisma.creditTopUp.findMany({
    where: { status: { in: ["PENDING", "WAITING_FOR_DEPOSIT"] } },
    orderBy: { createdAt: "desc" },
    take: TAKE,
    select: LIST_SELECT,
  });
  return {
    title: "대기 중인 결제",
    subtitle: "카드 결제창 진행 중(30분 지나면 자동 정리) 또는 무통장 입금 대기",
    summary: [{ label: "건수", value: `${num(rows.length)}건` }],
    sections: [
      {
        columns: [
          { key: "at", label: "주문" },
          { key: "academy", label: "학원" },
          { key: "status", label: "상태" },
          { key: "method", label: "수단" },
          { key: "price", label: "금액", align: "right" },
        ],
        rows: rows.map((r) => ({
          at: kstDateTime(r.createdAt),
          academy: r.academy.name,
          status: r.status === "WAITING_FOR_DEPOSIT" ? "입금 대기" : "결제 대기",
          method: method(r.paymentMethod),
          price: won(r.price),
        })),
        emptyText: "대기 중인 결제가 없습니다",
      },
    ],
  };
}

async function failedDetail(): Promise<AdminDetail> {
  const rows = await prisma.creditTopUp.findMany({
    where: { status: "FAILED", failureReviewedAt: null },
    orderBy: { createdAt: "desc" },
    take: TAKE,
    select: LIST_SELECT,
  });
  return {
    title: "확인 필요",
    subtitle: "카드 거절·한도·잔액 부족 등 실제 실패(사용자 취소·확인 처리한 건 제외)",
    summary: [{ label: "건수", value: `${num(rows.length)}건` }],
    sections: [
      {
        columns: [
          { key: "at", label: "주문" },
          { key: "academy", label: "학원" },
          { key: "price", label: "금액", align: "right" },
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
