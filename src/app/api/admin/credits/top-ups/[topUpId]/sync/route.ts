import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth-admin";
import { getAdminCreditTopUpDetail } from "@/lib/admin-credit-topups";
import {
  completePortOneCreditTopUp,
  PortOneTopUpError,
} from "@/lib/portone-credit-topups";

interface RouteContext {
  params: Promise<{ topUpId: string }>;
}

export async function POST(_request: NextRequest, ctx: RouteContext) {
  await requireAdminAuth();
  const { topUpId } = await ctx.params;
  const topUp = await getAdminCreditTopUpDetail(topUpId);
  if (!topUp) {
    return NextResponse.json(
      { error: "충전 내역을 찾을 수 없습니다." },
      { status: 404 },
    );
  }
  if (!topUp.paymentId) {
    return NextResponse.json(
      { error: "포트원 결제 ID가 없어 재조회할 수 없습니다." },
      { status: 400 },
    );
  }

  try {
    const result = await completePortOneCreditTopUp({
      paymentId: topUp.paymentId,
      source: "admin_retry",
    });
    const refreshed = await getAdminCreditTopUpDetail(topUpId);
    return NextResponse.json({ result, topUp: refreshed });
  } catch (err) {
    if (err instanceof PortOneTopUpError) {
      return NextResponse.json(
        { error: getAdminTopUpErrorMessage(err) },
        { status: err.code === "PAYMENT_MISMATCH" ? 409 : 400 },
      );
    }
    console.error("[admin/credits/top-ups/sync] failed", err);
    return NextResponse.json(
      { error: "포트원 결제 상태 재조회에 실패했습니다." },
      { status: 502 },
    );
  }
}

function getAdminTopUpErrorMessage(err: PortOneTopUpError) {
  if (err.code === "PAYMENT_MISMATCH") {
    return "포트원 결제 정보가 내부 충전 주문과 일치하지 않습니다. 금액/상점/주문 ID를 확인해주세요.";
  }
  if (err.code === "PAYMENT_UNRECOGNIZED") {
    return "포트원 결제 상태를 해석할 수 없습니다. 관리자 콘솔에서 결제 내역을 확인해주세요.";
  }
  return err.message;
}
