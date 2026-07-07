import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth-admin";
import { grantBankDepositTopUp } from "@/lib/bank-deposit";

const bodySchema = z.union([
  z.object({ action: z.literal("match"), topUpId: z.string().min(1) }),
  z.object({ action: z.literal("ignore") }),
  z.object({ action: z.literal("manual_grant") }),
]);

/**
 * Admin actions on a bank deposit notification (SUPER_ADMIN):
 *  - match:        attach to a pending bank-transfer order and grant credits
 *  - ignore:       mark as IGNORED (e.g. not a real top-up deposit)
 *  - manual_grant: mark as MANUAL_GRANT — a real deposit whose credits were
 *                  already granted by hand (outside the auto-match flow). Only
 *                  records the status; it does NOT credit again (no double-grant).
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

  if (parsed.data.action === "manual_grant") {
    // 시스템 외에서 이미 수동으로 크레딧을 지급한 실입금 → 상태만 '수동지급'으로
    // 기록한다. 자동 지급(MATCHED)된 건은 이중지급 오인을 막기 위해 전환 불가.
    if (notification.status === "MATCHED") {
      return NextResponse.json(
        { error: "이미 자동 지급된 입금입니다. 수동지급으로 변경할 수 없습니다." },
        { status: 409 },
      );
    }
    await prisma.bankDepositNotification.update({
      where: { id },
      data: {
        status: "MANUAL_GRANT",
        note: `관리자(${admin.adminId}) 수동지급 처리 — 시스템 외 수동 지급 완료로 기록.`,
        processedAt: new Date(),
      },
    });
    return NextResponse.json({ status: "MANUAL_GRANT" });
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
