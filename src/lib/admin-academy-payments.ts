// ============================================================================
// 학원 1곳의 충전 결제 이력 — 결제 관리 「결제 상세」 모달 최상단 요약·목록.
// 계약: docs/analytics/analytics-spec.md §9.3
//  - 금액 합계는 admin-revenue.ts(D1) 정의: 결제액 = COMPLETED+REFUNDED 의 COALESCE(paidAmount, price)
//    (환불된 건도 결제한 날에는 결제였다), 환불액 = REFUNDED 의 같은 금액.
//  - 무통장 수동지급(MANUAL_GRANT)은 학원 연결 컬럼이 없어 여기 합계에 들어오지 않는다.
//  - 진행 중/미완료 = PENDING+WAITING_FOR_DEPOSIT 의 표시 분류(D3). 시간창은 상태별로 다르다
//    (PENDING 60분 / 무통장 입금 30분) — admin-topup-progress.ts 가 단일 소스.
// ============================================================================

import "server-only";
import { prisma } from "@/lib/prisma";
import {
  REVENUE_TOPUP_STATUSES,
  topUpAmount,
  topUpPaidAt,
} from "@/lib/admin-revenue";
import { classifyTopUpProgress } from "@/lib/admin-topup-progress";

/** 목록 최대 건수(최신순). 요약은 전체 건 기준. */
export const ACADEMY_PAYMENT_HISTORY_LIMIT = 200;

export interface AcademyPaymentHistoryItem {
  id: string;
  orderNo: string;
  createdAt: Date;
  /** 결제 시각 — COMPLETED/REFUNDED 만(그 외 상태는 null) */
  paidAt: Date | null;
  status: string;
  /** 주문금액 */
  price: number;
  paidAmount: number | null;
  creditAmount: number;
  paymentMethod: string | null;
  orderName: string | null;
}

export interface AcademyPaymentHistorySummary {
  /** 결제액 합(환불 전, D1 gross) */
  paidTotal: number;
  paidCount: number;
  refundTotal: number;
  refundCount: number;
  firstPaidAt: Date | null;
  lastPaidAt: Date | null;
  /** 시간창 이내 PENDING+WAITING — 진행 중 */
  pendingRecent: number;
  /** 시간창 초과 PENDING+WAITING — 미완료(이탈·만료) */
  abandoned: number;
}

export interface AcademyPaymentHistory {
  academy: {
    id: string;
    name: string;
    /** 가장 먼저 만들어진 원장(DIRECTOR) Staff.id — 회원 상세 라우트 id */
    directorStaffId: string | null;
    directorName: string | null;
    createdAt: Date;
  };
  summary: AcademyPaymentHistorySummary;
  items: AcademyPaymentHistoryItem[];
  /** 이 학원 충전 주문 전체 건수(items 는 최대 ACADEMY_PAYMENT_HISTORY_LIMIT 건) */
  total: number;
}

const REVENUE_STATUS_SET = new Set<string>(REVENUE_TOPUP_STATUSES);
const PENDING_STATUS_SET = new Set<string>(["PENDING", "WAITING_FOR_DEPOSIT"]);

export function formatTopUpOrderNo(id: string): string {
  return id.slice(-8).toUpperCase();
}

export async function getAcademyPaymentHistory(
  academyId: string,
): Promise<AcademyPaymentHistory | null> {
  const [academy, topUps] = await Promise.all([
    prisma.academy.findUnique({
      where: { id: academyId },
      select: {
        id: true,
        name: true,
        createdAt: true,
        // RC-DIRECTOR 확정 규칙: 활성 원장 우선 → 최이른 생성 → id.
        staff: {
          where: { role: "DIRECTOR" },
          orderBy: [{ isActive: "desc" }, { createdAt: "asc" }, { id: "asc" }],
          take: 1,
          select: { id: true, name: true },
        },
      },
    }),
    // 한 학원의 충전 주문은 많아야 수백 건 — 요약을 전체 기준으로 내기 위해 전부 읽는다.
    prisma.creditTopUp.findMany({
      where: { academyId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        createdAt: true,
        paidAt: true,
        completedAt: true,
        status: true,
        price: true,
        paidAmount: true,
        creditAmount: true,
        paymentMethod: true,
        orderName: true,
      },
    }),
  ]);

  if (!academy) return null;

  const now = Date.now();
  const summary: AcademyPaymentHistorySummary = {
    paidTotal: 0,
    paidCount: 0,
    refundTotal: 0,
    refundCount: 0,
    firstPaidAt: null,
    lastPaidAt: null,
    pendingRecent: 0,
    abandoned: 0,
  };

  for (const t of topUps) {
    if (REVENUE_STATUS_SET.has(t.status)) {
      const amount = topUpAmount(t);
      summary.paidTotal += amount;
      summary.paidCount += 1;
      if (t.status === "REFUNDED") {
        summary.refundTotal += amount;
        summary.refundCount += 1;
      }
      const paidAt = topUpPaidAt(t);
      if (paidAt) {
        if (!summary.firstPaidAt || paidAt < summary.firstPaidAt) summary.firstPaidAt = paidAt;
        if (!summary.lastPaidAt || paidAt > summary.lastPaidAt) summary.lastPaidAt = paidAt;
      }
    } else if (PENDING_STATUS_SET.has(t.status)) {
      const progress = classifyTopUpProgress(t.status, t.createdAt, now);
      if (progress.state === "stale") summary.abandoned += 1;
      else summary.pendingRecent += 1;
    }
  }

  const director = academy.staff[0] ?? null;
  return {
    academy: {
      id: academy.id,
      name: academy.name,
      directorStaffId: director?.id ?? null,
      directorName: director?.name ?? null,
      createdAt: academy.createdAt,
    },
    summary,
    items: topUps.slice(0, ACADEMY_PAYMENT_HISTORY_LIMIT).map((t) => ({
      id: t.id,
      orderNo: formatTopUpOrderNo(t.id),
      createdAt: t.createdAt,
      paidAt: REVENUE_STATUS_SET.has(t.status) ? (t.paidAt ?? t.completedAt) : null,
      status: t.status,
      price: t.price,
      paidAmount: t.paidAmount,
      creditAmount: t.creditAmount,
      paymentMethod: t.paymentMethod,
      orderName: t.orderName,
    })),
    total: topUps.length,
  };
}
