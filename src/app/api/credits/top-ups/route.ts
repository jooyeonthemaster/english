import { NextRequest, NextResponse } from "next/server";
import { requireStaffAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const staff = await requireStaffAuth();
  const limit = Math.min(
    Math.max(Number(request.nextUrl.searchParams.get("limit") ?? 20), 1),
    100,
  );

  const topUps = await prisma.creditTopUp.findMany({
    where: { academyId: staff.academyId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
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
    },
  });

  return NextResponse.json({ topUps });
}
