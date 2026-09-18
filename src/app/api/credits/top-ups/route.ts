import { NextRequest, NextResponse } from "next/server";
import { requireStaffAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isManualGrantTopUp } from "@/lib/credit-topup-status";

export async function GET(request: NextRequest) {
  const staff = await requireStaffAuth();
  const limit = Math.min(
    Math.max(Number(request.nextUrl.searchParams.get("limit") ?? 20), 1),
    100,
  );
  const offset = Math.max(
    Number(request.nextUrl.searchParams.get("offset") ?? 0),
    0,
  );

  const where = { academyId: staff.academyId };
  const total = await prisma.creditTopUp.count({ where });
  const rows = await prisma.creditTopUp.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
    skip: offset,
    select: {
      id: true,
      paymentId: true,
      creditAmount: true,
      price: true,
      paymentMethod: true,
      paymentReference: true,
      status: true,
      portoneStatus: true,
      paidAmount: true,
      receiptUrl: true,
      failureMessage: true,
      createdAt: true,
      completedAt: true,
      paidAt: true,
      customData: true,
    },
  });

  const topUps = rows.map(({ customData, ...rest }) => {
    const cd =
      customData &&
      typeof customData === "object" &&
      !Array.isArray(customData)
        ? (customData as Record<string, unknown>)
        : null;
    const depositorName = cd?.depositorName;
    const confirmStartedAt = cd?.confirmStartedAt;
    return {
      ...rest,
      depositorName: typeof depositorName === "string" ? depositorName : null,
      confirmStartedAt:
        typeof confirmStartedAt === "string" ? confirmStartedAt : null,
      // 관리자가 시스템 밖에서 지급한 뒤 정리한 건 — 고객 화면에도 "수동 충전 완료"로
      // 표시한다. 관리자 메모(note)는 내부용이라 내리지 않는다.
      manualGrant: isManualGrantTopUp(customData),
    };
  });

  return NextResponse.json({ topUps, total });
}
