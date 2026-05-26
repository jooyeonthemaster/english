import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminAuth } from "@/lib/auth-admin";
import { getAdminCreditTopUpDetail } from "@/lib/admin-credit-topups";
import {
  cancelPortOneCreditTopUp,
  PortOneTopUpError,
} from "@/lib/portone-credit-topups";

interface RouteContext {
  params: Promise<{ topUpId: string }>;
}

const refundAccountSchema = z.object({
  bank: z.string().trim().min(1),
  number: z.string().trim().min(3),
  holderName: z.string().trim().min(1),
  holderPhoneNumber: z.string().trim().optional(),
});

const cancelSchema = z.object({
  reason: z.string().trim().min(2).max(200),
  refundAccount: refundAccountSchema.optional(),
});

export async function POST(request: NextRequest, ctx: RouteContext) {
  let admin: Awaited<ReturnType<typeof requireAdminAuth>>;
  try {
    admin = await requireAdminAuth("SUPER_ADMIN");
  } catch {
    return NextResponse.json(
      { error: "환불 처리는 슈퍼관리자 권한이 필요합니다." },
      { status: 403 },
    );
  }
  const { topUpId } = await ctx.params;
  const body = await request.json().catch(() => null);
  const parsed = cancelSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "환불 사유와 환불 계좌 정보를 확인해주세요." },
      { status: 400 },
    );
  }

  try {
    const result = await cancelPortOneCreditTopUp({
      topUpId,
      reason: parsed.data.reason,
      adminId: admin.adminId,
      refundAccount: parsed.data.refundAccount,
    });
    const topUp = await getAdminCreditTopUpDetail(topUpId);
    return NextResponse.json({ result, topUp });
  } catch (err) {
    if (err instanceof PortOneTopUpError) {
      return NextResponse.json(
        { error: getCancelErrorMessage(err), code: err.code },
        { status: getCancelErrorStatus(err) },
      );
    }
    console.error("[admin/credits/top-ups/cancel] failed", err);
    return NextResponse.json(
      { error: "포트원 결제 취소 요청에 실패했습니다." },
      { status: 502 },
    );
  }
}

function getCancelErrorStatus(err: PortOneTopUpError) {
  if (err.code === "TOP_UP_NOT_FOUND") return 404;
  if (err.code === "PAYMENT_MISMATCH") return 409;
  return 400;
}

function getCancelErrorMessage(err: PortOneTopUpError) {
  if (err.code === "INSUFFICIENT_CREDITS_FOR_REFUND") {
    return "이미 사용된 크레딧이 있어 자동 환불할 수 없습니다. 잔고를 보정한 뒤 다시 시도해주세요.";
  }
  if (err.code === "PAYMENT_MISMATCH") {
    return "포트원 결제 정보가 내부 충전 주문과 일치하지 않아 취소를 중단했습니다.";
  }
  if (err.code === "PAYMENT_NOT_CANCELLABLE") {
    return err.message;
  }
  return "결제 취소 요청을 처리할 수 없습니다.";
}
