import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth-admin";
import { getAdminCreditTopUpDetail } from "@/lib/admin-credit-topups";
import {
  closePortOneVirtualAccountTopUp,
  PortOneTopUpError,
} from "@/lib/portone-credit-topups";

interface RouteContext {
  params: Promise<{ topUpId: string }>;
}

export async function POST(_request: NextRequest, ctx: RouteContext) {
  let admin: Awaited<ReturnType<typeof requireAdminAuth>>;
  try {
    admin = await requireAdminAuth("SUPER_ADMIN");
  } catch {
    return NextResponse.json(
      { error: "가상계좌 말소는 슈퍼관리자 권한이 필요합니다." },
      { status: 403 },
    );
  }

  const { topUpId } = await ctx.params;

  try {
    const result = await closePortOneVirtualAccountTopUp({
      topUpId,
      adminId: admin.adminId,
    });
    const topUp = await getAdminCreditTopUpDetail(topUpId);
    return NextResponse.json({ result, topUp });
  } catch (err) {
    if (err instanceof PortOneTopUpError) {
      return NextResponse.json(
        { error: getCloseErrorMessage(err), code: err.code },
        { status: err.code === "TOP_UP_NOT_FOUND" ? 404 : 400 },
      );
    }
    console.error("[admin/credits/top-ups/close-virtual-account] failed", err);
    return NextResponse.json(
      { error: "가상계좌 말소 요청에 실패했습니다." },
      { status: 502 },
    );
  }
}

function getCloseErrorMessage(err: PortOneTopUpError) {
  if (err.code === "PAYMENT_MISMATCH") {
    return "포트원 결제 정보가 내부 충전 주문과 일치하지 않아 가상계좌 말소를 중단했습니다.";
  }
  if (err.code === "PAYMENT_NOT_CANCELLABLE") {
    return err.message;
  }
  return "가상계좌 말소 요청을 처리할 수 없습니다.";
}
