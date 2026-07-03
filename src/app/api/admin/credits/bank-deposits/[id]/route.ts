import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth-admin";
import { grantBankDepositTopUp } from "@/lib/bank-deposit";

const bodySchema = z.union([
  z.object({ action: z.literal("match"), topUpId: z.string().min(1) }),
  z.object({ action: z.literal("ignore") }),
]);

/**
 * Admin actions on a bank deposit notification (SUPER_ADMIN):
 *  - match:  attach to a pending bank-transfer order and grant credits
 *  - ignore: mark as IGNORED (e.g. not a real top-up deposit)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let admin: Awaited<ReturnType<typeof requireAdminAuth>>;
  try {
    admin = await requireAdminAuth("SUPER_ADMIN");
  } catch {
    return NextResponse.json(
      { error: "입금 수동 처리는 슈퍼관리자 권한이 필요합니다." },
      { status: 403 },
    );
  }

  const { id } = await params;
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const notification = await prisma.bankDepositNotification.findUnique({
    where: { id },
    select: { id: true, amount: true, depositorName: true, externalId: true, status: true },
  });
  if (!notification) {
    return NextResponse.json({ error: "입금 내역을 찾을 수 없습니다." }, { status: 404 });
  }

  if (parsed.data.action === "ignore") {
    await prisma.bankDepositNotification.update({
      where: { id },
      data: {
        status: "IGNORED",
        note: `관리자(${admin.adminId})가 무시 처리함.`,
        processedAt: new Date(),
      },
    });
    return NextResponse.json({ status: "IGNORED" });
  }

  // action === "match"
  const topUpId = parsed.data.topUpId;
  const order = await prisma.creditTopUp.findUnique({
    where: { id: topUpId },
    select: { id: true, status: true, paymentMethod: true },
  });
  if (!order || order.paymentMethod !== "BANK_TRANSFER") {
    return NextResponse.json(
      { error: "유효한 무통장입금 주문이 아닙니다." },
      { status: 400 },
    );
  }
  if (order.status !== "WAITING_FOR_DEPOSIT") {
    return NextResponse.json(
      { error: `이미 처리된 주문입니다. (상태: ${order.status})` },
      { status: 409 },
    );
  }

  const grant = await grantBankDepositTopUp(topUpId, {
    amount: notification.amount,
    depositorName: notification.depositorName,
    externalId: notification.externalId,
  });

  await prisma.bankDepositNotification.update({
    where: { id },
    data: {
      status: "MATCHED",
      matchedTopUpId: topUpId,
      note: `관리자(${admin.adminId}) 수동 매칭.`,
      processedAt: new Date(),
    },
  });

  return NextResponse.json({
    status: "MATCHED",
    topUpId,
    credited: grant.credited,
    balanceAfter: grant.balanceAfter,
  });
}
