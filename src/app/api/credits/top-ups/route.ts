import { NextRequest, NextResponse } from "next/server";
import { requireStaffAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
    };
  });

  return NextResponse.json({ topUps, total });
}
