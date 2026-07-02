import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth-admin";

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
  const where =
    status && status !== "ALL" ? { status } : {};

  const [notifications, pendingOrders, statusCounts] = await Promise.all([
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
      where: { status: "WAITING_FOR_DEPOSIT", paymentMethod: "BANK_TRANSFER" },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        price: true,
        creditAmount: true,
        customData: true,
        createdAt: true,
        academy: { select: { name: true } },
      },
    }),
    prisma.bankDepositNotification.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
  ]);

  const counts: Record<string, number> = {};
  for (const row of statusCounts) counts[row.status] = row._count._all;

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
    pendingOrders: pendingOrders.map((o) => ({
      id: o.id,
      price: o.price,
      creditAmount: o.creditAmount,
      depositorName: readDepositorName(o.customData),
      academyName: o.academy.name,
      createdAt: o.createdAt.toISOString(),
    })),
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
