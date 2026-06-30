import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaffAuth } from "@/lib/auth";
import { BANK_TRANSFER_PAY_METHOD } from "@/lib/bank-deposit";

/**
 * 원장이 무통장입금 안내에서 "입금 완료"를 누르면 호출. 해당 주문의
 * customData.confirmStartedAt(입금 확인 시작 시각)을 기록한다. 이 값으로
 * 디렉터/어드민 양쪽에서 "입금 확인중" 카운트업·"입금 확인 실패"를 표시한다.
 * (실제 크레딧 지급은 입금 알림 매칭으로만 이뤄지며, 이 기록은 표시용)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const staff = await requireStaffAuth("DIRECTOR");
    const { id } = await params;

    const order = await prisma.creditTopUp.findFirst({
      where: {
        id,
        academyId: staff.academyId,
        paymentMethod: BANK_TRANSFER_PAY_METHOD,
      },
      select: { id: true, status: true, customData: true },
    });
    if (!order) {
      return NextResponse.json(
        { error: "주문을 찾을 수 없습니다." },
        { status: 404 },
      );
    }
    if (order.status !== "WAITING_FOR_DEPOSIT") {
      return NextResponse.json({
        status: order.status,
        confirmStartedAt: readConfirmStartedAt(order.customData),
      });
    }

    const existing = readConfirmStartedAt(order.customData);
    if (existing) {
      return NextResponse.json({ confirmStartedAt: existing });
    }

    const confirmStartedAt = new Date().toISOString();
    const base =
      order.customData &&
      typeof order.customData === "object" &&
      !Array.isArray(order.customData)
        ? (order.customData as Record<string, unknown>)
        : {};
    await prisma.creditTopUp.update({
      where: { id: order.id },
      data: { customData: { ...base, confirmStartedAt } },
    });

    return NextResponse.json({ confirmStartedAt });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }
    if (err instanceof Error && err.message === "Forbidden") {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }
    console.error("[bank-deposit/mark-paid] failed", err);
    return NextResponse.json({ error: "처리에 실패했습니다." }, { status: 500 });
  }
}

function readConfirmStartedAt(customData: unknown): string | null {
  if (
    customData &&
    typeof customData === "object" &&
    !Array.isArray(customData)
  ) {
    const v = (customData as Record<string, unknown>).confirmStartedAt;
    if (typeof v === "string") return v;
  }
  return null;
}
