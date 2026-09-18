import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth-admin";
import {
  BANK_TRANSFER_PAY_METHOD,
  getBankDepositConfig,
  normalizeDepositorName,
} from "@/lib/bank-deposit";

/** 입금 대기 주문 목록 상한. 넘치면 화면이 「최근 N건만 표시(전체 M건)」로 알린다(F18). */
const PENDING_ORDERS_LIMIT = 100;

/**
 * List inbound bank deposit alerts for admin review, plus the pending
 * bank-transfer orders an admin can manually match an unmatched deposit to.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminAuth();
  } catch {
    return NextResponse.json({ error: "관리자 인증이 필요합니다." }, { status: 401 });
  }

  const status = request.nextUrl.searchParams.get("status");
  // "ACTION" = 관리자 처리가 필요한 계열(미매칭 + 확인 필요 + 처리 실패)
  const where =
    status === "ACTION"
      ? { status: { in: ["UNMATCHED", "AMBIGUOUS", "FAILED"] } }
      : status && status !== "ALL"
        ? { status }
        : {};

  // 자동 매칭 시간창 — 매칭기(matchBankDeposit)·대시보드 「입금 대기」와 같은 출처
  // (getBankDepositConfig: env BANK_DEPOSIT_MATCH_WINDOW_MINUTES, 기본 30분).
  // 생성 후 이 시간이 지난 주문은 입금 알림이 와도 자동 매칭되지 않는다 → 「만료」 표시만(DB 상태는 그대로, D3).
  const { matchWindowMinutes } = getBankDepositConfig();
  const windowStart = new Date(Date.now() - matchWindowMinutes * 60_000);
  const pendingWhere: Prisma.CreditTopUpWhereInput = {
    status: "WAITING_FOR_DEPOSIT",
    paymentMethod: BANK_TRANSFER_PAY_METHOD,
  };

  // 이미 처리가 끝났는데 어느 주문에도 연결되지 않은 입금(수동지급 / 주문 링크 없는 지급 완료).
  // 같은 금액·입금자명의 입금 대기 주문에 이 입금을 다시 연결하면 크레딧 재지급 + 매출 이중집계가 난다
  // → 행에 경고만 붙인다(A5-2. 서버 차단 여부는 D4 로 보류, 실행 흐름 무변경).
  const settledWhere: Prisma.BankDepositNotificationWhereInput = {
    status: { in: ["MANUAL_GRANT", "MATCHED"] },
    matchedTopUpId: null,
  };

  const [notifications, pendingOrders, pendingTotal, pendingActive, statusCounts, settledUnlinked] = await Promise.all([
    prisma.bankDepositNotification.findMany({
      where,
      orderBy: { receivedAt: "desc" },
      take: 100,
      include: {
        matchedTopUp: {
          select: {
            id: true,
            creditAmount: true,
            academy: { select: { name: true } },
          },
        },
      },
    }),
    prisma.creditTopUp.findMany({
      where: pendingWhere,
      orderBy: { createdAt: "desc" },
      take: PENDING_ORDERS_LIMIT,
      select: {
        id: true,
        price: true,
        creditAmount: true,
        customData: true,
        createdAt: true,
        academy: { select: { name: true } },
      },
    }),
    prisma.creditTopUp.count({ where: pendingWhere }),
    prisma.creditTopUp.count({ where: { ...pendingWhere, createdAt: { gte: windowStart } } }),
    prisma.bankDepositNotification.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.bankDepositNotification.findMany({
      where: settledWhere,
      orderBy: { receivedAt: "desc" },
      select: {
        id: true,
        amount: true,
        depositorName: true,
        status: true,
        receivedAt: true,
      },
    }),
  ]);

  // 금액 + 정규화 입금자명이 모두 같을 때만 경고한다(매칭기 normalizeDepositorName 과 같은 규칙).
  // 다른 주문에 이미 연결된 MATCHED 는 제외 — 그 입금은 자기 주문을 소비했으므로 재지급 위험이 아니다.
  const settledByKey = new Map<string, { status: string; receivedAt: string }>();
  for (const n of settledUnlinked) {
    const key = `${n.amount}|${normalizeDepositorName(n.depositorName)}`;
    if (!settledByKey.has(key)) {
      settledByKey.set(key, { status: n.status, receivedAt: n.receivedAt.toISOString() });
    }
  }

  const counts: Record<string, number> = {};
  for (const row of statusCounts) counts[row.status] = row._count._all;
  // 처리 필요(미매칭 + 확인 필요 + 처리 실패) 합산 카운트
  counts.ACTION =
    (counts.UNMATCHED ?? 0) + (counts.AMBIGUOUS ?? 0) + (counts.FAILED ?? 0);

  return NextResponse.json({
    notifications: notifications.map((n) => ({
      id: n.id,
      amount: n.amount,
      depositorName: n.depositorName,
      bankName: n.bankName,
      status: n.status,
      source: n.source,
      rawText: n.rawText,
      note: n.note,
      matchedTopUpId: n.matchedTopUpId,
      matchedAcademy: n.matchedTopUp?.academy.name ?? null,
      occurredAt: n.occurredAt?.toISOString() ?? null,
      receivedAt: n.receivedAt.toISOString(),
    })),
    pendingOrders: pendingOrders.map((o) => {
      const depositorName = readDepositorName(o.customData);
      const normalized = normalizeDepositorName(depositorName);
      return {
        id: o.id,
        price: o.price,
        creditAmount: o.creditAmount,
        depositorName,
        academyName: o.academy.name,
        createdAt: o.createdAt.toISOString(),
        expired: o.createdAt < windowStart,
        // 입금자명이 비어 있으면 금액만으로는 동일 입금이라 볼 수 없어 경고하지 않는다.
        settledDeposit: normalized ? (settledByKey.get(`${o.price}|${normalized}`) ?? null) : null,
      };
    }),
    // 목록은 최근 PENDING_ORDERS_LIMIT 건까지만 — 전체·진행 중 건수는 절단과 무관한 count
    pendingOrdersMeta: {
      total: pendingTotal,
      active: pendingActive,
      expired: Math.max(0, pendingTotal - pendingActive),
      limit: PENDING_ORDERS_LIMIT,
      matchWindowMinutes,
    },
    counts,
  });
}

function readDepositorName(customData: unknown): string | null {
  if (customData && typeof customData === "object" && !Array.isArray(customData)) {
    const v = (customData as Record<string, unknown>).depositorName;
    if (typeof v === "string") return v;
  }
  return null;
}
